import { describe, expect, it } from 'vitest';
import type { NewsItem } from '../src/news';
import { cleanText, DEFAULT_FEEDS, filterTopic, mergeNews, parseFeed, parseNewsConfig } from './news';

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Portal</title>
  <item>
    <title><![CDATA[Governo anuncia &quot;novo plano&quot; &amp; medidas]]></title>
    <link>https://exemplo.com/a</link>
    <pubDate>Mon, 12 Oct 2026 14:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Sem link válido</title>
    <link>javascript:alert(1)</link>
  </item>
  <item>
    <title>   </title>
    <link>https://exemplo.com/vazio</link>
  </item>
  <item>
    <title>Segunda notícia</title>
    <link>https://exemplo.com/b</link>
    <pubDate>Mon, 12 Oct 2026 15:30:00 GMT</pubDate>
  </item>
</channel></rss>`;

const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Entrada Atom</title>
    <link href="https://exemplo.com/atom" rel="alternate"/>
    <updated>2026-10-12T16:00:00Z</updated>
  </entry>
</feed>`;

const item = (title: string, publishedAt: number, topics: string[] = []): NewsItem => ({
  title,
  link: 'https://x.com',
  source: 'X',
  topics,
  publishedAt,
});

describe('cleanText', () => {
  it('tira CDATA, tags e entidades', () => {
    expect(cleanText('<![CDATA[A &amp; B]]>')).toBe('A & B');
    expect(cleanText('<b>Olá</b>&nbsp;mundo &#233; &#x41;')).toBe('Olá mundo é A');
  });
});

describe('parseFeed', () => {
  it('lê itens RSS, descarta sem título ou com link que não é http(s)', () => {
    const items = parseFeed(RSS, 'Portal', ['geral']);
    expect(items.map((i) => i.title)).toEqual(['Governo anuncia "novo plano" & medidas', 'Segunda notícia']);
    expect(items[0]).toMatchObject({ link: 'https://exemplo.com/a', source: 'Portal', topics: ['geral'] });
    expect(items[0].publishedAt).toBe(Date.parse('2026-10-12T14:00:00Z'));
  });

  it('lê entradas Atom com link em href', () => {
    const [entry] = parseFeed(ATOM, 'Blog');
    expect(entry).toMatchObject({ title: 'Entrada Atom', link: 'https://exemplo.com/atom' });
    expect(entry.publishedAt).toBe(Date.parse('2026-10-12T16:00:00Z'));
  });

  it('devolve lista vazia para lixo', () => {
    expect(parseFeed('não é xml', 'X')).toEqual([]);
  });
});

describe('mergeNews', () => {
  it('ordena da mais nova para a mais antiga, tira títulos repetidos e corta no máximo', () => {
    const merged = mergeNews(
      [
        [item('Chuva forte em SP', 100), item('Dólar sobe', 300)],
        [item('chuva forte em sp!', 200), item('Eleição', 50)],
      ],
      3,
    );
    expect(merged.map((i) => i.title)).toEqual(['Dólar sobe', 'chuva forte em sp!', 'Eleição']);
    expect(mergeNews([[item('A', 1), item('B', 2)]], 1)).toHaveLength(1);
  });
});

describe('parseNewsConfig e filterTopic', () => {
  it('usa G1 e Tecnoblog quando não há configuração', () => {
    expect(parseNewsConfig({})).toEqual({ feeds: DEFAULT_FEEDS, max: 12 });
    expect(parseNewsConfig(null).feeds).toEqual(DEFAULT_FEEDS);
  });

  it('aceita só feeds https e normaliza os assuntos', () => {
    const config = parseNewsConfig({
      news: {
        max: 5,
        feeds: [
          { name: 'Bom', url: 'https://bom.com/rss', topics: ['Tecnologia'] },
          { name: 'Inseguro', url: 'http://ruim.com/rss' },
          { name: 'Local', url: 'file:///etc/passwd' },
        ],
      },
    });
    expect(config).toEqual({ feeds: [{ name: 'Bom', url: 'https://bom.com/rss', topics: ['tecnologia'] }], max: 5 });
  });

  it('filtra por assunto sem diferenciar acentos nem maiúsculas', () => {
    const list = [item('A', 1, ['tecnologia']), item('B', 2, ['geral'])];
    expect(filterTopic(list, 'Tecnología').map((i) => i.title)).toEqual(['A']);
    expect(filterTopic(list, undefined)).toHaveLength(2);
  });
});
