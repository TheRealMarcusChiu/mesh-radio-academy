import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RF_MODEL_VERSION,
  airtime,
  validateAirtime,
  requiresLowDataRateOptimize,
  linkBudget,
  validateLinkBudget,
  OBSTRUCTION_DB,
  type AirtimeInput,
} from '../src/lib/rf.ts';
import { RF_FIXTURE_VERSION, RF_F01, RF_F02, RF_F03, RF_F04 } from '../src/fixtures/rf.ts';

const MS_TOL = 1e-6; // 1e-9 s expressed in ms
const close = (actual: number, expected: number, what: string) =>
  assert.ok(Math.abs(actual - expected) <= MS_TOL, `${what}: ${actual} vs ${expected}`);

const base: AirtimeInput = { ...RF_F01.input };
const errorsFor = (patch: Record<string, unknown>) => validateAirtime({ ...base, ...patch }).map((e) => e.field);

test('fixtures are versioned and pinned to the sourced benchmarks', () => {
  assert.equal(RF_MODEL_VERSION, 1);
  assert.equal(RF_FIXTURE_VERSION, 1);
  assert.equal(RF_F01.input.payloadBytes, 20);
  assert.equal(RF_F02.input.sf, 12);
});

test('RF-F01: SF7/125 kHz/CR4/5/20 B/explicit/CRC/8 preamble = 56.576 ms, driver 57 ms', () => {
  const r = airtime(RF_F01.input);
  assert.equal(r.bandwidthHz, 125000);
  close(r.symbolMs, 1.024, 'Ts');
  assert.equal(r.payloadSymbols, 43);
  close(r.preambleMs, 12.544, 'preamble');
  close(r.packetMs, 56.576, 'packet');
  close(r.aggregateMs, 565.76, '10 packets');
  assert.equal(r.roundedUpMs, 57);
  assert.equal(r.roundedUpMs, Math.ceil(r.packetMs));
});

test('RF-F02: SF12 with LDRO = 1318.912 ms, 10 packets 13189.12 ms, driver 1319 ms', () => {
  const r = airtime(RF_F02.input);
  close(r.symbolMs, 32.768, 'Ts');
  assert.equal(r.payloadSymbols, 28);
  close(r.packetMs, 1318.912, 'packet');
  close(r.aggregateMs, 13189.12, '10 packets');
  assert.equal(r.roundedUpMs, 1319);
});

test('bandwidth is converted to Hz and halves or doubles symbol time', () => {
  close(airtime({ ...base, bandwidthKHz: 250 }).packetMs, 28.288, 'BW250');
  const r500 = airtime({ ...base, bandwidthKHz: 500 });
  assert.equal(r500.bandwidthHz, 500000);
  close(r500.symbolMs, 0.256, 'Ts at 500 kHz');
  close(r500.packetMs, 14.144, 'BW500');
});

test('every coding rate branch 4/5..4/8 changes the payload symbol count', () => {
  const syms = [1, 2, 3, 4].map((cr) => airtime({ ...base, codingRate: cr as 1 | 2 | 3 | 4 }).payloadSymbols);
  assert.deepEqual(syms, [43, 50, 57, 64]);
  close(airtime({ ...base, codingRate: 2 }).packetMs, 63.744, 'CR4/6');
  close(airtime({ ...base, codingRate: 3 }).packetMs, 70.912, 'CR4/7');
  close(airtime({ ...base, codingRate: 4 }).packetMs, 78.08, 'CR4/8');
});

test('header and CRC switches are separate formula inputs', () => {
  assert.equal(airtime({ ...base, explicitHeader: false }).payloadSymbols, 38);
  close(airtime({ ...base, explicitHeader: false }).packetMs, 51.456, 'implicit');
  assert.equal(airtime({ ...base, crc: false }).payloadSymbols, 38);
  const both = airtime({ ...base, explicitHeader: false, crc: false });
  assert.equal(both.payloadSymbols, 33);
  close(both.packetMs, 46.336, 'implicit + no CRC');
});

test('preamble boundaries 6 and 65535 are accepted and counted with the +4.25 symbols', () => {
  close(airtime({ ...base, preambleSymbols: 6 }).packetMs, 54.528, 'preamble 6');
  close(airtime({ ...base, preambleSymbols: 65535 }).packetMs, 67156.224, 'preamble 65535');
});

test('payload 255 B at SF12/LDRO/CR4/8 and the max(…, 0) floor', () => {
  const big = airtime({ ...RF_F02.input, payloadBytes: 255, codingRate: 4 });
  assert.equal(big.payloadSymbols, 416);
  close(big.packetMs, 14032.896, '255 B');
  const tiny = airtime({ ...RF_F02.input, payloadBytes: 1, explicitHeader: false, crc: false });
  assert.equal(tiny.payloadSymbols, 8, 'negative ceil term floors at 0');
  close(tiny.packetMs, 663.552, '1 B implicit');
});

test('aggregate airtime: zero packets is zero, N identical packets is N × one packet', () => {
  assert.equal(airtime({ ...base, packetCount: 0 }).aggregateMs, 0);
  close(airtime({ ...base, packetCount: 1 }).aggregateMs, 56.576, '1 packet');
  close(airtime({ ...base, packetCount: 3 }).aggregateMs, 169.728, '3 packets');
});

test('LDRO is required exactly when symbol time exceeds 16 ms', () => {
  assert.equal(requiresLowDataRateOptimize(10, 125), false); // 8.192 ms
  assert.equal(requiresLowDataRateOptimize(11, 125), true); // 16.384 ms
  assert.equal(requiresLowDataRateOptimize(12, 125), true);
  assert.equal(requiresLowDataRateOptimize(12, 250), true); // 16.384 ms
  assert.equal(requiresLowDataRateOptimize(12, 500), false); // 8.192 ms
  assert.deepEqual(errorsFor({ sf: 12, lowDataRateOptimize: false }), ['lowDataRateOptimize']);
  assert.deepEqual(errorsFor({ sf: 7, lowDataRateOptimize: true }), ['lowDataRateOptimize']);
  assert.match(validateAirtime({ ...base, sf: 12 })[0].message, /16 ms/);
  assert.throws(() => airtime({ ...base, sf: 12 }), RangeError, 'stale DE must not produce a result');
});

test('unsupported or malformed airtime inputs are rejected, never clamped', () => {
  assert.deepEqual(validateAirtime(base), []);
  const cases: [Record<string, unknown>, string][] = [
    [{ sf: 6 }, 'sf'],
    [{ sf: 13 }, 'sf'],
    [{ sf: 7.5 }, 'sf'],
    [{ bandwidthKHz: 62.5 }, 'bandwidthKHz'],
    [{ bandwidthKHz: 125000 }, 'bandwidthKHz'],
    [{ codingRate: 0 }, 'codingRate'],
    [{ codingRate: 5 }, 'codingRate'],
    [{ payloadBytes: 0 }, 'payloadBytes'],
    [{ payloadBytes: 256 }, 'payloadBytes'],
    [{ payloadBytes: 20.5 }, 'payloadBytes'],
    [{ payloadBytes: Number.NaN }, 'payloadBytes'],
    [{ payloadBytes: '20' }, 'payloadBytes'],
    [{ preambleSymbols: 5 }, 'preambleSymbols'],
    [{ preambleSymbols: 65536 }, 'preambleSymbols'],
    [{ packetCount: -1 }, 'packetCount'],
    [{ packetCount: 1.5 }, 'packetCount'],
    [{ packetCount: Number.POSITIVE_INFINITY }, 'packetCount'],
    [{ explicitHeader: 'yes' }, 'explicitHeader'],
    [{ crc: 1 }, 'crc'],
  ];
  for (const [patch, field] of cases) {
    assert.ok(errorsFor(patch).includes(field), `${JSON.stringify(patch)} should flag ${field}`);
    assert.throws(() => airtime({ ...base, ...patch } as AirtimeInput), RangeError, JSON.stringify(patch));
  }
  assert.ok(validateAirtime(null).length > 0);
});

test('RF-F03 link budget: −99 dBm received, 21 dB margin, with each term listed', () => {
  const r = linkBudget(RF_F03);
  assert.equal(r.receivedDbm, -99);
  assert.equal(r.marginDb, 21);
  assert.equal(r.totalPathLossDb, 115);
  assert.deepEqual(r.terms.map((t) => t.db), [14, 2, -1, -115, 2, -1]);
});

test('RF-F04 obstruction adds exactly 25 dB: −124 dBm and −4 dB margin', () => {
  assert.equal(OBSTRUCTION_DB, 25);
  const r = linkBudget(RF_F04);
  assert.equal(r.totalPathLossDb, 140);
  assert.equal(r.receivedDbm, -124);
  assert.equal(r.marginDb, -4);
  assert.ok(r.terms.some((t) => t.db === -25));
});

test('link budget rejects nonfinite numbers and negative losses', () => {
  assert.deepEqual(validateLinkBudget(RF_F03), []);
  for (const [patch, field] of [
    [{ txPowerDbm: Number.NaN }, 'txPowerDbm'],
    [{ rxGainDbi: Number.POSITIVE_INFINITY }, 'rxGainDbi'],
    [{ txLossDb: -1 }, 'txLossDb'],
    [{ pathLossDb: -5 }, 'pathLossDb'],
    [{ sensitivityDbm: '−120' }, 'sensitivityDbm'],
    [{ obstruction: 'on' }, 'obstruction'],
  ] as [Record<string, unknown>, string][]) {
    assert.ok(validateLinkBudget({ ...RF_F03, ...patch }).some((e) => e.field === field), JSON.stringify(patch));
    assert.throws(() => linkBudget({ ...RF_F03, ...patch } as never), RangeError);
  }
});
