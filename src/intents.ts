/** Item da lista de ações do servidor (GET /api/actions/list). */
export interface CatalogItem {
  id: string;
  name: string;
  aliases: string[];
}

export interface Catalog {
  apps: CatalogItem[];
  projects: CatalogItem[];
}

export type Intent =
  | { kind: 'open' | 'focus'; app: CatalogItem }
  | { kind: 'window'; app: CatalogItem; op: WindowOp }
  | { kind: 'project'; project: CatalogItem };

/** Mesmo que WindowOp em server/actions.ts (sem 'focus', que é a intenção "focus"). */
export type WindowOp = 'left' | 'right' | 'maximize' | 'minimize';

export const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Item cujo apelido aparece na frase (o apelido mais longo ganha: "explorador de arquivos" > "arquivos"). */
function findAlias(text: string, items: CatalogItem[]): CatalogItem | null {
  let best: { item: CatalogItem; length: number } | null = null;
  for (const item of items) {
    for (const alias of item.aliases) {
      const a = normalize(alias);
      if (a && new RegExp(`\\b${a}\\b`).test(text) && (!best || a.length > best.length)) best = { item, length: a.length };
    }
  }
  return best?.item ?? null;
}

const RUN = /\b(rod\w*|execut\w*|sob\w*|inici\w*|liga\w*|abr\w*|start\w*)\b/;
const OPEN = /\b(abr\w*|inici\w*|liga\w*|execut\w*)\b/;
const FOCUS = /\b(troc\w*|mud\w*|alterna\w*|mostr\w*|vai|vamos|volt\w*|traz\w*|ir)\b/;

const MOVE = /\b(mov\w*|manda\w*|jog\w*|pass\w*|lev\w*|coloc\w*|bot\w*|mostr\w*|joga)\b/;

/** "mover o Spotify para o outro monitor", "manda pro monitor da esquerda", "maximizar", "minimizar". */
function windowOp(t: string): WindowOp | null {
  if (/\b(maximiz\w*|tela cheia)\b/.test(t)) return 'maximize';
  if (/\b(minimiz\w*|escond\w*)\b/.test(t)) return 'minimize';
  const monitor = /\b(monitor|tela)\b/.test(t);
  if (monitor && (MOVE.test(t) || /\b(outr[oa]|segund[oa]|primeir[oa])\b/.test(t))) {
    return /\besquerd/.test(t) ? 'left' : 'right';
  }
  return null;
}

/** Janela aberta no PC (GET /api/actions/windows). */
export interface OpenWindow {
  hwnd: number;
  process: string;
  title: string;
}

export interface WindowRequest {
  op: WindowOp | 'focus';
  /** "essa janela": a janela em foco agora. */
  foreground: boolean;
}

const THIS_WINDOW = /\b(essa|esta|nessa|nesta) (janela|tela)\b|\bjanela atual\b/;

/**
 * Pedido de janela para qualquer programa aberto (não só os da lista): "manda o Discord pro outro
 * monitor", "maximiza essa janela", "traz a janela do Opera". Quem acha a janela é matchWindow.
 */
export function parseWindowRequest(text: string): WindowRequest | null {
  const t = normalize(text);
  const foreground = THIS_WINDOW.test(t);
  const op = windowOp(t);
  if (op) return { op, foreground };
  // Só "trazer/mostrar" precisa da palavra "janela", para não confundir com conversa
  if (/\bjanela\b/.test(t) && FOCUS.test(t)) return { op: 'focus', foreground };
  return null;
}

const NOT_A_NAME = new Set([
  'mover', 'move', 'manda', 'mandar', 'joga', 'jogar', 'passa', 'passar', 'leva', 'levar', 'coloca', 'colocar', 'bota', 'botar',
  'mostra', 'mostrar', 'traz', 'trazer', 'troca', 'trocar', 'maximiza', 'maximizar', 'minimiza', 'minimizar', 'esconde',
  'janela', 'tela', 'monitor', 'outro', 'outra', 'segundo', 'primeiro', 'esquerda', 'direita', 'para', 'jarvis', 'cheia',
]);

/** Acha a janela citada na frase: pelo nome do programa ou por palavras do título. */
export function matchWindow(text: string, windows: OpenWindow[]): OpenWindow | null {
  const t = normalize(text);
  const words = new Set(t.split(' ').filter((w) => w.length >= 4 && !NOT_A_NAME.has(w)));
  let best: { w: OpenWindow; score: number } | null = null;
  for (const w of windows) {
    const process = normalize(w.process ?? '');
    let score = process && new RegExp(`\\b${process}\\b`).test(t) ? 10 : 0;
    for (const word of normalize(w.title).split(' ')) if (words.has(word)) score++;
    if (score > 0 && (!best || score > best.score)) best = { w, score };
  }
  return best?.w ?? null;
}

/** Entende "abrir o Spotify", "trocar para o VS Code", "rodar o Portfolio"... Só itens da lista. */
export function parseIntent(text: string, catalog: Catalog): Intent | null {
  const t = normalize(text);
  const project = findAlias(t, catalog.projects);
  if (project && RUN.test(t)) return { kind: 'project', project };
  const app = findAlias(t, catalog.apps);
  if (!app) return null;
  const op = windowOp(t);
  if (op) return { kind: 'window', app, op };
  if (FOCUS.test(t)) return { kind: 'focus', app };
  if (OPEN.test(t)) return { kind: 'open', app };
  return null;
}

export type MusicIntent =
  | { action: 'play'; query: string; volume?: number }
  | { action: 'pause' | 'resume' | 'next' | 'previous' | 'current' }
  | { action: 'volume'; volume: number };

// "volume 30", "o volume em 70", "no volume 20 por cento"
const VOLUME_AFTER = /\s*\b(?:com|no|a|em|e)?\s*(?:o\s+)?volume\s+(?:para\s+|em\s+|no\s+|a\s+|de\s+)?(\d{1,3})(?:\s+por cento)?\b/;
// "com 10% do volume" (o % some na normalização)
const VOLUME_BEFORE = /\s*\b(?:com|no|a|em|e)\s+(\d{1,3})(?:\s+por cento)?\s+(?:de|do|no)\s+volume\b/;

/** Entende "tocar <música>", "pausar", "próxima", "o que está tocando", "volume 30"... */
export function parseMusic(text: string): MusicIntent | null {
  let t = normalize(text).replace(/^((ei|ok|oi)\s+)?jarvis\s+/, '');
  // Tira o volume da frase antes de ler a música: "toque X com 10% do volume" toca X no volume 10
  let volume: number | undefined;
  for (const re of [VOLUME_BEFORE, VOLUME_AFTER]) {
    const m = t.match(re);
    if (m) {
      volume = Number(m[1]);
      t = (t.slice(0, m.index) + t.slice(m.index! + m[0].length)).replace(/\s+/g, ' ').trim();
      break;
    }
  }
  const play = t.match(/^(toca|tocar|toque|bota|botar|coloca|colocar|poe|por|reproduz\w*)\s+(a musica |musica |a cancao |cancao |o som |som )?(.+)$/);
  if (play) {
    const query = play[3].replace(/\s+(no|pelo) spotify$/, '').trim();
    if (query && !/^(musica|uma musica|algo|alguma coisa|no spotify)$/.test(query)) {
      return volume === undefined ? { action: 'play', query } : { action: 'play', query, volume };
    }
  }
  if (volume !== undefined) return { action: 'volume', volume };
  if (/\b(que|qual) musica\b|\bo que (esta|ta) tocando\b|\bque som e esse\b/.test(t)) return { action: 'current' };
  if (/\b(pausa|pausar|pause|para a musica|parar a musica|silencia a musica)\b/.test(t)) return { action: 'pause' };
  // "dá play" costuma virar "de play" no reconhecimento de voz
  if (/\b(despausa|continua a musica|retoma|volta a tocar|solta o som)\b|\b(da|de|dar|aperta|aperte|manda)\s+(o\s+|um\s+)?play\b|^play\b/.test(t)) {
    return { action: 'resume' };
  }
  if (/\b(proxima|pula|pular|passa a musica|passa essa)\b/.test(t)) return { action: 'next' };
  if (/\b(musica anterior|volta a musica|anterior)\b/.test(t)) return { action: 'previous' };
  return null;
}

/** Assuntos de dinheiro: frases assim também levam os números do janus para o Claude. */
export const FINANCE_WORDS = /\b(financ\w*|dinheiro|saldo|gast\w*|sobr\w*|dividas?|janus|contas|grana|orcamento)\b/;

/** "Como estão minhas finanças?", "resumo financeiro", "quanto sobrou?" (frases curtas). */
export function parseFinance(text: string): boolean {
  const t = normalize(text);
  if (/\bresumo (do janus|financeiro|das financas|do mes)\b/.test(t)) return true;
  return FINANCE_WORDS.test(t) && !/\b(rod\w*|inici\w*|abr\w*|sob[ei]\w*|liga\w*)\b/.test(t) && t.split(' ').length <= 6;
}

/** Respostas para "Devo iniciar o projeto, senhor?" */
export function confirmation(text: string): 'yes' | 'no' | null {
  const t = normalize(text);
  if (/^(sim|pode|confirm\w*|claro|manda|isso|positivo|faz|faca|ok|okay|beleza|com certeza|por favor|vai)\b/.test(t)) return 'yes';
  if (/^(nao|cancel\w*|esquece|deixa|negativo|para|espera)\b/.test(t)) return 'no';
  return null;
}

export type NewsIntent = { action: 'read'; topic?: string } | { action: 'more' };

/** Entende "notícias", "notícias de tecnologia", "o que está acontecendo", "mais uma" (frases curtas). */
export function parseNews(text: string): NewsIntent | null {
  const t = normalize(text).replace(/^((ei|ok|oi)\s+)?jarvis\s+/, '');
  if (t.split(' ').length > 8) return null;
  if (/\b(mais uma|mais noticias|proxima noticia|proximas noticias|outra noticia|proxima manchete)\b/.test(t)) return { action: 'more' };
  const topic = t.match(/\b(?:noticias?|manchetes?)\s+(?:de|do|da|sobre|em)\s+(?:o\s+|a\s+|os\s+|as\s+)?(.+)$/)?.[1]?.trim();
  if (topic && !/^(dia|hoje|mundo|momento|agora|semana)$/.test(topic)) return { action: 'read', topic };
  if (/\b(noticias?|manchetes?)\b|\bo que (esta|ta) acontecendo\b|\bquais as novidades\b/.test(t)) return { action: 'read' };
  return null;
}

export type RoutinesIntent = 'list' | 'forget';

/** "O que você aprendeu sobre mim?", "minhas rotinas", "esquece as rotinas" (só o que fala de rotinas ou aprendizado). */
export function parseRoutines(text: string): RoutinesIntent | null {
  const t = normalize(text).replace(/^((ei|ok|oi)\s+)?jarvis\s+/, '');
  if (/\b(esquece|esqueca|apaga|apague|limpa|limpe|zera|zere)\b.*\b(rotinas?|aprendizado|que (voce )?aprendeu|meus habitos)\b/.test(t)) return 'forget';
  if (/\b(o que|que|quais?)\b.*\b(voce )?(aprendeu|sabe)\b.*\b(sobre mim|de mim|comigo)\b|\b(minhas|quais|que) (rotinas|habitos)\b/.test(t)) return 'list';
  return null;
}
