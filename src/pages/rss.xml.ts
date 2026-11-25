import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { withBase } from '../lib/urls';

export async function GET(context: APIContext) {
  const articles = (await getCollection('articles')).sort(
    (a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime()
  );

  return rss({
    title: 'MusubiPublisher',
    description:
      '海外・国内の話題を3行まとめと要点解説でお届けするキュレーションメディア。',
    site: context.site ?? 'https://yusuke0627.github.io',
    items: articles.map((article) => ({
      title: article.data.title,
      pubDate: article.data.publishedAt,
      description: article.data.description,
      categories: [article.data.category, ...article.data.tags],
      link: withBase(`articles/${article.id}/`),
    })),
    customData: '<language>ja</language>',
  });
}
