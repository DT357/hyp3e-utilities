# Test Suite

The automated suite uses the Node.js built-in test runner and requires no installed test framework.

## Layout

- `unit/`: Pure calculations, validation, normalization, and other logic that must not depend on Foundry globals.
- `integration/`: Interactions between module services and mocked Foundry adapters. These tests still run in Node and must not require a live Foundry process.
- `helpers/`: Small utilities shared by automated tests.
- `fixtures/`: Minimal, synthetic documents shaped like the supported `hyp3e` schema.

Tests that require a running Foundry world are manual compatibility tests. Record their environment and results under `docs/test-runs/`; do not make `npm test` depend on a local Foundry installation or personal world data.

Run all automated tests with:

```powershell
npm test
```

Run the full repository validation with:

```powershell
npm run check
```
