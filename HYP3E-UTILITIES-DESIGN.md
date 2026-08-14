# Hyp3e Utilities Design

Status: Initial implementation design

Last reviewed: 2026-08-14

Target module: Hyp3e Utilities

Module ID: <code>hyp3e-utilities</code>

## 1. Purpose

Hyp3e Utilities is a Foundry Virtual Tabletop module for the <code>hyp3e</code> system. Its first two major features will be:

1. A GM-facing NPC Action HUD for fast bulk reaction, saving throw, and morale rolls from selected NPC tokens.
2. A shared Party Sheet for party composition, followers, marching order, supplies, treasury, inventory, notes, XP awards, follower wages, and treasure distribution.

The S&W Utilities module is the workflow and interaction reference. It is not a system API reference. All actor data paths, roll rules, item behavior, and writebacks must be adapted to Hyperborea.

This document defines the intended product behavior, architecture, system mappings, implementation phases, and acceptance criteria.

## 2. Reference Baseline

| Reference | Snapshot reviewed | Role |
| --- | --- | --- |
| S&W Utilities | Manifest version 2026.04.09 in <code>References/sw-utilities</code> | UX and feature reference |
| Hyperborea 3rd Edition | <code>hyp3e</code> 4.1.0, <code>dev</code> commit <code>8d9aae354712087dacfea10fb0fd5a1f6beca8db</code> | Data model and behavior reference |
| Foundry VTT | Minimum 13, verified 14.365, maximum 14 | Platform target |

The <code>hyp3e</code> checkout is a moving development branch. All field mappings in this document are compatibility contracts owned by this module and must be covered by tests so upstream changes are detected.

## 3. Goals and Non-Goals

### 3.1 Goals

- Preserve the fast table workflows of the S&W NPC HUD and Party Sheet.
- Match Hyperborea rules and <code>hyp3e</code> actor data rather than reproducing S&W mechanics.
- Keep system-dependent paths behind one small adapter module.
- Use Foundry ApplicationV2 for windowed applications.
- Support linked and unlinked NPC tokens correctly in the HUD.
- Keep party state shared at the world level.
- Permit editing through either a configurable minimum user role or explicit per-user grants, with all non-GM writes passing through an authoritative GM relay.
- Use real Foundry documents for party-owned items and coins.
- Make every destructive or multi-document workflow preflighted, auditable, and recoverable where practical.
- Localize all user-facing text and namespace all CSS, hooks, settings, flags, and drag data.

### 3.2 Non-Goals for the Initial Build

- Replacing or modifying <code>hyp3e</code> actor sheets.
- Importing private implementation modules from the <code>hyp3e</code> system.
- Automating expedition time, light depletion, encumbrance, or ration consumption.
- Supporting non-<code>hyp3e</code> systems.
- Automatically importing S&W Party Sheet world data.
- Building a second combat tracker.
- Adding attacks, damage, initiative, loyalty, or encounter generation to the first HUD release.

These may be considered after the two core features are stable.

## 4. Analysis of S&W Utilities

### 4.1 Module Bootstrap

The S&W module has a single entry point that:

- registers settings and templates during <code>init</code>;
- registers the Party Sheet socket relay during <code>ready</code>;
- refreshes the Party Sheet on world-state, permission, and actor changes;
- adds an Open Party Sheet button to the Actor Directory;
- adds Party Sheet item-drop support to owned actor sheets;
- synchronizes the NPC HUD on canvas, token selection, token CRUD, actor updates, setting changes, and window resizing.

The hook coverage is appropriate, but the target module should route hooks to small feature controllers rather than reproduce a large entry file.

### 4.2 NPC Roll HUD Behavior

The S&W HUD:

- is visible only to a GM;
- is enabled by a world setting, disabled by default;
- appears only when one or more NPC tokens are controlled;
- is rendered as a DOM overlay rather than an Application window;
- lists selected NPCs alphabetically;
- shows a red-to-green HP bar beneath each NPC name;
- opens an actor sheet when an NPC name is clicked;
- offers Reaction, Saving Throw, and Morale actions;
- performs one roll per selected token;
- whispers all results to GMs;
- is draggable;
- stores position per client;
- clamps itself to the viewport;
- serializes HUD refreshes through a promise queue;
- can reset its saved position from module settings.

The portable parts are selection handling, overlay lifecycle, position management, health visualization, event binding, and bulk-action orchestration.

The non-portable parts are the S&W save field, S&W reaction outcome table, S&W chat-card markup, and S&W system CSS classes.

### 4.3 Party Sheet Behavior

The S&W Party Sheet is a singleton ApplicationV2 with six tabs.

| Tab | Current functionality |
| --- | --- |
| Overview | Character members, portraits, HP, AC or AAC, movement, shares, token ping, save roll, actor sheet links, missing-actor cleanup, and GM XP distribution |
| Followers | Character or NPC followers, wages, shares, HP, AC or AAC, movement, token ping, save roll, individual or bulk morale, payment workflow, and removal |
| Marching Order | Unassigned pool; Front, Middle, and Rear ranks; buttons and drag/drop ordering; rank notes; public chat report |
| Supplies | Manual torches, lanterns, oil, and rations; shared weapons, armor, and item storage |
| Treasure | PP, GP, SP, CP, gems, miscellaneous treasure, and weighted coin split |
| Notes | Shared rich-text notes using Foundry's ProseMirror element |

Additional behaviors include:

- actors can be added from Actor Directory selection, controlled tokens, or drag/drop;
- followers are added by dropping on the Followers tab;
- deleted actor references are pruned;
- unsaved form values survive external rerenders;
- the minimum editing role is configurable;
- non-GM edits are relayed through SocketLib;
- party state is normalized on every read and write;
- shares are normalized to quarter-share increments;
- XP base awards are weighted by shares and rounded down;
- character XP bonuses are added after base-share allocation;
- only character actors receive XP writeback;
- undistributed XP remains visible in the preview;
- follower wages are selected in a confirmation application and deducted from party GP;
- each coin denomination is split independently by shares;
- coin remainders stay in the Party Sheet;
- stored items can be moved to owned actor sheets, including partial quantities;
- items dropped from owned actor sheets are removed from the source actor;
- public chat messages audit marching order, XP, wages, and treasure distribution.

### 4.4 S&W State Model

The S&W implementation stores one object in a hidden world setting. Its effective shape is:

    {
      memberActorIds: [],
      followerActorIds: [],
      followerWages: {},
      shares: {},
      marchingOrder: {
        front: "",
        middle: "",
        rear: ""
      },
      marchingOrderV2: {
        front: { actorIds: [], notes: "" },
        middle: { actorIds: [], notes: "" },
        rear: { actorIds: [], notes: "" }
      },
      notes: "",
      supplies: {
        torches: "",
        lanterns: "",
        oil: "",
        rations: ""
      },
      treasure: {
        pp: "0",
        gp: "0",
        sp: "0",
        cp: "0",
        gems: "",
        misc: ""
      },
      inventory: {
        weapons: [],
        armor: [],
        items: []
      }
    }

Each stored inventory entry contains a generated ID, original UUID, display fields, quantity, and a complete cloned item source object.

### 4.5 Design Strengths to Preserve

- One obvious Party Sheet rather than multiple competing party records.
- Read-only viewing for users below the configured edit role.
- Explicit save state and unsaved-change preservation.
- Pure calculation helpers for XP and coin previews.
- Share-based participation with quarter-share support.
- Remainders are visible and retained rather than silently discarded.
- Missing actor references degrade visibly and can be cleaned.
- Chat output creates a useful table audit trail.
- The HUD remains out of the way until NPC tokens are selected.
- Per-client HUD position avoids forcing one layout on every GM.

### 4.6 Behaviors Not to Copy Directly

1. The Party Sheet application is more than 2,000 lines and owns presentation, state, rolls, transfers, distributions, and chat. The Hyperborea implementation must split these responsibilities.
2. S&W item storage serializes whole item documents into a setting. This can enlarge the setting, leave invalid source UUIDs after moves, and require custom document reconstruction.
3. S&W stack matching uses only item type and lowercased name. That can merge mechanically different items.
4. Full-world-setting read/modify/write operations can lose concurrent edits.
5. The GM RPC accepts a full replacement state. An authoritative handler must validate both the caller's permission and the requested operation.
6. The S&W HUD's generic save target does not exist in Hyperborea.
7. The S&W reaction result bands do not match Hyperborea's reaction table.
8. S&W coin paths and denominations do not match Hyperborea.
9. S&W actor IDs are adequate for world actors but do not distinguish synthetic token actors. The HUD must retain token context.
10. A player-visible control is not a permission boundary. All relayed writes and actor transfers must be authorized again on the GM client.
11. Multi-document distributions can partially succeed. The new implementation needs preflight checks and compensating rollback.
12. Mouse-only dragging should be replaced with Pointer Events for better input support.

## 5. Hyperborea System Contract

### 5.1 Actor Types

| Actor type | Party use |
| --- | --- |
| <code>character</code> | Party member or follower; can receive XP and coin writeback |
| <code>npc</code> | HUD target or follower; has morale and loyalty; participates in share calculations but receives chat-only XP and coin allocations with no actor writeback |
| <code>treasure</code> | Accepted backing document for party inventory and coins |
| <code>merchant</code> | Not a party member in the initial build |
| <code>itemToken</code> | Not a party member in the initial build |

NPC followers may use either <code>system.npcType = npc</code> or <code>system.npcType = monster</code>. The first implementation should allow both and show the subtype rather than impose a rules assumption.

### 5.2 Actor Field Mapping

| Concept | S&W path | Hyperborea path or rule |
| --- | --- | --- |
| HP | <code>system.hp.value/max</code> | <code>system.hp.value/max</code> |
| Armor Class | <code>system.ac.value</code> or <code>system.aac.value</code> | <code>system.ac.value</code> |
| Damage Reduction | Not shown | <code>system.ac.dr</code> |
| Movement | <code>system.moveRate.value</code> | <code>system.movement.base.value</code> |
| Race or ancestry | <code>system.ancestry</code> | <code>system.details.race</code> |
| Class | <code>system.class</code> | <code>system.details.class</code> |
| Level | <code>system.level.value</code> | <code>system.details.level.value</code> |
| Character XP | <code>system.xp.value</code> | <code>system.details.xp.value</code> |
| Character XP bonus or penalty | <code>system.xpBonus.value</code> | <code>system.details.xp.bonus</code> |
| NPC encounter XP value | Not separately mapped | <code>system.xp</code>; never use as earned-XP writeback |
| Morale | <code>system.morale</code> | <code>system.morale</code> |
| Loyalty | Not used | <code>system.loyalty</code>; reserved for a later feature |
| Generic save | <code>system.save.value</code> | No equivalent; choose a save category |
| Death save | None | <code>system.saves.death.curr</code> |
| Device save | None | <code>system.saves.device.curr</code> |
| Transformation save | None | <code>system.saves.transformation.curr</code> |
| Avoidance save | None | <code>system.saves.avoidance.curr</code> |
| Sorcery save | None | <code>system.saves.sorcery.curr</code> |
| Coin purse | <code>system.treasure.&lt;coin&gt;</code> | <code>system.money.&lt;coin&gt;.value</code> |

The adapter must read each save's prepared <code>curr</code> value. A Foundry 14.365 runtime test against <code>hyp3e</code> 4.1.0 verified all five fields on both <code>character</code> and <code>npc</code> Actors and proved that an Active Effect applied to <code>system.saves.death.curr</code> changes the rolled target without changing <code>value</code>. The NPC sheet's current use of <code>value</code> is therefore not the contract for this module.

### 5.3 Currency

Hyperborea supports:

- CP
- SP
- EP
- GP
- PP

The Party Sheet must add EP everywhere coins are displayed, previewed, distributed, or reported. Coin values are stored as strings in <code>system.money.&lt;coin&gt;.value</code> and must be normalized to non-negative whole numbers before arithmetic.

### 5.4 Items

Physical item quantity is stored at:

- <code>system.quantity.value</code>
- <code>system.quantity.max</code>
- <code>system.quantity.bundle</code>

The initial Party Sheet accepts:

- <code>weapon</code>
- <code>armor</code>
- <code>shield</code>
- <code>item</code>

It rejects:

- <code>spell</code>
- <code>feature</code>
- <code>classTemplate</code>
- <code>effectTemplate</code>

Partial transfers must keep <code>value</code> and <code>max</code> internally consistent and preserve bundle information. Weapons, armor, and shields must never auto-stack. Ordinary items may stack only when a compatibility check proves their type and relevant source data match; name alone is insufficient.

### 5.5 Existing Roll Methods

The system actor document exposes <code>rollReaction</code>, <code>rollSave</code>, and <code>rollCheck</code>. These methods expect sheet-style dataset objects and open one dialog per invocation.

They are appropriate for an individual interactive actor-sheet roll. They are not appropriate for a one-click bulk HUD action because selecting five NPCs would create five dialogs.

The module will therefore implement a small Hyperborea roll adapter using public Foundry Roll and ChatMessage APIs and public actor data. It must not import <code>hyp3e</code> internal files. This keeps bulk behavior predictable while isolating rules in one tested module.

## 6. Target Feature: NPC Action HUD

### 6.1 Visibility

The HUD is rendered when all conditions are true:

- <code>game.system.id</code> is <code>hyp3e</code>;
- the current user is a GM;
- the Enable NPC Action HUD world setting is enabled;
- the canvas is ready;
- one or more controlled tokens have an actor of type <code>npc</code>.

Otherwise it is removed immediately.

### 6.2 Target Rows

Each controlled NPC token produces one row. Do not deduplicate by base actor ID: two unlinked or duplicated tokens can have different HP and must remain distinct.

Runtime identity testing established these rules:

- linked tokens share the durable world Actor UUID and follow base Actor updates;
- an unlinked token exposes a token-scoped synthetic Actor UUID;
- base Actor updates propagate into an unlinked token until a synthetic Actor field is overridden;
- writes through the synthetic Actor remain isolated from the base Actor;
- token UUID, not Actor UUID alone, is the stable HUD-row identity for duplicate and unlinked tokens.

Each row includes:

- token display name;
- optional monster/NPC subtype;
- current/max HP bar;
- missing-morale indicator where applicable;
- a button that opens the exact token actor sheet.

The HUD should store token UUID and actor UUID in its view model. Resolve the token first so synthetic actors retain the correct context.

### 6.3 Actions

#### Reaction

- Roll <code>2d6</code> once per selected NPC by default.
- Use the Hyperborea reaction table:

| Total | Result |
| --- | --- |
| 0–2 | Violent: immediate attack |
| 3 | Hostile: antagonistic; attack likely |
| 4–5 | Unfriendly: negative inclination |
| 6–8 | Neutral: disinterested or uncertain; reroll once |
| 9–10 | Friendly: considers ideas or proposals |
| 11 | Agreeable: willing and helpful |
| 12+ | Affable: extremely accommodating |

NPC actors have no Charisma reaction modifier. The first release therefore uses an unmodified roll. A later group-reaction dialog may accept the party spokesperson's reaction adjustment and roll once for the encounter.

#### Saving Throw

The save action must expose one of five categories:

- Death
- Device
- Transformation
- Avoidance
- Sorcery

For every eligible target:

- read <code>system.saves.&lt;category&gt;.curr</code>;
- roll <code>1d20</code>;
- succeed when total is greater than or equal to the target;
- label the selected category and target in chat.

The UI may use a compact select beside one Save button or a five-item popover. It must not use an unlabeled generic save.

#### Morale

For every target with numeric morale:

- read <code>system.morale</code>;
- roll <code>2d6</code>;
- succeed when total is less than or equal to morale.

Targets without morale are skipped and included in one summary warning rather than producing an incorrect target of zero.

### 6.4 Roll Output

- Default to GM roll and whisper recipients determined by Foundry.
- Create one chat message per NPC so each result has an actor or token speaker.
- Attach the Roll object to the message.
- Escape actor names and other inserted text.
- Add namespaced flags containing feature, action, category, token UUID, and a shared batch ID.
- Emit messages sequentially so selection order produces stable chat order.
- Report partial skips or failures once after the batch.

Do not use <code>hyp3e</code> chat CSS classes as an API contract.

### 6.5 HUD Lifecycle and Position

- Keep one DOM overlay with a stable ID.
- Debounce high-frequency actor and token updates.
- Serialize render work so an older async render cannot replace a newer one.
- Use Pointer Events for dragging.
- Ignore drag starts from interactive controls.
- store <code>left</code>, <code>top</code>, and <code>width</code> in a client setting;
- clamp position on render, resize, and drag end;
- provide an ApplicationV2 reset-position settings menu;
- remove window listeners when the HUD is removed.

## 7. Target Feature: Party Sheet

### 7.1 Opening and Singleton Behavior

The Party Sheet is one ApplicationV2 instance per client and can be opened from:

- a module settings menu;
- a button in the Actor Directory.

Opening it again focuses or rerenders the existing instance. Actor, item, state, permission, and treasury changes refresh the open sheet without discarding unsaved local form values.

Foundry 14.365 runtime validation confirmed the ApplicationV2 plus HandlebarsApplicationMixin parts/template lifecycle, action dispatch, explicit rerender, stable singleton reference, and clean close behavior. Foundry 13 validation remains required before this compatibility contract is complete.

### 7.2 Overview Tab

- Accept world actors of type <code>character</code>.
- Add actors from directory selection, controlled linked tokens, and drag/drop.
- Reject synthetic unlinked token actors because they are not durable world party members.
- Show portrait, name, race, class, level, HP, AC, DR, movement, and share value.
- Open actor sheet and ping a token on the current scene.
- Offer a category-specific save action rather than a generic save.
- Mark deleted or unresolved actor references and allow cleanup.
- Make XP distribution GM-only.

### 7.3 Followers Tab

- Accept world actors of type <code>character</code> or <code>npc</code>.
- Show the same combat summary as Overview.
- Show NPC subtype where available.
- Keep module-local daily GP wage and share values.
- Allow individual and bulk morale only for NPC followers with numeric morale.
- Do not infer daily wage from <code>system.cost</code> until its rules semantics are explicitly confirmed.
- Reserve loyalty rolls for a later enhancement.

### 7.4 Marching Order Tab

- Keep Unassigned, Front, Middle, and Rear groups.
- Support accessible buttons and drag/drop.
- Ensure an actor appears in at most one rank.
- Preserve ordering inside each rank.
- Keep per-rank plain-text notes.
- Generate a public chat report with escaped content.
- Preserve unsaved form data when ranks are edited.

### 7.5 Supplies Tab

- Keep manual fields for torches, lanterns, oil, and rations.
- Do not silently derive or consume these values from actor inventory.
- Show shared weapons, armor and shields, and gear from the managed treasury Actor.
- Open the real embedded item sheet.
- Support actor-to-party and party-to-actor transfers with quantity prompts.

### 7.6 Treasure Tab

- Read and write PP, GP, EP, SP, and CP on the managed treasury Actor.
- Keep gems and miscellaneous treasure as module state notes until they are represented by real items.
- Preview share-based splits per denomination.
- Retain floor remainders in the treasury.
- Include selected NPC followers with positive shares in the same allocation math as characters.
- Write coins only to character actors that expose a compatible <code>system.money</code> schema.
- Deduct an NPC recipient's allocation from the managed treasury but do not persist it on the NPC actor.
- Report every NPC allocation in chat and label it as non-persistent in the preview so the GM can see that the coins leave the treasury without actor writeback.

### 7.7 Notes Tab

- Use Foundry's ProseMirror custom element.
- Enrich HTML asynchronously for display.
- Store notes in module party state.
- Preserve edits across external refreshes.
- Sanitize or use Foundry enrichment APIs for rendered content.

### 7.8 XP Distribution

- All tracked members and followers appear in the preview.
- Default all tracked recipients with positive shares to selected; the GM may deselect any recipient in the preview.
- Normalize total XP to a non-negative whole number.
- Normalize shares to quarter increments.
- Allocate base XP with floor division by total active shares.
- Apply each character's signed <code>system.details.xp.bonus</code> percentage after base allocation. Positive values increase and negative values reduce the award; floor the final adjusted award to a non-negative whole number.
- Write only to <code>character.system.details.xp.value</code>.
- Never update <code>npc.system.xp</code>.
- Give NPC recipients no bonus or penalty adjustment, include their base allocation in the division, and persist no XP for them.
- Show base, signed adjustment, total, writeback status, total shares, and undistributed base XP.
- Create an audit chat message for every awarded recipient.
- Clearly label NPC chat messages as allocations with no actor writeback.

### 7.9 Follower Wages

- Use the selected followers' module-local daily GP wages.
- Deduct from <code>treasury.system.money.gp.value</code> in the first release.
- Reject insufficient GP rather than silently converting denominations.
- Report selected followers, individual wages, total paid, and remaining GP in chat.
- A later enhancement may use a tested coin-conversion service.

### 7.10 Item Transfers

Use the managed treasury Actor's embedded Item documents as the source of truth.

For actor-to-party transfer:

1. Verify the initiating user can edit the Party Sheet and owns the source actor, or is a GM.
2. Resolve the exact owned item and current quantity.
3. Prompt for quantity when appropriate.
4. Create or increment the destination treasury item.
5. Only after destination success, decrement or delete the source.
6. Roll back the destination if the source mutation fails.

For party-to-actor transfer:

1. Verify Party Sheet edit permission and recipient ownership.
2. Resolve the current treasury item.
3. Prompt for quantity.
4. Create or increment the recipient item.
5. Only after destination success, decrement or delete the treasury source.
6. Roll back the destination if the treasury mutation fails.

Containers with contents require explicit handling and are out of scope for the first transfer release. Reject them with a clear message rather than orphaning contained items.

## 8. Target Architecture

### 8.1 Recommended File Layout

    module/
      hyp3e-utilities.mjs
      constants.mjs
      settings.mjs
      hooks.mjs
      system/
        hyp3e-adapter.mjs
      hud/
        npc-action-hud.mjs
        npc-action-service.mjs
        reaction-table.mjs
      party/
        party-sheet.mjs
        party-controller.mjs
        party-state.mjs
        party-permissions.mjs
        party-socket.mjs
        party-treasury.mjs
        party-members.mjs
        marching-order.mjs
        item-transfer.mjs
        distributions/
          xp-distribution.mjs
          coin-distribution.mjs
          follower-payment.mjs
      chat/
        chat-cards.mjs
      utils/
        numbers.mjs
        documents.mjs
    templates/
      hud/
      party/
    styles/
      hyp3e-utilities.css
    lang/
      en.json
    tests/
      unit/
      fixtures/

This is a responsibility boundary, not a requirement for one file per tiny function. Merge files when a component remains small; do not recreate a monolith.

### 8.2 Hyperborea Adapter

The adapter owns all <code>hyp3e</code> knowledge:

- supported actor and item types;
- display summary extraction;
- save categories and targets;
- morale extraction;
- character XP and signed bonus or penalty access;
- coin read and update payloads;
- physical item quantity read and update payloads;
- item category mapping;
- treasury Actor validation.

Feature code must not reach through arbitrary <code>actor.system</code> paths outside the adapter. This makes upstream compatibility failures localized and testable.

### 8.3 Party State

Recommended initial schema:

    {
      schemaVersion: 1,
      revision: 0,
      treasuryActorUuid: "",
      memberActorUuids: [],
      followerActorUuids: [],
      followerWages: {},
      shares: {},
      marchingOrder: {
        front: { actorUuids: [], notes: "" },
        middle: { actorUuids: [], notes: "" },
        rear: { actorUuids: [], notes: "" }
      },
      supplies: {
        torches: "",
        lanterns: "",
        oil: "",
        rations: ""
      },
      treasureNotes: {
        gems: "",
        misc: ""
      },
      notes: ""
    }

Use Actor UUIDs rather than bare IDs. Accept only durable world actors for membership. Normalize and migrate state on read, but persist migrations only from an active GM.

The <code>revision</code> field supports stale-write detection. Every authoritative mutation must re-read current state, validate the expected revision, apply one named operation, increment the revision, and write the result.

### 8.4 Managed Treasury Actor

The accepted storage backend is one world Actor of type <code>treasure</code>.

Foundry 14.365 runtime validation confirmed that <code>hyp3e</code> 4.1.0 supports creating this Actor type, persisting the module flag and ownership, resolving it after rename, detecting deletion, recreating it, and detecting multiple flagged candidates.

Creation behavior:

- create only from an active GM;
- name it Party Treasury by default;
- place it in a Hyp3e Utilities folder when possible;
- set <code>flags.hyp3e-utilities.partyTreasury = true</code>;
- store its UUID in party state;
- do not create duplicates when one valid flagged actor already exists.

Recovery behavior:

- if the configured Actor is missing, search for one flagged treasury;
- if exactly one exists, rebind it;
- if none exists, offer the GM a recreate action;
- if multiple exist, require the GM to select one;
- never silently delete an extra treasury Actor.

Why this is preferred over serialized setting entries:

- items keep valid UUIDs and sheets;
- coins use the system's native model;
- Foundry handles embedded document identity and updates;
- the system already treats treasure Actors as item and coin transfer sources;
- Party Sheet state remains small;
- external actor updates naturally trigger refreshes.

### 8.5 Settings

| Key | Scope | Default | Purpose |
| --- | --- | --- | --- |
| <code>enableNpcActionHud</code> | world | false | Enables the GM HUD |
| <code>npcActionHudPosition</code> | client | empty object | Stores HUD position and width |
| <code>partyState</code> | world, hidden | schema default | Shared party metadata |
| <code>partySheetMinimumEditRole</code> | world | GM | Minimum role shown editing controls |
| <code>partySheetExplicitEditorUserIds</code> | world, hidden | empty array | User IDs granted edit access below the role threshold |

Add ApplicationV2 settings menus for Reset HUD Position, Party Sheet Permissions, and Open Party Sheet. The permissions application must expose both the minimum role threshold and an explicit list of non-GM world users, whether or not they are currently connected.

### 8.6 Hooks

| Hook or event | Action |
| --- | --- |
| <code>init</code> | Register settings and preload templates |
| <code>ready</code> | Validate system, initialize socket, resolve treasury, prune state, synchronize HUD |
| <code>activateActorDirectory</code> | Add Party Sheet button once |
| <code>controlToken</code> | Synchronize HUD |
| <code>canvasReady</code> | Synchronize HUD |
| <code>createToken</code>, <code>updateToken</code>, <code>deleteToken</code> | Synchronize HUD when relevant |
| <code>createActor</code>, <code>updateActor</code>, <code>deleteActor</code> | Refresh relevant Party Sheet and HUD views |
| <code>createItem</code>, <code>updateItem</code>, <code>deleteItem</code> | Refresh when the parent is the treasury or tracked actor |
| module party-state hook | Refresh Party Sheet |
| module permission hook | Refresh Party Sheet controls |
| window resize | Clamp or synchronize HUD |

Every hook must be registered once and any non-Hook window listener must have explicit cleanup.

### 8.7 Sockets and Authority

The S&W module requires SocketLib because players cannot modify world settings directly. Hyp3e Utilities will retain non-GM Party Sheet editing and therefore requires SocketLib.

The manifest will then need:

- <code>socket: true</code>;
- a required SocketLib relationship.

Do not relay arbitrary replacement state. Register named operations such as:

- add member;
- remove member;
- update form fields;
- assign marching rank;
- transfer item;
- distribute XP;
- split coins;
- pay followers.

The GM handler must:

1. identify the actual caller through a trusted socket mechanism;
2. recheck the configured role;
3. recheck actor ownership for actor-specific operations;
4. validate payload shape and IDs;
5. read current state and documents;
6. apply the operation through a serialized mutation queue;
7. return a structured success or error result.

Never trust a user ID supplied only inside the request payload. SocketLib v1.1.4 runtime and source validation proved that a GM-side registered handler receives the server-derived requesting Foundry user ID as <code>this.socketdata.userId</code>. A player request that falsely claimed the GM's ID still exposed the player's real ID, and Foundry's raw socket callback reported the same sender. Production handlers must authorize this transport-derived ID; payload identity fields are informational only.

SocketLib supplies caller identity and active-GM routing, not the complete mutation protocol. FND-004, PAR-002, and PAR-004 must still handle missing or changing active GMs, reconnects, named-operation authorization, schema validation, stale revisions, duplicate request IDs, and structured errors.

Party Sheet edit authorization is granted when the user is a GM, the user's role is at or above <code>partySheetMinimumEditRole</code>, or the user's ID appears in <code>partySheetExplicitEditorUserIds</code>. The GM handler must evaluate the same rule as the UI for every mutation.

## 9. State, Concurrency, and Recovery

### 9.1 Normalization

Normalization must:

- merge missing default keys;
- reject non-object containers;
- deduplicate member and follower UUID arrays;
- prevent the same actor from being both a member and follower unless explicitly supported later;
- normalize shares to non-negative quarter increments;
- normalize wages and coins to non-negative whole values;
- ensure marching-order membership refers only to tracked actors;
- ensure an actor appears in only one rank;
- preserve unknown future keys only when migration policy allows;
- never generate random IDs during a read-only normalization pass.

### 9.2 Concurrency

- Serialize mutations on the active GM.
- Use operation-level requests rather than full-state replacement.
- Compare expected and current revision.
- On a stale revision, return fresh state and ask the client to rerender or retry the operation.
- Keep unsaved local form values separate from stored state and merge only fields owned by that form submission.

### 9.3 Multi-Document Operations

XP, coin distribution, wages, and item transfers touch more than one document.

Before writing:

- resolve every target;
- validate actor type and schema;
- validate permissions;
- calculate every before and after value;
- ensure no result is negative;
- preserve a rollback snapshot.

During writing:

- apply recipient writes first;
- update party state or treasury last;
- if any write fails, compensate already-applied writes where possible;
- report a precise error if compensation also fails;
- create success chat only after all writes complete.

Foundry does not provide a cross-document transaction. The UI must never claim success after a partial failure.

## 10. UI and Accessibility

- Namespace CSS with <code>hyp3e-utilities-</code>.
- Use semantic buttons, labels, fieldsets, and headings.
- Provide tooltips and visible text for icon-only controls.
- Support keyboard navigation for tabs and actions.
- Keep button alternatives for all drag/drop operations.
- Use Pointer Events for HUD movement.
- Maintain visible focus styles.
- Avoid relying on color alone for health or writeback status.
- Preserve scroll position and active tab across rerenders.
- Disable controls during active mutations.
- Show read-only role guidance when editing is unavailable.
- Use confirmation previews for any workflow that writes to multiple actors.

## 11. Testing Strategy

### 11.1 Pure Unit Tests

Use Node's built-in test runner for logic that does not need Foundry.

Required test groups:

- Hyperborea reaction table boundaries, including totals below 0 and above 12;
- save category validation and target extraction;
- morale target validation;
- number parsing for formatted string values;
- quarter-share normalization;
- XP distribution, signed bonus or penalty, NPC consumption, and remainder math;
- five-denomination coin distribution and remainders;
- NPC coin allocation consumption without writeback;
- follower wage totals;
- marching-order assign, move, remove, deduplicate, and cleanup;
- party-state normalization and migrations;
- physical item quantity and bundle planning;
- item compatibility and non-stacking rules;
- permission decisions;
- stale-revision rejection.

### 11.2 Adapter Contract Tests

Create minimal serialized fixtures matching the reviewed <code>hyp3e</code> schemas.

Verify:

- character summaries;
- NPC summaries;
- all five save targets;
- current versus base save selection;
- character XP and signed bonus or penalty paths;
- NPC XP is explicitly non-writeable;
- NPC actors are explicitly non-writeable for coin awards;
- five coin paths;
- treasury Actor recognition;
- physical item types and quantity payloads.

These tests are the early warning system for upstream <code>hyp3e</code> changes.

### 11.3 Foundry Integration Tests

Manual or automated Foundry tests must cover:

- Foundry 13 and 14;
- GM, Assistant GM, Trusted Player, and Player roles;
- HUD enabled and disabled;
- zero, one, and many selected NPCs;
- linked and unlinked NPC tokens;
- duplicated tokens sharing one base actor;
- missing HP maximum, zero HP maximum, and negative HP;
- every save category;
- missing morale;
- actor update while HUD is visible;
- viewport resize and saved off-screen position;
- Party Sheet open from both entry points;
- actor and token drag/drop;
- deleted member, follower, or treasury Actor;
- concurrent clients editing;
- SocketLib unavailable;
- treasury item full and partial transfers;
- bundled quantities;
- transfer failure and rollback;
- EP display and distribution;
- NPC XP and coin allocations reduce the distributable pool, create chat output, and perform no actor writeback;
- actor writeback permission failure;
- reload and state migration.

### 11.4 Regression Tests for S&W Parity

For every S&W workflow listed in Section 4.3, record one of:

- ported with equivalent behavior;
- adapted for Hyperborea, with the difference documented;
- intentionally deferred;
- intentionally rejected.

No workflow should disappear accidentally during the port.

## 12. Implementation Plan

### Phase 0: Foundation and Contracts

Deliver:

- module constants and hook registration;
- localization namespace;
- Hyperborea adapter and fixtures;
- Node test harness;
- required SocketLib manifest relationship and authenticated-caller spike;
- settings and ApplicationV2 menus;
- CSS and template organization.

Exit criteria:

- all adapter contract tests pass;
- module loads without warnings in a blank <code>hyp3e</code> world;
- unsupported-system guard prevents feature initialization elsewhere.

### Phase 1: NPC Action HUD

Deliver:

- selection-driven overlay;
- token rows and HP bars;
- actor-sheet opening;
- reaction rolls using the Hyperborea table;
- five-category NPC saves;
- morale checks;
- GM-only chat output;
- drag, persistence, reset, clamp, and cleanup.

Exit criteria:

- HUD acceptance tests pass for linked and unlinked tokens;
- multi-NPC rolls require no per-actor dialogs;
- all output is GM-only and ordered;
- no stale overlays or leaked listeners remain.

### Phase 2: Party Sheet Core

Deliver:

- singleton ApplicationV2 shell;
- Overview and Followers tabs;
- party-state schema, normalization, revisioning, and migration framework;
- configurable minimum edit role and explicit per-user editor grants;
- authoritative named-operation socket relay;
- actor add, remove, open, ping, save, missing-reference, wage, and share behavior;
- Actor Directory entry point.

Exit criteria:

- GM and configured player workflows pass;
- unauthorized mutations fail on the GM handler;
- two-client stale writes do not silently overwrite one another.

### Phase 3: Marching Order, Supplies, and Notes

Deliver:

- marching-order groups, buttons, drag/drop, notes, and chat report;
- manual supply fields;
- rich-text shared notes;
- unsaved form preservation across external refreshes.

Exit criteria:

- all operations have keyboard alternatives;
- actor uniqueness and order invariants hold;
- external refresh cannot discard local pending edits.

### Phase 4: Managed Treasury and Item Transfers

Deliver:

- treasury Actor creation, binding, and recovery;
- Supplies inventory rendering;
- supported item-type validation;
- actor-to-party and party-to-actor transfer plans;
- quantity and bundle handling;
- rollback and audit messages.

Exit criteria:

- real item UUIDs remain valid;
- full and partial transfers preserve total quantity;
- unsupported items and non-empty containers are rejected safely;
- failed source mutation does not duplicate or destroy items.

### Phase 5: XP, Wages, and Treasure Distribution

Deliver:

- XP preview and character writeback;
- follower payment preview and GP deduction;
- five-denomination treasure split;
- explicit non-persistent NPC allocation behavior;
- audit chat messages;
- preflight and compensation.

Exit criteria:

- no operation writes to <code>npc.system.xp</code>;
- no purse becomes negative;
- floor remainders remain in the treasury;
- partial failures are rolled back or clearly reported.

### Phase 6: Hardening and Release

Deliver:

- Foundry 13/14 test matrix;
- accessibility pass;
- responsive layout pass;
- migration tests;
- release notes and user documentation;
- clean installation and upgrade verification.

Exit criteria:

- all automated checks pass;
- both major features meet their acceptance criteria;
- no unresolved high-severity data-loss or permission issue remains.

## 13. Acceptance Criteria

### 13.1 NPC Action HUD

- Only GMs can see it.
- It appears and disappears solely from valid selected NPC tokens and the enable setting.
- It distinguishes selected token instances.
- HP visualization is clamped and never emits invalid CSS.
- Reaction results match Hyperborea boundaries.
- Saves require an explicit valid category and use the correct current target.
- Morale skips missing targets.
- All rolls are GM-only, actor-attributed, and attached to chat as Roll objects.
- The HUD is movable, resettable, viewport-safe, and leak-free.

### 13.2 Party Sheet

- One shared party exists per world.
- Only durable world actors become members or followers.
- Character and NPC field summaries use the Hyperborea adapter.
- Editing controls and authoritative writes honor the configured role.
- Members, followers, wages, shares, ranks, supplies, treasure notes, and rich notes persist.
- The treasury uses a real <code>treasure</code> Actor.
- Item and coin operations do not silently lose or duplicate data.
- XP writes only to character XP.
- Character XP awards apply the sheet's signed bonus or penalty before writeback.
- Selected NPC shares consume XP and coins and create chat output without actor writeback.
- EP is supported throughout currency workflows.
- Non-persistent NPC recipients are clearly identified before confirmation.
- Concurrent changes cannot silently replace a newer revision.
- Deleted references and a deleted treasury have explicit recovery paths.

## 14. Accepted Decisions and Defaults

| Decision | Accepted behavior |
| --- | --- |
| Reaction granularity | One roll per selected NPC |
| NPC reaction modifier | Zero in the initial HUD because NPCs have no Charisma reaction field |
| Save UX | One compact category selector plus Save button |
| HUD roll mode | GM roll only |
| Party edit authorization | GM, configured minimum role, or explicit per-user grant |
| Non-GM editing | Required through SocketLib with trusted caller authorization |
| Party item storage | Managed <code>treasure</code> Actor |
| Character XP adjustment | Apply the signed bonus or penalty from <code>system.details.xp.bonus</code> before native writeback |
| NPC XP awards | Participate in allocation and produce chat, then disappear without actor writeback; never write to <code>system.xp</code> |
| NPC coin awards | Participate in allocation, are removed from treasury, and produce chat, then disappear without actor writeback |
| Follower wage source | Module-local daily GP value |
| Wage currency | GP only for the first release |
| Supplies | Manual fields; no automatic consumption |
| Containers | Reject non-empty containers in the first transfer release |
| Theme | Hyperborea-compatible dark utility styling without depending on private system selectors |

Changing an accepted behavior must update this document before implementation so tests and UI expectations remain aligned.

## 15. Definition of Done

The initial Hyp3e Utilities build is complete when:

- the NPC Action HUD and Party Sheet satisfy Section 13;
- every S&W workflow has a recorded parity disposition;
- all system paths are isolated behind the adapter;
- automated logic and adapter contract tests pass;
- Foundry 13 and 14 integration checks pass;
- permission enforcement is authoritative, not only visual;
- no known workflow can silently duplicate, destroy, or misdirect actor items, XP, or coins;
- installation and tagged GitHub release artifacts work from the module manifest.
