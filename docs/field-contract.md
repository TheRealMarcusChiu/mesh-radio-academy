# Field lab contract (FIELD_MODEL_VERSION 1, FIELD_FIXTURE_VERSION 1)

`src/lib/field.ts` is pure: no DOM, no clock and no input clamping. Invalid input returns `FieldError[]` from the `validate*` functions, and the computing functions throw `RangeError`.

**Frozen dependencies.**
- Airtime comes only from Lab A's `airtime()` and `requiresLowDataRateOptimize()` (`docs/rf-contract.md`, RF_MODEL_VERSION 1), which are unchanged.
- No routing model is used. `suggestPath` is a planning aid (fewest assumed-usable links) and does not model Meshtastic or MeshCore routing.

## Battery

| Function | Contract |
|---|---|
| `batteryRuntime(BatteryInput)` | Inputs: `capacityMah > 0`; `batteryVoltage` and `loadVoltage` > 0 V; `usableFraction` and `converterEfficiency` in (0, 1]; `coldDerating` in [0, 1); currents ≥ 0 mA; `gpsDutyFraction` in [0, 1]; `duty {tx, rx, sleep}` each in [0, 1] and summing to 1 (±1e-9). Average current = tx·Itx + rx·Irx + sleep·Isleep + gps·Igps and must be > 0. Usable energy Wh = mAh/1000 × V_bat × usable × (1 − cold). Runtime h = Wh × efficiency ÷ (mA/1000 × V_load). |
| `dutyFromTraffic(TrafficInput)` | `packetsPerHour` is a whole number ≥ 0 (the node's own plus relayed packets); `airtime` is a valid Lab A `AirtimeInput`; `listeningShare` in [0, 1]. tx = packets × packetMs ÷ 3,600,000 and must be ≤ 1. rx = (1 − tx)·listening; sleep = (1 − tx)·(1 − listening). |
| `sensitivity(core, traffic)` | Rows: base, receive current +50%, GPS +10% of time (30 mA if none set), traffic ×2 (omitted if that exceeds 100% airtime), cold = 1 − (1 − cold)·0.8. Every variant is labelled assumed. |
| `parseBatteryInputs(Record<string,string>)` | Strict text → number parsing (malformed text becomes NaN and fails validation). `*Pct` fields are divided by 100. DE follows the Lab A 16 ms rule. |
| `channelShare(packetMs, intervalS)` | packetMs ÷ (interval × 1000); both must be > 0. |

## Delivery ratio and log

- `pdr(scheduled, uniqueReceived, attempts | null)`: whole, non-negative numbers; received ≤ scheduled. `ratio` is `undefined` when 0 messages are scheduled.
- `formatPdr` gives `"85% (17 of 20 scheduled; 23 on-air attempts)"`, or `"No sample (0 messages scheduled)"`.
- `receiptsToPdr(scheduledIds, receivedIds, attempts)`: received IDs are de-duplicated, IDs that were never scheduled go into `unknownIds` (not counted), and duplicate scheduled IDs are refused.
- `LogRow` columns (CSV header order):
  `test_id, time, direction, firmware, board, modem_settings, role, antenna, location_label, obstruction, send_count, receive_count, on_air_attempts, rssi_dbm, snr_db, latency_ms, route_observation, notes`.
  - Numeric fields are `number | null`, where null means missing and is never 0.
  - `direction` is `forward | reverse | ''`.
- `compareDirections(rows)`: for each direction, sums over rows whose send and receive counts are present and valid. Other rows are listed in `excluded`. `attempts` is `null` unless every counted row has it.
- `toCsv(rows)`: RFC 4180, CRLF, header always present. Text cells starting with `= + - @`, tab, CR, LF or full-width lookalikes are prefixed with `'` and quoted. Numeric cells are plain, and blanks stay empty.
- Static downloads are generated at build time from the same function: `/downloads/field-log-blank.csv` and `/downloads/field-log-sample.csv`.

## Capstone and export

- `validateCapstone(Capstone)`: every text part needs at least 10 non-space characters; `resultsKind` is `simulated | measured`; all four `privacyChecks` must be true.
- `exportReport(workspace, generatedAt)` returns `{ status, filename, json, text, errors }`:
  - `status` is `final` only when the planner and capstone validate; otherwise it is `draft`.
  - The JSON is `{ format: 'mesh-radio-academy-capstone', version: 1, status, generatedAt, note, planner (+description), battery {inputs, result|null, duty|null, problem|null}, log {rows, comparison}, capstone, missing }`.
  - Filenames: `capstone-report-final.json` / `capstone-report-draft.json` (the UI also offers `.txt`).
- There is no import function.

## Storage

- Key `mesh-radio-academy:field-lab:v1`; envelope `{ version: 1, data: Workspace }`. This store is separate from course progress.
- `openFieldStore(getStorage)` gives `{ status: 'saved' | 'memory', problem, initial, save, discard }`. `problem` is one of:
  - `unavailable`: the storage getter threw or returned null;
  - `read-failed`: `getItem` threw, so the store is memory-only;
  - `corrupt` or `version`: existing data is unreadable. It is left untouched, and `save` returns false until `discard()`;
  - `write-failed`: `setItem` threw, so the store switches to memory;
  - `null`: no problem.
- `validateWorkspace` checks shape only, so unfinished drafts reload. Invalid numeric text in planner heights becomes `null` when saved.

## Fixtures

| ID | Fixture | Expected result |
|---|---|---|
| FLD-F01 | `FIELD_F01_BATTERY` | 15.901 mA, 90.5603421 h |
| FLD-F02 | `FIELD_F02_TRAFFIC` (60 × RF-F01 packets/h, always listening), `SAMPLE_LOG`, `SAMPLE_SCHEDULED_IDS` / `SAMPLE_RECEIVED_IDS` | Forward 17 of 20 = 85% (23 attempts), reverse 14 of 20 = 70%, R2 excluded; receipts 17 unique + 2 duplicates |
| — | `SAMPLE_PLANNER`, `WORKED_CAPSTONE`, `SAMPLE_WORKSPACE`, `DEFAULT_INPUTS` | Valid planner and complete capstone (final export) |
