# QA-001 final acceptance and regression

Date: 2026-08-15

Result: `PASS`

Candidate: Hyp3e Utilities 1.0.0 at source commit `049762a`

## Acceptance coverage

| Gate | Evidence reviewed or rerun | Result |
| --- | --- | --- |
| Foundation and system adaptation | PB/FND work records, adapter/settings/compatibility/transport suites | Pass |
| NPC Action HUD | HUD-001–HUD-008 records, Foundry 13/14 smoke matrices, reaction/save/morale/selection/lifecycle suites | Pass |
| Party Sheet core | PAR-001–PAR-010 records, two-client authorization/concurrency matrices, party state/app suites | Pass |
| Marching, supplies, and notes | MAR/SUP/NOT/REF records, live two-client workflow matrices, localization and accessibility suites | Pass |
| Managed treasury and Items | TRY/ITM records, bidirectional live transfer matrix, rollback/recovery suites | Pass |
| XP, coins, and wages | XP/COIN/WAGE/DST records, final two-client distribution matrix, conservation/idempotency suites | Pass |
| 1.0 hardening | HRD-001–HRD-005 migration, authorization, accessibility, performance, lifecycle, and clean-world evidence | Pass |
| Documentation | README, user guide, changelog, local-link scan, DOC-001 record | Pass |
| Release candidate | PKG-001 archive/install evidence, source/payload comparison, checksums, CI artifact | Pass |

The final release payload contains 51 files. Every file hash in the canonical
source payload matched the local staging tree, both recorded SHA-256 values
verified, and the exact ZIP was discovered as Hyp3e Utilities 1.0.0 by Foundry
14.365 in a new disposable data root.

The full clean-world runtime matrix had already passed with the same production
code on Foundry 13.351 / `hyp3e` 4.0.3 and Foundry 14.365 / `hyp3e` 4.1.0.
Only version metadata, release documentation, and packaging automation changed
after that matrix. The exact 1.0.0 archive then passed the clean package
discovery gate.

## Automated regression

Final local `npm run check` result before QA closure:

- 236 tests passed;
- 0 failed, skipped, cancelled, or todo tests;
- production entry-point syntax passed;
- both Foundry diagnostic entry-point syntax checks passed; and
- module manifest validation passed for version 1.0.0.

The suite includes adversarial authorization and payload validation; released
schema migrations; injected write, audit, and compensation failures; duplicate
request idempotency; large-party/treasury performance; repeated application
lifecycle cleanup; accessibility; localization; and release-workflow guards.

All repository-local Markdown links resolve. No tracked production or
documentation `TODO`, `FIXME`, `XXX`, or `HACK` marker remains.

GitHub Actions run 55 for commit `049762a` completed successfully in 16
seconds. Its package job produced one private
`hyp3e-utilities-release-candidate` artifact; its release job was skipped.

## Repository and publication controls

- Local `HEAD`, local `origin/main`, and remote `refs/heads/main` all resolved
  to `049762a` before this QA record was added.
- The worktree was clean before QA documentation changes.
- No local or remote tag existed.
- The public repository reported that it had no releases.
- Disposable Foundry ports 33383, 33384, and 33394 were clear after testing.
- One orphaned QA-started Foundry Node process was identified after its port
  closed and was stopped; only the Codex browser-control runtime remained.

## Defect disposition

| Severity | Open product defects | Disposition |
| --- | ---: | --- |
| Critical | 0 | Gate passes |
| High | 0 | Gate passes |
| Medium | 0 | None deferred |
| Low | 0 | None deferred |

Two documentation-drift findings were corrected during QA: obsolete planned
test filenames and the old 0.5.0 compatibility-gate summary. Neither affected
runtime behavior.

The limitations in the user guide are accepted 1.0 scope decisions, not open
defects: one party per world, manual supplies, GP-only wages without Actor-side
credit, unsupported container transfers, NPC share consumption without NPC
writeback, deferred loyalty rolls, and the supported Foundry/system range.

Foundry's small-viewport and unreachable-content-service warnings and the
Foundry 13 `hyp3e` Actor Sheet context-menu migration warning are environmental
or upstream findings already dispositioned in the compatibility records.

## Remaining external gate

The source release candidate is accepted. `REL-001` remains
`AUTHORIZATION REQUIRED`: no version tag or release may be created until
publication is explicitly authorized. After publication, that gate must verify
the published checksums and live-manifest install/update path in a new
disposable Foundry data directory.
