# COIN-001 - Pure five-denomination allocation

Status: `DONE`

Completed: 2026-08-15

## Implemented outcome

The coin calculator independently allocates CP, SP, EP, GP, and PP using the
Party Sheet's selected quarter shares and exact integer floor division. It
accepts current treasury balances plus optional GM split amounts, caps every
split to its available balance, and defaults omitted split input to the full
treasury.

The result distinguishes the floor remainder inside the chosen split from the
final treasury balance, which also retains coins the GM withheld from the
split. It reports distributed and persisted totals, NPC-consumed totals, and
per-recipient awards. NPC shares participate fully but expose zero persistent
awards. All arithmetic remains exact through `Number.MAX_SAFE_INTEGER`.

## Files changed

- `module/party/coin-distribution.mjs`: Add the side-effect-free five-coin
  allocation, normalization, conservation, and recipient model.
- `tests/unit/coin-distribution.test.mjs`: Cover all denominations, capped and
  withheld amounts, mixed Actor types, NPC consumption, selections,
  quarter/zero shares, no active shares, remainders, and large balances.
- `IMPLEMENTATION-PLAN.md`: Mark COIN-001 complete.

## Verification

- The focused test initially failed because the calculator did not exist.
- `npm run check` passes with 187 tests, syntax checks, localization checks,
  manifest validation, and no document writes from calculation.
- Every tested denomination conserves `distributed + remaining = available`.

## Known limitations and follow-up

- COIN-002 will resolve authoritative treasury and recipient Actors and render
  the calculator result as a GM preview.
- COIN-003 will add the multi-Actor and treasury transaction plus final chat
  report.

No design-document change was required. No now-unused code remains.
