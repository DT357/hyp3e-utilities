# Changelog

All notable changes to Hyp3e Utilities are documented here.

## 1.0.0 — 2026-08-15

### Added

- A configurable NPC Action HUD with multi-NPC attacks, five-save selection,
  checks, reaction rolls, damage, and reset controls.
- A versioned Party Sheet with Overview, Members, Followers, Supplies,
  Treasure, and Notes workflows.
- Previewed and audited XP, coin, and GP-only wage distributions, including
  character XP adjustments and intentionally consumed NPC shares.
- Bidirectional Item transfers between character Actors and the managed party
  treasury.
- Role-level and explicit-user Party Sheet editing permissions through
  SocketLib-authoritative GM mutations.
- Recovery, migration, localization, accessibility, lifecycle, and Foundry
  13/14 compatibility coverage.

### Changed

- Compacted Overview member rows, moved token pinging to the member portrait,
  arranged statistics as HP/AC/DR and Move/Share lines, placed a red remove
  icon after the save controls, and made **Add Selected Actor** use the active
  scene's controlled token.
- Compacted Follower rows with portrait pinging, save and morale controls on
  the HP/AC/DR line, Move/Share/Wage controls on the lower line, and a final
  red remove icon.
- Replaced the full-width character-sheet **To Party** controls with accessible
  dolly icons inside the native item-action clusters.
- Kept XP, coin, and wage preview inputs out of the Party Sheet's unsaved-draft
  warning while preserving their dedicated confirmation and stale-preview flow.
- Prevented Foundry's default list-item margin from making the final compact
  NPC HUD card taller than its siblings.
- Added a per-client, default-on **Display Detailed NPC Information** option
  that switches NPC Action HUD cards between two-line statistics and a compact
  name-and-health-bar-only layout.
- Compacted the NPC Action HUD controls and selected-NPC cards, including
  three- to four-column card flow, two-line stats, subtype removal, and
  Actor-button health bars.
- Made NPC action chat-card emphasis inherit the active chat theme while
  suppressing decorative text shadows.

### Compatibility

- Foundry Virtual Tabletop 13 through 14.
- `hyp3e` 4.0.3 or newer.
- SocketLib 1.1.4 or newer (required).

See the [User Guide](docs/user-guide.md) for setup, operating instructions,
limitations, and troubleshooting.
