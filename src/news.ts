export interface NewsItem {
  title: string;
  link: string;
  source: string;
  /** Assuntos do feed de onde veio (ex.: "tecnologia"). */
  topics: string[];
  /** Milissegundos desde 1970; 0 quando o feed não informa a data. */
  publishedAt: number;
}

/** Quantas manchetes o JARVIS lê de uma vez. */
export const HEADLINES_PER_READ = 3;

/** Tira o " - Portal" que alguns feeds colam no fim do título e limita o tamanho para falar. */
export function spokenTitle(title: string): string {
  const t = title.replace(/\s+[-|–]\s+[^-|–]{2,30}$/, '').trim();
  return t.length > 140 ? `${t.slice(0, 137).trimEnd()}…` : t;
}

/** Fala as próximas manchetes a partir de `from`. Devolve o texto e o novo ponto de leitura. */
export function headlinesSpeech(items: NewsItem[], from: number, count = HEADLINES_PER_READ): { text: string; next: number } | null {
  if (items.length === 0) return null;
  const start = from >= items.length ? 0 : from;
  const slice = items.slice(start, start + count);
  const text = slice.map((i, n) => `${n === 0 ? '' : 'Em seguida: '}${spokenTitle(i.title)}, segundo o ${i.source}.`).join(' ');
  return { text, next: start + slice.length };
}

/** "há 5 min", "há 3 h", "ontem"... para o painel. */
export function ago(publishedAt: number, now: number): string {
  if (!publishedAt) return '';
  const min = Math.max(0, Math.round((now - publishedAt) / 60_000));
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}
