# COIN-003 - Transactional coin distribution

Status: `DONE`

Completed: 2026-08-15

## Implemented outcome

Authorized Party Sheet editors can confirm a current coin preview through the
active GM. The request carries the complete five-denomination preview
fingerprint, normalized split amounts, selected Actor UUIDs, and Party State
revision. The GM recomputes current treasury and recipient data before any
write, so changed balances, types, shares, selections, or split amounts reject
the transaction.

Each compatible character purse receives all five updated totals once. NPC
allocations reduce the treasury and appear in the report but never invoke an
NPC update. The managed treasury is written after character purses. A single
reverse-order journal restores every completed purse and treasury write if any
later Actor update or the required chat report fails; recovery failure has a
distinct reconciliation error.

One escaped public report identifies the treasury and requester, lists CP, SP,
EP, GP, and PP for each persisted or consumed award, and records split
remainders and final treasury balances. Stable flags preserve request,
requester, revision, and treasury identifiers. A preview uses one stable
request ID for repeated confirmation attempts.

## Files changed

- `module/party/party-coin-awards.mjs`: Add strict preflight, serialized purse
  and treasury writes, conservation checks, rollback, and audit orchestration.
- `module/party/party-coin-preview.mjs`: Expose the same authoritative preview
  calculation to transaction preflight without a nested transport call.
- `module/chat/chat-cards.mjs`, `lang/en.json`, and
  `tests/unit/chat-cards.test.mjs`: Add the escaped five-denomination public
  report and stable flags.
- `module/apps/foundation-applications.mjs` and
  `templates/party-sheet.hbs`: Add guarded confirmation, stable request IDs,
  notices, and stale-preview disabling.
- `module/core/bootstrap.mjs`: Register and expose the coin award service.
- `tests/unit/party-coin-awards.test.mjs` and
  `tests/unit/application-shell.test.mjs`: Cover conservation, character and
  treasury writes, immutable NPC purses, stale/changed/malformed preflight,
  every write boundary, chat rollback, failed compensation, and UI routing.
- `IMPLEMENTATION-PLAN.md`: Mark COIN-003 complete.

## Verification

- Transaction, audit, and application tests failed before implementation.
- `npm run check` passes with 196 tests, syntax checks, localization checks,
  and manifest validation.
- Injected character, treasury, and chat failures restore all completed writes;
  an injected recovery failure returns `coinDistributionRollbackFailed`.

## Known limitations and follow-up

- DST-001 will exercise duplicate request IDs through the production mutation
  protocol for XP, coin, and wage operations together.
- The Foundry 13/14 live transaction matrix runs at the Milestone 5 gate.

No design-document change was required. No now-unused code remains.
