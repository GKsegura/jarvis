import { FACE_IDLE_EVERY_MS } from './budget';
import type { ExpressionScores } from './mood';

// Manter igual à versão de @vladmandic/face-api no package.json
const FACE_API_VERSION = '1.7.15';
const MODEL_URL = `https://cdn.jsdelivr.net/npm/@vladmandic/face-api@${FACE_API_VERSION}/model/`;

export type FaceState = 'loading' | 'unavailable' | 'unenrolled' | 'identifying' | 'verified' | 'unknown' | 'enrolling';

export const FACE_STATE_LABEL: Record<FaceState, string> = {
  loading: 'CARREGANDO',
  unavailable: 'INDISPONÍVEL',
  unenrolled: 'SEM CADASTRO',
  identifying: 'IDENTIFICANDO…',
  verified: 'CONFIRMADA',
  unknown: 'DESCONHECIDO',
  enrolling: 'CADASTRANDO',
};

/** Rosto no vídeo, em coordenadas normalizadas (0..1) da imagem da câmera, sem espelhar. */
export interface FaceBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const ENROLL_SAMPLES = 6;
const ENROLL_TIMEOUT_MS = 20_000;
/** Acertos seguidos para considerar o rosto verificado. */
const HITS_TO_VERIFY = 2;
/** Erros seguidos para declarar o rosto desconhecido. */
const MISSES_TO_UNKNOWN = 3;
/** Com o rosto confirmado, procura rostos a cada 2,5 s (presença e visitantes)... */
const VERIFIED_EVERY_MS = 2500;

/** ...mas só reconfirma com o servidor (e renova o token) a cada 10 s. */
const REVERIFY_EVERY_MS = 10_000;
/** Lendo a expressão enquanto o senhor fala. */
const CLOSE_EVERY_MS = 500;

type FaceApi = typeof import('@vladmandic/face-api');

/**
 * Reconhecimento facial do dono. O navegador só calcula o descritor do rosto (128 números);
 * quem compara com o perfil cadastrado e emite o token de acesso é o servidor local.
 */
export class FaceGuard {
  state: FaceState = 'loading';
  box: FaceBox | null = null;
  token: string | null = null;
  /** Amostras já capturadas no cadastro em andamento. */
  enrollProgress = 0;
  /** Quantos rostos aparecem na câmera agora (2 ou mais = tem visita). */
  faceCount = 0;
  /** Última vez (performance.now) que algum rosto apareceu na câmera. */
  lastSeenAt = performance.now();
  readonly enrollTotal = ENROLL_SAMPLES;
  onChange: (state: FaceState, previous: FaceState) => void = () => {};
  /** Os 68 pontos do rosto principal na última leitura, normalizados (0..1) na imagem da câmera. */
  landmarks: Array<{ x: number; y: number }> = [];
  landmarksAt = -Infinity;
  /** Distância do último rosto comparado ao perfil (menor = mais parecido; o limite é 0,5). */
  lastDistance: number | null = null;
  /** Quando o rosto foi confirmado (performance.now), para a animação de "identidade confirmada". */
  confirmedAt = -Infinity;
  /** Expressão do rosto principal a cada leitura (feliz, triste...), para o humor. */
  onExpression: (scores: ExpressionScores) => void = () => {};

  private api: FaceApi | null = null;
  /** O modelo de expressões é opcional: se não carregar, o resto do reconhecimento continua. */
  private expressionsReady = false;
  /** Até quando ler o rosto com mais frequência (o senhor está falando com o JARVIS). */
  private closelyUntil = 0;
  /** Em espera ou ausente: só confere o rosto de vez em quando, para poupar CPU/GPU. */
  idle = false;
  private tokenExpires = 0;
  private busy = false;
  private nextAt = 0;
  private hits = 0;
  private misses = 0;
  private verifiedAt = 0;
  private enrollment: {
    samples: number[][];
    deadline: number;
    resolve: () => void;
    reject: (e: Error) => void;
    previous: FaceState;
  } | null = null;

  async init(): Promise<void> {
    try {
      const api = await import('@vladmandic/face-api');
      await Promise.all([
        api.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        api.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        api.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      this.api = api;
      void api.nets.faceExpressionNet
        .loadFromUri(MODEL_URL)
        .then(() => (this.expressionsReady = true))
        .catch((e) => console.warn('[rosto] sem modelo de expressões:', e));
      const status = (await fetch('/api/face/status').then((r) => r.json())) as { enrolled?: boolean };
      this.set(status.enrolled ? 'identifying' : 'unenrolled');
    } catch (e) {
      console.warn('[rosto]', e);
      this.set('unavailable');
    }
  }

  /** Há quanto tempo (ms) nenhum rosto aparece na câmera. */
  absentFor(now = performance.now()): number {
    return now - this.lastSeenAt;
  }

  /** Lê o rosto a cada ~0,5 s pelos próximos `ms` (enquanto o senhor fala, para pegar a expressão). */
  watchClosely(ms: number): void {
    const until = performance.now() + ms;
    if (until > this.closelyUntil) this.closelyUntil = until;
    this.nextAt = Math.min(this.nextAt, performance.now() + CLOSE_EVERY_MS);
  }

  /** Sem câmera não há como reconhecer ninguém. */
  disable(): void {
    this.set('unavailable');
  }

  /** Rosto do dono verificado e token ainda válido. */
  get verified(): boolean {
    return this.state === 'verified' && Date.now() < this.tokenExpires;
  }

  /** Cabeçalho que libera as rotas protegidas do servidor. */
  headers(): Record<string, string> {
    return this.token ? { 'X-Jarvis-Token': this.token } : {};
  }

  /** Chamado a cada frame; roda a detecção de rosto em baixa frequência. */
  tick(video: HTMLVideoElement, now: number): void {
    if (this.state === 'verified' && Date.now() >= this.tokenExpires) {
      // Ficou tempo demais sem ver o dono: volta a bloquear
      this.token = null;
      this.hits = 0;
      this.set('identifying');
    }
    // Sem cadastro também procura rostos: a presença e o aviso de visita funcionam para qualquer um
    const active = this.enrollment || ['identifying', 'verified', 'unknown', 'unenrolled'].includes(this.state);
    if (!this.api || !active || this.busy || now < this.nextAt || video.readyState < 2) return;
    this.busy = true;
    void this.step(video)
      .catch((e) => console.warn('[rosto]', e))
      .finally(() => {
        this.busy = false;
        // Verificado, só confere de vez em quando (renova o token); senão, procura com frequência.
        // Enquanto o senhor fala com o JARVIS, lê mais rápido para acompanhar a expressão
        const calm = this.state === 'verified' || this.state === 'unenrolled' ? VERIFIED_EVERY_MS : 700;
        const lively = this.enrollment ? 450 : performance.now() < this.closelyUntil ? CLOSE_EVERY_MS : calm;
        const every = this.idle && !this.enrollment ? Math.max(lively, FACE_IDLE_EVERY_MS) : lively;
        this.nextAt = performance.now() + every;
      });
  }

  /** Cadastra o rosto: captura algumas amostras enquanto a pessoa vira o rosto devagar. */
  enroll(): Promise<void> {
    if (!this.api) return Promise.reject(new Error('Reconhecimento facial indisponível'));
    if (this.enrollment) return Promise.reject(new Error('Cadastro já em andamento'));
    return new Promise((resolve, reject) => {
      this.enrollment = { samples: [], deadline: Date.now() + ENROLL_TIMEOUT_MS, resolve, reject, previous: this.state };
      this.enrollProgress = 0;
      this.nextAt = 0;
      this.set('enrolling');
    });
  }

  async forget(): Promise<boolean> {
    const r = await fetch('/api/face/forget', { method: 'POST', headers: { 'Content-Type': 'application/json', ...this.headers() } });
    if (!r.ok) return false;
    this.token = null;
    this.set('unenrolled');
    return true;
  }

  /** Acha os rostos do frame; devolve o descritor do maior (o mais perto da câmera). */
  private async describe(video: HTMLVideoElement): Promise<number[] | null> {
    const api = this.api!;
    const task = api
      .detectAllFaces(video, new api.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptors();
    const results = this.expressionsReady && !this.enrollment ? await task.withFaceExpressions() : await task;
    this.faceCount = results.length;
    if (results.length === 0) {
      this.box = null;
      return null;
    }
    this.lastSeenAt = performance.now();
    const area = (r: (typeof results)[number]) => r.detection.box.width * r.detection.box.height;
    const result = results.reduce((a, b) => (area(b) > area(a) ? b : a));
    const b = result.detection.box;
    this.box = { x: b.x / video.videoWidth, y: b.y / video.videoHeight, w: b.width / video.videoWidth, h: b.height / video.videoHeight };
    // Os 68 pontos do rosto (para a animação de leitura facial na tela)
    this.landmarks = result.landmarks.positions.map((p) => ({ x: p.x / video.videoWidth, y: p.y / video.videoHeight }));
    this.landmarksAt = performance.now();
    if ('expressions' in result) {
      const e = result.expressions as ExpressionScores;
      this.onExpression({ neutral: e.neutral, happy: e.happy, sad: e.sad, angry: e.angry, fearful: e.fearful, disgusted: e.disgusted, surprised: e.surprised });
    }
    // 4 casas decimais bastam para comparar rostos e deixam o envio bem menor
    return Array.from(result.descriptor, (v) => Math.round(v * 1e4) / 1e4);
  }

  private async step(video: HTMLVideoElement): Promise<void> {
    const descriptor = await this.describe(video);
    if (this.enrollment) return this.enrollStep(descriptor);
    if (!descriptor || this.state === 'unenrolled') return;
    // Já confirmado: entre uma reconfirmação e outra, só acompanha a presença
    if (this.state === 'verified' && performance.now() - this.verifiedAt < REVERIFY_EVERY_MS) return;
    this.verifiedAt = performance.now();

    const r = await fetch('/api/face/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.headers() },
      body: JSON.stringify({ descriptor }),
    });
    if (r.status === 409) return this.set('unenrolled');
    if (!r.ok) return;
    const data = (await r.json()) as { match: boolean; distance?: number; token?: string; ttlMs: number };
    if (typeof data.distance === 'number') this.lastDistance = data.distance;
    if (data.match && data.token) {
      this.token = data.token;
      this.tokenExpires = Date.now() + data.ttlMs;
      this.misses = 0;
      if (++this.hits >= HITS_TO_VERIFY || this.state === 'verified') this.set('verified');
    } else if (this.state !== 'verified') {
      this.hits = 0;
      if (++this.misses >= MISSES_TO_UNKNOWN) this.set('unknown');
    }
  }

  private async enrollStep(descriptor: number[] | null): Promise<void> {
    const e = this.enrollment!;
    if (descriptor && e.samples.length < ENROLL_SAMPLES) e.samples.push(descriptor);
    this.enrollProgress = e.samples.length;
    if (e.samples.length < ENROLL_SAMPLES) {
      if (Date.now() > e.deadline) this.endEnroll(new Error('Não vi o rosto por tempo suficiente'));
      return;
    }
    // Qualquer falha no envio encerra o cadastro com erro (antes ele ficava capturando para sempre)
    let r: Response;
    let data: { token?: string; ttlMs?: number; message?: string };
    try {
      r = await fetch('/api/face/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.headers() },
        body: JSON.stringify({ descriptors: e.samples }),
      });
      data = (await r.json()) as typeof data;
    } catch (err) {
      return this.endEnroll(new Error(`Falha ao salvar o rosto: ${err instanceof Error ? err.message : err}`));
    }
    if (!r.ok || !data.token) return this.endEnroll(new Error(data.message ?? `HTTP ${r.status}`), r.status === 403);
    this.token = data.token;
    this.tokenExpires = Date.now() + (data.ttlMs ?? 0);
    this.hits = HITS_TO_VERIFY;
    this.endEnroll();
  }

  private endEnroll(error?: Error, denied = false): void {
    const e = this.enrollment!;
    this.enrollment = null;
    if (error) {
      this.set(e.previous);
      e.reject(Object.assign(error, { denied }));
    } else {
      this.set('verified');
      e.resolve();
    }
  }

  private set(state: FaceState): void {
    if (state === this.state) return;
    const previous = this.state;
    this.state = state;
    if (state === 'verified') this.confirmedAt = performance.now();
    this.onChange(state, previous);
  }
}
