import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulate, metricsAt, createController, type SimEvent, type UserAction } from '../src/lib/routing.ts';
import { mtDiamond, mcKnownPath } from '../src/fixtures/routing.ts';
import { mtDm, mcFirstContact, presetScenario } from '../src/fixtures/routing-presets.ts';
import { airtime, requiresLowDataRateOptimize } from '../src/lib/rf.ts';
import { routingAirtime, DEFAULT_RF, HYPOTHETICAL_BYTES, UNKNOWN_BYTES, FRAME_KINDS, type AirtimeAssumptions, type FrameBytes } from '../src/lib/routing-airtime.ts';

const SEND: UserAction = { type: 'send' };
const bytes: FrameBytes = { text: 40, ack: 20, path: 30, advert: 110 };
const A: AirtimeAssumptions = { rf: DEFAULT_RF, bytes };
const one = (b: number, rf = DEFAULT_RF) => airtime({ ...rf, payloadBytes: b, packetCount: 1 }).packetMs;
const close = (a: number | null, b: number) => assert.ok(a !== null && Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('defaults are the accepted RF-F01 settings, and unknown sizes are the default', () => {
  assert.deepEqual(DEFAULT_RF, { sf: 7, bandwidthKHz: 125, codingRate: 1, preambleSymbols: 8, explicitHeader: true, crc: true, lowDataRateOptimize: false });
  close(one(20), 56.576); // RF-C03, computed by the accepted helper
  assert.deepEqual(UNKNOWN_BYTES, { text: null, ack: null, path: null, advert: null });
  for (const k of FRAME_KINDS) assert.equal(HYPOTHETICAL_BYTES[k], 32);
});

test('before any step the overlay is a complete zero; unknown sizes alone do not invent a cost', () => {
  const o = routingAirtime([], A);
  assert.equal(o.status, 'complete');
  assert.equal(o.totalMs, 0);
  assert.equal(o.transmissions, 0);
  assert.equal(routingAirtime([], { rf: DEFAULT_RF, bytes: UNKNOWN_BYTES }).totalMs, 0);
});

test('every playhead prefix sums exactly one accepted-helper airtime per transmit event', () => {
  for (const [cfg, actions] of [
    [mtDm(), [SEND]],
    [mtDiamond(), [SEND]],
    [mcKnownPath(), [SEND, { type: 'reset-path', node: 'A', dest: 'D' }, SEND, SEND]],
    [mcFirstContact(), [{ type: 'advert', node: 'D', scope: 'flood' }, { type: 'advert', node: 'A', scope: 'flood' }, SEND]],
  ] as const) {
    const trace = simulate(cfg, [...actions] as UserAction[]);
    for (let i = 0; i <= trace.events.length; i++) {
      const prefix = trace.events.slice(0, i);
      const o = routingAirtime(prefix, A);
      const expected = prefix.filter((e) => e.action === 'transmit').reduce((s, e) => s + one(bytes[e.packet!.kind as keyof FrameBytes]!), 0);
      close(o.totalMs, expected);
      assert.equal(o.transmissions, metricsAt(trace, i).rfTransmissions);
    }
  }
});

test('a step adds exactly the current transmission; non-transmit events add nothing', () => {
  const trace = simulate(mcKnownPath(), [SEND, { type: 'reset-path', node: 'A', dest: 'D' }, SEND]);
  for (let i = 1; i <= trace.events.length; i++) {
    const delta = routingAirtime(trace.events.slice(0, i), A).totalMs! - routingAirtime(trace.events.slice(0, i - 1), A).totalMs!;
    const e = trace.events[i - 1];
    close(delta, e.action === 'transmit' ? one(bytes[e.packet!.kind as keyof FrameBytes]!) : 0);
  }
});

test('MT audible diamond: the cancelled relay and duplicates cost nothing (2 transmissions)', () => {
  const ev = simulate(mtDiamond(), [SEND]).events;
  assert.ok(ev.some((e) => e.action === 'cancel-relay') && ev.some((e) => e.action === 'duplicate'));
  const o = routingAirtime(ev, A);
  assert.equal(o.transmissions, 2);
  close(o.totalMs, 2 * one(40));
});

test('MT DM fallback: three origin attempts (two retries) plus relays and ACK frames, split by frame type', () => {
  const ev = simulate(mtDm(), [SEND]).events;
  const o = routingAirtime(ev, A);
  const row = (k: string) => o.rows.find((r) => r.kind === k)!;
  const tx = ev.filter((e) => e.action === 'transmit');
  assert.equal(row('text').count, tx.filter((e) => e.packet!.kind === 'text').length);
  assert.equal(row('ack').count, tx.filter((e) => e.packet!.kind === 'ack').length);
  assert.equal(tx.filter((e) => e.node === 'A' && e.packet!.kind === 'text').length, 3);
  assert.equal(o.retries, 2);
  close(row('text').subtotalMs, row('text').count * one(40));
  close(o.totalMs, row('text').subtotalMs! + row('ack').subtotalMs!);
});

test('MC failure, reset and recovery: the reset costs nothing; PATH, ACK and text are separate rows', () => {
  const trace = simulate(mcKnownPath(), [SEND, { type: 'reset-path', node: 'A', dest: 'D' }, SEND, SEND]);
  const r = trace.events.findIndex((e) => e.action === 'user-reset-path');
  assert.deepEqual(routingAirtime(trace.events.slice(0, r), A).totalMs, routingAirtime(trace.events.slice(0, r + 1), A).totalMs);
  const o = routingAirtime(trace.events, A);
  assert.deepEqual(o.rows.map((x) => x.kind).sort(), ['ack', 'path', 'text']);
  assert.equal(o.transmissions, metricsAt(trace, trace.events.length).rfTransmissions);
});

test('a learner topology move costs nothing by itself', () => {
  const ev = simulate(presetScenario('mobile', 'meshcore'), [{ type: 'set-links', node: 'D', label: 'move', links: [] }]).events;
  assert.equal(ev.length, 1);
  assert.equal(routingAirtime(ev, A).totalMs, 0);
});

test('unknown sizes give a partial subtotal, never a disguised total', () => {
  const ev = simulate(mtDm(), [SEND]).events;
  const o = routingAirtime(ev, { rf: DEFAULT_RF, bytes: { ...bytes, ack: null } });
  assert.equal(o.status, 'partial');
  assert.equal(o.totalMs, null);
  const ackRow = o.rows.find((r) => r.kind === 'ack')!;
  assert.equal(ackRow.subtotalMs, null);
  assert.ok(o.unknownTransmissions === ackRow.count && ackRow.count > 0);
  close(o.knownMs, o.rows.find((r) => r.kind === 'text')!.subtotalMs!);
});

test('an unrecognized transmit category is unavailable, not zero', () => {
  const odd = { order: 0, time: 1, node: 'A', action: 'transmit', reason: 'synthetic test event', claims: ['RT-X08'] } as SimEvent;
  const o = routingAirtime([odd], A);
  assert.equal(o.status, 'partial');
  assert.equal(o.totalMs, null);
  assert.equal(o.rows[0].kind, 'unknown');
  assert.equal(o.unknownTransmissions, 1);
});

test('invalid sizes or RF settings report errors and show no total or subtotal', () => {
  const ev = simulate(mtDiamond(), [SEND]).events;
  for (const bad of [0, 256, 1.5, NaN]) {
    const o = routingAirtime(ev, { rf: DEFAULT_RF, bytes: { ...bytes, text: bad } });
    assert.equal(o.status, 'invalid', String(bad));
    assert.equal(o.totalMs, null);
    assert.equal(o.knownMs, null);
    assert.ok(o.errors.some((e) => e.field === 'bytes.text'));
  }
  const sf6 = routingAirtime(ev, { rf: { ...DEFAULT_RF, sf: 6 }, bytes });
  assert.equal(sf6.status, 'invalid');
  assert.ok(sf6.errors.some((e) => e.field === 'sf'));
  const deWrong = routingAirtime(ev, { rf: { ...DEFAULT_RF, sf: 12, lowDataRateOptimize: false }, bytes });
  assert.ok(deWrong.errors.some((e) => e.field === 'lowDataRateOptimize'));
  assert.equal(routingAirtime(ev, { rf: { ...DEFAULT_RF, sf: 12, lowDataRateOptimize: requiresLowDataRateOptimize(12, 125) }, bytes }).status, 'complete');
});

test('changing RF or sizes rescales the overlay and never touches the trace, metrics or config', () => {
  const cfg = mtDm();
  const cfgBefore = structuredClone(cfg);
  const trace = simulate(cfg, [SEND]);
  const before = structuredClone(trace);
  const m = metricsAt(trace, trace.events.length);
  const slow = { ...DEFAULT_RF, sf: 12, lowDataRateOptimize: true };
  const a = routingAirtime(trace.events, A).totalMs!;
  const b = routingAirtime(trace.events, { rf: slow, bytes }).totalMs!;
  assert.ok(b > a * 20, `SF12 ${b} vs SF7 ${a}`);
  close(b, trace.events.filter((e) => e.action === 'transmit').reduce((s, e) => s + one(bytes[e.packet!.kind as keyof FrameBytes]!, slow), 0));
  assert.deepEqual(trace, before);
  assert.deepEqual(metricsAt(trace, trace.events.length), m);
  assert.deepEqual(cfg, cfgBefore);
});

test('the controller playhead drives the overlay: 0 initially, Run equals the final trace, reset returns to 0', () => {
  const c = createController(mcKnownPath());
  assert.equal(routingAirtime(c.visibleEvents(), A).totalMs, 0);
  c.dispatch(SEND);
  c.step();
  assert.equal(routingAirtime(c.visibleEvents(), A).totalMs, 0, 'user-send is not RF');
  c.step();
  close(routingAirtime(c.visibleEvents(), A).totalMs, one(40));
  c.run();
  close(routingAirtime(c.visibleEvents(), A).totalMs, routingAirtime(c.trace.events, A).totalMs!);
  c.reset();
  assert.equal(routingAirtime(c.visibleEvents(), A).totalMs, 0);
});

test('the playground consumes the adapter with the visible events and the accepted RF helper', () => {
  const src = readFileSync('src/components/RoutingPlayground.astro', 'utf8');
  assert.match(src, /routingAirtime\(ctl\.visibleEvents\(\)/);
  assert.match(src, /requiresLowDataRateOptimize/);
  assert.match(src, /HYPOTHETICAL_BYTES/);
  assert.match(src, /routingAirtime\(w\.trace\.events, \{ rf: DEFAULT_RF, bytes: HYPOTHETICAL_BYTES \}\)/, 'static worked example uses the adapter');
  assert.match(src, /\.pg-air :global\(/, 'scoped CSS reaches dynamically built rows');
});
