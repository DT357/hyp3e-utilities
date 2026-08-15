# WAGE-002 - Transactional follower wage settlement

Status: `DONE`

Completed: 2026-08-15

## Implemented outcome

Authorized Party Sheet editors can confirm an authoritative follower-wage
preview through the active GM. Confirmation rechecks the Party State revision,
managed treasury, selected followers, saved wage rates, and current GP before
writing. A stable request ID makes a repeated client request idempotent through
the Party mutation protocol.

A successful settlement deducts the exact total from the managed treasury's GP
balance and preserves cp, sp, ep, and pp. It never writes a follower Actor or
changes Party State wage metadata. After the treasury write succeeds, one
public, escaped chat card records each positive selected payment, total GP,
remaining GP, treasury, requester, revision, and request ID.

If the treasury write fails, no success report is created. If chat creation
fails, the original five-denomination treasury balance is restored. A failed
compensation is reported distinctly and never claimed as a safe rollback.

## Files changed

- `module/party/party-wage-settlement.mjs`: Add strict payload validation,
  authoritative preflight, serialized GP write, compensation, audit, and
  client request API.
- `module/chat/chat-cards.mjs` and `lang/en.json`: Add the public wage audit
  card and localized labels.
- `module/apps/foundation-applications.mjs` and
  `templates/party-sheet.hbs`: Add guarded confirmation with a stable request
  ID and success/failure notices.
- `module/core/bootstrap.mjs`: Register and expose the settlement service.
- `tests/unit/party-wage-settlement.test.mjs`,
  `tests/unit/chat-cards.test.mjs`, and
  `tests/unit/application-shell.test.mjs`: Cover successful GP-only writes,
  follower non-writes, stable UI confirmation, stale and changed previews,
  insufficient funds, malformed payloads, audit compensation, and rollback
  failure.
- `IMPLEMENTATION-PLAN.md`: Mark WAGE-002 complete.

## Verification

- Service, chat, and application tests failed before implementation.
- `npm run check` passes with 210 tests, syntax checks, localization checks,
  and manifest validation.

## Known limitations and follow-up

- Wages remain GP-only and do not model a paid-through date or Actor-side wage
  ledger, as approved for 1.0.
- DST-001 will consolidate the repeated distribution transaction machinery and
  add cross-operation duplicate-request and boundary-failure coverage.

No design-document change was required. No now-unused code remains.
