import { FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';
import { WASM_URL } from './hands';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite';

/** As 80 classes do COCO (o que o EfficientDet-Lite0 reconhece), com artigo, do jeito que se fala. */
export const OBJECT_LABEL_PT: Record<string, string> = {
  person: 'uma pessoa', bicycle: 'uma bicicleta', car: 'um carro', motorcycle: 'uma moto', airplane: 'um avião',
  bus: 'um ônibus', train: 'um trem', truck: 'um caminhão', boat: 'um barco', 'traffic light': 'um semáforo',
  'fire hydrant': 'um hidrante', 'stop sign': 'uma placa de pare', 'parking meter': 'um parquímetro', bench: 'um banco',
  bird: 'um pássaro', cat: 'um gato', dog: 'um cachorro', horse: 'um cavalo', sheep: 'uma ovelha', cow: 'uma vaca',
  elephant: 'um elefante', bear: 'um urso', zebra: 'uma zebra', giraffe: 'uma girafa', backpack: 'uma mochila',
  umbrella: 'um guarda-chuva', handbag: 'uma bolsa', tie: 'uma gravata', suitcase: 'uma mala', frisbee: 'um frisbee',
  skis: 'um par de esquis', snowboard: 'um snowboard', 'sports ball': 'uma bola', kite: 'uma pipa',
  'baseball bat': 'um taco de beisebol', 'baseball glove': 'uma luva de beisebol', skateboard: 'um skate',
  surfboard: 'uma prancha de surfe', 'tennis racket': 'uma raquete de tênis', bottle: 'uma garrafa',
  'wine glass': 'uma taça', cup: 'uma caneca', fork: 'um garfo', knife: 'uma faca', spoon: 'uma colher', bowl: 'uma tigela',
  banana: 'uma banana', apple: 'uma maçã', sandwich: 'um sanduíche', orange: 'uma laranja', broccoli: 'um brócolis',
  carrot: 'uma cenoura', 'hot dog': 'um cachorro-quente', pizza: 'uma pizza', donut: 'uma rosquinha', cake: 'um bolo',
  chair: 'uma cadeira', couch: 'um sofá', 'potted plant': 'um vaso de planta', bed: 'uma cama', 'dining table': 'uma mesa',
  toilet: 'um vaso sanitário', tv: 'uma televisão', laptop: 'um notebook', mouse: 'um mouse', remote: 'um controle remoto',
  keyboard: 'um teclado', 'cell phone': 'um celular', microwave: 'um micro-ondas', oven: 'um forno', toaster: 'uma torradeira',
  sink: 'uma pia', refrigerator: 'uma geladeira', book: 'um livro', clock: 'um relógio', vase: 'um vaso',
  scissors: 'uma tesoura', 'teddy bear': 'um ursinho de pelúcia', 'hair drier': 'um secador de cabelo', toothbrush: 'uma escova de dentes',
};

export const objectLabel = (label: string) => OBJECT_LABEL_PT[label] ?? label;

/** Objeto visto, com o retângulo em coordenadas normalizadas (0..1) da imagem da câmera, sem espelhar. */
export interface SeenObject {
  label: string;
  /** Nome em português, com artigo ("uma garrafa"). */
  name: string;
  score: number;
  box: { x: number; y: number; w: number; h: number };
}

const FRAMES = 6;
const FRAME_GAP_MS = 120;

/**
 * Junta as detecções de vários frames: fica a melhor de cada classe. Objetos que aparecem em poucos
 * frames perdem força (evita falso positivo de um frame só).
 */
export function mergeDetections(frames: SeenObject[][]): SeenObject[] {
  const byLabel = new Map<string, { best: SeenObject; hits: number }>();
  for (const frame of frames) {
    for (const o of frame) {
      const entry = byLabel.get(o.label);
      if (!entry) byLabel.set(o.label, { best: o, hits: 1 });
      else {
        entry.hits++;
        if (o.score > entry.best.score) entry.best = o;
      }
    }
  }
  return [...byLabel.values()]
    .map(({ best, hits }) => ({ ...best, score: best.score * Math.min(1, hits / Math.max(2, frames.length / 2)) }))
    .sort((a, b) => b.score - a.score);
}

/** Escolhe o objeto que o senhor está mostrando: perto da mão, se houver, e de preferência não uma pessoa. */
export function pickShown(objects: SeenObject[], hand: { x: number; y: number } | null): SeenObject | null {
  const things = objects.filter((o) => o.label !== 'person');
  const pool = things.length ? things : objects;
  if (!pool.length) return null;
  if (!hand) return pool[0];
  const distance = (o: SeenObject) => Math.hypot(o.box.x + o.box.w / 2 - hand.x, o.box.y + o.box.h / 2 - hand.y);
  // Pontuação: confiança, descontada pela distância até a mão
  return [...pool].sort((a, b) => b.score - distance(b) * 0.8 - (a.score - distance(a) * 0.8))[0];
}

/** Reconhecimento de objetos na câmera ("Jarvis, o que é isso?"). O modelo só é baixado no primeiro pedido. */
export class ObjectSpotter {
  private detector: Promise<ObjectDetector> | null = null;
  /** Último resultado, para desenhar na tela por alguns segundos e para o contexto do Claude. */
  last: { objects: SeenObject[]; shown: SeenObject | null; at: number } | null = null;

  private load(): Promise<ObjectDetector> {
    this.detector ??= (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      const options = (delegate: 'GPU' | 'CPU') => ({
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'IMAGE' as const,
        scoreThreshold: 0.3,
        maxResults: 6,
      });
      try {
        return await ObjectDetector.createFromOptions(vision, options('GPU'));
      } catch {
        return ObjectDetector.createFromOptions(vision, options('CPU'));
      }
    })();
    this.detector.catch(() => (this.detector = null));
    return this.detector;
  }

  /** Olha alguns frames seguidos. `hand` = centro da mão em coordenadas normalizadas do vídeo. */
  async look(video: HTMLVideoElement, hand: () => { x: number; y: number } | null): Promise<{ objects: SeenObject[]; shown: SeenObject | null }> {
    const detector = await this.load();
    const frames: SeenObject[][] = [];
    for (let i = 0; i < FRAMES; i++) {
      if (video.readyState >= 2 && video.videoWidth) {
        const result = detector.detect(video);
        frames.push(
          result.detections.flatMap((d) => {
            const c = d.categories[0];
            const b = d.boundingBox;
            if (!c || !b) return [];
            return [{
              label: c.categoryName,
              name: objectLabel(c.categoryName),
              score: c.score,
              box: { x: b.originX / video.videoWidth, y: b.originY / video.videoHeight, w: b.width / video.videoWidth, h: b.height / video.videoHeight },
            }];
          }),
        );
      }
      await new Promise((r) => setTimeout(r, FRAME_GAP_MS));
    }
    const objects = mergeDetections(frames);
    const shown = pickShown(objects, hand());
    this.last = { objects, shown, at: performance.now() };
    return { objects, shown };
  }
}
