# hyp3e 4.6.0 compatibility validation

Date: 2026-10-17

Scope: validate the supplied hyp3e 4.6.0 reference, then commit and release
Utilities 1.0.3 on GitHub if acceptance passes.

Status: **PASS — Utilities 1.0.2 baseline and final 1.0.3 archive passed.**

## Exact inputs

- Read-only system reference: tag `v4.6.0`, commit
  `58dad834ea295436e5d8cc39a180246eb488860f`.
- Runtime system: published hyp3e 4.6.0 ZIP, SHA-256
  `ceb4a84b41ccc12b1aba0aa6335d50b439d13b0c8078e06ef9a7e0abc5b9b315`.
- All 349 archive files shared with the reference match after line-ending
  normalization. The 35 archive-only files include compiled packs and the
  previously recorded upstream archive metadata; no system files were edited.
- Foundry 13.351 with Node 22.23.2; Foundry 14.369 with Node 24.15.0.
  Portable core installations were discovered locally and remained read-only.
- SocketLib 1.1.4; Playwright 1.63.0; separate disposable GM/player worlds.
- Utilities baseline: version 1.0.2, commit
  `d0fdd28ea70b474dc3a1969e106feb44297588b2`.

## Baseline acceptance

Both cores passed the complete matrix: 37 GM diagnostic groups, 13 player
groups, 509 positive boolean observations, and 18 explicit negative
observations per run. Tests include NPC reactions/saves/morale, synthetic-Actor
identity, permissions, malformed requests, concurrent/stale edits, treasury
recovery, transfers, XP/coin/wage distributions, and exact cleanup restoration.
Keyboard navigation, visible focus, labels, light/dark themes, minimize/restore,
close, and module disable/reload passed for GM and player clients.

No production behavior change is needed for hyp3e 4.6.0. The version update
changes metadata and compatibility documentation; gameplay and saved party data
remain unchanged. All 253 local tests passed before preparing 1.0.3.

## Error disposition

- Foundry 13 reports the existing hyp3e equipment-compendium migration error:
  one JournalEntry was saved by a newer core. Three migrations produce six
  error/warning lines in the baseline run. It occurs during system startup
  before Utilities is enabled and remains an upstream issue.
- Core `ChatLog.#postNotification` can fail while notifications are deleted or
  themes change. Five matching errors occurred on each core in the baseline.
  The October 16 control runs reproduced this with all modules disabled on
  the same core builds; the system update does not change that core code.
- Deliberate permission/stale-data/missing-document rejection notices and one
  `/x` 404 per core from the hostile-image sanitation fixture are expected.
- Headless software-rendering warnings are recorded separately. No unclassified
  browser warning/error, server warning/error, or deprecation is accepted.

## Evidence and reproducibility

Workspace evidence is retained outside the repository:

- `RuntimeTests/hyp3e-utilities/inputs/hyp3e-4.6.0/`: extracted published system
  and identity/source comparison.
- `RuntimeTests/hyp3e-utilities/4.6.0-baseline-2026-10-17/`: version 1.0.2 ZIP,
  checksums, independent extraction, 52-file hashes, screenshots, diagnostic
  payloads, browser/server logs, and `ACCEPTANCE.json`.
- Baseline run IDs: `v13-2026-10-17T13-33-05-702Z` and
  `v14-2026-10-17T13-35-23-484Z`.

`Scratch/validate-utilities-460.mjs` runs the unchanged repository diagnostics
and shared UI checks. `Scratch/verify-utilities-460.mjs` independently checks
all diagnostic observations, expected errors, candidate/source/staging hashes,
archive checksums, removed temporary license files, and released test ports.
`Scratch/package-utilities-validation.ps1` creates the archive from the validated
generated installation folder and extracts the exact ZIP for runtime use.

All baseline-owned servers and browsers stopped; ports 33413/33414 are free.
The temporary license copies were removed. The reference, active system,
sibling packages, and live worlds were not changed.

## Final 1.0.3 archive acceptance

The versioned candidate was rebuilt from the canonical release allowlist,
archived, independently extracted, and installed into new disposable worlds.
The entire matrix ran again with version 1.0.3 on both cores.

| Gate | Foundry 13.351 | Foundry 14.369 |
| --- | --- | --- |
| GM / player diagnostic groups | 37 / 13 passed | 37 / 13 passed |
| Positive / expected negative observations | 509 / 18 | 509 / 18 |
| XP, coins, wages, transfers, restoration | Passed | Passed |
| Keyboard, focus, labels, light/dark themes | Passed | Passed |
| Minimize, restore, close, disable/reload | Passed | Passed |
| Known core chat-animation errors | 5 | 5 |
| Known system equipment-migration error/warning lines | 6 | 0 |
| Unclassified warnings/errors or deprecations | 0 | 0 |
| Copied licenses removed; owned ports released | Passed | Passed |

Final run IDs:

- `v13-2026-10-17T13-41-00-399Z`
- `v14-2026-10-17T13-43-46-821Z`

Evidence root:
`RuntimeTests/hyp3e-utilities/1.0.3-candidate-2026-10-17/`.

- Candidate ZIP SHA-256: `921497e071a401ad826196934357f44a735a45c8d405ab53338c0363d8df6e31`.
- Manifest SHA-256: `9145ae4778e9432e14b2e29ce17efc66e2f0e643d63df5995f5a1b0d5e0a0b1a`.
- `ACCEPTANCE.json` records the independent final audit. All 52 extracted files
  match the repository and generated installation folder byte-for-byte.
- `npm run check` passed 253 tests, syntax/manifest checks, and staging rebuild
  and validation. Relative documentation links and `git diff --check` passed.
- Production runtime files are unchanged from 1.0.2. The reference remains
  clean at `58dad834ea295436e5d8cc39a180246eb488860f`.
