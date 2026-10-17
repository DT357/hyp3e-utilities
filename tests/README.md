# Test Suite

The automated suite uses the Node.js built-in test runner and requires no installed test framework.

## Layout

- `unit/`: Pure calculations, validation, normalization, and other logic that must not depend on Foundry globals.
- `integration/`: Interactions between module services and mocked Foundry adapters. These tests still run in Node and must not require a live Foundry process.
- `helpers/`: Small utilities shared by automated tests.
- `fixtures/`: Minimal, synthetic documents shaped like the supported `hyp3e` schema.

Tests that require a running Foundry world are manual compatibility tests. Record their environment and results under `docs/test-runs/`; do not make `npm test` depend on a local Foundry installation or personal world data.

Reaction boundaries, reaction/save/morale batch planning, the chat service,
the controlled-NPC selection controller, and the NPC Action HUD overlay are
covered by pure tests with injected Foundry APIs. The Foundry diagnostic
additionally verifies the planners, actual GM-whisper chat messages, live
canvas selection, overlay rendering, and UI actions against prepared `hyp3e`
Actor data in both supported Foundry generations.

The test-only module under `foundry/diagnostics/` exercises Foundry document,
ApplicationV2, SocketLib, and production-foundation behavior and publishes its
results to the browser.
Link or copy that directory into a disposable Foundry data path as the module
`hyp3e-utilities-diagnostics`. It is intentionally excluded from release
packages.

Run all automated tests with:

```powershell
npm test
```

Run the full repository validation with:

```powershell
npm run check
```

The full check also rebuilds and validates the ignored
`foundry_module/hyp3e-utilities/` manual-installation folder from
`scripts/release-files.txt`. Use `npm run stage` to rebuild it separately or
`npm run stage:check` to verify its exact file set and contents without
replacing it. Never edit generated staging files.

For the runtime companion, connect the Player named
`Hyp3e Utilities Compatibility Player`; the GM diagnostic grants that account
editing access and creates its real follower fixture. Wait for
`Hyp3eUtilitiesCompatibility.playerCleanupComplete === true` on the GM before
starting distribution tests. A `complete` status alone does not prove success:
review individual assertions and distinguish deliberate rejected requests from
unexpected failures. Current evidence and upstream-console dispositions are in
[the 4.6.0 validation record](../docs/test-runs/2026-10-17-hyp3e-460-validation.md).
