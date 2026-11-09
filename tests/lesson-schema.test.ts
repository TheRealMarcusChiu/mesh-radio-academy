import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lessonSchema } from '../src/lib/lesson-schema.ts';

const valid = {
  module: '01',
  outcomes: ['Explain dB versus dBm'],
  estimatedMinutes: 20,
  prerequisites: ['00-start-here'],
  difficulty: 'beginner',
  sourceIds: ['RF-001'],
  baseline: 'synthetic-only',
  reviewed: '2026-11-08',
};

test('accepts complete lesson metadata and parses the review date', () => {
  const r = lessonSchema.parse(valid);
  assert.ok(r.reviewed instanceof Date);
  assert.equal(r.reviewed.toISOString().slice(0, 10), '2026-11-08');
});

test('requires every field', () => {
  for (const key of Object.keys(valid)) {
    const copy: Record<string, unknown> = { ...valid };
    delete copy[key];
    assert.equal(lessonSchema.safeParse(copy).success, false, key);
  }
});

test('rejects a lesson with no outcomes or no sources', () => {
  assert.equal(lessonSchema.safeParse({ ...valid, outcomes: [] }).success, false);
  assert.equal(lessonSchema.safeParse({ ...valid, sourceIds: [] }).success, false);
});

test('rejects bad module numbers, difficulty, time and source id shapes', () => {
  assert.equal(lessonSchema.safeParse({ ...valid, module: '13' }).success, false);
  assert.equal(lessonSchema.safeParse({ ...valid, module: '1' }).success, false);
  assert.equal(lessonSchema.safeParse({ ...valid, difficulty: 'easy' }).success, false);
  assert.equal(lessonSchema.safeParse({ ...valid, estimatedMinutes: 0 }).success, false);
  assert.equal(lessonSchema.safeParse({ ...valid, estimatedMinutes: 2.5 }).success, false);
  assert.equal(lessonSchema.safeParse({ ...valid, sourceIds: ['see docs'] }).success, false);
  assert.equal(lessonSchema.safeParse({ ...valid, reviewed: 'yesterday' }).success, false);
});
