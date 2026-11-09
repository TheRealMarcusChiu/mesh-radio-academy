import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ID = /\b(?:MT|MC|RF|HW|REG|NTX|LW)-[A-Z0-9]+\b/g;
const ANCHOR = /<a id="([a-z0-9-]+)"><\/a>([A-Z0-9-]+)/g;

const read = (p: string) => readFileSync(p, 'utf8');
const files = (dir: string, ext: RegExp): string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && ext.test(d.name))
    .map((d) => join(d.parentPath, d.name));

function defined() {
  const ids = new Map<string, string>();
  for (const f of ['research/claims.md', 'research/sources.md']) {
    for (const [, anchor, id] of read(f).matchAll(ANCHOR)) {
      assert.equal(anchor, id.toLowerCase(), `${f}: anchor ${anchor} does not match ${id}`);
      assert.ok(!ids.has(id), `${id} is defined twice`);
      ids.set(id, f);
    }
  }
  return ids;
}

test('ledger defines each claim and source ID once, with a matching link anchor', () => {
  const ids = defined();
  assert.ok(ids.size > 80, `only ${ids.size} IDs defined`);
  for (const must of ['MT-C03', 'MT-S09', 'MC-011', 'MC-S10', 'RF-C07', 'HW-S01', 'REG-C06', 'NTX-C02']) {
    assert.ok(ids.has(must), `${must} missing`);
  }
});

test('every ID cited in lessons, reference pages, fixtures and the model exists in the ledger', () => {
  const ids = defined();
  const cited = [
    ...files('src/content/docs', /\.mdx?$/),
    ...files('src/fixtures', /\.ts$/),
    ...files('src/lib', /\.ts$/),
    ...files('src/components', /\.astro$/),
    'research/baselines.md',
    'research/claims.md',
  ];
  const missing: string[] = [];
  for (const f of cited) for (const [id] of read(f).matchAll(ID)) if (!ids.has(id)) missing.push(`${f}: ${id}`);
  assert.deepEqual(missing, []);
});

test('baselines pin full 40-character commits for both firmware tracks', () => {
  const b = read('research/baselines.md');
  assert.match(b, /54e0d8d0ab2ff56b3a9ce967e53f79e49af560fb/);
  assert.match(b, /81dbae592ffad40b4212bc0b37e82b38da08f4bc/);
  assert.match(b, /not (been )?physically tested|not physically tested/i);
});

test('code-evidence links in the ledger point at immutable commits, not moving branches', () => {
  const text = read('research/sources.md');
  const moving = [...text.matchAll(/https:\/\/github\.com\/[^\s)|]+\/(?:blob|tree)\/(main|master|develop)\b[^\s)|]*/g)].map((m) => m[0]);
  assert.deepEqual(moving, []);
});

test('lessons 00–02 declare module metadata that matches their file names', () => {
  for (const [file, mod] of [
    ['src/content/docs/modules/00-start-here.mdx', '00'],
    ['src/content/docs/modules/01-rf-foundations.mdx', '01'],
    ['src/content/docs/modules/02-hardware-first-boot.mdx', '02'],
  ]) {
    const fm = read(file).split('---')[1];
    assert.match(fm, new RegExp(`module: '${mod}'`), file);
    assert.match(fm, /reviewed: \d{4}-\d{2}-\d{2}/, file);
    assert.match(fm, /sourceIds:/, file);
  }
});
