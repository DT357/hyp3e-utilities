# Hyp3e Utilities

Hyp3e Utilities adds streamlined encounter and party-management tools to the
[Hyperborea 3rd Edition](https://github.com/thurianknight/hyp3e) system for
Foundry Virtual Tabletop.

## Requirements

- Foundry Virtual Tabletop 13 or 14
- `hyp3e` 4.0.3 or newer
- [SocketLib](https://foundryvtt.com/packages/socketlib) 1.1.4 or newer

The module is verified with Foundry 13.351 and 14.365, `hyp3e` 4.0.3 and 4.1.0,
and SocketLib 1.1.4.

## Installation

1. Open Foundry's **Add-on Modules** screen.
2. Select **Install Module**.
3. Paste this manifest URL into **Manifest URL**:

   ```text
   https://github.com/DT357/hyp3e-utilities/releases/latest/download/module.json
   ```

4. Select **Install**.
5. Open an existing `hyp3e` world, choose **Manage Modules**, and enable
   **Hyp3e Utilities**. Accept Foundry's SocketLib dependency prompt if shown.
6. Reload the world when prompted.

Foundry's normal **Update** action can install later releases. For a manual
installation, download `hyp3e-utilities.zip` from the
[latest release](https://github.com/DT357/hyp3e-utilities/releases/latest),
extract it into `<Foundry Data>/Data/modules/hyp3e-utilities`, and restart
Foundry.

## Features

### NPC Action HUD

The module provides a GM-only HUD for quick NPC actions on Foundry scenes.
The NPC HUD allows GMs to quickly perform the following actions for each
selected NPC Actor:

- one reaction roll per selected NPC;
- Death, Device, Transformation, Avoidance, and Sorcery saving throws;
- morale rolls; and
- each selected NPC's Actor sheet.

Each selected NPC provides a health gradient bar to display current HP
at-a-glance. There is also an additional setting to display more detailed
information for each NPC, adding HP, AC, DR, movement, and morale scores to the
selected NPC information cards.

### Shared Party Sheet

The Party Sheet provides six coordinated tabs:

- **Overview** — party membership, compact combat statistics, token pinging,
  saving throws, shares, and XP distribution.
- **Followers** — character or NPC followers, shares, GP wages, saving throws,
  morale, and wage settlement.
- **Marching Order** — Unassigned, Front, Middle, and Rear groups with drag,
  keyboard controls, rank notes, and a public chat report.
- **Supplies** — manual torch, lantern, oil, and ration tracking plus shared
  treasury equipment.
- **Treasure** — a managed party treasury, all five `hyp3e` coin denominations,
  coin distribution, and rich-text treasure notes.
- **Notes** — shared, sanitized rich-text plans and reminders.

Open the Party Sheet from **Game Settings → Configure Settings → Hyp3e
Utilities**, or use the users icon added to the Actor Directory.

### Party Treasury and Item Transfers

An active GM initializes one managed Party Treasury Actor. Authorized users can
move supported loose weapons, armour, shields, and ordinary items between owned
character Actors and the treasury. Quantity, bundle, and maximum values are
preserved, and successful transfers create public audit chat cards.

### XP, Coin, and Wage Distribution

The Party Sheet previews distributions before confirmation:

- Character XP awards apply the receiving Actor's XP bonus or penalty and are
  written to its sheet.
- CP, SP, EP, GP, and PP awards are written to character purses; integer
  remainders stay in the Party Treasury.
- NPC XP and coin shares are consumed without NPC-sheet writeback.
- Follower wages deduct saved GP amounts from the Party Treasury.

Confirmed transactions create public reports and use revision checks,
idempotency, and rollback protection against partial writes.

### Configurable Party Sheet Permissions

GMs can grant editing by minimum Foundry role, by named user, or both. Other
players retain read-only Party Sheet access. Actor ownership is still enforced
for adding Actors and transferring Items, and an active GM is required for
player-initiated shared operations.

## First-Time Setup

After enabling the module:

1. Open **Game Settings → Configure Settings → Hyp3e Utilities**.
2. Enable the NPC Action HUD if desired and choose whether it displays detailed
   NPC information.
3. Open **Party Sheet Permissions** and choose who may edit shared party data.
4. Open the Party Sheet and confirm that the Treasure tab reports a ready Party
   Treasury.
5. Add party members and followers, then configure their shares and wages.

The [User Guide](docs/user-guide.md) contains detailed instructions for every
workflow, recovery options, troubleshooting, and current limitations.

## Support

Report reproducible problems through the
[GitHub issue tracker](https://github.com/DT357/hyp3e-utilities/issues). Include
the Foundry, `hyp3e`, SocketLib, and Hyp3e Utilities versions, relevant console
errors, and steps that reproduce the issue.

## License and Notices

Original Hyp3e Utilities software and documentation are available under the
[MIT License](LICENSE).

The license does not grant rights to Foundry Virtual Tabletop, HYPERBOREA
trademarks or game content, the `hyp3e` system, or other third-party software
and assets. See [Third-Party Notices](THIRD_PARTY_NOTICES.md).
