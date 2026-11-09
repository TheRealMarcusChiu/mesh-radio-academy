/**
 * Pure LoRa airtime and link-budget arithmetic for Lab A (RF_MODEL_VERSION 1).
 * Airtime follows Semtech SX1276/77/78/79 datasheet Rev. 4 §4.1.1.7 (RF-C01, RF-C02)
 * for a deliberately narrow reference subset: SF7–12 at 125/250/500 kHz. Other
 * chips and settings (SF5/6, 62.5 kHz, …) are outside this subset, not "illegal".
 * No DOM, no clamping: invalid input is reported, never silently corrected.
 */

export const RF_MODEL_VERSION = 1;

export const SPREADING_FACTORS = [7, 8, 9, 10, 11, 12] as const;
export const BANDWIDTHS_KHZ = [125, 250, 500] as const;
export const CODING_RATES = [1, 2, 3, 4] as const; // 4/5 … 4/8
export const PREAMBLE_RANGE = [6, 65535] as const;
export const PAYLOAD_RANGE = [1, 255] as const;
/** Symbol time above which this reference mandates low-data-rate optimization (DE). */
export const LDRO_THRESHOLD_MS = 16;

export interface AirtimeInput {
  sf: number;
  bandwidthKHz: number;
  /** 1–4 meaning 4/5–4/8. */
  codingRate: number;
  /** Physical-layer payload bytes, including any mesh header or crypto bytes already in them. */
  payloadBytes: number;
  preambleSymbols: number;
  explicitHeader: boolean;
  crc: boolean;
  lowDataRateOptimize: boolean;
  /** Identical packets to add up; 0 allowed. */
  packetCount: number;
}

export interface AirtimeResult {
  bandwidthHz: number;
  symbolMs: number;
  /** Includes the fixed 8 symbols. */
  payloadSymbols: number;
  /** Programmed preamble + 4.25 symbols. */
  preambleSymbolsTotal: number;
  preambleMs: number;
  payloadMs: number;
  packetMs: number;
  /** Packet time rounded up to a whole millisecond, as the LoRaMac-node driver reports it. */
  roundedUpMs: number;
  aggregateMs: number;
  /** Bit terms inside the payload-symbol formula (not byte offsets). */
  bitTerms: { payload: number; crc: number; header: number; sfAndFixed: number };
}

export interface FieldError {
  field: string;
  message: string;
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
const symbolMsOf = (sf: number, bwKHz: number) => 2 ** sf / bwKHz; // 2^SF / (BW Hz) s = 2^SF / (BW kHz) ms

export const requiresLowDataRateOptimize = (sf: number, bandwidthKHz: number) =>
  symbolMsOf(sf, bandwidthKHz) > LDRO_THRESHOLD_MS;

export function validateAirtime(input: unknown): FieldError[] {
  if (!input || typeof input !== 'object') return [{ field: 'form', message: 'No airtime inputs were given.' }];
  const v = input as Record<string, unknown>;
  const errors: FieldError[] = [];
  const bad = (field: string, message: string) => errors.push({ field, message });

  if (!isInt(v.sf) || !(SPREADING_FACTORS as readonly number[]).includes(v.sf))
    bad('sf', 'Choose a spreading factor from 7 to 12. This reference subset leaves out SF5 and SF6.');
  if (!(BANDWIDTHS_KHZ as readonly unknown[]).includes(v.bandwidthKHz))
    bad('bandwidthKHz', 'Choose 125, 250 or 500 kHz. Other bandwidths (such as 62.5 kHz) are outside this cross-checked subset.');
  if (!isInt(v.codingRate) || !(CODING_RATES as readonly number[]).includes(v.codingRate))
    bad('codingRate', 'Choose a coding rate from 4/5 to 4/8.');
  if (!isInt(v.payloadBytes) || v.payloadBytes < PAYLOAD_RANGE[0] || v.payloadBytes > PAYLOAD_RANGE[1])
    bad('payloadBytes', 'Enter a whole number of payload bytes from 1 to 255.');
  if (!isInt(v.preambleSymbols) || v.preambleSymbols < PREAMBLE_RANGE[0] || v.preambleSymbols > PREAMBLE_RANGE[1])
    bad('preambleSymbols', 'Enter a whole number of preamble symbols from 6 to 65535.');
  if (!isInt(v.packetCount) || v.packetCount < 0) bad('packetCount', 'Enter a whole number of packets, 0 or more.');
  for (const f of ['explicitHeader', 'crc', 'lowDataRateOptimize'])
    if (typeof v[f] !== 'boolean') bad(f, `${f} must be on or off.`);

  if (!errors.some((e) => e.field === 'sf' || e.field === 'bandwidthKHz') && typeof v.lowDataRateOptimize === 'boolean') {
    const ts = symbolMsOf(v.sf as number, v.bandwidthKHz as number);
    const required = ts > LDRO_THRESHOLD_MS;
    if (required !== v.lowDataRateOptimize)
      bad(
        'lowDataRateOptimize',
        required
          ? `Symbol time is ${round(ts)} ms, over 16 ms: this reference requires low-data-rate optimization. Turn it on.`
          : `Symbol time is ${round(ts)} ms, not over 16 ms: this reference uses low-data-rate optimization only above 16 ms. Turn it off.`,
      );
  }
  return errors;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function airtime(input: AirtimeInput): AirtimeResult {
  const errors = validateAirtime(input);
  if (errors.length) throw new RangeError(errors.map((e) => e.message).join(' '));
  const { sf, bandwidthKHz, codingRate: cr, payloadBytes: pl, preambleSymbols: pre, packetCount } = input;
  const crc = input.crc ? 1 : 0;
  const ih = input.explicitHeader ? 0 : 1;
  const de = input.lowDataRateOptimize ? 1 : 0;
  const bandwidthHz = bandwidthKHz * 1000;

  const numerator = 8 * pl - 4 * sf + 28 + 16 * crc - 20 * ih;
  const coded = Math.max(Math.ceil(numerator / (4 * (sf - 2 * de))), 0);
  const payloadSymbols = 8 + coded * (cr + 4);

  // Exact integer form (as in LoRaMac-node): quarter-symbols × 2^(SF-2) µs-units, avoids float drift.
  const quarterSymbols = 4 * (pre + payloadSymbols) + 17; // 4 × (pre + 4.25 + Npayload)
  const scaled = 1000 * quarterSymbols * 2 ** (sf - 2); // ms × BW(Hz)
  const symbolMs = symbolMsOf(sf, bandwidthKHz);
  const packetMs = scaled / bandwidthHz;

  return {
    bandwidthHz,
    symbolMs,
    payloadSymbols,
    preambleSymbolsTotal: pre + 4.25,
    preambleMs: (pre + 4.25) * symbolMs,
    payloadMs: payloadSymbols * symbolMs,
    packetMs,
    roundedUpMs: Math.ceil(scaled / bandwidthHz),
    aggregateMs: packetCount * packetMs,
    bitTerms: { payload: 8 * pl, crc: 16 * crc, header: 20 * (1 - ih), sfAndFixed: 8 - 4 * sf },
  };
}

// ---------- link budget ----------

/** Extra loss applied by the obstruction toggle: an assumed teaching value, not a material measurement. */
export const OBSTRUCTION_DB = 25;

export interface LinkInput {
  txPowerDbm: number;
  txGainDbi: number;
  txLossDb: number;
  pathLossDb: number;
  rxGainDbi: number;
  rxLossDb: number;
  /** Assumed receiver sensitivity; depends on chip and settings in reality. */
  sensitivityDbm: number;
  obstruction: boolean;
}

export interface LinkResult {
  terms: { label: string; db: number }[];
  totalPathLossDb: number;
  receivedDbm: number;
  marginDb: number;
}

export function validateLinkBudget(input: unknown): FieldError[] {
  if (!input || typeof input !== 'object') return [{ field: 'form', message: 'No link-budget inputs were given.' }];
  const v = input as Record<string, unknown>;
  const errors: FieldError[] = [];
  const finite = (f: string) => typeof v[f] === 'number' && Number.isFinite(v[f]);
  for (const f of ['txPowerDbm', 'txGainDbi', 'rxGainDbi', 'sensitivityDbm'])
    if (!finite(f)) errors.push({ field: f, message: 'Enter a number.' });
  for (const f of ['txLossDb', 'rxLossDb', 'pathLossDb'])
    if (!finite(f) || (v[f] as number) < 0) errors.push({ field: f, message: 'Enter a loss of 0 dB or more.' });
  if (typeof v.obstruction !== 'boolean') errors.push({ field: 'obstruction', message: 'Obstruction must be on or off.' });
  return errors;
}

export function linkBudget(input: LinkInput): LinkResult {
  const errors = validateLinkBudget(input);
  if (errors.length) throw new RangeError(errors.map((e) => `${e.field}: ${e.message}`).join(' '));
  const extra = input.obstruction ? OBSTRUCTION_DB : 0;
  const terms = [
    { label: 'Transmit power', db: input.txPowerDbm },
    { label: 'Transmit antenna gain', db: input.txGainDbi },
    { label: 'Transmit cable loss', db: -input.txLossDb },
    { label: 'Path loss (assumed)', db: -input.pathLossDb },
    ...(extra ? [{ label: 'Obstruction (assumed)', db: -extra }] : []),
    { label: 'Receive antenna gain', db: input.rxGainDbi },
    { label: 'Receive cable loss', db: -input.rxLossDb },
  ];
  const receivedDbm = terms.reduce((sum, t) => sum + t.db, 0);
  return { terms, totalPathLossDb: input.pathLossDb + extra, receivedDbm, marginDb: receivedDbm - input.sensitivityDbm };
}
