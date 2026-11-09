/**
 * Airtime overlay for the routing playground. Pure: reads a list of already-revealed
 * routing events and charges each `transmit` event once with the accepted RF helper
 * (src/lib/rf.ts, RF_MODEL_VERSION 1; RF-C01, RF-C02, RF-C05). It never changes the
 * trace, the config or the metrics, and it adds no routing behavior.
 *
 * Byte sizes are the learner's assumed full PHY payload per frame type. The routing
 * model has no verified frame lengths, so the default is "unknown" and nothing is
 * estimated from text length or packet-inspector placeholders.
 */
import { airtime, validateAirtime, type AirtimeInput, type FieldError } from './rf.ts';
import type { SimEvent } from './routing.ts';

export const FRAME_KINDS = ['text', 'ack', 'path', 'advert'] as const;
export type FrameKind = (typeof FRAME_KINDS)[number];
/** Full PHY payload bytes per frame type; null = not known. */
export type FrameBytes = Record<FrameKind, number | null>;
export type RfSettings = Omit<AirtimeInput, 'payloadBytes' | 'packetCount'>;

export interface AirtimeAssumptions {
  rf: RfSettings;
  bytes: FrameBytes;
}

export interface AirtimeRow {
  kind: FrameKind | 'unknown';
  count: number;
  bytes: number | null;
  packetMs: number | null;
  subtotalMs: number | null;
}

export interface AirtimeOverlay {
  /** complete: every transmission priced; partial: some sizes unknown; invalid: input errors. */
  status: 'complete' | 'partial' | 'invalid';
  errors: FieldError[];
  rows: AirtimeRow[];
  transmissions: number;
  /** Origin re-transmissions of an already-sent packet key (same rule as metricsAt). */
  retries: number;
  unknownTransmissions: number;
  /** Sum over priced rows; null when inputs are invalid. */
  knownMs: number | null;
  /** Only when status is complete. */
  totalMs: number | null;
}

/** RF-F01 settings (RF-C03): SF7, 125 kHz, CR 4/5, 8-symbol preamble, explicit header, CRC on, DE off. */
export const DEFAULT_RF: RfSettings = { sf: 7, bandwidthKHz: 125, codingRate: 1, preambleSymbols: 8, explicitHeader: true, crc: true, lowDataRateOptimize: false };
export const UNKNOWN_BYTES: FrameBytes = { text: null, ack: null, path: null, advert: null };
/** Hypothetical teaching sizes: every frame 32 bytes. Not a firmware fact or capture. */
export const HYPOTHETICAL_BYTES: FrameBytes = { text: 32, ack: 32, path: 32, advert: 32 };

export function routingAirtime(events: readonly SimEvent[], a: AirtimeAssumptions): AirtimeOverlay {
  const counts = new Map<FrameKind | 'unknown', number>();
  const sent = new Set<string>();
  let retries = 0;
  let transmissions = 0;
  for (const e of events) {
    if (e.action !== 'transmit') continue;
    transmissions++;
    const kind = (FRAME_KINDS as readonly string[]).includes(e.packet?.kind ?? '') ? (e.packet!.kind as FrameKind) : 'unknown';
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
    if (e.packet && e.node === e.packet.origin) {
      if (sent.has(e.packet.key)) retries++;
      sent.add(e.packet.key);
    }
  }

  // Validate the RF settings and every entered size, transmitted yet or not, with the accepted helper.
  const errors: FieldError[] = [];
  for (const k of FRAME_KINDS) {
    const b = a.bytes[k];
    if (b === null) continue;
    for (const err of validateAirtime({ ...a.rf, payloadBytes: b, packetCount: 0 })) {
      const field = err.field === 'payloadBytes' ? `bytes.${k}` : err.field;
      if (!errors.some((x) => x.field === field)) errors.push({ field, message: err.message });
    }
  }
  if (!FRAME_KINDS.some((k) => a.bytes[k] !== null)) {
    for (const err of validateAirtime({ ...a.rf, payloadBytes: 1, packetCount: 0 })) errors.push(err);
  }
  const invalid = errors.length > 0;

  const rows: AirtimeRow[] = [...FRAME_KINDS, 'unknown' as const]
    .filter((k) => counts.has(k))
    .map((kind) => {
      const count = counts.get(kind)!;
      const bytes = kind === 'unknown' ? null : a.bytes[kind];
      if (invalid || bytes === null) return { kind, count, bytes, packetMs: null, subtotalMs: null };
      const r = airtime({ ...a.rf, payloadBytes: bytes, packetCount: count });
      return { kind, count, bytes, packetMs: r.packetMs, subtotalMs: r.aggregateMs };
    });
  const unknownTransmissions = rows.filter((r) => r.subtotalMs === null).reduce((s, r) => s + r.count, 0);
  const knownMs = invalid ? null : rows.reduce((s, r) => s + (r.subtotalMs ?? 0), 0);
  const status = invalid ? 'invalid' : unknownTransmissions ? 'partial' : 'complete';
  return { status, errors, rows, transmissions, retries, unknownTransmissions, knownMs, totalMs: status === 'complete' ? knownMs : null };
}
