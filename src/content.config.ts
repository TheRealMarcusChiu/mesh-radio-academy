import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { lessonSchema } from './lib/lesson-schema.ts';

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    // Only numbered lessons carry `lesson`; orientation pages claim no evidence.
    schema: docsSchema({ extend: z.object({ lesson: lessonSchema.optional() }) }),
  }),
};
