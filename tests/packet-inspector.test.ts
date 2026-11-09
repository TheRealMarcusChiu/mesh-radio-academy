import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PACKETS, VIEWS, inspect, mcHeader, decodeMcPathLen, mtFlags, type PacketView } from '../src/lib/packet-inspector.ts';

const field = (v: PacketView, name: string) => {
  const f = v.fields.find((x) => x.name === name);
  assert.ok(f, `no field ${name} in ${v.title}`);
  return f;
};

test('MeshCore header byte follows 0bVVPPPPRR from the pinned packet format', () => {
  assert.equal(mcHeader('TXT_MSG', 'DIRECT'), 0x0a);
  assert.equal(mcHeader('TXT_MSG', 'FLOOD'), 0x09);
  assert.equal(mcHeader('ADVERT', 'FLOOD'), 0x11);
  assert.equal(mcHeader('ADVERT', 'DIRECT'), 0x12);
  assert.equal(mcHeader('GRP_TXT', 'FLOOD'), 0x15);
  assert.throws(() => mcHeader('NOPE' as never, 'FLOOD'), /Invalid/);
});

test('MeshCore path_len decodes width and count and rejects reserved or oversize encodings', () => {
  assert.deepEqual(decodeMcPathLen(0x45), { width: 2, count: 5, bytes: 10 });
  assert.deepEqual(decodeMcPathLen(0x8a), { width: 3, count: 10, bytes: 30 });
  assert.deepEqual(decodeMcPathLen(0x95), { width: 3, count: 21, bytes: 63 });
  assert.deepEqual(decodeMcPathLen(0x3f), { width: 1, count: 63, bytes: 63 });
  for (const bad of [0xc0, 0x96, 256, -1, 1.5, '0x45']) assert.throws(() => decodeMcPathLen(bad), /Invalid/, String(bad));
});

test('Meshtastic flags byte packs hop limit, want-ACK, via-MQTT and hop start with the pinned masks', () => {
  assert.equal(mtFlags({ hopLimit: 3, hopStart: 3 }), 0x63);
  assert.equal(mtFlags({ hopLimit: 3, hopStart: 3, wantAck: true }), 0x6b);
  assert.equal(mtFlags({ hopLimit: 2, hopStart: 3, viaMqtt: true }), 0x72);
  assert.throws(() => mtFlags({ hopLimit: 8, hopStart: 3 }), /Invalid/);
  assert.throws(() => mtFlags({ hopLimit: 3, hopStart: 2 }), /Invalid/);
});

test('every fixture has three distinct views, and every field cites evidence', () => {
  assert.ok(PACKETS.length >= 5);
  assert.ok(PACKETS.some((p) => p.protocol === 'meshtastic') && PACKETS.some((p) => p.protocol === 'meshcore'));
  for (const p of PACKETS) {
    const titles = VIEWS.map((v) => p.views[v].title);
    assert.equal(new Set(titles).size, 3, p.id);
    for (const v of VIEWS) {
      assert.ok(p.views[v].fields.length > 0, `${p.id} ${v}`);
      for (const f of p.views[v].fields) {
        assert.ok(f.claims.length > 0, `${p.id} ${v} ${f.name} cites nothing`);
        assert.ok(f.sees.observer && f.sees.relay && f.sees.recipient, `${p.id} ${f.name} lacks party notes`);
      }
    }
  }
});

test('byte offsets appear only on verified layouts, are contiguous, and placeholders never pose as hex', () => {
  for (const p of PACKETS) {
    for (const v of VIEWS) {
      const view = p.views[v];
      let next = 0;
      for (const [i, f] of view.fields.entries()) {
        if (f.schematic) assert.match(f.value, /^\[.+\]$/, `${p.id} ${f.name} placeholder must be bracketed`);
        else assert.match(f.value, /^(0x[0-9a-f]{2}( 0x[0-9a-f]{2})*|'.'|[^\[].*)$/, `${p.id} ${f.name}`);
        if (!view.offsets) {
          assert.equal(f.offset, undefined, `${p.id} ${v} has offsets but layout is not verified`);
          continue;
        }
        assert.equal(f.offset, next, `${p.id} ${v} ${f.name} offset`);
        if (f.size === 'rest') assert.equal(i, view.fields.length - 1, 'only the last field runs to the end');
        else next += f.size;
      }
    }
  }
});

test('MeshCore direct DM: B consumes its path byte, so destination and source hashes shift left by one', () => {
  const before = inspect('mc-dm-direct', 'air');
  const after = inspect('mc-dm-relayed', 'air');
  assert.equal(field(before, 'header').value, '0x0a');
  assert.equal(field(before, 'path_len').value, '0x01');
  assert.equal(field(before, 'path').offset, 2);
  assert.equal(field(before, 'destination hash').offset, 3);
  assert.equal(field(after, 'path_len').value, '0x00');
  assert.equal(after.fields.find((f) => f.name === 'path'), undefined);
  assert.equal(field(after, 'destination hash').offset, 2);
  assert.ok(field(before, 'ciphertext').opaque);
  assert.match(field(before, 'ciphertext').sees.relay, /cannot read/i);
});

test('MeshCore over-air and companion frames are different formats', () => {
  const air = inspect('mc-dm-direct', 'air');
  const companion = inspect('mc-dm-direct', 'transport');
  const names = (v: PacketView) => v.fields.map((f) => f.name);
  assert.equal(names(air).filter((n) => names(companion).includes(n)).length, 0);
  assert.equal(field(companion, 'command code').value, '0x02');
  assert.equal(field(companion, 'timestamp').endian, 'LE');
  assert.equal(field(companion, 'contact public-key prefix').size, 6);
});

test('Meshtastic over-air header is 16 bytes, but 32-bit byte order is not asserted', () => {
  const air = inspect('mt-dm-next-hop', 'air');
  assert.equal(field(air, 'flags').offset, 12);
  assert.equal(field(air, 'flags').value, '0x6b');
  assert.equal(field(air, 'encrypted payload').offset, 16);
  for (const n of ['to', 'from', 'packet ID']) assert.equal(field(air, n).endian, undefined, n);
  const phone = inspect('mt-dm-next-hop', 'transport');
  assert.equal(field(phone, 'length').endian, 'BE');
  assert.equal(field(phone, 'start bytes').value, '0x94 0xc3');
});

test('inspect validates its input', () => {
  assert.throws(() => inspect('nope', 'air'), /Invalid/);
  assert.throws(() => inspect('mc-dm-direct', 'raw'), /Invalid/);
  assert.throws(() => inspect(null, 'air'), /Invalid/);
});
