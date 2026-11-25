import type { RedditSourceConfig, SourceItem } from '../types.js';

const USER_AGENT =
  'MusubiPublisher/1.0 (+https://github.com/yusuke0627/MusubiPublisher)';

interface RedditListingResponse {
  data?: {
    children?: Array<{
      data?: {
        title?: string;
        permalink?: string;
        selftext?: string;
        score?: number;
        num_comments?: number;
        created_utc?: number;
        stickied?: boolean;
        over_18?: boolean;
      };
    }>;
  };
}

export async function fetchRedditItems(
  configs: readonly RedditSourceConfig[],
  fetcher: typeof fetch = fetch
): Promise<SourceItem[]> {
  const collected: SourceItem[] = [];

  for (const cfg of configs) {
    try {
      const url = `https://www.reddit.com/r/${encodeURIComponent(cfg.subreddit)}/hot.json?limit=${cfg.limit}&raw_json=1`;
      const res = await fetcher(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      });
      if (!res.ok) {
        continue;
      }
      const json = (await res.json()) as RedditListingResponse;
      const children = json.data?.children ?? [];

      for (const child of children) {
        const post = child.data;
        if (!post || post.stickied || post.over_18) {
          continue;
        }
        const score = post.score ?? 0;
        if (score < cfg.minScore || !post.title || !post.permalink) {
          continue;
        }
        collected.push({
          sourceName: `Reddit r/${cfg.subreddit}`,
          sourceUrl: `https://www.reddit.com${post.permalink}`,
          sourceTitle: post.title.trim(),
          category: cfg.category,
          score,
          commentCount: post.num_comments ?? 0,
          excerpt: (post.selftext ?? '').trim().slice(0, 1200),
          topComments: [],
          publishedAt: post.created_utc
            ? new Date(post.created_utc * 1000).toISOString()
            : new Date().toISOString(),
        });
      }
    } catch {
      // Skip individual subreddit failure so other sources still succeed.
    }
  }

  return collected;
}
