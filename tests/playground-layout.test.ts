import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Source/layout guard, not a browser test: computes conservative text boxes for the
// graph's role and status labels from the component's own coordinates and checks
// they sit inside the SVG viewBox (Q-SLICE-01).
const src = readFileSync('src/components/RoutingPlayground.astro', 'utf8');

test('routing graph role and status labels fit inside the SVG viewBox', () => {
  const [vx, vy, vw, vh] = src.match(/<svg viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)" class="pg-graph"/)!.slice(1).map(Number);
  const pos = Object.fromEntries(
    [...src.match(/const pos[^=]*= \{([^}]*)\}/)![1].matchAll(/([A-D]): \[(\d+), (\d+)\]/g)].map((m) => [m[1], [+m[2], +m[3]]]),
  );
  assert.deepEqual(Object.keys(pos).sort(), ['A', 'B', 'C', 'D']);

  const label = (cls: string) => {
    const m = src.match(new RegExp(`y=\\{y \\+ \\(id === 'C' \\? (-?\\d+) : (-?\\d+)\\)\\} text-anchor="middle" class="${cls}"`))!;
    return { c: +m[1], other: +m[2] };
  };
  const fontPx = (cls: string) => +src.match(new RegExp(`\\.${cls} \\{\\s*font-size: (\\d+)px`))![1];

  for (const cls of ['node-role', 'node-status']) {
    const off = label(cls);
    const size = fontPx(cls);
    for (const [id, [x, y]] of Object.entries(pos) as [string, [number, number]][]) {
      const base = y + (id === 'C' ? off.c : off.other);
      // Conservative glyph box: full font size above the baseline, 30% below.
      const top = base - size;
      const bottom = base + size * 0.3;
      assert.ok(top >= vy, `${id} ${cls} top ${top} above viewBox ${vy}`);
      assert.ok(bottom <= vy + vh, `${id} ${cls} bottom ${bottom} below viewBox ${vy + vh}`);
      // Widest status ("learned path", "ACK matched") must not run off the sides either.
      const halfWidth = (size * 0.6 * 12) / 2;
      assert.ok(x - halfWidth >= vx && x + halfWidth <= vx + vw, `${id} ${cls} overflows horizontally`);
    }
  }
});
