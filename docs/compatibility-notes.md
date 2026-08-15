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

## Current gate

PB-003 through PB-009, FND-001 through FND-006, and HUD-001 through HUD-006 are
complete. No compatibility finding contradicts the approved architecture. The
next compatibility gate is HUD-007 synchronization debounce and lifecycle
cleanup.
