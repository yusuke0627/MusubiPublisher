import type { HackerNewsSourceConfig, SourceItem } from '../types.js';

const HN_API_BASE = 'https://hacker-news.firebaseio.com/v0';

interface HnItem {
  id: number;
  type?: string;
  title?: string;
  url?: string;
  text?: string;
  score?: number;
  descendants?: number;
  time?: number;
  kids?: number[];
  dead?: boolean;
  deleted?: boolean;
}

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchHackerNewsItems(
  config: HackerNewsSourceConfig,
  fetcher: typeof fetch = fetch
): Promise<SourceItem[]> {
  if (!config.enabled) {
    return [];
  }

  try {
    const idsRes = await fetcher(`${HN_API_BASE}/topstories.json`);
    if (!idsRes.ok) {
      return [];
    }
    const ids = ((await idsRes.json()) as number[]).slice(0, config.limit * 2);
    const results: SourceItem[] = [];

    for (const id of ids) {
      if (results.length >= config.limit) {
        break;
      }
      try {
        const itemRes = await fetcher(`${HN_API_BASE}/item/${id}.json`);
        if (!itemRes.ok) {
          continue;
        }
        const item = (await itemRes.json()) as HnItem | null;
        if (
          !item ||
          item.dead ||
          item.deleted ||
          item.type !== 'story' ||
          !item.title ||
          (item.score ?? 0) < config.minScore
        ) {
          continue;
        }

        const topComments: string[] = [];
        for (const kidId of (item.kids ?? []).slice(0, 3)) {
          try {
            const cRes = await fetcher(`${HN_API_BASE}/item/${kidId}.json`);
            if (!cRes.ok) continue;
            const c = (await cRes.json()) as HnItem | null;
            if (c?.text && !c.deleted && !c.dead) {
              topComments.push(stripHtml(c.text).slice(0, 320));
            }
          } catch {
            // Ignore comment fetch failure
          }
        }

        results.push({
          sourceName: 'Hacker News',
          sourceUrl: `https://news.ycombinator.com/item?id=${item.id}`,
          sourceTitle: item.title.trim(),
          category: config.category,
          score: item.score ?? 0,
          commentCount: item.descendants ?? 0,
          excerpt: item.text ? stripHtml(item.text).slice(0, 1000) : '',
          topComments,
          publishedAt: item.time
            ? new Date(item.time * 1000).toISOString()
            : new Date().toISOString(),
        });
      } catch {
        // Ignore individual story fetch failure
      }
    }

    return results;
  } catch {
    return [];
  }
}
