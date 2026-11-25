import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_GEMINI_MODEL,
  formatArticleMarkdown,
  formatDraftPrBody,
  generateArticleWithGemini,
  sanitizeSlug,
} from '../generator.js';
import {
  extractSourceUrlFromFrontmatter,
  parseExtraSeenUrls,
  selectDiverseCandidates,
} from '../run-pipeline.js';
import { fetchHackerNewsItems } from '../sources/hackernews.js';
import { fetchRedditItems } from '../sources/reddit.js';
import { parseRssItems } from '../sources/rss.js';
import type { SourceItem } from '../types.js';

function makeSource(overrides: Partial<SourceItem> = {}): SourceItem {
  return {
    sourceName: 'Reddit r/technology',
    sourceUrl: 'https://www.reddit.com/r/technology/comments/abc/sample/',
    sourceTitle: 'Sample Tech News',
    category: 'テック',
    score: 500,
    commentCount: 120,
    excerpt: 'Some summary text',
    topComments: ['Interesting point'],
    publishedAt: '2026-11-25T00:00:00.000Z',
    ...overrides,
  };
}

describe('RSS parser', () => {
  it('parses items and Hatena bookmark counts from RSS XML', () => {
    const xml = `
      <rdf:RDF>
        <item>
          <title><![CDATA[TypeScript 6.0 の新機能まとめ]]></title>
          <link>https://example.jp/ts6</link>
          <description>型推論がさらに強化されました。</description>
          <hatena:bookmarkcount>345</hatena:bookmarkcount>
          <dc:date>2026-11-25T01:00:00+09:00</dc:date>
        </item>
      </rdf:RDF>
    `;

    const items = parseRssItems(xml, {
      name: 'はてなブックマーク IT',
      url: 'https://b.hatena.ne.jp/hotentry/it.rss',
      category: '開発・エンジニア',
      limit: 5,
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      sourceName: 'はてなブックマーク IT',
      sourceUrl: 'https://example.jp/ts6',
      sourceTitle: 'TypeScript 6.0 の新機能まとめ',
      category: '開発・エンジニア',
      score: 345,
    });
  });
});

describe('Reddit adapter', () => {
  it('filters out stickied, over_18, and low-score posts', async () => {
    const mockFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            children: [
              { data: { title: 'Pinned', permalink: '/r/tech/1', score: 9999, stickied: true } },
              { data: { title: 'NSFW', permalink: '/r/tech/2', score: 9999, over_18: true } },
              { data: { title: 'Low', permalink: '/r/tech/3', score: 50 } },
              { data: { title: 'Valid Hot Post', permalink: '/r/tech/4', score: 850, num_comments: 99 } },
            ],
          },
        }),
        { status: 200 }
      )
    ) as unknown as typeof fetch;

    const items = await fetchRedditItems(
      [{ subreddit: 'technology', category: 'テック', minScore: 300, limit: 10 }],
      mockFetch
    );

    expect(items).toHaveLength(1);
    expect(items[0].sourceTitle).toBe('Valid Hot Post');
    expect(items[0].sourceUrl).toBe('https://www.reddit.com/r/tech/4');
  });
});

describe('Hacker News adapter', () => {
  it('fetches qualifying stories with top comment excerpts', async () => {
    const mockFetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/topstories.json')) {
        return new Response(JSON.stringify([101]), { status: 200 });
      }
      if (url.endsWith('/item/101.json')) {
        return new Response(
          JSON.stringify({
            id: 101,
            type: 'story',
            title: 'Show HN: Fast RSS Reader',
            score: 420,
            descendants: 88,
            time: 1764000000,
            kids: [201],
          }),
          { status: 200 }
        );
      }
      if (url.endsWith('/item/201.json')) {
        return new Response(
          JSON.stringify({
            id: 201,
            type: 'comment',
            text: '<p>Love the offline-first design!</p>',
          }),
          { status: 200 }
        );
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const items = await fetchHackerNewsItems(
      { enabled: true, category: 'テック', minScore: 150, limit: 5 },
      mockFetch
    );

    expect(items).toHaveLength(1);
    expect(items[0].sourceName).toBe('Hacker News');
    expect(items[0].topComments).toEqual(['Love the offline-first design!']);
  });
});

describe('selectDiverseCandidates', () => {
  it('skips seen URLs and spreads selection across distinct sources', () => {
    const items: SourceItem[] = [
      makeSource({ sourceName: 'Reddit r/tech', sourceUrl: 'https://a/1', score: 1000 }),
      makeSource({ sourceName: 'Reddit r/tech', sourceUrl: 'https://a/2', score: 900 }),
      makeSource({ sourceName: 'Hacker News', sourceUrl: 'https://b/1', score: 600 }),
      makeSource({ sourceName: 'はてブ', sourceUrl: 'https://c/1', score: 300 }),
    ];

    const selected = selectDiverseCandidates(items, new Set(['https://a/1']), 3);
    expect(selected.map((s) => s.sourceUrl)).toEqual([
      'https://a/2',
      'https://b/1',
      'https://c/1',
    ]);
  });

  it('extracts sourceUrl from article frontmatter and parses EXTRA_SEEN_URLS', () => {
    const md = `---
title: "Sample"
sourceUrl: "https://news.ycombinator.com/item?id=12345"
---

Body`;
    expect(extractSourceUrlFromFrontmatter(md)).toBe(
      'https://news.ycombinator.com/item?id=12345'
    );
    expect(extractSourceUrlFromFrontmatter('No frontmatter')).toBeNull();

    expect(
      parseExtraSeenUrls('["https://a.example/1", "https://b.example/2"]')
    ).toEqual(['https://a.example/1', 'https://b.example/2']);
    expect(
      parseExtraSeenUrls('https://a.example/1\nhttps://b.example/2\n')
    ).toEqual(['https://a.example/1', 'https://b.example/2']);
  });
});

describe('Gemini generator & Markdown formatter', () => {
  it('sanitizes slugs and falls back deterministically for non-ASCII input', () => {
    expect(sanitizeSlug('New AI Model Release!!', 'seed')).toBe('new-ai-model-release');
    expect(sanitizeSlug('日本語だけ', 'https://example.com/1')).toMatch(/^topic-[0-9a-f]{8}$/);
  });

  it('calls Gemini Interactions API with gemini-3.8-flash and formats valid Markdown + PR body', async () => {
    const createMock = vi.fn(async () => ({
      output_text: JSON.stringify({
        slug: 'fast-rss-reader',
        title: 'オフライン爆速RSSリーダーが話題に',
        description: 'Hacker Newsで注目を集めたオフライン対応RSSリーダーの設計ポイントを整理します。',
        tags: ['RSS', 'iOS', '開発'],
        tldr: ['オフラインキャッシュ設計が好評', '広告ブロックも軽量実装', '個人開発の好例として話題'],
        bodyMarkdown: '## 何が起きているのか\n\nHacker News で注目を集めています。',
      }),
    }));

    const source = makeSource({ sourceName: 'Hacker News' });
    const article = await generateArticleWithGemini(source, {
      apiKey: 'test-key',
      aiClient: { interactions: { create: createMock } } as never,
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: DEFAULT_GEMINI_MODEL,
        store: false,
      })
    );

    const md = formatArticleMarkdown(article, source, '2026-11-25T06:00:00.000Z');
    expect(md).toContain('title: "オフライン爆速RSSリーダーが話題に"');
    expect(md).toContain('sourceUrl: "https://www.reddit.com/r/technology/comments/abc/sample/"');
    expect(md).toContain('## 何が起きているのか');

    const prBody = formatDraftPrBody(article, source, 'src/content/articles/2026-11-25-fast-rss-reader.md');
    expect(prBody).toContain('Merge');
    expect(prBody).toContain('オフラインキャッシュ設計が好評');
  });

  it('falls back to the next Gemini model when primary model returns 429 rate limit', async () => {
    const calledModels: string[] = [];
    const createMock = vi.fn(async (params: { model: string }) => {
      calledModels.push(params.model);
      if (params.model === 'gemini-3.5-flash-lite') {
        throw Object.assign(new Error('Rate limit exceeded'), {
          rawResponse: { status: 429 },
          error: { code: 'too_many_requests' },
        });
      }
      return {
        output_text: JSON.stringify({
          slug: 'fallback-success',
          title: 'フォールバックモデルで生成成功',
          description: 'レート制限時に自動で別モデルへ切り替えて記事を生成しました。',
          tags: ['Gemini', '自動化'],
          tldr: ['429検知で自動切替', '別モデルで記事生成', '安定運用を実現'],
          bodyMarkdown: '## フォールバック成功\n\n無事に生成されました。',
        }),
      };
    });

    const source = makeSource();
    const article = await generateArticleWithGemini(source, {
      apiKey: 'test-key',
      model: 'gemini-3.5-flash-lite',
      fallbackModels: ['gemini-3.1-flash-lite', 'gemini-3.8-flash'],
      aiClient: { interactions: { create: createMock } } as never,
    });

    expect(calledModels).toEqual(['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']);
    expect(article.slug).toBe('fallback-success');
  });
});
