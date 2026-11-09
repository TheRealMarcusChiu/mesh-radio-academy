/**
 * Generic teaching model of one message travelling between two people.
 * It shows layers (app, device link, mesh packet, radio) — it is NOT an
 * implementation of Meshtastic or MeshCore routing. Protocol-specific models
 * arrive only after the research ledger backs them.
 */

export type Layer = 'app' | 'link' | 'mesh' | 'rf';

export interface Stage {
  id: string;
  layer: Layer;
  layerLabel: string;
  where: string;
  title: string;
  explain: string;
  needsInternet: boolean;
}

export const LAYER_LABELS: Record<Layer, string> = {
  app: 'App',
  link: 'Phone–radio link',
  mesh: 'Mesh packet',
  rf: 'Radio signal',
};

const stage = (id: string, layer: Layer, where: string, title: string, explain: string): Stage => ({
  id,
  layer,
  layerLabel: LAYER_LABELS[layer],
  where,
  title,
  explain,
  needsInternet: false,
});

export const STAGES: readonly Stage[] = [
  stage('compose', 'app', 'Phone A', 'You write a message',
    'You type in the app on phone A. The phone does not transmit on the mesh itself; the app hands the text to the radio it is paired with.'),
  stage('ble-up', 'link', 'Phone A → Radio A', 'The phone passes it to radio A',
    'In this model the app uses a short-range Bluetooth Low Energy (BLE) link to reach radio A. Some devices also connect by USB or other links. This hop is local, not part of the mesh.'),
  stage('radio-a', 'mesh', 'Radio A', 'Radio A builds a mesh packet',
    'Radio A wraps the message with the information other mesh radios need, such as who sent it and where it should go. Meshtastic and MeshCore lay this out differently; later modules cover each.'),
  stage('rf', 'rf', 'Radio A → Radio B', 'The packet goes out as a radio signal',
    'Radio A transmits the packet using LoRa radio modulation. Radio B can hear it only if it is in range and listening with matching radio settings. No tower, internet or cellular network is used.'),
  stage('radio-b', 'mesh', 'Radio B', 'Radio B receives the packet',
    'Radio B checks whether the packet is for it and whether it can read it. In a larger mesh a radio may also pass packets on for others; this two-radio model leaves relaying out.'),
  stage('ble-down', 'link', 'Radio B → Phone B', 'Radio B passes it to phone B',
    'Radio B sends the message over its own local link to the paired phone B. If phone B is not connected, the message waits on the radio or is lost, depending on the system.'),
  stage('deliver', 'app', 'Phone B', 'The message appears',
    'The app on phone B shows the message. What a "delivered" mark actually proves is a separate question that a later lesson covers.'),
];

export const initialStep = 0;

/** Clamp an untrusted position to a whole number of completed stages. */
const clamp = (n: number) =>
  Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 0), STAGES.length) : 0;

export const step = (n: number) => Math.min(clamp(n) + 1, STAGES.length);
export const run = (_n: number) => STAGES.length;
export const reset = () => initialStep;
export const visibleStages = (n: number) => STAGES.slice(0, clamp(n));
