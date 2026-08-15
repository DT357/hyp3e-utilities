# Hyp3e Utilities Implementation Plan

Version: 1.0

Created: 2026-08-14

Status: Milestone 3 Marching Order, Supplies, and Notes in progress

Design source: [HYP3E-UTILITIES-DESIGN.md](./HYP3E-UTILITIES-DESIGN.md)

## 1. Purpose

This document is the tactical execution plan for Hyp3e Utilities. The design document remains the source of truth for product behavior, architecture, data models, and accepted design decisions. This plan converts that design into dependency-ordered work items with concrete outputs and completion checks.

Implementation should proceed one milestone at a time. A work item is complete only when its code, automated tests where applicable, and listed manual verification all pass.

### Status values

- `TODO`: Ready or waiting on a dependency.
- `IN PROGRESS`: Actively being implemented.
- `BLOCKED`: Cannot proceed until the named issue is resolved.
- `DONE`: Completion checks passed and evidence was recorded.

### Working rules

1. Write tests before non-trivial domain logic.
2. Keep Foundry document access behind adapters or services so calculations can be tested without Foundry running.
3. Treat every non-GM request as untrusted and revalidate authorization on the active GM client.
4. Use named mutation operations; never accept arbitrary replacement party state from a player client.
5. Update this plan when a work item changes status, scope, or dependency.
6. Record compatibility findings in `docs/compatibility-notes.md` before relying on them in production code.
7. Do not publish a release while any release-gate item for that milestone is unresolved.

## 2. Locked Product Decisions

The following decisions are approved and do not require further design work:

- Party storage uses one module-managed `treasure` Actor.
- Party sheet editing is allowed for GMs, users at or above a configurable role threshold, and users explicitly granted access.
- Authorized non-GM mutations are relayed to and executed by an active GM.
- Reaction checks produce one roll per selected NPC.
- Saving throws use a five-save selector.
- XP and coin distributions create a chat report and update eligible `character` Actors.
- Character XP applies the signed value at `system.details.xp.bonus` to that character's base share.
- An `npc` Actor can consume a share for allocation purposes, but no XP or coins are persisted to it.
- NPC allocations are still shown in the distribution preview and final chat report.
- Wages use GP only in the initial implementation.
- Non-empty containers are unsupported initially and must be rejected without partial transfer.

## 3. Milestone Roadmap

| Milestone | Target | Deliverable | Entry gate | Exit gate |
| --- | --- | --- | --- | --- |
| M0 | Pre-build | Verified integration assumptions and test foundation | Approved design | All blocking spikes recorded |
| M1 | 0.1.0 | Module foundation and NPC Action HUD | M0 complete | HUD acceptance matrix passes |
| M2 | 0.2.0 | Party state, permissions, overview, and followers | M1 stable | Multi-client party-core matrix passes |
| M3 | 0.3.0 | Marching order, supplies, and notes | M2 stable | Party workflow matrix passes |
| M4 | 0.4.0 | Managed treasury and item transfers | M3 stable | Transfer and recovery matrix passes |
| M5 | 0.5.0 | XP, coin, and wage distributions | M4 stable | Distribution and rollback matrix passes |
| M6 | 1.0.0 | Compatibility, security, migration, documentation | All features complete | Release candidate passes full validation |

Version targets describe intended feature boundaries. Patch releases may be used for defects without moving unfinished work into an earlier milestone.

## 4. Milestone 0 — Pre-build Validation

### PB-001 — Select and add a license

- Status: `DONE`
- Depends on: None.
- Outcome: Added the MIT `LICENSE`, third-party notices, and aligned package and manifest metadata.
- Completion checks:
  - The license permits the intended public distribution.
  - Repository and package metadata agree.
- Evidence: `docs/work-items/PB-001.md`.

### PB-002 — Establish the baseline repository commit

- Status: `DONE`
- Depends on: None.
- Outcome: Committed the scaffold, design, implementation plan, and license to `main`; pushed to `origin`.
- Completion checks:
  - `origin` is `https://github.com/DT357/hyp3e-utilities.git`.
  - Working tree was clean after the baseline commit.
  - Remote `main` contains the baseline.
- Evidence: `docs/work-items/PB-002.md`.

### PB-010 — Remove HYPERBOREA from the public project identity

- Status: `DONE`
- Depends on: None.
- Outcome: Renamed the package to Hyp3e Utilities with module ID `hyp3e-utilities` and aligned the public repository slug and release URLs.
- Completion checks:
  - All module identifiers, titles, distributed filenames, documentation, and release artifacts use Hyp3e Utilities or `hyp3e-utilities`.
  - The GitHub repository slug, local remote URL, and manifest URLs use `hyp3e-utilities`.
  - Third-party notices make no unsupported claim of affiliation, endorsement, or trademark permission.
- Evidence: `docs/work-items/PB-010.md`.

### PB-003 — Smoke-test the scaffold in Foundry

- Status: `DONE`
- Depends on: None.
- Outcome: Confirm Foundry 13 and, when available, Foundry 14 can discover, enable, initialize, and disable the module in a `hyp3e` world without errors.
- Evidence: `docs/work-items/PB-003.md` and `docs/compatibility-notes.md`.
- Result: Foundry 13.351 with `hyp3e` 4.0.3 and Foundry 14.365 with `hyp3e` 4.1.0 both passed discovery, enable, initialization, disable, and reload checks.

### PB-004 — Verify the five-save source fields

- Status: `DONE`
- Depends on: PB-003.
- Outcome: Determine whether each current save target is read from `system.saves.<kind>.curr`, `.value`, or another prepared field for both `character` and `npc` Actors.
- Test cases: death, device, transformation, avoidance, and sorcery; include an Actor whose save modifiers change the prepared target.
- Gate: Blocks HUD save implementation.
- Evidence: `docs/work-items/PB-004.md`.

### PB-005 — Verify token-to-Actor identity behavior

- Status: `DONE`
- Depends on: PB-003.
- Outcome: Record stable identifiers and update behavior for linked tokens, unlinked synthetic Actors, duplicate tokens, deleted tokens, and selection changes.
- Gate: Blocks HUD row identity and update subscriptions.
- Evidence: `docs/work-items/PB-005.md`.

### PB-006 — Verify managed treasury Actor behavior

- Status: `DONE`
- Depends on: PB-003.
- Outcome: Prove creation, flagging, ownership configuration, lookup, rename tolerance, deletion recovery, duplicate detection, and recreation for a `treasure` Actor.
- Gate: Blocks treasury persistence implementation.
- Evidence: `docs/work-items/PB-006.md`.

### PB-007 — Verify ApplicationV2 integration

- Status: `DONE`
- Depends on: PB-003.
- Outcome: Record the supported ApplicationV2 construction, parts/templates, listener lifecycle, render/update behavior, and singleton close behavior for Foundry 13 and 14.
- Gate: Blocks production UI shells.
- Evidence: `docs/work-items/PB-007.md`.
- Result: The same ApplicationV2 contract passed in Foundry 13.351 and 14.365.

### PB-008 — Prove SocketLib caller authentication

- Status: `DONE`
- Depends on: PB-003.
- Outcome: Demonstrate that the GM handler can identify the actual requesting user independently of caller-supplied payload fields.
- Security disposition: spoofed identity and absent-GM/reconnect behavior were exercised in the spike; unauthorized and duplicate operations remain PAR-002 checks, stale revision remains a PAR-004 check, and multiple-active-GM routing remains an FND-004 check.
- Gate: If this spike succeeds, enable authorized player edits. If it fails, party mutation remains GM-only until a trustworthy transport is implemented.
- Finding: SocketLib v1.1.4 exposes the server-derived requesting user as `this.socketdata.userId` in a GM handler, independently of payload fields. Production authorization, stale-revision handling, active-GM routing, and request idempotency remain required in FND-004, PAR-002, and PAR-004.
- Evidence: `docs/work-items/PB-008.md`.

### PB-009 — Add the automated test foundation

- Status: `DONE`
- Depends on: None.
- Files: `tests/`, `tests/fixtures/`, `tests/helpers/`, and `package.json`.
- Outcome: Uses the Node test runner for pure logic and mocked-adapter tests; `npm test` and `npm run check` fail on any test error, while `npm run check` also retains syntax and manifest validation.
- Completion checks:
  - A representative passing unit test runs locally.
  - A deliberate failure produces a non-zero exit status.
  - Foundry-dependent tests are clearly separated from pure unit tests.
- Evidence: `docs/work-items/PB-009.md`.

### M0 release gate

M0 is complete when PB-003 through PB-009 are `DONE`, findings are recorded, and no finding contradicts the approved architecture. PB-001, PB-002, and PB-010 must be complete before public publication, but PB-002 and PB-010 may remain open during local feature development.

Status: `DONE` — all pre-build work items passed and their evidence is recorded.

## 5. Milestone 1 — Foundation and NPC Action HUD

### Foundation work

| ID | Status | Depends on | Deliverable | Verification |
| --- | --- | --- | --- | --- |
| FND-001 | `DONE` | PB-009 | Module constants, setting keys, flag keys, hook names, and logging helper | Unit tests for stable keys; syntax check |
| FND-002 | `DONE` | PB-004, PB-005 | `hyp3e` adapter for HP, AC/DR, movement, saves, morale, XP, money, and item quantities | Fixture tests for character, NPC, treasure, and synthetic Actor inputs |
| FND-003 | `DONE` | FND-001 | World/client settings registration, settings menus, defaults, and validation | Setting registration tests and Foundry smoke test |
| FND-004 | `DONE` | PB-008 | SocketLib dependency declaration and transport bootstrap | Graceful missing/inactive dependency message; authenticated round trip; absent/changed active GM and reconnect behavior |
| FND-005 | `DONE` | PB-007 | Shared ApplicationV2 shell conventions, template paths, localization loading, and CSS namespace | Empty app renders and closes cleanly in supported Foundry versions |
| FND-006 | `DONE` | FND-001 | Unsupported-system/version guard and diagnostic logging | Non-`hyp3e` world does not activate feature hooks |

Planned production areas: `module/core/`, `module/adapters/`, `module/settings/`, `module/socket/`, `templates/`, `styles/`, and `lang/en.json`.

### HUD work

| ID | Status | Depends on | Deliverable | Verification |
| --- | --- | --- | --- | --- |
| HUD-001 | `DONE` | PB-009 | Pure Hyperborea reaction table and one-roll-per-NPC batch planner | Boundary tests from 0 through 12+ and multi-NPC roll count |
| HUD-002 | `DONE` | FND-002 | Save and morale roll planners using verified `hyp3e` targets | Tests for all five saves, missing data, modifiers, and morale success/failure |
| HUD-003 | `DONE` | HUD-001, HUD-002 | GM-whisper chat-card service for reaction, save, and morale batches | Sanitization and recipient tests; manual chat-card inspection |
| HUD-004 | `DONE` | FND-002, PB-005 | Controlled-NPC selection controller and stable HUD view model | Linked/unlinked, duplicate, mixed selection, deletion, and empty-selection tests |
| HUD-005 | `DONE` | FND-005, HUD-004 | HUD overlay with HP bars, AC/DR, movement, actor-sheet link, selectors, and action buttons | Render and interaction checks at common screen sizes |
| HUD-006 | `DONE` | HUD-005 | Per-client drag position, viewport clamping, and reset control | Reload, resize, zoom, and off-screen recovery checks |
| HUD-007 | `DONE` | HUD-005 | Debounced hook synchronization and cleanup | No duplicate hooks, renders, or listeners after enable/disable and world reload |
| HUD-008 | `DONE` | HUD-003, HUD-007 | HUD settings, localization, accessibility labels, disabled states, and error notices | Keyboard use, localization-key scan, and unavailable-action checks |

### M1 acceptance matrix

Test as a GM with zero, one, and multiple controlled NPC tokens, including linked and unlinked tokens. Verify live HP updates, Actor sheet opening, each of the five saves, morale, one reaction result per selected NPC, GM-only chat visibility, drag persistence, reset position, scene changes, token deletion, and module disable/re-enable.

M1 is complete when all FND and HUD items are `DONE`, `npm run check` passes, the Foundry console is clean, and the 0.1.0 package installs into a clean test data directory.

## 6. Milestone 2 — Party Core

| ID | Status | Depends on | Deliverable | Verification |
| --- | --- | --- | --- | --- |
| PAR-001 | `DONE` | PB-009 | Pure permission policy for GM, minimum role, explicit grants, and denial | Matrix tests for every role/grant combination |
| PAR-002 | `DONE` | PB-008, PAR-001 | Authenticated named mutation operations with schema validation | Spoofing, malformed payload, unauthorized, no-GM, and duplicate-request tests |
| PAR-003 | `DONE` | PB-006 | Versioned party-state defaults, normalization, migration, and revision model | Round-trip, missing field, unknown field, and old-version tests |
| PAR-004 | `DONE` | PAR-002, PAR-003 | GM-authoritative party store with serialized writes and stale-revision rejection | Concurrent-edit and rollback tests |
| PAR-005 | `DONE` | FND-005, PAR-004 | Singleton Party Sheet app and GM-facing open controls | Only one instance; reopen focuses/rerenders; close cleans listeners |
| PAR-006 | `DONE` | PAR-005 | Overview tab for member add/remove, summary data, and Actor links | Character-only membership rules and deleted-Actor handling |
| PAR-007 | `DONE` | PAR-005 | Followers tab for character/NPC followers, employment fields, shares, and wages | Validation of Actor type and GP-only wage inputs |
| PAR-008 | `DONE` | PAR-006, PAR-007, HUD-002, HUD-003 | Party/follower summary actions, token ping, saves, and morale reuse | No duplicate roll logic; permission and missing-token checks |
| PAR-009 | `DONE` | PAR-005 | External-update handling and explicit unsaved-form policy | Two-client edit matrix and stale form warning |
| PAR-010 | `DONE` | PAR-003 | Cleanup of deleted Actor references without destructive treasury behavior | Member/follower deletion and treasury deletion tests |

### M2 acceptance matrix

Use two browser clients and an active GM. Verify GM edits, role-threshold edits, explicit user grants, unauthorized denial, no-active-GM behavior, concurrent edits, reconnect, Actor deletion, singleton behavior, follower share/wage data, Actor links, and reused save/morale actions.

M2 is complete when all PAR items are `DONE` and the 0.2.0 package passes the full M1 and M2 matrices.

## 7. Milestone 3 — Marching Order, Supplies, and Notes

| ID | Status | Depends on | Deliverable | Verification |
| --- | --- | --- | --- | --- |
| MAR-001 | `DONE` | PAR-003, PB-009 | Pure row/slot marching-order model and mutation helpers | Insert, move, swap, remove, duplicate, and missing-Actor tests |
| MAR-002 | `DONE` | MAR-001, PAR-005 | Marching-order UI with accessible controls and drag/drop enhancement | Mouse, keyboard, stale update, and mobile-width checks |
| MAR-003 | `DONE` | MAR-002, HUD-003 | Party marching-order chat report | Ordering, escaping, and empty-slot tests |
| SUP-001 | `DONE` | PAR-004, PAR-005 | Supplies fields and validation | Authorized editing, invalid numbers, refresh, and persistence tests |
| NOT-001 | `DONE` | PAR-004, PAR-005 | Party and treasure notes using the supported rich-text editor | Sanitization, save/cancel, permissions, and reload checks |
| REF-001 | `DONE` | MAR-002, SUP-001, NOT-001 | Targeted rerender policy for Actor/item/state updates | No lost edits and no unnecessary full-app render loop |

M3 is complete when all MAR, SUP, NOT, and REF items are `DONE` and the 0.3.0 package passes prior milestone regression tests.

## 8. Milestone 4 — Managed Treasury and Item Transfers

| ID | Status | Depends on | Deliverable | Verification |
| --- | --- | --- | --- | --- |
| TRY-001 | `DONE` | PB-006, PAR-004 | Treasury Actor creation, flagging, binding, lookup, recovery, and duplicate warning | Rename, deletion, recreation, duplicate, import/export, and permission tests |
| TRY-002 | `DONE` | TRY-001, FND-002 | Party Sheet treasury coins and item inventory views | All five coin types, missing images, unknown item types, and empty inventory |
| ITM-001 | `DONE` | PB-009, FND-002 | Pure transfer-plan builder for source, target, quantity, merge, and validation | Quantity/bundle/max, same-Actor, stale quantity, and unsupported type tests |
| ITM-002 | `DONE` | TRY-001, ITM-001, PAR-002 | Character-to-treasury transfer operation | Full/partial transfer, ownership, stale state, and rollback checks |
| ITM-003 | `DONE` | ITM-002 | Treasury-to-character transfer operation | Same matrix as ITM-002 with reversed authority and destination |
| ITM-004 | `DONE` | ITM-002, ITM-003 | Correct quantity, bundle, maximum, and merge semantics | Verified fixtures for weapon, armor, shield, and item types |
| ITM-005 | `DONE` | ITM-002, ITM-003, PB-007 | Supported drag/drop entry points on Party and Actor sheets | Valid drop, unauthorized drop, cancelled dialog, and invalid payload |
| ITM-006 | `DONE` | ITM-001 | Explicit container and unsupported-item rejection | Non-empty container causes no document mutation and a clear notice |
| ITM-007 | `DONE` | ITM-002, ITM-003 | Transfer audit chat/report and compensating rollback | Injected failure at each write boundary leaves consistent documents |

M4 is complete when all TRY and ITM items are `DONE`; no tested failure path duplicates or destroys an item; and the 0.4.0 package passes all earlier regression matrices.

## 9. Milestone 5 — XP, Coin, and Wage Distributions

| ID | Status | Depends on | Deliverable | Verification |
| --- | --- | --- | --- | --- |
| XP-001 | `TODO` | PB-009, FND-002 | Pure XP allocation calculator with shares, rounding, signed character adjustment, and NPC consumption | Positive/zero/negative bonus, mixed Actor types, remainder, zero shares, and large values |
| XP-002 | `TODO` | XP-001, PAR-005 | XP preview showing base share, adjustment, final award, NPC non-persistence, and remainder | Preview exactly matches calculation output |
| XP-003 | `TODO` | XP-002, PAR-002 | Transactional XP writeback to `character` Actors plus final chat report | Character totals update once; `npc.system.xp` never changes; failures roll back/report |
| COIN-001 | `TODO` | PB-009, FND-002 | Pure five-denomination coin allocation with share and remainder accounting | cp/sp/ep/gp/pp, mixed Actor types, zero shares, and large values |
| COIN-002 | `TODO` | COIN-001, PAR-005 | Coin preview showing persisted character shares, consumed NPC shares, and remainder destination | Preview exactly matches calculation output |
| COIN-003 | `TODO` | COIN-002, TRY-001, PAR-002 | Transactional character/treasury coin writeback plus final chat report | NPC receives no write; totals conserve input; failures roll back/report |
| WAGE-001 | `TODO` | PAR-007, PB-009 | Pure GP wage calculator and preview | Due/partial/zero wages, invalid rates, and insufficient treasury GP |
| WAGE-002 | `TODO` | WAGE-001, TRY-001, PAR-002 | Transactional GP wage settlement and chat report | Only GP changes; NPC/character follower metadata remains consistent |
| DST-001 | `TODO` | XP-003, COIN-003, WAGE-002 | Shared preflight, mutation journal, rollback, idempotency, and audit behavior | Injected failures and duplicate request IDs at every boundary |

### Distribution invariants

- Allocation calculation and preview perform no document writes.
- Preview values are the exact values used during confirmation unless the revision changes.
- NPC shares affect divisors and remainders but never write XP or money to an NPC Actor.
- Character XP adjustment is signed and applies only to that character's base XP share.
- A successful operation creates one final chat report identifying persisted awards, consumed NPC shares, and remainder handling.
- A failed operation never reports full success and must leave either the original state or an explicitly reconciled state.

M5 is complete when all XP, COIN, WAGE, and DST items are `DONE`, conservation/invariant tests pass, and the 0.5.0 package passes all prior regression matrices.

## 10. Milestone 6 — 1.0.0 Hardening

| ID | Status | Depends on | Deliverable | Verification |
| --- | --- | --- | --- | --- |
| HRD-001 | `TODO` | M1–M5 | Party-state and treasury migration coverage for every released schema | Upgrade fixtures from each released version |
| HRD-002 | `TODO` | M1–M5 | Authorization and payload-validation audit | All player-triggerable handlers reviewed and adversarial tests pass |
| HRD-003 | `TODO` | M1–M5 | Accessibility and localization pass | Keyboard-only flow, labels, focus, contrast, and missing-key scan |
| HRD-004 | `TODO` | M1–M5 | Performance and hook-lifecycle pass | Large party, large treasury, rapid selection, scene change, and repeated app open/close |
| HRD-005 | `TODO` | PB-003, PB-007, M1–M5 | Final Foundry 13/14 and current `hyp3e` compatibility matrix | Clean-world installation and full smoke suite on each supported combination |
| DOC-001 | `TODO` | M1–M5 | GM/player usage, setup, permissions, recovery, and limitation documentation | A new tester can install and complete core workflows unaided |
| PKG-001 | `TODO` | PB-001, PB-010, HRD-005 | Release manifest, zip contents, checksums, URLs, and GitHub release workflow | Install and update from published manifest in a clean Foundry data directory |
| QA-001 | `TODO` | HRD-001–PKG-001 | Full acceptance and regression run with defect disposition | No unresolved critical/high defects; lower-severity deferrals documented |

The 1.0.0 release is ready only when all M6 items are `DONE`, the repository is clean, the release artifact matches the tagged source, and install/update testing succeeds using the public release URLs.

## 11. Planned Automated Test Map

| Test area | Planned file |
| --- | --- |
| Adapter mappings | `tests/unit/hyp3e-adapter.test.mjs` |
| NPC selection controller | `tests/unit/npc-selection.test.mjs` |
| NPC Action HUD overlay | `tests/unit/npc-action-hud.test.mjs` |
| Reaction table | `tests/unit/reaction-table.test.mjs` |
| Save and morale planning | `tests/unit/npc-rolls.test.mjs` |
| Permissions | `tests/unit/party-permissions.test.mjs` |
| Party state and migrations | `tests/unit/party-state.test.mjs` |
| Marching order | `tests/unit/marching-order.test.mjs` |
| XP allocation | `tests/unit/xp-distribution.test.mjs` |
| Coin allocation | `tests/unit/coin-distribution.test.mjs` |
| Wages | `tests/unit/wage-settlement.test.mjs` |
| Item transfer planning | `tests/unit/item-transfer.test.mjs` |
| Socket operation validation | `tests/integration/socket-operations.test.mjs` |
| Treasury lifecycle | `tests/integration/treasury-store.test.mjs` |
| Transaction rollback | `tests/integration/transactions.test.mjs` |

Fixtures should be minimal and derived from the checked-in `hyp3e` schema, not copied wholesale from world data. No personal world content or user data belongs in test fixtures.

## 12. Manual Test Environments

Maintain at least these reusable worlds or test profiles:

1. Foundry 13 with the supported `hyp3e` release and only required dependencies.
2. Foundry 14 with the supported `hyp3e` release and only required dependencies.
3. A permissions world with one GM, one trusted user, one explicitly granted user, and one unauthorized user.
4. A transfer/distribution world with linked and unlinked tokens, character and NPC followers, a populated treasury, and deliberately malformed edge-case documents.

For each milestone, record Foundry version, system version, module commit, browser, clients used, test result, and defect links in `docs/test-runs/`.

## 13. Work Item Completion Record

When changing an item to `DONE`, add a short record under `docs/work-items/<ID>.md` containing:

- implemented outcome;
- files changed;
- automated tests run and results;
- manual checks run and environment versions;
- known limitations or follow-up IDs;
- any design-document change required by the implementation.

A work item is not `DONE` if its listed verification has been deferred without a new tracked item and explicit milestone-gate decision.

## 14. Recommended First Execution Batch

The pre-build portion of this sequence is complete:

1. PB-003 and `docs/compatibility-notes.md` are complete.
2. PB-004 through PB-007 passed in the Foundry test worlds.
3. PB-008 proved trustworthy SocketLib caller identity.
4. PB-009 made the test runner part of `npm run check`.

Milestones 0 through 4 are complete. Proceed next with the pure XP allocation
calculator in XP-001.

## 15. Current Project Status

- Product design: Complete for the planned 1.0 scope.
- Module foundation: FND-001 through FND-006 are implemented and validated.
- Official `hyp3e` reference: Connected to the upstream `dev` branch.
- S&W Utilities reference analysis: Incorporated into the design.
- Implementation: Milestones 0 through 4 are complete.
- Immediate next batch: Implement the pure XP allocation calculator in XP-001.
- Software license: MIT (`PB-001` complete).
- Local module name and ID: Hyp3e Utilities / `hyp3e-utilities`.
- Public repository: `https://github.com/DT357/hyp3e-utilities` (`PB-010` complete).
