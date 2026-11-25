import { GoogleGenAI } from '@google/genai';
import type { GeneratedArticle, SourceItem } from './types.js';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

const ARTICLE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    slug: {
      type: 'string',
      description:
        'Short lowercase ASCII kebab-case slug (3-6 words, alphanumeric and hyphens only, no date prefix)',
    },
    title: {
      type: 'string',
      description: 'Engaging, clear Japanese article headline (30-55 characters)',
    },
    description: {
      type: 'string',
      description: 'Concise Japanese SEO meta description (70-120 characters)',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: '3 to 5 concise Japanese/English topic tags',
    },
    tldr: {
      type: 'array',
      items: { type: 'string' },
      description: 'Exactly 3 concise Japanese bullet points summarizing the topic',
    },
    bodyMarkdown: {
      type: 'string',
      description:
        'Original Japanese explanatory article body in Markdown with ## headings (e.g. ## 何が起きているのか, ## ネット上の主な反応・論点, ## 今後の注目ポイント). Must NOT copy-paste raw thread posts verbatim.',
    },
  },
  required: ['slug', 'title', 'description', 'tags', 'tldr', 'bodyMarkdown'],
} as const;

export function sanitizeSlug(rawSlug: string, fallbackSeed: string): string {
  const cleaned = rawSlug
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  if (cleaned.length >= 3) {
    return cleaned;
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < fallbackSeed.length; i += 1) {
    hash ^= fallbackSeed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `topic-${hash.toString(16).padStart(8, '0')}`;
}

function escapeYaml(value: string): string {
  return JSON.stringify(value.replace(/\r?\n/g, ' ').trim());
}

export function formatArticleMarkdown(
  article: GeneratedArticle,
  source: SourceItem,
  publishedAtIso: string
): string {
  const tagsYaml = article.tags.map((tag) => `  - ${escapeYaml(tag)}`).join('\n');
  const tldrYaml = article.tldr.map((line) => `  - ${escapeYaml(line)}`).join('\n');

  return [
    '---',
    `title: ${escapeYaml(article.title)}`,
    `description: ${escapeYaml(article.description)}`,
    `publishedAt: ${escapeYaml(publishedAtIso)}`,
    `category: ${escapeYaml(article.category)}`,
    'tags:',
    tagsYaml,
    'tldr:',
    tldrYaml,
    `sourceName: ${escapeYaml(source.sourceName)}`,
    `sourceTitle: ${escapeYaml(source.sourceTitle)}`,
    `sourceUrl: ${escapeYaml(source.sourceUrl)}`,
    '---',
    '',
    article.bodyMarkdown.trim(),
    '',
  ].join('\n');
}

export function formatDraftPrBody(
  article: GeneratedArticle,
  source: SourceItem,
  filePath: string
): string {
  const tldrList = article.tldr.map((item) => `- ${item}`).join('\n');
  const preview = article.bodyMarkdown.trim().slice(0, 1400);
  return [
    '## 📰 自動生成された下書き記事',
    '',
    'このPRを **Merge** するとそのまま公開され、`/rss.xml`（MusubiReader連携）にも自動で反映されます。',
    '公開しない場合は **Close** してください。',
    '',
    `- **タイトル**: ${article.title}`,
    `- **カテゴリ**: ${article.category}`,
    `- **タグ**: ${article.tags.join(', ')}`,
    `- **ファイル**: \`${filePath}\``,
    `- **元ソース**: [${source.sourceTitle}](${source.sourceUrl})（${source.sourceName} / score: ${source.score}）`,
    '',
    '### 3行まとめ',
    tldrList,
    '',
    '### 本文プレビュー',
    preview,
  ].join('\n');
}

export function buildCurationPrompt(source: SourceItem): string {
  const commentBlock =
    source.topComments.length > 0
      ? `\n主なコメント抜粋:\n${source.topComments.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
      : '';

  return [
    'あなたは日本語テック＆トレンド解説メディア「MusubiPublisher」の編集長です。',
    '以下の一次ソース情報を参考に、日本の読者が1〜2分で全体像と論点をつかめるオリジナル解説記事を日本語で執筆してください。',
    '',
    '厳守ルール:',
    '- 元投稿やコメントをそのまま丸写しせず、独自の日本語で分かりやすく要約・解説する。',
    '- 誇張や断定的なフェイク表現を避け、事実とネット上の意見を切り分けて書く。',
    '- 本文は Markdown 形式で 600〜1100 文字程度、見出しは ## を 2〜3 個使う。',
    '- 出力は必ず指定の JSON スキーマに従う。',
    '',
    `ソース名: ${source.sourceName}`,
    `カテゴリ: ${source.category}`,
    `元タイトル: ${source.sourceTitle}`,
    `URL: ${source.sourceUrl}`,
    `スコア/注目度: ${source.score}（コメント数: ${source.commentCount}）`,
    source.excerpt ? `概要抜粋:\n${source.excerpt}` : '',
    commentBlock,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function generateArticleWithGemini(
  source: SourceItem,
  options: {
    apiKey: string;
    model?: string;
    aiClient?: Pick<GoogleGenAI, 'interactions'>;
  }
): Promise<GeneratedArticle> {
  const ai = options.aiClient ?? new GoogleGenAI({ apiKey: options.apiKey });
  const model = options.model || DEFAULT_GEMINI_MODEL;

  const response = await ai.interactions.create({
    model,
    input: buildCurationPrompt(source),
    store: false,
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: ARTICLE_RESPONSE_SCHEMA,
    },
  });

  const rawText = response.output_text;
  if (!rawText) {
    throw new Error('Gemini returned empty output_text');
  }

  const parsed = JSON.parse(rawText) as Partial<GeneratedArticle>;
  if (!parsed.title || !parsed.description || !parsed.bodyMarkdown) {
    throw new Error('Gemini structured output missing required fields');
  }

  return {
    slug: sanitizeSlug(parsed.slug ?? '', source.sourceUrl),
    title: parsed.title.trim(),
    description: parsed.description.trim(),
    category: source.category,
    tags: Array.isArray(parsed.tags)
      ? parsed.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 5)
      : [source.category],
    tldr: Array.isArray(parsed.tldr)
      ? parsed.tldr.map((t) => String(t).trim()).filter(Boolean).slice(0, 3)
      : [],
    bodyMarkdown: parsed.bodyMarkdown.trim(),
  };
}
