import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRESETS, VIEWBOX, LABEL_DY, labelY } from '../src/fixtures/routing-presets.ts';

// Source/layout guard, not a browser test: computes conservative text boxes for every
// preset graph's role and status labels and checks they sit inside the SVG viewBox
// (Q-SLICE-01, extended to all presets). The component must draw with these constants.
const src = readFileSync('src/components/RoutingPlayground.astro', 'utf8');
const fontPx = (cls: string) => +src.match(new RegExp(`\\.${cls} \\{\\s*font-size: (\\d+)px`))![1];

test('the playground draws every preset with the shared viewBox and label offsets', () => {
  assert.match(src, /viewBox=\{VIEWBOX\.join\(' '\)\}/);
  assert.match(src, /labelY\(p, id, 'role'\)/);
  assert.match(src, /labelY\(p, id, 'status'\)/);
  assert.deepEqual(VIEWBOX, [0, -20, 400, 304], 'diamond padding from Q-SLICE-01 kept');
  assert.deepEqual(LABEL_DY, { role: { above: -30, below: 40 }, status: { above: -44, below: 54 } });
});

test('role and status labels of every preset fit inside the SVG viewBox', () => {
  const [vx, vy, vw, vh] = VIEWBOX;
  for (const p of PRESETS) {
    for (const cls of ['role', 'status'] as const) {
      const size = fontPx(`node-${cls}`);
      for (const [id, [x]] of Object.entries(p.pos)) {
        const base = labelY(p, id, cls);
        // Conservative glyph box: full font size above the baseline, 30% below.
        assert.ok(base - size >= vy, `${p.id} ${id} ${cls} top above viewBox`);
        assert.ok(base + size * 0.3 <= vy + vh, `${p.id} ${id} ${cls} bottom below viewBox`);
        // Widest status ("learned path", "ACK matched", "implicit ACK") must not run off the sides.
        const halfWidth = (size * 0.6 * 12) / 2;
        assert.ok(x - halfWidth >= vx && x + halfWidth <= vx + vw, `${p.id} ${id} ${cls} overflows horizontally`);
      }
    }
  }
});

test('diamond keeps C’s labels below and the others above, as accepted in Q-SLICE-01', () => {
  const d = PRESETS.find((p) => p.id === 'diamond')!;
  assert.equal(labelY(d, 'C', 'role'), 214 + 40);
  assert.equal(labelY(d, 'B', 'status'), 46 - 44);
});
