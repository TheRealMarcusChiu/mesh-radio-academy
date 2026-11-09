/**
 * Module outline. A module gets a `slug` only once its lesson is published;
 * the rest are goals, not finished lessons.
 */

export type Track = 'shared' | 'meshtastic' | 'meshcore';

export interface PlannedModule {
  number: string;
  title: string;
  track: Track;
  goal: string;
  /** Docs slug of the published lesson; absent while the module is still being written. */
  slug?: string;
}

export const TRACK_LABELS: Record<Track, string> = {
  shared: 'Both systems',
  meshtastic: 'Meshtastic track',
  meshcore: 'MeshCore track',
};

export const MODULES: readonly PlannedModule[] = [
  { number: '00', title: 'Start here', track: 'shared', slug: 'modules/00-start-here', goal: 'Send a simulated message, follow it through each layer, and pick a learning path with or without radios.' },
  { number: '01', title: 'RF and LoRa foundations', track: 'shared', slug: 'modules/01-rf-foundations', goal: 'Read dB, dBm, RSSI and SNR, and predict how radio settings change airtime and link margin.' },
  { number: '02', title: 'Hardware and first boot', track: 'shared', slug: 'modules/02-hardware-first-boot', goal: 'Identify the parts of a node and check band, revision and support before flashing anything.' },
  { number: '03', title: 'Your first Meshtastic link', track: 'meshtastic', slug: 'modules/03-first-meshtastic-link', goal: 'Configure two nodes, exchange a direct message, and diagnose one deliberate mismatch at a time.' },
  { number: '04', title: 'Meshtastic under the hood', track: 'meshtastic', slug: 'modules/04-meshtastic-under-the-hood', goal: 'Trace a broadcast and a direct message through a small mesh and explain each relay decision.' },
  { number: '05', title: 'Your first MeshCore link', track: 'meshcore', slug: 'modules/05-first-meshcore-link', goal: 'Set up two companions, add a contact, send a direct message, then add a repeater.' },
  { number: '06', title: 'MeshCore under the hood', track: 'meshcore', slug: 'modules/06-meshcore-under-the-hood', goal: 'Trace path discovery and a direct packet, then break a hop and diagnose what the sender sees.' },
  { number: '07', title: 'Reliability and capacity', track: 'shared', slug: 'modules/07-reliability-capacity', goal: 'Compare relay traffic and delivery across small topologies and measure delivery ratio honestly.' },
  { number: '08', title: 'Privacy, security and rules', track: 'shared', slug: 'modules/08-privacy-security-rules', goal: 'Build a threat model, see what stays observable, and look up the rules that apply to your device.' },
  { number: '09', title: 'Troubleshooting and field tests', track: 'shared', slug: 'modules/09-troubleshooting-field-tests', goal: 'Work a failed link from power to app delivery in order and keep a usable test log.' },
  { number: '10', title: 'Build a neighborhood mesh', track: 'shared', slug: 'modules/10-neighborhood-mesh', goal: 'Plan topology, roles, antennas, power and maintenance with the local community.' },
  { number: '11', title: 'Compare and choose', track: 'shared', slug: 'modules/11-compare-choose', goal: 'Pick an architecture for a scenario and justify it from evidence rather than preference.' },
  { number: '12', title: 'Capstone and operator reference', track: 'shared', slug: 'modules/12-capstone-operator-reference', goal: 'Design, break, fix and report on a simulated three-to-five-node network.' },
];
