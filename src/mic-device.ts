export interface DeviceInfo {
  deviceId: string;
  label: string;
  groupId: string;
}

/** Entradas que o Windows cria como atalho para outro microfone, não aparelhos de verdade. */
const VIRTUAL = new Set(['default', 'communications']);

/** "Microfone (HD Pro Webcam C920) (046d:082d)" → "hd pro webcam c920" */
export function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/\([0-9a-f]{4}:[0-9a-f]{4}\)/g, '')
    .replace(/^(microfone|microphone|mic)\b/, '')
    .replace(/[()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Acha o microfone embutido na webcam: mesmo aparelho físico (groupId) ou, se não der, mesmo nome. */
export function findCameraMic(camera: { label: string; groupId: string } | null, mics: DeviceInfo[]): DeviceInfo | null {
  if (!camera) return null;
  const real = mics.filter((m) => !VIRTUAL.has(m.deviceId));
  const sameDevice = real.find((m) => m.groupId && m.groupId === camera.groupId);
  if (sameDevice) return sameDevice;
  const name = normalizeLabel(camera.label);
  if (name.length < 3) return null;
  return (
    real.find((m) => {
      const label = normalizeLabel(m.label);
      return label.length >= 3 && (label.includes(name) || name.includes(label));
    }) ?? null
  );
}

export interface OpenedMic {
  stream: MediaStream;
  fromCamera: boolean;
  /** Nomes de todos os microfones encontrados. */
  available: string[];
}

/** Abre o microfone da webcam que está em uso (ou o padrão, se a webcam não tiver microfone). */
export async function openCameraMic(video: MediaStream | null): Promise<OpenedMic> {
  let devices = await navigator.mediaDevices.enumerateDevices();
  // Sem permissão de microfone o navegador esconde os nomes; pede uma vez para poder comparar
  if (devices.some((d) => d.kind === 'audioinput' && !d.label)) {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
    probe.getTracks().forEach((t) => t.stop());
    devices = await navigator.mediaDevices.enumerateDevices();
  }

  const track = video?.getVideoTracks()[0];
  const settings = track?.getSettings();
  const camera = track
    ? {
        label: track.label,
        groupId: settings?.groupId ?? devices.find((d) => d.deviceId === settings?.deviceId)?.groupId ?? '',
      }
    : null;
  const mics = devices.filter((d) => d.kind === 'audioinput');
  const chosen = findCameraMic(camera, mics);

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: chosen ? { deviceId: { exact: chosen.deviceId } } : true,
  });
  return {
    stream,
    fromCamera: chosen !== null,
    available: mics.filter((m) => !VIRTUAL.has(m.deviceId)).map((m) => m.label),
  };
}
