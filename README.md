# Hyp3e Utilities

Keep your party organized and handle NPC rolls with fewer clicks.
Hyp3e Utilities adds an NPC Action HUD and a shared Party Sheet to the
[Hyperborea 3rd Edition](https://github.com/thurianknight/hyp3e) system for
Foundry Virtual Tabletop.

## Features

### NPC Action HUD

Select one or more NPC tokens to bring up a compact panel for the GM. From
there you can:

- roll a separate reaction for each selected NPC;
- roll Death, Device, Transformation, Avoidance, or Sorcery saves;
- check morale; and
- open an NPC's sheet by clicking its name.

Results go to GM chat. Each NPC has a health bar, and the optional detailed
view adds HP, AC, DR, movement, and morale. Drag the panel wherever it suits
your screen; its position is remembered.

<details>
<summary>See the compact and detailed NPC HUD</summary>

**Compact HUD**

<img width="1113" height="834" alt="Compact NPC Action HUD with NPC names and health bars" src="https://github.com/user-attachments/assets/82d22e33-2b43-459b-9e9c-256d5489a36b" />

**Detailed HUD**

<img width="1034" height="385" alt="Detailed NPC Action HUD with combat statistics" src="https://github.com/user-attachments/assets/2cfc0cfa-38bb-4178-a313-acf72897a6f8" />

</details>

### Shared Party Sheet

Keep the group's characters, followers, equipment, and plans in one place.

| Tab | What you can do |
| --- | --- |
| **Overview** | Review party statistics, open character sheets, ping tokens, roll saves, and award XP. |
| **Followers** | Track followers, set their shares and daily wages, roll saves and morale, and pay wages. |
| **Marching Order** | Arrange the group into Front, Middle, and Rear ranks, add notes, and post the order to chat. |
| **Supplies** | Track torches, lanterns, oil, and rations, and view shared equipment. |
| **Treasure** | Manage the party treasury, split CP/SP/EP/GP/PP, and record other valuables. |
| **Notes** | Keep shared plans and reminders. |

Open it from **Game Settings → Configure Settings → Hyp3e Utilities → Party
Sheet**, or click the users icon in the Actor Directory.

<details>
<summary>See all six Party Sheet tabs</summary>

**Overview**

<img width="930" height="1372" alt="Party Sheet Overview tab" src="https://github.com/user-attachments/assets/e3dea884-4705-499c-a796-c0a50064c495" />

**Followers**

<img width="905" height="846" alt="Party Sheet Followers tab" src="https://github.com/user-attachments/assets/f3087127-a0cb-492a-828f-51a1c46b2862" />

**Marching Order**

<img width="934" height="1479" alt="Party Sheet Marching Order tab" src="https://github.com/user-attachments/assets/663c2479-bb9e-4544-8f85-5b1762f9869a" />

**Supplies**

<img width="927" height="899" alt="Party Sheet Supplies tab" src="https://github.com/user-attachments/assets/97a90ba5-19d1-4c6f-a0d0-198bb406b128" />

**Treasure**

<img width="1926" height="1507" alt="Party Sheet Treasure tab" src="https://github.com/user-attachments/assets/af79a45e-348c-4857-b2f3-6e823f6d4db7" />

**Notes**

<img width="927" height="420" alt="Party Sheet Notes tab" src="https://github.com/user-attachments/assets/9a687487-a8b9-43f1-953b-b921a6c1c53b" />

</details>

### Shared equipment, XP, and coins

Move loose weapons, armour, shields, and ordinary items between characters and
the party treasury. Use the **Move to Party Treasury** icon on a character
sheet, or drag items into Supplies. To take an item, choose a character and
click **Take**.

Preview XP awards, coin splits, and follower wages before confirming them.
Character XP bonuses and penalties are included automatically, and leftover
coins stay in the treasury. Completed distributions and item transfers are
recorded in chat so everyone can follow what changed.

## Requirements

- Foundry Virtual Tabletop 13 or 14
- Hyperborea 3rd Edition (`hyp3e`) 4.0.3 or newer
- [SocketLib](https://foundryvtt.com/packages/socketlib) 1.1.4 or newer

Full testing with `hyp3e` 4.3.1 is still in progress. See the
[User Guide](docs/user-guide.md) for tested versions and detailed instructions.

## Installation

1. Open Foundry's **Add-on Modules** screen and select **Install Module**.
2. Paste this address into **Manifest URL**:

   ```text
   https://github.com/DT357/hyp3e-utilities/releases/latest/download/module.json
   ```

3. Select **Install**.
4. Open your Hyperborea world, choose **Manage Modules**, and enable
   **Hyp3e Utilities**. Accept the SocketLib dependency prompt if shown.
5. Reload the world when prompted.

For manual installation, download `hyp3e-utilities.zip` from the
[latest release](https://github.com/DT357/hyp3e-utilities/releases/latest),
then extract it so `module.json` is inside your Foundry user-data folder at
`Data/modules/hyp3e-utilities/module.json`. Restart Foundry and enable the module.

Back up your world before updating. Use Foundry's normal **Update** button to
install later releases.

## First-Time Setup

As a GM:

1. Open **Game Settings → Configure Settings → Hyp3e Utilities**.
2. Enable the NPC Action HUD if desired and choose whether it displays detailed
   NPC information.
3. Open **Party Sheet Permissions** and choose who may edit shared party data.
4. Open the Party Sheet and confirm that the Treasure tab reports a ready Party
   Treasury.
5. Add party members on Overview and drag followers onto Followers. Set each
   follower's share and daily GP wage, then choose **Save**. Members start with
   one share; their shares are displayed but cannot be edited in the sheet.

## Playing Together

The GM chooses who can edit the Party Sheet, either by Foundry role or by
selecting individual players. Everyone else can view the party information;
treasury coins and equipment are visible only to editors.

Players need ownership of a character to add it or move its items. A GM must
stay connected for players to save shared changes. The NPC HUD, Party Sheet
saves and morale, and XP awards are GM-only.

## Things to Know

- Supply counts are entered by hand; the module does not track time or consume
  torches, oil, or rations automatically.
- Follower wages use GP only. Paying wages deducts GP from the treasury without
  adding it to the follower's sheet.
- NPC followers can receive a share of XP or coins in the split, but those
  amounts are not added to their sheets.
- Containers cannot be transferred, even when empty. Move supported loose
  items individually.
- Party and treasure notes are shared with viewers, so keep GM secrets elsewhere.
- English is the only included language.

## Support

If the HUD is missing, check that it is enabled, you are logged in as GM, and
you have selected an NPC token. If players cannot save changes, check their
Party Sheet permissions and that a GM is connected.

The [User Guide](docs/user-guide.md) covers each workflow and common problems.
Report bugs through the
[GitHub issue tracker](https://github.com/DT357/hyp3e-utilities/issues), including
your Foundry, Hyperborea, SocketLib, and Hyp3e Utilities versions, what you were
trying to do, and any error message you saw.

## License and Notices

Original Hyp3e Utilities software and documentation are available under the
[MIT License](LICENSE).

The license does not grant rights to Foundry Virtual Tabletop, HYPERBOREA
trademarks or game content, the `hyp3e` system, or other third-party software
and assets. See [Third-Party Notices](THIRD_PARTY_NOTICES.md).
