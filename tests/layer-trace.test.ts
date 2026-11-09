import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, initialStep, step, run, reset, visibleStages } from '../src/lib/layer-trace.ts';

test('trace follows phone → BLE → radio A → RF → radio B → app in order', () => {
  assert.deepEqual(
    STAGES.map((s) => s.id),
    ['compose', 'ble-up', 'radio-a', 'rf', 'radio-b', 'ble-down', 'deliver'],
  );
});

test('every stage names a layer, a place and a plain explanation', () => {
  for (const s of STAGES) {
    assert.ok(s.layer.length > 0, s.id);
    assert.ok(s.where.length > 0, s.id);
    assert.ok(s.explain.length > 20, s.id);
  }
});

test('no stage in the teaching model depends on internet or cellular service', () => {
  assert.equal(STAGES.filter((s) => s.needsInternet).length, 0);
});

test('starts with nothing sent', () => {
  assert.equal(initialStep, 0);
  assert.deepEqual(visibleStages(initialStep), []);
});

test('step advances one stage at a time', () => {
  const one = step(initialStep);
  assert.equal(one, 1);
  assert.deepEqual(visibleStages(one).map((s) => s.id), ['compose']);
  assert.equal(step(step(one)), 3);
});

test('step stops at the final stage instead of overflowing', () => {
  let n = initialStep;
  for (let i = 0; i < STAGES.length + 5; i++) n = step(n);
  assert.equal(n, STAGES.length);
});

test('run reaches delivery from any point', () => {
  assert.equal(run(initialStep), STAGES.length);
  assert.equal(run(3), STAGES.length);
  assert.equal(visibleStages(run(0)).at(-1)?.id, 'deliver');
});

test('reset returns to the starting state and replays identically', () => {
  const first = visibleStages(run(initialStep));
  const again = visibleStages(run(reset()));
  assert.equal(reset(), initialStep);
  assert.deepEqual(again, first);
});

test('out-of-range or non-integer positions are clamped, not trusted', () => {
  assert.equal(step(-4), 1);
  assert.equal(step(Number.NaN), 1);
  assert.equal(visibleStages(99).length, STAGES.length);
  assert.equal(visibleStages(2.7).length, 2);
});
