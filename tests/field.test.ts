import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FIELD_MODEL_VERSION,
  FIELD_STORAGE_KEY,
  LOG_HEADERS,
  batteryRuntime,
  validateBattery,
  dutyFromTraffic,
  sensitivity,
  pdr,
  receiptsToPdr,
  formatPdr,
  validateRow,
  missingFields,
  compareDirections,
  toCsv,
  csvField,
  validateCapstone,
  validatePlanner,
  suggestPath,
  describePlanner,
  validateWorkspace,
  openFieldStore,
  exportReport,
  channelShare,
  type LogRow,
} from '../src/lib/field.ts';
import {
  FIELD_FIXTURE_VERSION,
  FIELD_F01_BATTERY,
  FIELD_F02_TRAFFIC,
  FIELD_BATTERY_CORE,
  SAMPLE_LOG,
  SAMPLE_SCHEDULED_IDS,
  SAMPLE_RECEIVED_IDS,
  SAMPLE_PLANNER,
  WORKED_CAPSTONE,
  SAMPLE_WORKSPACE,
} from '../src/fixtures/field.ts';
import { RF_F01 } from '../src/fixtures/rf.ts';

const close = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

// ---------- battery ----------

test('versions are pinned', () => {
  assert.equal(FIELD_MODEL_VERSION, 1);
  assert.equal(FIELD_FIXTURE_VERSION, 1);
  assert.equal(FIELD_STORAGE_KEY, 'mesh-radio-academy:field-lab:v1');
});

test('FIELD-F01 synthetic battery: 15.901 mA average, 90.5603421 h with 90% conversion efficiency', () => {
  const r = batteryRuntime(FIELD_F01_BATTERY);
  close(r.averageCurrentMa, 15.901, 1e-9, 'average current');
  close(r.usableEnergyWh, 5.92, 1e-9, 'usable energy');
  close(r.runtimeHours, 90.5603421, 1e-6, 'runtime');
  close(r.runtimeDays, 90.5603421 / 24, 1e-6, 'days');
  close(r.contributionsMa.tx + r.contributionsMa.rx + r.contributionsMa.sleep + r.contributionsMa.gps, 15.901, 1e-9, 'sum');
});

test('a different load-rail voltage converts through energy, not raw mAh ÷ mA', () => {
  const r = batteryRuntime({ ...FIELD_F01_BATTERY, loadVoltage: 3.3 });
  // 2000 mAh × 3.7 V × 0.8 × 0.9 / (15.901 mA × 3.3 V)
  close(r.runtimeHours, (2 * 3.7 * 0.8 * 0.9) / (0.015901 * 3.3), 1e-9, '3.3 V rail');
  assert.ok(r.runtimeHours > batteryRuntime(FIELD_F01_BATTERY).runtimeHours);
});

test('GPS is an incremental overlay and cold derating scales usable energy', () => {
  const gps = batteryRuntime({ ...FIELD_F01_BATTERY, gpsCurrentMa: 30, gpsDutyFraction: 0.1 });
  close(gps.averageCurrentMa, 15.901 + 3, 1e-9, 'gps');
  const cold = batteryRuntime({ ...FIELD_F01_BATTERY, coldDerating: 0.2 });
  close(cold.runtimeHours, 90.5603421 * 0.8, 1e-6, 'cold');
});

test('battery validation rejects malformed inputs without clamping', () => {
  assert.deepEqual(validateBattery(FIELD_F01_BATTERY), []);
  const bad: [Record<string, unknown>, string][] = [
    [{ capacityMah: 0 }, 'capacityMah'],
    [{ capacityMah: Number.NaN }, 'capacityMah'],
    [{ batteryVoltage: -3.7 }, 'batteryVoltage'],
    [{ loadVoltage: 0 }, 'loadVoltage'],
    [{ usableFraction: 0 }, 'usableFraction'],
    [{ usableFraction: 1.2 }, 'usableFraction'],
    [{ converterEfficiency: 0 }, 'converterEfficiency'],
    [{ converterEfficiency: 1.01 }, 'converterEfficiency'],
    [{ coldDerating: 1 }, 'coldDerating'],
    [{ coldDerating: -0.1 }, 'coldDerating'],
    [{ txCurrentMa: -1 }, 'txCurrentMa'],
    [{ rxCurrentMa: Number.POSITIVE_INFINITY }, 'rxCurrentMa'],
    [{ gpsDutyFraction: 1.5 }, 'gpsDutyFraction'],
    [{ duty: { tx: 0.5, rx: 0.6, sleep: 0 } }, 'duty'],
    [{ duty: { tx: -0.1, rx: 1.1, sleep: 0 } }, 'duty'],
    [{ txCurrentMa: 0, rxCurrentMa: 0, sleepCurrentMa: 0, gpsCurrentMa: 0 }, 'averageCurrentMa'],
  ];
  for (const [patch, field] of bad) {
    assert.ok(validateBattery({ ...FIELD_F01_BATTERY, ...patch }).some((e) => e.field === field), JSON.stringify(patch));
    assert.throws(() => batteryRuntime({ ...FIELD_F01_BATTERY, ...patch } as never), RangeError);
  }
});

test('traffic duty uses Lab A airtime and never counts transmit time twice', () => {
  const d = dutyFromTraffic(FIELD_F02_TRAFFIC);
  close(d.packetMs, 56.576, 1e-9, 'airtime from Lab A');
  close(d.tx, (60 * 56.576) / 3_600_000, 1e-15, 'tx fraction');
  close(d.tx + d.rx + d.sleep, 1, 1e-12, 'fractions sum to 1');
  assert.equal(d.sleep, 0);
  const r = batteryRuntime({ ...FIELD_BATTERY_CORE, duty: d });
  close(r.averageCurrentMa, 15 + d.tx * (120 - 15), 1e-9, 'tx replaces listening time');
  assert.ok(r.averageCurrentMa < d.tx * 120 + 15, 'not full RX on top of TX');
});

test('zero traffic gives zero transmit time; over-100% airtime is refused', () => {
  const zero = dutyFromTraffic({ ...FIELD_F02_TRAFFIC, packetsPerHour: 0 });
  assert.equal(zero.tx, 0);
  assert.equal(zero.rx, 1);
  const half = dutyFromTraffic({ ...FIELD_F02_TRAFFIC, listeningShare: 0.25 });
  close(half.rx / (half.rx + half.sleep), 0.25, 1e-12, 'listening share of idle time');
  assert.throws(() => dutyFromTraffic({ ...FIELD_F02_TRAFFIC, packetsPerHour: 100_000 }), /100%/);
  assert.throws(() => dutyFromTraffic({ ...FIELD_F02_TRAFFIC, packetsPerHour: -1 }), RangeError);
  assert.throws(() => dutyFromTraffic({ ...FIELD_F02_TRAFFIC, packetsPerHour: 1.5 }), RangeError);
  assert.throws(() => dutyFromTraffic({ ...FIELD_F02_TRAFFIC, listeningShare: 2 }), RangeError);
  assert.throws(() => dutyFromTraffic({ ...FIELD_F02_TRAFFIC, airtime: { ...RF_F01.input, sf: 12 } }), RangeError, 'RF validation reused');
});

test('sensitivity changes one assumption at a time from the same base', () => {
  const rows = sensitivity(FIELD_BATTERY_CORE, FIELD_F02_TRAFFIC);
  const base = rows[0];
  assert.match(base.label, /base/i);
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.runtimeHours]));
  assert.ok(byKey.rx < base.runtimeHours, 'higher receive current shortens runtime');
  assert.ok(byKey.gps < base.runtimeHours);
  assert.ok(byKey.traffic < base.runtimeHours);
  close(byKey.cold, base.runtimeHours * 0.8, 1e-9, 'assumed 20% cold derating');
  for (const r of rows.slice(1)) assert.match(r.label, /assumed|synthetic/i);
});

test('channel share for a test cadence follows from airtime and spacing', () => {
  close(channelShare(56.576, 30), 56.576 / 30000, 1e-15, 'share');
  assert.throws(() => channelShare(56.576, 0), RangeError);
  assert.throws(() => channelShare(Number.NaN, 30), RangeError);
});

// ---------- PDR ----------

test('17 unique of 20 scheduled is 85% with n = 20; attempts are reported separately', () => {
  const r = pdr(20, 17, 23);
  assert.equal(r.ratio, 0.85);
  assert.equal(r.scheduled, 20);
  assert.equal(r.attempts, 23);
  assert.equal(formatPdr(r), '85% (17 of 20 scheduled; 23 on-air attempts)');
});

test('receipt IDs are de-duplicated and unknown IDs are flagged, never counted', () => {
  const r = receiptsToPdr(SAMPLE_SCHEDULED_IDS, SAMPLE_RECEIVED_IDS, 23);
  assert.equal(r.scheduled, 20);
  assert.equal(r.uniqueReceived, 17);
  assert.equal(r.duplicates, 2);
  assert.deepEqual(r.unknownIds, []);
  assert.equal(r.ratio, 0.85);
  const odd = receiptsToPdr(['m1', 'm2'], ['m1', 'zz'], null);
  assert.equal(odd.uniqueReceived, 1);
  assert.deepEqual(odd.unknownIds, ['zz']);
  assert.throws(() => receiptsToPdr(['m1', 'm1'], [], null), /scheduled/i);
});

test('zero sample has no PDR; impossible or malformed counts are refused', () => {
  const none = pdr(0, 0, null);
  assert.equal(none.ratio, undefined);
  assert.match(formatPdr(none), /no sample/i);
  assert.throws(() => pdr(20, 21, null), /more than/i);
  assert.throws(() => pdr(20.5, 10, null), RangeError);
  assert.throws(() => pdr(Number.NaN, 0, null), RangeError);
  assert.throws(() => pdr(10, -1, null), RangeError);
  assert.throws(() => pdr(10, 5, 2.5), RangeError);
});

// ---------- field log ----------

test('sample log: forward 85% (n=20) and reverse 70% (n=20) under different conditions; missing row flagged, not zeroed', () => {
  const c = compareDirections(SAMPLE_LOG);
  assert.equal(c.forward.scheduled, 20);
  assert.equal(c.forward.uniqueReceived, 17);
  assert.equal(c.forward.attempts, 23);
  assert.equal(c.forward.ratio, 0.85);
  assert.equal(c.reverse.scheduled, 20);
  assert.equal(c.reverse.uniqueReceived, 14);
  assert.equal(c.reverse.ratio, 0.7);
  assert.deepEqual(c.reverse.excluded, ['R2']);
  assert.notEqual(SAMPLE_LOG.find((r) => r.testId === 'F1')!.notes, SAMPLE_LOG.find((r) => r.testId === 'R1')!.notes);
  assert.ok(missingFields(SAMPLE_LOG.find((r) => r.testId === 'R2')!).includes('receiveCount'));
});

test('direction with no usable rows reports no sample instead of 0%', () => {
  const c = compareDirections(SAMPLE_LOG.filter((r) => r.direction === 'forward'));
  assert.equal(c.reverse.scheduled, 0);
  assert.equal(c.reverse.ratio, undefined);
});

test('row validation: whole counts, received ≤ sent, finite readings', () => {
  const ok = SAMPLE_LOG[0];
  assert.deepEqual(validateRow(ok), []);
  const fields = (patch: Partial<LogRow>) => validateRow({ ...ok, ...patch }).map((e) => e.field);
  assert.ok(fields({ receiveCount: 21 }).includes('receiveCount'));
  assert.ok(fields({ sendCount: 2.5 }).includes('sendCount'));
  assert.ok(fields({ attempts: -1 }).includes('attempts'));
  assert.ok(fields({ rssiDbm: Number.NaN }).includes('rssiDbm'));
  assert.ok(fields({ latencyMs: -5 }).includes('latencyMs'));
  assert.ok(fields({ direction: 'sideways' as never }).includes('direction'));
  assert.deepEqual(fields({ rssiDbm: null, snrDb: null }), [], 'missing readings are allowed, just flagged');
});

// ---------- CSV ----------

test('CSV header has the required columns and uses CRLF', () => {
  for (const h of ['test_id', 'time', 'firmware', 'board', 'modem_settings', 'role', 'antenna', 'location_label', 'obstruction', 'send_count', 'receive_count', 'rssi_dbm', 'snr_db', 'latency_ms', 'route_observation', 'notes'])
    assert.ok(LOG_HEADERS.includes(h), h);
  assert.equal(toCsv([]), LOG_HEADERS.join(',') + '\r\n');
});

test('CSV quotes commas, quotes and newlines, and neutralizes formula starters in text only', () => {
  assert.equal(csvField('a,b'), '"a,b"');
  assert.equal(csvField('say "hi"'), '"say ""hi"""');
  assert.equal(csvField('line1\nline2'), '"line1\nline2"');
  for (const s of ['=1+1', '+1', '-2', '@SUM(A1)', '\tx', '\rx', '＝1']) assert.ok(csvField(s).startsWith(`"'`), s);
  assert.equal(csvField('plain'), 'plain');
  const csv = toCsv([{ ...SAMPLE_LOG[0], notes: '=HYPERLINK("x")', rssiDbm: -101 }]);
  const line = csv.split('\r\n')[1];
  assert.match(line, /,-101,/, 'numeric negatives stay numeric');
  assert.match(line, /"'=HYPERLINK\(""x""\)"/);
  assert.match(toCsv([{ ...SAMPLE_LOG[0], rssiDbm: null }]).split('\r\n')[1], /,,/, 'missing stays empty, not 0');
});

// ---------- planner ----------

test('planner accepts 3–5 nodes and rejects malformed configs', () => {
  assert.deepEqual(validatePlanner(SAMPLE_PLANNER), []);
  const nodes = SAMPLE_PLANNER.nodes;
  assert.ok(validatePlanner({ ...SAMPLE_PLANNER, nodes: nodes.slice(0, 2) }).length > 0);
  assert.ok(validatePlanner({ ...SAMPLE_PLANNER, links: [...SAMPLE_PLANNER.links, { a: 'A', b: 'Z', assumption: 'clear', note: '' }] }).length > 0);
  assert.ok(validatePlanner({ ...SAMPLE_PLANNER, links: [...SAMPLE_PLANNER.links, SAMPLE_PLANNER.links[0]] }).length > 0, 'duplicate link');
  assert.ok(validatePlanner({ ...SAMPLE_PLANNER, nodes: nodes.map((n, i) => (i ? n : { ...n, heightM: -3 })) }).length > 0);
  assert.ok(validatePlanner({ ...SAMPLE_PLANNER, nodes: nodes.map((n, i) => (i ? n : { ...n, role: 'gateway' as never })) }).length > 0);
});

test('suggested path uses fewest assumed-usable links and skips links assumed obstructed', () => {
  assert.deepEqual(suggestPath(SAMPLE_PLANNER, 'A', 'D'), ['A', 'B', 'D']);
  const blocked = { ...SAMPLE_PLANNER, links: SAMPLE_PLANNER.links.map((l) => (l.a === 'B' && l.b === 'D' ? { ...l, assumption: 'obstructed' as const } : l)) };
  assert.deepEqual(suggestPath(blocked, 'A', 'D'), ['A', 'C', 'D']);
  assert.equal(suggestPath({ ...SAMPLE_PLANNER, links: [] }, 'A', 'D'), null);
  assert.ok(describePlanner(SAMPLE_PLANNER).some((l) => /B .*relay/i.test(l)));
});

// ---------- capstone ----------

test('worked capstone is complete; each required part is refused when missing', () => {
  assert.deepEqual(validateCapstone(WORKED_CAPSTONE), []);
  for (const f of ['topologySketch', 'predictedPath', 'results', 'testConditions', 'failure', 'adjustment', 'retest', 'maintenancePlan', 'complianceNotes'] as const) {
    assert.ok(validateCapstone({ ...WORKED_CAPSTONE, [f]: '  ' }).some((e) => e.field === f), f);
  }
  assert.ok(validateCapstone({ ...WORKED_CAPSTONE, resultsKind: '' }).some((e) => e.field === 'resultsKind'));
  assert.ok(validateCapstone({ ...WORKED_CAPSTONE, privacyChecks: { ...WORKED_CAPSTONE.privacyChecks, rulesChecked: false } }).some((e) => e.field === 'privacyChecks'));
});

test('export: final only when valid, draft clearly marked, JSON round-trips with schema info', () => {
  const ok = exportReport(SAMPLE_WORKSPACE, '2026-11-09T00:00:00Z');
  assert.equal(ok.status, 'final');
  assert.equal(ok.filename, 'capstone-report-final.json');
  const parsed = JSON.parse(ok.json);
  assert.equal(parsed.format, 'mesh-radio-academy-capstone');
  assert.equal(parsed.version, 1);
  assert.equal(parsed.log.comparison.forward.ratio, 0.85);
  assert.match(ok.text, /FINAL/);
  assert.match(ok.text, /Results are simulated/i);
  const draft = exportReport({ ...SAMPLE_WORKSPACE, capstone: { ...WORKED_CAPSTONE, failure: '' } }, '2026-11-09T00:00:00Z');
  assert.equal(draft.status, 'draft');
  assert.equal(draft.filename, 'capstone-report-draft.json');
  assert.match(draft.text, /DRAFT/);
  assert.ok(draft.errors.some((e) => e.field === 'failure'));
});

// ---------- workspace + storage ----------

const memStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
};

test('workspace validation guards the stored envelope', () => {
  assert.equal(validateWorkspace(SAMPLE_WORKSPACE), true);
  assert.equal(validateWorkspace({ ...SAMPLE_WORKSPACE, version: 2 }), false);
  assert.equal(validateWorkspace({ ...SAMPLE_WORKSPACE, log: 'x' }), false);
  assert.equal(validateWorkspace(null), false);
});

test('store saves, reloads and discards its own versioned key', () => {
  const s = memStorage({ other: 'keep' });
  const a = openFieldStore(() => s);
  assert.equal(a.status, 'saved');
  assert.equal(a.initial, null);
  assert.equal(a.save(SAMPLE_WORKSPACE), true);
  const b = openFieldStore(() => s);
  assert.deepEqual(b.initial, SAMPLE_WORKSPACE);
  assert.equal(b.discard(), true);
  assert.equal(s.data.has(FIELD_STORAGE_KEY), false);
  assert.equal(s.data.get('other'), 'keep');
});

test('initial read failure is reported as memory-only, not saved', () => {
  const s = memStorage();
  s.getItem = () => {
    throw new Error('denied');
  };
  const st = openFieldStore(() => s);
  assert.equal(st.status, 'memory');
  assert.equal(st.problem, 'read-failed');
  assert.equal(st.save(SAMPLE_WORKSPACE), false);
});

test('blocked or missing storage stays in memory with a truthful status', () => {
  const st = openFieldStore(() => {
    throw new Error('SecurityError');
  });
  assert.equal(st.status, 'memory');
  assert.equal(st.problem, 'unavailable');
  assert.equal(openFieldStore(() => null).status, 'memory');
});

test('unreadable or other-version data is never overwritten until explicitly discarded', () => {
  for (const [raw, problem] of [
    ['{not json', 'corrupt'],
    [JSON.stringify({ version: 99, data: {} }), 'version'],
    [JSON.stringify({ version: 1, data: { nope: true } }), 'corrupt'],
  ] as const) {
    const s = memStorage({ [FIELD_STORAGE_KEY]: raw });
    const st = openFieldStore(() => s);
    assert.equal(st.problem, problem, raw);
    assert.equal(st.initial, null);
    assert.equal(st.save(SAMPLE_WORKSPACE), false);
    assert.equal(s.data.get(FIELD_STORAGE_KEY), raw, 'left untouched');
    assert.equal(st.discard(), true);
    assert.equal(st.save(SAMPLE_WORKSPACE), true);
  }
});

test('a failing write switches to memory and reports it', () => {
  const s = memStorage();
  s.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  const st = openFieldStore(() => s);
  assert.equal(st.save(SAMPLE_WORKSPACE), false);
  assert.equal(st.status, 'memory');
  assert.equal(st.problem, 'write-failed');
});
