import assert from 'node:assert/strict';
import test from 'node:test';

import { TEMPLATE_PATHS } from '../../module/core/constants.mjs';
import {
  createFoundationApplications,
  preloadFoundationTemplates,
} from '../../module/apps/foundation-applications.mjs';

class StubApplicationV2 {
  async close() {
    this.closed = true;
  }

  async render() {
    this.rerendered = true;
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
