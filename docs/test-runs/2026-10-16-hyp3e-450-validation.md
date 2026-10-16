# hyp3e 4.5.0 validation and Utilities 1.0.2 candidate

Date: 2026-10-16

Original scope: validate the newest published system and prepare a local release
candidate. Publication was outside that validation request. The maintainer
subsequently authorized the 1.0.2 GitHub release on October 16; this record
preserves the exact local candidate and runtime evidence before publication.
The subsequent [publication record](2026-10-16-v1.0.2-release.md) identifies
the released archive and the documentation-only changes made after this run.

Result: **PASS for Utilities; 1.0.2 prepared locally.** The upstream findings
below remain visible and are excluded only after separate control testing or
source attribution. No Utilities runtime behavior was changed.

## Exact targets

- Utilities baseline: 1.0.1, clean `main` at
  `8803e971945a7bc627aaf0d59d9d5349ae3890be`.
- Candidate: 1.0.2. Production JavaScript, templates, styles, localization, and
  stored-data formats are unchanged. Changes affect documentation, manifest
  metadata, diagnostic fixtures, and manual-installation staging.
- System: official published [hyp3e v4.5.0](https://github.com/thurianknight/hyp3e/releases/tag/v4.5.0),
  tag commit `0a7f19db3025e0062f239cdf689e64cb3a061962`.
- Downloaded `hyp3e.zip` SHA-256:
  `ce1a49ac4dc41c87787dbe8a2f7c38d578450fc0787fdb224a3867c0d0bb4a92`.
- Foundry 13.351 / Node 22.23.2 and Foundry 14.369 / Node 24.15.0;
  SocketLib v1.1.4 and Playwright versions captured in each environment record.
- Official development branch observed at
  `5501f26d3db795eb27c114af9df644aa8628ea30`; the workspace reference remains
  unchanged at `3439d5f971e36e8537bbf604b35aee27811dcd2d`.
  Neither development checkout was substituted for the published test target.

## Coverage and diagnostic repairs

The GM/player diagnostic matrix exercises prepared saves and Active Effects,
synthetic Actor identity, NPC reactions/saves/morale, HUD placement and
lifecycle, Party Sheet permissions, concurrent requests and stale edits,
marching order, supplies, notes, treasury recovery, and bidirectional Item
transfers. Distribution checks verify exact XP/coin/wage balances, duplicate
request behavior, audit messages, and fixture restoration.

The old diagnostic expected a removed revision counter and spaced HP text.
It now checks the editing status and current compact HP display. PAR-009 now
uses a real, observable follower Actor; the runner connects the diagnostic
Player that the GM explicitly grants access. Setup failure produces a clear
error, and the runner waits for GM fixture cleanup before the next suite.
HUD-006 completed on both cores without changing production HUD code.

Playwright checks additionally cover Arrow/Home/End tab navigation, retained
focus, accessible panel relationships, visible focus, localization, light and
dark themes at 1280×800, minimize/restore/close, and module disable/reload.
Character/NPC save dialogs and their actual GM-only chat output are exercised
by the production-action diagnostic; the 1.0.1 roll-mode regression remains
in the local suite.

Every reported boolean is reviewed. Expected false observations are limited
to deliberate authorization/payload/concurrency rejection, completed waiting
flags, world-Actor identity, player role, and the fact that an unoverridden
synthetic Actor follows its base Actor. Unexpected false assertions fail the
runner; a `complete` status alone is insufficient.

## Console and upstream findings

- Foundry 13 cannot fully migrate one record in the published system's
  `hyp3e-equipment-lists` pack because its embedded data was saved in a newer
  core generation. The world starts and the Utilities matrix completes.
  The published system package was not changed to hide this issue.
- Both cores can throw `Cannot set properties of null (setting 'hidden')`
  from core `ChatLog.#postNotification` during rapid message removal/theme
  changes. A control world with **all modules disabled** reproduces the same
  stack on each core. An attempted diagnostic rendering wait did not remove
  it and was discarded; Utilities does not patch or suppress the error.
- The initial v14 runner tried an obsolete login control. Another attempt
  reached the world before core invitation-address discovery finished; the
  runner now waits before joining. These failed attempts are retained and
  are not acceptance passes.
- Headless software-rendering warnings and deliberate invalid-action,
  stale-edit, and missing-token notices are recorded separately. Unrecognized
  script errors or deprecation warnings fail acceptance.
- The single `/x` HTTP 404 on each core is the deliberately invalid image URL
  in the diagnostic HTML-sanitization fixture, not a missing module asset.

These upstream findings qualify the environment; they are not Utilities
regressions. No claim of an entirely error-free Foundry/system installation
is made.

## Evidence and release boundary

Raw evidence stays outside the repository under
`RuntimeTests/hyp3e-utilities/`:

- `inputs/hyp3e-4.5.0/`: downloaded official archive and manifest.
- `4.5.0-baseline-2026-10-16/`: initial diagnostic/environment failures.
- `4.5.0-diagnostics-2026-10-16/`: passing functional GM/player runs.
- `4.5.0-ui-2026-10-16/`: UI coverage and unresolved core-console experiments.
- `4.5.0-core-control-2026-10-16/`: matching errors with every module disabled.
- `1.0.2-candidate-2026-10-16/`: final ZIP, checksum list, extracted candidate,
  per-file hashes, environment records, screenshots, and final run results.

The final candidate is built from `scripts/release-files.txt`, independently
extracted, and compared byte-for-byte with source and generated staging before
runtime use. `npm run check` now rebuilds and validates the ignored
`foundry_module/hyp3e-utilities/` directory. Separate `stage` and `stage:check`
commands are available; regression tests cover obsolete files, modified or
missing content, extras, version drift, and invalid allowlist paths.

## Final exact-archive acceptance

| Gate | Foundry 13.351 | Foundry 14.369 |
| --- | --- | --- |
| GM diagnostic groups | 37 passed | 37 passed |
| Player diagnostic groups | 13 passed | 13 passed |
| Boolean review | 509 true observations; 18 expected false cases | Same |
| XP, five-denomination coins, GP wages, and restoration | Passed | Passed |
| Keyboard, focus, panel labels, light/dark themes, window lifecycle | Passed | Passed |
| Module disable and reload, GM and Player | Passed | Passed |
| Unknown script errors / deprecation warnings | 0 / 0 | 0 / 0 |
| Separately reproduced core chat-animation errors | 7 | 7 |

Playwright 1.63.0 drove both final runs:

- `v13-2026-10-16T05-55-42-553Z`
- `v14-2026-10-16T05-58-41-057Z`

The 253 local tests pass on Node 22.23.2 and Node 24.15.0. The complete local
check, manifest/syntax checks, staging rebuild/validation, Markdown-link scan,
and `git diff --check` pass. All 52 release files match source, generated
staging, and the independently extracted ZIP. The README retains its eight
screenshots and end-user language.

Release files in `1.0.2-candidate-2026-10-16/release/`:

- `hyp3e-utilities.zip` SHA-256:
  `10d2ef0f77c071551170c42b959e76d86c8cd711f7f0ea44963f553b752954bc`
- `module.json` SHA-256:
  `e617b8e81d99e10063b91d5ca498c6d233bb6c37d1169c681f9a3550ec3dcf72`
- `SHA256SUMS.txt` contains both independently verified checksums.

`ACCEPTANCE.json` and `package-verification.json` capture the final results.
Ports 33413 and 33414 are free, and no copied license remains in any run from
this work item. The maintained installation tree is
`hyp3e-utilities/foundry_module/hyp3e-utilities/`.

The workspace orchestration is retained in `Scratch/validate-utilities-450.mjs`
with `utilities-assert-diagnostics.mjs` and `utilities-ui-checks.mjs`. The
final run used `$env:UTILITIES_OUTPUT = '1.0.2-candidate-2026-10-16'` followed
by `node Scratch/validate-utilities-450.mjs` from the workspace root, after
extracting the candidate archive. `Scratch/verify-utilities-102.mjs` and
`Scratch/finalize-utilities-102.mjs` perform the final artifact/result audits.

The validation task performed no commit, push, tag, GitHub release, live
deployment, or Foundry package publication. No live world or sibling package
was modified. Owned test servers/browsers were stopped, ports were checked
free, and copied license files were removed after each completed run.
