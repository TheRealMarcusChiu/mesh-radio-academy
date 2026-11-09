# RF calculation contract (RF_MODEL_VERSION 1, RF_FIXTURE_VERSION 1)

`src/lib/rf.ts` holds pure functions with no DOM, clock or rounding of inputs. Future labs, such as the field planner, should import these functions rather than re-implement them. Changing any signature or behavior needs a version bump and updates to this file and `tests/rf.test.ts`.

## Airtime

```ts
airtime(input: AirtimeInput): AirtimeResult        // throws RangeError on invalid input
validateAirtime(input: unknown): FieldError[]       // [] when valid; { field, message } otherwise
requiresLowDataRateOptimize(sf, bandwidthKHz): boolean   // symbol time > 16 ms
```

- `AirtimeInput` fields:
  - `sf` 7–12.
  - `bandwidthKHz` 125 | 250 | 500.
  - `codingRate` 1–4, meaning 4/5–4/8.
  - `payloadBytes` an integer 1–255. These are physical-layer bytes, including any mesh or crypto overhead already in them.
  - `preambleSymbols` an integer 6–65535.
  - `explicitHeader`, `crc` and `lowDataRateOptimize` are booleans.
  - `packetCount` an integer ≥ 0.
- `lowDataRateOptimize` must equal `requiresLowDataRateOptimize(sf, bandwidthKHz)`. A mismatch is a validation error, not a silent correction.
- Everything outside this subset is rejected as *outside the reference*, not as illegal: SF5/6, other bandwidths, other chips.
- `AirtimeResult` values are in **milliseconds**:
  - `symbolMs`, `preambleMs`, `payloadMs`, `packetMs` (exact) and `roundedUpMs` (whole ms, as the driver reports it);
  - `aggregateMs` = `packetCount` × `packetMs`, transmit time only;
  - plus `bandwidthHz`, `payloadSymbols` (including the fixed 8), `preambleSymbolsTotal` (n + 4.25) and `bitTerms`. The bit terms are formula terms, not byte offsets.
- Formula: SX1276 datasheet Rev. 4 §4.1.1.7 (RF-C01, RF-C02). It is computed in the exact integer form also used by LoRaMac-node v4.7.0 (RF-C16).

## Link budget

```ts
linkBudget(input: LinkInput): LinkResult            // throws RangeError on invalid input
validateLinkBudget(input: unknown): FieldError[]
OBSTRUCTION_DB = 25                                 // assumed teaching loss
```

- `LinkInput` values are finite numbers in the stated units. Losses (`txLossDb`, `rxLossDb`, `pathLossDb`) must be ≥ 0, and `obstruction` is a boolean.
- `LinkResult`:
  - `terms[]`: label and signed dB, in order; the obstruction appears only when it is on;
  - `totalPathLossDb`;
  - `receivedDbm` = the sum of the terms;
  - `marginDb` = `receivedDbm − sensitivityDbm`.
- The result gives no range, delivery or legal verdict.

## Fixtures (`src/fixtures/rf.ts`)

| Fixture | Inputs | Expected result |
|---|---|---|
| `RF_F01` | SF7/125/CR1/20 B/explicit/CRC/8/DE0/×10 | 56.576 ms (57 ms rounded up), 565.76 ms for 10 |
| `RF_F02` | As RF_F01 at SF12 with DE1 | 1318.912 ms (1319 ms), 13189.12 ms for 10 |
| `RF_F03` | 14 dBm, 2 dBi each end, 1 dB loss each end, 115 dB path loss, −120 dBm assumed sensitivity | −99 dBm, 21 dB margin |
| `RF_F04` | RF_F03 with the 25 dB obstruction | −124 dBm, −4 dB margin |
