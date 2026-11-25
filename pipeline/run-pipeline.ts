import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_GEMINI_MODEL,
  formatArticleMarkdown,
  formatDraftPrBody,
  generateArticleWithGemini,
} from './generator.js';
import { fetchHackerNewsItems } from './sources/hackernews.js';
import { fetchRedditItems } from './sources/reddit.js';
import { fetchRssItems } from './sources/rss.js';
import type {
  DraftArtifact,
  SeenSourcesState,
  SourceItem,
  SourcesConfig,
} from './types.js';

/**
 * Deduplicates against seen URLs and selects up to `maxCount` candidates,
 * balancing across distinct sources so one subreddit never dominates a run.
 */
export function selectDiverseCandidates(
  items: readonly SourceItem[],
  seenUrls: ReadonlySet<string>,
  maxCount: number
): SourceItem[] {
  const fresh = items
    .filter((item) => !seenUrls.has(item.sourceUrl))
    .sort((a, b) => b.score - a.score);

  const selected: SourceItem[] = [];
  const usedUrls = new Set<string>();
  const usedSources = new Set<string>();

  // Pass 1: highest-scoring item from each distinct source
  for (const item of fresh) {
    if (selected.length >= maxCount) break;
    if (usedUrls.has(item.sourceUrl) || usedSources.has(item.sourceName)) {
      continue;
    }
    selected.push(item);
    usedUrls.add(item.sourceUrl);
    usedSources.add(item.sourceName);
  }

  // Pass 2: fill remaining slots by score
  for (const item of fresh) {
    if (selected.length >= maxCount) break;
    if (usedUrls.has(item.sourceUrl)) continue;
    selected.push(item);
    usedUrls.add(item.sourceUrl);
  }

  return selected;
}

function formatDatePrefix(now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required');
  }

  const rootDir = process.cwd();
  const configPath = path.join(rootDir, 'config/sources.json');
  const seenPath = path.join(rootDir, 'data/seen-sources.json');
  const articlesDir = path.join(rootDir, 'src/content/articles');
  const outManifestPath = path.join(rootDir, 'data/draft-manifest.json');

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as SourcesConfig;
  const seenState = JSON.parse(
    fs.readFileSync(seenPath, 'utf8')
  ) as SeenSourcesState;
  const seenSet = new Set(seenState.seenUrls);

  const [redditItems, hnItems, rssItems] = await Promise.all([
    fetchRedditItems(config.reddit),
    fetchHackerNewsItems(config.hackerNews),
    fetchRssItems(config.rss),
  ]);

  const allItems = [...redditItems, ...hnItems, ...rssItems];
  const candidates = selectDiverseCandidates(
    allItems,
    seenSet,
    config.maxArticlesPerRun
  );

  console.log(
    `[MusubiPublisher] Fetched ${allItems.length} items, selected ${candidates.length} new candidates.`
  );

  const now = new Date();
  const datePrefix = formatDatePrefix(now);
  const publishedAtIso = now.toISOString();
  const drafts: DraftArtifact[] = [];

  fs.mkdirSync(articlesDir, { recursive: true });

  for (const candidate of candidates) {
    try {
      const generated = await generateArticleWithGemini(candidate, {
        apiKey,
        model: config.geminiModel || DEFAULT_GEMINI_MODEL,
      });

      const fileName = `${datePrefix}-${generated.slug}.md`;
      const relFilePath = `src/content/articles/${fileName}`;
      const absFilePath = path.join(rootDir, relFilePath);
      const markdown = formatArticleMarkdown(generated, candidate, publishedAtIso);

      fs.writeFileSync(absFilePath, markdown, 'utf8');
      seenSet.add(candidate.sourceUrl);

      drafts.push({
        slug: generated.slug,
        filePath: relFilePath,
        branchName: `draft/${datePrefix}-${generated.slug}`,
        prTitle: `📝 [下書き] ${generated.title}`,
        prBody: formatDraftPrBody(generated, candidate, relFilePath),
        sourceUrl: candidate.sourceUrl,
        articleTitle: generated.title,
      });
    } catch (err) {
      console.error(
        `[MusubiPublisher] Failed to generate article for ${candidate.sourceUrl}:`,
        err
      );
    }
  }

  // Keep most recent 500 seen URLs to prevent unbounded file growth
  const updatedSeen: SeenSourcesState = {
    seenUrls: Array.from(seenSet).slice(-500),
  };
  fs.writeFileSync(seenPath, `${JSON.stringify(updatedSeen, null, 2)}\n`, 'utf8');
  fs.writeFileSync(outManifestPath, `${JSON.stringify(drafts, null, 2)}\n`, 'utf8');

  console.log(`[MusubiPublisher] Generated ${drafts.length} draft article(s).`);

  if (candidates.length > 0 && drafts.length === 0) {
    throw new Error(
      `Failed to generate any draft articles out of ${candidates.length} candidate(s).`
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
