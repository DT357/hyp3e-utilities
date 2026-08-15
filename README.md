# Hyp3e Utilities

Foundry Virtual Tabletop utilities for the [`hyp3e`](https://github.com/thurianknight/hyp3e) system.

## Status

The planned 1.0 feature set is implemented and has passed clean-world GM/Player
testing on both supported Foundry generations. The repository is in final
documentation, packaging, and acceptance hardening; no public 1.0 release has
been authorized or published yet.

Core features include:

- a GM-only NPC Action HUD for reaction, five-category save, and morale rolls;
- a shared, permission-controlled Party Sheet with members, character/NPC
  followers, marching order, supplies, and sanitized shared notes;
- a managed Party Treasury with all five coin denominations, bidirectional
  loose-Item transfers, explicit recovery, and audit chat cards; and
- previewed XP, coin, and GP-wage distributions with character writeback,
  NPC-share consumption, rollback, idempotency, and public reporting.

## Compatibility

- Foundry Virtual Tabletop 13–14 (verified against 13.351 and 14.365)
- Hyperborea 3rd Edition (`hyp3e`)
- SocketLib 1.1.4 or newer

## Getting Started

The [User Guide](docs/user-guide.md) covers installation, permissions, the NPC
Action HUD, every Party Sheet workflow, distributions, Item transfers,
recovery, and current limitations.

## Development

The local development workspace keeps two read-only references beside this
repository:

- `../References/hyp3e` — the official system's `dev` branch
- `../References/sw-utilities` — the earlier Swords & Wizardry utility module

Run the local checks with:

```powershell
npm run check
```

To refresh the system reference without creating a merge commit:

```powershell
git -C ..\References\hyp3e pull --ff-only origin dev
```

## Releases

The GitHub Actions workflow validates every push and pull request. A tag
matching `v<module.json version>` creates a GitHub release containing:

- `module.json`, used by Foundry's manifest installer and updater
- `hyp3e-utilities.zip`, containing the installable module

Release tags publish externally. Create one only after the acceptance gate has
passed and publication has been explicitly authorized. After changing both
`module.json` and `package.json` to the authorized target version:

```powershell
git tag v1.0.0
git push -u origin main
git push origin v1.0.0
```

## License

Original Hyp3e Utilities software and documentation are available under the [MIT License](./LICENSE).

The MIT License does not grant rights to Foundry Virtual Tabletop, HYPERBOREA trademarks or game content, the `hyp3e` system, or other third-party software and assets. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for the applicable notices and current trademark-clearance requirement.
