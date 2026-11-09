import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// Astro's own compiler (installed with astro): the same CSS transform the build ships.
import { transform } from '@astrojs/compiler-rs';

// Lab D quality finding Q01: elements created with createElement/createElementNS never get Astro's scope class,
// so any rule that still requires it silently misses the live schematic, planner controls,
// log action cells and print rules. This checks the compiled CSS, not a browser rendering.
const FILE = 'src/components/FieldWorkbench.astro';
const source = readFileSync(FILE, 'utf8');
const { css } = transform(source, { filename: FILE });
const compiled = css.join('\n');

/** Every selector in the compiled CSS, with @media wrappers removed. */
const selectors = [...compiled.matchAll(/([^{}]+)\{/g)]
  .map((m) => m[1].trim())
  .filter((s) => s && !s.startsWith('@'))
  .flatMap((s) => s.split(',').map((x) => x.trim()));

test('workbench CSS reaches dynamically created elements (no scope marker required)', () => {
  assert.ok(selectors.length > 40, `parsed ${selectors.length} selectors`);
  const scoped = selectors.filter((s) => /astro-|data-astro-cid/.test(s));
  assert.deepEqual(scoped, [], 'rules still bound to the generated scope class');
});

test('every workbench rule is anchored to the .fw root so nothing leaks to other pages', () => {
  const unanchored = selectors.filter((s) => !/^\.fw( |$)/.test(s));
  assert.deepEqual(unanchored, []);
});

test('rules exist for every class the live script generates', () => {
  const has = (re: RegExp) => selectors.some((s) => re.test(s));
  // Classes the script assigns at runtime (live schematic, planner, log).
  for (const cls of ['ln', 'ln-partly-obstructed', 'ln-obstructed', 'ln-unknown', 'nd', 'nd-relay', 'nd-endpoint-that-relays', 'nd-id', 'nd-role', 'fw-field', 'fw-fieldset', 'fw-error']) {
    assert.ok(source.includes(`'${cls}`) || source.includes(` ${cls}`) || source.includes(`class: '${cls}`) || source.includes(`nd-\${`) || source.includes(`ln-\${`), `${cls} is generated`);
    assert.ok(has(new RegExp(`^\\.fw\\b.*\\.${cls}(?![\\w-])`)) || has(new RegExp(`^\\.${cls}(?![\\w-])`)), `rule for .${cls}`);
  }
  // Dynamic controls get the roomy sizing; dynamic action cells and buttons hide in print.
  assert.ok(has(/^\.fw input\[type=['"]?text['"]?\]$/));
  assert.ok(has(/^\.fw select$/));
  assert.ok(has(/^\.fw \[aria-invalid=['"]?true['"]?\]$/));
  const print = compiled.slice(compiled.indexOf('@media print'));
  assert.match(print, /\.fw \.fw-noprint/);
  assert.match(print, /\.fw \.btn/);
});
