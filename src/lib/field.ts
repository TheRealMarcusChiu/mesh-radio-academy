/**
 * Lab D pure model (FIELD_MODEL_VERSION 1): field planner, battery runtime, delivery ratio,
 * field log + CSV, capstone report and the lab's own browser-local store.
 * Contract: docs/field-contract.md. No DOM. Airtime comes only from the accepted Lab A
 * `airtime()` (docs/rf-contract.md); nothing here re-derives RF formulas.
 */
import { airtime, requiresLowDataRateOptimize, type AirtimeInput, type FieldError } from './rf.ts';

export type { FieldError };
export const FIELD_MODEL_VERSION = 1;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const whole = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const inRange = (v: unknown, lo: number, hi: number, loOpen = false) =>
  finite(v) && (loOpen ? v > lo : v >= lo) && v <= hi;

// ---------- battery runtime ----------

export interface Duty {
  tx: number;
  rx: number;
  sleep: number;
}

/** Everything except the duty split. Currents are measured on the load rail at `loadVoltage`. */
export interface BatteryCore {
  capacityMah: number;
  batteryVoltage: number;
  usableFraction: number;
  /** User-assumed share of usable capacity lost to cold (0 = none). Not a measured cell property. */
  coldDerating: number;
  converterEfficiency: number;
  loadVoltage: number;
  txCurrentMa: number;
  rxCurrentMa: number;
  sleepCurrentMa: number;
  gpsCurrentMa: number;
  /** Share of time GPS runs on top of the radio state (incremental overlay). */
  gpsDutyFraction: number;
}

export interface BatteryInput extends BatteryCore {
  duty: Duty;
}

export interface BatteryResult {
  averageCurrentMa: number;
  contributionsMa: { tx: number; rx: number; sleep: number; gps: number };
  usableEnergyWh: number;
  loadW: number;
  runtimeHours: number;
  runtimeDays: number;
}

export function validateBattery(input: unknown): FieldError[] {
  if (!input || typeof input !== 'object') return [{ field: 'form', message: 'No battery inputs were given.' }];
  const v = input as Record<string, unknown>;
  const errors: FieldError[] = [];
  const need = (ok: boolean, field: string, message: string) => ok || errors.push({ field, message });
  need(inRange(v.capacityMah, 0, 1e6, true), 'capacityMah', 'Enter a capacity above 0 mAh.');
  need(inRange(v.batteryVoltage, 0, 60, true), 'batteryVoltage', 'Enter a battery voltage above 0 V.');
  need(inRange(v.loadVoltage, 0, 60, true), 'loadVoltage', 'Enter the load-rail voltage, above 0 V.');
  need(inRange(v.usableFraction, 0, 1, true), 'usableFraction', 'Usable capacity must be above 0% and at most 100%.');
  need(inRange(v.converterEfficiency, 0, 1, true), 'converterEfficiency', 'Efficiency must be above 0% and at most 100%.');
  need(finite(v.coldDerating) && (v.coldDerating as number) >= 0 && (v.coldDerating as number) < 1, 'coldDerating', 'Cold derating must be 0% or more and below 100%.');
  for (const f of ['txCurrentMa', 'rxCurrentMa', 'sleepCurrentMa', 'gpsCurrentMa'])
    need(inRange(v[f], 0, 1e5), f, 'Enter a current from 0 to 100000 mA.');
  need(inRange(v.gpsDutyFraction, 0, 1), 'gpsDutyFraction', 'GPS time must be between 0% and 100%.');
  const d = v.duty as Duty | undefined;
  const dutyOk =
    !!d && [d.tx, d.rx, d.sleep].every((x) => inRange(x, 0, 1)) && Math.abs(d.tx + d.rx + d.sleep - 1) <= 1e-9;
  need(dutyOk, 'duty', 'Transmit, receive and sleep shares must each be 0–100% and add up to 100%.');
  if (!errors.length && averageCurrent(v as unknown as BatteryInput).total <= 0)
    errors.push({ field: 'averageCurrentMa', message: 'Average load is 0 mA, so runtime is not defined. Enter at least one current.' });
  return errors;
}

function averageCurrent(b: BatteryInput) {
  const c = {
    tx: b.duty.tx * b.txCurrentMa,
    rx: b.duty.rx * b.rxCurrentMa,
    sleep: b.duty.sleep * b.sleepCurrentMa,
    gps: b.gpsDutyFraction * b.gpsCurrentMa,
  };
  return { c, total: c.tx + c.rx + c.sleep + c.gps };
}

/**
 * Time-weighted average current (transmit time replaces listen/sleep time, as in the
 * Seeed T1000-E workbook, FLD-C01), then energy over power so battery and load voltages
 * can differ: runtime = Wh_usable × efficiency ÷ W_load (FLD-C02).
 */
export function batteryRuntime(input: BatteryInput): BatteryResult {
  const errors = validateBattery(input);
  if (errors.length) throw new RangeError(errors.map((e) => `${e.field}: ${e.message}`).join(' '));
  const { c, total } = averageCurrent(input);
  const usableEnergyWh = (input.capacityMah / 1000) * input.batteryVoltage * input.usableFraction * (1 - input.coldDerating);
  const loadW = (total / 1000) * input.loadVoltage;
  const runtimeHours = (usableEnergyWh * input.converterEfficiency) / loadW;
  return { averageCurrentMa: total, contributionsMa: c, usableEnergyWh, loadW, runtimeHours, runtimeDays: runtimeHours / 24 };
}

// ---------- traffic → duty ----------

export interface TrafficInput {
  /** Every packet this node transmits per hour, its own plus relayed, as whole packets. */
  packetsPerHour: number;
  /** Physical-layer settings and bytes per packet, validated by Lab A. */
  airtime: AirtimeInput;
  /** Share of non-transmit time spent listening (1 = always-on relay, 0 = always asleep). */
  listeningShare: number;
}

export function validateTraffic(input: unknown): FieldError[] {
  const v = (input ?? {}) as Record<string, unknown>;
  const errors: FieldError[] = [];
  if (!whole(v.packetsPerHour)) errors.push({ field: 'packetsPerHour', message: 'Enter a whole number of packets per hour, 0 or more.' });
  if (!inRange(v.listeningShare, 0, 1)) errors.push({ field: 'listeningShare', message: 'Listening share must be between 0% and 100%.' });
  try {
    airtime(v.airtime as AirtimeInput);
  } catch (e) {
    errors.push({ field: 'airtime', message: (e as Error).message });
  }
  return errors;
}

export function dutyFromTraffic(t: TrafficInput): Duty & { packetMs: number; txSecondsPerHour: number } {
  const errors = validateTraffic(t);
  if (errors.length) throw new RangeError(errors.map((e) => `${e.field}: ${e.message}`).join(' '));
  const packetMs = airtime(t.airtime).packetMs;
  const txSecondsPerHour = (t.packetsPerHour * packetMs) / 1000;
  const tx = (t.packetsPerHour * packetMs) / 3_600_000;
  if (tx > 1)
    throw new RangeError(`packetsPerHour: ${t.packetsPerHour} packets of ${packetMs.toFixed(3)} ms need more than 100% of each hour on air.`);
  return { tx, rx: (1 - tx) * t.listeningShare, sleep: (1 - tx) * (1 - t.listeningShare), packetMs, txSecondsPerHour };
}

export interface SensitivityRow {
  key: 'base' | 'rx' | 'gps' | 'traffic' | 'cold';
  label: string;
  /** null when this derived variant falls outside the supported inputs (see `unavailable`). */
  averageCurrentMa: number | null;
  runtimeHours: number | null;
  /** Why the variant was not computed; absent when it was. */
  unavailable?: string;
}

/**
 * One-assumption-at-a-time variants from the same base. All changes are synthetic assumptions.
 * The base must be valid (it throws otherwise). A derived variant whose changed input leaves the
 * supported range becomes an unavailable row with the reason; it is never clamped or dropped.
 */
export function sensitivity(core: BatteryCore, traffic: TrafficInput): SensitivityRow[] {
  const compute = (b: BatteryCore, t: TrafficInput) => batteryRuntime({ ...b, duty: dutyFromTraffic(t) });
  const base = compute(core, traffic);
  const variant = (key: SensitivityRow['key'], label: string, what: string, b: BatteryCore, t: TrafficInput): SensitivityRow => {
    try {
      const r = compute(b, t);
      return { key, label, averageCurrentMa: r.averageCurrentMa, runtimeHours: r.runtimeHours };
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
      return { key, label, averageCurrentMa: null, runtimeHours: null, unavailable: `Not computed: ${what}, outside what this calculator accepts. ${e.message}` };
    }
  };
  const rx = core.rxCurrentMa * 1.5;
  const gpsCurrent = core.gpsCurrentMa || 30;
  const gpsDuty = core.gpsDutyFraction + 0.1;
  const pph = traffic.packetsPerHour * 2;
  return [
    { key: 'base', label: 'Base (your synthetic inputs)', averageCurrentMa: base.averageCurrentMa, runtimeHours: base.runtimeHours },
    variant('rx', 'Receive current +50% (assumed)', `receive current would be ${rx} mA`, { ...core, rxCurrentMa: rx }, traffic),
    variant('gps', `GPS on 10% more of the time at ${gpsCurrent} mA (assumed)`, `GPS would be on ${Math.round(gpsDuty * 100)}% of the time`,
      { ...core, gpsCurrentMa: gpsCurrent, gpsDutyFraction: gpsDuty }, traffic),
    variant('traffic', `Twice the transmitted packets, ${pph}/h (assumed)`, `${pph} packets per hour`, core, { ...traffic, packetsPerHour: pph }),
    variant('cold', 'Cold: 20% less usable capacity (assumed, not measured)', 'the derated capacity', { ...core, coldDerating: 1 - (1 - core.coldDerating) * 0.8 }, traffic),
  ];
}

/** Share of the channel one sender occupies at a fixed send interval (test-cadence planning). */
export function channelShare(packetMs: number, intervalSeconds: number): number {
  if (!finite(packetMs) || packetMs <= 0 || !finite(intervalSeconds) || intervalSeconds <= 0)
    throw new RangeError('Packet time and send interval must both be above 0.');
  return packetMs / (intervalSeconds * 1000);
}

// ---------- delivery ratio ----------

export interface PdrResult {
  scheduled: number;
  uniqueReceived: number;
  attempts: number | null;
  /** undefined when nothing was scheduled: no sample, not 0%. */
  ratio: number | undefined;
}

export function pdr(scheduled: number, uniqueReceived: number, attempts: number | null): PdrResult {
  if (!whole(scheduled) || !whole(uniqueReceived)) throw new RangeError('Scheduled and received counts must be whole numbers, 0 or more.');
  if (attempts !== null && !whole(attempts)) throw new RangeError('On-air attempts must be a whole number, 0 or more, or left blank.');
  if (uniqueReceived > scheduled) throw new RangeError(`Received (${uniqueReceived}) is more than scheduled (${scheduled}); count each message once.`);
  return { scheduled, uniqueReceived, attempts, ratio: scheduled ? uniqueReceived / scheduled : undefined };
}

export function formatPdr(r: PdrResult): string {
  if (r.ratio === undefined) return 'No sample (0 messages scheduled)';
  const pct = Math.round(r.ratio * 1000) / 10;
  const att = r.attempts === null ? 'on-air attempts not recorded' : `${r.attempts} on-air attempts`;
  return `${pct}% (${r.uniqueReceived} of ${r.scheduled} scheduled; ${att})`;
}

/** Counts each scheduled message once; IDs that were never scheduled are flagged, not counted. */
export function receiptsToPdr(scheduledIds: string[], receivedIds: string[], attempts: number | null) {
  const scheduled = new Set(scheduledIds);
  if (scheduled.size !== scheduledIds.length) throw new RangeError('Scheduled message IDs must be unique.');
  const seen = new Set<string>();
  const unknownIds: string[] = [];
  let duplicates = 0;
  for (const id of receivedIds) {
    if (!scheduled.has(id)) unknownIds.push(id);
    else if (seen.has(id)) duplicates++;
    else seen.add(id);
  }
  return { ...pdr(scheduled.size, seen.size, attempts), duplicates, unknownIds };
}

// ---------- field log + CSV ----------

export type Direction = 'forward' | 'reverse' | '';

export interface LogRow {
  testId: string;
  time: string;
  direction: Direction;
  firmware: string;
  board: string;
  modemSettings: string;
  role: string;
  antenna: string;
  /** Distance or a fictional location label; never coordinates in examples. */
  location: string;
  obstruction: string;
  sendCount: number | null;
  receiveCount: number | null;
  attempts: number | null;
  rssiDbm: number | null;
  snrDb: number | null;
  latencyMs: number | null;
  routeObservation: string;
  notes: string;
}

const COLUMNS: [keyof LogRow, string][] = [
  ['testId', 'test_id'],
  ['time', 'time'],
  ['direction', 'direction'],
  ['firmware', 'firmware'],
  ['board', 'board'],
  ['modemSettings', 'modem_settings'],
  ['role', 'role'],
  ['antenna', 'antenna'],
  ['location', 'location_label'],
  ['obstruction', 'obstruction'],
  ['sendCount', 'send_count'],
  ['receiveCount', 'receive_count'],
  ['attempts', 'on_air_attempts'],
  ['rssiDbm', 'rssi_dbm'],
  ['snrDb', 'snr_db'],
  ['latencyMs', 'latency_ms'],
  ['routeObservation', 'route_observation'],
  ['notes', 'notes'],
];
export const LOG_KEYS = COLUMNS.map(([k]) => k);
export const LOG_HEADERS = COLUMNS.map(([, h]) => h);
export const NUMERIC_KEYS = ['sendCount', 'receiveCount', 'attempts', 'rssiDbm', 'snrDb', 'latencyMs'] as const;

export function validateRow(row: LogRow): FieldError[] {
  const errors: FieldError[] = [];
  const r = row as unknown as Record<string, unknown>;
  for (const k of LOG_KEYS) {
    if ((NUMERIC_KEYS as readonly string[]).includes(k)) continue;
    if (typeof r[k] !== 'string') errors.push({ field: k, message: 'Must be text (it can be empty).' });
  }
  if (typeof row.testId !== 'string' || !row.testId.trim()) errors.push({ field: 'testId', message: 'Give the test an ID.' });
  if (!['forward', 'reverse', ''].includes(row.direction)) errors.push({ field: 'direction', message: 'Direction is forward, reverse or blank.' });
  for (const k of ['sendCount', 'receiveCount', 'attempts'] as const)
    if (row[k] !== null && !whole(row[k])) errors.push({ field: k, message: 'Enter a whole number, 0 or more, or leave it blank.' });
  if (whole(row.sendCount) && whole(row.receiveCount) && row.receiveCount > row.sendCount)
    errors.push({ field: 'receiveCount', message: 'Received can’t be more than sent; count each message once.' });
  for (const k of ['rssiDbm', 'snrDb'] as const)
    if (row[k] !== null && !finite(row[k])) errors.push({ field: k, message: 'Enter a number or leave it blank.' });
  if (row.latencyMs !== null && !(finite(row.latencyMs) && row.latencyMs >= 0))
    errors.push({ field: 'latencyMs', message: 'Enter a latency of 0 ms or more, or leave it blank.' });
  return errors;
}

/** Fields left blank; they stay blank (never 0) and are flagged. Notes are optional. */
export const missingFields = (row: LogRow) =>
  LOG_KEYS.filter((k) => k !== 'notes' && (row[k] === null || row[k] === ''));

export interface DirectionSummary extends PdrResult {
  rows: number;
  /** Test IDs left out because send or receive count is missing or the row is invalid. */
  excluded: string[];
}

export function compareDirections(rows: LogRow[]): { forward: DirectionSummary; reverse: DirectionSummary } {
  const summarize = (dir: 'forward' | 'reverse'): DirectionSummary => {
    const mine = rows.filter((r) => r.direction === dir);
    const usable = mine.filter((r) => r.sendCount !== null && r.receiveCount !== null && !validateRow(r).length);
    const sum = (k: 'sendCount' | 'receiveCount' | 'attempts') => usable.reduce((s, r) => s + (r[k] as number), 0);
    const attempts = usable.length && usable.every((r) => r.attempts !== null) ? sum('attempts') : null;
    return {
      ...pdr(sum('sendCount'), sum('receiveCount'), attempts),
      rows: usable.length,
      excluded: mine.filter((r) => !usable.includes(r)).map((r) => r.testId),
    };
  };
  return { forward: summarize('forward'), reverse: summarize('reverse') };
}

const FORMULA_START = /^[=+\-@\t\r\n＝＋－＠]/;

/** RFC 4180 quoting plus OWASP formula neutralization for user text (FLD-C04). */
export function csvField(text: string): string {
  const neutral = FORMULA_START.test(text) ? `'${text}` : text;
  return neutral !== text || /[",\r\n]/.test(neutral) ? `"${neutral.replace(/"/g, '""')}"` : neutral;
}

export function toCsv(rows: LogRow[]): string {
  const line = (r: LogRow) =>
    COLUMNS.map(([k]) => {
      const v = r[k];
      if ((NUMERIC_KEYS as readonly string[]).includes(k)) return v === null ? '' : String(v);
      return csvField(v as string);
    }).join(',');
  return [LOG_HEADERS.join(','), ...rows.map(line)].map((l) => `${l}\r\n`).join('');
}

// ---------- planner ----------

export const ROLES = ['endpoint', 'relay', 'endpoint that relays'] as const;
export const LINK_ASSUMPTIONS = ['clear', 'partly obstructed', 'obstructed', 'unknown'] as const;
export type Role = (typeof ROLES)[number];
export type LinkAssumption = (typeof LINK_ASSUMPTIONS)[number];

export interface PlannerNode {
  id: string;
  label: string;
  role: Role;
  antenna: string;
  heightM: number | null;
  power: string;
  notes: string;
}

export interface PlannerLink {
  a: string;
  b: string;
  assumption: LinkAssumption;
  note: string;
}

export interface Planner {
  nodes: PlannerNode[];
  links: PlannerLink[];
}

export const NODE_IDS = ['A', 'B', 'C', 'D', 'E'];

export function validatePlanner(p: Planner): FieldError[] {
  const errors: FieldError[] = [];
  if (!p || !Array.isArray(p.nodes) || !Array.isArray(p.links)) return [{ field: 'planner', message: 'Planner data is malformed.' }];
  if (p.nodes.length < 3 || p.nodes.length > 5) errors.push({ field: 'nodes', message: 'Plan 3 to 5 nodes.' });
  p.nodes.forEach((n, i) => {
    if (n.id !== NODE_IDS[i]) errors.push({ field: `node-${i}`, message: 'Nodes are lettered A to E in order.' });
    if (typeof n.label !== 'string' || !n.label.trim() || n.label.length > 40)
      errors.push({ field: `node-${n.id}-label`, message: `Give node ${n.id} a short label (1–40 characters).` });
    if (!(ROLES as readonly string[]).includes(n.role)) errors.push({ field: `node-${n.id}-role`, message: `Choose a role for node ${n.id}.` });
    if (n.heightM !== null && !inRange(n.heightM, 0, 1000))
      errors.push({ field: `node-${n.id}-heightM`, message: `Antenna height for ${n.id} must be 0–1000 m or blank.` });
    for (const k of ['antenna', 'power', 'notes'] as const)
      if (typeof n[k] !== 'string') errors.push({ field: `node-${n.id}-${k}`, message: 'Must be text.' });
  });
  const ids = new Set(p.nodes.map((n) => n.id));
  const pairs = new Set<string>();
  for (const l of p.links) {
    const key = [l.a, l.b].sort().join('-');
    if (!ids.has(l.a) || !ids.has(l.b) || l.a === l.b) errors.push({ field: 'links', message: `Link ${l.a}–${l.b} names a node that isn’t in the plan.` });
    else if (pairs.has(key)) errors.push({ field: 'links', message: `Link ${key} is listed twice.` });
    pairs.add(key);
    if (!(LINK_ASSUMPTIONS as readonly string[]).includes(l.assumption)) errors.push({ field: 'links', message: `Choose an assumption for link ${key}.` });
    if (typeof l.note !== 'string') errors.push({ field: 'links', message: 'Link notes must be text.' });
  }
  return errors;
}

/**
 * Fewest assumed-usable links between two nodes, skipping links assumed obstructed.
 * A planning aid only: it is not how Meshtastic or MeshCore actually route.
 */
export function suggestPath(p: Planner, from: string, to: string): string[] | null {
  const usable = p.links.filter((l) => l.assumption !== 'obstructed');
  const prev = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const n = queue.shift()!;
    if (n === to) {
      const path = [n];
      for (let x = prev.get(n); x; x = prev.get(x)) path.unshift(x);
      return path;
    }
    const next = usable.flatMap((l) => (l.a === n ? [l.b] : l.b === n ? [l.a] : [])).sort();
    for (const m of next) if (!prev.has(m)) prev.set(m, n), queue.push(m);
  }
  return null;
}

export function describePlanner(p: Planner): string[] {
  const label = (id: string) => p.nodes.find((n) => n.id === id)?.label ?? id;
  return [
    ...p.nodes.map(
      (n) =>
        `${n.id} ${n.label}: ${n.role}; antenna ${n.antenna || 'not set'}; height ${n.heightM === null ? 'not set' : `${n.heightM} m`}; power ${n.power || 'not set'}${n.notes ? `; ${n.notes}` : ''}`,
    ),
    ...(p.links.length
      ? p.links.map((l) => `Link ${l.a} (${label(l.a)}) – ${l.b} (${label(l.b)}): assumed ${l.assumption}${l.note ? `; ${l.note}` : ''}`)
      : ['No links planned yet.']),
  ];
}

// ---------- battery/traffic form inputs ----------

/** Raw text from the battery and traffic form, stored as typed so a half-edited value is never lost. */
export type BatteryInputs = Record<string, string>;

const num = (s: string | undefined) => {
  const t = (s ?? '').trim().replace('−', '-');
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : Number.NaN;
};
const int = (s: string | undefined) => (/^\d+$/.test((s ?? '').trim()) ? Number(s) : Number.NaN);

/** Percent fields are converted explicitly to fractions. DE follows Lab A's 16 ms rule (disclosed in the UI). */
export function parseBatteryInputs(inputs: BatteryInputs): { core: BatteryCore; traffic: TrafficInput } {
  const sf = int(inputs.sf);
  const bandwidthKHz = num(inputs.bandwidthKHz);
  return {
    core: {
      capacityMah: num(inputs.capacityMah),
      batteryVoltage: num(inputs.batteryVoltage),
      usableFraction: num(inputs.usablePct) / 100,
      coldDerating: num(inputs.coldPct) / 100,
      converterEfficiency: num(inputs.efficiencyPct) / 100,
      loadVoltage: num(inputs.loadVoltage),
      txCurrentMa: num(inputs.txCurrentMa),
      rxCurrentMa: num(inputs.rxCurrentMa),
      sleepCurrentMa: num(inputs.sleepCurrentMa),
      gpsCurrentMa: num(inputs.gpsCurrentMa),
      gpsDutyFraction: num(inputs.gpsPct) / 100,
    },
    traffic: {
      packetsPerHour: int(inputs.packetsPerHour),
      listeningShare: num(inputs.listeningPct) / 100,
      airtime: {
        sf,
        bandwidthKHz,
        codingRate: int(inputs.codingRate),
        payloadBytes: int(inputs.payloadBytes),
        preambleSymbols: int(inputs.preambleSymbols),
        explicitHeader: inputs.explicitHeader === 'true',
        crc: inputs.crc === 'true',
        lowDataRateOptimize: Number.isFinite(sf) && Number.isFinite(bandwidthKHz) ? requiresLowDataRateOptimize(sf, bandwidthKHz) : false,
        packetCount: 1,
      },
    },
  };
}

// ---------- capstone ----------

export interface Capstone {
  topologySketch: string;
  predictedPath: string;
  resultsKind: 'simulated' | 'measured' | '';
  results: string;
  testConditions: string;
  failure: string;
  adjustment: string;
  retest: string;
  privacyChecks: { noPreciseLocations: boolean; noSecrets: boolean; rulesChecked: boolean; communityCoordinated: boolean };
  complianceNotes: string;
  maintenancePlan: string;
}

export const CAPSTONE_TEXT: [keyof Capstone, string][] = [
  ['topologySketch', 'Topology sketch'],
  ['predictedPath', 'Predicted path'],
  ['results', 'Results'],
  ['testConditions', 'Test conditions'],
  ['failure', 'One failure'],
  ['adjustment', 'One controlled adjustment'],
  ['retest', 'Retest and evidence'],
  ['complianceNotes', 'Privacy and compliance notes'],
  ['maintenancePlan', 'Maintenance plan'],
];
export const PRIVACY_CHECKS: [keyof Capstone['privacyChecks'], string][] = [
  ['noPreciseLocations', 'No precise home or node coordinates appear in this report.'],
  ['noSecrets', 'No keys, QR codes, passwords or configuration exports appear in this report.'],
  ['rulesChecked', 'I checked the rules and device authorization that apply where I would operate.'],
  ['communityCoordinated', 'Any real infrastructure would be coordinated with the local community first.'],
];

export function validateCapstone(c: Capstone): FieldError[] {
  const errors: FieldError[] = [];
  for (const [k, label] of CAPSTONE_TEXT) {
    const v = c[k];
    if (typeof v !== 'string' || v.trim().length < 10) errors.push({ field: k, message: `${label}: write at least a full sentence (10+ characters).` });
  }
  if (c.resultsKind !== 'simulated' && c.resultsKind !== 'measured')
    errors.push({ field: 'resultsKind', message: 'Say whether the results are simulated or measured.' });
  if (!c.privacyChecks || !PRIVACY_CHECKS.every(([k]) => c.privacyChecks[k] === true))
    errors.push({ field: 'privacyChecks', message: 'Confirm every privacy and compliance check.' });
  return errors;
}

// ---------- workspace, export, storage ----------

export interface Workspace {
  version: 1;
  planner: Planner;
  inputs: BatteryInputs;
  log: LogRow[];
  capstone: Capstone;
}

const isStr = (v: unknown) => typeof v === 'string';
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Every battery/traffic form field; a stored workspace must carry all of them as text. */
export const INPUT_KEYS = [
  'capacityMah', 'batteryVoltage', 'usablePct', 'coldPct', 'efficiencyPct', 'loadVoltage', 'txCurrentMa', 'rxCurrentMa',
  'sleepCurrentMa', 'gpsCurrentMa', 'gpsPct', 'packetsPerHour', 'listeningPct', 'sf', 'bandwidthKHz', 'codingRate',
  'payloadBytes', 'preambleSymbols', 'explicitHeader', 'crc',
] as const;

/**
 * Check for stored data. Structure the page relies on is enforced: 3–5 nodes lettered A… in order,
 * links between two different known nodes with no repeated pair, and every input key present as text.
 * Content is not: blank text, unparsable numbers and an unfinished capstone still reload.
 */
export function validateWorkspace(w: unknown): w is Workspace {
  if (!isRec(w) || w.version !== 1 || !isRec(w.planner) || !isRec(w.inputs) || !Array.isArray(w.log) || !isRec(w.capstone)) return false;
  const p = w.planner as unknown as Planner;
  if (!Array.isArray(p.nodes) || !Array.isArray(p.links) || p.nodes.length < 3 || p.nodes.length > 5) return false;
  const nodeOk = (n: unknown, i: number) =>
    isRec(n) && n.id === NODE_IDS[i] && ['label', 'role', 'antenna', 'power', 'notes'].every((k) => isStr(n[k])) && (n.heightM === null || finite(n.heightM));
  if (!p.nodes.every(nodeOk)) return false;
  const ids = new Set(p.nodes.map((n) => n.id));
  const pairs = new Set<string>();
  for (const l of p.links as unknown[]) {
    if (!isRec(l) || !['a', 'b', 'assumption', 'note'].every((k) => isStr(l[k]))) return false;
    const pair = [l.a, l.b].sort().join('-');
    if (!ids.has(l.a as string) || !ids.has(l.b as string) || l.a === l.b || pairs.has(pair)) return false;
    pairs.add(pair);
  }
  if (!INPUT_KEYS.every((k) => isStr((w.inputs as Record<string, unknown>)[k])) || !Object.values(w.inputs).every(isStr)) return false;
  if (!w.log.every((r) => isRec(r) && !validateRow(r as unknown as LogRow).length)) return false;
  const c = w.capstone;
  return (
    CAPSTONE_TEXT.every(([k]) => isStr(c[k])) &&
    ['simulated', 'measured', ''].includes(c.resultsKind as string) &&
    isRec(c.privacyChecks) &&
    PRIVACY_CHECKS.every(([k]) => typeof (c.privacyChecks as Record<string, unknown>)[k] === 'boolean')
  );
}

export interface ExportResult {
  status: 'final' | 'draft';
  filename: string;
  json: string;
  text: string;
  errors: FieldError[];
}

/** Builds the capstone report locally. Final only when planner and capstone validate; otherwise a marked draft. */
export function exportReport(w: Workspace, generatedAt: string): ExportResult {
  const errors = [...validatePlanner(w.planner), ...validateCapstone(w.capstone)];
  const status = errors.length ? 'draft' : 'final';
  const { core, traffic } = parseBatteryInputs(w.inputs);
  let battery: { result: BatteryResult; duty: Duty } | null = null;
  let batteryProblem = '';
  try {
    const duty = dutyFromTraffic(traffic);
    battery = { duty, result: batteryRuntime({ ...core, duty }) };
  } catch (e) {
    batteryProblem = (e as Error).message;
  }
  const comparison = compareDirections(w.log);
  const report = {
    format: 'mesh-radio-academy-capstone',
    version: FIELD_MODEL_VERSION,
    status,
    generatedAt,
    note: 'Generated in the browser. All defaults are synthetic teaching values; nothing here is a measured range, battery life or legal approval.',
    planner: { ...w.planner, description: describePlanner(w.planner) },
    battery: { inputs: w.inputs, result: battery?.result ?? null, duty: battery?.duty ?? null, problem: batteryProblem || null },
    log: { rows: w.log, comparison },
    capstone: w.capstone,
    missing: errors,
  };
  const c = w.capstone;
  const lines = [
    `Mesh Radio Academy capstone report: ${status.toUpperCase()}`,
    `Generated ${generatedAt} in the browser.`,
    status === 'draft' ? `Incomplete: ${errors.map((e) => e.message).join(' ')}` : 'All required parts are present.',
    '',
    'PLAN',
    ...describePlanner(w.planner),
    '',
    'BATTERY (synthetic inputs)',
    battery
      ? `Average ${battery.result.averageCurrentMa.toFixed(3)} mA; runtime ${battery.result.runtimeHours.toFixed(1)} h (${battery.result.runtimeDays.toFixed(2)} days).`
      : `Not computed: ${batteryProblem}`,
    '',
    'DELIVERY',
    `Forward: ${formatPdr(comparison.forward)}${comparison.forward.excluded.length ? `; excluded rows ${comparison.forward.excluded.join(', ')}` : ''}`,
    `Reverse: ${formatPdr(comparison.reverse)}${comparison.reverse.excluded.length ? `; excluded rows ${comparison.reverse.excluded.join(', ')}` : ''}`,
    '',
    'CAPSTONE',
    `Results are ${c.resultsKind || 'not yet labelled as simulated or measured'}.`,
    ...CAPSTONE_TEXT.flatMap(([k, label]) => [`${label}:`, (c[k] as string) || '(missing)', '']),
    'Privacy and compliance checks:',
    ...PRIVACY_CHECKS.map(([k, label]) => `[${c.privacyChecks?.[k] ? 'x' : ' '}] ${label}`),
  ];
  return {
    status,
    filename: `capstone-report-${status}.json`,
    json: JSON.stringify(report, null, 2),
    text: lines.join('\n'),
    errors,
  };
}

export const FIELD_STORAGE_KEY = 'mesh-radio-academy:field-lab:v1';
type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type StoreProblem = null | 'unavailable' | 'read-failed' | 'corrupt' | 'version' | 'write-failed';

export interface FieldStore {
  readonly status: 'saved' | 'memory';
  readonly problem: StoreProblem;
  /** The saved workspace, or null if none or unreadable. */
  readonly initial: Workspace | null;
  save(w: Workspace): boolean;
  /** Removes only this lab's key. */
  discard(): boolean;
}

/**
 * Own versioned envelope { version: 1, data }. A failed first read is reported as memory-only.
 * Unreadable or other-version data is left untouched (saving is blocked) until the user discards it.
 */
export function openFieldStore(getStorage: () => KV | null | undefined): FieldStore {
  let storage: KV | null = null;
  let problem: StoreProblem = null;
  let initial: Workspace | null = null;
  try {
    storage = getStorage() ?? null;
  } catch {
    storage = null;
  }
  if (!storage) problem = 'unavailable';
  else {
    let raw: string | null = null;
    try {
      raw = storage.getItem(FIELD_STORAGE_KEY);
    } catch {
      problem = 'read-failed';
      storage = null;
    }
    if (raw !== null) {
      try {
        const env = JSON.parse(raw);
        if (!isRec(env) || env.version !== 1) problem = isRec(env) && 'version' in env ? 'version' : 'corrupt';
        else if (validateWorkspace(env.data)) initial = env.data;
        else problem = 'corrupt';
      } catch {
        problem = 'corrupt';
      }
    }
  }
  return {
    get status() {
      return storage ? 'saved' : 'memory';
    },
    get problem() {
      return problem;
    },
    initial,
    save(w) {
      if (!storage || problem === 'corrupt' || problem === 'version') return false;
      try {
        storage.setItem(FIELD_STORAGE_KEY, JSON.stringify({ version: 1, data: w }));
        return true;
      } catch {
        storage = null;
        problem = 'write-failed';
        return false;
      }
    },
    discard() {
      if (!storage) return false;
      try {
        storage.removeItem(FIELD_STORAGE_KEY);
        problem = null;
        return true;
      } catch {
        return false;
      }
    },
  };
}
