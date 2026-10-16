export class CameraError extends Error {}

export async function startCamera(video: HTMLVideoElement): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('Este navegador não dá acesso à câmera. Use o Chrome ou o Edge em http://localhost.');
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
      audio: false,
    });
  } catch (e) {
    const name = e instanceof DOMException ? e.name : '';
    if (name === 'NotAllowedError') {
      throw new CameraError(
        'Acesso à câmera negado. Clique no ícone de câmera na barra de endereço, permita e tente de novo.',
      );
    }
    if (name === 'NotFoundError') throw new CameraError('Nenhuma câmera encontrada.');
    if (name === 'NotReadableError') {
      throw new CameraError('A câmera está em uso por outro programa (Teams, Discord, OBS...). Feche-o e tente de novo.');
    }
    throw new CameraError('Não consegui abrir a câmera.');
  }

  video.srcObject = stream;
  await video.play();
  if (!video.videoWidth) {
    await new Promise((resolve) => video.addEventListener('loadedmetadata', resolve, { once: true }));
  }
}
