/**
 * Settings-mismatch bench: change one thing from a known-good baseline and see which
 * stage stops. Stages are kept separate: signal at D, LoRa frame decode, native protocol
 * interpretation, decryption, app delivery at D, and the sender's ACK.
 *
 * RF-layer outcomes are sourced rules (LW-C02, LW-C04, MT-C15, MT-C16). Routing-layer
 * outcomes are computed by running the routing model (src/lib/routing.ts) on the
 * three-node line or the diamond, so they match the playground. Pure and deterministic.
 * "yes" in this lossless model never means a real radio is guaranteed to decode.
 */
import { simulate, type ScenarioConfig, type SimEvent, type UserAction } from './routing.ts';
import { mcKnownPath } from '../fixtures/routing.ts';
import { bothWays, mcAsymmetric, mtDm, presetScenario } from '../fixtures/routing-presets.ts';

export const STAGES = ['signal', 'frame', 'protocol', 'decrypt', 'app', 'ack'] as const;
export type Stage = (typeof STAGES)[number];
export type Outcome = 'yes' | 'no' | 'unknown' | 'n/a';
export type BenchProtocol = 'meshtastic' | 'meshcore';
export type Traffic = 'dm' | 'channel';

export const STAGE_LABELS: Record<Stage, string> = {
  signal: 'Signal reaches D',
  frame: 'D’s radio decodes the LoRa frame',
  protocol: 'D’s firmware parses it as its native protocol',
  decrypt: 'D can decrypt it',
  app: 'D’s app shows it',
  ack: 'A gets an end-to-end ACK',
};

export interface StageResult {
  stage: Stage;
  outcome: Outcome;
  why: string;
  claims: string[];
}

export interface Diagnosis {
  protocol: BenchProtocol;
  traffic: Traffic;
  change: ChangeId;
  stages: StageResult[];
  /** Only what the sender can know. */
  senderSees: string;
  /** Why this result differs from the baseline. */
  explain: string;
}

export const CHANGES = [
  { id: 'baseline', label: 'Known-good baseline', setup: 'A → B → D line, same protocol, region, preset, frequency, channel name and key; B relays.', change: 'Nothing.', expected: 'Every stage passes in this lossless model. Real radios can still lose packets.' },
  { id: 'other-protocol', label: 'Similar hardware, different native protocol', setup: 'Baseline, but D runs the other firmware with the same frequency, bandwidth, SF and CR.', change: 'D’s firmware protocol.', expected: 'D may be on the same channel, but it cannot interpret the other protocol’s packets.' },
  { id: 'rf-preset', label: 'RF preset mismatch', setup: 'Baseline, then D uses a different spreading factor or bandwidth.', change: 'D’s modem preset.', expected: 'D is no longer on A’s channel, so the frame does not decode.' },
  { id: 'rf-frequency', label: 'Frequency mismatch', setup: 'Baseline, then the frequency changes (Meshtastic: by renaming D’s primary channel with automatic slot selection).', change: 'D’s frequency (directly or through the primary channel name).', expected: 'MeshCore: off-frequency, no frame. Meshtastic: the slot may move; hash collisions mean it can stay.' },
  { id: 'channel-key', label: 'Logical channel key mismatch', setup: 'Baseline, then D keeps the channel name but has a different key.', change: 'D’s channel key only.', expected: 'Channel text is heard but unreadable. DMs that use peer keys are not affected.' },
  { id: 'missing-repeater', label: 'Missing repeater', setup: 'Baseline, then B is switched off.', change: 'B removed.', expected: 'D hears nothing; A gets no ACK.' },
  { id: 'stale-path', label: 'Stale or failed stored path', setup: 'Diamond: A’s stored route to D goes through B; C could also carry it.', change: 'A link on the stored route fails after it was learned (MeshCore: B–D; Meshtastic: A–B, the case the pinned fallback code covers).', expected: 'MeshCore: silent failure until an explicit reset. Meshtastic DM: retries, then a flood fallback through C.' },
  { id: 'no-e2e', label: 'Heard, but no end-to-end confirmation', setup: 'Line, but D can no longer be heard by B (one-way link).', change: 'D → B direction fails.', expected: 'D shows the message; A never gets the ACK.' },
] as const;
export type ChangeId = (typeof CHANGES)[number]['id'];

const r = (stage: Stage, outcome: Outcome, why: string, claims: string[]): StageResult => ({ stage, outcome, why, claims });
const NA = (stage: Stage, why: string) => r(stage, 'n/a', why, ['LW-C03']);
const NOT_GUARANTEED = 'In this lossless model the frame decodes. Matching settings make reception possible, not guaranteed: collisions, weak signal and framing still matter.';

function invalid(msg: string): never {
  throw new Error(`Invalid bench input: ${msg}`);
}

interface Run {
  heardAtD: boolean;
  deliveredAtD: boolean;
  noContactAtD: boolean;
  acked: boolean;
  implicit: boolean;
  retries: number;
  noConf?: SimEvent;
}

function run(cfg: ScenarioConfig, actions: UserAction[] = [{ type: 'send' }]): Run {
  const ev = simulate(cfg, actions).events;
  const at = (n: string, a: SimEvent['action']) => ev.filter((e) => e.node === n && e.action === a);
  return {
    heardAtD: at('D', 'hear').length > 0,
    deliveredAtD: at('D', 'deliver').length > 0,
    noContactAtD: at('D', 'ignore').some((e) => /no contact/.test(e.reason)),
    acked: at('A', 'ack').length > 0,
    implicit: at('A', 'implicit-ack').length > 0,
    retries: at('A', 'retry').length,
    noConf: at('A', 'no-confirmation')[0],
  };
}

/** Routing-layer scenario for a change, or undefined when the change acts at the RF/key layer. */
function routingScenario(protocol: BenchProtocol, traffic: Traffic, change: ChangeId): ScenarioConfig {
  const mtTraffic = traffic === 'dm' ? 'dm' : 'broadcast';
  const line = (links = bothWays([['A', 'B'], ['B', 'D']])) => presetScenario('line', protocol, { links, mtTraffic });
  if (change === 'missing-repeater') return line([]);
  if (change === 'stale-path') return protocol === 'meshcore' ? mcKnownPath() : staleMt(traffic);
  if (change === 'no-e2e') return protocol === 'meshcore' ? mcAsymmetric() : line(bothWays([['A', 'B']]).concat({ from: 'B', to: 'D' }));
  return line();
}

/** Meshtastic stale next hop: A still prefers B, but B can no longer hear A (research §3.2). */
function staleMt(traffic: Traffic): ScenarioConfig {
  return traffic === 'dm' ? mtDm() : presetScenario('diamond', 'meshtastic', { links: bothWays([['A', 'C'], ['B', 'D'], ['C', 'D']]), hopLimit: 3 });
}

export function diagnose(input: unknown): Diagnosis {
  const i = input as { protocol?: unknown; traffic?: unknown; change?: unknown } | null;
  if (!i || typeof i !== 'object') invalid('not an object');
  if (i.protocol !== 'meshtastic' && i.protocol !== 'meshcore') invalid('protocol must be meshtastic or meshcore');
  if (i.traffic !== 'dm' && i.traffic !== 'channel') invalid('traffic must be dm or channel');
  const def = CHANGES.find((c) => c.id === i.change);
  if (!def) invalid('change must be one of the listed single changes');
  const protocol = i.protocol;
  const traffic = i.traffic;
  const change = def.id;
  const mt = protocol === 'meshtastic';
  const dm = traffic === 'dm';
  const mcChannel = !mt && !dm;
  const done = (stages: StageResult[], senderSees: string, explain: string): Diagnosis => ({ protocol, traffic, change, stages, senderSees, explain });

  // ---- RF and protocol layer: sourced rules, no routing needed ----
  if (change === 'other-protocol') {
    return done(
      [
        r('signal', 'yes', 'Same frequency, bandwidth, SF and CR put A’s transmission on D’s channel.', ['LW-C04']),
        r('frame', 'unknown', 'Framing such as the sync word differs between the two firmwares (Meshtastic 0x2b; MeshCore a RadioLib constant). What one stock radio does with the other’s frames is not established.', ['LW-C04']),
        r('protocol', 'no', 'Even if the bytes arrived intact, the packet formats differ, so neither firmware can interpret the other natively.', ['LW-C02']),
        NA('decrypt', 'Stops at the protocol stage.'),
        NA('app', 'Stops at the protocol stage.'),
        r('ack', 'no', 'D never parses the message, so it never sends a native ACK.', ['LW-C02']),
      ],
      dm ? 'A sees no ACK, the same symptom as many other faults.' : 'A has no delivery signal for a channel message at all.',
      'Only the firmware changed. Matching radio settings are not protocol compatibility.',
    );
  }
  if (change === 'rf-preset' || (change === 'rf-frequency' && !mt)) {
    const what = change === 'rf-preset' ? 'a different spreading factor or bandwidth' : 'a different frequency';
    return done(
      [
        r('signal', 'unknown', `With ${what}, D is not tuned to A’s transmission. This model does not say whether D’s radio registers energy from it.`, ['RF-C12']),
        r('frame', 'no', `Equal frequency, bandwidth, SF and CR are the starting condition for being on D’s channel; with ${what} D does not decode the frame.`, mt ? ['LW-C04', 'MT-C15'] : ['LW-C04']),
        NA('protocol', 'No frame was decoded.'),
        NA('decrypt', 'No frame was decoded.'),
        r('app', 'no', 'Nothing reaches D’s app.', ['LW-C04']),
        r('ack', dm ? 'no' : 'n/a', dm ? 'Nothing comes back to A.' : 'Channel messages have no end-to-end ACK.', mt ? ['MT-C14'] : ['MC-030']),
      ],
      dm ? 'A sees no confirmation and cannot tell an RF mismatch from a routing fault.' : 'A sees nothing unusual: channel posts have no delivery receipt.',
      'Only an RF setting changed; the packet, keys and routing are all fine.',
    );
  }
  if (change === 'rf-frequency') {
    return done(
      [
        r('signal', 'unknown', 'Renaming the primary channel with automatic slot selection can move D to another frequency slot; whether it does depends on the name hash.', ['MT-C16']),
        r('frame', 'unknown', 'If the slot moved, D is off A’s frequency and cannot decode. If the hash happens to pick the same slot, it can.', ['MT-C16', 'MT-C15']),
        r('protocol', 'unknown', 'Only if the frame decoded.', ['MT-C16']),
        r('decrypt', 'unknown', 'The renamed primary channel also changes the channel hash D tries, so even on the same slot this channel may not match.', ['MT-C15']),
        r('app', 'unknown', 'Depends on both effects above.', ['MT-C16']),
        r('ack', dm ? 'unknown' : 'n/a', dm ? 'Depends on whether D received it.' : 'Channel messages have no end-to-end ACK.', ['MT-C14']),
      ],
      'A cannot see D’s frequency; it only notices that D seems to have gone quiet.',
      'A logical-channel name looks like an app setting, but with automatic slots it can retune the radio.',
    );
  }
  if (change === 'channel-key') {
    if (dm) {
      return done(
        [
          r('signal', 'yes', 'RF settings are unchanged.', ['LW-C04']),
          r('frame', 'yes', NOT_GUARANTEED, ['LW-C04', 'RF-C12']),
          r('protocol', 'yes', 'Same protocol.', ['LW-C02']),
          r('decrypt', 'yes', mt ? 'A PKI DM uses keys derived from A’s and D’s identities, not the channel key, provided their public keys were already exchanged; without D’s public key A’s send fails instead of downgrading.' : 'A MeshCore DM uses a secret derived from A’s and D’s identities, not a channel key.', mt ? ['MT-C18', 'MT-C19'] : ['MC-019']),
          r('app', 'yes', 'D shows the DM.', mt ? ['MT-C18'] : ['MC-019']),
          r('ack', 'yes', 'The ACK returns as in the baseline.', mt ? ['MT-C14'] : ['MC-030']),
        ],
        'A sees the normal ACK. The channel mismatch is invisible to DMs.',
        mt ? 'The channel key only protects channel traffic; this DM never used it.' : 'Not all MeshCore traffic uses channel keys: DMs use peer keys.',
      );
    }
    return done(
      [
        r('signal', 'yes', 'RF settings are unchanged.', ['LW-C04']),
        r('frame', 'yes', NOT_GUARANTEED, ['LW-C04', 'RF-C12']),
        r('protocol', 'yes', mt ? 'The 16-byte header is in the clear, so D parses it; the one-byte channel hash no longer matches its key.' : 'The header and channel hash are in the clear; D parses the packet.', mt ? ['RT-X02', 'MT-C15'] : ['RT-X04', 'RT-X07']),
        r('decrypt', 'no', mt ? 'Same channel name, wrong PSK: D cannot decrypt. With rebroadcast ALL it may still relay what it cannot read.' : 'Only holders of the channel key can read or write channel posts.', mt ? ['MT-C15', 'MT-C17', 'MT-C07'] : ['MC-020']),
        r('app', 'no', 'Nothing readable reaches D’s app.', mt ? ['MT-C15'] : ['MC-020']),
        NA('ack', 'Channel messages have no end-to-end ACK.'),
      ],
      'A sees nothing unusual: channel posts have no delivery receipt.',
      'Heard and parsed is not readable. A matching channel name does not mean a matching key.',
    );
  }

  // ---- routing layer: run the model ----
  if (mcChannel && (change === 'stale-path' || change === 'no-e2e')) {
    return done(
      [
        r('signal', 'yes', 'A group post floods; there is no stored path to go stale and no end-to-end ACK to lose.', ['MC-008']),
        r('frame', 'yes', NOT_GUARANTEED, ['LW-C04', 'RF-C12']),
        r('protocol', 'yes', 'Same protocol.', ['LW-C02']),
        r('decrypt', 'yes', 'D holds the channel key.', ['MC-020']),
        r('app', 'unknown', 'This lab’s routing model does not simulate MeshCore group floods, so it does not predict this case.', ['MC-020']),
        NA('ack', 'Group posts have no end-to-end ACK.'),
      ],
      'A has no delivery signal for a channel message.',
      'This change is about stored paths and ACKs, which group posts do not use.',
    );
  }
  const x = run(routingScenario(protocol, traffic, change));
  const heard = x.heardAtD;
  const stages: StageResult[] = heard
    ? [
        r('signal', 'yes', 'D hears at least one copy in the simulated graph.', ['RT-X08']),
        r('frame', 'yes', NOT_GUARANTEED, ['LW-C04', 'RF-C12']),
        r('protocol', 'yes', 'Same protocol on both ends.', ['LW-C02']),
        r('decrypt', x.noContactAtD ? 'no' : 'yes', x.noContactAtD ? 'D has no contact for A.' : 'Keys match in this scenario.', mt ? ['MT-C18'] : ['MC-019']),
        r('app', x.deliveredAtD ? 'yes' : 'no', x.deliveredAtD ? 'The simulation delivers it to D’s app.' : 'The simulation never delivers it to D’s app.', mt ? ['MT-C03'] : ['MC-030']),
        dm
          ? r('ack', x.acked ? 'yes' : 'no', x.acked ? 'A matches D’s ACK: protocol receipt, not a human reading it.' : 'No ACK from D reaches A.', mt ? ['MT-C14'] : ['MC-030'])
          : NA('ack', 'Channel messages have no end-to-end ACK.'),
      ]
    : [
        r('signal', 'no', 'No copy reaches D in the simulated graph.', ['RT-X08']),
        NA('frame', 'Nothing arrived.'),
        NA('protocol', 'Nothing arrived.'),
        NA('decrypt', 'Nothing arrived.'),
        r('app', 'no', 'Nothing reaches D’s app.', mt ? ['MT-C03'] : ['MC-030']),
        dm ? r('ack', 'no', 'Nothing comes back to A.', mt ? ['MT-C11'] : ['MC-030']) : NA('ack', 'Channel messages have no end-to-end ACK.'),
      ];
  let senderSees: string;
  if (!dm) senderSees = 'A sees nothing unusual: channel posts have no delivery receipt.';
  else if (x.acked) senderSees = mt && x.retries ? `A needed ${x.retries} retransmissions; the last flooded without a next-hop preference, then the ACK arrived.` : 'A matches an ACK from D.';
  else if (mt && x.implicit) senderSees = 'A overheard a relay (an implicit ACK) and stopped retrying, but no ACK from D arrived.';
  else if (mt) senderSees = 'After the initial send and two retransmissions A reports MAX_RETRANSMIT. It cannot tell where the message stopped.';
  else senderSees = 'A gets no confirmation and cannot tell which hop failed or whether D received it.';
  const explain: Record<string, string> = {
    baseline: 'Nothing changed.',
    'missing-repeater': 'A and D are out of earshot without B; there is no other route in this graph.',
    'stale-path': mt
      ? 'Meshtastic’s final retransmission drops the stale next hop and floods, so C can carry it.'
      : 'MeshCore’s direct packet only goes to B; C does not substitute. Recovery needs an explicit path reset and a new send.',
    'no-e2e': 'The forward direction works, the return direction does not. Only the trace knows D got it; A does not.',
  };
  return done(stages, senderSees, explain[change]);
}
