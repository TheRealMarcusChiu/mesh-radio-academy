Each material technical, regulatory, compatibility or security statement in the course has a row here. Lessons and the routing model cite these IDs next to the sentence, figure or event they support.

**How to read a row**

- **Scope** gives the protocol or jurisdiction, then the firmware, client and board the claim applies to. "Board: any" means the claim does not depend on hardware.
- **Evidence** lists source IDs and sections. Each source ID resolves to a URL, an immutable commit (for code) and a check date in the source registry.
- **Checked** is the UTC date the evidence was last read.
- **Status** says what kind of support the claim has:
  - *source-verified*: matching tagged code or documentation was read. Not executed, not hardware-tested.
  - *verified-document*: a dated manufacturer, regulator or community document was read.
  - *verified-calculation*: arithmetic or a formula was executed with the stated inputs.
  - *documented-target*: a firmware build target exists. It was not compiled or run on hardware.
  - *teaching-model*: a deliberate simplification built on the cited evidence.
  - *qualified*: true only within the stated boundary.
  - *definition*: a standard term definition.
  - *proposed*: a course recommendation, not a quoted rule.
  - *unresolved*: not established. Do not teach it as fact.

Baselines: Meshtastic `2.7.26.54e0d8d` Beta (`54e0d8d0ab2ff56b3a9ce967e53f79e49af560fb`); MeshCore role releases `1.18.0` (`81dbae592ffad40b4212bc0b37e82b38da08f4bc`). Details and test status are in the baselines file.

## LoRa layering (cross-protocol)

| ID | Statement | Scope | Evidence | Checked | Status |
|---|---|---|---|---|---|
| <a id="lw-c01"></a>LW-C01 | LoRa is a physical-layer modulation. LoRaWAN is a separate MAC/network specification with end devices, gateways and network servers in a star-of-stars topology. | LoRa / LoRaWAN; board any | LW-S01 FAQ, Architecture | 2026-11-09 | verified-document |
| <a id="lw-c02"></a>LW-C02 | Meshtastic and MeshCore define different packet formats on top of LoRa, so neither can interpret the other's messages natively, even in a hypothetical case where a frame's bytes were received intact. This claim is about the protocol layer only; whether a frame is received at all is LW-C04. | Meshtastic 2.7.26 and MeshCore 1.18.0; board any | MT-S04 (protobuf MeshPacket); MC-S08 (header/path layout); MT-S19 | 2026-11-09 | source-verified (formats); no gateway claimed |
| <a id="lw-c04"></a>LW-C04 | Equal frequency, bandwidth, spreading factor and coding rate put a transmission on the receiver's channel, but don't by themselves establish that the receiver accepts the frame: framing settings such as the sync word must also be compatible. Meshtastic sets `syncWord = 0x2b`; MeshCore's SX1262 init passes RadioLib's `RADIOLIB_SX126X_SYNC_WORD_PRIVATE` constant. What one stock radio does with the other's transmissions is not established. | Meshtastic 2.7.26; MeshCore 1.18.0 builds using `CustomSX1262::std_init` | MT-S34; MC-S24 | 2026-11-09 | source-verified (settings); stock cross-reception unresolved, not tested |
| <a id="lw-c03"></a>LW-C03 | The phone-to-radio link (BLE, USB or other) carries an app protocol that is different from the over-the-air packet. | Meshtastic and MeshCore baselines | MC-S15; MC-018; MT-S05 | 2026-11-09 | source-verified |

## Meshtastic

Scope for all rows: Meshtastic firmware 2.7.26.54e0d8d unless stated; client none unless stated; board any.

| ID | Statement | Scope | Evidence | Checked | Status |
|---|---|---|---|---|---|
| <a id="mt-c01"></a>MT-C01 | The selected non-prerelease baseline is 2.7.26 Beta; newer 2.8.x Alpha is a different track. | Release metadata | MT-S01 | 2026-11-09 | source-verified; date-sensitive |
| <a id="mt-c02"></a>MT-C02 | Unversioned docs now describe 2.8; use the archived 2.7 docs plus pinned code for this baseline. | Docs | MT-S02, MT-S03 | 2026-11-09 | verified-document |
| <a id="mt-c03"></a>MT-C03 | An ordinary CLIENT can cancel its own waiting relay when it receives a duplicate (same sender and packet ID) over LoRa before it transmits. | 2.7.26 | MT-S09 L118–153; MT-S11 | 2026-11-09 | source-verified |
| <a id="mt-c04"></a>MT-C04 | Removing B–C audibility removes the B-heard cancellation trigger at C; it does not by itself change D's single unique delivery. | Synthetic diamond, no loss or collision | MT-S09–MT-S12; MT-F01 | 2026-11-09 | teaching-model |
| <a id="mt-c05"></a>MT-C05 | ROUTER and ROUTER_LATE (and CLIENT_BASE for favorited traffic) do not use ordinary duplicate cancellation; ROUTER uses an earlier relay window. | 2.7.26 | MT-S09 L118–153; MT-S12 L587–636 | 2026-11-09 | source-verified |
| <a id="mt-c06"></a>MT-C06 | Relay delay is randomized and SNR-weighted, not a deterministic distance ranking. A seeded order in a simulation is a teaching assumption. | 2.7.26 | MT-S12 L587–636 | 2026-11-09 | source-verified |
| <a id="mt-c07"></a>MT-C07 | CLIENT_MUTE and rebroadcast mode NONE suppress relaying; otherwise forwarding depends on role, rebroadcast mode and receive policy. Rebroadcast ALL can relay packets the node cannot decrypt. | 2.7.26 | MT-S09 L155–158; MT-S13; MT-S14; MT-S15 | 2026-11-09 | source-verified |
| <a id="mt-c08"></a>MT-C08 | The hop limit counts relays, not RF links; a copy received with hop limit 0 can be delivered but not relayed. | 2.7.26 | MT-S10 L127–166; MT-S16 | 2026-11-09 | source-verified |
| <a id="mt-c09"></a>MT-C09 | Favorited infrastructure-role relay chains can preserve the remaining hop budget after the first relay. | 2.7.26 | MT-S15 L82–130 | 2026-11-09 | source-verified |
| <a id="mt-c10"></a>MT-C10 | A DM next-hop preference is per destination and per hop, not an end-to-end source route. | 2.7.26 | MT-S10 L86–188 | 2026-11-09 | source-verified |
| <a id="mt-c11"></a>MT-C11 | With unicast retries still pending, the final retransmission clears the next-hop preference and floods. | 2.7.26 | MT-S10 L265–315; MT-S11 L94–109 | 2026-11-09 | source-verified |
| <a id="mt-c12"></a>MT-C12 | For an isolated sender, the retry record schedules the initial send plus two retransmissions (constant 3). Archived docs say "resent a maximum of three times". | 2.7.26 | MT-S10 L11–15, L265–315; MT-S18 | 2026-11-09 | source-verified; docs differ |
| <a id="mt-c13"></a>MT-C13 | An implicit ACK proves a rebroadcast was heard, not that the destination decoded or read the message. | 2.7.26 | MT-S17 L39–77 | 2026-11-09 | source-verified |
| <a id="mt-c14"></a>MT-C14 | A routing ACK is neither a human acknowledgment nor cryptographic proof of DM delivery in 2.7; ACK proof is documented for 2.8.1+. | 2.7.26 | MT-S15 L654–656; MT-S17; MT-S03 | 2026-11-09 | source-verified with version boundary |
| <a id="mt-c15"></a>MT-C15 | Logical channel, PSK, channel hash, modem preset and frequency slot are different settings. | 2.7.26 | MT-S19, MT-S20, MT-S12 | 2026-11-09 | source-verified |
| <a id="mt-c16"></a>MT-C16 | With automatic slot selection, changing the primary channel name can change the RF frequency even if a secondary channel is unchanged. | 2.7.26 | MT-S12 L845–871; MT-S19 | 2026-11-09 | source-verified |
| <a id="mt-c17"></a>MT-C17 | Default-key channel contents are effectively public; private AES-CTR channels do not provide authenticated integrity. | 2.7.26 | MT-S03, MT-S19, MT-S21 | 2026-11-09 | source-verified |
| <a id="mt-c18"></a>MT-C18 | A PKI DM uses X25519 → SHA-256 → AES-256-CCM; there is no separate public-key signature. | 2.7.26 | MT-S21 L88–151; MT-S31 | 2026-11-09 | source-verified; tests inspected not run |
| <a id="mt-c19"></a>MT-C19 | An ordinary PKI text DM to a recipient whose public key is unknown fails rather than silently downgrading. | 2.7.26 | MT-S15 L637–679; MT-S25 | 2026-11-09 | source-verified |
| <a id="mt-c20"></a>MT-C20 | Remote PKI admin authorization and the current session passkey are independent controls. | 2.7.26 | MT-S22 L72–138, L1430–1458 | 2026-11-09 | source-verified |
| <a id="mt-c21"></a>MT-C21 | Rotating a shared-channel key requires out-of-band redistribution; old recorded data is not retroactively protected. | 2.7.26 | MT-S03, MT-S23 | 2026-11-09 | qualified |
| <a id="mt-c22"></a>MT-C22 | MQTT can expose decoded data and metadata; encryption, TLS, uplink, downlink and map reporting are separate settings. | 2.7.26; no broker tested | MT-S24, MT-S30 | 2026-11-09 | source-verified |
| <a id="mt-c23"></a>MT-C23 | `via_mqtt` prevents ordinary re-uplink on this path but does not prove every bridge topology is loop-free. | 2.7.26 | MT-S30 L766–812 | 2026-11-09 | qualified |
| <a id="mt-c24"></a>MT-C24 | CLI 2.7.11 accepts the narrow read `--get lora.hop_limit`; its deprecated `--no-time` flag does nothing. | Client: Python CLI 2.7.11 | MT-S05 | 2026-11-09 | source-verified; device read not run |
| <a id="mt-c25"></a>MT-C25 | Radio/client compatibility and security cannot be inferred from matching version prefixes. | Baseline + optional apps | MT-S06, MT-S07, MT-S25–MT-S29 | 2026-11-09 | qualified |
| <a id="mt-c26"></a>MT-C26 | Durable anti-replay guarantees and exact multi-gateway or queue timing are not established. | 2.7.26 | MT-S11, MT-S21, MT-S30 | 2026-11-09 | unresolved; do not claim |
| <a id="mt-c27"></a>MT-C27 | The 2.7 docs say each spreading-factor step doubles airtime and adds about 2.5 dB of link budget, and each bandwidth doubling costs almost 3 dB. They list Long Fast as SF11, 250 kHz, CR 4/5, and their link-budget column assumes 22 dBm and a 0 dBi antenna. | Docs 2.7 (archived) | MT-S33 | 2026-11-09 | verified-document |

## MeshCore

Scope for all rows: MeshCore firmware 1.18.0 role releases unless stated; client none unless stated; board any.

| ID | Statement | Scope | Evidence | Checked | Status |
|---|---|---|---|---|---|
| <a id="mc-001"></a>MC-001 | Firmware lineage and app distribution are separate compatibility dimensions. | Dated ecosystem snapshot | MC-S01–MC-S04 | 2026-11-09 | source-verified |
| <a id="mc-002"></a>MC-002 | The three 1.18.0 role tags resolve to commit 81dbae592ffad40b4212bc0b37e82b38da08f4bc. | Release metadata | MC-S05 | 2026-11-09 | source-verified |
| <a id="mc-003"></a>MC-003 | Firmware 1.18.0 with Liam Cottle's app 1.50.0 is a documented feature pairing, not a tested interoperability result. | Client app 1.50.0 | MC-S06, MC-S07 | 2026-11-09 | qualified |
| <a id="mc-004"></a>MC-004 | Companion repeating is off by default but configurable; it is not impossible. The course fixes A/D companions with repeat off and B/C dedicated repeaters. | 1.18.0 | MC-S12, MC-S13, MC-S14 | 2026-11-09 | source-verified |
| <a id="mc-005"></a>MC-005 | Repeater forwarding depends on its forwarding flag and, for floods, scope, hop and loop policy; hearing a packet does not guarantee forwarding. | 1.18.0 | MC-S14, MC-S21 | 2026-11-09 | source-verified |
| <a id="mc-006"></a>MC-006 | Zero-hop adverts reach only direct neighbors; flooded adverts can cross eligible repeaters. | 1.18.0 | MC-S08–MC-S10, MC-S16 | 2026-11-09 | source-verified |
| <a id="mc-007"></a>MC-007 | An advert supplies identity; a new contact starts with an unknown outgoing path. | 1.18.0 | MC-S11 L108–200 | 2026-11-09 | source-verified |
| <a id="mc-008"></a>MC-008 | A DM with no known route is flooded and relays append their prefixes. The receiver returns a PATH with the ACK bundled, and the sender stores the route. On a flooded PATH the sender replies with a direct reciprocal path. | 1.18.0 | MC-S10 (incl. L173–177), MC-S11 | 2026-11-09 | source-verified |
| <a id="mc-009"></a>MC-009 | A stored direct path is an ordered list of relay prefixes; the next relay matches and removes its own entry. | 1.18.0 | MC-S09, MC-S10, MC-S11 | 2026-11-09 | source-verified |
| <a id="mc-010"></a>MC-010 | Flood handling is first-packet-wins and need not pick the fewest hops; already-seen packets are dropped. | 1.18.0 | MC-S10 L141–145; MC-S21 | 2026-11-09 | source-verified |
| <a id="mc-011"></a>MC-011 | With stored path [B], breaking B–D does not make C forward that direct packet, even if C could reach D. | Synthetic graph | MC-S10 L78–109; MC-F04 | 2026-11-09 | teaching-model grounded in source |
| <a id="mc-012"></a>MC-012 | Recovery needs an explicit client/user reset of the stored path followed by a new send; the reset itself transmits nothing. | 1.18.0 companion | MC-S11 L834–836; MC-S12 L1317–1326 | 2026-11-09 | source-verified |
| <a id="mc-013"></a>MC-013 | The FAQ describes configurable client retries ending in reset/flood, but firmware does not justify a universal automatic-retry rule. | Client retry code unverified | MC-S22; MC-S12 | 2026-11-09 | qualified |
| <a id="mc-014"></a>MC-014 | Path entries are 1, 2 or 3 bytes wide; the hop count uses six bits; path storage is 64 bytes. | 1.18.0 | MC-S08, MC-S09 | 2026-11-09 | source-verified |
| <a id="mc-015"></a>MC-015 | Multibyte paths need ≥1.14 forwarders per the CLI docs; wider prefixes reduce collisions but do not authenticate identity. | Mixed firmware | MC-S16 L478–494; MC-S09 | 2026-11-09 | source-verified (docs); older binaries untested |
| <a id="mc-016"></a>MC-016 | A six-bit count encodes at most 63 one-byte hops, although the docs advertise 64/32/21. | 1.18.0 | MC-S08, MC-S09, MC-S16 | 2026-11-09 | qualified; mismatch documented |
| <a id="mc-017"></a>MC-017 | Over the air, a v1 direct DM carries a clear header, path, short destination/source hashes, a 2-byte MAC and an encrypted body. "Plain text message" names a payload type, not unencrypted text. | 1.18.0 | MC-S08–MC-S10, MC-S17 | 2026-11-09 | source-verified |
| <a id="mc-018"></a>MC-018 | Companion-protocol commands and responses (over BLE or USB) are not LoRa packet headers. | Client transport | MC-S15 | 2026-11-09 | source-verified |
| <a id="mc-019"></a>MC-019 | DM confidentiality uses a secret derived from peer identities; a signed advert proves key possession, not a person's name. | 1.18.0 | MC-S10, MC-S18 | 2026-11-09 | qualified |
| <a id="mc-020"></a>MC-020 | Public channels are readable by anyone with the published key; private channels restrict readers and writers to key holders. | 1.18.0 | MC-S15, MC-S17, MC-S18 | 2026-11-09 | source-verified |
| <a id="mc-021"></a>MC-021 | A group message's sender name is unverified text; any key holder can type any name. | 1.18.0 | MC-S17 L266–277 | 2026-11-09 | source-verified |
| <a id="mc-022"></a>MC-022 | Ciphertext authentication is a 2-byte truncated HMAC-SHA256, separate from confidentiality and replay handling. | 1.18.0 | MC-S18 | 2026-11-09 | source-verified; no audit |
| <a id="mc-023"></a>MC-023 | Advert timestamps, duplicate caches and server checks have different scopes and do not give blanket replay immunity. | 1.18.0 | MC-S11, MC-S19, MC-S21 | 2026-11-09 | qualified |
| <a id="mc-024"></a>MC-024 | Repeater/room admin is separate from chat access. Build files set the admin password to `password`; change it before deployment. | 1.18.0 | MC-S16, MC-S19; HW-S10 | 2026-11-09 | source-verified |
| <a id="mc-025"></a>MC-025 | Remote companion CLI is a separately granted sensitive permission introduced with 1.18.0 / app 1.50.0. | 1.18.0, app 1.50.0 | MC-S06 | 2026-11-09 | verified-document |
| <a id="mc-026"></a>MC-026 | A room server decrypts and stores posts; it is a trusted endpoint, not opaque storage. | 1.18.0 | MC-S19 | 2026-11-09 | source-verified |
| <a id="mc-027"></a>MC-027 | Room history is a cyclic queue (default 32 posts, build-configurable); no retention duration is promised. | 1.18.0 | MC-S19 | 2026-11-09 | source-verified |
| <a id="mc-028"></a>MC-028 | RF observers can see timing, length, route and payload type, relay prefixes and some identifiers; adverts disclose identity and optional location. | 1.18.0 | MC-S08–MC-S10, MC-S17 | 2026-11-09 | source-verified |
| <a id="mc-029"></a>MC-029 | Bridges, maps and cloud collection add observers and retention beyond RF; a specific bridge must be documented separately. | Configuration-dependent | MC-S14, MC-S17 | 2026-11-09 | qualified |
| <a id="mc-030"></a>MC-030 | Local send acceptance, a matching protocol ACK, the recipient's app display and a human reply are different events. The code computes the ACK value with truncated SHA-256 although the payload doc says "CRC". | 1.18.0 | MC-S11 L244–254; MC-S12 L1167–1171; MC-S17 | 2026-11-09 | source-verified; docs mismatch |
| <a id="mc-031"></a>MC-031 | Repeater console queries `ver`, `board` and `stats-*` read state; they do not change settings or send messages. | Repeater 1.18.0 | MC-S16, MC-S23 | 2026-11-09 | source-verified; not connected |
| <a id="mc-032"></a>MC-032 | Security fixes land only in the latest release; an empty advisory list is not evidence of safety. | Policy, dated | MC-S20 | 2026-11-09 | source-verified |

## Routing and packet labs

Scope: Meshtastic 2.7.26 (`54e0d8d0ab2ff56b3a9ce967e53f79e49af560fb`) and MeshCore 1.18.0 (`81dbae592ffad40b4212bc0b37e82b38da08f4bc`); client none unless stated; board any. Rows RT-X01–RT-X07 and RT-X10 were checked by the routing-inspector lane, which fetched the pinned files and read the quoted passages. Line numbers marked ~ were counted in the fetched text. The integrator merged these rows without re-fetching. Not executed, not hardware-tested.

| ID | Statement | Scope | Evidence | Checked | Status |
|---|---|---|---|---|---|
| <a id="rt-x01"></a>RT-X01 | A received packet is rebroadcast only if it is not to or from the node, has hop limit > 0, a nonzero ID and a rebroadcasting role/mode. A packet with a next-hop preference is relayed only by the node whose last node-number byte matches; that relay sends through `NextHopRouter::send()`, which sets `relay_node` to itself and `next_hop` to its own saved preference (or none). A copy with no preference goes through `FloodingRouter::send()` and keeps none. | Meshtastic 2.7.26 | MT-S10 `perhapsRebroadcast` (~L127–131) and `send()` | 2026-11-09 | source-verified |
| <a id="rt-x02"></a>RT-X02 | The over-air header is a 16-byte struct: to (4), from (4), id (4), flags (1), channel hash (1), next_hop (1), relay_node (1), then the encrypted payload. Flags: hop limit `0x07`, want-ACK `0x08`, via-MQTT `0x10`, hop start `0xE0` (shift 5). | Meshtastic 2.7.26 | MT-S35 (`PacketHeader`, masks, `MESHTASTIC_HEADER_LENGTH 16`); MT-S12 `beginSending` | 2026-11-09 | source-verified; byte order of the 32-bit fields **unresolved** (not stated in source; not taught) |
| <a id="rt-x03"></a>RT-X03 | The serial stream API frames each protobuf with `0x94 0xC3` and a big-endian 16-bit length. | Meshtastic 2.7.26; serial only | MT-S36 | 2026-11-09 | source-verified (serial only; BLE not inspected) |
| <a id="rt-x04"></a>RT-X04 | A packet serializes as header, optional 4 transport-code bytes (route types 0 and 3 only), path_len, path, payload. Header `0bVVPPPPRR`: route bits 0–1, payload type bits 2–5, version bits 6–7; TXT_MSG 2, ACK 3, ADVERT 4, GRP_TXT 5, PATH 8; FLOOD 1, DIRECT 2. The duplicate-detection hash covers payload type and payload (plus path_len for TRACE), not the path. | MeshCore 1.18.0 | MC-S08; MC-S09 (`writeTo`, `calculatePacketHash`) | 2026-11-09 | source-verified |
| <a id="rt-x05"></a>RT-X05 | Over USB serial each companion frame is `'<'` (app → radio) or `'>'` (radio → app) plus a 2-byte little-endian length; over BLE one frame travels per write or notification. | MeshCore 1.18.0 companion | MC-S25; MC-S15 | 2026-11-09 | source-verified |
| <a id="rt-x06"></a>RT-X06 | `CMD_SEND_TXT_MSG` (2) carries text type (1), attempt (1), timestamp (4), a 6-byte contact public-key prefix and the text. The radio answers `RESP_CODE_SENT` (6) with a flood/direct flag, the 4-byte expected ACK and a 4-byte timeout estimate. `PUSH_CODE_SEND_CONFIRMED` = `0x82`; `CMD_RESET_PATH` = 13. Multi-byte integers are little-endian. | MeshCore 1.18.0 companion | MC-S12; MC-S15 | 2026-11-09 | source-verified |
| <a id="rt-x07"></a>RT-X07 | An addressed payload (TXT_MSG, REQ, RESPONSE, PATH) is destination hash (1), source hash (1), cipher MAC (2), ciphertext. A group text is channel hash (1, first byte of SHA-256 of the channel key), MAC (2), ciphertext. An advert is public key (32), timestamp (4), signature (64), app data. 16- and 32-bit fields are little-endian. | MeshCore 1.18.0 | MC-S17 | 2026-11-09 | source-verified (docs at the pinned commit; the ACK "CRC" wording is superseded by MC-030) |
| <a id="rt-x08"></a>RT-X08 | In the course's routing labs, links are learner-set audibility per direction, and moving a node is a learner action that replaces the link set. Neither predicts real radio coverage. | Course labs | `src/lib/routing.ts` `set-links`; `src/fixtures/routing-presets.ts` | 2026-11-09 | teaching-model (definition) |
| <a id="rt-x09"></a>RT-X09 | An opaque encrypted unicast with channel hash 0 is treated as a possible PKI packet. | Meshtastic 2.7.26 | MT-S14 (`RoutingModule.cpp` L13–22), as recorded in the course's Meshtastic research | 2026-11-09 | source-verified by the research pass; **not re-fetched** by the routing lane or the integrator |
| <a id="rt-x10"></a>RT-X10 | A PKI-encrypted DM is sent with header channel byte 0, and the receiver attempts PKI decryption of a channel-0 packet addressed to it when both peers' public keys are known. Decrypting such a DM depends on peer keys, not on the shared primary channel's name, hash or PSK. | Meshtastic 2.7.26 | MT-S15 decode (~L433–439; the routing SPEC reviewer counted L445–452) and encode (~L657–659; reviewer L672–675) | 2026-11-09 | source-verified (routing-lane repair) |

## Radio physics and calculation

| ID | Statement | Scope | Evidence | Checked | Status |
|---|---|---|---|---|---|
| <a id="rf-c01"></a>RF-C01 | SX1276-class packet airtime is preamble time plus payload symbols × symbol time, with Ts = 2^SF / BW. | SX1276 Rev. 4, SF7–12 | RF-S01 §4.1.1.7 | 2026-11-09 | verified-document |
| <a id="rf-c02"></a>RF-C02 | Low-data-rate optimization is mandated when symbol time exceeds 16 ms; header and CRC are independent inputs. | SX1276 Rev. 4 | RF-S01 p. 31, p. 114 | 2026-11-09 | verified-document |
| <a id="rf-c03"></a>RF-C03 | 20 physical bytes at SF7, 125 kHz, CR 4/5, 8-symbol preamble, explicit header and CRC on take 56.576 ms (driver rounds to 57 ms). | RF-F01 inputs | RF-S01, RF-S02 | 2026-11-09 | verified-calculation |
| <a id="rf-c04"></a>RF-C04 | The same packet at SF12 with low-data-rate optimization takes 1318.912 ms (driver: 1319 ms). | RF-F02 inputs | RF-S01, RF-S02 | 2026-11-09 | verified-calculation |
| <a id="rf-c05"></a>RF-C05 | Mesh header and encryption bytes, extra hops, ACKs and retries add airtime and must be counted separately from the message text. | Calculator contract | RF-S01 PL definition | 2026-11-09 | verified-document + proposed |
| <a id="rf-c06"></a>RF-C06 | Free-space path loss ≈ 32.4 + 20 log10(f in MHz) + 20 log10(d in km) dB, which assumes no obstruction; at 915 MHz and 1 km it is about 91.6 dB. | ITU-R P.525-5; no terrain | RF-S03 Annex §2.3 | 2026-11-09 | verified-calculation |
| <a id="rf-c07"></a>RF-C07 | Synthetic link budget: 14 dBm + 2 dBi − 1 dB − 115 dB + 2 dBi − 1 dB = −99 dBm; against an assumed −120 dBm sensitivity the margin is 21 dB. With 25 dB extra loss: −124 dBm and −4 dB. | Synthetic values only | RF-F03, RF-F04 | 2026-11-09 | verified-calculation |
| <a id="rf-c08"></a>RF-C08 | Battery runtime needs supply-consistent currents, state fractions, usable capacity and explicit losses. | Synthetic model | RF-S04; HW-S01; HW-S03 | 2026-11-09 | verified-document |
| <a id="rf-c09"></a>RF-C09 | dB expresses a power ratio as 10 log10(P2/P1); dBm is power relative to 1 mW. Adding dB values multiplies ratios: +3 dB ≈ ×2, +10 dB = ×10. | Definition | RF-S06 | 2026-11-09 | definition + verified-calculation |
| <a id="rf-c10"></a>RF-C10 | Wavelength λ = c / f, so 915 MHz has λ ≈ 0.328 m. | Definition | RF-S03 (λ in P.525 equations) | 2026-11-09 | definition + verified-calculation |
| <a id="rf-c11"></a>RF-C11 | Clear line of sight is not enough: an obstacle inside the first Fresnel ellipsoid around the direct path means diffraction can't be neglected, so it can add loss. The first ellipsoid's radius at a point is r = √(λ·d1·d2 / (d1 + d2)) (n = 1). At 915 MHz, midway along 2 km, r ≈ 12.8 m (the practical-units form with its rounded 550 constant gives ≈ 12.9 m). | Geometry; no clearance threshold claimed; not a coverage prediction | RF-S05 Annex 1 §2.1, eqs (2)–(3), p. 3 | 2026-11-09 | verified-document + verified-calculation |
| <a id="rf-c12"></a>RF-C12 | RSSI is the radio's estimate of received power in dBm; SNR compares signal with noise in dB. Neither alone proves a packet was decoded or delivered: collisions, wrong settings or keys, and routing also matter. | Board any | RF-S01 (register-level detail not quoted); LW-C02 | 2026-11-09 | definition; teaching-model |
| <a id="rf-c13"></a>RF-C13 | Two transmitters that cannot hear each other may transmit at once; a receiver between them may decode neither (hidden transmitters). This course's simulator does not model collisions. | Concept | MT-F01 hidden variant; MT-C04 | 2026-11-09 | teaching-model |
| <a id="rf-c15"></a>RF-C15 | Changing one RF-F01 input at a time: SF8 → 102.912 ms (38 payload symbols); 250 kHz → 28.288 ms; CR 4/8 → 78.08 ms. Continuing up in SF (LDRO on from SF11): SF9 185.344 ms, SF10 370.688 ms, SF11 741.376 ms. | RF-F01 variants; formula only | RF-C01 formula, executed for Module 01 and in `src/lib/rf.ts` | 2026-11-09 | verified-calculation; not driver cross-checked |
| <a id="rf-c16"></a>RF-C16 | LoRaMac-node v4.7.0 computes the same symbol count in integer form, (4·(ceil-term·(CR+4) + preamble + 12) + 1)·2^(SF−2), then divides by bandwidth in Hz and rounds **up** to whole milliseconds. It enables low-data-rate optimization for 125 kHz at SF11–12 and 250 kHz at SF12, which matches the datasheet's over-16 ms rule at 125/250/500 kHz. | SX1276 driver, SF7–12, 125/250/500 kHz | RF-S02 `SX1276GetLoRaTimeOnAirNumerator`, `SX1276GetTimeOnAir`, `SX1276GetLoRaBandwidthInHz` | 2026-11-09 | source-verified (read for Lab A); driver not re-executed |
| <a id="rf-c14"></a>RF-C14 | Antenna polarization mismatch adds loss; the free-space formula assumes it away. | Concept | RF-S03 assumptions | 2026-11-09 | definition |

## Field planning, logs and exports

| ID | Statement | Scope | Evidence | Checked | Status |
|---|---|---|---|---|---|
| <a id="fld-c01"></a>FLD-C01 | Average current is time-weighted: transmit current applies only during transmit time, and the other current applies for the rest of the hour, so transmit time replaces listening time rather than adding to it. Lab D splits the non-transmit time into listening and sleep and adds GPS as a separate overlay. | Synthetic model; any board | RF-S04 cell C10 (and C16 for life in days); RF-C08 | 2026-11-09 | verified-document (structure) |
| <a id="fld-c02"></a>FLD-C02 | Runtime h = (capacity mAh ÷ 1000 × battery V × usable fraction × (1 − cold derating)) × converter efficiency ÷ (average mA ÷ 1000 × load-rail V). With equal voltages this is capacity × usable × efficiency ÷ average mA, the workbook's form with its fixed 0.9 replaced by explicit inputs. Cold derating is a user assumption, not a measured cell property. | Synthetic model | Derived algebra (Wh and W units) from RF-C08 and FLD-C01 | 2026-11-09 | definition (derived); not a benchmark |
| <a id="fld-c03"></a>FLD-C03 | The course's delivery ratio is unique scheduled messages received ÷ messages scheduled. Duplicates count once, retries and other on-air attempts are reported separately, nothing scheduled means no sample (not 0%), and the sample size is shown beside every percentage. A small sample such as 17 of 20 does not establish reliability, and no confidence interval is claimed. | Course method | Course brief; RF-C05 (retries are extra packets) | 2026-11-09 | definition (course method) |
| <a id="fld-c04"></a>FLD-C04 | The field-log CSV uses CRLF records and quotes fields containing commas, quotes or line breaks, doubling embedded quotes. Text cells starting with `=`, `+`, `-`, `@`, tab, CR, LF or full-width lookalikes get a leading `'` inside quotes. Numeric columns are written as plain numbers, and blanks stay blank. | Export format | FLD-S01 §2; FLD-S02 | 2026-11-09 | verified-document; Excel re-save caveat per FLD-S02 |
| <a id="fld-c05"></a>FLD-C05 | A conservative hardware test starts short, keeps endpoints and RF settings fixed and varies one factor per repeat. One sender's channel share = packet airtime ÷ send interval (56.576 ms every 30 s ≈ 0.19%). Local rules and community guidance come first. | Proposed practice + arithmetic | RF-C03; NTX-C05; REG-C01 | 2026-11-09 | proposed + verified-calculation |

## Hardware and safety

| ID | Statement | Scope | Evidence | Checked | Status |
|---|---|---|---|---|---|
| <a id="hw-c01"></a>HW-C01 | Heltec WiFi LoRa 32 V3.2 (HF) is ESP32-S3 + SX1262 high-band hardware; V4 power and solar specifications cannot be substituted. | V3.2 HTIT-WB32LA HF | HW-S01 §§1, 3; HW-S02 | 2026-11-09 | verified-document; revision inconsistency noted |
| <a id="hw-c02"></a>HW-C02 | Heltec V3.2 takes nominal 5 V USB and a single-cell lithium battery (3.3–4.2 V) with the stated ranges. | V3.2 | HW-S01 §3.2 | 2026-11-09 | verified-document |
| <a id="hw-c03"></a>HW-C03 | RAK4631(H) + RAK19007 is an nRF52840 + SX1262 high-band candidate with BLE and USB, no onboard Wi-Fi. | H + second-generation base | HW-S03, HW-S04 | 2026-11-09 | verified-document |
| <a id="hw-c04"></a>HW-C04 | MeshCore 1.18.0 has companion (BLE, USB), repeater and room-server targets for Heltec V3, RAK4631 and T1000-E. | MeshCore 81dbae5 | HW-S10 | 2026-11-09 | documented-target |
| <a id="hw-c05"></a>HW-C05 | T1000-E uses an LR1110 with internal antennas, a 700 mAh battery, IP65 enclosure, 4.7–5.5 V input and 0–45 °C charging. | T1000-E; SKU unresolved | HW-S06 | 2026-11-09 | verified-document |
| <a id="hw-c06"></a>HW-C06 | T1000-E exact-image DFU/erase instructions and the "do not use NRF-OTA" warning override generic update advice. | T1000-E | HW-S07, HW-S08 | 2026-11-09 | verified-document; not run |
| <a id="hw-c07"></a>HW-C07 | Two or three identical RAK assemblies minimize hardware differences but remain untested candidates. | Proposed kit | HW-C03, HW-C04, HW-C11 | 2026-11-09 | proposed |
| <a id="hw-c08"></a>HW-C08 | Meshtastic role docs describe CLIENT forwarding and deprecate REPEATER as of 2.7.11; the course does not use REPEATER as a default. | Docs 2.7 / 2.8 | MT-S13; HW-S11 | 2026-11-09 | verified-document |
| <a id="hw-c09"></a>HW-C09 | Do not power RAK transceivers without their correct antennas; observe RAK19007 input and polarity limits. | RAK4631/19007 | HW-S03, HW-S04, HW-S05 | 2026-11-09 | verified-document |
| <a id="hw-c10"></a>HW-C10 | Outdoor protection must account for every conductive path; no single arrestor guarantees a safe installation. | Educational | HW-S12, HW-S13 | 2026-11-09 | verified-document + proposed |
| <a id="hw-c11"></a>HW-C11 | Meshtastic 2.7.26 has actively supported targets `heltec-v3`, `rak4631` and `tracker-t1000-e`; the T1000-E build excludes Wi-Fi. | Meshtastic 54e0d8d | HW-S14 | 2026-11-09 | documented-target |
| <a id="hw-c12"></a>HW-C12 | Board recovery uses board-specific bootloaders: Heltec V3 via PRG/BOOT + RST; RAK4631 via double-reset UF2 drive (RAK4631-R first needs conversion); T1000-E via its own DFU sequence. Erase and factory reset destroy settings and identity keys. | Named boards | HW-S02, HW-S05, HW-S07, HW-S08; MC-S04 | 2026-11-09 | verified-document; not run |

## US regulation

Jurisdiction: United States, eCFR Title 47 issue 2026-11-05. Educational, not legal advice.

| ID | Statement | Scope | Evidence | Checked | Status |
|---|---|---|---|---|---|
| <a id="reg-c01"></a>REG-C01 | Part 15 operation has no frequency entitlement and must not cause harmful interference. | US | REG-S01 (a)–(c) | 2026-11-09 | verified-document |
| <a id="reg-c02"></a>REG-C02 | Antenna changes need the actual rule, grant and manual reviewed, not just a matching connector. | US | REG-S02 | 2026-11-09 | verified-document; device unresolved |
| <a id="reg-c03"></a>REG-C03 | §15.247's 1 W ceiling is conditional, not universal permission for fixed-channel narrow-band operation. | US | REG-S03 (a), (b), (e), (f) | 2026-11-09 | verified-document |
| <a id="reg-c04"></a>REG-C04 | §15.249 limits 902–928 MHz fundamentals to 50 mV/m at 3 m (a field strength, not conducted power). | US | REG-S04 (a), (c) | 2026-11-09 | verified-document |
| <a id="reg-c05"></a>REG-C05 | Amateur rules generally prohibit messages encoded to obscure meaning; a ham licence is not a blanket workaround for encrypted mesh. | US amateur service | REG-S05 (a)(3)–(4) | 2026-11-09 | verified-document |
| <a id="reg-c06"></a>REG-C06 | No candidate device's FCC grant, mode or antenna conditions were confirmed by this course. | All hardware candidates | REG-S07 (HTTP 403) | 2026-11-09 | unresolved |

## North Texas community example

| ID | Statement | Scope | Evidence | Checked | Status |
|---|---|---|---|---|---|
| <a id="ntx-c01"></a>NTX-C01 | NTX Meshtastic guidance is county-sensitive; its default is not a universal local preset. | DFW / North Texas | NTX-S01, NTX-S02 | 2026-11-09 | verified-document |
| <a id="ntx-c02"></a>NTX-C02 | The join page publishes MeshCore 910.525 MHz / 62.5 kHz / SF7 / "CR5", while the map page points MeshCore users to Discord for current settings. | DFW / North Texas | NTX-S01, NTX-S02 | 2026-11-09 | verified-document; not field-validated |
| <a id="ntx-c03"></a>NTX-C03 | The NTX broadcast-interval table and its detailed prose disagree. | Dated | NTX-S01 | 2026-11-09 | verified-document; unresolved cadence |
| <a id="ntx-c04"></a>NTX-C04 | The NTX map is a preset map, not live coverage evidence. | NTX map page | NTX-S02 | 2026-11-09 | verified-document |
| <a id="ntx-c05"></a>NTX-C05 | Listen first, make one short introduction, wait for a reply and coordinate repeated tests out of band. | Learner etiquette | NTX-S01 | 2026-11-09 | proposed |

## Modules 03–12: Meshtastic details

`CUR` rows were added with modules 03–12, the glossary, the comparison page and the appendices, for statements the rows above don't cover. Same baselines: Meshtastic `2.7.26.54e0d8d` Beta with protobufs `6b1ded4`; MeshCore role releases `1.18.0` at `81dbae5`. Their sources are the CUR source rows (CUR-S01 to CUR-S11) in the source registry.

| ID | Statement | Scope | Evidence | Checked | Status |
|---|---|---|---|---|---|
| <a id="cur-c01"></a>CUR-C01 | A node whose LoRa region is unset does not transmit; the region must be set before any on-air step. The region enum's zero value is `UNSET`. | Meshtastic 2.7 docs; protobufs 6b1ded4 | CUR-S05; CUR-S04 L800–830 | 2026-11-09 | verified-document |
| <a id="cur-c02"></a>CUR-C02 | An unset modem preset means `LONG_FAST`. The hop limit defaults to 3 and cannot exceed 7. | Meshtastic 2.7 docs; protobufs 6b1ded4 | CUR-S05; CUR-S04 L1076–1134 | 2026-11-09 | verified-document |
| <a id="cur-c03"></a>CUR-C03 | Frequency slot 0 means "derive the slot from a hash of the primary channel's name, modulo the region's number of slots"; a value from 1 to that number picks the slot explicitly. Custom modem settings store the coding rate as its denominator (5 for 4/5). | Protobufs 6b1ded4; 2.7 docs | CUR-S04 L1144–1153; CUR-S05; MT-S12 L845–871 | 2026-11-09 | source-verified |
| <a id="cur-c04"></a>CUR-C04 | The over-the-air Meshtastic header is 16 bytes in the clear: destination (4), sender (4), packet ID (4), flags (1: hop limit in bits 0–2, want-ACK 0x08, via-MQTT 0x10, hop start in bits 5–7), channel hash (1), next hop (1), relay node (1). The whole LoRa payload is at most 255 bytes. | Firmware 54e0d8d | CUR-S02 L18–54 | 2026-11-09 | source-verified |
| <a id="cur-c05"></a>CUR-C05 | In the packet schema, receive time, receive SNR, transmit-after time and queue priority are local fields never sent over the radio. The channel *index* is local; on air only a one-byte channel hash travels. A packet carries either a decoded `Data` payload or opaque encrypted bytes. | Protobufs 6b1ded4 | CUR-S01 L1504–1801 | 2026-11-09 | source-verified |
| <a id="cur-c06"></a>CUR-C06 | The decoded `Data` payload names an application port and carries that application's bytes. Ports include text 1, position 3, node info 4, routing 5, admin 6, telemetry 67, traceroute 70 and map report 73. | Protobufs 6b1ded4 | CUR-S01 L1168–1217; CUR-S03 | 2026-11-09 | source-verified |
| <a id="cur-c07"></a>CUR-C07 | Public-key (PKI) encryption adds 12 bytes to the payload (`MESHTASTIC_PKC_OVERHEAD`). | Firmware 54e0d8d | CUR-S02 L20–22; MT-S21 | 2026-11-09 | source-verified |
| <a id="cur-c08"></a>CUR-C08 | A traceroute reply carries the node numbers recorded toward the destination and back, with SNR values scaled by 4. It describes one packet's journey at one moment, not a stable route, and relays that do not add themselves leave no entry. | Protobufs 6b1ded4 | CUR-S01 L1018–1038 | 2026-11-09 | source-verified (fields); teaching-model (interpretation) |
| <a id="cur-c09"></a>CUR-C09 | The schema comments give node-info broadcasts a default of 900 s and position broadcasts 15 minutes, the latter only when position has changed significantly. These are schema comments, not a measured traffic rate. | Protobufs 6b1ded4 | CUR-S04 L227–231, L357–361 | 2026-11-09 | source-verified (comments); firmware defaults code not re-read |
| <a id="cur-c10"></a>CUR-C10 | MQTT "Encryption enabled" chooses encrypted or unencrypted upload; JSON output is unencrypted; client proxy uses the phone's network; map reporting sends an unencrypted report with names, node ID, position at the map report's own precision setting (CUR-C27), hardware, role, firmware, region, preset and primary channel name; an unset server means the default public server. "OK to MQTT" is a polite request, not cryptography. | Meshtastic 2.7 docs | CUR-S06; CUR-S05 | 2026-11-09 | verified-document; no broker run |
| <a id="cur-c11"></a>CUR-C11 | Uplink and downlink are per-channel switches: uplink sends that channel's mesh traffic to the internet through any gateway node; downlink forwards traffic seen on the internet onto the local mesh. | Protobufs 6b1ded4; 2.7 docs | CUR-S07; MT-S19 | 2026-11-09 | source-verified |
| <a id="cur-c12"></a>CUR-C12 | A channel-sharing URL encodes a `ChannelSet`: every enabled channel's settings, which include its key, plus the LoRa configuration. Whoever has the URL has the key. That a QR code shows the same URL is an inference; the schema doesn't mention QR codes. | Protobufs 6b1ded4 | CUR-S08; CUR-S07 | 2026-11-09 | source-verified; QR qualified |
| <a id="cur-c13"></a>CUR-C13 | A channel key is 0 bytes (no encryption), 16 bytes (AES-128) or 32 bytes (AES-256). One-byte shorthand values select keys printed in the source, which the schema calls "only minimally secure". | Protobufs 6b1ded4 | CUR-S07 | 2026-11-09 | source-verified |
| <a id="cur-c14"></a>CUR-C14 | Position precision is a per-channel setting: the number of bits of precision in shared positions. | Protobufs 6b1ded4 | CUR-S07 | 2026-11-09 | source-verified |
| <a id="cur-c27"></a>CUR-C27 | MQTT map reports are controlled separately from channel position packets. A location goes into a map report only when map reporting is enabled **and** the map settings' report-location flag is on; its precision comes from the MQTT map-report settings' own `position_precision`, which the firmware replaces with its map default when outside 12–15 bits, and the coordinates are truncated to that precision. A channel's position precision (CUR-C14) does not set map-report precision, so to control map exposure, check the map settings or turn map reporting off. The 2.7 docs give the map default as "a maximum deviation of around 1459m". | Firmware 54e0d8d; 2.7 docs | CUR-S11; CUR-S06; CUR-S07 | 2026-11-09 | source-verified; no broker run |

## Modules 03–12: MeshCore details

| ID | Statement | Scope | Evidence | Checked | Status |
|---|---|---|---|---|---|
| <a id="cur-c15"></a>CUR-C15 | The first header byte packs route type (bits 0–1), payload type (bits 2–5) and payload version (bits 6–7). Route types: 0 transport-flood, 1 flood, 2 direct, 3 transport-direct. Payload types include request 0, response 1, text 2, ACK 3, advert 4, group text 5, path 8 and trace 9. So `0x09` is a flooded text message, `0x0A` a direct one, `0x11` a flooded advert and `0x12` a zero-hop advert. | 1.18.0 | CUR-S09; MC-S08; MC-S09 | 2026-11-09 | source-verified + verified-calculation |
| <a id="cur-c16"></a>CUR-C16 | Repeater and room-server radio settings are set with `set radio <freq>,<bw>,<sf>,<cr>` and need a reboot. The documented default `869.618,62.5,8,5` lies outside the US 902–928 MHz band, so a US node must be set to locally coordinated values. | 1.18.0 docs | CUR-S10 | 2026-11-09 | verified-document |
| <a id="cur-c17"></a>CUR-C17 | `advert` sends a flood advert. `set flood.advert.interval` takes hours (3–168, default 47 on repeaters and room servers). The zero-hop `set advert.interval` takes 60–240 minutes. A factory-fresh node ships with a 2-minute zero-hop interval; saving any setting resets an interval below the 60-minute minimum to 0 (off), on the assumption the node is now deliberately configured; an explicit 60–240 value keeps zero-hop adverts running. | 1.18.0 docs | CUR-S10 | 2026-11-09 | verified-document; not hardware-tested |
| <a id="cur-c18"></a>CUR-C18 | The docs give `set flood.max` a range of 0–64 and a default of 64, while the six-bit encoding holds at most 63 hops (MC-016). | 1.18.0 docs and code | CUR-S10; MC-S09 | 2026-11-09 | qualified; mismatch documented |
| <a id="cur-c19"></a>CUR-C19 | On a repeater, `neighbors` lists at most the 8 most recent adverts as public-key prefix, timestamp and SNR × 4; `clock` shows UTC time. Both read state. | 1.18.0 docs | CUR-S10 | 2026-11-09 | verified-document; not connected |
| <a id="cur-c20"></a>CUR-C20 | `password` echoes the new admin password, and any node using it joins the admin ACL; `erase` (serial only) is destructive; `reboot` sends no reply. None of these belong in a read-only exercise. | 1.18.0 docs | CUR-S10 | 2026-11-09 | verified-document |

## Course method (modules 03–12)

| ID | Statement | Scope | Evidence | Checked | Status |
|---|---|---|---|---|---|
| <a id="cur-c21"></a>CUR-C21 | At the course's teaching RF profile (SF7, 125 kHz, CR 4/5, 8-symbol preamble, explicit header, CRC on), an assumed 40-byte physical payload takes 68 payload symbols and 82.176 ms; 25 bytes take 61.696 ms and 60 bytes 112.896 ms. The 40-byte size is a synthetic assumption, not a measured Meshtastic or MeshCore frame. | Formula RF-C01 with RF-F01 settings | RF-C01; RF-S01 | 2026-11-09 | verified-calculation |
| <a id="cur-c22"></a>CUR-C22 | Packet delivery ratio is unique deliveries ÷ scheduled messages, reported with the sample size. 17 of 20 is 85%; at n = 20 one message moves the result 5 percentage points. On-air attempts (originals, relays, retries, ACKs) are counted separately and never go in the denominator. | Arithmetic; course method | RF-C05; MT-C12 | 2026-11-09 | verified-calculation + proposed |
| <a id="cur-c23"></a>CUR-C23 | A sound field comparison changes one variable per repeat, keeps RF settings, endpoints and firmware fixed, and records measurements (counts, RSSI, SNR, times) separately from inferences (route, cause). | Course method | RF-C12; MT-C13; MC-030 | 2026-11-09 | proposed |
| <a id="cur-c24"></a>CUR-C24 | Outside the US, start at the national regulator's own rules and the device's authorization there, then the local community. US Part 15 and Part 97 conclusions don't transfer. | International workflow | REG-C01–REG-C06 scope | 2026-11-09 | proposed |
| <a id="cur-c26"></a>CUR-C26 | Synthetic same-rail battery example: 1 % transmit at 120 mA, 98 % receive at 15 mA, 1 % sleep at 0.1 mA average 15.901 mA; 2000 mAh × 0.8 usable × 0.9 assumed efficiency gives 90.56 h. Every input is invented, not a board benchmark. | RF-C08 model | RF-C08; RF-S04 | 2026-11-09 | verified-calculation |
| <a id="cur-c25"></a>CUR-C25 | No coverage or community map is a complete census: absence on a map does not mean no node is there. | Maps generally | NTX-C04; CUR-C10; MC-029 | 2026-11-09 | qualified |

## Fixtures

Synthetic inputs used by lessons and tests. None is a capture or measurement.

| ID | Fixture | Where | Status |
|---|---|---|---|
| <a id="mt-f01"></a>MT-F01 | Meshtastic diamond: A–B, A–C, B–D, C–D, optional B–C, no A–D. All CLIENT, rebroadcast ALL, channel broadcast from A with hop limit 1, D watched. | `src/fixtures/routing.ts` `mtDiamond` | teaching-model (MT-C03–MT-C08) |
| <a id="mc-f04"></a>MC-F04 | MeshCore known path: A and D companions (repeat off), B and C repeaters; A stores [B] to D and D independently stores [B] to A; B–D broken by default. | `src/fixtures/routing.ts` `mcKnownPath` | teaching-model (MC-008–MC-012) |
| <a id="rf-f01"></a>RF-F01 | SF7 / 125 kHz / CR 4/5 / 20 B / 8-symbol preamble / explicit header / CRC on / LDRO off. | Lesson 01 worked example | verified-calculation (RF-C03) |
| <a id="rf-f02"></a>RF-F02 | As RF-F01 at SF12 with LDRO on. | Lesson 01 worked example | verified-calculation (RF-C04) |
| <a id="rf-f03"></a>RF-F03 | Link budget 14 dBm, 2 dBi each end, 1 dB loss each end, 115 dB path loss, −120 dBm assumed sensitivity. | Lesson 01 worked example | verified-calculation (RF-C07) |
| <a id="fld-f01"></a>FLD-F01 | Battery: 2000 mAh, 3.7 V battery and load, 80% usable, 90% efficient; 120 / 15 / 0.1 mA at 1% / 98% / 1% → 15.901 mA, 90.5603421 h. | `src/fixtures/field.ts` `FIELD_F01_BATTERY` | verified-calculation (FLD-C02) |
| <a id="fld-f02"></a>FLD-F02 | Traffic: 60 RF-F01 packets/h (56.576 ms each), listening the rest of the time. Sample log: forward 17 of 20 scheduled (85%, 23 attempts); reverse 14 of 20 (70%) under different conditions; one row with a missing receive count, excluded. | `src/fixtures/field.ts` | synthetic (FLD-C01, FLD-C03) |
| <a id="rf-f04"></a>RF-F04 | RF-F03 with 25 dB extra assumed loss. | Lesson 01 worked example | verified-calculation (RF-C07) |
