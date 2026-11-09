import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Source-level guard for Lab A wiring; browser behaviour is verified separately.
const read = (p: string) => readFileSync(p, 'utf8');

test('Lab A page is reachable from the sidebar, Module 01 and the course outline', () => {
  assert.match(read('astro.config.mjs'), /'labs\/rf-sandbox'/);
  const m01 = read('src/content/docs/modules/01-rf-foundations.mdx');
  assert.match(m01, /\]\(\.\.\/\.\.\/labs\/rf-sandbox\/\)/);
  assert.match(read('src/content/docs/curriculum.mdx'), /\]\(\.\.\/labs\/rf-sandbox\/\)/);
});

test('Lab A page embeds the sandbox, cites its sources and states the reference limits', () => {
  const page = read('src/content/docs/labs/rf-sandbox.mdx');
  assert.match(page, /<RfSandbox \/>/);
  for (const id of ['RF-C01', 'RF-C02', 'RF-C03', 'RF-C04', 'RF-C07', 'RF-C16']) assert.match(page, new RegExp(id));
  assert.match(page, /SF5|SF6/);
  assert.match(page, /62\.5 kHz/);
  for (const h of ['Setup', 'Change one thing', 'Expect', 'If you see something else']) assert.match(page, new RegExp(h));
});

test('sandbox has labelled native controls, error slots, reset and static worked examples', () => {
  const c = read('src/components/RfSandbox.astro');
  for (const f of ['sf', 'bandwidthKHz', 'codingRate', 'payloadBytes', 'packetCount', 'preambleSymbols', 'crc', 'lowDataRateOptimize', 'obstruction']) {
    assert.match(c, new RegExp(`id="rf-${f}"`), `control ${f}`);
    assert.match(c, new RegExp(`for="rf-${f}"`), `label for ${f}`);
  }
  // Link-budget number fields are generated from one list with a shared id/label/error template.
  for (const f of ['txPowerDbm', 'txGainDbi', 'txLossDb', 'pathLossDb', 'rxGainDbi', 'rxLossDb', 'sensitivityDbm']) {
    assert.match(c, new RegExp(`\\['${f}', '[^']+', '-?\\d+'\\]`), `link field ${f}`);
  }
  assert.match(c, /<label for=\{`rf-\$\{id\}`\}>/);
  assert.match(c, /<input id=\{`rf-\$\{id\}`\}[^>]*aria-describedby=\{`rf-\$\{id\}-error`\}/);
  assert.match(c, /aria-describedby/);
  assert.match(c, /aria-invalid/);
  assert.match(c, /data-reset/);
  assert.match(c, /RF_F01[\s\S]*RF_F02[\s\S]*RF_F03[\s\S]*RF_F04/, 'static examples render all four fixtures');
  assert.match(c, /data-ui hidden/, 'controls start hidden so no-JS readers get the static examples');
  assert.doesNotMatch(c, /innerHTML/);
});
