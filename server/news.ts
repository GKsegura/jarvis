import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import type { NewsItem } from '../src/news';
import { readConfigText } from './config-file';
import { isLocalRequest, sendJson } from './http';

export interface NewsFeed {
  name: string;
  url: string;
  /** Assuntos do feed, para pedir "notícias de tecnologia". */
  topics: string[];
}

export interface NewsConfig {
  feeds: NewsFeed[];
  /** Quantas manchetes guardar. */
  max: number;
}

export const DEFAULT_FEEDS: NewsFeed[] = [
  { name: 'G1', url: 'https://g1.globo.com/rss/g1/', topics: ['geral'] },
  { name: 'Tecnoblog', url: 'https://tecnoblog.net/feed/', topics: ['tecnologia'] },
];

const CACHE_MS = 10 * 60_000;
const TIMEOUT_MS = 6000;
const MAX_XML = 2_000_000;
const DEFAULT_MAX = 12;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Tira CDATA, tags HTML e entidades de um trecho de XML. */
export function cleanText(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

const tag = (block: string, name: string): string => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? cleanText(m[1]) : '';
};

/** Link do item: <link>texto</link> (RSS) ou <link href="..."/> (Atom). */
const linkOf = (block: string): string => {
  const text = tag(block, 'link');
  if (text) return text;
  return block.match(/<link\s[^>]*href="([^"]+)"/i)?.[1] ?? '';
};

const isHttp = (url: string): boolean => /^https?:\/\//i.test(url);

/** Lê os itens de um feed RSS 2.0 ou Atom. Itens sem título ou sem link http(s) são descartados. */
export function parseFeed(xml: string, source: string, topics: string[] = []): NewsItem[] {
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) ?? [];
  const items: NewsItem[] = [];
  for (const block of blocks) {
    const title = tag(block, 'title');
    const link = linkOf(block);
    if (!title || !isHttp(link)) continue;
    const date = tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated') || tag(block, 'dc:date');
    const time = Date.parse(date);
    items.push({ title, link, source, topics, publishedAt: Number.isFinite(time) ? time : 0 });
  }
  return items;
}

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Junta feeds: tira repetidas (mesmo título), ordena da mais nova para a mais antiga e corta em `max`. */
export function mergeNews(lists: NewsItem[][], max: number): NewsItem[] {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  const all = lists.flat().sort((a, b) => b.publishedAt - a.publishedAt);
  for (const item of all) {
    const key = normalize(item.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

/** Feeds e quantidade em jarvis.config.json ("news"); sem isso, G1 e Tecnoblog. */
export function parseNewsConfig(data: unknown): NewsConfig {
  const n = (data as { news?: { feeds?: unknown; max?: unknown } } | null)?.news;
  const feeds = Array.isArray(n?.feeds)
    ? (n!.feeds as Array<Partial<NewsFeed>>)
        .filter((f) => typeof f?.name === 'string' && typeof f.url === 'string' && /^https:\/\//i.test(f.url))
        .map((f) => ({
          name: f.name!,
          url: f.url!,
          topics: Array.isArray(f.topics) ? f.topics.filter((t): t is string => typeof t === 'string').map(normalize) : [],
        }))
    : [];
  const max = typeof n?.max === 'number' && n.max >= 1 && n.max <= 50 ? Math.round(n.max) : DEFAULT_MAX;
  return { feeds: feeds.length > 0 ? feeds : DEFAULT_FEEDS, max };
}

export function readNewsConfig(root: string): NewsConfig {
  try {
    return parseNewsConfig(JSON.parse(readConfigText(root)));
  } catch {
    return { feeds: DEFAULT_FEEDS, max: DEFAULT_MAX };
  }
}

/** Só as notícias de um assunto ("tecnologia"); sem assunto, todas. */
export function filterTopic(items: NewsItem[], topic: string | undefined): NewsItem[] {
  if (!topic) return items;
  const t = normalize(topic);
  return items.filter((i) => i.topics.includes(t));
}

async function fetchFeed(feed: NewsFeed): Promise<NewsItem[]> {
  try {
    const r = await fetch(feed.url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': 'JARVIS-HUD' } });
    if (!r.ok) return [];
    const xml = (await r.text()).slice(0, MAX_XML);
    return parseFeed(xml, feed.name, feed.topics);
  } catch {
    return [];
  }
}

let cache: { key: string; at: number; items: NewsItem[] } | null = null;

/** Manchetes dos feeds configurados (RSS, sem chave), com cache de 10 minutos. */
export async function getNews(root: string, topic?: string): Promise<NewsItem[]> {
  const config = readNewsConfig(root);
  const key = JSON.stringify(config);
  if (!cache || cache.key !== key || Date.now() - cache.at >= CACHE_MS) {
    const lists = await Promise.all(config.feeds.map(fetchFeed));
    // Cada feed entra com no máximo `max` itens: um portal que publica muito não esconde os outros
    const items = mergeNews(lists.map((l) => l.slice(0, config.max)), config.max * config.feeds.length);
    // Se tudo falhou, mantém o que já tinha em vez de esvaziar o painel
    if (items.length === 0 && cache?.key === key) cache = { ...cache, at: Date.now() };
    else cache = { key, at: Date.now(), items };
  }
  return filterTopic(cache.items, topic).slice(0, config.max);
}

export function news(root: string): Plugin {
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/news')) return next();
    if (!isLocalRequest(req)) return sendJson(res, 403, { message: 'Só aceito pedidos do próprio JARVIS' });
    const topic = new URL(req.url, 'http://127.0.0.1').searchParams.get('topic') ?? undefined;
    try {
      return sendJson(res, 200, { items: await getNews(root, topic?.slice(0, 40)) });
    } catch (e) {
      return sendJson(res, 502, { message: e instanceof Error ? e.message : 'Falha nas notícias' });
    }
  };
  return {
    name: 'jarvis-news',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  };
}
