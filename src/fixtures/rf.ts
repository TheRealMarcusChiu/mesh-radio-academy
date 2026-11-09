/**
 * Versioned synthetic RF fixtures (RF_FIXTURE_VERSION 1). IDs match research/claims.md.
 * 20 B is 20 physical-layer bytes, not a 20-character app message.
 */
import type { AirtimeInput, LinkInput } from '../lib/rf.ts';

export const RF_FIXTURE_VERSION = 1;

/** RF-F01: expected 56.576 ms per packet, 565.76 ms for 10; driver rounds to 57 ms (RF-C03). */
export const RF_F01 = {
  id: 'RF-F01',
  input: {
    sf: 7,
    bandwidthKHz: 125,
    codingRate: 1,
    payloadBytes: 20,
    preambleSymbols: 8,
    explicitHeader: true,
    crc: true,
    lowDataRateOptimize: false,
    packetCount: 10,
  } satisfies AirtimeInput,
} as const;

/** RF-F02: expected 1318.912 ms per packet, 13189.12 ms for 10; driver 1319 ms (RF-C04). */
export const RF_F02 = {
  id: 'RF-F02',
  input: { ...RF_F01.input, sf: 12, lowDataRateOptimize: true } satisfies AirtimeInput,
} as const;

/** RF-F03: −99 dBm received, 21 dB margin against an assumed −120 dBm (RF-C07). */
export const RF_F03: LinkInput = {
  txPowerDbm: 14,
  txGainDbi: 2,
  txLossDb: 1,
  pathLossDb: 115,
  rxGainDbi: 2,
  rxLossDb: 1,
  sensitivityDbm: -120,
  obstruction: false,
};

/** RF-F04: RF-F03 with the assumed 25 dB obstruction: −124 dBm, −4 dB margin (RF-C07). */
export const RF_F04: LinkInput = { ...RF_F03, obstruction: true };
