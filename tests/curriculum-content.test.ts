// Contracts for lessons 03–12, the curriculum reference pages and the
// curriculum claim/source fragment. The fragment is checked together with the
// base ledger (union) without changing the base ledger or its tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');
const ANCHOR = /<a id="([a-z0-9-]+)"><\/a>([A-Z0-9-]+)/g;
const ID = /\b(?:MT|MC|RF|HW|REG|NTX|LW|CUR)-[A-Z0-9]+\b/g;

const BASE = ['research/claims.md', 'research/sources.md'];
const FRAGMENT = ['research/claims-curriculum.md', 'research/sources-curriculum.md'];

const LESSONS = [
  ['03', '03-first-meshtastic-link'],
  ['04', '04-meshtastic-under-the-hood'],
  ['05', '05-first-meshcore-link'],
  ['06', '06-meshcore-under-the-hood'],
  ['07', '07-reliability-capacity'],
  ['08', '08-privacy-security-rules'],
  ['09', '09-troubleshooting-field-tests'],
  ['10', '10-neighborhood-mesh'],
  ['11', '11-compare-choose'],
  ['12', '12-capstone-operator-reference'],
] as const;
const lessonPath = (slug: string) => `src/content/docs/modules/${slug}.mdx`;

const REFERENCE_PAGES = [
  'src/content/docs/glossary.mdx',
  'src/content/docs/comparison.mdx',
  'src/content/docs/appendix/operator-tools.mdx',
  'src/content/docs/appendix/local-mqtt.mdx',
  'src/content/docs/reference/field-checklist.mdx',
];

function defined(files: string[]) {
  const ids = new Map<string, string>();
  for (const f of files) {
    for (const [, anchor, id] of read(f).matchAll(ANCHOR)) {
      assert.equal(anchor, id.toLowerCase(), `${f}: anchor ${anchor} does not match ${id}`);
      assert.ok(!ids.has(id), `${id} is defined twice (${ids.get(id)} and ${f})`);
      ids.set(id, f);
    }
  }
  return ids;
}

const union = () => defined([...BASE, ...FRAGMENT]);
const frontmatter = (text: string) => text.split('---')[1];

test('fragment defines CUR IDs once, only CUR IDs, with matching anchors, disjoint from the base ledger', () => {
  const base = defined(BASE);
  const frag = defined(FRAGMENT);
  for (const id of frag.keys()) {
    assert.match(id, /^CUR-[CS]\d{2}$/, `${id} is not a CUR-Cnn/CUR-Snn ID`);
    assert.ok(!base.has(id), `${id} collides with the base ledger`);
  }
  assert.ok([...frag.keys()].filter((id) => id.startsWith('CUR-C')).length >= 20);
  assert.ok([...frag.keys()].filter((id) => id.startsWith('CUR-S')).length >= 10);
});

test('every fragment claim row has scope, evidence that resolves, a check date and a status', () => {
  const ids = union();
  const rows = read('research/claims-curriculum.md')
    .split('\n')
    .filter((l) => l.startsWith('| <a id="cur-c'));
  assert.ok(rows.length >= 20);
  for (const row of rows) {
    const cells = row.split('|').slice(1, -1).map((c) => c.trim());
    assert.equal(cells.length, 6, `wrong column count: ${row.slice(0, 60)}`);
    const [, statement, scope, evidence, checked, status] = cells;
    assert.ok(statement.length > 20 && scope && status, row.slice(0, 60));
    assert.match(checked, /^\d{4}-\d{2}-\d{2}$/);
    const cited = [...evidence.matchAll(ID)].map((m) => m[0]);
    assert.ok(cited.length > 0, `no evidence ID in ${row.slice(0, 60)}`);
    for (const id of cited) assert.ok(ids.has(id), `${id} in evidence is undefined`);
  }
});

test('fragment code links point at immutable commits, not moving branches', () => {
  for (const f of FRAGMENT) {
    const moving = [...read(f).matchAll(/https:\/\/(?:github\.com|raw\.githubusercontent\.com)\/[^\s)|]+\/(?:blob|tree)?\/?(main|master|develop)\b[^\s)|]*/g)];
    assert.deepEqual(moving.map((m) => m[0]), [], f);
  }
});

test('lessons 03–12 exist with metadata matching their file names and resolvable source IDs', () => {
  const ids = union();
  for (const [mod, slug] of LESSONS) {
    const file = lessonPath(slug);
    assert.ok(existsSync(file), `${file} missing`);
    const fm = frontmatter(read(file));
    assert.match(fm, new RegExp(`title: 'Module ${mod}: `), file);
    assert.match(fm, new RegExp(`module: '${mod}'`), file);
    assert.match(fm, /reviewed: \d{4}-\d{2}-\d{2}/, file);
    assert.match(fm, /estimatedMinutes: \d+/, file);
    assert.match(fm, /difficulty: (beginner|intermediate|advanced)/, file);
    assert.match(fm, /baseline: '.+'/, file);
    assert.ok((fm.match(/^ {4}- /gm) ?? []).length >= 3, `${file}: fewer than 3 outcomes`);
    const sourceIds = fm.match(/sourceIds: \[([^\]]+)\]/)?.[1].split(',').map((s) => s.trim()) ?? [];
    assert.ok(sourceIds.length >= 5, `${file}: too few sourceIds`);
    for (const id of sourceIds) assert.ok(ids.has(id), `${file}: sourceId ${id} undefined`);
    for (const prereq of fm.match(/prerequisites: \[([^\]]*)\]/)?.[1].split(',').map((s) => s.trim().replace(/'/g, '')) ?? []) {
      assert.ok(existsSync(`src/content/docs/${prereq}.mdx`), `${file}: prerequisite ${prereq} missing`);
    }
  }
});

test('each lesson 03–12 carries the full teaching contract', () => {
  for (const [i, [, slug]] of LESSONS.entries()) {
    const file = lessonPath(slug);
    const body = read(file).split('---').slice(2).join('---');
    const has = (re: RegExp, what: string) => assert.match(body, re, `${file}: ${what}`);
    has(/^## Goals/m, 'goals and prerequisites section');
    has(/<FlowDiagram[\s\S]+?>\s*\n\n[\s\S]+?<\/FlowDiagram>/, 'original diagram with a visible text equivalent');
    has(/Worked example|Worked solution|worked synthetic|Worked synthetic|^\| Step |^## 1\./m, 'worked example');
    has(/^## Your turn[\s\S]+?<details>/m, 'prediction or hands-on task with a revealed answer');
    has(/simulat|(?:without|no)\s+hardware/i, 'hardware-optional simulated equivalent');
    has(/^## References[\s\S]+?<Cite ids=/m, 'references with evidence links');
    has(/<summary>Deeper dive/, 'optional deeper dive');
    const check = body.split(/^## Knowledge check/m)[1]?.split(/^## References/m)[0] ?? '';
    assert.ok((check.match(/<details>/g) ?? []).length >= 4, `${file}: knowledge check needs ≥ 3 explained questions + deeper dive`);
    assert.ok((body.match(/<Cite ids=/g) ?? []).length >= 10, `${file}: references are not near claims`);
    const next = body.split(/^## Next/m)[1] ?? '';
    const prev = i === 0 ? '02-hardware-first-boot' : LESSONS[i - 1][1];
    assert.match(next, new RegExp(`\\]\\(\\.\\./${prev}/\\)`), `${file}: previous link`);
    if (i < LESSONS.length - 1) assert.match(next, new RegExp(`\\]\\(\\.\\./${LESSONS[i + 1][1]}/\\)`), `${file}: next link`);
    assert.match(body, new RegExp(`<ProgressToggle page="modules/${slug}" />`), `${file}: progress toggle`);
  }
});

test('every ID cited in curriculum pages exists in the base ledger or the fragment', () => {
  const ids = union();
  const missing: string[] = [];
  for (const f of [...LESSONS.map(([, s]) => lessonPath(s)), ...REFERENCE_PAGES, ...FRAGMENT]) {
    for (const [id] of read(f).matchAll(ID)) if (!ids.has(id)) missing.push(`${f}: ${id}`);
  }
  assert.deepEqual(missing, []);
});

test('lesson links use relative, base-aware paths and the frozen lab URLs', () => {
  const labs = ['rf-sandbox', 'routing-playground', 'packet-inspector', 'field-planner'];
  const capstone = read(lessonPath('12-capstone-operator-reference'));
  for (const lab of labs) assert.match(capstone, new RegExp(`\\(\\.\\./\\.\\./labs/${lab}/\\)`), `capstone links ${lab}`);
  for (const f of [...LESSONS.map(([, s]) => lessonPath(s)), ...REFERENCE_PAGES]) {
    const absolute = [...read(f).matchAll(/\]\((\/[^)]*)\)/g)].map((m) => m[1]);
    assert.deepEqual(absolute, [], `${f}: root-absolute links ignore the project base path`);
  }
});

test('operator and MQTT samples are labeled synthetic and avoid destructive commands', () => {
  const ops = read('src/content/docs/appendix/operator-tools.mdx');
  const mqtt = read('src/content/docs/appendix/local-mqtt.mdx');
  assert.ok((ops.match(/SYNTHETIC/g) ?? []).length >= 2);
  assert.match(mqtt, /SYNTHETIC/);
  assert.match(ops, /meshtastic==2\.7\.11/);
  assert.match(ops, /--get lora\.hop_limit/);
  // Commands shown inside code blocks must be read-only.
  const blocks = [...ops.matchAll(/```(?:sh|text)\n([\s\S]*?)```/g)].map((m) => m[1]).join('\n');
  for (const bad of [/--set\b/, /--sendtext/, /^erase$/m, /^password /m, /^reboot$/m, /factory/i]) {
    assert.doesNotMatch(blocks, bad);
  }
});

// Regressions for the SPEC review of 6dd5a1a (CUR-SPEC01–05).
const claimRow = (file: string, id: string) =>
  read(file).split('\n').find((l) => l.includes(`<a id="${id.toLowerCase()}"></a>`)) ?? '';

test('CUR-SPEC01: map-report precision is never taught through the per-channel precision claim', () => {
  for (const f of [
    lessonPath('04-meshtastic-under-the-hood'),
    lessonPath('08-privacy-security-rules'),
    'src/content/docs/glossary.mdx',
  ]) {
    // The sentence a CUR-C14 citation supports must be about channel positions, not map reports.
    for (const [, sentence] of read(f).matchAll(/([^.]*\.)\s*<Cite ids="[^"]*CUR-C14[^"]*" \/>/g)) {
      assert.doesNotMatch(sentence, /map.report/i, `${f}: map report tied to channel precision: ${sentence.trim()}`);
    }
  }
  const answer = read(lessonPath('08-privacy-security-rules')).split('## Your turn')[1].split('## Knowledge check')[0];
  assert.match(answer, /CUR-C27/, 'threat-model answer must cite the map-report precision claim');
  assert.match(claimRow('research/claims-curriculum.md', 'CUR-C27'), /12.{1,3}15/);
});

test('CUR-SPEC02: capstone learning airtime equals its counted frames × the CUR-C21 frame time', () => {
  const capstone = read(lessonPath('12-capstone-operator-reference'));
  const rows = capstone.split('### 2. Predictions')[1].split('### 3.')[0].split('\n').filter((l) => /^\| [A-Z]/.test(l) && !l.startsWith('| Phase'));
  const frames = rows.map((r) => Number(r.split('|')[2].trim().split(' ')[0]));
  assert.deepEqual(frames, [3, 3, 2, 4]);
  const frameMs = 82.176; // CUR-C21: 40 B at the teaching profile, reproduced below
  const learn = (frames[0] + frames[1] + frames[2]) * frameMs;
  assert.equal(capstone.match(/([\d.]+) ms of airtime to learn the paths/)?.[1], learn.toFixed(3));
  assert.equal(capstone.match(/then ([\d.]+) ms per confirmed message/)?.[1], (frames[3] * frameMs).toFixed(3));
});

test('CUR-SPEC03: zero-hop advert default is the documented factory-fresh lifecycle, not a contradiction', () => {
  for (const row of [claimRow('research/claims-curriculum.md', 'CUR-C17'), claimRow('research/sources-curriculum.md', 'CUR-S10')]) {
    assert.doesNotMatch(row, /inconsistent|unresolved/i, row.slice(0, 60));
    assert.match(row, /saving any setting/i, row.slice(0, 60));
  }
});

test('CUR-SPEC04: first-link identity check compares full public keys, never a short prefix', () => {
  const l05 = read(lessonPath('05-first-meshcore-link'));
  assert.match(l05, /full-key comparison: match/);
  assert.doesNotMatch(l05, /first \d+ hex/i);
});

test('CUR-SPEC05: glossary defines spreading factor through symbol time, not a chirp count', () => {
  const sf = read('src/content/docs/glossary.mdx').split('\n\n').find((p) => p.startsWith('**Spreading factor')) ?? '';
  assert.match(sf, /2\^SF/);
  assert.doesNotMatch(sf, /chirps encode/);
  assert.match(sf, /RF-C01/);
});

test('verified calculations in the fragment reproduce', () => {
  // SX1276 Rev. 4 §4.1.1.7 at the RF-F01 profile: SF7, 125 kHz, CR 4/5, 8-symbol preamble, explicit header, CRC on.
  const airtimeMs = (pl: number, sf = 7, bw = 125_000, cr = 1, pre = 8, ih = 0, crc = 1, de = 0) => {
    const n = 8 + Math.max(Math.ceil((8 * pl - 4 * sf + 28 + 16 * crc - 20 * ih) / (4 * (sf - 2 * de))) * (cr + 4), 0);
    return { n, ms: ((pre + 4.25 + n) * 2 ** sf * 1000) / bw };
  };
  assert.equal(airtimeMs(20).ms.toFixed(3), '56.576'); // anchors the formula to RF-C03
  assert.deepEqual([airtimeMs(40).n, airtimeMs(40).ms.toFixed(3)], [68, '82.176']);
  assert.equal(airtimeMs(25).ms.toFixed(3), '61.696');
  assert.equal(airtimeMs(60).ms.toFixed(3), '112.896');
  const claims = read('research/claims-curriculum.md');
  for (const v of ['82.176 ms', '61.696 ms', '112.896 ms', '17 of 20 is 85%', '15.901 mA', '90.56 h']) {
    assert.ok(claims.includes(v), `fragment lost ${v}`);
  }
  assert.equal((17 / 20) * 100, 85);
  const avg = 0.01 * 120 + 0.98 * 15 + 0.01 * 0.1;
  assert.equal(avg.toFixed(3), '15.901');
  assert.equal(((2000 * 0.8 * 0.9) / avg).toFixed(2), '90.56');
  // MeshCore header bytes from CUR-C15: route bits 0–1, payload type bits 2–5.
  const hdr = (route: number, type: number) => (type << 2) | route;
  assert.deepEqual([hdr(1, 2), hdr(2, 2), hdr(1, 4), hdr(2, 4)], [0x09, 0x0a, 0x11, 0x12]);
  // Path byte 0x45: width (b >> 6) + 1 = 2, count b & 0x3f = 5.
  assert.deepEqual([(0x45 >> 6) + 1, 0x45 & 0x3f], [2, 5]);
});
