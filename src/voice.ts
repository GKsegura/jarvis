import type { VoiceStyle } from './lines';

export type Command =
  | 'status'
  | 'projects'
  | 'time'
  | 'date'
  | 'weather'
  | 'reminders'
  | 'cancelTimer'
  | 'look'
  | 'mood'
  | 'takeScreens'
  | 'mouseOn'
  | 'mouseOff'
  | 'speakAgain'
  | 'daySummary'
  | 'uiBigger'
  | 'uiSmaller'
  | 'gestures'
  | 'standby'
  | 'releaseScreens'
  | 'who'
  | 'study'
  | 'hello'
  | 'mute'
  | 'voiceUk'
  | 'voiceBr'
  | 'claudeOn'
  | 'claudeOff'
  | 'enrollFace'
  | 'forgetFace';

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

// A ordem importa: "quanto tempo falta no timer" é dos lembretes, não do clima,
// e "me lembra de estudar" nunca chega aqui (vira lembrete antes)
const RULES: Array<[RegExp, Command]> = [
  [/^(pode falar|fala de novo|volta a falar|pode voltar a falar|ativa a voz|liga a voz)[?.!]*$/, 'speakAgain'],
  [/(deslig|desativ|sai|fech|par[ae])\w* (do |o )?(modo )?mouse/, 'mouseOff'],
  [/\bmouse no ar\b|\bmodo mouse\b|(liga|ativa)\w* o mouse/, 'mouseOn'],
  [/resumo do (meu )?dia|como (esta|ta|vai) (o )?meu dia|o que (eu )?tenho (pra|para) hoje/, 'daySummary'],
  [/(aument|ampli|maior)\w* (a |o )?(interface|hud|letra)/, 'uiBigger'],
  [/(diminu|reduz|menor)\w* (a |o )?(interface|hud|letra)/, 'uiSmaller'],
  [/\b(quais|que) gestos\b|gestos (que )?(voce )?(conhece|aprendeu|sabe)|lista (de |dos )?gestos/, 'gestures'],
  [/\bmodo (espera|soneca|descanso)\b|\bvai dormir\b|\bpode descansar\b/, 'standby'],
  [/(cadastr|registr|aprend|salv)\w* (o )?(meu )?rosto/, 'enrollFace'],
  [/(apag|esquec|delet|remov)\w* (o )?(meu )?rosto/, 'forgetFace'],
  [/o que (e|eh) (isso|isto|esse|essa|este|esta)|o que (eu )?(estou|to|tou) segurando|o que (voce )?(esta|ta) vendo|identifi\w* (isso|esse|essa|o objeto)|que objeto/, 'look'],
  [/^(como (eu )?(estou|to|tou)( hoje| agora)?|(qual|como) (e|eh|esta|ta) (o )?meu humor|como (esta|ta) (a )?minha cara|que cara (eu )?(estou|to) fazendo|(eu )?(pareco|estou|to) (feliz|triste|bravo|cansado|irritado|bem))[?.!]*$/, 'mood'],
  [/\b(assum\w*|tom[ae]\w*|ocup\w*|domin\w*|us[ae]r?) (as |todas as )?(outras )?telas\b|\b(abr\w*|mostr\w*|coloc\w*) (o )?painel (nas|na|no) (outr[ao]s? )?(telas?|monitor\w*)/, 'takeScreens'],
  [/\b(liber\w*|solt\w*|devolv\w*|fech\w*|sai\w*) (as |das |todas as )?(outras )?telas\b|\b(fech\w*|tir\w*) o painel (das|da|do) (outr[ao]s? )?(telas?|monitor\w*)/, 'releaseScreens'],
  [/(cancel|par[ae]|apag|deslig|tir[ae]|remov)\w* (o |os |a |as |meu |meus |esse |esses )?(timer|timers|alarme|alarmes|lembrete|lembretes|temporizador)/, 'cancelTimer'],
  [/\b(quais|meus|minhas|lista\w*|tenho)\b.*\b(lembretes?|timers?|alarmes?|compromissos?)\b|quanto (tempo )?falta/, 'reminders'],
  [/\bque horas\b|\bhoras sao\b|\bhora e agora\b/, 'time'],
  [/que (dia|data) (da semana )?(e|eh) hoje|\bdia de hoje\b/, 'date'],
  [/\b(clima|previsao|chov\w*|chuv\w*|temperatura|guarda.chuva)\b|como (esta|ta) o tempo|vai fazer (frio|calor)|esta (frio|calor)/, 'weather'],
  [/projetos? (que )?(estao |esta |ta |tao )?(rodando|no ar|ligados?)|o que (esta|ta) (rodando|no ar)/, 'projects'],
  [/status|relatorio|diagnost|como (esta|ta) (o )?(meu )?(pc|computador|sistema|maquina)|uso (da|de) (cpu|memoria)/, 'status'],
  [/deveria|estud/, 'study'],
  [/quem (e|eh) voce|se apresent/, 'who'],
  [/silenc|cala a boca|fica quieto/, 'mute'],
  [/ingles|britanic|voz do filme|voz original/, 'voiceUk'],
  [/portugues|brasileir|dublad/, 'voiceBr'],
  [/\b(oi|ola|bom dia|boa tarde|boa noite)\b/, 'hello'],
];

/** Nome do comando como aparece no terminal de voz. */
export const COMMAND_LABEL: Record<Command, string> = {
  status: 'ESTADO DO PC',
  projects: 'PROJETOS NO AR',
  time: 'HORAS',
  date: 'DATA',
  weather: 'CLIMA',
  reminders: 'LEMBRETES',
  cancelTimer: 'CANCELAR TIMER',
  look: 'O QUE É ISSO',
  mood: 'MEU HUMOR',
  takeScreens: 'ASSUMIR AS TELAS',
  mouseOn: 'MOUSE NO AR',
  mouseOff: 'DESLIGAR MOUSE NO AR',
  speakAgain: 'VOLTAR A FALAR',
  daySummary: 'RESUMO DO DIA',
  uiBigger: 'AMPLIAR INTERFACE',
  uiSmaller: 'REDUZIR INTERFACE',
  gestures: 'LISTA DE GESTOS',
  standby: 'MODO ESPERA',
  releaseScreens: 'LIBERAR AS TELAS',
  who: 'QUEM É VOCÊ',
  study: 'O QUE EU DEVERIA FAZER',
  hello: 'CUMPRIMENTO',
  mute: 'SILÊNCIO',
  voiceUk: 'VOZ DO FILME',
  voiceBr: 'VOZ EM PORTUGUÊS',
  claudeOn: 'LIGAR CLAUDE',
  claudeOff: 'DESLIGAR CLAUDE',
  enrollFace: 'CADASTRAR ROSTO',
  forgetFace: 'APAGAR ROSTO',
};

// O reconhecimento de voz costuma escrever "Claude" de vários jeitos
const CLAUDE_WORD = /\b(claud\w*|cloud|clod\w*|inteligencia artificial)\b/;

function claudeCommand(t: string): Command | null {
  if (!CLAUDE_WORD.test(t)) return null;
  if (/desbloque/.test(t)) return 'claudeOn';
  if (/deslig|desativ|desabilit|desconect|bloque|trav/.test(t)) return 'claudeOff';
  if (/lig|ativ|habilit|conect|liber/.test(t)) return 'claudeOn';
  return null;
}

/** "Aprende este gesto para abrir o Spotify" → "abrir o Spotify" (a frase que o gesto vai executar). */
export function parseLearnGesture(text: string): string | null {
  const m = text.trim().match(/^(?:(?:ei|ok)[\s,]+)?(?:jarvis[\s,]+)?(?:aprend\w*|grav\w*|ensin\w*|memoriz\w*)\s+(?:(?:este|esse|um|o|meu)\s+)?(?:novo\s+)?gesto\s+(?:novo\s+)?(?:para|pra|que|de|como)\s+(.+?)[.!?]*$/i);
  return m ? m[1].trim() : null;
}

/** "Esquece o gesto do Spotify" → "spotify"; "esquece todos os gestos" → "*". */
export function parseForgetGesture(text: string): string | null {
  const t = normalize(text).replace(/[.!?]+$/, '').trim();
  if (/^(esquec|apag|remov|delet)\w* (todos )?(os )?gestos$/.test(t)) return '*';
  const m = t.match(/^(?:esquec|apag|remov|delet)\w* (?:o |aquele |esse )?gesto (?:d[oae]s? |para |pra |que |de )?(.+)$/);
  return m ? m[1].trim() : null;
}

export function parseCommand(text: string): Command | null {
  const t = normalize(text);
  return claudeCommand(t) ?? RULES.find(([re]) => re.test(t))?.[1] ?? null;
}

export const pick = <T>(options: readonly T[]): T => options[Math.floor(Math.random() * options.length)];

const VOICE_HINTS: Record<VoiceStyle, { lang: string; male: string[]; rate: number; pitch: number }> = {
  uk: {
    lang: 'en-gb',
    male: ['ryan', 'thomas', 'george', 'oliver', 'arthur', 'daniel', 'alfie', 'elliot', 'uk english male'],
    rate: 0.97,
    pitch: 0.9,
  },
  br: {
    lang: 'pt-br',
    male: ['antonio', 'daniel', 'donato', 'fabio', 'humberto', 'julio', 'nicolau', 'valerio', 'ricardo'],
    rate: 1.05,
    pitch: 0.8,
  },
};

export function scoreVoice(v: Pick<SpeechSynthesisVoice, 'lang' | 'name'>, style: VoiceStyle): number {
  const hints = VOICE_HINTS[style];
  const lang = v.lang.toLowerCase().replace('_', '-');
  const name = v.name.toLowerCase();
  let score = lang === hints.lang ? 3 : lang.startsWith(hints.lang.slice(0, 2)) ? 1 : -100;
  if (hints.male.some((n) => name.includes(n))) score += 2;
  if (name.includes('natural') || name.includes('online')) score += 1;
  return score;
}

/** O JARVIS falando, com a síntese de voz do próprio navegador. */
export class JarvisVoice {
  enabled = true;
  style: VoiceStyle = 'br';
  readonly supported = 'speechSynthesis' in window;
  /** A voz clonada do fish.audio está configurada (chave no .env)? */
  fishReady = false;
  /** Chamado quando algo que aparece nos botões muda (ex.: o fish.audio ficou disponível). */
  onChange: () => void = () => {};
  /** Chamado a cada fala, para o terminal de voz. */
  onSay: (text: string) => void = () => {};
  private voices: Record<VoiceStyle, SpeechSynthesisVoice | null> = { uk: null, br: null };
  private quietUntil = 0;
  private caption = '';
  private captionUntil = 0;
  private audio: HTMLAudioElement | null = null;
  /** Falando agora (do início ao fim do som). */
  private speaking = false;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private levelData: Float32Array<ArrayBuffer> | null = null;
  private readonly audioUrls = new Map<string, Promise<string>>();
  /** Cada fala nova invalida as anteriores que ainda estão baixando. */
  private speechId = 0;
  /** Resolve quando já se sabe se o fish.audio está disponível. */
  readonly ready: Promise<void>;

  constructor() {
    if (this.supported) {
      const choose = () => {
        const all = speechSynthesis.getVoices();
        for (const style of ['uk', 'br'] as const) {
          const best = all
            .map((v) => [scoreVoice(v, style), v] as const)
            .filter(([s]) => s > 0)
            .sort((a, b) => b[0] - a[0])[0];
          this.voices[style] = best?.[1] ?? null;
        }
      };
      choose();
      speechSynthesis.addEventListener('voiceschanged', choose);
    }

    this.ready = fetch('/api/tts/status')
      .then((r) => (r.ok ? (r.json() as Promise<{ enabled?: boolean }>) : null))
      .then((status) => {
        if (!status?.enabled) return;
        this.fishReady = true;
        this.onChange();
      })
      .catch(() => {});
  }

  /** O som da fala está tocando agora? */
  get isSpeaking(): boolean {
    return this.speaking;
  }

  /** Falando com a voz do Jarvis dublado (fish.audio)? */
  get usesFish(): boolean {
    return this.fishReady && this.style === 'br';
  }

  get voiceName(): string {
    if (this.usesFish) return 'Jarvis dublado (fish.audio)';
    return this.voices[this.style]?.name ?? 'padrão do navegador';
  }

  setStyle(style: VoiceStyle): void {
    this.style = style;
    this.onChange();
  }

  /**
   * Verdadeiro enquanto o JARVIS fala (e logo depois), para o microfone não ouvir a própria voz.
   * Não usa `speechSynthesis.speaking`: no Chrome ele às vezes fica travado em `true`.
   */
  get busy(): boolean {
    return performance.now() < this.quietUntil;
  }

  captionAt(now: number): string {
    return now < this.captionUntil ? this.caption : '';
  }

  showCaption(text: string, ms = 3500): void {
    this.caption = text;
    this.captionUntil = performance.now() + ms;
  }

  /** Fala o texto. Resolve `true` se o som começou a tocar (false = bloqueado ou sem voz). */
  async say(text: string): Promise<boolean> {
    this.showCaption(text, 1500 + text.length * 70);
    this.onSay(text);
    if (!this.enabled) return false;
    const id = ++this.speechId;
    this.stopAll();
    if (this.usesFish) {
      this.quietUntil = performance.now() + 15000;
      try {
        return await this.playFish(text, id);
      } catch (e) {
        // Som bloqueado pelo navegador: a voz do navegador também seria bloqueada
        if (e instanceof DOMException && e.name === 'NotAllowedError') {
          this.quietUntil = 0;
          return false;
        }
        // Fish.audio falhou (sem créditos, sem internet...): cai para a voz do navegador
        if (id !== this.speechId) return false;
      }
    }
    return this.speakBrowser(text);
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    if (!value) {
      this.speechId++;
      this.stopAll();
      this.quietUntil = 0;
    }
  }

  private stopAll(): void {
    if (this.supported) speechSynthesis.cancel();
    this.audio?.pause();
    this.speaking = false;
  }

  /** Interrompe a fala na hora (palma aberta parada, por exemplo). */
  stop(): void {
    this.speechId++;
    this.stopAll();
    this.quietUntil = performance.now() + 300;
    this.captionUntil = 0;
  }

  /**
   * Volume da voz do JARVIS agora (0..1), para o núcleo na tela. A voz do fish.audio é medida de verdade;
   * a do navegador não dá para medir, então vira uma onda enquanto ele fala.
   */
  outputLevel(now: number): number {
    if (!this.speaking) return 0;
    if (this.analyser && this.levelData && this.usesFish) {
      this.analyser.getFloatTimeDomainData(this.levelData);
      let sum = 0;
      for (const v of this.levelData) sum += v * v;
      return Math.min(1, Math.sqrt(sum / this.levelData.length) * 5);
    }
    return 0.25 + 0.35 * Math.abs(Math.sin(now * 0.011) * Math.sin(now * 0.0047 + 1));
  }

  /**
   * Liga o áudio do fish.audio a um medidor de volume. Só liga se o AudioContext estiver rodando:
   * um contexto suspenso deixaria o JARVIS mudo.
   */
  private async meter(audio: HTMLAudioElement): Promise<void> {
    if (this.analyser || typeof AudioContext === 'undefined') return;
    try {
      this.audioContext ??= new AudioContext();
      if (this.audioContext.state !== 'running') await this.audioContext.resume().catch(() => {});
      if (this.audioContext.state !== 'running') return;
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 512;
      this.audioContext.createMediaElementSource(audio).connect(analyser);
      analyser.connect(this.audioContext.destination);
      this.analyser = analyser;
      this.levelData = new Float32Array(analyser.fftSize);
    } catch {
      /* sem medidor: o núcleo usa a onda simulada */
    }
  }

  private async playFish(text: string, id: number): Promise<boolean> {
    const url = await this.fishUrl(text);
    if (id !== this.speechId) return false;
    const audio = (this.audio ??= new Audio());
    await this.meter(audio);
    audio.src = url;
    audio.onplay = () => (this.speaking = true);
    audio.onended = () => {
      this.speaking = false;
      this.quietUntil = performance.now() + 500;
    };
    await audio.play();
    return true;
  }

  private fishUrl(text: string): Promise<string> {
    let url = this.audioUrls.get(text);
    if (!url) {
      url = this.loadFish(text);
      this.audioUrls.set(text, url);
      url.catch(() => this.audioUrls.delete(text));
    }
    return url;
  }

  /** Busca o áudio no cache do navegador; só pede ao fish.audio (e gasta crédito) se for frase nova. */
  private async loadFish(text: string): Promise<string> {
    const key = new Request(`/api/tts/cache?text=${encodeURIComponent(text)}`);
    const cache = 'caches' in window ? await caches.open('jarvis-voice-v1').catch(() => undefined) : undefined;
    let response = await cache?.match(key);
    if (!response) {
      response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw new Error(`TTS ${response.status}`);
      await cache?.put(key, response.clone()).catch(() => {});
    }
    return URL.createObjectURL(await response.blob());
  }

  private speakBrowser(text: string): Promise<boolean> {
    if (!this.supported) return Promise.resolve(false);
    const hints = VOICE_HINTS[this.style];
    const u = new SpeechSynthesisUtterance(text);
    u.lang = this.style === 'uk' ? 'en-GB' : 'pt-BR';
    const voice = this.voices[this.style];
    if (voice) u.voice = voice;
    u.rate = hints.rate;
    u.pitch = hints.pitch;
    // Estimativa da duração com teto, caso o evento de fim nunca chegue
    this.quietUntil = performance.now() + Math.min(600 + text.length * 85, 9000);
    return new Promise((resolve) => {
      // Sem "start" em 3 s: o navegador bloqueou ou não tem voz
      const timer = setTimeout(() => resolve(false), 3000);
      u.onstart = () => {
        clearTimeout(timer);
        this.speaking = true;
        resolve(true);
      };
      u.onend = () => {
        this.speaking = false;
        this.quietUntil = performance.now() + 500;
      };
      u.onerror = () => {
        clearTimeout(timer);
        this.speaking = false;
        this.quietUntil = 0;
        resolve(false);
      };
      speechSynthesis.speak(u);
    });
  }
}

// O Web Speech API de reconhecimento ainda não está nos tipos padrão do TypeScript
interface RecognitionResultList {
  length: number;
  [i: number]: { isFinal: boolean; 0: { transcript: string } };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: RecognitionResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(track?: MediaStreamTrack): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

// globalThis (e não window) para o módulo poder ser importado nos testes, fora do navegador
const RecognitionImpl: RecognitionCtor | undefined =
  (globalThis as { SpeechRecognition?: RecognitionCtor }).SpeechRecognition ??
  (globalThis as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition;

/** Mensagem para o usuário quando o reconhecimento falha; `null` = erro passageiro, só religar. */
export function recognitionErrorMessage(error: string): string | null {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microfone negado. Clique no ícone do microfone na barra de endereço e permita.';
    case 'audio-capture':
      return 'Nenhum microfone encontrado (ou ele está em uso por outro programa).';
    case 'network':
      return 'O reconhecimento de voz deste navegador não respondeu. Abra no Google Chrome (o navegador do VS Code, o Brave e às vezes o Edge não funcionam).';
    case 'language-not-supported':
      return 'Este navegador não reconhece português. Use o Google Chrome.';
    default:
      return null;
  }
}

/** Escuta o microfone e entrega cada frase reconhecida. Funciona no Google Chrome. */
export class VoiceCommands {
  static readonly supported = RecognitionImpl !== undefined;
  active = false;
  private rec: Recognition | null = null;
  private failures = 0;
  private startedAt = 0;

  constructor(
    private readonly onText: (text: string) => void,
    private readonly onError: (message: string) => void,
    /** Texto parcial enquanto a pessoa ainda fala. */
    private readonly onInterim: (text: string) => void = () => {},
    /** Avisos que não param o microfone. */
    private readonly onNotice: (message: string) => void = () => {},
  ) {}

  private track: MediaStreamTrack | undefined;

  /** Liga o reconhecimento no microfone escolhido; se o Chrome não aceitar escolher, usa o padrão dele. */
  private begin(rec: Recognition): void {
    this.startedAt = performance.now();
    if (!this.track) return rec.start();
    try {
      rec.start(this.track);
    } catch (e) {
      if (!(e instanceof TypeError)) throw e;
      this.track = undefined;
      this.onNotice('Este Chrome não deixa escolher o microfone do reconhecimento; usando o microfone padrão do Chrome.');
      rec.start();
    }
  }

  start(track?: MediaStreamTrack): void {
    if (!RecognitionImpl || this.active) return;
    this.track = track;
    const rec = new RecognitionImpl();
    rec.lang = 'pt-BR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript.trim();
        if (e.results[i].isFinal) {
          if (text) this.onText(text);
        } else interim += ' ' + text;
      }
      if (interim.trim()) this.onInterim(interim.trim());
    };
    rec.onerror = (e) => {
      const message = recognitionErrorMessage(e.error);
      if (message) {
        this.stop();
        this.onError(message);
      }
    };
    // O Chrome encerra o reconhecimento sozinho depois de um silêncio; religa enquanto estiver ativo,
    // mas desiste se ele morrer logo ao ligar várias vezes seguidas (navegador sem suporte real)
    rec.onend = () => {
      if (!this.active) return;
      this.failures = performance.now() - this.startedAt < 1500 ? this.failures + 1 : 0;
      if (this.failures > 5) {
        this.stop();
        this.onError(recognitionErrorMessage('network')!);
        return;
      }
      try {
        this.begin(rec);
      } catch {
        /* já estava rodando */
      }
    };
    this.rec = rec;
    this.active = true;
    this.failures = 0;
    try {
      this.begin(rec);
    } catch {
      this.stop();
      this.onError('Não consegui ligar o microfone.');
    }
  }

  stop(): void {
    this.active = false;
    this.rec?.stop();
    this.rec = null;
  }
}
