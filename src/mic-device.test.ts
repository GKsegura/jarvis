import { describe, expect, it } from 'vitest';
import { findCameraMic, normalizeLabel } from './mic-device';

const mics = [
  { deviceId: 'default', label: 'Padrão - Microfone (HD Pro Webcam C920) (046d:082d)', groupId: 'g-webcam' },
  { deviceId: 'a1', label: 'Microfone (Realtek(R) Audio)', groupId: 'g-realtek' },
  { deviceId: 'a2', label: 'Microfone (HD Pro Webcam C920) (046d:082d)', groupId: 'g-webcam' },
];

describe('normalizeLabel', () => {
  it('tira prefixo, código USB e parênteses', () => {
    expect(normalizeLabel('Microfone (HD Pro Webcam C920) (046d:082d)')).toBe('hd pro webcam c920');
    expect(normalizeLabel('HD Pro Webcam C920 (046d:082d)')).toBe('hd pro webcam c920');
  });
});

describe('findCameraMic', () => {
  it('escolhe o microfone do mesmo aparelho, ignorando a entrada "Padrão"', () => {
    expect(findCameraMic({ label: 'HD Pro Webcam C920 (046d:082d)', groupId: 'g-webcam' }, mics)?.deviceId).toBe('a2');
  });

  it('usa o nome quando o groupId não bate', () => {
    expect(findCameraMic({ label: 'HD Pro Webcam C920 (046d:082d)', groupId: 'outro' }, mics)?.deviceId).toBe('a2');
  });

  it('devolve null se a webcam não tem microfone ou não há câmera', () => {
    expect(findCameraMic({ label: 'Integrated Camera', groupId: 'g-cam' }, mics)).toBeNull();
    expect(findCameraMic(null, mics)).toBeNull();
  });
});
