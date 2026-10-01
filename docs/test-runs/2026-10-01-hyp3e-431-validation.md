# hyp3e 4.3.1 Validation and Saving-Throw Repair

Date: 2026-10-01

Verdict: Focused checks pass; full-package compatibility acceptance is incomplete.

## Artifact and Environment

- Initial module: Hyp3e Utilities 1.0.0 at
  `a36f8d3fdeba922fb81f2af91c577bb0b377ae04`.
- Repair candidate: that source plus roll-mode label normalization in
  `module/chat/chat-cards.mjs` and regression fixtures/tests. It was tested
  before the subsequent documentation refresh; no new full-runtime pass is
  claimed for the refreshed package.
- System: read-only hyp3e 4.3.1 at
  `498364a5b0199359508293e343ac22fa4df3f14a`.
- Foundry: 13.351 and 14.368; SocketLib v1.1.4.
- Runtime packages were copied from `scripts/release-files.txt`, with exact
  file sets and SHA-256 hashes checked, into fresh disposable worlds.

## Confirmed Defect and Repair

Foundry 13 provides object-valued `CONFIG.Dice.rollModes` entries. The helper
passed those objects to Handlebars localization, causing `key.split is not a
function` when opening the shared member/follower saving-throw dialog.

`getRollModeChoices` now extracts `.label` from object definitions and preserves
string definitions for both supported configuration paths. A regression test
failed before the repair. Afterward, `npm run check` passed 250 tests plus syntax
and manifest checks; `git diff --check` passed.

Character and NPC save dialogs rendered all five save categories and the native
mode choices on each core (four on v13, five on v14). Each submitted Sorcery
with a +2 modifier, created a GM-only roll message, and closed successfully.
Early runner attempts used an incorrect constructor argument and an incorrect
v14 mode count; corrected runs passed. Those runner failures are retained in
the evidence and are not counted as product failures or passing acceptance.

## Other Focused Runtime Passes

On the initial candidate, both cores passed focused GM/player checks for:

- six localized Party Sheet tabs;
- character XP adjustments and NPC allocations without NPC-sheet updates;
- five-denomination coin distribution and GP wage settlement;
- duplicate-request handling and public transaction reports;
- player item transfers to the treasury and back, preserving quantity,
  maximum, and bundle values; and
- restoration of fixture party state, coins, and transferred items.

These checks do not replace the full diagnostic matrix for the repaired copy.

## Remaining Acceptance Work — QA-002

- `initialRevisionText` expects a removed header counter;
  `overviewShowsCharacter` expects HP spacing from an older layout.
- The player companion stops in PAR-009 while accessing a missing wage input.
  Its original Actor fixture is nonexistent. Substituting a real Actor and
  waiting for rendering did not complete the gate; the remaining cause is
  unresolved.
- The expanded v13 run stopped in HUD-006 while scene resources were loading.
  That gate is inconclusive.
- A companion reporting `complete` or an empty error array is insufficient:
  individual false assertions must also be resolved.
- Full player draft/notes/marching behavior, themes, accessibility, lifecycle,
  and public installation/update are not newly certified by these focused runs.

Repair the diagnostic companion and repeat the complete required matrix using
one release-shaped candidate. Do not count failed or skipped gates as passes.
The [implementation plan](../../IMPLEMENTATION-PLAN.md#16-current-follow-up-work)
tracks this work.

## Retained Evidence

Raw evidence remains outside the repository under the shared workspace:

- `RuntimeTests/hyp3e-utilities/4.3.1-2026-10-01/`: `VALIDATION-REPORT.txt`,
  `candidate-hashes.json`, `audit-summary.jsonl`, and individual runtime outputs.
  Focused passes are in `v13-2026-10-01T11-43-47-303Z` and
  `v14-2026-10-01T11-42-55-517Z`.
- `RuntimeTests/hyp3e-utilities/4.3.1-roll-mode-repair-2026-10-01/`:
  `REPAIR-REPORT.txt` and successful `evidence/result.json` files beneath
  `v13-2026-10-01T11-54-56-833Z` and `v14-2026-10-01T11-55-16-760Z`.

Owned browsers and servers were stopped and temporary licensed configuration
was removed. Environmental headless-rendering warnings and blocked external
resource requests remain recorded. No live world, reference source, manifest
compatibility declaration, or publication state was changed by the repair.
