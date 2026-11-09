// Checks built HTML in dist/: every internal href/src must stay under the
// project base path and resolve to a file that exists in the build.
// shortcut: regex attribute scan, not a full HTML parser or crawler; upgrade when lesson content lands.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, dirname, posix } from 'node:path';

const BASE = '/mesh-radio-academy/';
const DIST = 'dist';
const pages = readdirSync(DIST, { recursive: true }).filter((f) => f.endsWith('.html'));
const problems = [];
let checked = 0;

for (const page of pages) {
  const html = readFileSync(join(DIST, page), 'utf8');
  const pageUrl = BASE + page.split('\\').join('/').replace(/index\.html$/, '');
  for (const [, url] of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|data:|#)/.test(url)) continue;
    const abs = posix.resolve(dirname(pageUrl + 'x'), url.split(/[?#]/)[0]);
    checked++;
    if (!abs.startsWith(BASE) && abs + '/' !== BASE) {
      problems.push(`${page}: ${url} escapes base ${BASE}`);
      continue;
    }
    let file = join(DIST, abs.slice(BASE.length));
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) problems.push(`${page}: ${url} → missing ${relative('.', file)}`);
  }
}

if (!pages.length) problems.push('no HTML found in dist/; run npm run build first');
console.log(`Checked ${checked} internal links in ${pages.length} pages.`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('All internal links resolve under ' + BASE);
