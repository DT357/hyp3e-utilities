import assert from 'node:assert/strict';
import test from 'node:test';

import { TEMPLATE_PATHS } from '../../module/core/constants.mjs';
import {
  createFoundationApplications,
  preloadFoundationTemplates,
} from '../../module/apps/foundation-applications.mjs';
import { PARTY_MEMBER_OPERATIONS } from '../../module/party/party-members.mjs';
import { PARTY_FOLLOWER_OPERATIONS } from '../../module/party/party-followers.mjs';
import {
  PARTY_MARCHING_OPERATIONS,
  createMarchingOrderModel,
} from '../../module/party/party-marching-order.mjs';
import { PARTY_NOTE_OPERATIONS } from '../../module/party/party-notes.mjs';
import { createPartyStateDefault } from '../../module/party/party-state.mjs';
import { PARTY_SUPPLY_OPERATIONS } from '../../module/party/party-supplies.mjs';

class StubApplicationV2 {
  constructor() {
    this.bringToFrontCount = 0;
    this.renderCount = 0;
  }

  async close() {
    this.closed = true;
    this.rendered = false;
  }

  async render() {
    this.rerendered = true;
    this.rendered = true;
    this.renderCount += 1;
    return this;
  }

  bringToFront() {
    this.bringToFrontCount += 1;
  }
}

test('ApplicationV2 shells use shared namespace and template conventions', () => {
  const classes = createFoundationApplications({
    ApplicationV2: StubApplicationV2,
    HandlebarsApplicationMixin: (Base) => class extends Base {},
    game: { settings: {}, users: [] },
  });

  assert.equal(
    classes.FoundationApplication.PARTS.main.template,
    TEMPLATE_PATHS.foundation,
  );
  assert.ok(
    classes.FoundationApplication.DEFAULT_OPTIONS.classes
      .includes('hyp3e-utilities'),
  );
  assert.equal(
    classes.PartyPermissionsApplication.PARTS.main.template,
    TEMPLATE_PATHS.permissions,
  );
});

test('foundation templates preload as one explicit set', async () => {
  let receivedPaths;
  await preloadFoundationTemplates(async (paths) => {
    receivedPaths = paths;
  });

  assert.deepEqual(receivedPaths, Object.values(TEMPLATE_PATHS));
});

test('setting menu actions persist only their validated values', async () => {
  const writes = [];
  const game = {
    settings: {
      set: async (namespace, key, value) => {
        writes.push({ namespace, key, value });
      },
    },
    users: [
      { id: 'player', isGM: false },
      { id: 'gm', isGM: true },
    ],
  };
  const classes = createFoundationApplications({
    ApplicationV2: StubApplicationV2,
    HandlebarsApplicationMixin: (Base) => class extends Base {},
    game,
    notifications: { info: () => {} },
  });

  const resetApp = new classes.ResetHudPositionApplication();
  await classes.ResetHudPositionApplication.DEFAULT_OPTIONS.actions.reset
    .call(resetApp);
  assert.equal(resetApp.closed, true);
  assert.deepEqual(writes.shift(), {
    namespace: 'hyp3e-utilities',
    key: 'npcActionHudPosition',
    value: {},
  });

  const permissionsApp = new classes.PartyPermissionsApplication();
  await classes.PartyPermissionsApplication.DEFAULT_OPTIONS.form.handler.call(
    permissionsApp,
    undefined,
    undefined,
    {
      object: { minimumEditRole: '2' },
      getAll: () => ['player', 'gm', 'missing'],
    },
  );
  assert.deepEqual(writes, [
    {
      namespace: 'hyp3e-utilities',
      key: 'partySheetMinimumEditRole',
      value: 2,
    },
    {
      namespace: 'hyp3e-utilities',
      key: 'partySheetExplicitEditorUserIds',
      value: ['player'],
    },
  ]);
  assert.equal(permissionsApp.rerendered, true);
});

test('Party Sheet is a focused singleton with cleaned external-update hooks', async () => {
  const subscriptions = new Map();
  const removed = [];
  const scheduledRefreshes = [];
  let hookId = 0;
  const hooks = {
    on: (name, callback) => {
      const id = ++hookId;
      subscriptions.set(id, { callback, name });
      return id;
    },
    off: (name, id) => {
      removed.push([name, id]);
      subscriptions.delete(id);
    },
  };
  const settingValues = new Map([
    ['partySheetMinimumEditRole', 2],
    ['partySheetExplicitEditorUserIds', []],
  ]);
  const state = { schemaVersion: 1, revision: 7 };
  const game = {
    settings: { get: (_namespace, key) => settingValues.get(key) },
    user: { id: 'trusted', isGM: false, role: 2 },
    users: [],
  };
  const classes = createFoundationApplications({
    ApplicationV2: StubApplicationV2,
    HandlebarsApplicationMixin: (Base) => class extends Base {},
    game,
    hooks,
    partyStoreProvider: () => ({ getState: () => state }),
    scheduleExternalRefresh: (callback) => scheduledRefreshes.push(callback),
  });

  const first = new classes.OpenPartySheetApplication();
  const reopened = new classes.OpenPartySheetApplication();
  assert.equal(reopened, first);
  await first._onFirstRender({}, {});
  await first.render({ force: true });
  await reopened.render({ force: true });
  assert.equal(first.renderCount, 2);
  assert.equal(first.bringToFrontCount, 2);
  assert.deepEqual(
    [...subscriptions.values()].map(({ name }) => name).sort(),
    [
      'createActor',
      'createItem',
      'deleteActor',
      'deleteItem',
      'hyp3e-utilities.partyPermissionsUpdated',
      'hyp3e-utilities.partyStateUpdated',
      'updateActor',
      'updateItem',
    ],
  );

  const context = await first._prepareContext({});
  assert.equal(context.state, state);
  assert.equal(context.canEdit, true);
  assert.equal(context.permissionReason, 'minimumRole');
  await classes.OpenPartySheetApplication.DEFAULT_OPTIONS.actions.selectTab
    .call(first, undefined, { dataset: { tab: 'followers' } });
  assert.equal((await first._prepareContext({})).activeTab.id, 'followers');

  const renderCount = first.renderCount;
  for (const { callback } of subscriptions.values()) callback();
  assert.equal(scheduledRefreshes.length, 1);
  await scheduledRefreshes.shift()();
  assert.equal(first.renderCount, renderCount + 1);

  await first.close();
  assert.equal(subscriptions.size, 0);
  assert.equal(removed.length, 8);
  const replacement = new classes.OpenPartySheetApplication();
  assert.notEqual(replacement, first);
});

test('Party Sheet external refreshes target tracked documents and retain local view state', async () => {
  const subscriptions = new Map();
  const scheduledRefreshes = [];
  const state = createPartyStateDefault();
  state.revision = 5;
  state.memberActorUuids = ['Actor.hero'];
  state.followerActorUuids = ['Actor.follower'];
  state.treasuryActorUuid = 'Actor.treasury';
  state.notes = '<p>Saved notes</p>';
  const classes = createFoundationApplications({
    ApplicationV2: StubApplicationV2,
    HandlebarsApplicationMixin: (Base) => class extends Base {},
    game: {
      settings: { get: (_namespace, key) => key.includes('Minimum') ? 4 : [] },
      user: { id: 'gm', isGM: true, role: 4 },
      users: [],
    },
    hooks: {
      on: (name, callback) => {
        subscriptions.set(name, callback);
        return name;
      },
      off: (name) => subscriptions.delete(name),
    },
    partyNotesProvider: () => ({
      getNotes: (currentState) => ({
        notes: currentState.notes,
        treasureNotes: { ...currentState.treasureNotes },
      }),
    }),
    partyStoreProvider: () => ({ getState: () => state }),
    scheduleExternalRefresh: (callback) => scheduledRefreshes.push(callback),
  });
  const app = new classes.OpenPartySheetApplication();
  app.rendered = true;
  await app._onFirstRender({}, {});

  const editor = {
    isDirty: () => true,
    value: '<p>Unsaved notes</p>',
  };
  const originalPanel = { scrollLeft: 7, scrollTop: 93 };
  app.element = {
    querySelector: (selector) => selector === '.hyp3e-utilities__party-panel'
      ? originalPanel
      : null,
    querySelectorAll: (selector) => selector === '[data-party-note-editor]'
      ? [{
        dataset: { partyNoteField: 'notes', partyNoteRevision: '5' },
        querySelector: () => editor,
      }]
      : [],
  };

  subscriptions.get('updateActor')({ uuid: 'Actor.untracked' });
  subscriptions.get('updateItem')({
    parent: { documentName: 'Actor', uuid: 'Actor.untracked' },
  });
  assert.equal(scheduledRefreshes.length, 0);

  subscriptions.get('updateActor')({ uuid: 'Actor.hero' });
  subscriptions.get('updateActor')({ uuid: 'Actor.follower' });
  subscriptions.get('updateItem')({
    parent: { documentName: 'Actor', uuid: 'Actor.treasury' },
  });
  assert.equal(scheduledRefreshes.length, 1);
  assert.deepEqual(app._partyNoteDraft, {
    baseRevision: 5,
    values: {
      notes: '<p>Unsaved notes</p>',
      treasureNotes: { gems: '', misc: '' },
    },
  });

  await scheduledRefreshes.shift()();
  assert.equal(app.renderCount, 1);
  const replacementPanel = { scrollLeft: 0, scrollTop: 0 };
  app.element = {
    querySelector: (selector) => selector === '.hyp3e-utilities__party-panel'
      ? replacementPanel
      : null,
    querySelectorAll: () => [],
  };
  app._restorePartySheetViewState();
  assert.deepEqual(replacementPanel, { scrollLeft: 7, scrollTop: 93 });

  subscriptions.get('deleteItem')({
    parent: { documentName: 'Actor', uuid: 'Actor.hero' },
  });
  assert.equal(scheduledRefreshes.length, 1);
  await app.close();
  await scheduledRefreshes.shift()();
  assert.equal(app.renderCount, 1);
});

test('Party Sheet Overview renders member rows and routes member actions through mutations', async () => {
  const state = createPartyStateDefault();
  state.revision = 4;
  state.memberActorUuids = ['Actor.hero'];
  const rows = [{
    actorUuid: 'Actor.hero',
    missing: false,
    name: 'Hero',
    summary: { armor: { ac: 5, dr: 1 }, hp: { value: 7, max: 9 } },
  }];
  const opened = [];
  const requests = [];
  const controlledActors = [
    {
      documentName: 'Actor',
      isToken: false,
      type: 'character',
      uuid: 'Actor.controlled',
    },
    {
      documentName: 'Actor',
      isToken: true,
      type: 'character',
      uuid: 'Scene.scene.Token.synthetic',
    },
  ];
  const game = {
    actors: new Map([['selected', { uuid: 'Actor.selected' }]]),
    i18n: { localize: (key) => key },
    settings: { get: (_namespace, key) => key.includes('Minimum') ? 1 : [] },
    user: { id: 'player', isGM: false, role: 1 },
    users: [],
  };
  const classes = createFoundationApplications({
    ApplicationV2: StubApplicationV2,
    HandlebarsApplicationMixin: (Base) => class extends Base {},
    actorDirectoryProvider: () => ({
      element: {
        querySelector: () => ({ dataset: { entryId: 'selected' } }),
      },
    }),
    canvasProvider: () => ({
      tokens: { controlled: controlledActors.map((actor) => ({ actor })) },
    }),
    game,
    partyMembersProvider: () => ({
      getActor: (actorUuid) => actorUuid === 'Actor.hero'
        ? { sheet: { render: (...args) => opened.push(args) } }
        : null,
      getMemberRows: () => rows,
    }),
    partyMutationsProvider: () => ({
      request: async (operation, envelope) => {
        requests.push({ envelope, operation });
        return {
          ok: true,
          value: { state: { revision: envelope.expectedRevision + 1 } },
        };
      },
    }),
    partyStoreProvider: () => ({ getState: () => state }),
    requestIdProvider: (() => {
      let id = 0;
      return () => `member-request-${++id}`;
    })(),
  });
  const app = new classes.OpenPartySheetApplication();

  const context = await app._prepareContext({});
  assert.equal(context.showOverview, true);
  assert.equal(context.hasMembers, true);
  assert.equal(context.members, rows);
  assert.equal(context.canRollPartyActions, false);

  await classes.OpenPartySheetApplication.DEFAULT_OPTIONS.actions.openMember
    .call(app, undefined, { dataset: { actorUuid: 'Actor.hero' } });
  assert.deepEqual(opened, [[true]]);

  await classes.OpenPartySheetApplication.DEFAULT_OPTIONS.actions.removeMember
    .call(app, undefined, { dataset: { actorUuid: 'Actor.hero' } });
  await classes.OpenPartySheetApplication.DEFAULT_OPTIONS.actions
    .addControlledMembers.call(app);
  await classes.OpenPartySheetApplication.DEFAULT_OPTIONS.actions
    .addSelectedActor.call(app);
  assert.deepEqual(requests, [
    {
      operation: PARTY_MEMBER_OPERATIONS.remove,
      envelope: {
        expectedRevision: 4,
        payload: { actorUuid: 'Actor.hero' },
        requestId: 'member-request-1',
      },
    },
    {
      operation: PARTY_MEMBER_OPERATIONS.add,
      envelope: {
        expectedRevision: 4,
        payload: { actorUuid: 'Actor.controlled' },
        requestId: 'member-request-2',
      },
    },
    {
      operation: PARTY_MEMBER_OPERATIONS.add,
      envelope: {
        expectedRevision: 4,
        payload: { actorUuid: 'Actor.selected' },
        requestId: 'member-request-3',
      },
    },
  ]);

  let directoryButton;
  let directoryButtonInserted = false;
  const actorDirectoryElement = {
    ownerDocument: {
      createElement: () => {
        directoryButton = {
          addEventListener: (_name, callback) => {
            directoryButton.click = callback;
          },
        };
        return directoryButton;
      },
    },
    querySelector: (selector) => {
      if (selector.includes('__directory-button')) {
        return directoryButtonInserted ? directoryButton : null;
      }
      return {
        parentNode: {
          insertBefore: () => { directoryButtonInserted = true; },
        },
      };
    },
  };
  classes.OpenPartySheetApplication.activateActorDirectory({
    element: actorDirectoryElement,
  });
  classes.OpenPartySheetApplication.activateActorDirectory({
    element: actorDirectoryElement,
  });
  assert.equal(directoryButtonInserted, true);
  assert.equal(
    directoryButton.title,
    'hyp3e-utilities.applications.partySheet.directoryButtonTitle',
  );
  const rendersBeforeDirectoryClick = app.renderCount;
  directoryButton.click({ preventDefault: () => {} });
  await new Promise((resolve) => setTimeout(resolve));
  assert.equal(app.renderCount, rendersBeforeDirectoryClick + 1);
});

test('Party Sheet Followers renders rows and routes employment, removal, and drop actions', async () => {
  const state = createPartyStateDefault();
  state.revision = 8;
  state.followerActorUuids = ['Actor.retainer'];
  const rows = [{
    actorUuid: 'Actor.retainer',
    missing: false,
    name: 'Retainer',
    share: 1,
    wageGp: 2,
  }];
  const opened = [];
  const requests = [];
  const game = {
    settings: { get: (_namespace, key) => key.includes('Minimum') ? 1 : [] },
    user: { id: 'player', isGM: false, role: 1 },
    users: [],
  };
  const classes = createFoundationApplications({
    ApplicationV2: StubApplicationV2,
    HandlebarsApplicationMixin: (Base) => class extends Base {},
    game,
    partyFollowersProvider: () => ({
      getActor: (actorUuid) => actorUuid === 'Actor.retainer'
        ? { sheet: { render: (...args) => opened.push(args) } }
        : null,
      getFollowerRows: () => rows,
    }),
    partyMutationsProvider: () => ({
      request: async (operation, envelope) => {
        requests.push({ envelope, operation });
        return {
          ok: true,
          value: { state: { revision: envelope.expectedRevision + 1 } },
        };
      },
    }),
    partyStoreProvider: () => ({ getState: () => state }),
    requestIdProvider: (() => {
      let id = 0;
      return () => `follower-request-${++id}`;
    })(),
  });
  const app = new classes.OpenPartySheetApplication();
  await classes.OpenPartySheetApplication.DEFAULT_OPTIONS.actions.selectTab
    .call(app, undefined, { dataset: { tab: 'followers' } });
  const context = await app._prepareContext({});
  assert.equal(context.showFollowers, true);
  assert.equal(context.hasFollowers, true);
  assert.deepEqual(context.followers, rows);

  await classes.OpenPartySheetApplication.DEFAULT_OPTIONS.actions.openFollower
    .call(app, undefined, { dataset: { actorUuid: 'Actor.retainer' } });
  assert.deepEqual(opened, [[true]]);

  const employmentRow = {
    querySelector: (selector) => ({
      value: selector.includes('wage') ? '4' : '1.25',
    }),
  };
  await classes.OpenPartySheetApplication.DEFAULT_OPTIONS.actions.saveFollower
    .call(app, undefined, {
      closest: () => employmentRow,
      dataset: { actorUuid: 'Actor.retainer' },
    });
  await classes.OpenPartySheetApplication.DEFAULT_OPTIONS.actions.removeFollower
    .call(app, undefined, { dataset: { actorUuid: 'Actor.retainer' } });
  await app._handleFollowerDrop({
    preventDefault: () => {},
    dataTransfer: {
      getData: () => JSON.stringify({ type: 'Actor', uuid: 'Actor.droppedNpc' }),
    },
  });

  assert.deepEqual(requests, [
    {
      operation: PARTY_FOLLOWER_OPERATIONS.setEmployment,
      envelope: {
        expectedRevision: 8,
        payload: {
          actorUuid: 'Actor.retainer',
          share: '1.25',
          wageGp: '4',
        },
        requestId: 'follower-request-1',
      },
    },
    {
      operation: PARTY_FOLLOWER_OPERATIONS.remove,
      envelope: {
        expectedRevision: 8,
        payload: { actorUuid: 'Actor.retainer' },
        requestId: 'follower-request-2',
      },
    },
    {
      operation: PARTY_FOLLOWER_OPERATIONS.add,
      envelope: {
        expectedRevision: 8,
        payload: { actorUuid: 'Actor.droppedNpc' },
        requestId: 'follower-request-3',
      },
    },
  ]);
});

test('Party Sheet row actions reuse the party action service for ping, saves, and morale', async () => {
  const state = createPartyStateDefault();
  state.memberActorUuids = ['Actor.hero'];
  state.followerActorUuids = ['Actor.npc', 'Actor.character'];
  const hero = { uuid: 'Actor.hero' };
  const npc = { uuid: 'Actor.npc' };
  const character = { uuid: 'Actor.character' };
  const actionCalls = [];
  const followerService = {
    getActor: (actorUuid) => ({
      'Actor.npc': npc,
      'Actor.character': character,
    })[actorUuid] ?? null,
    getFollowerRows: () => [
      { actorUuid: 'Actor.npc', canRollMorale: true },
      { actorUuid: 'Actor.character', canRollMorale: false },
    ],
  };
  const classes = createFoundationApplications({
    ApplicationV2: StubApplicationV2,
    HandlebarsApplicationMixin: (Base) => class extends Base {},
    game: {
      settings: { get: (_namespace, key) => key.includes('Minimum') ? 4 : [] },
      user: { id: 'gm', isGM: true, role: 4 },
      users: [],
    },
    partyActionsProvider: () => ({
      pingActor: async (actorUuid) => actionCalls.push(['ping', actorUuid]),
      rollMorale: async (actors) => actionCalls.push([
        'morale',
        actors.map((actor) => actor.uuid),
      ]),
      rollSave: async (actor, saveKey) => actionCalls.push([
        'save',
        actor.uuid,
        saveKey,
      ]),
    }),
    partyFollowersProvider: () => followerService,
    partyMembersProvider: () => ({
      getActor: (actorUuid) => actorUuid === 'Actor.hero' ? hero : null,
      getMemberRows: () => [{ actorUuid: 'Actor.hero', canRollSave: true }],
    }),
    partyStoreProvider: () => ({ getState: () => state }),
  });
  const app = new classes.OpenPartySheetApplication();
  const context = await app._prepareContext({});
  assert.equal(context.canRollPartyActions, true);
  assert.equal(context.hasFollowerMorale, true);

  const saveTarget = (actorUuid) => ({
    closest: () => ({
      querySelector: () => ({ value: 'sorcery' }),
    }),
    dataset: { actorUuid },
  });
  const actions = classes.OpenPartySheetApplication.DEFAULT_OPTIONS.actions;
  await actions.pingActor.call(app, undefined, {
    dataset: { actorUuid: 'Actor.hero' },
  });
  await actions.rollMemberSave.call(app, undefined, saveTarget('Actor.hero'));
  await actions.rollFollowerSave.call(
    app,
    undefined,
    saveTarget('Actor.character'),
  );
  await actions.rollFollowerMorale.call(app, undefined, {
    dataset: { actorUuid: 'Actor.npc' },
  });
  await actions.rollAllFollowerMorale.call(app);

  assert.deepEqual(actionCalls, [
    ['ping', 'Actor.hero'],
    ['save', 'Actor.hero', 'sorcery'],
    ['save', 'Actor.character', 'sorcery'],
    ['morale', ['Actor.npc']],
    ['morale', ['Actor.npc']],
  ]);
});

test('Party Sheet preserves follower drafts and rejects stale saves at their base revision', async () => {
  let state = createPartyStateDefault();
  state.revision = 2;
  state.followerActorUuids = ['Actor.retainer'];
  state.followerWages = { 'Actor.retainer': 2 };
  state.shares = { 'Actor.retainer': 1 };
  const requests = [];
  const followerService = {
    getFollowerRows: (currentState) => currentState.followerActorUuids.map(() => ({
      actorUuid: 'Actor.retainer',
      missing: false,
      share: currentState.shares['Actor.retainer'],
      wageGp: currentState.followerWages['Actor.retainer'],
    })),
  };
  const classes = createFoundationApplications({
    ApplicationV2: StubApplicationV2,
    HandlebarsApplicationMixin: (Base) => class extends Base {},
    game: {
      settings: { get: (_namespace, key) => key.includes('Minimum') ? 4 : [] },
      user: { id: 'gm', isGM: true, role: 4 },
      users: [],
    },
    partyFollowersProvider: () => followerService,
    partyMutationsProvider: () => ({
      request: async (operation, envelope) => {
        requests.push({ envelope, operation });
        return { error: { code: 'staleRevision' }, ok: false };
      },
    }),
    partyStoreProvider: () => ({ getState: () => state }),
    requestIdProvider: () => 'stale-follower-save',
  });
  const app = new classes.OpenPartySheetApplication();
  const draftRow = {
    dataset: { actorUuid: 'Actor.retainer' },
    querySelector: (selector) => ({
      value: selector.includes('wage') ? '9' : '1.5',
    }),
  };
  app._captureFollowerDraft({
    target: { closest: () => draftRow },
  });

  state = {
    ...state,
    revision: 3,
    followerWages: { 'Actor.retainer': 4 },
  };
  const staleContext = await app._prepareContext({});
  assert.equal(staleContext.hasUnsavedChanges, true);
  assert.equal(staleContext.hasStaleDraft, true);
  assert.equal(staleContext.followers[0].wageGp, '9');
  assert.equal(staleContext.followers[0].share, '1.5');

  await classes.OpenPartySheetApplication.DEFAULT_OPTIONS.actions.saveFollower
    .call(app, undefined, {
      closest: () => draftRow,
      dataset: { actorUuid: 'Actor.retainer' },
    });
  assert.equal(requests[0].envelope.expectedRevision, 2);
  assert.equal((await app._prepareContext({})).hasStaleDraft, true);

  await classes.OpenPartySheetApplication.DEFAULT_OPTIONS.actions
    .discardPartyDrafts.call(app);
  const discardedContext = await app._prepareContext({});
  assert.equal(discardedContext.hasUnsavedChanges, false);
  assert.equal(discardedContext.hasStaleDraft, false);
  assert.equal(discardedContext.followers[0].wageGp, 4);

  app._captureFollowerDraft({
    target: { closest: () => draftRow },
  });
  state = {
    ...state,
    revision: 4,
    followerActorUuids: [],
    followerWages: {},
    shares: {},
  };
  const removedContext = await app._prepareContext({});
  assert.equal(removedContext.hasUnsavedChanges, false);
  assert.equal(removedContext.followers.length, 0);
});

test('Party Sheet Marching Order enriches rows, routes controls/drop, and preserves note drafts', async () => {
  let state = createPartyStateDefault();
  state.revision = 5;
  state.memberActorUuids = ['Actor.hero', 'Actor.missing'];
  state.followerActorUuids = ['Actor.retainer'];
  state.marchingOrder.front = {
    actorUuids: ['Actor.hero'],
    notes: 'Authoritative front',
  };
  const requests = [];
  const classes = createFoundationApplications({
    ApplicationV2: StubApplicationV2,
    HandlebarsApplicationMixin: (Base) => class extends Base {},
    game: {
      settings: { get: (_namespace, key) => key.includes('Minimum') ? 4 : [] },
      user: { id: 'gm', isGM: true, role: 4 },
      users: [],
    },
    partyFollowersProvider: () => ({
      getActor: () => null,
      getFollowerRows: () => [{
        actorUuid: 'Actor.retainer',
        img: 'retainer.webp',
        missing: false,
        name: 'Retainer',
      }],
    }),
    partyMarchingOrderProvider: () => ({
      getModel: (currentState) => createMarchingOrderModel(currentState),
    }),
    partyMembersProvider: () => ({
      getActor: () => null,
      getMemberRows: () => [
        {
          actorUuid: 'Actor.hero',
          img: 'hero.webp',
          missing: false,
          name: 'Hero',
        },
        {
          actorUuid: 'Actor.missing',
          img: 'missing.webp',
          missing: true,
          name: 'Actor.missing',
        },
      ],
    }),
    partyMutationsProvider: () => ({
      request: async (operation, envelope) => {
        requests.push({ envelope, operation });
        if (operation === PARTY_MARCHING_OPERATIONS.setNote) {
          return { error: { code: 'staleRevision' }, ok: false };
        }
        return { ok: true };
      },
    }),
    partyStoreProvider: () => ({ getState: () => state }),
    requestIdProvider: (() => {
      let sequence = 0;
      return () => `marching-${sequence += 1}`;
    })(),
  });
  const app = new classes.OpenPartySheetApplication();
  const actions = classes.OpenPartySheetApplication.DEFAULT_OPTIONS.actions;
  await actions.selectTab.call(app, undefined, {
    dataset: { tab: 'marchingOrder' },
  });

  const context = await app._prepareContext({});
  assert.equal(context.showMarchingOrder, true);
  assert.deepEqual(context.marchingGroups.map(({ id }) => id), [
    'unassigned',
    'front',
    'middle',
    'rear',
  ]);
  assert.equal(context.marchingGroups[0].rows[0].name, 'Actor.missing');
  assert.equal(context.marchingGroups[0].rows[1].name, 'Retainer');
  assert.equal(context.marchingGroups[1].rows[0].name, 'Hero');
  assert.equal(context.marchingGroups[1].rows[0].canMovePrevious, true);
  assert.equal(context.marchingGroups[1].rows[0].canMoveNext, true);
  assert.equal(context.marchingGroups[1].rows[0].canMoveUp, false);

  await actions.moveMarchingActor.call(app, undefined, {
    dataset: {
      actorUuid: 'Actor.hero',
      targetPosition: '0',
      targetRank: 'middle',
    },
  });
  await actions.moveMarchingActor.call(app, undefined, {
    dataset: {
      actorUuid: 'Actor.hero',
      targetRank: 'unassigned',
    },
  });

  app._captureMarchingNoteDraft({
    target: {
      closest: () => ({ dataset: { marchingRank: 'front' } }),
      value: 'Draft front',
    },
  });
  state = {
    ...state,
    revision: 6,
    marchingOrder: {
      ...state.marchingOrder,
      front: { ...state.marchingOrder.front, notes: 'External front' },
    },
  };
  const staleContext = await app._prepareContext({});
  assert.equal(staleContext.marchingGroups[1].notes, 'Draft front');
  assert.equal(staleContext.hasStaleDraft, true);
  await actions.saveMarchingNote.call(app, undefined, {
    dataset: { marchingRank: 'front' },
  });

  await app._handleMarchingDrop({
    preventDefault: () => {},
    target: {
      closest: (selector) => selector.includes('row')
        ? { dataset: { marchingPosition: '0', marchingRank: 'rear' } }
        : { dataset: { marchingRank: 'rear' } },
    },
    dataTransfer: {
      getData: () => JSON.stringify({
        actorUuid: 'Actor.retainer',
        type: 'Hyp3eUtilitiesMarchingActor',
      }),
    },
  });

  assert.deepEqual(requests, [
    {
      operation: PARTY_MARCHING_OPERATIONS.place,
      envelope: {
        expectedRevision: 5,
        payload: {
          actorUuid: 'Actor.hero',
          position: 0,
          rank: 'middle',
        },
        requestId: 'marching-1',
      },
    },
    {
      operation: PARTY_MARCHING_OPERATIONS.remove,
      envelope: {
        expectedRevision: 5,
        payload: { actorUuid: 'Actor.hero' },
        requestId: 'marching-2',
      },
    },
    {
      operation: PARTY_MARCHING_OPERATIONS.setNote,
      envelope: {
        expectedRevision: 5,
        payload: { rank: 'front', text: 'Draft front' },
        requestId: 'marching-3',
      },
    },
    {
      operation: PARTY_MARCHING_OPERATIONS.place,
      envelope: {
        expectedRevision: 6,
        payload: {
          actorUuid: 'Actor.retainer',
          position: 0,
          rank: 'rear',
        },
        requestId: 'marching-4',
      },
    },
  ]);
  assert.equal((await app._prepareContext({})).hasStaleDraft, true);
  await actions.discardPartyDrafts.call(app);
  const discarded = await app._prepareContext({});
  assert.equal(discarded.hasUnsavedChanges, false);
  assert.equal(discarded.marchingGroups[1].notes, 'External front');
});

test('Party Sheet reports authoritative marching ranks without local note drafts', async () => {
  const state = createPartyStateDefault();
  state.revision = 9;
  state.memberActorUuids = ['Actor.hero', 'Actor.missing'];
  state.followerActorUuids = ['Actor.retainer'];
  state.marchingOrder.front = {
    actorUuids: ['Actor.hero', 'Actor.missing'],
    notes: 'Saved front note',
  };
  state.marchingOrder.rear = {
    actorUuids: ['Actor.retainer'],
    notes: '',
  };
  const reports = [];
  const actors = new Map([
    ['Actor.hero', { name: 'Hero' }],
    ['Actor.retainer', { name: 'Retainer' }],
  ]);
  const classes = createFoundationApplications({
    ApplicationV2: StubApplicationV2,
    HandlebarsApplicationMixin: (Base) => class extends Base {},
    chatCardsProvider: () => ({
      async createMarchingOrderReport(report) {
        reports.push(report);
        return { message: { id: 'report' }, revision: report.revision };
      },
    }),
    game: {
      settings: { get: (_namespace, key) => key.includes('Minimum') ? 4 : [] },
      user: { id: 'gm', isGM: true, role: 4 },
      users: [],
    },
    partyFollowersProvider: () => ({ getActor: (uuid) => actors.get(uuid) }),
    partyMarchingOrderProvider: () => ({
      getModel: (currentState) => createMarchingOrderModel(currentState),
    }),
    partyMembersProvider: () => ({ getActor: (uuid) => actors.get(uuid) }),
    partyStoreProvider: () => ({ getState: () => state }),
  });
  const app = new classes.OpenPartySheetApplication();
  app._marchingNoteDrafts.set('front', {
    baseRevision: 9,
    text: 'Unsaved front note',
  });

  const report = await classes.OpenPartySheetApplication.DEFAULT_OPTIONS
    .actions.reportMarchingOrder.call(app);

  assert.equal(report.message.id, 'report');
  assert.deepEqual(reports, [{
    groups: [
      {
        id: 'front',
        notes: 'Saved front note',
        rows: [
          { actorUuid: 'Actor.hero', name: 'Hero' },
          { actorUuid: 'Actor.missing', name: 'Actor.missing' },
        ],
      },
      { id: 'middle', notes: '', rows: [] },
      {
        id: 'rear',
        notes: '',
        rows: [{ actorUuid: 'Actor.retainer', name: 'Retainer' }],
      },
    ],
    revision: 9,
  }]);
});

test('Party Sheet Supplies preserves drafts and submits all counts at their base revision', async () => {
  let state = createPartyStateDefault();
  state.revision = 3;
  state.supplies = {
    torches: '10',
    lanterns: '2',
    oil: '4',
    rations: '20',
  };
  const requests = [];
  const classes = createFoundationApplications({
    ApplicationV2: StubApplicationV2,
    HandlebarsApplicationMixin: (Base) => class extends Base {},
    game: {
      settings: { get: (_namespace, key) => key.includes('Minimum') ? 4 : [] },
      user: { id: 'gm', isGM: true, role: 4 },
      users: [],
    },
    partyMutationsProvider: () => ({
      request: async (operation, envelope) => {
        requests.push({ envelope, operation });
        return { error: { code: 'staleRevision' }, ok: false };
      },
    }),
    partyStoreProvider: () => ({ getState: () => state }),
    partySuppliesProvider: () => ({
      getSupplies: (currentState) => ({ ...currentState.supplies }),
    }),
    requestIdProvider: () => 'supplies-1',
  });
  const app = new classes.OpenPartySheetApplication();
  const actions = classes.OpenPartySheetApplication.DEFAULT_OPTIONS.actions;
  await actions.selectTab.call(app, undefined, { dataset: { tab: 'supplies' } });
  assert.equal((await app._prepareContext({})).showSupplies, true);

  const values = {
    torches: '8',
    lanterns: '3',
    oil: '6',
    rations: '18',
  };
  app._captureSupplyDraft({
    target: {
      closest: () => ({
        querySelector: (selector) => ({
          value: values[selector.match(/"([^"]+)"/)[1]],
        }),
      }),
    },
  });
  state = {
    ...state,
    revision: 4,
    supplies: { torches: '7', lanterns: '1', oil: '2', rations: '16' },
  };
  const stale = await app._prepareContext({});
  assert.deepEqual(stale.supplies, values);
  assert.equal(stale.hasStaleDraft, true);

  await actions.saveSupplies.call(app);

  assert.deepEqual(requests, [{
    operation: PARTY_SUPPLY_OPERATIONS.set,
    envelope: {
      expectedRevision: 3,
      payload: values,
      requestId: 'supplies-1',
    },
  }]);
  assert.deepEqual((await app._prepareContext({})).supplies, values);
  await actions.discardPartyDrafts.call(app);
  assert.deepEqual((await app._prepareContext({})).supplies, state.supplies);
});

test('Party Sheet rich-text notes preserve drafts and save all fields atomically', async () => {
  let state = createPartyStateDefault();
  state.revision = 11;
  state.notes = '<p>Saved party note</p>';
  state.treasureNotes = {
    gems: '<p>Saved gems</p>',
    misc: '<p>Saved curios</p>',
  };
  const requests = [];
  const enrichmentCalls = [];
  const createdEditors = [];
  const game = {
    settings: { get: (_namespace, key) => key.includes('Minimum') ? 4 : [] },
    user: { id: 'gm', isGM: true, role: 4 },
    users: [],
  };
  const editorClass = {
    create(config) {
      const listeners = new Map();
      const editor = {
        ...config,
        dataset: {},
        dirty: false,
        addEventListener(name, listener) {
          listeners.set(name, listener);
        },
        dispatch(name) {
          listeners.get(name)?.({ currentTarget: editor, target: editor });
        },
        isDirty() { return this.dirty; },
      };
      createdEditors.push(editor);
      return editor;
    },
  };
  const classes = createFoundationApplications({
    ApplicationV2: StubApplicationV2,
    HandlebarsApplicationMixin: (Base) => class extends Base {},
    game,
    partyMutationsProvider: () => ({
      request: async (operation, envelope) => {
        requests.push({ envelope, operation });
        return { error: { code: 'staleRevision' }, ok: false };
      },
    }),
    partyNotesProvider: () => ({
      getNotes: (currentState) => ({
        notes: currentState.notes,
        treasureNotes: { ...currentState.treasureNotes },
      }),
    }),
    partyStoreProvider: () => ({ getState: () => state }),
    proseMirrorElementClass: editorClass,
    requestIdProvider: () => 'notes-1',
    textEditorProvider: () => ({
      enrichHTML: async (html, options) => {
        enrichmentCalls.push({ html, options });
        return `enriched:${html}`;
      },
    }),
  });
  const app = new classes.OpenPartySheetApplication();
  const actions = classes.OpenPartySheetApplication.DEFAULT_OPTIONS.actions;
  await actions.selectTab.call(app, undefined, { dataset: { tab: 'treasure' } });
  const context = await app._prepareContext({});
  assert.equal(context.showTreasure, true);
  assert.deepEqual(context.partyNotes, {
    notes: '<p>Saved party note</p>',
    treasureNotes: {
      gems: '<p>Saved gems</p>',
      misc: '<p>Saved curios</p>',
    },
  });
  assert.deepEqual(enrichmentCalls, [
    { html: '<p>Saved party note</p>', options: { async: true } },
    { html: '<p>Saved gems</p>', options: { async: true } },
    { html: '<p>Saved curios</p>', options: { async: true } },
  ]);

  const hosts = ['gems', 'misc'].map((field) => ({
    dataset: { partyNoteField: field },
    replaceChildren(editor) { this.editor = editor; },
  }));
  app.element = {
    querySelector: () => null,
    querySelectorAll: (selector) => selector === '[data-party-note-editor]'
      ? hosts
      : [],
  };
  await app._onRender(context, {});
  assert.equal(createdEditors.length, 2);
  app._captureMountedPartyNoteEditors();
  assert.equal((await app._prepareContext({})).hasUnsavedChanges, false);
  assert.deepEqual(createdEditors.map((editor) => ({
    collaborate: editor.collaborate,
    editable: editor.editable,
    name: editor.name,
    toggled: editor.toggled,
    value: editor.value,
  })), [
    {
      collaborate: false,
      editable: true,
      name: 'treasureNotes.gems',
      toggled: true,
      value: '<p>Saved gems</p>',
    },
    {
      collaborate: false,
      editable: true,
      name: 'treasureNotes.misc',
      toggled: true,
      value: '<p>Saved curios</p>',
    },
  ]);

  hosts[0].editor.value = '<p>Draft gems</p>';
  hosts[0].editor.dirty = true;
  state = {
    ...state,
    revision: 12,
    notes: '<p>External party note</p>',
    treasureNotes: {
      gems: '<p>External gems</p>',
      misc: '<p>External curios</p>',
    },
  };
  app._captureMountedPartyNoteEditors({ dirtyOnly: true });
  app._capturePartyNoteDraft('notes', '<p>Draft party note</p>');
  const stale = await app._prepareContext({});
  assert.deepEqual(stale.partyNotes, {
    notes: '<p>Draft party note</p>',
    treasureNotes: {
      gems: '<p>Draft gems</p>',
      misc: '<p>External curios</p>',
    },
  });
  assert.equal(stale.hasStaleDraft, true);

  await actions.savePartyNotes.call(app);

  assert.deepEqual(requests, [{
    operation: PARTY_NOTE_OPERATIONS.set,
    envelope: {
      expectedRevision: 11,
      payload: {
        notes: '<p>Draft party note</p>',
        treasureNotes: {
          gems: '<p>Draft gems</p>',
          misc: '<p>External curios</p>',
        },
      },
      requestId: 'notes-1',
    },
  }]);
  assert.equal((await app._prepareContext({})).hasStaleDraft, true);
  await actions.discardPartyDrafts.call(app);
  assert.deepEqual((await app._prepareContext({})).partyNotes, {
    notes: state.notes,
    treasureNotes: state.treasureNotes,
  });

  game.user = { id: 'denied', isGM: false, role: 1 };
  const readOnlyContext = await app._prepareContext({});
  await app._onRender(readOnlyContext, {});
  assert.equal(readOnlyContext.canEdit, false);
  assert.equal(
    createdEditors.slice(-2).every((editor) => editor.editable === false),
    true,
  );
});

test('Party Sheet Treasure tab exposes GM treasury recovery and selection actions', async () => {
  const state = createPartyStateDefault();
  state.revision = 14;
  state.treasuryActorUuid = 'Actor.missing';
  const opened = [];
  const bound = [];
  let recreated = 0;
  const primary = {
    name: 'Imported Treasury A',
    sheet: { render: async (force) => opened.push(force) },
    uuid: 'Actor.treasury-a',
  };
  const secondary = {
    name: 'Imported Treasury B',
    uuid: 'Actor.treasury-b',
  };
  const treasuryService = {
    bindTreasury: async (actorUuid) => {
      bound.push(actorUuid);
      return { ok: true };
    },
    getStatus: () => ({
      actor: null,
      candidates: [primary, secondary],
      configuredUuid: state.treasuryActorUuid,
      hasDuplicates: true,
      kind: 'ambiguous',
    }),
    recreateTreasury: async () => {
      recreated += 1;
      return { ok: true };
    },
  };
  const game = {
    settings: { get: (_namespace, key) => key.includes('Minimum') ? 4 : [] },
    user: { id: 'gm', isGM: true, role: 4 },
    users: [],
  };
  const classes = createFoundationApplications({
    ApplicationV2: StubApplicationV2,
    HandlebarsApplicationMixin: (Base) => class extends Base {},
    game,
    notifications: { error: () => {}, info: () => {} },
    partyStoreProvider: () => ({ getState: () => state }),
    partyTreasuryProvider: () => treasuryService,
  });
  const app = new classes.OpenPartySheetApplication();
  const actions = classes.OpenPartySheetApplication.DEFAULT_OPTIONS.actions;
  await actions.selectTab.call(app, undefined, { dataset: { tab: 'treasure' } });

  const context = await app._prepareContext({});
  assert.equal(context.canManageTreasury, true);
  assert.deepEqual(context.treasury, {
    actorUuid: '',
    candidates: [
      { actorUuid: primary.uuid, bound: false, name: primary.name },
      { actorUuid: secondary.uuid, bound: false, name: secondary.name },
    ],
    configuredUuid: state.treasuryActorUuid,
    hasDuplicates: true,
    kind: 'ambiguous',
    name: '',
    needsRecreation: false,
    needsSelection: true,
    ready: false,
    showCandidates: true,
  });

  await actions.bindPartyTreasury.call(app, undefined, {
    dataset: { actorUuid: secondary.uuid },
  });
  assert.deepEqual(bound, [secondary.uuid]);
  await actions.recreatePartyTreasury.call(app);
  assert.equal(recreated, 1);

  treasuryService.getStatus = () => ({
    actor: primary,
    candidates: [primary],
    configuredUuid: primary.uuid,
    hasDuplicates: false,
    kind: 'ready',
  });
  await actions.openPartyTreasury.call(app);
  assert.deepEqual(opened, [true]);

  game.user = { id: 'player', isGM: false, role: 1 };
  assert.equal((await app._prepareContext({})).canManageTreasury, false);
});
