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
| Modules 03–12, glossary, comparison page, lab index, appendices. | Content lane | After this slice's interfaces pass review. |
