/**
 * Deterministic teaching model of two forwarding schemes on a shared graph.
 * Contract: docs/model-contract.md (MODEL_VERSION 1). Pure: no DOM, no clock,
 * no randomness except the seeded tie order. Times are teaching ticks, not
 * firmware milliseconds. Every decision cites claim IDs from research/claims.md.
 *
 * Meshtastic side: managed-flood channel broadcast (firmware 2.7.26 baseline).
 * MeshCore side: known direct path, failure, explicit reset and re-flood
 * (firmware 1.18.0 baseline). Neither is a cycle-accurate radio simulator.
 */

export const MODEL_VERSION = 1;

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
  version: 1;
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
  /** Channel broadcast: no single destination; `observer` is the node the lesson watches. */
  traffic: { kind: 'channel-broadcast'; from: NodeId; observer: NodeId; hopLimit: number };
}

export interface MeshCoreScenario extends BaseScenario {
  protocol: 'meshcore';
  nodes: McNode[];
  traffic: { kind: 'dm'; from: NodeId; to: NodeId };
  /** Stored outgoing paths: outPaths[owner][dest] = intermediate relays, or null when unknown. */
  outPaths: Record<NodeId, Record<NodeId, NodeId[] | null>>;
}

export type ScenarioConfig = MeshtasticScenario | MeshCoreScenario;

export type UserAction = { type: 'send' } | { type: 'reset-path'; node: NodeId; dest: NodeId };

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
  | 'no-confirmation';

export interface PacketRef {
  /** Identity used for duplicate detection (Meshtastic: origin + packet ID; MeshCore: packet hash stand-in). */
  key: string;
  kind: 'text' | 'path' | 'ack';
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
  outPaths: Record<NodeId, NodeId[] | null>;
  awaiting: string[];
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
  'Encryption and keys: every node is assumed to have what it needs to read packets meant for it.',
  'Meshtastic favorite-router hop exceptions, reliable-retry fallback and MQTT bridging.',
  'MeshCore flood scopes and hop limits, adverts, client-side automatic retry policies and room servers.',
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
  if (c.version !== MODEL_VERSION) fail(`version must be ${MODEL_VERSION}`);
  if (typeof c.id !== 'string') fail('id must be a string');
  if (!Number.isInteger(c.seed) || c.seed < 0 || c.seed > 0xffffffff) fail('seed must be an unsigned 32-bit integer');
  if (!Array.isArray(c.nodes) || !Array.isArray(c.links)) fail('nodes and links must be arrays');
  const ids = new Set<string>();
  for (const n of c.nodes) {
    if (!n || typeof n.id !== 'string' || !/^[A-Z]$/.test(n.id)) fail('node ids are single capital letters');
    if (ids.has(n.id)) fail(`duplicate node ${n.id}`);
    ids.add(n.id);
  }
  const known = (id: unknown) => typeof id === 'string' && ids.has(id);
  const edges = new Set<string>();
  for (const l of c.links) {
    if (!l || !known(l.from) || !known(l.to) || l.from === l.to) fail('link refers to an unknown node');
    // One directed edge = one reception per transmission; a repeat would fake a second copy.
    if (edges.has(`${l.from}>${l.to}`)) fail(`duplicate link ${l.from}→${l.to}`);
    edges.add(`${l.from}>${l.to}`);
  }
  const isRecord = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);

  if (c.protocol === 'meshtastic') {
    for (const n of c.nodes) if (!MT_ROLES.includes(n.role)) fail(`unsupported Meshtastic role ${String(n.role)}`);
    const t = c.traffic;
    if (t?.kind !== 'channel-broadcast' || !known(t.from) || !known(t.observer)) fail('broadcast traffic needs known from/observer');
    if (!Number.isInteger(t.hopLimit) || t.hopLimit < 0 || t.hopLimit > 7) fail('hopLimit must be 0–7');
  } else if (c.protocol === 'meshcore') {
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
  ids: NodeId[];
  readonly cfg: ScenarioConfig;

  constructor(cfg: ScenarioConfig) {
    this.cfg = cfg;
    this.ids = cfg.nodes.map((n) => n.id);
    for (const id of this.ids) {
      this.delivered[id] = new Set();
      this.seen[id] = new Set();
      this.awaiting[id] = new Set();
      this.outPaths[id] = {};
    }
    if (cfg.protocol === 'meshcore') {
      for (const [owner, table] of Object.entries(cfg.outPaths)) {
        for (const [dest, path] of Object.entries(table)) this.outPaths[owner][dest] = path && [...path];
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
    }
    return { time: this.time, nodes };
  }

  emit(e: Omit<SimEvent, 'order' | 'time'>) {
    const packet = e.packet && {
      ...e.packet,
      path: e.packet.path && [...e.packet.path],
      carries: e.packet.carries && [...e.packet.carries],
    };
    if (packet && !packet.carries) delete packet.carries;
    this.events.push({ ...e, packet, order: this.events.length, time: this.time });
    this.snapshots.push(this.snapshot());
  }

  /** Nodes that can hear `from`, in seeded order. */
  hearers(from: NodeId): NodeId[] {
    return relayOrder(
      this.cfg.seed,
      this.cfg.links.filter((l) => l.from === from).map((l) => l.to),
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
  let packetId = 0;

  for (const action of actions) {
    if (action.type !== 'send') throw new Error(`Unsupported action for Meshtastic: ${action.type}`);
    const { from, observer, hopLimit } = cfg.traffic;
    packetId++;
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
    // ROUTER relays use an earlier window than CLIENT relays; the seed orders the rest.
    r.drain((x) => (role(x.node) === 'ROUTER' ? 0 : 1), hearAll);
  }
  return r;

  function hearAll(tx: NodeId, packet: PacketRef) {
    for (const n of r.hearers(tx)) {
      if (r.seen[n].has(packet.key)) {
        r.emit({
          node: n,
          action: 'duplicate',
          from: tx,
          packet,
          reason: `${n} hears ${tx}'s copy of ${packet.key}, which it has already seen (same origin and packet ID), so the app does not show it again.`,
          claims: ['MT-C03'],
        });
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
      r.emit({ node: n, action: 'hear', from: tx, packet, reason: `${n} receives ${packet.key} from ${tx} for the first time.`, claims: ['MT-C03'] });
      r.delivered[n].add(packet.message);
      r.emit({
        node: n,
        action: 'deliver',
        from: tx,
        packet,
        reason: `First copy of ${packet.key}: ${n}'s app shows the channel message${n === cfg.traffic.observer ? ' (this is the watched node)' : ''}.`,
        claims: ['MT-C03'],
      });
      if (role(n) === 'CLIENT_MUTE') {
        r.emit({ node: n, action: 'no-relay', from: tx, packet, reason: `${n} is CLIENT_MUTE: it receives but never relays others' packets.`, claims: ['MT-C07'] });
      } else if ((packet.hopLimit ?? 0) <= 0) {
        r.emit({ node: n, action: 'no-relay', from: tx, packet, reason: `Hop limit 0 on this copy: ${n} can receive it but cannot relay it further.`, claims: ['MT-C08'] });
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
    if (action.type !== 'send') throw new Error(`Unsupported action: ${(action as { type: string }).type}`);
    const { from, to } = cfg.traffic;
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
  for (const a of actions) {
    if (!a || (a.type !== 'send' && a.type !== 'reset-path')) throw new Error(`Unsupported action: ${JSON.stringify(a)}`);
    if (a.type === 'reset-path' && cfg.protocol !== 'meshcore') throw new Error('Unsupported action: reset-path is MeshCore only');
  }
  const initial = new Run(cfg).snapshot();
  const r = cfg.protocol === 'meshtastic' ? runMeshtastic(cfg, actions) : runMeshCore(cfg, actions);
  return { modelVersion: MODEL_VERSION, initial, events: r.events, snapshots: r.snapshots };
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
