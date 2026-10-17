# Changelog

All notable changes to Hyp3e Utilities are documented here.

## 1.0.3 — 2026-10-17

### Compatibility

- Validated the NPC Action HUD, Party Sheet, shared editing, treasury transfers,
  XP awards, coin splits, and wages with hyp3e 4.6.0 on Foundry 13.351 and 14.369.
- Confirmed GM and player workflows, keyboard controls, light and dark themes,
  and module enable/disable behavior.
- Updated compatibility information in the README and User Guide. Requirements,
  gameplay behavior, and saved party data are unchanged.
- The previously documented hyp3e equipment-compendium migration issue on
  Foundry 13 and Foundry chat-animation issue remain upstream limitations.

## 1.0.2 — 2026-10-16

### Compatibility

- Validated NPC rolls, the Party Sheet, shared editing, treasury transfers,
  XP awards, coin splits, and wages with the published hyp3e 4.5.0 system on
  Foundry 13.351 and 14.369.
- Updated the verified Foundry build to 14.369. Minimum requirements remain
  unchanged. The maintainer has also confirmed hyp3e 4.3.1 compatibility.
- Recorded upstream compendium-migration and chat-animation issues separately
  from the passing Utilities checks; see the User Guide for their scope.

### Maintenance

- Corrected stale test expectations and the player follower-editing fixture.
- Added repeatable generation and verification of the manual installation
  folder, including checks for stale, missing, or changed files.
- Updated the README and compatibility documentation. Gameplay behavior and
  stored party data are unchanged.

## 1.0.1 — 2026-10-01

### Fixed

- Fixed the Party Sheet saving-throw window failing to open in Foundry 13
  when preparing the available roll types.

### Documentation

- Reworked the README for players and GMs and corrected feature descriptions,
  share editing, treasury recovery, and current testing status.
- Reconciled the design and implementation plan with the current module;
  retained dated acceptance records for the versions they tested.

### Compatibility

- Existing Foundry and system requirements are unchanged. The maintainer
  confirmed hyp3e 4.3.1 compatibility. The focused saving-throw repair passed
  on Foundry 13.351 and 14.368; the automated full-matrix work recorded on
  October 1 was completed against hyp3e 4.5.0 for version 1.0.2.
- The download link now points to this version's archive so older manifests
  continue to download their matching version.

## 1.0.0 — 2026-08-16

### Added

- A configurable NPC Action HUD with reaction rolls, five-save selection,
  morale rolls, Actor-sheet access, health displays, and reset controls.
- A shared Party Sheet with Overview, Followers, Marching Order, Supplies,
  Treasure, and Notes workflows.
- Previewed and audited XP, coin, and GP-only wage distributions, including
  character XP adjustments and intentionally consumed NPC shares.
- Bidirectional Item transfers between character Actors and the managed party
  treasury.
- Party Sheet editing permissions by Foundry role or named user, with shared
  changes handled by a connected GM through SocketLib.
- Recovery, migration, localization, accessibility, lifecycle, and Foundry
  13/14 compatibility coverage.

### Changed

- Compacted Overview member rows, moved token pinging to the member portrait,
  arranged statistics as HP/AC/DR and Move/Share lines, placed a red remove
  icon after the save controls, moved member saves into the shared ApplicationV2
  save window, and made **Add Selected Actor** use the active scene's controlled
  token.
- Compacted Follower rows into HP/Move/Save/Morale/remove and
  AC/DR/Share/Wage/Save lines, and moved follower saving throws into a
  small ApplicationV2 window with save-category, situational-modifier, and
  roll-type controls. Roll actions and remove controls align to the row's right
  edge.
- Kept Shared Equipment quantity metrics and Take controls on one row, with
  clearer spacing between Quantity, Bundle, and Maximum.
- Kept all five Treasure coin-split entry fields on one desktop row.
- Made the rich-text editor's native save control persist Party and Treasure
  notes directly, removed the redundant secondary save buttons, and removed
  the internal revision counter from the Party Sheet header.
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
