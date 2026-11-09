# Carried backlog

These are known gaps and accepted limitations, each with an owner and the trigger that brings it into scope. None was silently waived. The full course requirements live in the project brief. This list only tracks items deferred from increments already delivered.

| Item | Owner | Trigger |
|---|---|---|
| **Q-01** Progress storage writes an envelope `version` but never checks it on read (`src/lib/progress.ts`). | Progress-storage maintainer | Before any new persisted schema, import format or migration: validate or migrate versions explicitly and test the policy. |
| **Q-02** If `getItem` throws on first read, progress status reports "saved" until a write fails. | Progress-storage maintainer | Next storage-error/status change, or a target browser that denies reads only. Propagate read availability and add a focused test. |
| Link checker is a regex scan: it checks `href`/`src` and in-page anchors, not CSS `url()` or runtime Pagefind fetches (`scripts/check-links.mjs`). | Link/test maintainer | Before publication: verify runtime search and assets under the real project subpath in a browser. |
| Starlight build warnings: missing `i18n` collection; `/404` route conflict with the 404 content entry. | Build maintainer | When locales, routes or the framework version change; investigate if the custom 404 stops rendering. |
| Routing: Meshtastic DM next-hop learning and final-retry flood fallback fixture (A–B preference failed). | Routing/labs lane | Next routing increment (MT-C10, MT-C11, MT-C12). |
| Routing: MeshCore first contact with unknown paths both ways, flooded learning, adverts. | Routing/labs lane | Next routing increment (MC-006, MC-007, MC-008). |
| Routing: asymmetric-link fixture and UI (delivery without ACK). | Routing/labs lane | Next routing increment. |
| Routing: topology presets (two nodes, line, diamond, mobile, sparse). | Routing/labs lane | Next routing increment. |
| Packet inspector and settings-mismatch bench. | Inspector lane | After the packet layouts are pinned (MC-017, MT-S04). |
| RF airtime and link-budget calculator. | RF lane | Must reproduce RF-F01–RF-F04 and reject unsupported inputs (RF-C01–RF-C07). |
| Field planner, battery estimate, CSV log, capstone export. | Field-workbench lane | Uses RF-C08; 17/20 = 85% PDR sample. |
| ~~Modules 03–12, glossary, comparison page, lab index, appendices.~~ Done: lessons and references reviewed (SPEC and QUALITY), merged into the ledger, wired into navigation (phase-1 integration prep). | Content lane | Closed. |
| Cross-lane labs missing from this checkout: `labs/rf-sandbox/`, `labs/packet-inspector/`, `labs/field-planner/`. `npm run check:links` fails only on links to them (19 at phase 1). The lab index labels them "integration pending"; no stubs. | Sole integrator | Merge the accepted lab commits; then the link check must be green and the lab index statuses updated. |
| Routing pending claims RT-X01..10 are not in this ledger; the routing lab's pending-cite exceptions remain on its branch. | Sole integrator | When merging the accepted routing commit: add RT rows with source trail, extend the ledger ID pattern, drop the exceptions. |
| Lab B airtime coupling: routing must use the accepted RF calculator with explicit synthetic PHY bytes and relay/control/retry accounting. | Routing + RF lanes, integrator | Before combined lab acceptance. Never invent protocol byte lengths. |
| `research/claims-curriculum.md` and `research/sources-curriculum.md` are pre-merge copies of the CUR rows (now canonical in `claims.md`/`sources.md`; a test keeps them identical). Deleting them was not permitted in the phase-1 session. | Sole integrator | At integration: delete both files, then remove the drift guard in `tests/curriculum-content.test.ts`. |
| Q-INTEGRATION-MOBILE: citation groups now wrap between IDs (`Cite.astro`); this checkout did not run a browser. | Coordinator / integrator | Before combined visual QUALITY: all 13 lessons + references at 1365/320/390 in both themes, table keyboard scroll, focus and print. Script: ops `reports/integration-prep-browser.py`. |
