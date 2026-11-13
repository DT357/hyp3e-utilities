# Formatted coin balance and split regression

Date: 2026-10-22. Local working tree repair; no version bump or publication.

## Reproduction and scope

The maintainer reported commas affecting gold and treasure splitting after the
XP formatting investigation. The same stopped-world snapshot was reused in new
disposable Foundry 14.369 worlds with hyp3e 4.6.0. The preserved 586-file snapshot
was rehashed unchanged. The original snapshot had an empty treasury and small
unformatted character purses, so explicit test balances were introduced only
in working copies. They are not evidence of the campaign's historical losses.

The released 1.0.3 adapter converted comma-formatted money to zero and truncated
period-grouped money. A formatted treasury therefore reported incorrect
availability. A gold-only split of 1,250 GP among five equal character shares
replaced a formatted 4,000 GP purse with 250 GP. It also replaced untouched
1,000 CP with zero because the write included every denomination. The split
form's number inputs could not accept commas, and preview conversion also
treated formatted split amounts as zero.

## Repair

- XP, stored coins and split input share a strict whole-count parser accepting
  ordinary integers and correctly grouped comma/period thousands separators.
- Coin fields accept text with a numeric keyboard hint; calculation still caps
  the requested amount at the available balance. Malformed/unsafe amounts are
  rejected, not truncated or silently converted to zero.
- Treasury preview rejects unreadable balances; character writeback rejects
  unreadable existing purses and rolls back earlier writes. The money update
  builder also rejects invalid balances, protecting wage writes in other coins.
- Character-only writeback, NPC consumption, shares, remainders, permissions,
  request replay and transaction rollback are preserved.

## Automated and campaign checks

Regression tests failed against the old implementation before the fix.
All 264 automated tests pass. Coverage includes every denomination, formatted
treasury and character balances, formatted split input, partial gold-only
splits, successive awards, retained remainders, NPC consumption, malformed
balances, audit failure rollback and wage preservation. The new
`runFormattedCoins()` runtime diagnostic restores its fixture balances.

The fixed campaign copy passed with all 15 originally enabled modules active
and no browser page errors. Its real Party Sheet accepted `1,250` in all five
coin fields. Two splits, a real character sheet save storing `4,250` GP, and a
third gold-only split all preserved the balances. Replaying the third request
did not award again. A reload confirmed every character purse and the treasury.

Each of the five characters started the controlled test with
CP/SP/EP/GP/PP = 1,000/2,000/3,000/4,000/5,000 and ended with
1,500/2,500/3,500/4,750/5,500. Treasury balances started at
6,005/7,005/8,005/9,005/10,005 and ended at
3,505/4,505/5,505/5,255/7,505. Total coins are conserved per denomination.

The complete GM/player matrix passed on Foundry 13.351 (Node 22.23.2) and
14.369 (Node 24.15.0), with SocketLib 1.1.4 and Playwright 1.63.0. Each run
passed 37 GM groups, 13 player groups, 509 positive observations, 18 expected
negative observations, themes, keyboard/lifecycle and module disable/reload.
Both new formatted-XP and formatted-coin diagnostics passed. After two coin
awards the fixture balances were 2,250 for the character, 1,624 for the retainer
and 3,753 in treasury, per denomination, with NPC shares consumed as designed.

Known upstream exceptions: two `#postNotification` errors on v13 and eight on
v14; six equipment-compendium migration messages on v13. Each run included
the expected sanitation-fixture `/x` 404. No unclassified warning/error or
deprecation was accepted. Temporary licenses were removed and test ports freed.

All 53 final candidate files match source and generated staging. The campaign
test's 46 runtime code/template/style files also match the final candidate;
subsequent help-text and documentation edits were included in the full matrix.
Both campaign and matrix folders contain `ACCEPTANCE.json` verification records.

## Artifact and local evidence

- Combined XP/coin candidate: manifest remains 1.0.3, **unreleased**.
- Candidate: `RuntimeTests/hyp3e-utilities/coin-xp-fix-candidate-2026-10-22/`.
- ZIP SHA-256: `67bfaf1415e5453a03654e91c53f3fddf669c6206da0dc071448a424df789230`.
- Release allowlist: 53 files; the added runtime file is `module/core/numbers.mjs`.
- Published hyp3e 4.6.0, read-only reference commit
  `58dad834ea295436e5d8cc39a180246eb488860f`.
- Private campaign evidence:
  `RuntimeTests/hyp3e-utilities/coin-investigation-2026-10-22/`.
- Released-code reproduction: `baseline-2026-10-22T12-48-51-364Z`.
- Fixed full-module campaign run: `fixed-2026-10-22T12-50-00-249Z`.

Personal campaign data, names, account data and third-party assets remain outside
the repository and release archive. The live installation was not modified.
Previously lost coins are not reconstructed by this repair.
