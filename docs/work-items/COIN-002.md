# COIN-002 - Authoritative coin preview

Status: `DONE`

Completed: 2026-08-15

## Implemented outcome

Authorized Party Sheet editors can now preview a treasury split on the Treasure
tab. All five denominations default to their current treasury balance and may
be reduced independently. Positive-share recipients default to selected. The
preview table shows exact per-recipient awards, explicit character or NPC
writeback behavior, split remainders, and the treasury balance after the split.

Preview requests execute read-only on the active GM through the authenticated
mutation transport. This preserves the approved trusted-player workflow even
when that client cannot locally resolve a treasury or recipient Actor. The GM
resolves current Party State, treasury money, Actor types, names, and shares,
then returns the COIN-001 calculator result without calling any document write.

Local split and recipient drafts survive external rerenders. The application
renders the returned calculator awards directly and marks a stored preview
stale when the Party State revision changes.

## Files changed

- `module/party/party-coin-preview.mjs`: Add strict read-only preview requests,
  active-GM resolution, treasury validation, and display annotations.
- `module/apps/foundation-applications.mjs`, `templates/party-sheet.hbs`,
  `styles/hyp3e-utilities.css`, and `lang/en.json`: Add the five-coin editor,
  recipient selection, exact preview table, rerender-safe drafts, and
  localization.
- `module/core/bootstrap.mjs`: Register and expose the coin preview service.
- `tests/unit/party-coin-preview.test.mjs` and
  `tests/unit/application-shell.test.mjs`: Cover authoritative data, trusted
  editor routing, defaults, exact display values, stale revisions, malformed
  payloads, and absence of writes.
- `IMPLEMENTATION-PLAN.md`: Mark COIN-002 complete.

## Verification

- Service and Party Sheet preview tests failed before implementation.
- `npm run check` passes with 191 tests, syntax checks, localization checks,
  and manifest validation.

## Known limitations and follow-up

- COIN-003 will add the confirmation action, transaction journal, character
  and treasury writes, and final public report.
- A stored preview can also become stale when Actor coin data changes without a
  Party State revision; COIN-003 will recompute and compare the complete
  preview fingerprint before its first write.

No design-document change was required. No now-unused code remains.
