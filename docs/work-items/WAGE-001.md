# WAGE-001 - GP wage calculator and preview

Status: `DONE`

Completed: 2026-08-15

## Implemented outcome

The pure wage calculator totals selected followers' non-negative whole-GP
daily wages, reports treasury GP, total due, remaining GP, and shortfall, and
never calculates a negative purse. Zero wages and empty selections remain
visible but cannot be settled. Invalid or unsafe rates are flagged rather than
silently charged, and total overflow fails explicitly.

Authorized Party Sheet editors now receive a read-only wage preview on the
Followers tab. Like coin preview, it executes on the active GM so trusted
players see authoritative follower metadata, module-local wages, and managed
treasury GP even when documents are hidden locally. Missing references are
visible but disabled. The UI supports partial selection and clearly reports
that insufficient GP blocks the whole payment without denomination conversion
or partial settlement.

Local selections survive external rerenders and a Party State revision change
marks a stored preview stale.

## Files changed

- `module/party/wage-calculation.mjs`: Add pure GP normalization, selection,
  validation, total, shortfall, and remaining-purse calculation.
- `module/party/party-wage-preview.mjs`: Add active-GM read-only preview,
  treasury validation, authoritative follower resolution, and strict payloads.
- `module/apps/foundation-applications.mjs`, `templates/party-sheet.hbs`,
  `styles/hyp3e-utilities.css`, and `lang/en.json`: Add the wage selector,
  summary, insufficient-GP status, and rerender-safe draft.
- `module/core/bootstrap.mjs`: Register and expose the wage preview service.
- `tests/unit/wage-calculation.test.mjs`,
  `tests/unit/party-wage-preview.test.mjs`, and
  `tests/unit/application-shell.test.mjs`: Cover due, partial, zero, invalid,
  insufficient, overflow, stale/malformed, authoritative, no-write, and UI
  cases.
- `IMPLEMENTATION-PLAN.md`: Mark WAGE-001 complete.

## Verification

- Calculator, service, and application tests failed before implementation.
- `npm run check` passes with 205 tests, syntax checks, localization checks,
  and manifest validation.

## Known limitations and follow-up

- WAGE-002 will add confirmation, the treasury GP transaction, rollback, and
  final public report.
- Wage payment intentionally does not update follower Actor sheets or convert
  other denominations in the first release.

No design-document change was required. No now-unused code remains.
