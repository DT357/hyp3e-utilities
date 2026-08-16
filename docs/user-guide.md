# Hyp3e Utilities User Guide

Hyp3e Utilities adds a GM-only NPC Action HUD and a shared Party Sheet to the
Hyperborea 3rd Edition (`hyp3e`) Foundry system. The Party Sheet can be viewed
by players and edited by GMs, configured role levels, or specifically granted
users.

The supported release matrix is Foundry VTT 13–14, `hyp3e` 4.0.3 or newer,
and SocketLib 1.1.4 or newer. The verified combinations are Foundry 13.351 with
`hyp3e` 4.0.3 and Foundry 14.365 with `hyp3e` 4.1.0.

## Installation

1. Back up the world before installing or updating any module.
2. Install and enable the `hyp3e` system.
3. Install SocketLib 1.1.4 or newer from Foundry's Add-on Modules screen.
4. On the Add-on Modules screen, choose **Install Module** and enter:

   ```text
   https://github.com/DT357/hyp3e-utilities/releases/latest/download/module.json
   ```

5. Launch the `hyp3e` world, open **Manage Modules**, enable **Hyp3e
   Utilities**, and accept Foundry's SocketLib dependency prompt if it appears.
6. Reload the world when Foundry asks.

The manifest URL becomes available when an authorized public release is
published. For a private release-candidate test, extract the supplied
`hyp3e-utilities.zip` into `<Foundry Data>/Data/modules/hyp3e-utilities`, then
restart Foundry and complete steps 5–6.

Use Foundry's normal **Update** action for later public versions. Do not rename
the installed `hyp3e-utilities` directory; its name must match the module ID.

## First-Time GM Setup

1. Log in as a GM. Player-initiated Party Sheet operations require an active
   GM client.
2. Open **Game Settings → Configure Settings → Hyp3e Utilities**.
3. Enable **NPC Action HUD** if the GM wants token-selection actions.
4. Leave **Display Detailed NPC Information** enabled for two-line NPC
   statistics, or disable it for compact name-and-health-bar-only cards.
5. Open **Party Sheet Permissions** and choose who may edit shared party data.
6. Open the Party Sheet from the same settings category, or select the Actor
   Directory and use its **Open Party Sheet** users icon.
7. Confirm the Treasure tab reports a bound Party Treasury. The first active GM
   initializes this managed `treasure` Actor in the **Hyp3e Utilities** Actor
   folder.
8. Add party members and followers, then set their shares and follower wages
   before attempting distributions.

The managed treasury is an ordinary world Actor with a module flag and Party
State binding. Renaming it is safe. Do not remove its module flag or create
manual duplicate flagged treasuries.

## Party Sheet Permissions

The default minimum edit role is **Gamemaster**, so a new world is GM-editable
only. A GM can open **Party Sheet Permissions** and configure either or both of
these grants:

- **Minimum edit role**: every user at or above Player, Trusted Player,
  Assistant Gamemaster, or Gamemaster may edit.
- **Additional editors**: named non-GM users may edit even when their role is
  below the selected threshold.

GMs always retain edit access. Players who are not editors can still open the
Party Sheet in read-only mode. Managed-treasury coins and Items are shown only
to authorized editors.

An edit grant does not replace Foundry Actor ownership:

- a non-GM can add only a durable world Actor they own;
- a non-GM can send an Item only from an owned character Actor; and
- a non-GM can take a treasury Item only to an owned party character.

Treasury creation, recreation, and binding remain GM-only. XP distribution and
Party Sheet save/morale rolls also remain GM-only. Authorized editors may
manage party data, settle wages, distribute coins, and transfer eligible Items.

## NPC Action HUD

The HUD is visible only to a GM when **Enable NPC Action HUD** is on, a scene
canvas is ready, and at least one supported NPC token is controlled.

**Display Detailed NPC Information** is a per-client option and is enabled by
default. When enabled, each NPC card shows HP, AC, DR, movement, and morale on
two compact lines. When disabled, each card keeps only the Actor-name button
and its health gradient. Changing the option refreshes an open HUD immediately.

1. Use the token-selection tool to control one or more `npc` tokens.
2. Review each token row's HP, AC, DR, movement, morale, and save availability.
3. Choose an action:

   - **Reaction** rolls one unmodified reaction roll for every selected NPC
     token, including separate tokens that use the same Actor.
   - **Roll Save** uses the selected Death, Device, Transformation, Avoidance,
     or Sorcery save and that token Actor's current prepared target.
   - **Morale** uses the current morale value when one is available.

4. Click an NPC name to open the exact Actor or synthetic token Actor sheet.

Character tokens in a mixed selection are ignored. An unavailable save or
morale action stays visible but is disabled. Reaction, save, and morale results
are whispered to GMs and identify the source Actor/token.

Drag the HUD by its heading. Its position is stored per browser client and
clamped inside the viewport. Use **Reset NPC Action HUD Position** in Game
Settings if it becomes inconveniently placed.

## Party Sheet Workflows

Open the Party Sheet from **Game Settings → Hyp3e Utilities → Party Sheet** or
the Actor Directory users icon. Its six tabs share one revisioned world state.

### Overview

- Add the character represented by the first controlled token in the active
  scene with **Add Selected Actor**. Synthetic tokens resolve to their durable
  world Actor before the member is added.
- Add controlled linked character tokens with **Add Controlled Characters**.
- Drag a durable world `character` Actor onto the Overview drop area.
- Open a member sheet, click its portrait to ping a placed token, or use the
  final red X to remove the member. Missing references retain a labeled
  **Clean Up** control.
- Member statistics use two compact lines: HP/AC/DR followed by Move/Share.
- GMs can roll one of the five saves or preview and award XP.

Only `character` Actors can be members. Removing a row changes Party State; it
does not delete the Actor.

### Followers

- Drag a durable world `character` or `npc` Actor onto the Followers drop area.
- Set a non-negative whole-number daily wage in GP.
- At the normal Party Sheet width, save and morale controls follow HP/AC/DR on
  the first line; Move, Share, Wage, Save, and remove occupy the second line.
- Set a share in quarter-share increments, then choose the compact **Save**
  action; its tooltip identifies the full **Save Wage and Share** operation.
- Open the Actor, click its portrait to ping, use the final red X to remove it,
  or have the GM roll saves and individual/bulk NPC morale.
- Authorized editors can preview and settle selected follower wages.

A tracked Actor cannot simultaneously be both a member and a follower.

### Marching Order

Tracked members and followers appear in Unassigned, Front, Middle, and Rear.
Use the movement buttons for the complete keyboard path, or drag rows between
groups. Add and save an optional note for each ranked group. **Post Saved Order
to Chat** creates a public report of the current Front/Middle/Rear order,
including empty ranks.

### Supplies

Torches, lanterns, oil, and rations are shared manual counts. Blank or
non-negative whole-number values are accepted and saved together.

This tab also lists the managed treasury's shared equipment for authorized
editors. Supported Items show quantity, bundle, maximum, and transfer controls.

### Treasure

The Treasure tab shows treasury status and all five native coin denominations:
CP, SP, EP, GP, and PP. Authorized editors can preview and confirm a selected
coin split. GMs also see treasury recovery/binding controls.

Gems/jewelry and other descriptive treasure have rich-text fields here. These
notes are descriptive Party State; they are not embedded Items or coin values.

### Notes

Party notes store shared plans and reminders. Their HTML is sanitized at the
active-GM boundary before persistence. Notes are visible to Party Sheet
viewers, so do not put GM-only secrets in them.

### Drafts and keyboard navigation

Follower employment, marching notes, supplies, party notes, treasure notes,
and distribution previews preserve local drafts during relevant external
updates. If another client advances Party State, the sheet displays a stale
warning. Reconcile the values or choose **Discard Changes** before retrying.

The tablist supports Left/Right and Up/Down arrows plus Home and End. Buttons,
inputs, movement controls, and editors are keyboard focusable.

## Experience, Coins, and Wages

Every distribution uses a preview tied to the current Party State revision. If
the party, shares, treasury, or Actor values change, preview again before
confirming. Distribution inputs are temporary transaction values rather than
editable Party Sheet data, so they do not require a separate save action.

### Experience

1. A GM enters a non-negative whole **Total XP** on Overview.
2. Select the participating members/followers and choose **Preview XP
   Allocation**.
3. Verify each base share, adjustment, final allocation, writeback destination,
   and undistributed base remainder.
4. Choose **Confirm and Award XP**.

Base XP is divided by the saved shares with integer-floor handling. Each
`character` Actor's own XP bonus or penalty is applied after its base share,
and the final award is added to that character sheet. An `npc` share consumes
its base allocation but does not change the NPC sheet. One public chat report
records the completed transaction.

### Coins

1. On Treasure, enter how many CP/SP/EP/GP/PP to split; each amount is capped by
   what the managed treasury currently holds.
2. Select the participating tracked Actors and preview.
3. Verify awards, NPC consumption, per-denomination split remainders, and the
   projected treasury balance.
4. Confirm the distribution.

Each `character` award is added to that Actor's purse. An `npc` allocation is
removed from the split without NPC writeback. Integer-floor remainders stay in
the Party Treasury. One public chat report records the completed transaction.

### Wages

1. Save each follower's daily GP wage on Followers.
2. Select which followers to pay and preview the settlement.
3. Verify the total and projected treasury GP, then confirm.

Wages use GP only. If the treasury lacks enough GP, the entire settlement is
blocked; no partial payment occurs. Settlement deducts the saved wages from
the treasury and creates one public chat report. It does not add GP to follower
sheets or change saved wage/share metadata.

## Item Transfers

Item transfer requires a Party Sheet editor, a ready managed treasury, and
Foundry ownership of the character side of the transfer.

### Character to treasury

- On an owned durable world `character` sheet, use the dolly icon in an
  eligible Item's right-side action cluster. Its tooltip reads **Move to Party
  Treasury**; or
- drag an eligible Item from that sheet to the shared-equipment area on
  Supplies.

Confirm the quantity in the transfer prompt.

### Treasury to character

- Select an owned party character in **Take item for**, then choose **Take** on
  the treasury row; or
- drag the treasury row onto an owned character sheet.

Supported physical Item types are `weapon`, `armor`, `shield`, and ordinary
`item`. Ordinary items merge only when their intrinsic data is compatible;
equipment stacks are kept distinct. Quantity, bundle, and maximum metadata are
preserved. A successful transfer creates a public audit chat card.

Containers and unsupported types such as spells cannot be transferred. Remove
container contents and transfer supported loose Items individually.

## Recovery and Troubleshooting

Back up the world before manually deleting or rebinding treasury Actors.

| Symptom | Check and recovery |
| --- | --- |
| HUD does not appear | Confirm the world setting is enabled, the current user is a GM, a scene is ready, and one or more `npc` tokens are controlled. Reset its position if necessary. |
| Party Sheet says Read only | Have a GM review the minimum role and explicit editor list. Actor ownership is still required for player additions/transfers. |
| Player requests fail | Keep one active GM client connected, confirm SocketLib is active, and reload both clients after changing modules or permissions. |
| Treasury is missing | A GM opens Treasure and chooses **Create or Recreate Treasury**. The missing binding is retained until that explicit recovery. |
| Multiple treasury candidates appear | A GM reviews the flagged candidates and chooses **Bind** for the intended Actor. The module never deletes duplicate candidates automatically. |
| A member/follower row is missing its Actor | Use **Clean Up** on the marked row. Normal deletion hooks also prune tracked member/follower metadata. |
| A draft is stale | Compare it with current shared data, then discard or re-enter the intended values and save against the current revision. |
| Ping reports no token | Place a linked token for that Actor on the current scene. |
| Item transfer is unavailable | Confirm editor permission, character ownership, durable world Actor identity, supported loose Item type, current quantity, and a ready treasury. |
| Preview cannot be confirmed | The preview is stale, empty, insufficient, or has no eligible selected recipient. Correct the inputs and preview again. |

If an Item transfer reports that the transfer completed but its audit failed,
the inventory change is already committed; reconcile the two Actors and create
a manual note. Other failed multi-document operations attempt compensation and
do not post a full-success report.

## Current Limitations

- Only Foundry 13–14 and `hyp3e` 4.0.3 or newer are supported by this release.
- English is the only bundled localization.
- The NPC Action HUD and Party Sheet save/morale rolls are GM-only.
- XP distribution and treasury creation/rebinding are GM-only.
- Player-initiated shared operations require an active GM and SocketLib.
- Containers are not transferable; only supported loose physical Items are.
- Token-synthetic Actors cannot be party members/followers or Item-transfer
  endpoints; use durable world Actors.
- Wages use GP only and are treasury deductions, not follower-sheet income.
- Supply counts are manual and do not consume or derive from Actor inventory.
- NPC XP and coin shares are consumed without NPC-sheet writeback.
- Party and treasure notes are shared with Party Sheet viewers and are not a
  private GM journal.
- The managed treasury does not silently replace a deleted Actor or choose
  among duplicates.

## Core Workflow Acceptance Checklist

A new-world tester can use this short path after installation:

1. Enable the module and SocketLib, reload, and log in as GM.
2. Configure one Player as an explicit editor and open the Party Sheet from
   Game Settings.
3. Add one character member, one character follower, and one NPC follower.
4. Save quarter shares and whole-GP wages.
5. Arrange Front/Middle/Rear, save a note, and post the order to chat.
6. Save all four supply counts plus party/gem/miscellaneous notes.
7. Confirm the managed treasury; add a supported Item and coins to it.
8. Transfer the Item to the treasury and back to an owned character.
9. Preview/confirm GM XP, editor coin distribution, and editor wage settlement;
   verify Actor sheets, treasury balances, and public audit cards.
10. Enable the NPC HUD, select two NPC tokens, and run Reaction, one selected
    save category, and Morale.
11. Delete a tracked test Actor and use the marked-row cleanup; test treasury
    recreation only in a disposable or backed-up world.
