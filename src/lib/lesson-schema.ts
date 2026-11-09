import { z } from 'astro/zod';

/**
 * Metadata every numbered lesson must carry. Pages without a `lesson` block
 * (homepage, outline, reference) are not lessons and claim no evidence.
 */
export const lessonSchema = z.object({
  /** Two-digit module number, 00–12. */
  module: z.string().regex(/^(0\d|1[0-2])$/, 'module must be 00–12'),
  outcomes: z.array(z.string().min(1)).min(1),
  estimatedMinutes: z.number().int().positive(),
  /** Slugs of pages the learner should finish first; may be empty. */
  prerequisites: z.array(z.string().min(1)),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  /** Claim/source IDs from the research ledger, e.g. MT-ROUTE-01. */
  sourceIds: z.array(z.string().regex(/^[A-Z][A-Z0-9]*(-[A-Z0-9]+)+$/, 'source id must look like ABC-123')).min(1),
  /** Firmware/client baseline the lesson was checked against. */
  baseline: z.string().min(1),
  reviewed: z.union([
    z.date(),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'reviewed must be YYYY-MM-DD').transform((s) => new Date(s)),
  ]),
});

export type LessonMeta = z.infer<typeof lessonSchema>;
