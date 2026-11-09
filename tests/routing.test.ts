import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODEL_VERSION,
  simulate,
  metricsAt,
  createController,
  validateScenario,
  relayOrder,
  type SimEvent,
} from '../src/lib/routing.ts';
import { mtDiamond, mcKnownPath, SEEDS, FIXTURE_VERSION } from '../src/fixtures/routing.ts';

const tx = (events: SimEvent[]) => events.filter((e) => e.action === 'transmit').map((e) => e.node);
const by = (events: SimEvent[], node: string, action: SimEvent['action']) =>
  events.filter((e) => e.node === node && e.action === action);
const idx = (events: SimEvent[], pred: (e: SimEvent) => boolean) => events.findIndex(pred);

// ---------- seeds and fixtures ----------

test('fixtures are versioned and the named seeds order B and C as documented', () => {
  assert.equal(FIXTURE_VERSION, 1);
  // Engine is version 2; version-1 configs still produce version-1 traces (tests/routing-v2.test.ts).
  assert.equal(MODEL_VERSION, 2);
  assert.equal(simulate(mtDiamond(), []).modelVersion, 1);
  assert.deepEqual(relayOrder(SEEDS.bFirst, ['C', 'B']), ['B', 'C']);
  assert.deepEqual(relayOrder(SEEDS.cFirst, ['B', 'C']), ['C', 'B']);
});

// ---------- Meshtastic managed flooding (diamond) ----------

test('MT audible diamond: A and B transmit, C cancels after overhearing B, D gets one copy', () => {
  const { events } = simulate(mtDiamond(), [{ type: 'send' }]);
  assert.deepEqual(tx(events), ['A', 'B']);

  const cancel = idx(events, (e) => e.node === 'C' && e.action === 'cancel-relay');
  const heardB = idx(events, (e) => e.node === 'C' && e.action === 'duplicate' && e.from === 'B');
  assert.ok(heardB >= 0 && cancel > heardB, 'C cancels only after hearing B');
  assert.equal(by(events, 'C', 'transmit').length, 0);

  assert.equal(by(events, 'D', 'deliver').length, 1);
  const dNoRelay = by(events, 'D', 'no-relay');
  assert.equal(dNoRelay.length, 1);
  assert.match(dNoRelay[0].reason, /hop limit 0/i);
});

test('MT audible diamond metrics separate transmissions, relays, cancellations and deliveries', () => {
  const trace = simulate(mtDiamond(), [{ type: 'send' }]);
  const m = metricsAt(trace, trace.events.length);
  assert.equal(m.rfTransmissions, 2);
  assert.equal(m.originTransmissions, 1);
  assert.equal(m.relayTransmissions, 1);
  assert.equal(m.cancelledRelays, 1);
  assert.equal(m.uniqueDeliveries, 3); // B, C and D each show the broadcast once
  assert.equal(m.controlTransmissions, 0);
  assert.equal(m.retries, 0);
});

test('MT hidden variant (B–C removed): C transmits too, D still has exactly one delivery', () => {
  const { events } = simulate(mtDiamond({ bcAudible: false }), [{ type: 'send' }]);
  assert.deepEqual(tx(events), ['A', 'B', 'C']);
  assert.equal(by(events, 'C', 'cancel-relay').length, 0);
  assert.equal(by(events, 'D', 'deliver').length, 1);
  assert.ok(by(events, 'D', 'duplicate').some((e) => e.from === 'C'));
  assert.equal(events.filter((e) => /collision/i.test(e.action)).length, 0);
});

test('MT seed that orders C first makes C the relay and B the one that cancels', () => {
  const { events } = simulate(mtDiamond({ seed: SEEDS.cFirst }), [{ type: 'send' }]);
  assert.deepEqual(tx(events), ['A', 'C']);
  assert.equal(by(events, 'B', 'cancel-relay').length, 1);
});

test('MT CLIENT_MUTE on both middle nodes leaves no eligible relay, so D gets nothing', () => {
  const { events } = simulate(mtDiamond({ roles: { B: 'CLIENT_MUTE', C: 'CLIENT_MUTE' } }), [{ type: 'send' }]);
  assert.deepEqual(tx(events), ['A']);
  assert.equal(by(events, 'D', 'deliver').length, 0);
  for (const n of ['B', 'C']) assert.match(by(events, n, 'no-relay')[0].reason, /CLIENT_MUTE/);
});

test('MT one muted relay: the other CLIENT still relays to D', () => {
  const { events } = simulate(mtDiamond({ roles: { B: 'CLIENT_MUTE' } }), [{ type: 'send' }]);
  assert.deepEqual(tx(events), ['A', 'C']);
  assert.equal(by(events, 'D', 'deliver').length, 1);
});

test('MT ROUTER relays in its earlier window and never cancels on an overheard duplicate', () => {
  const routerC = simulate(mtDiamond({ roles: { C: 'ROUTER' } }), [{ type: 'send' }]).events;
  assert.deepEqual(tx(routerC), ['A', 'C']);
  assert.equal(by(routerC, 'B', 'cancel-relay').length, 1);

  const both = simulate(mtDiamond({ roles: { B: 'ROUTER', C: 'ROUTER' } }), [{ type: 'send' }]).events;
  assert.deepEqual(tx(both), ['A', 'B', 'C']);
  assert.equal(both.filter((e) => e.action === 'cancel-relay').length, 0);
  assert.ok(by(both, 'C', 'keep-relay').some((e) => e.from === 'B'));
});

test('MT broken B–D with audible B–C: C still cancels on hearing B, so D misses the broadcast', () => {
  const { events } = simulate(mtDiamond({ bdWorks: false }), [{ type: 'send' }]);
  assert.deepEqual(tx(events), ['A', 'B']);
  assert.equal(by(events, 'D', 'deliver').length, 0);
});

// ---------- MeshCore known path, failure and explicit recovery ----------

test('MC working B–D: direct DM follows [B], C does not forward, ACK returns on D’s own path', () => {
  const { events } = simulate(mcKnownPath({ bdWorks: true }), [{ type: 'send' }]);
  assert.deepEqual(tx(events), ['A', 'B', 'D', 'B']);
  assert.equal(by(events, 'C', 'transmit').length, 0);
  assert.match(by(events, 'C', 'ignore')[0].reason, /not the named next relay/i);
  assert.equal(by(events, 'D', 'deliver').length, 1);
  assert.equal(by(events, 'A', 'ack').length, 1);
  assert.equal(by(events, 'A', 'no-confirmation').length, 0);
});

test('MC broken B–D: B forwards into nothing, C does not substitute, A sees no confirmation', () => {
  const { events } = simulate(mcKnownPath(), [{ type: 'send' }]);
  assert.deepEqual(tx(events), ['A', 'B']);
  assert.equal(by(events, 'C', 'queue-relay').length, 0);
  assert.equal(by(events, 'D', 'deliver').length, 0);
  const none = by(events, 'A', 'no-confirmation');
  assert.equal(none.length, 1);
  assert.match(none[0].reason, /does not show which hop/i);
});

test('MC explicit path reset changes stored state only and transmits nothing', () => {
  const trace = simulate(mcKnownPath(), [{ type: 'reset-path', node: 'A', dest: 'D' }]);
  assert.equal(trace.events.length, 1);
  assert.equal(trace.events[0].action, 'user-reset-path');
  assert.equal(tx(trace.events).length, 0);
  assert.equal(trace.snapshots.at(-1)!.nodes.A.outPaths.D, null);
  assert.deepEqual(trace.snapshots.at(-1)!.nodes.D.outPaths.A, ['B'], 'reverse path is independent');
});

test('MC recovery: after reset, a new send floods, D receives via C, PATH+ACK teaches A [C]', () => {
  const actions = [{ type: 'send' }, { type: 'reset-path', node: 'A', dest: 'D' }, { type: 'send' }] as const;
  const trace = simulate(mcKnownPath(), [...actions]);
  const { events } = trace;
  const second = idx(events, (e) => e.action === 'user-reset-path');
  const after = events.slice(second);

  assert.equal(by(after, 'D', 'deliver').length, 1);
  const delivered = by(after, 'D', 'deliver')[0];
  assert.deepEqual(delivered.packet?.path, ['C']);
  assert.equal(delivered.packet?.route, 'flood');

  const learnA = by(after, 'A', 'learn-path');
  assert.deepEqual(learnA[0].learned, { dest: 'D', path: ['C'] });
  assert.equal(by(after, 'A', 'ack').length, 1);
  assert.ok(after.some((e) => e.action === 'transmit' && e.packet?.kind === 'path'));

  const final = trace.snapshots.at(-1)!;
  assert.deepEqual(final.nodes.A.outPaths.D, ['C']);
  assert.deepEqual(final.nodes.D.outPaths.A, ['C']);
});

test('MC after recovery the next send goes direct on [C] and is confirmed', () => {
  const trace = simulate(mcKnownPath(), [
    { type: 'send' },
    { type: 'reset-path', node: 'A', dest: 'D' },
    { type: 'send' },
    { type: 'send' },
  ]);
  const sends = trace.events.filter((e) => e.action === 'user-send');
  const last = trace.events.slice(trace.events.indexOf(sends[2]));
  assert.equal(last.find((e) => e.action === 'transmit')!.packet?.route, 'direct');
  assert.deepEqual(last.find((e) => e.action === 'transmit')!.packet?.path, ['C']);
  assert.equal(by(last, 'A', 'ack').length, 1);
  assert.equal(by(last, 'B', 'queue-relay').length, 0);
});

test('MC with C as a companion (repeat off) recovery flood has no eligible relay to D', () => {
  const { events } = simulate(mcKnownPath({ roles: { C: 'companion' } }), [
    { type: 'reset-path', node: 'A', dest: 'D' },
    { type: 'send' },
  ]);
  assert.equal(by(events, 'D', 'deliver').length, 0);
  assert.match(by(events, 'C', 'no-relay')[0].reason, /repeat is off/i);
  assert.equal(by(events, 'A', 'no-confirmation').length, 1);
});

test('MC metrics count control packets (PATH, ACK) separately from the message', () => {
  const trace = simulate(mcKnownPath({ bdWorks: true }), [{ type: 'send' }]);
  const m = metricsAt(trace, trace.events.length);
  assert.equal(m.rfTransmissions, 4);
  assert.equal(m.controlTransmissions, 2); // D's ACK and B forwarding it
  assert.equal(m.uniqueDeliveries, 1);
  assert.equal(m.confirmations, 1);
  assert.equal(m.unconfirmed, 0);
});

// ---------- event contract, determinism, validation ----------

test('every event has sequential order, an integer teaching tick, node, action, reason and claims', () => {
  for (const cfg of [mtDiamond(), mtDiamond({ bcAudible: false }), mcKnownPath()]) {
    const { events } = simulate(cfg, [{ type: 'send' }]);
    events.forEach((e, i) => {
      assert.equal(e.order, i);
      assert.ok(Number.isInteger(e.time) && e.time >= 0);
      assert.ok(e.node && e.action && e.reason.length > 10, JSON.stringify(e));
      assert.ok(e.claims.length > 0, `${e.action} at ${e.node} cites no claim`);
    });
  }
});

test('simulation is deterministic and survives a JSON round trip of the config', () => {
  const cfg = mcKnownPath();
  const actions = [{ type: 'send' as const }, { type: 'reset-path' as const, node: 'A', dest: 'D' }, { type: 'send' as const }];
  const a = simulate(cfg, actions);
  const b = simulate(JSON.parse(JSON.stringify(cfg)), JSON.parse(JSON.stringify(actions)));
  assert.deepEqual(a, b);
});

test('validateScenario rejects malformed serialized configs', () => {
  const good = mtDiamond();
  assert.doesNotThrow(() => validateScenario(good));
  const bad: unknown[] = [
    { ...good, version: 3 },
    { ...good, version: '1' },
    { ...good, links: [...good.links, { from: 'A', to: 'Z' }] },
    { ...good, nodes: [...good.nodes, good.nodes[0]] },
    { ...good, traffic: { ...good.traffic, hopLimit: 8 } },
    { ...good, traffic: { ...good.traffic, hopLimit: -1 } },
    { ...good, seed: 1.5 },
    { ...good, nodes: good.nodes.map((n) => ({ ...n, role: 'REPEATER' })) },
    { ...mcKnownPath(), outPaths: { A: { D: ['Q'] } } },
    { ...mcKnownPath(), traffic: { kind: 'dm', from: 'A', to: 'A' } },
    null,
  ];
  for (const cfg of bad) assert.throws(() => validateScenario(cfg), /scenario/i, JSON.stringify(cfg));
});

test('validateScenario enforces the frozen id, route-table and duplicate-edge contract', () => {
  const mt = mtDiamond();
  const mc = mcKnownPath();
  const { id: _omit, ...noId } = mt;
  const bad: [string, unknown][] = [
    ['missing id', noId],
    ['numeric id', { ...mt, id: 42 }],
    ['outPaths as array', { ...mc, outPaths: [] }],
    ['nested route table as array', { ...mc, outPaths: { A: [['B']], D: { A: ['B'] } } }],
    ['duplicate directed edge', { ...mt, links: [...mt.links, { from: 'A', to: 'B' }] }],
  ];
  for (const [name, cfg] of bad) assert.throws(() => validateScenario(cfg), /Invalid scenario/, name);
  // Controls: the opposite direction is a different edge, and the fixtures stay valid.
  assert.doesNotThrow(() => validateScenario(mt));
  assert.doesNotThrow(() => validateScenario(mc));
  assert.ok(mt.links.some((l) => l.from === 'B' && l.to === 'A'));
});

test('simulate refuses an unknown action instead of ignoring it', () => {
  assert.throws(() => simulate(mtDiamond(), [{ type: 'teleport' } as never]), /action/i);
  assert.throws(() => simulate(mtDiamond(), [{ type: 'reset-path', node: 'A', dest: 'D' }]), /action/i);
});

// ---------- controller ----------

test('controller: dispatch queues events, step reveals one, run reveals all, reset restores', () => {
  const c = createController(mtDiamond());
  assert.equal(c.position, 0);
  assert.equal(c.canStep(), false);
  c.dispatch({ type: 'send' });
  assert.equal(c.position, 0, 'dispatch does not auto-reveal');
  assert.ok(c.canStep());
  c.step();
  assert.equal(c.visibleEvents().length, 1);
  assert.equal(c.visibleEvents()[0].action, 'user-send');
  c.run();
  assert.equal(c.position, c.trace.events.length);
  assert.equal(c.canStep(), false);
  assert.equal(c.metrics().rfTransmissions, 2);
  c.reset();
  assert.equal(c.position, 0);
  assert.equal(c.trace.events.length, 0);
  assert.deepEqual(c.actions, []);
});

test('controller snapshot reflects state at the playhead, not the end', () => {
  const c = createController(mcKnownPath());
  c.dispatch({ type: 'reset-path', node: 'A', dest: 'D' });
  assert.deepEqual(c.snapshot().nodes.A.outPaths.D, ['B']);
  c.step();
  assert.equal(c.snapshot().nodes.A.outPaths.D, null);
});
