# Hyp3e Utilities

Foundry Virtual Tabletop utilities for the [`hyp3e`](https://github.com/thurianknight/hyp3e) system.

## Status

The module foundation, NPC Action HUD, and Party Core are implemented. The HUD
tracks controlled NPC tokens and provides GM-only reaction, five-category save,
and morale actions. The shared Party Sheet supports authorized players, party
members, character/NPC followers, wages and shares, Actor links, token pings,
reused save/morale actions, conflict-safe local drafts, and automatic cleanup
of deleted member/follower references. Marching order, validated manual
supplies, and sanitized rich-text party/treasure notes are also implemented.
Targeted refreshes now preserve local drafts, active tabs, and scroll positions
while ignoring unrelated Actor and Item changes. The active GM also receives a
managed, flagged Party Treasury with explicit missing-Actor recovery and
duplicate selection. Its five native coin denominations appear on Treasure and
its physical embedded Items appear on Supplies through an authorized
active-GM snapshot. These features are validated on the supported Foundry and
`hyp3e` versions below; Milestone 4 is in progress.

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

For example, after changing both `module.json` and `package.json` to the target
version:

```powershell
git tag v1.0.0
git push -u origin main
git push origin v1.0.0
```

## License

Original Hyp3e Utilities software and documentation are available under the [MIT License](./LICENSE).

The MIT License does not grant rights to Foundry Virtual Tabletop, HYPERBOREA trademarks or game content, the `hyp3e` system, or other third-party software and assets. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for the applicable notices and current trademark-clearance requirement.
