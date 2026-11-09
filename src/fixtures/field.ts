/**
 * Versioned synthetic Lab D fixtures (FIELD_FIXTURE_VERSION 1). Every value is an invented
 * teaching input: no measured currents, battery life, deliveries, places or people.
 * "Cedar Hollow" is fictional; labels are not coordinates.
 */
import type { BatteryCore, BatteryInput, BatteryInputs, Capstone, LogRow, Planner, TrafficInput, Workspace } from '../lib/field.ts';
import { RF_F01 } from './rf.ts';

export const FIELD_FIXTURE_VERSION = 1;

/** Synthetic equal-voltage battery example (RF-C08 research arithmetic): 15.901 mA, 90.5603421 h. */
export const FIELD_BATTERY_CORE: BatteryCore = {
  capacityMah: 2000,
  batteryVoltage: 3.7,
  usableFraction: 0.8,
  coldDerating: 0,
  converterEfficiency: 0.9,
  loadVoltage: 3.7,
  txCurrentMa: 120,
  rxCurrentMa: 15,
  sleepCurrentMa: 0.1,
  gpsCurrentMa: 0,
  gpsDutyFraction: 0,
};

/** FIELD-F01: direct duty split 1% transmit / 98% receive / 1% sleep. */
export const FIELD_F01_BATTERY: BatteryInput = { ...FIELD_BATTERY_CORE, duty: { tx: 0.01, rx: 0.98, sleep: 0.01 } };

/** FIELD-F02: 60 packets/hour of the Lab A RF-F01 packet (56.576 ms), always listening otherwise. */
export const FIELD_F02_TRAFFIC: TrafficInput = { packetsPerHour: 60, airtime: { ...RF_F01.input }, listeningShare: 1 };

/** The same defaults as form text, used by the lab page. */
export const DEFAULT_INPUTS: BatteryInputs = {
  capacityMah: '2000',
  batteryVoltage: '3.7',
  usablePct: '80',
  coldPct: '0',
  efficiencyPct: '90',
  loadVoltage: '3.7',
  txCurrentMa: '120',
  rxCurrentMa: '15',
  sleepCurrentMa: '0.1',
  gpsCurrentMa: '0',
  gpsPct: '0',
  packetsPerHour: '60',
  listeningPct: '100',
  sf: '7',
  bandwidthKHz: '125',
  codingRate: '1',
  payloadBytes: '20',
  preambleSymbols: '8',
  explicitHeader: 'true',
  crc: 'true',
};

export const SAMPLE_PLANNER: Planner = {
  nodes: [
    { id: 'A', label: 'Porch on Elm Row', role: 'endpoint', antenna: 'stock whip, vertical', heightM: 2, power: 'USB 5 V', notes: 'Learner’s own node' },
    { id: 'B', label: 'Hilltop relay mast', role: 'relay', antenna: 'band-matched omni, vertical', heightM: 9, power: 'battery + small panel (unsized)', notes: 'Permission from the owner assumed' },
    { id: 'C', label: 'Library roof', role: 'relay', antenna: 'band-matched omni, vertical', heightM: 12, power: 'mains adapter', notes: 'Second route' },
    { id: 'D', label: 'Community garden shed', role: 'endpoint that relays', antenna: 'stock whip, vertical', heightM: 3, power: 'battery', notes: 'Target node' },
    { id: 'E', label: 'Mobile walker', role: 'endpoint', antenna: 'stock whip', heightM: 1.5, power: 'battery', notes: 'Moves around' },
  ],
  links: [
    { a: 'A', b: 'B', assumption: 'clear', note: 'Short hop uphill' },
    { a: 'A', b: 'C', assumption: 'partly obstructed', note: 'Trees in the way' },
    { a: 'B', b: 'D', assumption: 'clear', note: '' },
    { a: 'C', b: 'D', assumption: 'clear', note: '' },
    { a: 'B', b: 'C', assumption: 'unknown', note: 'Not yet tested' },
    { a: 'D', b: 'E', assumption: 'clear', note: 'Only when E is nearby' },
  ],
};

export const SAMPLE_SCHEDULED_IDS = Array.from({ length: 20 }, (_, i) => `m${String(i + 1).padStart(2, '0')}`);
/** 17 unique deliveries (m01–m17) plus two duplicate copies (m03, m09). */
export const SAMPLE_RECEIVED_IDS = [...SAMPLE_SCHEDULED_IDS.slice(0, 17), 'm03', 'm09'];

const row = (r: Partial<LogRow> & Pick<LogRow, 'testId'>): LogRow => ({
  time: '',
  direction: '',
  firmware: '',
  board: '',
  modemSettings: '',
  role: '',
  antenna: '',
  location: '',
  obstruction: '',
  sendCount: null,
  receiveCount: null,
  attempts: null,
  rssiDbm: null,
  snrDb: null,
  latencyMs: null,
  routeObservation: '',
  notes: '',
  ...r,
});

/** Synthetic log: forward 17/20 (85%, 23 attempts); reverse 14/20 (70%) in different conditions; one incomplete row. */
export const SAMPLE_LOG: LogRow[] = [
  row({
    testId: 'F1', time: 'Day 1 09:00', direction: 'forward', firmware: 'synthetic sim', board: 'simulated', modemSettings: 'SF7/125 kHz/CR 4/5',
    role: 'endpoint → endpoint', antenna: 'stock whip', location: 'Elm Row porch → garden shed (fictional)', obstruction: 'trees on the A–C path',
    sendCount: 20, receiveCount: 17, attempts: 23, rssiDbm: -104, snrDb: 3.5, latencyMs: 2100, routeObservation: 'via B',
    notes: 'SYNTHETIC. Morning, quiet channel; 3 messages missing; 3 retries also went on air.',
  }),
  row({
    testId: 'R1', time: 'Day 1 19:00', direction: 'reverse', firmware: 'synthetic sim', board: 'simulated', modemSettings: 'SF7/125 kHz/CR 4/5',
    role: 'endpoint → endpoint', antenna: 'stock whip', location: 'garden shed → Elm Row porch (fictional)', obstruction: 'trees on the A–C path',
    sendCount: 20, receiveCount: 14, attempts: 26, rssiDbm: -107, snrDb: 1.0, latencyMs: 2600, routeObservation: 'via C',
    notes: 'SYNTHETIC. Evening, busier channel and a different route; not the same conditions as F1.',
  }),
  row({
    testId: 'R2', time: 'Day 2 19:00', direction: 'reverse', firmware: 'synthetic sim', board: 'simulated', modemSettings: 'SF7/125 kHz/CR 4/5',
    location: 'garden shed → Elm Row porch (fictional)', sendCount: 10,
    notes: 'SYNTHETIC. Receive count was not recorded, so this row is flagged and left out of the totals.',
  }),
];

export const WORKED_CAPSTONE: Capstone = {
  topologySketch:
    'Five fictional nodes in Cedar Hollow: A porch endpoint, B hilltop relay, C library-roof relay, D garden-shed endpoint that relays, E mobile walker. Links A–B and B–D assumed clear, A–C partly obstructed by trees, C–D clear, B–C unknown, D–E only when E is nearby.',
  predictedPath: 'A to D via B (two hops, both links assumed clear). If B is unavailable, via C, but the A–C link is partly obstructed so delivery should drop.',
  resultsKind: 'simulated',
  results: 'Synthetic sample: forward 17 of 20 scheduled messages delivered (85%, n = 20, 23 on-air attempts); reverse 14 of 20 (70%, n = 20) under different evening conditions. One reverse row lacked a receive count and was excluded.',
  testConditions: 'Fixed endpoints A and D, SF7 / 125 kHz / CR 4/5, 20 messages per direction, one message every 30 s, no other changes during a run. Values are synthetic teaching data, not measurements.',
  failure: 'In the evening reverse run the route moved to C and three more messages were lost than in the morning forward run; the A–C link is the suspected weak point.',
  adjustment: 'Changed one thing: raised C’s antenna from 12 m to an assumed clearer 14 m position (synthetic), keeping every other setting fixed.',
  retest: 'Repeat the reverse run with the same 20-message schedule and timing and compare counts with sample sizes side by side. The synthetic retest shows 17 of 20 (85%); with n = 20 that is a direction to investigate, not proof of improvement.',
  privacyChecks: { noPreciseLocations: true, noSecrets: true, rulesChecked: true, communityCoordinated: true },
  complianceNotes: 'Only fictional place labels are used. No keys or exports are included. Before any real test I would check the device label and its authorization, the local rules, and the community’s current settings.',
  maintenancePlan: 'Check the relay batteries and connectors monthly, repeat the 20-message test after any firmware or antenna change, and record firmware versions and settings in the log each time.',
};

export const SAMPLE_WORKSPACE: Workspace = {
  version: 1,
  planner: SAMPLE_PLANNER,
  inputs: DEFAULT_INPUTS,
  log: SAMPLE_LOG,
  capstone: WORKED_CAPSTONE,
};
