import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHANGES, STAGES, diagnose, type Diagnosis } from '../src/lib/mismatch.ts';

const at = (d: Diagnosis, stage: string) => d.stages.find((s) => s.stage === stage)!.outcome;
const outcomes = (d: Diagnosis) => d.stages.map((s) => s.outcome).join(',');

test('every stage is reported separately, with evidence, for every change and protocol', () => {
  assert.deepEqual(STAGES, ['signal', 'frame', 'protocol', 'decrypt', 'app', 'ack']);
  for (const c of CHANGES) {
    assert.ok(c.setup && c.change && c.expected, c.id);
    for (const protocol of ['meshtastic', 'meshcore'] as const) {
      for (const traffic of ['dm', 'channel'] as const) {
        const d = diagnose({ protocol, traffic, change: c.id });
        assert.deepEqual(d.stages.map((s) => s.stage), [...STAGES]);
        for (const s of d.stages) assert.ok(s.claims.length && s.why.length > 10, `${c.id} ${protocol} ${traffic} ${s.stage}`);
        assert.ok(d.senderSees.length > 10 && d.explain.length > 10);
      }
    }
  }
});

test('baseline DM is delivered and confirmed, but matching settings are never called a guarantee', () => {
  for (const protocol of ['meshtastic', 'meshcore'] as const) {
    const d = diagnose({ protocol, traffic: 'dm', change: 'baseline' });
    assert.equal(outcomes(d), 'yes,yes,yes,yes,yes,yes');
    assert.match(d.stages[1].why, /not a guarantee|not guaranteed/i);
  }
  assert.equal(at(diagnose({ protocol: 'meshtastic', traffic: 'channel', change: 'baseline' }), 'ack'), 'n/a');
});

test('mismatch cases fail at different stages, not one generic failure', () => {
  const sigs = new Set(CHANGES.filter((c) => c.id !== 'baseline').map((c) => outcomes(diagnose({ protocol: 'meshcore', traffic: 'dm', change: c.id }))));
  assert.ok(sigs.size >= 4, [...sigs].join(' | '));
});

test('a different native protocol may share RF settings but cannot be interpreted', () => {
  const d = diagnose({ protocol: 'meshtastic', traffic: 'dm', change: 'other-protocol' });
  assert.equal(at(d, 'frame'), 'unknown');
  assert.equal(at(d, 'protocol'), 'no');
  assert.ok(d.stages[1].claims.includes('LW-C04'));
});

test('Meshtastic primary-name change may retune; a MeshCore frequency change does not reach the frame stage', () => {
  assert.equal(at(diagnose({ protocol: 'meshtastic', traffic: 'channel', change: 'rf-frequency' }), 'frame'), 'unknown');
  assert.equal(at(diagnose({ protocol: 'meshcore', traffic: 'dm', change: 'rf-frequency' }), 'frame'), 'no');
  assert.equal(at(diagnose({ protocol: 'meshcore', traffic: 'dm', change: 'rf-preset' }), 'frame'), 'no');
});

test('a channel-key mismatch blocks channel text but not a MeshCore DM, which uses peer keys', () => {
  const mtChan = diagnose({ protocol: 'meshtastic', traffic: 'channel', change: 'channel-key' });
  assert.equal(outcomes(mtChan), 'yes,yes,yes,no,no,n/a');
  const mcChan = diagnose({ protocol: 'meshcore', traffic: 'channel', change: 'channel-key' });
  assert.equal(at(mcChan, 'decrypt'), 'no');
  const mcDm = diagnose({ protocol: 'meshcore', traffic: 'dm', change: 'channel-key' });
  assert.equal(at(mcDm, 'decrypt'), 'yes');
  assert.equal(at(mcDm, 'app'), 'yes');
});

test('a stale path fails silently in MeshCore but recovers by fallback in a Meshtastic DM', () => {
  const mc = diagnose({ protocol: 'meshcore', traffic: 'dm', change: 'stale-path' });
  assert.equal(at(mc, 'app'), 'no');
  assert.equal(at(mc, 'ack'), 'no');
  assert.match(mc.senderSees, /no confirmation/i);
  const mt = diagnose({ protocol: 'meshtastic', traffic: 'dm', change: 'stale-path' });
  assert.equal(at(mt, 'app'), 'yes');
  assert.equal(at(mt, 'ack'), 'yes');
  assert.match(mt.senderSees, /2 retransmissions/);
});

test('heard without end-to-end confirmation: the recipient shows it while the sender has no ACK', () => {
  for (const protocol of ['meshtastic', 'meshcore'] as const) {
    const d = diagnose({ protocol, traffic: 'dm', change: 'no-e2e' });
    assert.equal(at(d, 'app'), 'yes');
    assert.equal(at(d, 'ack'), 'no');
    assert.doesNotMatch(d.senderSees, /delivered/i);
  }
  assert.match(diagnose({ protocol: 'meshtastic', traffic: 'dm', change: 'no-e2e' }).senderSees, /implicit/i);
});

test('missing repeater: D never hears anything, so later stages do not apply', () => {
  const d = diagnose({ protocol: 'meshcore', traffic: 'dm', change: 'missing-repeater' });
  assert.equal(outcomes(d), 'no,n/a,n/a,n/a,no,no');
});

test('diagnose validates its input', () => {
  for (const bad of [null, {}, { protocol: 'lorawan', traffic: 'dm', change: 'baseline' }, { protocol: 'meshcore', traffic: 'voice', change: 'baseline' }, { protocol: 'meshcore', traffic: 'dm', change: 'two-things' }]) {
    assert.throws(() => diagnose(bad), /Invalid bench input/, JSON.stringify(bad));
  }
});
