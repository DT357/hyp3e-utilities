# Formatted XP award regression

Date: 2026-10-21 (America/Chicago; runtime timestamps use UTC).

Scope: investigate overwritten XP and apparently skipped characters using a
maintainer-authorized copy of an existing campaign. The fix is unreleased;
the manifest remains at 1.0.3. Live data and installed packages were not changed.

## Reproduction

The stopped live world was copied into an isolated test area. All 586 world
files matched SHA-256 hashes before and after copying. The saved campaign used
Foundry 14.369, hyp3e 4.6.0 and Utilities 1.0.3. Its five party members were
world character Actors with linked tokens, equal shares and 10% XP bonuses.
All five XP values contained commas.

The released adapter used `Number(value)` followed by zero fallback. Thus
`"1,375"` read as zero; `"1.375"` read as one after truncation. The system's
character sheet formats XP with thousands separators and can save that text.

In a disposable copy, an initial 6,250 XP pool awarded 1,375 to each character
but replaced existing formatted totals. Saving two character sheets stored
`"1,375"` for those characters. A second award through the Party Sheet left
those two at 1,375 while the other three reached 2,750. Reloading preserved
these results. This reproduces both reported symptoms with one defect.

## Repair

- Parse whole XP and correctly grouped comma/period thousands separators.
- Preserve blank XP as zero; reject malformed, negative, missing or unsafe
  totals instead of silently treating them as zero.
- Stop and roll back a failed distribution when an existing total is unreadable.
- Retain character-only writeback, bonuses, shares, authority and request replay
  protection. No world migration or automatic historical XP repair is performed.
- Correct the integration fixture's obsolete `details.experience` field to
  `details.xp`, and assert its actual final XP, not only the number of writes.

## Validation

The failing regression tests were run before the implementation change.
All 257 local tests now pass, including formatted reads, two successive awards,
invalid-total rollback, audit failure and duplicate requests. The 52-file manual
installation staging tree was rebuilt and verified.

The corrected module passed the same copied-campaign sequence: every character
received both awards, including after saving the two character sheets. A repeated
request ID awarded only once. All totals persisted after client reload. The
observed starting totals are not evidence of correct historical XP; the fix
cannot reconstruct values overwritten by earlier awards.

The campaign test also passed with all 15 originally enabled modules installed
and active, with no browser page errors. An intermediate six-module run is not
counted as proof of the complete campaign configuration. Personal module and
campaign details remain in the local evidence.

The full release-shaped matrix passed on Foundry 13.351 (Node 22.23.2) and
14.369 (Node 24.15.0), using hyp3e 4.6.0, SocketLib 1.1.4 and Playwright 1.63.0.
Each run passed 37 GM groups, 13 player groups, 509 positive observations and
18 deliberate negative observations, plus the new formatted-XP diagnostic.
That diagnostic preserved 1,100 and 2,200 starting XP, reached 1,320/2,290 after
one award and 1,540/2,380 after two, and accepted a duplicate request only once.
Keyboard, themes, lifecycle, distributions and module disable/reload passed.

Known upstream exceptions remain separate: two core `#postNotification` errors
on v13 and ten on v14; six hyp3e equipment-compendium migration messages on
v13. The existing sanitation fixture produced its expected `/x` 404. The final
verifier accepted no unclassified browser/server errors or deprecations.

All 52 candidate files match source and generated staging bytes. Candidate
checksums, both runtime results, removed temporary licenses and freed test
ports were verified; `ACCEPTANCE.json` records the full matrix. All 586 live
world files and the preserved snapshot were rehashed unchanged after testing,
as were the live module's two XP implementation files.

## Evidence boundaries

Personal campaign records, actor names/IDs, chat history, user accounts, assets,
logs and world databases remain outside this repository under
`RuntimeTests/hyp3e-utilities/xp-investigation-2026-10-21/`. Only disposable copies
had access keys reset through Foundry's world-launch option. No campaign data or
credentials are included in the module archive.

The v14 campaign is not downgraded into v13. The v13 acceptance world uses
synthetic fixtures, including the new formatted-XP diagnostic. The release-shaped
candidate and runtime evidence are under
`RuntimeTests/hyp3e-utilities/xp-fix-candidate-2026-10-21/`.

Candidate ZIP SHA-256:
`13911d0b6f219027b79c8d4947e2e25347b019d1e15a1c68958da63dbc08d9b1`.

Public reference: [Foundry v14 Actor update API](https://foundryvtt.com/api/v14/classes/foundry.documents.Actor.html#update).
System parsing and sheet behavior were also checked against the local read-only
hyp3e 4.6.0 reference, commit `58dad834ea295436e5d8cc39a180246eb488860f`.
