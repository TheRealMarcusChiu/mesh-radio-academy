/**
 * Versioned synthetic fixtures for the routing playground (FIXTURE_VERSION 1).
 * One shared diamond graph: A–B, A–C, B–D, C–D, optional B–C, no A–D.
 * Node names, prefixes and seeds are invented teaching values, not captures.
 * Claims: MT-F01 (Meshtastic diamond), MC-F04 (MeshCore known path / failure).
 */
import type { Link, McRole, MeshCoreScenario, MeshtasticScenario, MtRole, NodeId } from '../lib/routing.ts';

export const FIXTURE_VERSION = 1;

/** Seeds whose tie order puts B (or C) first. Teaching assumption, not radio behavior. */
export const SEEDS = { bFirst: 3, cFirst: 1 } as const;

export interface DiamondOptions<R> {
  /** B and C can hear each other (audible) or not (hidden relays). */
  bcAudible: boolean;
  /** The B–D link works in both directions. */
  bdWorks: boolean;
  seed: number;
  roles: Partial<Record<'B' | 'C', R>>;
}

const both = (a: NodeId, b: NodeId): Link[] => [
  { from: a, to: b },
  { from: b, to: a },
];

export function diamondLinks({ bcAudible, bdWorks }: { bcAudible: boolean; bdWorks: boolean }): Link[] {
  return [
    ...both('A', 'B'),
    ...both('A', 'C'),
    ...(bdWorks ? both('B', 'D') : []),
    ...both('C', 'D'),
    ...(bcAudible ? both('B', 'C') : []),
  ];
}

/** MT-F01: channel broadcast from A, D watched, ordinary CLIENT / rebroadcast ALL, hop limit 1. */
export function mtDiamond(opts: Partial<DiamondOptions<MtRole>> = {}): MeshtasticScenario {
  const { bcAudible = true, bdWorks = true, seed = SEEDS.bFirst, roles = {} } = opts;
  return {
    version: 1,
    id: 'mt-diamond',
    protocol: 'meshtastic',
    seed,
    nodes: [
      { id: 'A', role: 'CLIENT' },
      { id: 'B', role: roles.B ?? 'CLIENT' },
      { id: 'C', role: roles.C ?? 'CLIENT' },
      { id: 'D', role: 'CLIENT' },
    ],
    links: diamondLinks({ bcAudible, bdWorks }),
    traffic: { kind: 'channel-broadcast', from: 'A', observer: 'D', hopLimit: 1 },
  };
}

/**
 * MC-F04: A and D are companions (repeat off), B and C dedicated repeaters.
 * Starting state: A already stores [B] toward D, and D independently stores [B]
 * toward A. B–D is broken by default.
 */
export function mcKnownPath(opts: Partial<DiamondOptions<McRole>> = {}): MeshCoreScenario {
  const { bcAudible = true, bdWorks = false, seed = SEEDS.bFirst, roles = {} } = opts;
  return {
    version: 1,
    id: 'mc-known-path',
    protocol: 'meshcore',
    seed,
    nodes: [
      { id: 'A', role: 'companion', prefix: 'a1' },
      { id: 'B', role: roles.B ?? 'repeater', prefix: 'b2' },
      { id: 'C', role: roles.C ?? 'repeater', prefix: 'c3' },
      { id: 'D', role: 'companion', prefix: 'd4' },
    ],
    links: diamondLinks({ bcAudible, bdWorks }),
    traffic: { kind: 'dm', from: 'A', to: 'D' },
    outPaths: { A: { D: ['B'] }, D: { A: ['B'] } },
  };
}
