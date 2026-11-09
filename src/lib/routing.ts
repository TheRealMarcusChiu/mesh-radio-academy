/**
 * Deterministic teaching model of two forwarding schemes on a shared graph.
 * Contract: docs/model-contract.md (MODEL_VERSION 2; version-1 configs keep the
 * version-1 behavior and trace). Pure: no DOM, no clock, no randomness except the
 * seeded tie order. Times are teaching ticks, not firmware milliseconds. Every
 * decision cites claim IDs from research/claims.md, or a pending RT-X claim from
 * the routing lane awaiting ledger integration.
 *
 * Meshtastic side: managed-flood channel broadcast; version 2 adds addressed DMs
 * with next-hop preference, retries and final-retry flood fallback (firmware 2.7.26).
 * MeshCore side: known direct path, failure, explicit reset and re-flood; version 2
 * adds contacts, local and flooded adverts and controlled link changes (firmware
 * 1.18.0). Neither is a cycle-accurate radio simulator.
 */

export const MODEL_VERSION = 2;

export type Protocol = 'meshtastic' | 'meshcore';
export type NodeId = string;
export type MtRole = 'CLIENT' | 'CLIENT_MUTE' | 'ROUTER';
export type McRole = 'companion' | 'repeater';

/** Directed audibility: `to` can decode what `from` transmits. */
export interface Link {
  from: NodeId;
  to: NodeId;
}

interface BaseScenario {
  /** 1 = frozen version-1 contract; 2 adds the optional fields marked "v2". */
  version: 1 | 2;
  id: string;
  /** Unsigned 32-bit integer; only orders otherwise-simultaneous choices. */
  seed: number;
  links: Link[];
}

export interface MtNode {
  id: NodeId;
  role: MtRole;
}

export interface McNode {
  id: NodeId;
  role: McRole;
  /** Synthetic one-byte path prefix shown in paths, e.g. "b2". */
  prefix: string;
}

export interface MeshtasticScenario extends BaseScenario {
  protocol: 'meshtastic';
  nodes: MtNode[];
  /**
   * Channel broadcast: no single destination; `observer` is the node the lesson watches.
   * v2: or an addressed DM to `to`, sent with want-ACK.
   */
  traffic:
    | { kind: 'channel-broadcast'; from: NodeId; observer: NodeId; hopLimit: number }
    | { kind: 'dm'; from: NodeId; to: NodeId; hopLimit: number };
  /** v2: saved next-hop preference nextHops[owner][dest], or null for none (MT-C10). */
  nextHops?: Record<NodeId, Record<NodeId, NodeId | null>>;
}

export interface MeshCoreScenario extends BaseScenario {
  protocol: 'meshcore';
  nodes: McNode[];
  traffic: { kind: 'dm'; from: NodeId; to: NodeId };
  /** Stored outgoing paths: outPaths[owner][dest] = intermediate relays, or null when unknown. */
  outPaths: Record<NodeId, Record<NodeId, NodeId[] | null>>;
  /** v2: contacts each node knows. Absent = everyone knows everyone (version-1 behavior). */
  contacts?: Record<NodeId, NodeId[]>;
}

export type ScenarioConfig = MeshtasticScenario | MeshCoreScenario;

export type UserAction =
  | { type: 'send' }
  | { type: 'reset-path'; node: NodeId; dest: NodeId }
  /** v2, MeshCore: a client-requested advert, heard by neighbours only or flooded (MC-006). */
  | { type: 'advert'; node: NodeId; scope: 'zero-hop' | 'flood' }
  /** v2: the learner replaces the link set, e.g. moving a node. No RF event. */
  | { type: 'set-links'; node: NodeId; label: string; links: Link[] };

export type EventAction =
  | 'user-send'
  | 'user-reset-path'
  | 'transmit'
  | 'hear'
  | 'duplicate'
  | 'deliver'
  | 'queue-relay'
  | 'cancel-relay'
  | 'keep-relay'
  | 'no-relay'
  | 'ignore'
  | 'learn-path'
  | 'ack'
  | 'no-confirmation'
  // v2
  | 'user-advert'
  | 'user-set-links'
  | 'discover'
  | 'no-contact'
  | 'retry'
  | 'fallback'
  | 'implicit-ack';

export interface PacketRef {
  /** Identity used for duplicate detection (Meshtastic: origin + packet ID; MeshCore: packet hash stand-in). */
  key: string;
  kind: 'text' | 'path' | 'ack' | 'advert';
  /** v2 Meshtastic DM: the one relay allowed to forward this copy (MT-C10); absent = no preference. */
  nextHop?: NodeId;
  route: 'broadcast' | 'flood' | 'direct';
  origin: NodeId;
  dest?: NodeId;
  /** Meshtastic remaining relay budget carried by this copy. */
  hopLimit?: number;
  /** MeshCore: flood = relays traversed so far; direct = relays still to traverse. */
  path?: NodeId[];
  /** MeshCore PATH packets: the route being reported to the receiver (relays, in order). */
  carries?: NodeId[];
  /** Application message this packet carries or confirms. */
  message: string;
}

export interface SimEvent {
  order: number;
  /** Teaching tick: increments once per transmission. Not milliseconds. */
  time: number;
  node: NodeId;
  action: EventAction;
  reason: string;
  /** Transmitter this node heard, for hear/duplicate/ignore/decision events. */
  from?: NodeId;
  packet?: PacketRef;
  learned?: { dest: NodeId; path: NodeId[] | null };
  claims: string[];
}

export interface NodeSnapshot {
  delivered: string[];
  pendingRelays: string[];
  /** MeshCore: stored relay paths. v2 Meshtastic DM: [nextHop] preference per destination. */
  outPaths: Record<NodeId, NodeId[] | null>;
  awaiting: string[];
  /** v2 MeshCore with contacts: identities this node has added. */
  contacts?: NodeId[];
}

export interface Snapshot {
  time: number;
  nodes: Record<NodeId, NodeSnapshot>;
}

export interface Metrics {
  rfTransmissions: number;
  originTransmissions: number;
  relayTransmissions: number;
  controlTransmissions: number;
  uniqueDeliveries: number;
  duplicatesHeard: number;
  cancelledRelays: number;
  retries: number;
  confirmations: number;
  unconfirmed: number;
}

export interface Trace {
  modelVersion: number;
  initial: Snapshot;
  events: SimEvent[];
  /** snapshots[i] is the state after events[i]. */
  snapshots: Snapshot[];
}

export const OMITTED_EFFECTS: readonly string[] = [
  'Real timing: ticks only order events; relay delays, retry timers and airtime are not modeled.',
  'Collisions, capture effect and partial reception: every audible transmission is decoded intact.',
  'Signal strength: links are simply audible or not; SNR-weighted relay timing is replaced by the seeded order.',
  'Regional duty-cycle limits, channel-activity detection and transmit queues.',
  'Encryption and keys: every node is assumed to have what it needs to read packets meant for it, except a MeshCore node that has no contact for the sender.',
  'Meshtastic favorite-router hop exceptions, MQTT bridging, next-hop learning from relayed ACKs, relays cancelling a pending DM relay when they hear its ACK, the ACK’s own hop budget and ACK retries.',
  'MeshCore flood scopes and repeater hop limits, client-side automatic retry policies, room servers and group channels.',
  'Mobility: a moved node is a learner-chosen link change, not a prediction of where a real radio would be heard.',
];

// ---------- validation (trust boundary for serialized configs) ----------

const MT_ROLES: readonly MtRole[] = ['CLIENT', 'CLIENT_MUTE', 'ROUTER'];
const MC_ROLES: readonly McRole[] = ['companion', 'repeater'];

function fail(msg: string): never {
  throw new Error(`Invalid scenario: ${msg}`);
}

export function validateScenario(input: unknown): ScenarioConfig {
  const c = input as ScenarioConfig | null;
  if (!c || typeof c !== 'object') fail('not an object');
  if (c.version !== 1 && c.version !== 2) fail('version must be 1 or 2');
  const v2 = c.version === 2;
  if (typeof c.id !== 'string') fail('id must be a string');
  if (!Number.isInteger(c.seed) || c.seed < 0 || c.seed > 0xffffffff) fail('seed must be an unsigned 32-bit integer');
  if (!Array.isArray(c.nodes)) fail('nodes and links must be arrays');
  const ids = new Set<string>();
  for (const n of c.nodes) {
    if (!n || typeof n.id !== 'string' || !/^[A-Z]$/.test(n.id)) fail('node ids are single capital letters');
    if (ids.has(n.id)) fail(`duplicate node ${n.id}`);
    ids.add(n.id);
  }
  const known = (id: unknown) => typeof id === 'string' && ids.has(id);
  validateLinks(c.links, known);
  const isRecord = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);

  if (c.protocol === 'meshtastic') {
    for (const n of c.nodes) if (!MT_ROLES.includes(n.role)) fail(`unsupported Meshtastic role ${String(n.role)}`);
    const t = c.traffic;
    if (t?.kind === 'dm') {
      if (!v2) fail('Meshtastic DM traffic needs version 2');
      if (!known(t.from) || !known(t.to) || t.from === t.to) fail('dm traffic needs two different known nodes');
    } else if (t?.kind !== 'channel-broadcast' || !known(t.from) || !known(t.observer)) fail('broadcast traffic needs known from/observer');
    if (!Number.isInteger(t.hopLimit) || t.hopLimit < 0 || t.hopLimit > 7) fail('hopLimit must be 0–7');
    if (c.nextHops !== undefined) {
      if (!v2) fail('nextHops needs version 2');
      if (!isRecord(c.nextHops)) fail('nextHops must be a record');
      for (const [owner, table] of Object.entries(c.nextHops)) {
        if (!known(owner) || !isRecord(table)) fail('nextHops entries must be records keyed by known owners');
        for (const [dest, hop] of Object.entries(table)) {
          if (!known(dest) || (hop !== null && !known(hop))) fail('nextHops names an unknown node');
        }
      }
    }
  } else if (c.protocol === 'meshcore') {
    if (c.contacts !== undefined) {
      if (!v2) fail('contacts needs version 2');
      if (!isRecord(c.contacts)) fail('contacts must be a record');
      for (const [owner, list] of Object.entries(c.contacts)) {
        if (!known(owner) || !Array.isArray(list) || !list.every(known)) fail('contacts name an unknown node');
      }
    }
    for (const n of c.nodes) {
      if (!MC_ROLES.includes(n.role)) fail(`unsupported MeshCore role ${String(n.role)}`);
      if (typeof n.prefix !== 'string' || !/^[0-9a-f]{2}$/.test(n.prefix)) fail('prefix must be one hex byte');
    }
    const t = c.traffic;
    if (t?.kind !== 'dm' || !known(t.from) || !known(t.to) || t.from === t.to) fail('dm traffic needs two different known nodes');
    if (!isRecord(c.outPaths)) fail('outPaths must be a record');
    for (const [owner, table] of Object.entries(c.outPaths)) {
      if (!known(owner) || !isRecord(table)) fail('outPaths entries must be records keyed by known owners');
      for (const [dest, path] of Object.entries(table)) {
        if (!known(dest)) fail('outPaths destination unknown');
        if (path !== null && (!Array.isArray(path) || !path.every(known))) fail('outPaths path names an unknown node');
      }
    }
  } else fail('protocol must be meshtastic or meshcore');
  return c;
}

function validateLinks(links: unknown, known: (id: unknown) => boolean) {
  if (!Array.isArray(links)) fail('nodes and links must be arrays');
  const edges = new Set<string>();
  for (const l of links as Link[]) {
    if (!l || !known(l.from) || !known(l.to) || l.from === l.to) fail('link refers to an unknown node');
    // One directed edge = one reception per transmission; a repeat would fake a second copy.
    if (edges.has(`${l.from}>${l.to}`)) fail(`duplicate link ${l.from}→${l.to}`);
    edges.add(`${l.from}>${l.to}`);
  }
}

// ---------- seeded tie order ----------

/** Stable per-node rank for a seed; lower ranks act first among equals. */
function rank(seed: number, id: string): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export const relayOrder = (seed: number, ids: NodeId[]) =>
  [...ids].sort((a, b) => rank(seed, a) - rank(seed, b) || a.localeCompare(b));

// ---------- shared engine pieces ----------

interface Pending {
  node: NodeId;
  packet: PacketRef;
  queuedAt: number;
  reason: string;
  claims: string[];
}

class Run {
  events: SimEvent[] = [];
  snapshots: Snapshot[] = [];
  time = 0;
  pending: Pending[] = [];
  delivered: Record<NodeId, Set<string>> = {};
  seen: Record<NodeId, Set<string>> = {};
  outPaths: Record<NodeId, Record<NodeId, NodeId[] | null>> = {};
  awaiting: Record<NodeId, Set<string>> = {};
  /** v2 MeshCore: contacts per node, or undefined when the scenario doesn't model contacts. */
  contacts?: Record<NodeId, Set<NodeId>>;
  /** v2 Meshtastic: packet keys a node has only heard as copies preferring another next hop. */
  preferredOnly: Record<NodeId, Set<string>> = {};
  links: Link[];
  ids: NodeId[];
  readonly cfg: ScenarioConfig;

  constructor(cfg: ScenarioConfig) {
    this.cfg = cfg;
    this.links = [...cfg.links];
    this.ids = cfg.nodes.map((n) => n.id);
    for (const id of this.ids) {
      this.delivered[id] = new Set();
      this.seen[id] = new Set();
      this.awaiting[id] = new Set();
      this.outPaths[id] = {};
      this.preferredOnly[id] = new Set();
    }
    if (cfg.protocol === 'meshcore') {
      for (const [owner, table] of Object.entries(cfg.outPaths)) {
        for (const [dest, path] of Object.entries(table)) this.outPaths[owner][dest] = path && [...path];
      }
      if (cfg.contacts) {
        const contacts: Record<NodeId, Set<NodeId>> = {};
        for (const id of this.ids) contacts[id] = new Set(cfg.contacts[id] ?? []);
        this.contacts = contacts;
      }
    } else {
      for (const [owner, table] of Object.entries(cfg.nextHops ?? {})) {
        for (const [dest, hop] of Object.entries(table)) this.outPaths[owner][dest] = hop ? [hop] : null;
      }
    }
  }

  snapshot(): Snapshot {
    const nodes: Record<NodeId, NodeSnapshot> = {};
    for (const id of this.ids) {
      nodes[id] = {
        delivered: [...this.delivered[id]],
        pendingRelays: this.pending.filter((p) => p.node === id).map((p) => p.packet.key),
        outPaths: Object.fromEntries(Object.entries(this.outPaths[id]).map(([d, p]) => [d, p && [...p]])),
        awaiting: [...this.awaiting[id]],
      };
      if (this.contacts) nodes[id].contacts = [...this.contacts[id]].sort();
    }
    return { time: this.time, nodes };
  }

  /** v2 controlled topology change: replaces the link set; nothing is transmitted. */
  setLinks(action: Extract<UserAction, { type: 'set-links' }>) {
    this.links = [...action.links];
    this.emit({
      node: action.node,
      action: 'user-set-links',
      reason: `Learner change: ${action.label}. The lab now uses ${action.links.length} directed links. Nothing is transmitted, and this is not a prediction of where a real radio would be heard.`,
      claims: ['RT-X08'],
    });
  }

  emit(e: Omit<SimEvent, 'order' | 'time'>) {
    const packet = e.packet && {
      ...e.packet,
      path: e.packet.path && [...e.packet.path],
      carries: e.packet.carries && [...e.packet.carries],
    };
    if (packet && !packet.carries) delete packet.carries;
    if (packet && packet.nextHop === undefined) delete packet.nextHop;
    this.events.push({ ...e, packet, order: this.events.length, time: this.time });
    this.snapshots.push(this.snapshot());
  }

  /** Nodes that can hear `from`, in seeded order. */
  hearers(from: NodeId): NodeId[] {
    return relayOrder(
      this.cfg.seed,
      this.links.filter((l) => l.from === from).map((l) => l.to),
    );
  }

  transmit(node: NodeId, packet: PacketRef, reason: string, claims: string[]) {
    this.time++;
    this.seen[node].add(packet.key);
    this.emit({ node, action: 'transmit', reason, packet, claims });
  }

  queue(node: NodeId, packet: PacketRef, reason: string, claims: string[]) {
    this.pending.push({ node, packet, queuedAt: this.time, reason, claims });
  }

  /** Transmit queued packets until none remain; `hear` handles each transmission's receivers. */
  drain(priority: (p: Pending) => number, hear: (tx: NodeId, packet: PacketRef) => void) {
    for (let p = this.nextPending(priority); p; p = this.nextPending(priority)) {
      this.transmit(p.node, p.packet, p.reason, p.claims);
      hear(p.node, p.packet);
    }
  }

  nextPending(priority: (p: Pending) => number): Pending | undefined {
    if (!this.pending.length) return undefined;
    this.pending.sort(
      (a, b) => priority(a) - priority(b) || a.queuedAt - b.queuedAt || rank(this.cfg.seed, a.node) - rank(this.cfg.seed, b.node),
    );
    return this.pending.shift();
  }
}

// ---------- Meshtastic: managed flooding of a channel broadcast ----------

function runMeshtastic(cfg: MeshtasticScenario, actions: UserAction[]): Run {
  const r = new Run(cfg);
  const role = (id: NodeId) => cfg.nodes.find((n) => n.id === id)!.role;
  // ROUTER relays use an earlier window than CLIENT relays; the seed orders the rest.
  const priority = (x: Pending) => (role(x.node) === 'ROUTER' ? 0 : 1);
  /** DM keys whose origin has overheard a relay of its own packet (implicit ACK, MT-C13). */
  const implicit = new Set<string>();
  let packetId = 0;

  for (const action of actions) {
    if (action.type === 'set-links') {
      r.setLinks(action);
      continue;
    }
    if (action.type !== 'send') throw new Error(`Unsupported action for Meshtastic: ${action.type}`);
    packetId++;
    const t = cfg.traffic;
    if (t.kind === 'dm') {
      sendDm(t.from, t.to, t.hopLimit, packetId);
      continue;
    }
    const { from, observer, hopLimit } = t;
    const packet: PacketRef = {
      key: `${from}#${packetId}`,
      kind: 'text',
      route: 'broadcast',
      origin: from,
      hopLimit,
      message: `${from}#${packetId}`,
    };
    r.emit({
      node: from,
      action: 'user-send',
      reason: `The app on ${from} sends a channel broadcast (packet ${packetId}, hop limit ${hopLimit}). A broadcast has no single destination; ${observer} is the node this lesson watches.`,
      claims: ['MT-C08'],
    });
    r.transmit(from, packet, `${from} transmits the original broadcast with hop limit ${hopLimit}.`, ['MT-C08']);
    hearAll(from, packet);
    r.drain(priority, hearAll);
  }
  return r;

  /** v2 addressed DM with want-ACK: initial send plus two retransmissions, the last a flood (MT-C11, MT-C12). */
  function sendDm(from: NodeId, to: NodeId, hopLimit: number, id: number) {
    const key = `${from}#${id}`;
    const hop = r.outPaths[from][to]?.[0];
    r.awaiting[from].add(key);
    r.emit({
      node: from,
      action: 'user-send',
      reason: `The app on ${from} sends direct message ${key} to ${to} and asks for an ACK. ${from}'s saved next hop toward ${to}: ${hop ?? 'none, so the message is flooded'}. A next hop names one relay, not a whole route.`,
      claims: ['MT-C10'],
    });
    let packet: PacketRef = { key, kind: 'text', route: hop ? 'direct' : 'flood', origin: from, dest: to, hopLimit, message: key, nextHop: hop };
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (attempt > 1) {
        r.emit({
          node: from,
          action: 'retry',
          reason: `${from} has heard neither an ACK nor a relay of ${key}, so its retry timer fires: retransmission ${attempt - 1} of 2, same packet ID. The wait is a teaching tick, not the firmware timer.`,
          claims: ['MT-C12'],
        });
      }
      if (attempt === 3 && packet.nextHop) {
        packet = { ...packet, route: 'flood', nextHop: undefined };
        r.outPaths[from][to] = null;
        r.emit({
          node: from,
          action: 'fallback',
          learned: { dest: to, path: null },
          reason: `Final retransmission: ${from} drops the next-hop preference from the packet, clears its saved next hop toward ${to} and floods instead. Any eligible relay may now forward it.`,
          claims: ['MT-C11'],
        });
      }
      const how = packet.nextHop ? `naming ${packet.nextHop} as the only relay allowed to forward it` : 'with no next-hop preference (managed flood)';
      r.transmit(from, packet, attempt === 1 ? `${from} transmits ${key} ${how}, hop limit ${hopLimit}.` : `${from} retransmits ${key} ${how}.`, [attempt === 1 ? 'MT-C10' : 'MT-C12']);
      hearAll(from, packet);
      r.drain(priority, hearAll);
      if (!r.awaiting[from].has(key) || implicit.has(key)) break;
    }
    if (!r.awaiting[from].delete(key)) return;
    r.emit(
      implicit.has(key)
        ? {
            node: from,
            action: 'no-confirmation',
            reason: `${from} overheard a relay repeat ${key} (an implicit ACK), which stopped its retries, but no ACK from ${to} arrived. An implicit ACK shows some relay transmitted the packet, not that ${to} received it.`,
            claims: ['MT-C13', 'MT-C14'],
          }
        : {
            node: from,
            action: 'no-confirmation',
            reason: `All three attempts went unanswered, so ${from} reports a local MAX_RETRANSMIT error. From ${from}'s side this does not show which hop failed or whether ${to} received it.`,
            claims: ['MT-C11', 'MT-C12'],
          },
    );
  }

  function hearAll(tx: NodeId, packet: PacketRef) {
    const addressed = packet.dest !== undefined;
    for (const n of r.hearers(tx)) {
      if (r.seen[n].has(packet.key)) {
        if (addressed && !packet.nextHop && r.preferredOnly[n].delete(packet.key)) {
          firstHear(
            n,
            tx,
            packet,
            `${n} had only heard ${packet.key} as a copy naming another next hop. This copy has no preference, so ${n} processes it again as a fallback instead of dropping it.`,
            ['MT-C11'],
          );
          continue;
        }
        r.emit({
          node: n,
          action: 'duplicate',
          from: tx,
          packet,
          reason: addressed
            ? `${n} hears ${tx}'s copy of ${packet.key}, which it has already seen (same sender and packet ID), and drops it.`
            : `${n} hears ${tx}'s copy of ${packet.key}, which it has already seen (same origin and packet ID), so the app does not show it again.`,
          claims: ['MT-C03'],
        });
        if (addressed && n === packet.origin && r.awaiting[n].has(packet.message) && !implicit.has(packet.message)) {
          implicit.add(packet.message);
          r.emit({
            node: n,
            action: 'implicit-ack',
            from: tx,
            packet,
            reason: `${n} overhears ${tx} relay its own ${packet.message}: an implicit ACK. It stops retrying, but this proves only that ${tx} transmitted it, not that ${packet.dest} received it.`,
            claims: ['MT-C13'],
          });
        }
        const mine = r.pending.findIndex((p) => p.node === n && p.packet.key === packet.key);
        if (mine < 0) continue;
        if (role(n) === 'ROUTER') {
          r.emit({
            node: n,
            action: 'keep-relay',
            from: tx,
            packet,
            reason: `${n} is a ROUTER: hearing ${tx}'s rebroadcast does not cancel its own pending relay.`,
            claims: ['MT-C05'],
          });
        } else {
          r.pending.splice(mine, 1);
          r.emit({
            node: n,
            action: 'cancel-relay',
            from: tx,
            packet,
            reason: `${n} (${role(n)}) heard ${tx} rebroadcast this packet over LoRa before its own turn, so it cancels its pending relay.`,
            claims: ['MT-C03'],
          });
        }
        continue;
      }
      r.seen[n].add(packet.key);
      firstHear(n, tx, packet, `${n} receives ${packet.key} from ${tx} for the first time.`, ['MT-C03']);
    }
  }

  function firstHear(n: NodeId, tx: NodeId, packet: PacketRef, reason: string, claims: string[]) {
    r.emit({ node: n, action: 'hear', from: tx, packet, reason, claims });
    if (packet.dest !== undefined) return hearAddressed(n, tx, packet);
    r.delivered[n].add(packet.message);
    const watched = cfg.traffic.kind === 'channel-broadcast' && n === cfg.traffic.observer;
    r.emit({
      node: n,
      action: 'deliver',
      from: tx,
      packet,
      reason: `First copy of ${packet.key}: ${n}'s app shows the channel message${watched ? ' (this is the watched node)' : ''}.`,
      claims: ['MT-C03'],
    });
    relay(n, tx, packet);
  }

  /** v2: a DM, or its ACK, heard for the first time (or reprocessed as a fallback). */
  function hearAddressed(n: NodeId, tx: NodeId, packet: PacketRef) {
    const dest = packet.dest!;
    if (n === dest) {
      if (packet.kind === 'text') {
        r.delivered[n].add(packet.message);
        r.emit({
          node: n,
          action: 'deliver',
          from: tx,
          packet,
          reason: `${n} is the destination: its app shows ${packet.message}. A node does not relay a packet addressed to itself.`,
          claims: ['MT-C10', 'RT-X01'],
        });
        const hop = r.outPaths[n][packet.origin]?.[0];
        const ack: PacketRef = {
          key: `${n}#${++packetId}`,
          kind: 'ack',
          route: hop ? 'direct' : 'flood',
          origin: n,
          dest: packet.origin,
          hopLimit: cfg.traffic.hopLimit,
          message: packet.message,
          nextHop: hop,
        };
        r.queue(
          n,
          ack,
          `${n} sends a routing ACK for ${packet.message} to ${packet.origin}${hop ? ` via its saved next hop ${hop}` : ' with no next-hop preference, so it is flooded'}. The model gives the ACK the scenario's hop limit; the firmware's ACK hop budget is not modeled.`,
          ['MT-C14', 'MT-C10'],
        );
      } else if (r.awaiting[n].delete(packet.message)) {
        r.emit({
          node: n,
          action: 'ack',
          from: tx,
          packet,
          reason: `${n} receives the routing ACK for ${packet.message} from ${packet.origin}. In 2.7 this confirms protocol receipt; it is not a signed delivery receipt and not proof a person read it.`,
          claims: ['MT-C14'],
        });
      }
      return;
    }
    if (packet.nextHop && packet.nextHop !== n) {
      r.preferredOnly[n].add(packet.key);
      r.emit({
        node: n,
        action: 'ignore',
        from: tx,
        packet,
        reason: `${n} is not the named next hop (${packet.nextHop}) for this copy, so it does not relay it, even if it could reach ${dest}.`,
        claims: ['MT-C10', 'RT-X01'],
      });
      return;
    }
    relay(n, tx, packet);
  }

  function relay(n: NodeId, tx: NodeId, packet: PacketRef) {
    if (role(n) === 'CLIENT_MUTE') {
      r.emit({ node: n, action: 'no-relay', from: tx, packet, reason: `${n} is CLIENT_MUTE: it receives but never relays others' packets.`, claims: ['MT-C07'] });
    } else if ((packet.hopLimit ?? 0) <= 0) {
      r.emit({ node: n, action: 'no-relay', from: tx, packet, reason: `Hop limit 0 on this copy: ${n} can receive it but cannot relay it further.`, claims: ['MT-C08'] });
    } else if (packet.dest !== undefined) {
      // A named next hop forwards with its own saved preference; a flood copy keeps none (RT-X01).
      const own = packet.nextHop ? (r.outPaths[n][packet.dest]?.[0] ?? undefined) : undefined;
      const copy: PacketRef = { ...packet, hopLimit: packet.hopLimit! - 1, route: own ? 'direct' : 'flood', nextHop: own };
      const why = packet.nextHop
        ? `${n} is the named next hop: it relays ${packet.key} with hop limit ${copy.hopLimit}, naming ${own ? `its own saved next hop ${own}` : 'no next hop (it has none saved, so the copy floods)'}.`
        : `${n} relays the flooded ${packet.kind === 'ack' ? 'ACK' : 'DM'} ${packet.key} with hop limit ${copy.hopLimit}; its order comes from the seed, not firmware timing.`;
      const claims = packet.nextHop ? ['MT-C10', 'RT-X01', 'MT-C08'] : ['MT-C06', 'MT-C08'];
      r.queue(n, copy, why, claims);
      r.emit({ node: n, action: 'queue-relay', from: tx, packet: copy, reason: why, claims });
    } else {
      const copy = { ...packet, hopLimit: packet.hopLimit! - 1 };
      const router = role(n) === 'ROUTER';
      r.queue(
        n,
        copy,
        `${n} rebroadcasts the same packet (same origin and ID) with hop limit ${copy.hopLimit}.${router ? ' As a ROUTER it uses an earlier relay window than CLIENT nodes.' : ''}`,
        router ? ['MT-C05', 'MT-C06'] : ['MT-C06', 'MT-C08'],
      );
      r.emit({
        node: n,
        action: 'queue-relay',
        from: tx,
        packet: copy,
        reason: `${n} (${role(n)}, rebroadcast ALL) queues a relay with hop limit ${copy.hopLimit}. It waits its turn; its order here comes from the seed, not firmware timing.`,
        claims: ['MT-C06', 'MT-C07', 'MT-C08'],
      });
    }
  }
}

// ---------- MeshCore: known direct path, failure, explicit reset, re-flood ----------

function runMeshCore(cfg: MeshCoreScenario, actions: UserAction[]): Run {
  const r = new Run(cfg);
  const node = (id: NodeId) => cfg.nodes.find((n) => n.id === id)!;
  const repeats = (id: NodeId) => node(id).role === 'repeater';
  const fmt = (path: NodeId[] | null | undefined) => (path ? `[${path.map((id) => node(id).prefix).join(', ')}]` : 'unknown');
  let packets = 0;
  let messages = 0;

  /** Queue a new packet from `from`: direct on its stored path, else flooded. */
  const originate = (from: NodeId, base: Omit<PacketRef, 'key' | 'route' | 'path'>, reason: string, claims: string[]) => {
    const path = r.outPaths[from][base.dest!];
    const packet: PacketRef = path
      ? { ...base, key: `p${++packets}`, route: 'direct', path: [...path] }
      : { ...base, key: `p${++packets}`, route: 'flood', path: [] };
    r.queue(from, packet, `${reason} ${path ? `Sent direct on stored path ${fmt(path)}.` : 'No stored path, so it is flooded.'}`, claims);
  };

  for (const action of actions) {
    if (action.type === 'reset-path') {
      if (!r.ids.includes(action.node) || !r.ids.includes(action.dest)) throw new Error('Unsupported action: reset-path names an unknown node');
      r.outPaths[action.node][action.dest] = null;
      r.emit({
        node: action.node,
        action: 'user-reset-path',
        learned: { dest: action.dest, path: null },
        reason: `User action: reset ${action.node}'s stored path to ${action.dest}. This only changes ${action.node}'s stored state; nothing is transmitted.`,
        claims: ['MC-012'],
      });
      continue;
    }
    if (action.type === 'set-links') {
      r.setLinks(action);
      continue;
    }
    if (action.type === 'advert') {
      const { node: from, scope } = action;
      const flood = scope === 'flood';
      r.emit({
        node: from,
        action: 'user-advert',
        reason: `User action: ${from}'s client sends a ${flood ? 'flooded advert, which eligible repeaters may carry further' : 'zero-hop advert, heard only by direct neighbours'}. An advert carries ${from}'s identity, not a route.`,
        claims: ['MC-006', 'MC-007'],
      });
      const p: PacketRef = { key: `p${++packets}`, kind: 'advert', route: flood ? 'flood' : 'direct', origin: from, path: [], message: `advert-${from}` };
      r.queue(from, p, `${from} transmits its ${flood ? 'flooded' : 'zero-hop'} advert.`, ['MC-006']);
      r.drain(() => 0, hearAll);
      continue;
    }
    if (action.type !== 'send') throw new Error(`Unsupported action: ${(action as { type: string }).type}`);
    const { from, to } = cfg.traffic;
    if (r.contacts && !r.contacts[from].has(to)) {
      r.emit({
        node: from,
        action: 'no-contact',
        reason: `The app on ${from} has no contact for ${to}, so it has no key to encrypt to and sends nothing. This is a client check, not a radio failure; hearing ${to}'s advert adds the contact.`,
        claims: ['MC-007', 'MC-019'],
      });
      continue;
    }
    const message = `m${++messages}`;
    const known = r.outPaths[from][to];
    r.awaiting[from].add(message);
    r.emit({
      node: from,
      action: 'user-send',
      reason: `The app on ${from} sends direct message ${message} to ${to}. ${from}'s stored path to ${to}: ${fmt(known)}.`,
      claims: known ? ['MC-009'] : ['MC-008'],
    });
    originate(from, { kind: 'text', origin: from, dest: to, message }, `${from} transmits message ${message}.`, known ? ['MC-009'] : ['MC-008']);
    r.drain(() => 0, hearAll);

    for (const m of r.awaiting[from]) {
      r.emit({
        node: from,
        action: 'no-confirmation',
        reason: `No matching ACK for ${m} reached ${from}. From ${from}'s side this does not show which hop failed or whether ${to} received it.`,
        claims: ['MC-030', 'MC-011'],
      });
    }
    r.awaiting[from].clear();
  }
  return r;

  function hearAll(tx: NodeId, packet: PacketRef) {
    for (const n of r.hearers(tx)) {
      if (r.seen[n].has(packet.key)) {
        r.emit({ node: n, action: 'duplicate', from: tx, packet, reason: `${n} hears ${tx}'s copy of ${packet.key} but has already seen that packet, so it drops it.`, claims: ['MC-010'] });
        continue;
      }
      r.seen[n].add(packet.key);
      r.emit({ node: n, action: 'hear', from: tx, packet, reason: `${n} receives ${packet.kind} packet ${packet.key} (${packet.route}) from ${tx}.`, claims: ['MC-010'] });

      if (packet.kind === 'advert') {
        const o = packet.origin;
        r.contacts?.[n].add(o);
        const stored = r.outPaths[n][o] ?? null;
        r.emit({
          node: n,
          action: 'discover',
          from: tx,
          packet,
          learned: { dest: o, path: stored && [...stored] },
          reason: `${n} ${r.contacts ? 'adds' : 'refreshes'} ${o} as a contact from its advert${packet.path!.length ? `, which arrived via ${fmt(packet.path)}` : ''}. ${n}'s stored DM path to ${o} stays ${fmt(stored)}: an advert is not a learned route.`,
          claims: ['MC-007'],
        });
        if (packet.route === 'direct') {
          r.emit({ node: n, action: 'no-relay', from: tx, packet, reason: `A zero-hop advert is never repeated, so ${n} does not forward it.`, claims: ['MC-006'] });
        } else if (!repeats(n)) {
          r.emit({ node: n, action: 'no-relay', from: tx, packet, reason: `${n} is a companion and its repeat is off, so it does not repeat the advert.`, claims: ['MC-004'] });
        } else {
          const copy = { ...packet, path: [...packet.path!, n] };
          r.queue(n, copy, `${n} repeats the flooded advert with its prefix added: ${fmt(copy.path)}.`, ['MC-006', 'MC-005']);
          r.emit({ node: n, action: 'queue-relay', from: tx, packet: copy, reason: `${n} is a repeater: it queues the flooded advert with its prefix appended, ${fmt(copy.path)}.`, claims: ['MC-006', 'MC-005'] });
        }
        continue;
      }

      if (packet.route === 'direct') {
        const next = packet.path![0];
        if (next === undefined) {
          if (n === packet.dest) handle(n, tx, packet);
          else r.emit({ node: n, action: 'ignore', from: tx, packet, reason: `${n} is not the destination and the direct path is used up, so it ignores the packet.`, claims: ['MC-009'] });
        } else if (n !== next) {
          r.emit({
            node: n,
            action: 'ignore',
            from: tx,
            packet,
            reason: `${n} is not the named next relay (${node(next).prefix}), so it does not forward this direct packet, even if it could reach ${packet.dest}.`,
            claims: ['MC-011', 'MC-009'],
          });
        } else if (!repeats(n)) {
          r.emit({ node: n, action: 'no-relay', from: tx, packet, reason: `${n} is the named next relay, but it is a companion and its repeat is off.`, claims: ['MC-004'] });
        } else {
          const copy = { ...packet, path: packet.path!.slice(1) };
          r.queue(n, copy, `${n} forwards the direct packet; remaining path ${fmt(copy.path)}.`, ['MC-009']);
          r.emit({ node: n, action: 'queue-relay', from: tx, packet: copy, reason: `${n} matches the next path entry, removes it and queues the forward.`, claims: ['MC-009'] });
        }
        continue;
      }

      // flood
      if (n === packet.dest) {
        handle(n, tx, packet);
      } else if (!repeats(n)) {
        r.emit({ node: n, action: 'no-relay', from: tx, packet, reason: `${n} is a companion and its repeat is off, so it does not repeat floods.`, claims: ['MC-004'] });
      } else {
        const copy = { ...packet, path: [...packet.path!, n] };
        r.queue(n, copy, `${n} repeats the flood with its prefix added: path so far ${fmt(copy.path)}.`, ['MC-005', 'MC-008']);
        r.emit({ node: n, action: 'queue-relay', from: tx, packet: copy, reason: `${n} is a repeater: it queues the flood with its prefix appended, ${fmt(copy.path)}.`, claims: ['MC-005', 'MC-008'] });
      }
    }
  }

  function handle(n: NodeId, tx: NodeId, packet: PacketRef) {
    const peer = packet.origin;
    if (r.contacts && !r.contacts[n].has(peer)) {
      r.emit({
        node: n,
        action: 'ignore',
        from: tx,
        packet,
        reason: `${n} has no contact for sender prefix ${node(peer).prefix}, so it cannot derive the shared secret and can neither read nor answer this packet.`,
        claims: ['MC-019'],
      });
      return;
    }
    if (packet.kind === 'text') {
      r.delivered[n].add(packet.message);
      r.emit({ node: n, action: 'deliver', from: tx, packet, reason: `${n}'s app shows message ${packet.message} from ${peer}. ${n} now owes ${peer} an ACK.`, claims: ['MC-030'] });
      if (packet.route === 'flood') {
        const route = [...packet.path!];
        const p: PacketRef = { key: `p${++packets}`, kind: 'path', route: 'flood', origin: n, dest: peer, path: [], carries: route, message: packet.message };
        r.queue(n, p, `${n} floods a PATH back to ${peer}, carrying the route the message took ${fmt(route)} and the ACK for ${packet.message}.`, ['MC-008']);
      } else {
        originate(n, { kind: 'ack', origin: n, dest: peer, message: packet.message }, `${n} sends the ACK for ${packet.message} to ${peer}.`, ['MC-030']);
      }
      return;
    }
    if (packet.kind === 'path') {
      const learned = [...packet.carries!];
      r.outPaths[n][peer] = [...learned];
      r.emit({ node: n, action: 'learn-path', from: tx, packet, learned: { dest: peer, path: [...learned] }, reason: `${n} stores its path to ${peer}: ${fmt(learned)}.`, claims: ['MC-008', 'MC-009'] });
      confirm(n, tx, packet);
      if (packet.route === 'flood') {
        // Reciprocal path: tell the peer the route this PATH flood took, sent direct.
        const back = [...packet.path!];
        const p: PacketRef = { key: `p${++packets}`, kind: 'path', route: 'direct', origin: n, dest: peer, path: [...learned], carries: back, message: packet.message };
        r.queue(n, p, `${n} sends ${peer} a direct PATH reporting the route the flood took back here, ${fmt(back)}.`, ['MC-008']);
      }
      return;
    }
    confirm(n, tx, packet);
  }

  function confirm(n: NodeId, tx: NodeId, packet: PacketRef) {
    if (!r.awaiting[n].delete(packet.message)) return;
    r.emit({
      node: n,
      action: 'ack',
      from: tx,
      packet,
      reason: `${n} matches the ACK for ${packet.message}: protocol receipt is confirmed. This is not proof a person read it.`,
      claims: ['MC-030'],
    });
  }
}

// ---------- public API ----------

export function simulate(config: ScenarioConfig, actions: UserAction[]): Trace {
  const cfg = validateScenario(config);
  const known = (id: unknown) => typeof id === 'string' && cfg.nodes.some((n) => n.id === id);
  for (const a of actions) {
    const v2 = cfg.version === 2 && (a?.type === 'advert' || a?.type === 'set-links');
    if (!a || (a.type !== 'send' && a.type !== 'reset-path' && !v2)) throw new Error(`Unsupported action: ${JSON.stringify(a)}`);
    if (a.type === 'reset-path' && cfg.protocol !== 'meshcore') throw new Error('Unsupported action: reset-path is MeshCore only');
    if (a.type === 'advert' && (cfg.protocol !== 'meshcore' || !known(a.node) || (a.scope !== 'zero-hop' && a.scope !== 'flood'))) {
      throw new Error('Unsupported action: advert needs a MeshCore node and scope zero-hop or flood');
    }
    if (a.type === 'set-links') {
      if (!known(a.node) || typeof a.label !== 'string') throw new Error('Unsupported action: set-links needs a known node and a label');
      validateLinks(a.links, known);
    }
  }
  const initial = new Run(cfg).snapshot();
  const r = cfg.protocol === 'meshtastic' ? runMeshtastic(cfg, actions) : runMeshCore(cfg, actions);
  return { modelVersion: cfg.version, initial, events: r.events, snapshots: r.snapshots };
}

/**
 * Relays a delivered copy passed through (not RF links). Meshtastic: the origin's hop
 * limit minus the copy's remaining limit (MT-C08). MeshCore flood: prefixes in the
 * path; MeshCore direct: forwards of that packet before delivery (MC-009).
 * Undefined unless events[i] is a deliver event.
 */
export function deliveryHops(trace: Trace, i: number): number | undefined {
  const e = trace.events[i];
  if (e?.action !== 'deliver' || !e.packet) return undefined;
  const p = e.packet;
  const sent = trace.events.slice(0, i).filter((x) => x.action === 'transmit' && x.packet?.key === p.key);
  if (p.hopLimit !== undefined) return sent.find((x) => x.node === p.origin)!.packet!.hopLimit! - p.hopLimit;
  if (p.route === 'flood') return p.path!.length;
  return sent.filter((x) => x.node !== p.origin).length;
}

export function metricsAt(trace: Trace, upto: number): Metrics {
  const ev = trace.events.slice(0, Math.max(0, Math.min(upto, trace.events.length)));
  const count = (f: (e: SimEvent) => boolean) => ev.filter(f).length;
  const sent = new Set<string>();
  let retries = 0;
  for (const e of ev) {
    if (e.action !== 'transmit' || e.node !== e.packet?.origin) continue;
    if (sent.has(e.packet.key)) retries++;
    sent.add(e.packet.key);
  }
  return {
    rfTransmissions: count((e) => e.action === 'transmit'),
    originTransmissions: count((e) => e.action === 'transmit' && e.node === e.packet?.origin),
    relayTransmissions: count((e) => e.action === 'transmit' && e.node !== e.packet?.origin),
    controlTransmissions: count((e) => e.action === 'transmit' && e.packet?.kind !== 'text'),
    uniqueDeliveries: count((e) => e.action === 'deliver'),
    duplicatesHeard: count((e) => e.action === 'duplicate'),
    cancelledRelays: count((e) => e.action === 'cancel-relay'),
    retries,
    confirmations: count((e) => e.action === 'ack'),
    unconfirmed: count((e) => e.action === 'no-confirmation'),
  };
}

export interface Controller {
  readonly config: ScenarioConfig;
  readonly trace: Trace;
  readonly position: number;
  readonly actions: readonly UserAction[];
  dispatch(action: UserAction): void;
  step(): void;
  run(): void;
  reset(): void;
  canStep(): boolean;
  visibleEvents(): SimEvent[];
  snapshot(): Snapshot;
  metrics(): Metrics;
}

/** Playhead over a replayable action list. Same config + actions = same trace. */
export function createController(config: ScenarioConfig): Controller {
  const cfg = validateScenario(config);
  let actions: UserAction[] = [];
  let trace = simulate(cfg, actions);
  let position = 0;
  return {
    config: cfg,
    get trace() {
      return trace;
    },
    get position() {
      return position;
    },
    get actions() {
      return [...actions];
    },
    dispatch(action) {
      const next = [...actions, action];
      trace = simulate(cfg, next);
      actions = next;
    },
    step() {
      position = Math.min(position + 1, trace.events.length);
    },
    run() {
      position = trace.events.length;
    },
    reset() {
      actions = [];
      trace = simulate(cfg, actions);
      position = 0;
    },
    canStep: () => position < trace.events.length,
    visibleEvents: () => trace.events.slice(0, position),
    snapshot: () => (position ? trace.snapshots[position - 1] : trace.initial),
    metrics: () => metricsAt(trace, position),
  };
}
