import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODEL_VERSION,
  simulate,
  metricsAt,
  validateScenario,
  deliveryHops,
  type SimEvent,
  type UserAction,
  type MeshCoreScenario,
} from '../src/lib/routing.ts';
import { mtDiamond, mcKnownPath } from '../src/fixtures/routing.ts';
import { PRESETS, bothWays, presetScenario, preset, mtDm, mcFirstContact, mcAsymmetric } from '../src/fixtures/routing-presets.ts';

const tx = (events: SimEvent[]) => events.filter((e) => e.action === 'transmit').map((e) => e.node);
const by = (events: SimEvent[], node: string, action: SimEvent['action']) => events.filter((e) => e.node === node && e.action === action);
const SEND: UserAction = { type: 'send' };

// ---------- version decision ----------

test('model version 2 keeps version-1 configs on the version-1 contract', () => {
  assert.equal(MODEL_VERSION, 2);
  assert.equal(simulate(mtDiamond(), [SEND]).modelVersion, 1);
  assert.equal(simulate(mcKnownPath(), [SEND]).modelVersion, 1);
  assert.equal(simulate(presetScenario('diamond', 'meshtastic'), [SEND]).modelVersion, 2);
});

test('version-2-only inputs are rejected under version 1 and validated under version 2', () => {
  const v1dm = { ...mtDm(), version: 1 };
  assert.throws(() => validateScenario(v1dm), /Invalid scenario/);
  assert.throws(() => validateScenario({ ...mcFirstContact(), version: 1 }), /Invalid scenario/);
  assert.throws(() => simulate(mtDiamond(), [{ type: 'set-links', node: 'D', label: 'x', links: [] }]), /action/i);
  assert.throws(() => simulate(mcKnownPath(), [{ type: 'advert', node: 'A', scope: 'flood' }]), /action/i);
  assert.throws(() => validateScenario({ ...mtDm(), nextHops: { A: { D: 'Q' } } }), /Invalid scenario/);
  assert.throws(() => validateScenario({ ...mtDm(), nextHops: { A: { D: ['B'] } } }), /Invalid scenario/);
  assert.throws(() => validateScenario({ ...mcFirstContact(), contacts: { A: ['Z'] } }), /Invalid scenario/);
  assert.throws(() => validateScenario({ ...mtDm(), traffic: { kind: 'dm', from: 'A', to: 'A', hopLimit: 3 } }), /Invalid scenario/);
  assert.throws(() => simulate(presetScenario('mobile', 'meshcore'), [{ type: 'set-links', node: 'D', label: 'x', links: [{ from: 'D', to: 'Q' }] }]), /Invalid|action/);
  assert.throws(() => simulate(presetScenario('diamond', 'meshtastic'), [{ type: 'advert', node: 'A', scope: 'flood' }]), /action/i);
  assert.throws(() => simulate(mcFirstContact(), [{ type: 'advert', node: 'A', scope: 'loud' as never }]), /action/i);
});

// ---------- presets ----------

test('every preset builds a valid, deterministic scenario for both protocols', () => {
  for (const p of PRESETS) {
    for (const protocol of ['meshtastic', 'meshcore'] as const) {
      const cfg = presetScenario(p.id, protocol);
      assert.doesNotThrow(() => validateScenario(cfg), `${p.id} ${protocol}`);
      const a = simulate(cfg, [SEND, SEND]);
      const b = simulate(JSON.parse(JSON.stringify(cfg)), [SEND, SEND]);
      assert.deepEqual(a, b);
      for (const e of a.events) assert.ok(e.claims.length > 0 && e.reason.length > 10, `${p.id} ${e.action}`);
      for (const [x, y] of p.pairs) assert.ok(p.pos[x] && p.pos[y], `${p.id} pair ${x}-${y}`);
    }
  }
});

test('two nodes: a DM is received directly with no relay, and the ACK comes straight back', () => {
  const mt = simulate(presetScenario('two-nodes', 'meshtastic', { mtTraffic: 'dm' }), [SEND]).events;
  assert.deepEqual(tx(mt), ['A', 'D']);
  assert.equal(by(mt, 'D', 'deliver').length, 1);
  assert.equal(by(mt, 'A', 'ack').length, 1);
  const mc = simulate(presetScenario('two-nodes', 'meshcore'), [SEND]).events;
  assert.deepEqual(tx(mc), ['A', 'D']);
  assert.equal(by(mc, 'A', 'ack').length, 1);
});

test('line: hop limit 0 is a constrained flood that stops at B; hop limit 1 reaches D one relay away', () => {
  const zero = simulate(presetScenario('line', 'meshtastic', { hopLimit: 0 }), [SEND]);
  assert.deepEqual(tx(zero.events), ['A']);
  assert.match(by(zero.events, 'B', 'no-relay')[0].reason, /hop limit 0/i);
  assert.equal(by(zero.events, 'D', 'deliver').length, 0);
  const one = simulate(presetScenario('line', 'meshtastic', { hopLimit: 1 }), [SEND]);
  const i = one.events.findIndex((e) => e.node === 'D' && e.action === 'deliver');
  assert.equal(deliveryHops(one, i), 1);
});

test('line: MeshCore B as a companion leaves no eligible intermediate; as a repeater it relays', () => {
  const off = simulate(presetScenario('line', 'meshcore', { roles: { B: 'companion' } }), [SEND]).events;
  assert.equal(by(off, 'D', 'deliver').length, 0);
  assert.match(by(off, 'B', 'no-relay')[0].reason, /repeat is off/);
  const on = simulate(presetScenario('line', 'meshcore'), [SEND]).events;
  assert.equal(by(on, 'D', 'deliver').length, 1);
});

test('sparse: the MeshCore flood reaches D on path [B, C], two relays away; E and F cost airtime but do not help', () => {
  const t = simulate(presetScenario('sparse', 'meshcore'), [SEND]);
  const i = t.events.findIndex((e) => e.node === 'D' && e.action === 'deliver');
  assert.deepEqual(t.events[i].packet?.path, ['B', 'C']);
  assert.equal(deliveryHops(t, i), 2);
  assert.ok(tx(t.events).includes('E'), 'E is a repeater and repeats the flood into a dead end');
  const mt1 = simulate(presetScenario('sparse', 'meshtastic', { hopLimit: 1 }), [SEND]).events;
  assert.equal(by(mt1, 'D', 'deliver').length, 0);
  const mt2 = simulate(presetScenario('sparse', 'meshtastic', { hopLimit: 2 }), [SEND]);
  const j = mt2.events.findIndex((e) => e.node === 'D' && e.action === 'deliver');
  assert.equal(deliveryHops(mt2, j), 2);
});

// ---------- Meshtastic DM next hop and fallback ----------

test('MT DM with a working preference: only B relays, C is not the named next hop, A sees implicit then explicit ACK', () => {
  const t = simulate(mtDm({ abWorks: true }), [SEND]);
  const ev = t.events;
  const first = ev.find((e) => e.action === 'transmit')!;
  assert.equal(first.packet?.nextHop, 'B');
  assert.match(by(ev, 'C', 'ignore')[0].reason, /not the named next hop/i);
  const bRelay = ev.find((e) => e.action === 'transmit' && e.node === 'B' && e.packet?.kind === 'text')!;
  assert.equal(bRelay.packet?.nextHop, 'D', 'B forwards using its own preference toward D');
  assert.equal(by(ev, 'D', 'deliver').length, 1);
  assert.equal(by(ev, 'A', 'implicit-ack').length, 1);
  assert.equal(by(ev, 'A', 'ack').length, 1);
  const m = metricsAt(t, ev.length);
  assert.equal(m.retries, 0);
  assert.equal(m.confirmations, 1);
});

test('MT DM with the preferred next hop unreachable: two attempts on B, then the final retransmission floods via C', () => {
  const t = simulate(mtDm(), [SEND]);
  const ev = t.events;
  const sends = ev.filter((e) => e.action === 'transmit' && e.node === 'A' && e.packet?.kind === 'text');
  assert.equal(sends.length, 3, 'initial send plus two retransmissions (MT-C12)');
  assert.ok(sends.every((e) => e.packet?.key === sends[0].packet?.key), 'retries keep the packet ID');
  assert.deepEqual(sends.map((e) => e.packet?.nextHop), ['B', 'B', undefined]);
  const fb = ev.findIndex((e) => e.action === 'fallback');
  assert.ok(fb >= 0 && fb < ev.indexOf(sends[2]));
  assert.ok(ev[fb].claims.includes('MT-C11'));
  const cTx = by(ev, 'C', 'transmit').filter((e) => e.packet?.kind === 'text');
  assert.equal(cTx.length, 1);
  assert.ok(ev.indexOf(cTx[0]) > ev.indexOf(sends[2]), 'C relays only the fallback copy');
  assert.equal(by(ev, 'D', 'deliver').length, 1);
  assert.equal(by(ev, 'A', 'ack').length, 1);
  assert.equal(t.snapshots.at(-1)!.nodes.A.outPaths.D, null, 'the destination preference is cleared');
  assert.equal(metricsAt(t, ev.length).retries, 2);
});

test('MT DM fallback with no eligible middle node ends in a local MAX_RETRANSMIT, not a diagnosis', () => {
  const ev = simulate(mtDm({ roles: { C: 'CLIENT_MUTE' } }), [SEND]).events;
  assert.equal(by(ev, 'D', 'deliver').length, 0);
  const none = by(ev, 'A', 'no-confirmation');
  assert.equal(none.length, 1);
  assert.match(none[0].reason, /MAX_RETRANSMIT/);
  assert.match(none[0].reason, /not.*which hop/i);
});

test('MT DM fallback constrained by hop limit 0: C hears the flood but may not relay it', () => {
  const ev = simulate(mtDm({ hopLimit: 0 }), [SEND]).events;
  assert.equal(by(ev, 'D', 'deliver').length, 0);
  assert.ok(by(ev, 'C', 'no-relay').some((e) => /hop limit 0/i.test(e.reason)));
});

test('MT DM: a relay that hears the copy but loses the onward link still gives A only an implicit ACK', () => {
  const links = bothWays([['A', 'B'], ['A', 'C'], ['C', 'D']]);
  const cfg = { ...mtDm({ abWorks: true }), links };
  const ev = simulate(cfg, [SEND]).events;
  assert.equal(by(ev, 'A', 'implicit-ack').length, 1);
  assert.equal(by(ev, 'A', 'ack').length, 0);
  assert.equal(by(ev, 'A', 'transmit').length, 1, 'the implicit ACK stops A’s own retries');
  assert.match(by(ev, 'A', 'no-confirmation')[0].reason, /implicit/i);
});

test('MT broadcast and DM differ: the broadcast is shown at every node, the DM only at its destination', () => {
  const bc = simulate(presetScenario('diamond', 'meshtastic', { hopLimit: 3 }), [SEND]).events;
  const dm = simulate(mtDm({ abWorks: true }), [SEND]).events;
  assert.ok(by(bc, 'B', 'deliver').length === 1 && by(bc, 'C', 'deliver').length === 1);
  assert.deepEqual(dm.filter((e) => e.action === 'deliver').map((e) => e.node), ['D']);
});

// ---------- MeshCore first contact, adverts, asymmetric return ----------

test('MC first contact: the client refuses to send to an unknown contact and nothing is transmitted', () => {
  const ev = simulate(mcFirstContact(), [SEND]).events;
  assert.equal(by(ev, 'A', 'no-contact').length, 1);
  assert.equal(tx(ev).length, 0);
});

test('MC zero-hop advert reaches only direct neighbours; a flooded advert crosses repeaters; neither sets a path', () => {
  const zero = simulate(mcFirstContact(), [{ type: 'advert', node: 'A', scope: 'zero-hop' }]);
  assert.deepEqual(zero.events.filter((e) => e.action === 'discover').map((e) => e.node).sort(), ['B', 'C']);
  assert.ok(by(zero.events, 'B', 'no-relay').some((e) => /zero-hop/i.test(e.reason)));
  assert.equal(tx(zero.events).length, 1);

  const flood = simulate(mcFirstContact(), [{ type: 'advert', node: 'D', scope: 'flood' }]);
  const aSaw = by(flood.events, 'A', 'discover');
  assert.equal(aSaw.length, 1);
  assert.deepEqual(aSaw[0].learned, { dest: 'D', path: null });
  const end = flood.snapshots.at(-1)!;
  assert.deepEqual(end.nodes.A.contacts, ['D']);
  assert.equal(end.nodes.A.outPaths.D ?? null, null, 'hearing an advert does not create a DM path (MC-007)');
});

test('MC first contact: flooded adverts both ways, then a flooded DM teaches both paths, then the next DM goes direct', () => {
  const actions: UserAction[] = [
    { type: 'advert', node: 'D', scope: 'flood' },
    { type: 'advert', node: 'A', scope: 'flood' },
    SEND,
    SEND,
  ];
  const t = simulate(mcFirstContact(), actions);
  const sends = t.events.filter((e) => e.action === 'user-send');
  const firstDm = t.events.slice(t.events.indexOf(sends[0]), t.events.indexOf(sends[1]));
  assert.equal(firstDm.find((e) => e.action === 'transmit')!.packet?.route, 'flood');
  assert.equal(by(firstDm, 'A', 'learn-path').length, 1);
  assert.equal(by(firstDm, 'D', 'learn-path').length, 1);
  assert.equal(by(firstDm, 'A', 'ack').length, 1);
  const second = t.events.slice(t.events.indexOf(sends[1]));
  assert.equal(second.find((e) => e.action === 'transmit')!.packet?.route, 'direct');
  assert.equal(by(second, 'A', 'ack').length, 1);
});

test('MC one-way advert: D can be addressed, but D cannot decrypt a sender it has no contact for', () => {
  const ev = simulate(mcFirstContact(), [{ type: 'advert', node: 'D', scope: 'flood' }, SEND]).events;
  assert.ok(by(ev, 'D', 'ignore').some((e) => /no contact/i.test(e.reason)));
  assert.equal(by(ev, 'D', 'deliver').length, 0);
  assert.equal(by(ev, 'A', 'no-confirmation').length, 1);
});

test('MC asymmetric return: D shows the message while A only knows no ACK arrived', () => {
  const t = simulate(mcAsymmetric(), [SEND]);
  assert.equal(by(t.events, 'D', 'deliver').length, 1);
  assert.equal(by(t.events, 'A', 'ack').length, 0);
  const none = by(t.events, 'A', 'no-confirmation');
  assert.equal(none.length, 1);
  assert.match(none[0].reason, /whether D received it/);
  assert.deepEqual(t.snapshots.at(-1)!.nodes.D.delivered, ['m1']);
});

// ---------- mobile: controlled topology change ----------

test('mobile: moving D is one explicit event with no transmission; the old path then fails until reset and reflood', () => {
  const p = preset('mobile');
  const move: UserAction = { type: 'set-links', node: 'D', label: p.move!.label, links: bothWays(p.move!.on) };
  const t = simulate(presetScenario('mobile', 'meshcore'), [SEND, move, SEND, { type: 'reset-path', node: 'A', dest: 'D' }, SEND]);
  const moved = t.events.filter((e) => e.action === 'user-set-links');
  assert.equal(moved.length, 1);
  const i = t.events.indexOf(moved[0]);
  assert.notEqual(t.events[i + 1]?.action, 'transmit');
  assert.match(moved[0].reason, /not a prediction/i);
  const sends = t.events.filter((e) => e.action === 'user-send');
  const s1 = t.events.slice(t.events.indexOf(sends[0]), i);
  const s2 = t.events.slice(t.events.indexOf(sends[1]), t.events.indexOf(sends[2]));
  const s3 = t.events.slice(t.events.indexOf(sends[2]));
  assert.equal(by(s1, 'A', 'ack').length, 1);
  assert.equal(by(s2, 'D', 'deliver').length, 0);
  assert.equal(by(s3, 'A', 'learn-path')[0].learned?.path?.join(), 'C');
});

test('mobile: Meshtastic simply re-floods the broadcast after the move', () => {
  const p = preset('mobile');
  const move: UserAction = { type: 'set-links', node: 'D', label: p.move!.label, links: bothWays(p.move!.on) };
  const ev = simulate(presetScenario('mobile', 'meshtastic'), [SEND, move, SEND]).events;
  const delivered = by(ev, 'D', 'deliver').map((e) => e.from);
  assert.deepEqual(delivered, ['B', 'C']);
});

test('deliveryHops counts relays for direct MeshCore packets too', () => {
  const cfg: MeshCoreScenario = presetScenario('sparse', 'meshcore', { mcPath: ['B', 'C'] }) as MeshCoreScenario;
  const t = simulate(cfg, [SEND]);
  const i = t.events.findIndex((e) => e.node === 'D' && e.action === 'deliver');
  assert.equal(t.events[i].packet?.route, 'direct');
  assert.equal(deliveryHops(t, i), 2);
});
