# HRD-005 clean Foundry compatibility matrix

Date: 2026-08-15

Result: `PASS`

## Environments

| Matrix | System | Module installation | Clients | Result |
| --- | --- | --- | --- | --- |
| Foundry 13.351 portable | `hyp3e` 4.0.3 | Hyp3e Utilities 0.5.0 release-candidate ZIP | GM and Player on separate browser origins | Pass |
| Foundry 14.365 | `hyp3e` 4.1.0 | Hyp3e Utilities 0.5.0 release-candidate ZIP | GM and Player on separate browser origins | Pass |

Both matrices used SocketLib v1.1.4, the Codex in-app Chromium browser, and
new workspace-local disposable data roots. The worlds
`hyp3e-utilities-hrd005-v13` and `hyp3e-utilities-hrd005-v14` were created in
those roots after the package was installed. No normal Foundry data directory
or pre-existing world was used.

## Package evidence

- Artifact: `.foundry-test/packages/hyp3e-utilities-0.5.0-rc.zip`
- Size: 100,345 bytes
- SHA-256:
  `CCD94AE4F096F2EA1775744D25CAB24E8B56F88537C95E27569816750E77E6E7`
- Root contents: `module.json`, `README.md`, `LICENSE`,
  `THIRD_PARTY_NOTICES.md`, `module`, `styles`, `lang`, and `templates`
- Installation: extracted independently into each clean data root; neither
  production module installation was a junction to the working tree

The diagnostic companion was installed separately and is not present in the
production archive.

## Complete compatibility diagnostic

GM and Player clients completed all 37 result groups on both Foundry majors.
Each client reported `status: complete` and an empty `errors` array.

The matrix covered:

- module discovery, initialization, compatibility guards, settings, shared
  applications, SocketLib identity, and active-GM routing;
- all NPC Action HUD reaction, save, morale, selection, overlay, positioning,
  lifecycle, accessibility, and localization flows;
- Party Sheet authorization, concurrency, stale drafts, members, followers,
  row actions, marching order, supplies, notes, targeted refreshes, treasury
  lifecycle and views, and bidirectional Item transfers; and
- real Actor, token, Active Effect, chat-card, managed-treasury, and cleanup
  behavior in the installed `hyp3e` versions.

All observed `false` values were required negative results: a non-GM identity,
denied/malformed authorization, a rejected malformed mutation, one rejected
stale concurrent mutation, durable world Actors not being synthetic, and the
documented `hyp3e` synthetic-token snapshot behavior. No success assertion was
false in the final runs.

## Distribution regression

The Milestone 5 XP, coin, and wage fixture was repeated after the full smoke
suite in each clean world.

| Gate | Foundry 13 | Foundry 14 |
| --- | --- | --- |
| 400 XP preview and character writeback | Pass | Pass |
| NPC XP share consumed without NPC writeback | Pass | Pass |
| Player-initiated GP wage settlement | Pass | Pass |
| Five-denomination coin distribution | Pass | Pass |
| Duplicate-request idempotency | Pass | Pass |
| Public audit cards | Pass | Pass |
| Exact Party State and treasury restoration | Pass | Pass |

The final values matched the prior Milestone 5 gate: hero XP 320, retainer XP
290, NPC XP unchanged at 75, hero purse 7/5/3/7/3, retainer purse 5/4/3/5/3,
NPC purse unchanged at zero, and an empty treasury after allocation. Cleanup
deleted three fixture Actors and three audit messages, left no fixture
documents, and restored the exact captured state and treasury balance.

## Diagnostic hardening found during the run

The first Foundry 14 pass exposed two test-harness timing races:

- draft-preservation assertions could sample the stale-warning element before
  the ApplicationV2 rerender completed; and
- deleting a newly created diagnostic audit message could race Foundry's chat
  notification animation.

The diagnostic now waits for stale warnings and allows new chat cards to mount
before cleanup. Repeated final runs on both Foundry majors reported the warning
assertions as true and no chat-animation exception.

## Console and server observations

- Deliberately exercised failures emitted their expected localized notices:
  unsupported HUD action, invalid member/follower action, missing token, and
  stale follower/marching/supply/note saves.
- Foundry emitted its standard 1280-by-720 minimum-viewport warning.
- Foundry 13 also emitted the known `hyp3e` Actor Sheet ContextMenu v14
  migration warning; the stack originates in the system's
  `actor-sheet-v2.mjs`, not Hyp3e Utilities.
- No unexpected Hyp3e Utilities exception or server-side error was recorded in
  either final run.

## Automated verification

`npm run check` passed 234 tests plus production and diagnostic syntax checks
and manifest validation after the runtime matrix.

## Cleanup

Both browser clients and Foundry processes were closed. Ports 33383 and 33384
were confirmed clear. The ignored disposable roots are retained as private
test evidence and may be deleted without affecting any Foundry installation.
