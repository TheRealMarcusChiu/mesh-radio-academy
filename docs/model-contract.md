# Routing model contract (MODEL_VERSION 2; version 1 frozen and still accepted)

This is the interface between the pure routing model (`src/lib/routing.ts`), its fixtures (`src/fixtures/routing.ts`, `src/fixtures/routing-presets.ts`) and every consumer: the playground UI, the mismatch bench, lessons and future labs. Lanes working in parallel may **add** fixtures, scenarios and UI on top of this contract. Changing any shape below needs a version bump and an update to this file and its tests.

Tests that pin the contract: `tests/routing.test.ts` (version 1) and `tests/routing-v2.test.ts` (version 2 and compatibility).

## Version 2 compatibility decision

- `MODEL_VERSION` is now `2`. `validateScenario` accepts `version: 1` and `version: 2`; anything else is rejected.
- A `version: 1` config is held to the version-1 contract below: version-2 fields (`nextHops`, `contacts`, Meshtastic `traffic.kind: 'dm'`) and version-2 actions (`advert`, `set-links`) are **rejected** for it, not ignored. Its trace has `modelVersion: 1` and the same events, snapshots and metrics as before; every version-1 behavior test still passes unchanged.
- `Trace.modelVersion` is the **config's** version, so a stored version-1 JSON config and its client keep producing version-1 traces.
- Version-2 additions are optional fields, new union members and new event actions. A version-1 consumer that switches on `EventAction` must treat unknown actions as display-only (they always carry `reason` and `claims`).
- The only edited version-1 tests are the two that pinned the old constant: `MODEL_VERSION === 1` is now `=== 2` plus a `modelVersion === 1` trace check, and the "bad version" case uses `3` (and the string `'1'`) instead of `2`.

## Principles

- **Pure and deterministic.** No DOM, no clock, no `Math.random`. The same config and actions produce a deep-equal trace, including after a JSON round trip.
- **Teaching ticks, not milliseconds.** `time` increments once per transmission and only orders events. No firmware timing, airtime, collision or capture is modeled; see `OMITTED_EFFECTS`.
- **Seeded tie order.** `seed` (an unsigned 32-bit integer) ranks nodes when several act "at the same time". `relayOrder(seed, ids)` exposes that ranking. It is a teaching assumption, not radio behavior (MT-C06).
- **Every event cites evidence.** `claims` holds claim IDs from `research/claims.md`. `tests/ledger.test.ts` fails if an ID is undefined.
- **Validate at the boundary.** `validateScenario(unknown)` throws `Invalid scenario: …` for any malformed serialized config, including a non-string `id`, array-shaped route tables and duplicate directed links. `simulate` and `createController` call it.

## Input: `ScenarioConfig`

```ts
interface BaseScenario {
  version: 1;          // (version 2: see "Version 2 additions")
  id: string;
  seed: number;        // uint32
  links: Link[];       // directed audibility: `to` decodes what `from` sends
}
interface Link { from: NodeId; to: NodeId }   // NodeId: one capital letter

interface MeshtasticScenario extends BaseScenario {
  protocol: 'meshtastic';
  nodes: { id: NodeId; role: 'CLIENT' | 'CLIENT_MUTE' | 'ROUTER' }[];  // rebroadcast mode ALL
  traffic: { kind: 'channel-broadcast'; from: NodeId; observer: NodeId; hopLimit: 0..7 };
}

interface MeshCoreScenario extends BaseScenario {
  protocol: 'meshcore';
  nodes: { id: NodeId; role: 'companion' | 'repeater'; prefix: string /* 2 hex chars */ }[];
  traffic: { kind: 'dm'; from: NodeId; to: NodeId };       // from !== to
  outPaths: Record<NodeId, Record<NodeId, NodeId[] | null>>; // owner -> dest -> relays, null = unknown
}
```

- `id` must be a string.
- `links` is a set of directed edges. A repeated `(from, to)` pair is **rejected**, because it would make one transmission count as two receptions. `A→B` and `B→A` are different edges.
- `outPaths` and each owner's table must be plain records (objects, not arrays); each path value is an array of known node IDs or `null`.
- A Meshtastic `observer` is the node a lesson watches. It is **not** a destination address: a channel broadcast has none.
- MeshCore `outPaths` lists only the intermediate relays. Each direction is stored independently and is never derived by reversing the other (MC-008).
- Companions have repeat off and repeaters have repeat on. Configurable companion repeating (MC-004) is a future extension.

## Input: `UserAction[]`

```ts
type UserAction = { type: 'send' } | { type: 'reset-path'; node: NodeId; dest: NodeId };
```

- `send`: Meshtastic sends a new channel broadcast from `traffic.from` with a new packet ID. MeshCore sends a new DM `m<n>` from `traffic.from` to `traffic.to`, direct if a path is stored, otherwise flooded.
- `reset-path` (MeshCore only) clears `outPaths[node][dest]`. It emits exactly one `user-reset-path` event and **no transmission** (MC-012).
- Unknown actions, or `reset-path` on Meshtastic, throw `Unsupported action`.
- Each action runs to quiescence before the next one starts.

## Output: `Trace`

```ts
interface Trace {
  modelVersion: 1;
  initial: Snapshot;      // state before any event
  events: SimEvent[];
  snapshots: Snapshot[];  // snapshots[i] = state after events[i]
}

interface SimEvent {
  order: number;          // 0..n-1, sequential
  time: number;           // teaching tick, integer >= 0
  node: NodeId;           // who acted or observed
  action: EventAction;
  reason: string;         // plain-language why, safe for display with textContent
  from?: NodeId;          // transmitter that was heard (receive-side events)
  packet?: PacketRef;
  learned?: { dest: NodeId; path: NodeId[] | null };   // learn-path / user-reset-path
  claims: string[];       // non-empty, IDs from research/claims.md
}

type EventAction =
  | 'user-send' | 'user-reset-path'          // app or user actions; no RF
  | 'transmit'                               // one RF transmission (origin, relay or control)
  | 'hear' | 'duplicate'                     // first reception / already-seen copy
  | 'deliver'                                // first app delivery of a message at this node
  | 'queue-relay' | 'cancel-relay' | 'keep-relay' | 'no-relay'
  | 'ignore'                                 // heard, not addressed / not the named relay
  | 'learn-path' | 'ack' | 'no-confirmation';

interface PacketRef {
  key: string;            // duplicate identity: MT `${origin}#${id}`, MC `p<n>`
  kind: 'text' | 'path' | 'ack';
  route: 'broadcast' | 'flood' | 'direct';
  origin: NodeId;
  dest?: NodeId;
  hopLimit?: number;      // MT: remaining relay budget on this copy
  path?: NodeId[];        // MC flood: relays so far; MC direct: relays still to go
  carries?: NodeId[];     // MC PATH: the route being reported
  message: string;        // application message this packet carries or confirms
}

interface Snapshot {
  time: number;
  nodes: Record<NodeId, {
    delivered: string[];      // message IDs shown in this node's app
    pendingRelays: string[];  // packet keys queued at this node
    outPaths: Record<NodeId, NodeId[] | null>;
    awaiting: string[];       // messages this node still waits to have confirmed
  }>;
}
```

`no-confirmation` means only that no matching ACK reached the sender. It never claims which hop failed (MC-030, MC-011).

## Metrics: `metricsAt(trace, upto)`

Counts are over `events[0, upto)`:

| Field | Definition |
|---|---|
| `rfTransmissions` | All `transmit` events. |
| `originTransmissions` | `transmit` where `node === packet.origin`. |
| `relayTransmissions` | `transmit` where `node !== packet.origin`. |
| `controlTransmissions` | `transmit` of any `kind` other than `text`: `path`, `ack` and (v2) `advert`. A subset of `rfTransmissions`. |
| `uniqueDeliveries` | `deliver` events (at most one per node per message). |
| `duplicatesHeard` | `duplicate` events. |
| `cancelledRelays` | `cancel-relay` events. |
| `retries` | Origin re-transmissions of an already-sent packet key (0 in version 1; up to 2 for a v2 Meshtastic DM; a MeshCore resend after reset is a new message). |
| `confirmations` | `ack` events. |
| `unconfirmed` | `no-confirmation` events. |

Airtime is deliberately absent. It may be added only when packet bytes come from a verified layout (RF-C05).

## Controller: `createController(config)`

```ts
interface Controller {
  readonly config: ScenarioConfig;
  readonly trace: Trace;
  readonly position: number;              // events revealed
  readonly actions: readonly UserAction[];
  dispatch(action): void;   // append action, re-simulate; does NOT advance position
  step(): void;             // reveal one more event (clamped)
  run(): void;              // reveal all
  reset(): void;            // clear actions and position
  canStep(): boolean;
  visibleEvents(): SimEvent[];
  snapshot(): Snapshot;     // state at the playhead (initial when position = 0)
  metrics(): Metrics;       // metricsAt(trace, position)
}
```

The playground calls `run()` before each new user action, so every action starts from a settled state.

## Fixtures (`src/fixtures/routing.ts`)

- `SEEDS = { bFirst: 3, cFirst: 1 }`.
- `diamondLinks({ bcAudible, bdWorks })`: symmetric A–B, A–C, C–D, optional B–D and B–C, never A–D.
- `mtDiamond(opts)`: MT-F01. Defaults: B–C audible, B–D works, seed `bFirst`, all `CLIENT`, hop limit 1, observer D.
- `mcKnownPath(opts)`: MC-F04. Defaults: B–C audible, **B–D broken**, seed `bFirst`; A and D companions, B and C repeaters; `outPaths` A→D [B] and D→A [B].

## Version 2 additions

### Input

```ts
interface BaseScenario { version: 1 | 2; ... }

// Meshtastic, v2 only:
traffic: { kind: 'dm'; from: NodeId; to: NodeId; hopLimit: 0..7 };  // from !== to; sent with want-ACK
nextHops?: Record<NodeId, Record<NodeId, NodeId | null>>;            // owner -> dest -> saved next hop

// MeshCore, v2 only:
contacts?: Record<NodeId, NodeId[]>;   // absent = everyone knows everyone (v1 behavior)

type UserAction = ...
  | { type: 'advert'; node: NodeId; scope: 'zero-hop' | 'flood' }        // MeshCore only
  | { type: 'set-links'; node: NodeId; label: string; links: Link[] };   // both; links validated like config links
```

### Output

- `EventAction` adds `user-advert`, `user-set-links` (client/learner actions, no RF), `discover`, `no-contact`, `retry`, `fallback`, `implicit-ack`.
- `PacketRef.kind` adds `'advert'`; `PacketRef.nextHop?` is the one relay allowed to forward a Meshtastic DM copy (absent = no preference). Absent fields are omitted, not `undefined`, so traces survive a JSON round trip.
- `NodeSnapshot.contacts?` appears only when the MeshCore scenario models contacts. For a Meshtastic DM, `outPaths[dest]` holds `[nextHop]` (a one-relay preference, not a path) or `null`.
- `deliveryHops(trace, i)`: relays a delivered copy crossed (Meshtastic: origin hop limit minus remaining; MeshCore flood: path length; MeshCore direct: forwards before delivery). Undefined for non-deliver events.

### Behavior (each event cites its claim)

- **Meshtastic DM** (MT-C10–MT-C14, RT-X01): A transmits naming its saved next hop; only that node may relay, others `ignore`. A named relay forwards with its own saved next hop toward the destination, or floods if it has none. The destination never relays a packet addressed to itself and returns a routing ACK (flooded unless it has a next hop back; the ACK uses the scenario hop limit, a stated teaching assumption). If A hears neither a relay of its packet nor the ACK, it retries with the same packet ID; the third attempt clears the preference (event `fallback`) and floods. A node that had only seen preferred copies reprocesses the fallback copy instead of dropping it. Overhearing a relay of its own DM is an `implicit-ack`: it stops retries but is not delivery. All three attempts unanswered → `no-confirmation` naming MAX_RETRANSMIT. Next-hop *learning* from relayed ACKs is not modeled.
- **MeshCore adverts and contacts** (MC-004–MC-008, MC-019): a zero-hop advert is heard by neighbours and never repeated; a flooded one is repeated by repeaters with their prefix appended. Hearing an advert adds a contact (`discover`) but never a stored path. A send to a non-contact is refused by the client (`no-contact`, no RF). A recipient without the sender as a contact cannot decrypt (`ignore`).
- **`set-links`** replaces the link set from that point on; it emits one `user-set-links` event and no transmission (RT-X08).

### Presets (`src/fixtures/routing-presets.ts`, PRESET_VERSION 1)

`two-nodes`, `line`, `diamond`, `mobile` (with a `move` link set), `sparse`, built by `presetScenario(id, protocol, options)` with shared links, seed and roles. Named fixtures: `mtDm(opts)` (A prefers B, B prefers D, A–B off by default: research fallback fixture), `mcFirstContact()` (no contacts, no paths), `mcAsymmetric()` (line with D→B off). `VIEWBOX`, `LABEL_DY` and `labelY` are the drawing constants the layout test checks for every preset.

## Still not modeled

- Airtime. Needs verified complete packet byte counts and the RF lab's calculator API, neither integrated here.
- Meshtastic next-hop learning, ACK retries, relays cancelling on a heard ACK, MQTT; MeshCore group-channel floods, flood scopes and repeater hop limits, client retry policies, room servers.
- Collisions, capture, timing, duty-cycle throttles (`OMITTED_EFFECTS`).
