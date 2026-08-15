# Milestone 5 distribution compatibility gate

Date: 2026-08-15

Result: `PASS` through Milestone 5

## Environments

| Matrix | System | Module | Clients | Result |
| --- | --- | --- | --- | --- |
| Foundry 13.351 portable | `hyp3e` 4.0.3 | Hyp3e Utilities 0.5.0 working tree | GM and trusted Player on separate browser origins | Pass |
| Foundry 14.365 | `hyp3e` 4.1.0 dev | Hyp3e Utilities 0.5.0 working tree | GM and trusted Player on separate browser origins | Pass |

Both servers used workspace-local disposable data roots, SocketLib v1.1.4,
and the Codex in-app Chromium browser. Foundry 13 used port 33373 and Foundry
14 used port 33374. Neither normal Foundry data directory was used.

Before the distribution-specific checks, the existing complete compatibility
diagnostic reran on both versions. GM and Player clients completed without a
diagnostic error; the Foundry 13 Player was reloaded after the GM fixture setup
to avoid the diagnostic's documented startup-order dependency.

## Distribution fixture

Each matrix created and later deleted three world Actors:

- one `character` member with share 1, 100 XP, +10% XP adjustment, and one of
  every coin;
- one `character` follower with share 0.5, 200 XP, -10% XP adjustment, two of
  every coin, and a 3 GP wage;
- one `npc` follower with share 0.5, 75 encounter XP, an empty purse, and a
  5 GP wage.

The managed treasury began with 12 CP, 8 SP, 4 EP, 20 GP, and 4 PP. Its exact
five-denomination balance and the exact pre-test Party State were captured
before setup.

## Results

| Gate | Foundry 13 | Foundry 14 | Evidence |
| --- | --- | --- | --- |
| XP preview and writeback | Pass | Pass | 400 XP produced base shares 200/100/100; character awards were 220 and 90 after +10%/-10%; NPC 100 was consumed with NPC XP still 75 |
| Wage settlement | Pass | Pass | Trusted Player paid 3+5 GP; treasury moved from 20 to 12 GP; other denominations remained 12/8/4/4 before coin distribution; follower metadata was unchanged |
| Coin distribution | Pass | Pass | Trusted Player split 12 CP, 8 SP, 4 EP, 12 GP, and 4 PP across shares 1/0.5/0.5; NPC allocation was consumed with its purse unchanged |
| Conservation | Pass | Pass | Final hero purse 7/5/3/7/3, retainer purse 5/4/3/5/3, NPC purse 0/0/0/0/0, and treasury 0/0/0/0/0 exactly conserve starting purses, treasury, and NPC consumption |
| Idempotency | Pass | Pass | Repeating each XP, wage, and coin request ID returned the original result and created no second write or report |
| Audit | Pass | Pass | Exactly one public `xpDistribution`, `wageSettlement`, and `coinDistribution` chat card was present |
| Prior regression | Pass | Pass | Existing HUD, Party Sheet, treasury, item-transfer, permissions, SocketLib, and lifecycle diagnostics completed without recorded errors |
| Cleanup | Pass | Pass | Three distribution Actors and three audit messages were deleted; captured Party State and treasury values were restored before server shutdown |

The automated gate passed 218 tests plus production entry-point syntax,
diagnostic syntax, localization, and manifest validation.

## Package evidence

- Artifact: `.foundry-test/packages/hyp3e-utilities-0.5.0.zip`
- Size: 99,641 bytes
- SHA-256:
  `6A3F2F6C387D3915215F5DDDA88C171388530EE82068FF8C0524C25104646DB1`
- Contents: root manifest and notices plus `module`, `styles`, `lang`, and
  `templates` runtime trees

The artifact is private gate evidence only. No Git tag or public release was
created.

## Cleanup

Both Foundry processes were stopped and ports 33373 and 33374 were confirmed
clear. The disposable data roots are retained for the Milestone 6 regression
matrix. The M5 diagnostic now also reports exact restoration booleans for
future runs.
