/**
 * Packet inspector: small synthetic packet fixtures in three views (over the air,
 * phone/companion transport, application). Pure data plus validated helpers.
 *
 * Byte offsets are shown only where the pinned layout was read (view.offsets = true):
 * MeshCore 1.18.0 packet_format.md, payloads.md, Packet.cpp, companion MyMesh.cpp;
 * Meshtastic 2.7.26 RadioInterface.h/.cpp and StreamAPI.cpp (RT-X02…RT-X07).
 * Bracketed values are placeholders, never bytes. Synthetic one-byte prefixes
 * (a1, b2, d4) are invented fixture values. No fixture is a capture or a valid frame.
 */

export const INSPECTOR_VERSION = 1;
export const VIEWS = ['air', 'transport', 'app'] as const;
export type View = (typeof VIEWS)[number];

export interface Field {
  name: string;
  offset?: number;
  size: number | 'rest';
  /** Hex only for bytes fixed by the pinned layout or the synthetic prefixes; else a [placeholder]. */
  value: string;
  schematic: boolean;
  /** Set only where the pinned source states the byte order. */
  endian?: 'LE' | 'BE';
  /** Encrypted: unreadable without the right key. */
  opaque?: boolean;
  meaning: string;
  sees: { observer: string; relay: string; recipient: string };
  claims: string[];
}

export interface PacketView {
  title: string;
  summary: string;
  /** True only when the field order and sizes come from the pinned layout. */
  offsets: boolean;
  note?: string;
  fields: Field[];
}

export interface PacketFixture {
  id: string;
  protocol: 'meshtastic' | 'meshcore';
  label: string;
  scenario: string;
  views: Record<View, PacketView>;
}

function invalid(msg: string): never {
  throw new Error(`Invalid inspector input: ${msg}`);
}

// ---------- verified encoders ----------

const MC_ROUTE = { TRANSPORT_FLOOD: 0, FLOOD: 1, DIRECT: 2, TRANSPORT_DIRECT: 3 } as const;
const MC_PAYLOAD = { TXT_MSG: 2, ACK: 3, ADVERT: 4, GRP_TXT: 5, PATH: 8 } as const;

/** MeshCore header 0bVVPPPPRR (RT-X04; MC-S08). */
export function mcHeader(payload: keyof typeof MC_PAYLOAD, route: keyof typeof MC_ROUTE, version = 0): number {
  if (!(payload in MC_PAYLOAD) || !(route in MC_ROUTE) || !Number.isInteger(version) || version < 0 || version > 3) invalid('unknown MeshCore header part');
  return (version << 6) | (MC_PAYLOAD[payload] << 2) | MC_ROUTE[route];
}

/** MeshCore path_len: bits 6–7 = hash width − 1 (3 reserved), bits 0–5 = count; path storage is 64 bytes (MC-014, MC-016). */
export function decodeMcPathLen(byte: unknown): { width: number; count: number; bytes: number } {
  if (typeof byte !== 'number' || !Number.isInteger(byte) || byte < 0 || byte > 255) invalid('path_len must be one byte');
  const width = (byte >> 6) + 1;
  const count = byte & 0x3f;
  if (width === 4) invalid('path hash width code 3 is reserved');
  if (width * count > 64) invalid(`path of ${width * count} bytes exceeds 64-byte storage`);
  return { width, count, bytes: width * count };
}

/** Meshtastic header flags: hop limit bits 0–2, want-ACK 0x08, via-MQTT 0x10, hop start bits 5–7 (RT-X02). */
export function mtFlags(f: { hopLimit: number; hopStart: number; wantAck?: boolean; viaMqtt?: boolean }): number {
  const ok = (n: number) => Number.isInteger(n) && n >= 0 && n <= 7;
  if (!ok(f.hopLimit) || !ok(f.hopStart) || f.hopLimit > f.hopStart) invalid('hop limit and hop start are 0–7 with limit ≤ start');
  return f.hopLimit | (f.wantAck ? 0x08 : 0) | (f.viaMqtt ? 0x10 : 0) | (f.hopStart << 5);
}

const hex = (...b: number[]) => b.map((x) => `0x${x.toString(16).padStart(2, '0')}`).join(' ');

// ---------- fixture builders ----------

type F = Omit<Field, 'offset' | 'schematic'>;
const OFF_AIR = { observer: 'Not on the air: an RF listener never sees this.', relay: 'Never sees it.', recipient: 'Never sees this frame; its own app gets a different frame from its own radio.' };

/** Assigns contiguous offsets for verified layouts; placeholders are marked schematic. */
function view(title: string, summary: string, offsets: boolean, fields: F[], note?: string): PacketView {
  let at = 0;
  return {
    title,
    summary,
    offsets,
    note,
    fields: fields.map((f) => {
      const out: Field = { ...f, schematic: f.value.startsWith('[') };
      if (offsets) {
        out.offset = at;
        if (f.size !== 'rest') at += f.size;
      }
      return out;
    }),
  };
}

const mcDirectAir = (relayed: boolean): F[] => [
  {
    name: 'header',
    size: 1,
    value: hex(mcHeader('TXT_MSG', 'DIRECT')),
    meaning: 'Payload version 0, payload type TXT_MSG (2), route DIRECT (2): bits 0b00 0010 10.',
    sees: { observer: 'In the clear: a direct text message.', relay: 'Reads the route type to choose direct handling.', recipient: 'Same as anyone: the header is not encrypted.' },
    claims: ['MC-017', 'RT-X04'],
  },
  {
    name: 'path_len',
    size: 1,
    value: hex(relayed ? 0x00 : 0x01),
    meaning: relayed ? 'Width bits 0 (1-byte hashes), count 0: no relays left.' : 'Width bits 0 (1-byte hashes), count 1: one relay entry follows.',
    sees: { observer: 'How many relay entries remain.', relay: relayed ? 'Nothing left to match.' : 'One entry left to match.', recipient: 'Count 0 on arrival: the path is used up.' },
    claims: ['MC-014', 'RT-X04'],
  },
  ...(relayed
    ? []
    : [
        {
          name: 'path',
          size: 1,
          value: '0xb2',
          meaning: 'Synthetic prefix of the next relay, B. A truncated public key, not a full identity.',
          sees: { observer: 'A relay whose prefix is b2 is expected to forward next; prefixes can collide.', relay: 'B matches its own prefix, removes it and forwards.', recipient: 'Never sees it: B removed it.' },
          claims: ['MC-009', 'MC-015'],
        },
      ]),
  {
    name: 'destination hash',
    size: 1,
    value: '0xd4',
    meaning: 'First byte of D’s public key (synthetic d4). Order is destination, then source.',
    sees: { observer: 'A short hash: links traffic to some key starting d4, not a verified person.', relay: 'Not needed to forward a direct packet.', recipient: 'D checks it matches its own key.' },
    claims: ['MC-017', 'RT-X07', 'MC-028'],
  },
  {
    name: 'source hash',
    size: 1,
    value: '0xa1',
    meaning: 'First byte of A’s public key (synthetic a1).',
    sees: { observer: 'A short hash of the sender, visible to anyone in range.', relay: 'Not needed to forward.', recipient: 'D looks up a contact whose key starts a1 to derive the shared secret.' },
    claims: ['MC-017', 'RT-X07', 'MC-028'],
  },
  {
    name: 'cipher MAC',
    size: 2,
    value: '[2-byte MAC]',
    meaning: 'Truncated HMAC-SHA256 over the ciphertext.',
    sees: { observer: 'Visible but meaningless without the key.', relay: 'Does not check it.', recipient: 'Checks it with the A–D secret before decrypting.' },
    claims: ['MC-022', 'RT-X07'],
  },
  {
    name: 'ciphertext',
    size: 'rest',
    value: '[encrypted: timestamp, text type and attempt, message text]',
    opaque: true,
    meaning: '“Plain text message” is the payload type; the body is encrypted.',
    sees: { observer: 'Only its length.', relay: 'Cannot read it: forwarding needs no key.', recipient: 'Decrypts it with the secret derived from A’s and D’s identities.' },
    claims: ['MC-017', 'MC-019'],
  },
];

const mcPhoneLater = (who: string): PacketView =>
  view(
    'Companion transport (not involved in this hop)',
    `${who} No phone frame is created at this step.`,
    false,
    [
      {
        name: 'companion frames',
        size: 'rest',
        value: '[none at this hop]',
        meaning: 'Repeaters forward in firmware. When D’s radio passes the message to D’s app it uses a companion frame whose layout this lab did not verify, so none is shown.',
        sees: OFF_AIR,
        claims: ['MC-018', 'LW-C03'],
      },
    ],
  );

export const PACKETS: readonly PacketFixture[] = [
  {
    id: 'mc-dm-direct',
    protocol: 'meshcore',
    label: 'MeshCore DM, direct via B (as A transmits)',
    scenario: 'A sends a text DM to D on its stored path [b2]. Synthetic prefixes: A a1, B b2, D d4.',
    views: {
      air: view('Over the air (LoRa frame payload)', 'Header, path, short hashes and MAC are clear; the body is encrypted.', true, mcDirectAir(false), 'No transport codes: route DIRECT (2), not TRANSPORT_DIRECT (3), so path_len sits at offset 1.'),
      transport: view(
        'Phone → companion radio (CMD_SEND_TXT_MSG)',
        'What A’s app sends to A’s radio. A different format from the LoRa frame.',
        true,
        [
          { name: 'command code', size: 1, value: '0x02', meaning: 'CMD_SEND_TXT_MSG.', sees: OFF_AIR, claims: ['RT-X06', 'MC-018'] },
          { name: 'text type', size: 1, value: '[text type]', meaning: 'Kind of text message.', sees: OFF_AIR, claims: ['RT-X06'] },
          { name: 'attempt', size: 1, value: '[attempt number]', meaning: 'Set by the app; retry policy belongs to the client, not a firmware rule.', sees: OFF_AIR, claims: ['RT-X06', 'MC-013'] },
          { name: 'timestamp', size: 4, value: '[send time]', endian: 'LE', meaning: '32-bit send time, little-endian.', sees: OFF_AIR, claims: ['RT-X06'] },
          { name: 'contact public-key prefix', size: 6, value: '[first 6 bytes of D’s public key]', meaning: 'Selects the contact. Not the 1-byte hash that goes on the air.', sees: OFF_AIR, claims: ['RT-X06', 'MC-018'] },
          { name: 'message text', size: 'rest', value: '[UTF-8 text]', meaning: 'Plain text, before the radio encrypts it.', sees: OFF_AIR, claims: ['RT-X06'] },
        ],
        'Over USB serial each frame is wrapped as “<” plus a 2-byte little-endian length (app to radio; replies use “>”). Over BLE one frame travels per write or notification (RT-X05). The radio replies RESP_CODE_SENT (0x06) with a flood/direct flag, the expected ACK value and a timeout estimate (RT-X06).',
      ),
      app: view('Application view', 'What people see in the apps.', false, [
        { name: 'conversation', size: 'rest', value: 'A → D: “Meet at the trailhead”', meaning: 'Sample text. The contact name in each app is local text, not proof of identity.', sees: { observer: 'Cannot see the text.', relay: 'Cannot see the text.', recipient: 'D’s app shows it once decrypted.' }, claims: ['MC-019'] },
        { name: 'A’s status', size: 'rest', value: 'Sent → waiting for ACK', meaning: 'Local send acceptance, a matching ACK, D’s display and a human reply are four different events.', sees: { observer: 'Cannot see it.', relay: 'Cannot see it.', recipient: 'D’s app does not see A’s status.' }, claims: ['MC-030'] },
      ]),
    },
  },
  {
    id: 'mc-dm-relayed',
    protocol: 'meshcore',
    label: 'MeshCore DM, as B forwards it',
    scenario: 'B matched b2, removed it and retransmits. Compare offsets with the previous fixture.',
    views: {
      air: view('Over the air (B’s forward)', 'path_len drops to 0, so every later field moves one byte left.', true, mcDirectAir(true)),
      transport: mcPhoneLater('B is a repeater.'),
      app: view('Application view', 'D’s app after decryption.', false, [
        { name: 'D’s inbox', size: 'rest', value: 'From A: “Meet at the trailhead”', meaning: 'D’s app displays it, then D’s radio returns an ACK. Display is not a human reply.', sees: { observer: 'Cannot see it.', relay: 'Cannot see it.', recipient: 'Sees the text.' }, claims: ['MC-030'] },
      ]),
    },
  },
  {
    id: 'mc-group',
    protocol: 'meshcore',
    label: 'MeshCore group (channel) text',
    scenario: 'A posts to a shared-key channel. Not all MeshCore traffic uses channel keys: DMs use peer keys.',
    views: {
      air: view('Over the air', 'A channel hash replaces the destination and source hashes.', true, [
        { name: 'header', size: 1, value: hex(mcHeader('GRP_TXT', 'FLOOD')), meaning: 'Payload type GRP_TXT (5), route FLOOD (1).', sees: { observer: 'In the clear: a group message being flooded.', relay: 'Repeaters may flood it (MC-005).', recipient: 'Same.' }, claims: ['RT-X04', 'MC-028'] },
        { name: 'path_len', size: 1, value: '0x00', meaning: 'As originated: no relays yet. Each repeater appends its prefix.', sees: { observer: 'Counts relays so far.', relay: 'Appends its own prefix.', recipient: 'Learns which relays the copy crossed.' }, claims: ['MC-008', 'MC-014'] },
        { name: 'channel hash', size: 1, value: '[first byte of SHA-256 of the channel key]', meaning: 'A hint for which key to try, not a secret and not unique.', sees: { observer: 'Can tell which channel hint is in use.', relay: 'Forwards without the key.', recipient: 'Tries keys whose hash matches.' }, claims: ['RT-X07', 'MC-020'] },
        { name: 'cipher MAC', size: 2, value: '[2-byte MAC]', meaning: 'Truncated HMAC under the channel key.', sees: { observer: 'Meaningless without the key.', relay: 'Does not check it.', recipient: 'Checks it with the channel key.' }, claims: ['MC-022'] },
        { name: 'ciphertext', size: 'rest', value: '[encrypted: timestamp, sender name, text]', opaque: true, meaning: 'Every key holder can read and write it; the sender name inside is unverified text.', sees: { observer: 'Only length, unless it holds the key (public channels publish theirs).', relay: 'Cannot read it unless it holds the key.', recipient: 'Every member reads it.' }, claims: ['MC-020', 'MC-021'] },
      ]),
      transport: view('Phone → companion radio', 'A channel-send command exists, but this lab did not verify its byte layout.', false, [
        { name: 'channel send command', size: 'rest', value: '[command code, channel index, timestamp, text]', meaning: 'Shown schematically only.', sees: OFF_AIR, claims: ['MC-018', 'LW-C03'] },
      ]),
      app: view('Application view', 'The channel as members see it.', false, [
        { name: 'channel post', size: 'rest', value: '#hikers — “Alex”: “Trail is muddy”', meaning: 'Any key holder could have typed “Alex”.', sees: { observer: 'Readable only with the channel key.', relay: 'Readable only with the key.', recipient: 'Every member sees the same claimed name.' }, claims: ['MC-021'] },
      ]),
    },
  },
  {
    id: 'mc-advert',
    protocol: 'meshcore',
    label: 'MeshCore zero-hop advert',
    scenario: 'A announces itself to direct neighbours only. Adverts are signed and not encrypted.',
    views: {
      air: view('Over the air', 'Identity, time and signature are all in the clear.', true, [
        { name: 'header', size: 1, value: hex(mcHeader('ADVERT', 'DIRECT')), meaning: 'Payload type ADVERT (4), route DIRECT (2) with an empty path: zero-hop.', sees: { observer: 'An advert that repeaters will not carry.', relay: 'Does not repeat it.', recipient: 'Neighbours add or refresh the contact.' }, claims: ['MC-006', 'RT-X04'] },
        { name: 'path_len', size: 1, value: '0x00', meaning: 'No path entries.', sees: { observer: 'Sent by a direct neighbour.', relay: 'Nothing to match.', recipient: 'Heard directly.' }, claims: ['MC-014'] },
        { name: 'public key', size: 32, value: '[A’s full Ed25519 public key]', meaning: 'The full identity, unlike the 1-byte hashes in DMs.', sees: { observer: 'A’s full public key.', relay: 'Same.', recipient: 'Should be verified out of band before trusting a name.' }, claims: ['RT-X07', 'MC-019', 'MC-028'] },
        { name: 'timestamp', size: 4, value: '[advert time]', endian: 'LE', meaning: 'Little-endian 32-bit time.', sees: { observer: 'When A advertised.', relay: 'Same.', recipient: 'Used for freshness checks on adverts.' }, claims: ['RT-X07', 'MC-023'] },
        { name: 'signature', size: 64, value: '[Ed25519 signature]', meaning: 'Proves possession of the key, not the person’s name.', sees: { observer: 'Can verify it.', relay: 'Same.', recipient: 'Same.' }, claims: ['RT-X07', 'MC-019'] },
        { name: 'app data', size: 'rest', value: '[name, role, optional location]', meaning: 'Optional fields; location is disclosed if included.', sees: { observer: 'Name and any location.', relay: 'Same.', recipient: 'Same.' }, claims: ['MC-028'] },
      ]),
      transport: view('Phone → companion radio', 'The app asks for an advert; the command layout was not verified here.', false, [
        { name: 'advert request', size: 'rest', value: '[advert command]', meaning: 'A client action. The radio builds and signs the advert.', sees: OFF_AIR, claims: ['MC-018', 'MC-006'] },
      ]),
      app: view('Application view', 'What a neighbour’s app shows.', false, [
        { name: 'new contact', size: 'rest', value: 'Contact “A” — path: unknown', meaning: 'Hearing an advert adds a contact but not a DM route.', sees: { observer: 'Same identity data as any listener.', relay: 'Same.', recipient: 'A contact with no stored path.' }, claims: ['MC-007'] },
      ]),
    },
  },
  ...mtFixtures(),
];

function mtFixtures(): PacketFixture[] {
  const header = (dm: boolean): F[] => [
    { name: 'to', size: 4, value: dm ? '[D’s node number]' : '[broadcast address]', meaning: 'Destination node number. Byte order is not stated in the source, so none is shown.', sees: { observer: dm ? 'Who it is addressed to, in the clear.' : 'That it is a broadcast.', relay: 'Decides whether it is for itself.', recipient: 'Recognises itself.' }, claims: ['RT-X02'] },
    { name: 'from', size: 4, value: '[A’s node number]', meaning: 'Original sender, kept unchanged by relays.', sees: { observer: 'The sender’s node number.', relay: 'Part of the duplicate identity.', recipient: 'Who sent it (not a verified person).' }, claims: ['RT-X02', 'MT-C03'] },
    { name: 'packet ID', size: 4, value: '[packet ID]', meaning: 'With the sender, the duplicate identity. Retries keep the same ID.', sees: { observer: 'Can match copies and retries.', relay: 'Drops or cancels on a repeat.', recipient: 'Shows the message once.' }, claims: ['RT-X02', 'MT-C03', 'MT-C12'] },
    { name: 'flags', size: 1, value: hex(mtFlags({ hopLimit: 3, hopStart: 3, wantAck: dm })), meaning: `Hop limit 3 (bits 0–2), ${dm ? 'want-ACK set (0x08)' : 'no want-ACK'}, hop start 3 (bits 5–7).`, sees: { observer: 'Remaining budget and how far it has come.', relay: 'Decrements the hop limit when it relays.', recipient: 'hop start − hop limit = relays crossed.' }, claims: ['RT-X02', 'MT-C08'] },
    { name: 'channel hash', size: 1, value: dm ? '[0 for a PKI DM]' : '[1-byte channel hint]', meaning: dm ? 'A PKI DM uses no channel key; a zero hint marks it as possibly PKI.' : 'Hint for which channel key to try; not the key, not unique.', sees: { observer: 'The hint only.', relay: 'Can forward without the key under rebroadcast ALL.', recipient: dm ? 'Tries its private key.' : 'Tries channels with a matching hash.' }, claims: dm ? ['RT-X09', 'MT-C18'] : ['MT-C15', 'RT-X02'] },
    { name: 'next hop', size: 1, value: dm ? '[last byte of B’s node number]' : '[no preference]', meaning: dm ? 'Only the relay with this last byte may forward the copy.' : 'Broadcasts flood; no relay is named.', sees: { observer: dm ? 'Which relay is preferred, by one byte only.' : 'No relay is named.', relay: dm ? 'Others ignore the copy.' : 'Any eligible relay may forward.', recipient: 'Not used on arrival.' }, claims: dm ? ['MT-C10', 'RT-X01'] : ['RT-X02'] },
    { name: 'relay node', size: 1, value: '[last byte of the transmitting node]', meaning: 'Set by whoever transmits this copy. One byte, not an authenticated path.', sees: { observer: 'Roughly who just transmitted.', relay: 'Used for next-hop learning and checks.', recipient: 'Which neighbour delivered it.' }, claims: ['RT-X01', 'MT-C09'] },
    { name: 'encrypted payload', size: 'rest', value: dm ? '[AES-256-CCM ciphertext with 8-byte tag]' : '[AES-CTR encrypted Data protobuf]', opaque: true, meaning: dm ? 'PKI DM body, authenticated by CCM; no separate signature.' : 'Channel payload under the shared key; no integrity tag.', sees: { observer: dm ? 'Only its length.' : 'Readable by anyone with the channel key (public for the default key).', relay: 'Can forward without reading it.', recipient: 'Decrypts with its key.' }, claims: dm ? ['MT-C18'] : ['MT-C17', 'MT-C07'] },
  ];
  const phone = (dm: boolean): PacketView =>
    view(
      'Phone → radio over USB serial (stream API)',
      'A protobuf message inside a 4-byte stream header. Not the LoRa frame.',
      true,
      [
        { name: 'start bytes', size: 2, value: '0x94 0xc3', meaning: 'START1, START2.', sees: OFF_AIR, claims: ['RT-X03'] },
        { name: 'length', size: 2, value: '[protobuf length]', endian: 'BE', meaning: 'Big-endian 16-bit length of the protobuf that follows.', sees: OFF_AIR, claims: ['RT-X03'] },
        { name: 'ToRadio protobuf', size: 'rest', value: dm ? '[ToRadio → MeshPacket: to D, want_ack, decoded text]' : '[ToRadio → MeshPacket: to broadcast, channel index, decoded text]', meaning: 'Field-level protobuf; not byte-mapped here. Over BLE the stream header is not described by this lab.', sees: OFF_AIR, claims: ['LW-C03', 'MT-S04'] },
      ],
    );
  return [
    {
      id: 'mt-broadcast',
      protocol: 'meshtastic',
      label: 'Meshtastic channel broadcast',
      scenario: 'A posts on its primary channel with hop limit 3. No destination; no ACK from recipients.',
      views: {
        air: view('Over the air (16-byte header + payload)', 'Header fields are in the clear; the payload is encrypted with the channel key.', true, header(false)),
        transport: phone(false),
        app: view('Application view', 'The channel in each member’s app.', false, [
          { name: 'channel post', size: 'rest', value: 'Primary channel — A: “Net check-in”', meaning: 'Every node with the key shows it once; there is no per-recipient delivery status.', sees: { observer: 'Readable with the channel key.', relay: 'Readable only with the key.', recipient: 'Each member shows it once.' }, claims: ['MT-C03', 'MT-C17'] },
        ]),
      },
    },
    {
      id: 'mt-dm-next-hop',
      protocol: 'meshtastic',
      label: 'Meshtastic DM with next hop B',
      scenario: 'A sends a PKI DM to D with want-ACK; A’s saved next hop toward D is B.',
      views: {
        air: view('Over the air (16-byte header + payload)', 'Addressing and the preferred relay byte are visible; the body is not.', true, header(true)),
        transport: phone(true),
        app: view('Application view', 'A’s conversation with D.', false, [
          { name: 'A’s status', size: 'rest', value: 'Sent → relayed (implicit ACK) → acknowledged', meaning: 'An implicit ACK means a relay repeated it; only D’s routing ACK confirms protocol receipt, and neither is a human reply.', sees: { observer: 'Cannot see it.', relay: 'Cannot see it.', recipient: 'D’s app shows the message, not A’s status.' }, claims: ['MT-C13', 'MT-C14'] },
        ]),
      },
    },
  ];
}

export function inspect(id: unknown, v: unknown): PacketView {
  const p = PACKETS.find((x) => x.id === id);
  if (!p) invalid(`unknown packet ${String(id)}`);
  if (!VIEWS.includes(v as View)) invalid(`unknown view ${String(v)}`);
  return p.views[v as View];
}
