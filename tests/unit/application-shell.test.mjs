import assert from 'node:assert/strict';
import test from 'node:test';

import { TEMPLATE_PATHS } from '../../module/core/constants.mjs';
import {
  createFoundationApplications,
  preloadFoundationTemplates,
} from '../../module/apps/foundation-applications.mjs';
import { PARTY_MEMBER_OPERATIONS } from '../../module/party/party-members.mjs';
import { PARTY_FOLLOWER_OPERATIONS } from '../../module/party/party-followers.mjs';
import { createPartyStateDefault } from '../../module/party/party-state.mjs';

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
      'hyp3e-utilities.partyPermissionsUpdated',
      'hyp3e-utilities.partyStateUpdated',
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
  await new Promise((resolve) => setTimeout(resolve));
  assert.equal(first.renderCount, renderCount + 2);

  await first.close();
  assert.equal(subscriptions.size, 0);
  assert.equal(removed.length, 2);
  const replacement = new classes.OpenPartySheetApplication();
  assert.notEqual(replacement, first);
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
