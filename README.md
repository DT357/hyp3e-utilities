# Hyp3e Utilities

Foundry Virtual Tabletop utilities for the [`hyp3e`](https://github.com/thurianknight/hyp3e) system.

## Status

The module foundation and NPC Action HUD are under active development. The HUD
currently tracks controlled NPC tokens, displays their core combat statistics,
opens exact token Actor sheets, and sends GM-only reaction, five-category save,
and morale results. Its draggable position is persisted per client, resettable
from module settings, and clamped to the current viewport. These features are
validated on the supported Foundry and `hyp3e` versions below.

## Compatibility

- Foundry Virtual Tabletop 13–14 (verified against 13.351 and 14.365)
- Hyperborea 3rd Edition (`hyp3e`)
- SocketLib 1.1.4 or newer

## Development

The local development workspace keeps two read-only references beside this repository:

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

The GitHub Actions workflow validates every push and pull request. A tag matching `v<module.json version>` creates a GitHub release containing:

- `module.json`, used by Foundry's manifest installer and updater
- `hyp3e-utilities.zip`, containing the installable module

For example, after changing both `module.json` and `package.json` to version `0.1.0`:

```powershell
git tag v0.1.0
git push -u origin main
git push origin v0.1.0
```

## License

Original Hyp3e Utilities software and documentation are available under the [MIT License](./LICENSE).

The MIT License does not grant rights to Foundry Virtual Tabletop, HYPERBOREA trademarks or game content, the `hyp3e` system, or other third-party software and assets. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for the applicable notices and current trademark-clearance requirement.
