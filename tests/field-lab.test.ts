import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toCsv } from '../src/lib/field.ts';
import { SAMPLE_LOG } from '../src/fixtures/field.ts';

// Source-level guards for Lab D wiring; real downloads, printing and storage are browser-verified separately.
const read = (p: string) => readFileSync(p, 'utf8');

test('static CSV downloads are generated at build time by the same model (blank header and synthetic sample)', () => {
  // Endpoints prerender to dist/downloads/*.csv; they must call toCsv on the fixtures, never hand-copied text.
  assert.match(read('src/pages/downloads/field-log-blank.csv.ts'), /toCsv\(\[\]\)/);
  assert.match(read('src/pages/downloads/field-log-sample.csv.ts'), /toCsv\(SAMPLE_LOG\)/);
  assert.ok(toCsv([]).endsWith('\r\n') && toCsv(SAMPLE_LOG).split('\r\n').length === SAMPLE_LOG.length + 2);
});

test('Lab D is reachable from the sidebar, the course outline and the RF sandbox', () => {
  assert.match(read('astro.config.mjs'), /'labs\/field-planner'/);
  assert.match(read('src/content/docs/curriculum.mdx'), /\]\(\.\.\/labs\/field-planner\/\)/);
  assert.match(read('src/content/docs/labs/rf-sandbox.mdx'), /\]\(\.\.\/field-planner\/\)/);
});

test('lab page embeds the workbench, keeps citation groups short and states its limits', () => {
  const page = read('src/content/docs/labs/field-planner.mdx');
  assert.match(page, /<FieldWorkbench \/>/);
  for (const id of ['FLD-C01', 'FLD-C02', 'FLD-C03', 'FLD-C04', 'RF-C08']) assert.match(page, new RegExp(id));
  for (const [, ids] of page.matchAll(/<Cite ids="([^"]+)"/g)) assert.ok(ids.split(/\s+/).length <= 3, ids);
  for (const h of ['Setup', 'Change one thing', 'Expect', 'If you see something else']) assert.match(page, new RegExp(h));
  assert.match(page, /synthetic/i);
});

test('FLD-SPEC-02 UI guard: sensitivity rows render their unavailable reason instead of formatting null numbers', () => {
  const c = read('src/components/FieldWorkbench.astro');
  assert.doesNotMatch(c, /s\.averageCurrentMa\.toFixed|s\.runtimeHours\.toFixed/, 'no unguarded formatting of possibly-null values');
  assert.ok((c.match(/\.unavailable/g) ?? []).length >= 2, 'both static and live tables show the reason');
});

test('workbench: progressive enhancement, base-aware downloads, no unsafe or tracking APIs, print styles', () => {
  const c = read('src/components/FieldWorkbench.astro');
  assert.match(c, /data-ui hidden/);
  assert.match(c, /BASE_URL[\s\S]*downloads\/field-log-blank\.csv/);
  assert.match(c, /downloads\/field-log-sample\.csv/);
  assert.match(c, /WORKED_CAPSTONE/);
  assert.match(c, /Rubric/);
  assert.match(c, /Field checklist/);
  assert.match(c, /@media print/);
  assert.match(c, /aria-describedby/);
  assert.match(c, /class="fw-scroll" role="region" tabindex="0"/);
  for (const bad of [/innerHTML/, /geolocation/, /fetch\(/, /sendBeacon/, /<iframe/]) assert.doesNotMatch(c, bad);
});
