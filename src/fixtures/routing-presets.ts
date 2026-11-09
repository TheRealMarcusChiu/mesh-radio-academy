/**
 * Topology presets and named fixtures for routing model version 2 (PRESET_VERSION 1).
 * Every graph, prefix, seed and position is an invented teaching value, not a capture
 * or a coverage prediction. Links are learner-set audibility (RT-X08, pending ledger).
 * Version-1 fixtures in ./routing.ts are unchanged.
 */
import type { Link, McRole, MeshCoreScenario, MeshtasticScenario, MtRole, NodeId, Protocol, ScenarioConfig } from '../lib/routing.ts';

export const PRESET_VERSION = 1;

export type PresetId = 'two-nodes' | 'line' | 'diamond' | 'mobile' | 'sparse';

export interface Preset {
  id: PresetId;
  label: string;
  summary: string;
  /** SVG centre of each node, in the playground's 400 × 304 viewBox. */
  pos: Record<NodeId, [number, number]>;
  /** Node pairs drawn on the graph; each can be on in either or both directions. */
  pairs: [NodeId, NodeId][];
  /** Pairs audible both ways at the start; the rest start with no link. */
  on: [NodeId, NodeId][];
  /** Nodes whose role the learner may change (never the sender or destination). */
  relays: NodeId[];
  /** Nodes whose labels sit below the circle so they don't collide with an edge. */
  labelBelow: NodeId[];
  /** MeshCore starting stored path A → D (and D → A), or null for unknown. */
  mcPath: NodeId[] | null;
  /** Stored-path choices offered as the MeshCore path constraint. */
  mcPathChoices: (NodeId[] | null)[];
  /** Meshtastic hop limit to start with. */
  hopLimit: number;
  /** Controlled topology change for the mobile preset: the links after the move. */
  move?: { node: NodeId; label: string; on: [NodeId, NodeId][] };
}

/** Playground SVG viewBox; the top padding keeps above-node labels visible (Q-SLICE-01). */
export const VIEWBOX = [0, -20, 400, 304] as const;
/** Baseline offsets of the role and status labels from a node's centre. */
export const LABEL_DY = { role: { above: -30, below: 40 }, status: { above: -44, below: 54 } } as const;
export const labelY = (p: Preset, id: NodeId, kind: 'role' | 'status') =>
  p.pos[id][1] + LABEL_DY[kind][p.labelBelow.includes(id) ? 'below' : 'above'];

export const PREFIXES: Record<NodeId, string> = { A: 'a1', B: 'b2', C: 'c3', D: 'd4', E: 'e5', F: 'f6' };

export const PRESETS: readonly Preset[] = [
  {
    id: 'two-nodes',
    label: 'Two nodes',
    summary: 'A and D hear each other directly. No relay is involved.',
    pos: { A: [80, 130], D: [320, 130] },
    pairs: [['A', 'D']],
    on: [['A', 'D']],
    relays: [],
    labelBelow: [],
    mcPath: [],
    mcPathChoices: [[], null],
    hopLimit: 3,
  },
  {
    id: 'line',
    label: 'Three-node line',
    summary: 'A and D are out of earshot; B sits between them.',
    pos: { A: [60, 130], B: [200, 130], D: [340, 130] },
    pairs: [['A', 'B'], ['B', 'D']],
    on: [['A', 'B'], ['B', 'D']],
    relays: ['B'],
    labelBelow: [],
    mcPath: null,
    mcPathChoices: [null, ['B']],
    hopLimit: 3,
  },
  {
    id: 'diamond',
    label: 'Diamond',
    summary: 'Two possible relays, B and C, between A and D; A cannot hear D.',
    pos: { A: [60, 130], B: [200, 46], C: [200, 214], D: [340, 130] },
    pairs: [['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D'], ['B', 'C']],
    on: [['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D'], ['B', 'C']],
    relays: ['B', 'C'],
    labelBelow: ['C'],
    mcPath: ['B'],
    mcPathChoices: [null, ['B'], ['C']],
    hopLimit: 1,
  },
  {
    id: 'mobile',
    label: 'Mobile node',
    summary: 'D starts near B, then the learner moves it near C. The move is a controlled change, not a radio prediction.',
    pos: { A: [60, 130], B: [200, 46], C: [200, 214], D: [340, 130] },
    pairs: [['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D']],
    on: [['A', 'B'], ['A', 'C'], ['B', 'D']],
    relays: ['B', 'C'],
    labelBelow: ['C'],
    mcPath: ['B'],
    mcPathChoices: [null, ['B'], ['C']],
    hopLimit: 3,
    move: { node: 'D', label: 'D moves from near B to near C', on: [['A', 'B'], ['A', 'C'], ['C', 'D']] },
  },
  {
    id: 'sparse',
    label: 'Sparse neighborhood',
    summary: 'A thin chain A–B–C–D with two side nodes: E only hears A, F only hears C.',
    pos: { A: [50, 90], B: [150, 150], C: [250, 90], D: [350, 150], E: [50, 200], F: [250, 200] },
    pairs: [['A', 'B'], ['B', 'C'], ['C', 'D'], ['A', 'E'], ['C', 'F']],
    on: [['A', 'B'], ['B', 'C'], ['C', 'D'], ['A', 'E'], ['C', 'F']],
    relays: ['B', 'C', 'E', 'F'],
    labelBelow: ['B', 'D', 'E', 'F'],
    mcPath: null,
    mcPathChoices: [null, ['B', 'C']],
    hopLimit: 3,
  },
];

export const preset = (id: string): Preset => {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown preset ${id}`);
  return p;
};

export const bothWays = (pairs: [NodeId, NodeId][]): Link[] =>
  pairs.flatMap(([a, b]) => [
    { from: a, to: b },
    { from: b, to: a },
  ]);

export interface PresetOptions {
  links?: Link[];
  seed?: number;
  roles?: Record<NodeId, MtRole | McRole>;
  /** Meshtastic: channel broadcast (default) or addressed DM from A to D. */
  mtTraffic?: 'broadcast' | 'dm';
  hopLimit?: number;
  /** MeshCore: A's stored path to D; D's path back to A is set the same way. */
  mcPath?: NodeId[] | null;
}

const ids = (p: Preset) => Object.keys(p.pos);

/** A version-2 scenario for a preset; A sends, D is the destination or watched node. */
export function presetScenario(id: PresetId, protocol: Protocol, o: PresetOptions = {}): ScenarioConfig {
  const p = preset(id);
  const links = o.links ?? bothWays(p.on);
  const seed = o.seed ?? 3;
  if (protocol === 'meshtastic') {
    const hopLimit = o.hopLimit ?? p.hopLimit;
    const base = {
      version: 2 as const,
      id: `mt-${id}`,
      protocol: 'meshtastic' as const,
      seed,
      links,
      nodes: ids(p).map((n) => ({ id: n, role: (o.roles?.[n] as MtRole) ?? 'CLIENT' })),
    };
    return o.mtTraffic === 'dm'
      ? { ...base, traffic: { kind: 'dm', from: 'A', to: 'D', hopLimit }, nextHops: {} }
      : { ...base, traffic: { kind: 'channel-broadcast', from: 'A', observer: 'D', hopLimit } };
  }
  const path = o.mcPath === undefined ? p.mcPath : o.mcPath;
  return {
    version: 2,
    id: `mc-${id}`,
    protocol: 'meshcore',
    seed,
    links,
    nodes: ids(p).map((n) => ({
      id: n,
      role: (o.roles?.[n] as McRole) ?? (n === 'A' || n === 'D' ? 'companion' : 'repeater'),
      prefix: PREFIXES[n],
    })),
    traffic: { kind: 'dm', from: 'A', to: 'D' },
    outPaths: { A: { D: path && [...path] }, D: { A: path && [...path].reverse() } },
  };
}

/**
 * MT DM fixture (research §3.2): A's saved next hop toward D is B; B's is D.
 * A–B is unavailable by default, so attempts on the preference fail and the final
 * retransmission floods through C (MT-C10, MT-C11, MT-C12). D has no preference toward A.
 */
export function mtDm(o: { abWorks?: boolean; bcAudible?: boolean; seed?: number; hopLimit?: number; roles?: Partial<Record<'B' | 'C', MtRole>> } = {}): MeshtasticScenario {
  const { abWorks = false, bcAudible = false, seed = 3, hopLimit = 3, roles = {} } = o;
  const on: [NodeId, NodeId][] = [['A', 'C'], ['B', 'D'], ['C', 'D'], ...(abWorks ? [['A', 'B'] as [NodeId, NodeId]] : []), ...(bcAudible ? [['B', 'C'] as [NodeId, NodeId]] : [])];
  const cfg = presetScenario('diamond', 'meshtastic', { links: bothWays(on), seed, hopLimit, mtTraffic: 'dm', roles }) as MeshtasticScenario;
  return { ...cfg, id: 'mt-dm-next-hop', nextHops: { A: { D: 'B' }, B: { D: 'D' } } };
}

/** MeshCore research fixtures F02/F03: no contacts and no paths either way; B–D works. Adverts come first (MC-006, MC-007, MC-008). */
export function mcFirstContact(): MeshCoreScenario {
  const cfg = presetScenario('diamond', 'meshcore', { mcPath: null }) as MeshCoreScenario;
  return { ...cfg, id: 'mc-first-contact', outPaths: {}, contacts: { A: [], B: [], C: [], D: [] } };
}

/** MeshCore research fixture F05 on the line: A→B→D works, D→B does not, so D's PATH+ACK cannot return (MC-030). */
export function mcAsymmetric(): MeshCoreScenario {
  const links = bothWays([['A', 'B']]).concat({ from: 'B', to: 'D' });
  return { ...(presetScenario('line', 'meshcore', { links, mcPath: null }) as MeshCoreScenario), id: 'mc-asymmetric' };
}
