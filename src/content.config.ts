import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/articles' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishedAt: z.coerce.date(),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    tldr: z.array(z.string()).default([]),
    sourceName: z.string(),
    sourceTitle: z.string(),
    sourceUrl: z.string().url(),
  }),
});

export const collections = { articles };
