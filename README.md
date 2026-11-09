# Mesh Radio Academy

An independent, hardware-optional course on **Meshtastic** and **MeshCore**,
from a first simulated message to a field-tested neighborhood mesh. It is a
static site built with [Astro](https://astro.build) and
[Starlight](https://starlight.astro.build).

Intended address: <https://therealmarcuschiu.github.io/mesh-radio-academy/>
(the host is provisional until GitHub Pages is configured).

## Status: first vertical slice

What exists today:

- **Modules 00–02** (start here, RF and LoRa foundations, hardware and first
  boot), each with outcomes, prerequisites, a worked example, an original
  diagram with a text version, a prediction task, an explained knowledge
  check, engineering detail, references and next steps;
- a **routing playground** (narrow first preset): a Meshtastic broadcast on a
  four-node diamond and a MeshCore known-path failure with explicit reset and
  recovery, driven by a pure deterministic model with cited events and a
  no-JavaScript text walkthrough;
- an **RF sandbox** (Lab A): LoRa airtime for SF7–12 at 125/250/500 kHz from
  the SX1276 datasheet formula, plus a link budget with an assumed obstruction,
  using the pure functions in `src/lib/rf.ts` (inputs are validated, never
  clamped) and static worked examples that need no JavaScript;
- a **field planner and capstone workbench** (Lab D): a 3–5 node plan with
  schematic, a battery-runtime model that reuses Lab A airtime, a field log
  with delivery ratios and sample sizes, CSV downloads and exports, and a
  validated capstone report (JSON/text/print), all stored only in the browser
  (`src/lib/field.ts`, `docs/field-contract.md`);
- the **evidence ledger** in `research/`: source registry, claim ledger and
  baselines, rendered on the site's Reference pages;
- the site shell: navigation, search, a dark field-guide theme (light theme
  optional), mobile layout, and browser-local reading progress with reset.

The simulated message trace on the home page and in Module 00 is a generic
**teaching model**, not either protocol's routing. No radio, board or app
combination has been physically tested for this course.

Not yet written on this branch: modules 03–12, packet inspector, glossary and
appendices. See `docs/backlog.md` for carried items.

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
| `npm test` | Run unit tests (`node --test`): routing model, RF airtime and link budget, field planner/battery/PDR/CSV/report/storage, ledger integrity, lab wiring, layer trace, progress storage, lesson schema |
| `npm run check` | Astro and TypeScript diagnostics |
| `npm run build` | Build the static site to `dist/` under the `/mesh-radio-academy/` base path |
| `npm run check:links` | After a build, confirm every internal link, asset and `#anchor` in `dist/` resolves under the base path |
| `npm run preview` | Serve the built `dist/` locally |

Astro's CLI collects anonymous usage data from the developer's machine. This
is separate from the site, which collects nothing. To opt out, set
`ASTRO_TELEMETRY_DISABLED=1` in your environment; CI already sets it.

## Project layout

```
astro.config.mjs        site URL, base path, Starlight config, sidebar, component overrides
research/               sources.md, claims.md, baselines.md (the evidence ledger)
docs/                   model-contract.md (frozen routing API), backlog.md
src/content.config.ts   docs collection + optional `lesson` metadata
src/content/docs/       modules/, labs/, reference/ and orientation pages (MDX)
src/pages/index.astro   home page with the message trace
src/components/         LayerTrace, RoutingPlayground, Cite, LessonMeta, diagrams/, progress and theme overrides
src/lib/                pure logic: routing, layer-trace, progress, lesson-schema, curriculum
src/fixtures/           versioned synthetic routing fixtures
src/styles/theme.css    design tokens (system fonts only)
tests/                  node:test unit tests
scripts/check-links.mjs built-output base-path and anchor check
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
  prerequisites: ['modules/00-start-here']   # docs slugs; unknown slugs fail the build
  difficulty: beginner         # beginner | intermediate | advanced
  sourceIds: ['RF-C09']        # IDs defined in research/claims.md or research/sources.md
  baseline: 'firmware/client baseline the lesson was checked against'
  reviewed: 2026-11-09
```

Cite evidence next to the sentence it supports with `<Cite ids="RF-C09 MT-C03" />`.
`npm test` fails if a lesson, fixture or component cites an ID that the
ledger doesn't define. Orientation pages (home, outline, about) carry no
`lesson` block and make no evidence claims.

## Deployment

`.github/workflows/deploy.yml` runs tests, checks, the build and the link
check on every pull request and push. Pull requests never deploy. Runs on
`main`, whether from a push or a manual "Run workflow" dispatch, upload the
Pages artifact and deploy. They use `pages: write` and `id-token: write` in
the deploy job only, the `github-pages` environment, and a per-branch
concurrency group. The repository's Pages source must be set to
**GitHub Actions**.

## Maintenance

Version-sensitive facts (firmware baselines, client versions, board targets,
regional presets, regulations) live in `research/` with dated sources:

1. Update `research/baselines.md` and `research/sources.md` first. Pin full
   commits for code, and record the check date for documentation.
2. Update affected rows in `research/claims.md`, and log any
   documentation-versus-code difference on the corrections page
   (`src/content/docs/reference/corrections.mdx`).
3. Update each affected lesson's `sourceIds`, `baseline` and `reviewed` fields.
4. If routing behavior changes, update `docs/model-contract.md`, the
   fixtures and `tests/routing.test.ts` together.

## License

Original code and content: MIT (see `LICENSE`). Third-party notices:
`NOTICE.md`.
