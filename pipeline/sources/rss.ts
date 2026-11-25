import type { RssSourceConfig, SourceItem } from '../types.js';

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

export function parseRssItems(
  xml: string,
  config: RssSourceConfig
): SourceItem[] {
  const itemMatches = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  const items: SourceItem[] = [];

  for (const block of itemMatches.slice(0, config.limit)) {
    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link');
    if (!title || !link || !/^https?:\/\//i.test(link)) {
      continue;
    }
    const description = extractTag(block, 'description');
    const bookmarkCountStr = extractTag(block, 'hatena:bookmarkcount');
    const score = bookmarkCountStr ? Number.parseInt(bookmarkCountStr, 10) || 100 : 100;
    const rawDate =
      extractTag(block, 'pubDate') ||
      extractTag(block, 'dc:date') ||
      new Date().toISOString();
    const parsedDate = Number.isNaN(Date.parse(rawDate))
      ? new Date().toISOString()
      : new Date(rawDate).toISOString();

    items.push({
      sourceName: config.name,
      sourceUrl: link,
      sourceTitle: title,
      category: config.category,
      score,
      commentCount: score,
      excerpt: description.slice(0, 800),
      topComments: [],
      publishedAt: parsedDate,
    });
  }

  return items;
}

export async function fetchRssItems(
  configs: readonly RssSourceConfig[],
  fetcher: typeof fetch = fetch
): Promise<SourceItem[]> {
  const collected: SourceItem[] = [];

  for (const cfg of configs) {
    try {
      const res = await fetcher(cfg.url, {
        headers: {
          'User-Agent':
            'MusubiPublisher/1.0 (+https://github.com/yusuke0627/MusubiPublisher)',
        },
      });
      if (!res.ok) {
        continue;
      }
      const xml = await res.text();
      collected.push(...parseRssItems(xml, cfg));
    } catch {
      // Skip failing RSS feed
    }
  }

  return collected;
}
