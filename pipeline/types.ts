export interface RedditSourceConfig {
  subreddit: string;
  category: string;
  minScore: number;
  limit: number;
}

export interface HackerNewsSourceConfig {
  enabled: boolean;
  category: string;
  minScore: number;
  limit: number;
}

export interface RssSourceConfig {
  name: string;
  url: string;
  category: string;
  limit: number;
}

export interface SourcesConfig {
  maxArticlesPerRun: number;
  geminiModel: string;
  reddit: RedditSourceConfig[];
  hackerNews: HackerNewsSourceConfig;
  rss: RssSourceConfig[];
}

export interface SourceItem {
  sourceName: string;
  sourceUrl: string;
  sourceTitle: string;
  category: string;
  score: number;
  commentCount: number;
  excerpt: string;
  topComments: string[];
  publishedAt: string;
}

export interface GeneratedArticle {
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  tldr: string[];
  bodyMarkdown: string;
}

export interface SeenSourcesState {
  seenUrls: string[];
}

export interface DraftArtifact {
  slug: string;
  filePath: string;
  branchName: string;
  prTitle: string;
  prBody: string;
  sourceUrl: string;
  articleTitle: string;
}
