// Checks built HTML in dist/: every internal href/src must stay under the
// project base path, resolve to a file that exists in the build, and any
// #fragment must match an id in the target page.
// shortcut: regex attribute scan, not a full HTML parser or crawler; misses CSS url() and runtime fetches.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, dirname, posix } from 'node:path';

const BASE = '/mesh-radio-academy/';
const DIST = 'dist';
const pages = readdirSync(DIST, { recursive: true }).filter((f) => f.endsWith('.html'));
const problems = [];
const idCache = new Map();
let checked = 0;
let anchors = 0;

const idsIn = (file) => {
  if (!idCache.has(file)) {
    idCache.set(file, new Set([...readFileSync(file, 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  }
  return idCache.get(file);
};

for (const page of pages) {
  const html = readFileSync(join(DIST, page), 'utf8');
  const pageUrl = BASE + page.split('\\').join('/').replace(/index\.html$/, '');
  for (const [, url] of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|data:)/.test(url)) continue;
    const [path, fragment] = url.split('#');
    let file = join(DIST, page);
    if (path) {
      const abs = posix.resolve(dirname(pageUrl + 'x'), path.split('?')[0]);
      checked++;
      if (!abs.startsWith(BASE) && abs + '/' !== BASE) {
        problems.push(`${page}: ${url} escapes base ${BASE}`);
        continue;
      }
      file = join(DIST, abs.slice(BASE.length));
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
      if (!existsSync(file)) {
        problems.push(`${page}: ${url} → missing ${relative('.', file)}`);
        continue;
      }
    }
    // Starlight's skip link targets "_top", the document top; other fragments must exist.
    if (fragment && fragment !== '_top' && file.endsWith('.html')) {
      anchors++;
      if (!idsIn(file).has(decodeURIComponent(fragment))) problems.push(`${page}: ${url} → no id "${fragment}"`);
    }
  }
}

if (!pages.length) problems.push('no HTML found in dist/; run npm run build first');
console.log(`Checked ${checked} internal links and ${anchors} anchors in ${pages.length} pages.`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('All internal links and anchors resolve under ' + BASE);
