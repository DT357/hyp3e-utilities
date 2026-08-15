# Compatibility Notes

## Supported platform target

Hyp3e Utilities currently declares Foundry VTT 13 through 14 and requires the
`hyp3e` system. Runtime validation is tracked separately for each Foundry major.

| Foundry | `hyp3e` | Result | Notes |
| --- | --- | --- | --- |
| 14.365 | 4.1.0 (`dev`) | Passed through FND-006 and HUD-001/HUD-005 | Full isolated run recorded under `docs/test-runs/` |
| 13.351 | 4.0.3 | Passed through FND-006 and HUD-001/HUD-005 | Isolated portable-build run recorded under `docs/test-runs/` |

The Foundry 14 run used `hyp3e` commit
`8d9aae354712087dacfea10fb0fd5a1f6beca8db`. Both runs used SocketLib v1.1.4
for the diagnostic dependency; the two-client caller-authentication proof was
performed in Foundry 14.

## Verified findings

### Module lifecycle (PB-003)

- Foundry discovered Hyp3e Utilities in an isolated `hyp3e` world.
- The module enabled and initialized with the expected ID and version.
- The diagnostic module and SocketLib enabled alongside it.
- Deactivating all modules and reloading returned the world to zero active
  modules without a module-originated console error.
- The same lifecycle passed in Foundry 13.351 and 14.365.

### Five-save fields (PB-004)

Use `system.saves.<kind>.curr` for death, device, transformation, avoidance,
and sorcery saves on both `character` and `npc` Actors. The shared `hyp3e`
data model resets `curr` from `value` during base preparation so Active Effects
can modify the prepared target. A +2 Active Effect changed death `curr` from 10
to 12 while `value` remained 10 for both Actor types.

### Token and Actor identity (PB-005)

- Two linked tokens share the durable world Actor UUID.
- An unlinked token has a token-scoped synthetic Actor UUID.
- Base Actor updates propagate to linked actors and to an unlinked token before
  a field receives a synthetic override.
- Updating the synthetic Actor changes that token without changing the base
  Actor.
- Single selection, multi-selection, release, and token deletion were observed
  through the live canvas.

HUD rows must therefore be keyed and resolved by token UUID, while retaining
the Actor UUID for document access and diagnostics.

### Managed treasury (PB-006)

A world Actor of type `treasure` supported module flag persistence, ownership,
rename-tolerant lookup, deletion detection, recreation, and detection of two
flagged candidates. Duplicate recovery must ask the GM to choose; it must not
silently delete either Actor.

### ApplicationV2 (PB-007)

Foundry 13.351 and 14.365 passed ApplicationV2 construction with
HandlebarsApplicationMixin, parts/template rendering, action dispatch,
action-triggered and explicit rerenders, stable singleton reference, and clean
close.

### SocketLib caller identity (PB-008)

SocketLib v1.1.4 passes the server-derived requester ID to a registered GM
handler as `this.socketdata.userId`. A player sent the GM's ID as a claimed
payload identity; the handler still received the player's real ID, executed on
the active GM client, and the independent Foundry socket callback reported the
same player sender ID.

The run also observed SocketLib's explicit no-active-GM error and a successful
request after reconnect. SocketLib does not replace application authorization,
revision checks, or idempotency. Those remain production requirements in
FND-004, PAR-002, and PAR-004.

### Production foundation (FND-001 through FND-006)

The same production foundation loaded in Foundry 13.351 and 14.365. Both
environments published the module API, read representative character, NPC,
treasure, and synthetic Actor data through the adapter, registered all five
settings and three setting menus, completed an authenticated SocketLib ping,
and rendered and closed all four foundation ApplicationV2 classes. The runtime
compatibility guard accepted both supported environments, and neither run
produced a module-originated warning or error.

SocketLib selects the active GM for `executeAsGM`; Hyp3e Utilities checks the
current `game.users.activeGM` for every call and does not cache GM identity.
Automated tests cover no-GM and changed-GM behavior. Mutation authorization,
revision control, and idempotency remain intentionally deferred to PAR-002 and
PAR-004.

### NPC roll rules and chat output (HUD-001 through HUD-003)

Foundry 13.351 and 14.365 produced identical results from the production API:

- reaction totals below zero through above 12 matched all seven Hyperborea
  result bands;
- two selected token instances for one NPC Actor produced two distinct,
  unmodified `2d6` instructions;
- neutral results retained the table's reroll instruction without scheduling a
  second automatic roll;
- all five save categories used `system.saves.<kind>.curr`, including a +2
  prepared Active Effect adjustment;
- save success used `1d20 >= target`, morale success used `2d6 <= target`, and
  missing save or morale values were skipped.

The HUD-003 diagnostic evaluated actual Foundry Rolls and created one message
per instruction. Both generations verified GM-only recipients, Actor and token
speaker attribution, stable token order, one attached Roll per message, shared
batch flags, save-category flags, escaped hostile Actor names, and rendered
localized reaction, save, and morale cards.

Foundry 13 uses `rollMode: "gmroll"`; Foundry 14 uses
`messageMode: "gm"`. An initial v14 check caught the legacy value before the
final corrected run. The invalid-mode attempt failed closed without creating a
public message. The corrected final runs produced no module-originated warning
or error.

### Controlled-NPC selection (HUD-004)

Foundry 13.351 and 14.365 passed the production selection controller against
real canvas tokens. Both generations verified that:

- mixed character/NPC selections retain only NPC rows;
- two linked tokens for one Actor remain separate rows keyed by token UUID;
- an unlinked token retains its token-scoped synthetic Actor identity;
- rows are alphabetized by token display name and expose exact roll candidates;
- an unchanged synchronization preserves the same immutable view-model object;
- synthetic Actor updates, token deletion, selection release, and the HUD world
  setting refresh visibility and row data without a reload.

The diagnostic used three selected NPC tokens plus one selected character and
completed with no module-originated browser warning or error. The controller
publishes data for the HUD-005 overlay.

### NPC Action HUD overlay (HUD-005)

Foundry 13.351 and 14.365 rendered the production overlay from real controlled
tokens. Both generations verified one stable overlay, distinct token rows,
clamped HP widths, AC/DR/movement statistics, the missing-morale indicator,
all five explicit save options, selected-save persistence across Actor updates,
and removal when the world setting was disabled.

UI actions opened the exact unlinked token Actor sheet and reused the
production reaction, save, morale, and chat-card services. Two selected NPCs
created two reaction messages, two Sorcery save messages, and one morale
message while the missing-morale target was skipped and reported once. Visual
inspection at the automated 1280-by-720 viewport confirmed the desktop layout,
responsive row wrapping, readable health bars, and long-name ellipsis.

### NPC Action HUD position lifecycle (HUD-006)

Foundry 13.351 and 14.365 applied the client-scoped `left`, `top`, and `width`
setting to the production overlay. Both generations verified the centered
default, Pointer Events drag handle, persisted position after overlay removal
and recreation, immediate reset behavior, resize clamping, and recovery from
deliberately oversized off-screen coordinates.

The live diagnostic ran at the constrained 1280-by-720 browser viewport and
confirmed a 704-pixel default width with a 12-pixel safe margin. Visual
inspection confirmed the positioned HUD remained readable after Foundry's own
minimum-window warning was dismissed. The overlay removed its resize listener
when hidden, and the HUD service removed its settings hook when destroyed.

### NPC Action HUD synchronization lifecycle (HUD-007)

Foundry 13.351 and 14.365 coalesced five Actor updates spaced 10 milliseconds
apart into one selection-model publication containing the final HP value.
Three world-setting enable/disable cycles, two explicit controller/HUD
destroy-and-restart cycles, and repeated idempotent `start()` calls retained
exactly one overlay in both generations.

Unit coverage independently verifies one registration per Foundry hook, one
settings hook, one resize listener while visible, cancellation of pending
debounce work, and complete listener removal during destruction.

### NPC Action HUD accessibility and unavailable actions (HUD-008)

Foundry 13.351 with `hyp3e` 4.0.3 and Foundry 14.365 with the official
`hyp3e` dev 4.1.0 system passed the final HUD acceptance gate. Both generations
verified a labelled region, announced selection counts, localized drag and
Actor-sheet labels, native keyboard-focusable buttons, all five visible save
choices, and disabled save or morale controls when no selected target can roll
that action. Reaction remained available for every selected NPC.

Unavailable save batches were rejected before chat creation. A live
UI-triggered invalid action produced the localized GM error notice in both
generations. That check exposed and then verified a lifecycle correction:
notification services are resolved when a notice is emitted because Foundry's
`ui` object may not exist when the module first registers its lifecycle.

The English localization scan covers all static template keys and the dynamic
HUD/chat families. Focus-visible styles and native form controls provide the
keyboard path without replacing the approved Pointer Events drag behavior.

### Authenticated Party Sheet mutations (PAR-001 and PAR-002)

Foundry 13.351 with `hyp3e` 4.0.3 and Foundry 14.365 with the official `hyp3e`
dev 4.1.0 system passed the first multi-client Party Core gate. Each disposable
world used one active GM and one Player granted explicit Party Sheet edit
permission.

The Player sent a payload containing the GM's ID as a claimed identity. The
production handler authorized the server-derived SocketLib caller instead,
executed on the active GM, and returned the actual Player ID. An independent
Foundry socket callback reported the same sender. Repeating an identical
request ID returned the first result with an execution count of one, while an
unknown payload field returned the structured `invalidRequest` error without
executing. Both generations also passed the complete GM, role-threshold,
explicit-grant, and denied-user permission matrix.

The protocol does not yet write Party Sheet state. PAR-003 defines state and
revision semantics; PAR-004 supplies serialized GM-authoritative writes and
stale-revision rejection.

### Versioned Party Sheet state (PAR-003)

The schema-1 state model has no Foundry runtime dependency. Automated coverage
proves independent defaults, deterministic normalization, strict unknown-field
and future-version rejection, schema-0 migration, durable world-Actor UUID
filtering, member/follower exclusivity, metadata pruning, quarter-share and GP
wage normalization, marching-order uniqueness, and monotonic revisions.

The world-setting integration is intentionally deferred to PAR-004, where the
same model will be tested through serialized active-GM writes and stale client
revisions in both supported Foundry generations.

### GM-authoritative Party Sheet store (PAR-004)

Foundry 13.351 with `hyp3e` 4.0.3 and Foundry 14.365 with the official `hyp3e`
dev 4.1.0 system passed the serialized-write gate using one GM and one Player
client. In each world, the authorized Player sent two distinct requests at
revision 0. The first committed revision 1; the second reached the queue after
that write and returned `staleRevision` with revision-1 state without invoking
its mutator. Retrying the rejected operation at revision 1 committed revision
2.

Both clients observed the same revision-2 state containing exactly the two
requested durable Actor UUIDs. The independent Foundry socket callback again
identified the Player as the sender. Automated fault injection separately
proves exact prior-state restoration after a partially applied setting error,
distinct reporting when compensation fails, no write after a mutator failure,
and a final authority check if the active GM changes mid-operation.

### Singleton Party Sheet shell (PAR-005)

Foundry 13.351 and 14.365 rendered the same production ApplicationV2 shell
with one connected window, six localized tabs, current revision, and edit
status. Reopening returned the same instance, rerendered it, and brought it
forward. A Party State hook triggered refresh while open; closing removed the
listener and allowed a distinct replacement instance to render. The Settings
menu resolves directly to the singleton class.

The first live pass caught a cross-generation action-handler defect: Foundry
supplies the activated element as the handler's second argument, not as
`event.currentTarget`. The corrected handler uses that target, and the final
v13/v14 runs both switched to Followers with the expected selected-tab state.

### Overview party-member management (PAR-006)

Foundry 13.351 with `hyp3e` 4.0.3 and Foundry 14.365 with the official `hyp3e`
dev 4.1.0 system passed the complete Overview gate. In both generations the
active GM added a durable character through the authoritative mutation,
received an `invalidActor` rejection for an NPC without advancing state,
rendered the adapter-derived summary, opened the exact world Actor sheet,
removed the member through the UI, and added the character again through the
Actor-drop path.

Both generations retained a deliberately deleted Actor reference as a marked
missing row and then removed it through the authorized cleanup action. The
Actor Directory displayed one localized Open Party Sheet button, and that
button opened the working localized Overview. Automated coverage separately
proves non-GM Actor ownership checks, synthetic-Actor rejection, duplicate
rejection, and member-only metadata cleanup.

The first live pass detected that a directory-binding helper had accidentally
become enumerable in the public applications class collection. The helper is
now a static Party Sheet method, preserving the collection's established API;
the corrected v13/v14 runs completed with no diagnostic errors.

### Followers and employment data (PAR-007)

Foundry 13.351 with `hyp3e` 4.0.3 and Foundry 14.365 with the official `hyp3e`
dev 4.1.0 system passed the complete Followers gate. Each generation added a
durable character follower through the authoritative operation and an NPC
follower through the tab's Actor-drop entry point. Both rows rendered, the NPC
subtype matched the adapter, and the exact NPC Actor sheet opened from its row.

A 5 GP whole-number daily wage and 0.75 quarter-share persisted together, and
removing each follower cleared its Party State metadata without deleting an
Actor. A deliberately deleted NPC reference remained visible and was removed
through the authorized cleanup action. Automated coverage separately proves
character/NPC type acceptance, member/follower exclusivity, non-GM ownership,
synthetic and treasure rejection, strict wage/share validation, and preservation
of unrelated member metadata. Both live runs completed without errors.

### Reused Party Sheet row actions (PAR-008)

Foundry 13.351 with `hyp3e` 4.0.3 and Foundry 14.365 with the official `hyp3e`
dev 4.1.0 system passed the Party action gate. Member and follower rows each
displayed all five approved save categories. Foundry's shared canvas ping was
called with the exact linked character and NPC token centers.

Each generation created exactly four messages through the existing roll and
chat services: a member Device save, follower Sorcery save, individual NPC
morale, and bulk NPC morale. The messages retained the existing HUD feature,
action, Actor, and category flags and were whispered only to GM users. Deleting
the character token caused no additional ping and produced one localized
missing-token notice.

Automated coverage proves controlled-token preference, stable fallback token
ordering, no-token rejection, unchanged planner/chat delegation, empty-batch
rejection, and GM-only roll execution. The first runtime attempt exposed a
diagnostic tab-selection mistake rather than a product defect; the corrected
v13/v14 runs completed with no diagnostic errors.

## Current gate

PB-003 through PB-009, FND-001 through FND-006, HUD-001 through HUD-008, and
PAR-001 through PAR-008 are complete. No compatibility finding contradicts the
approved architecture. Milestone 1 is complete; the next compatibility work is
external-update and cleanup behavior in Milestone 2.
