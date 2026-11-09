import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openProgress, STORAGE_KEY } from '../src/lib/progress.ts';

/** Minimal in-memory Web Storage stand-in; real behaviour, no mocking library. */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    raw: data,
  };
}

test('marks and reads pages, persisting across reopen', () => {
  const storage = memoryStorage();
  const p = openProgress(() => storage);
  assert.equal(p.status, 'saved');
  p.mark('start-here', true);
  assert.equal(p.has('start-here'), true);
  assert.deepEqual(openProgress(() => storage).list(), ['start-here']);
});

test('unmarking removes a page', () => {
  const storage = memoryStorage();
  const p = openProgress(() => storage);
  p.mark('a', true);
  p.mark('a', false);
  assert.equal(p.has('a'), false);
  assert.deepEqual(openProgress(() => storage).list(), []);
});

test('reset clears stored progress', () => {
  const storage = memoryStorage();
  const p = openProgress(() => storage);
  p.mark('a', true);
  p.reset();
  assert.deepEqual(p.list(), []);
  assert.equal(storage.raw.has(STORAGE_KEY), false);
});

test('storage access that throws falls back to memory and still works', () => {
  const p = openProgress(() => {
    throw new Error('SecurityError: storage disabled');
  });
  assert.equal(p.status, 'memory');
  p.mark('a', true);
  assert.equal(p.has('a'), true);
  p.reset();
  assert.deepEqual(p.list(), []);
});

test('missing storage (null) falls back to memory', () => {
  const p = openProgress(() => null);
  assert.equal(p.status, 'memory');
  p.mark('a', true);
  assert.deepEqual(p.list(), ['a']);
});

test('a failing write (quota) keeps progress in memory and reports it', () => {
  const storage = memoryStorage();
  storage.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  const p = openProgress(() => storage);
  p.mark('a', true);
  assert.equal(p.has('a'), true);
  assert.equal(p.status, 'memory');
});

test('corrupt or foreign stored data is ignored, not trusted', () => {
  for (const bad of ['not json', '{"pages":"x"}', '[1,2]', '{"version":1,"pages":[1,"ok"]}']) {
    const p = openProgress(() => memoryStorage({ [STORAGE_KEY]: bad }));
    assert.ok(Array.isArray(p.list()), bad);
    assert.ok(p.list().every((id) => typeof id === 'string'), bad);
  }
  assert.deepEqual(openProgress(() => memoryStorage({ [STORAGE_KEY]: 'not json' })).list(), []);
});

test('page ids are limited to a safe slug shape', () => {
  const p = openProgress(() => memoryStorage());
  assert.throws(() => p.mark('<script>', true), /page id/);
  assert.throws(() => p.mark('', true), /page id/);
  p.mark('modules/00-start-here', true);
  assert.equal(p.has('modules/00-start-here'), true);
});
