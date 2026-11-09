Lessons and simulations use one fixed baseline for each firmware track. A newer release can behave differently, so before changing a baseline, update this file, the source registry and every affected claim together.

**Physical test status: not physically tested.** No radio, board, app pairing, flasher or recovery procedure has been tried on real hardware for this course. Every combination below is *documented*, not *tested*.

## Meshtastic

| Component | Version | Pin / identity | Status |
|---|---|---|---|
| Firmware | 2.7.26.54e0d8d, release channel **Beta** (not a release named "Stable"); published 2026-06-24 | Commit `54e0d8d0ab2ff56b3a9ce967e53f79e49af560fb` (MT-S01) | Source read; not built or run |
| Protobuf schema | firmware gitlink | `6b1ded439633cd03d4af85b44231b91d1d106278` (MT-S04) | Reported by research checkout; not re-fetched |
| Technical client | Python CLI `meshtastic==2.7.11` | Commit `19d066970e652a5a72a18718149b638e3473a6eb` (MT-S05) | Installed and `--help` run; no radio connected |
| Android app (optional) | v2.8.3 | Commit `105d541a2e068cc8abfb4f2d31bc4e5636d922ce` (MT-S06) | Version identified; pairing with this firmware **not tested** |
| Apple app (optional) | v2.7.27 | Commit `75fa91664872f8a5e73dd9d66563acd614796c43` (MT-S07) | Version identified; pairing **not tested** |
| Web flasher | flasher.meshtastic.org | No numbered release; deployed build commit **unknown** (MT-S08) | Pick the firmware version and board target explicitly; do not rely on "latest" |
| Documentation | Archived 2.7 docs | Mutable, dated (MT-S02, MT-S13, MT-S19, MT-S33) | Unversioned docs describe 2.8; don't mix 2.8 behavior into this baseline |

Newer 2.8.x releases are Alpha and are not substituted. Migrating means moving the whole baseline, not cherry-picking 2.8 features.

## MeshCore

| Component | Version | Pin / identity | Status |
|---|---|---|---|
| Firmware | Role releases `companion-v1.18.0`, `repeater-v1.18.0`, `room-server-v1.18.0` (2026-10-15) | Commit `81dbae592ffad40b4212bc0b37e82b38da08f4bc` (MC-S05) | Source read; not built or run |
| App | Liam Cottle's MeshCore v1.50.0, e.g. `MeshCore-v1.50.0+78-b7528a7-android.apk` | Artifact names only; `b7528a7` is not a verified source commit (MC-S07) | Documented with firmware 1.18.0 (MC-S06); **not installed or tested** |
| Flasher and config tools | flasher.meshcore.io, config.meshcore.io | Deployed versions **unknown** (MC-S04) | Powerful tools that can erase identity; the course does not run them |
| Development builds | main / nightly | Not used | Not part of the baseline |

## Hardware targets at the selected baselines

These are build targets present in the pinned source. They are not compiled binaries, and nobody has tested them on hardware for this course.

| Board | Meshtastic 2.7.26 target (HW-S14) | MeshCore 1.18.0 targets (HW-S10) | Notes |
|---|---|---|---|
| Heltec WiFi LoRa 32 V3 | `heltec-v3`, actively supported | `Heltec_v3_companion_radio_ble`, `_usb`, `_wifi`, `Heltec_v3_repeater`, `Heltec_v3_room_server` | Target is for "V3"; per-revision (V3.2) validation not established |
| RAK4631 (WisBlock) | `rak4631`, actively supported | `RAK_4631_companion_radio_ble`, `_usb`, `RAK_4631_repeater`, `_room_server` | RAK4631-R ships a different bootloader and needs conversion first |
| Seeed SenseCAP T1000-E | `tracker-t1000-e`, actively supported; built without Wi-Fi | `t1000e_companion_radio_ble`, `_usb`, `t1000e_repeater`, `t1000e_room_server` | Not T1000-A/B/S; dedicated-role targets are not a manufacturer recommendation as a relay |

## Compatibility status matrix

| Combination | Documented | Tested by this course |
|---|---|---|
| Meshtastic 2.7.26 + Python CLI 2.7.11 over USB | Yes (MT-C24) | No (CLI run without a radio only) |
| Meshtastic 2.7.26 + Android 2.8.3 or Apple 2.7.27 over BLE | Versions identified only | No |
| MeshCore 1.18.0 companion + app 1.50.0 over BLE | Yes, in release notes (MC-003) | No |
| MeshCore 1.18.0 USB companion + versioned web client | Asset exists only | No |
| Meshtastic ↔ MeshCore native messages | Not supported: different packet formats (LW-C02) | Not applicable |
| Any listed board on either firmware | Build target exists (HW-C04, HW-C11) | No |

## MeshCore project split (dated note, 2026-11-09)

On 2026-04-23 the meshcore.io team published its account of a project split (MC-S02). It names meshcore.io, docs.meshcore.io and the `meshcore-dev/MeshCore` repository as its home. That is the authors' own account, not an independent ruling, and the course does not repeat claims about who did what. A separate site, meshcore.co.uk, distributes MeshOS and also links Liam Cottle's app and the same core repository for developer docs (MC-S03). Branding alone does not establish a firmware fork or a compatibility result. This course's MeshCore baseline is the `meshcore-dev/MeshCore` 1.18.0 role releases with the 1.50.0 app; MeshOS and other distributions are out of scope and untested (MC-001).

## Refreshing a baseline

1. Check the release pages and security advisories for both projects (MT-S29, MC-S20).
2. Pin the new full commit, then re-read every code source the claim ledger cites at that commit.
3. Re-check board targets at the new commit (HW-S10, HW-S14 style rows).
4. Update the affected claims' checked dates and statuses, then each lesson's `baseline`, `sourceIds` and `reviewed` fields.
5. Record any behavior change on the corrections page.
