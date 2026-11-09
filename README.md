# Mesh Radio Academy

An independent, hardware-optional course on **Meshtastic** and **MeshCore**,
from a first simulated message to a field-tested neighborhood mesh. It is a
static site built with [Astro](https://astro.build) and
[Starlight](https://starlight.astro.build).

Intended address: <https://therealmarcuschiu.github.io/mesh-radio-academy/>
(the host is provisional until GitHub Pages is configured).

## Status: foundation only

What exists today:

- the site shell: navigation, search, dark field-guide theme, and mobile layout;
- a home page where you send a simulated message and follow it from phone →
  BLE → radio A → radio signal → radio B → BLE → phone B. This is a generic
  **teaching model**, not an implementation of either protocol's routing.
  It works with keyboard controls (Send, Step, Reset) and is fully readable
  without JavaScript;
- browser-local reading progress with a reset control. If storage is
  unavailable, progress falls back to memory for the current page;
- a validated metadata schema for future lessons;
- a planned outline of the 13 modules, clearly marked as not yet written.

What does **not** exist yet: lesson content, the research and claims ledger,
labs (RF calculator, routing playground, packet inspector, field planner),
glossary, and hardware tables. Lessons are published only after their claims
are checked against primary sources and reviewed.

There is no backend, account, analytics, telemetry, advertising or location
access. Nothing is sent from the visitor's browser.

## Requirements

- Node.js **>= 22.23.4** (an LTS line; CI uses Node 24). Astro 7.4.2+ set
  this floor to pick up the October 2026 Node.js security releases.
- npm (dependency versions are pinned exactly in `package.json` and
  `package-lock.json`).

## Commands

| Command | What it does |
|---|---|
| `npm ci` | Install the exact locked dependencies |
| `npm run dev` | Start the local dev server at `http://localhost:4321/mesh-radio-academy/` |
| `npm test` | Run unit tests (`node --test`) for the layer model, progress storage and lesson schema |
| `npm run check` | Astro and TypeScript diagnostics |
| `npm run build` | Build the static site to `dist/` under the `/mesh-radio-academy/` base path |
| `npm run check:links` | After a build, confirm every internal link and asset in `dist/` resolves under the base path |
| `npm run preview` | Serve the built `dist/` locally |

Astro's CLI collects anonymous usage data from the developer's machine. This
is separate from the site, which collects nothing. To opt out, set
`ASTRO_TELEMETRY_DISABLED=1` in your environment; CI already sets it.

## Project layout

```
astro.config.mjs        site URL, base path, Starlight config, sidebar
src/content.config.ts   docs collection + optional `lesson` metadata
src/content/docs/       Markdown/MDX pages
src/pages/index.astro   home page with the message trace
src/components/         LayerTrace, ProgressToggle, ProgressPanel, CurriculumOutline
src/lib/                pure logic: layer-trace, progress, lesson-schema, curriculum
src/styles/theme.css    design tokens (system fonts only)
tests/                  node:test unit tests
scripts/check-links.mjs built-output base-path link check
.github/workflows/      Pages build (PRs) and deploy (main)
```

## Writing a lesson

A numbered lesson adds a `lesson` block to its frontmatter. The build fails if
any field is missing or malformed:

```yaml
lesson:
  module: '01'                 # 00–12
  outcomes: ['Explain dB versus dBm']
  estimatedMinutes: 20
  prerequisites: ['start-here']
  difficulty: beginner         # beginner | intermediate | advanced
  sourceIds: ['RF-001']        # IDs from the research claim ledger
  baseline: 'firmware/client baseline the lesson was checked against'
  reviewed: 2026-11-08
```

Orientation pages (home, outline, about) carry no `lesson` block and make no
evidence claims.

## Deployment

`.github/workflows/deploy.yml` runs tests, checks, the build and the link
check on every pull request and push. Only pushes to `main` upload the Pages
artifact and deploy, using `pages: write` and `id-token: write` in the deploy
job only, the `github-pages` environment, and a per-branch concurrency
group. The repository's Pages source must be set to **GitHub Actions**.

## Maintenance

Version-sensitive facts (firmware baselines, client versions, regional
presets, regulations) will live in the research ledger with dated sources.
When refreshing them, update the ledger first, then each lesson's `sourceIds`,
`baseline` and `reviewed` fields.

## License

Original code and content: MIT (see `LICENSE`). Third-party notices:
`NOTICE.md`.
