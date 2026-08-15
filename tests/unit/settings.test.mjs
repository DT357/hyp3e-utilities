import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HOOK_NAMES,
  MODULE_ID,
  SETTING_KEYS,
} from '../../module/core/constants.mjs';
import {
  createPartyStateDefault,
  registerSettings,
  validateExplicitEditorUserIds,
  validateHudPosition,
  validateMinimumEditRole,
} from '../../module/settings/settings.mjs';

function createSettingsHarness() {
  const settings = [];
  const menus = [];
  const hookCalls = [];
  const game = {
    settings: {
      register: (namespace, key, options) => {
        settings.push({ namespace, key, options });
      },
      registerMenu: (namespace, key, options) => {
        menus.push({ namespace, key, options });
      },
    },
  };
  const menuTypes = {
    ResetHudPositionApplication: class {},
    PartyPermissionsApplication: class {},
    OpenPartySheetApplication: class {},
  };
  const hooks = {
    callAll: (...args) => hookCalls.push(args),
  };
  return { game, hookCalls, hooks, menuTypes, menus, settings };
}

test('settings register required scopes, visibility, defaults, and menus', () => {
  const harness = createSettingsHarness();
  registerSettings(harness);

  assert.deepEqual(
    harness.settings.map(({ namespace, key }) => [namespace, key]),
    Object.values(SETTING_KEYS).map((key) => [MODULE_ID, key]),
  );
  const byKey = Object.fromEntries(
    harness.settings.map(({ key, options }) => [key, options]),
  );
  assert.equal(byKey.enableNpcActionHud.scope, 'world');
  assert.equal(byKey.enableNpcActionHud.config, true);
  assert.equal(byKey.enableNpcActionHud.default, false);
  assert.equal(byKey.npcActionHudPosition.scope, 'client');
  assert.deepEqual(byKey.npcActionHudPosition.default, {});
  assert.equal(byKey.partyState.scope, 'world');
  assert.equal(byKey.partyState.config, false);
  assert.equal(byKey.partyState.default.schemaVersion, 1);
  assert.equal(byKey.partySheetMinimumEditRole.default, 4);
  assert.deepEqual(byKey.partySheetExplicitEditorUserIds.default, []);
  assert.deepEqual(
    harness.menus.map(({ key }) => key),
    ['resetHudPosition', 'partySheetPermissions', 'openPartySheet'],
  );
  assert.deepEqual(
    harness.menus.map(({ options }) => options.restricted),
    [false, true, false],
  );
  byKey.enableNpcActionHud.onChange(true);
  assert.deepEqual(harness.hookCalls, [[
    HOOK_NAMES.settingsChanged,
    SETTING_KEYS.enableNpcActionHud,
    true,
  ]]);
});

test('party state defaults are independent complete values', () => {
  const first = createPartyStateDefault();
  const second = createPartyStateDefault();
  first.memberActorUuids.push('Actor.changed');

  assert.deepEqual(second, {
    schemaVersion: 1,
    revision: 0,
    treasuryActorUuid: '',
    memberActorUuids: [],
    followerActorUuids: [],
    followerWages: {},
    shares: {},
    marchingOrder: {
      front: { actorUuids: [], notes: '' },
      middle: { actorUuids: [], notes: '' },
      rear: { actorUuids: [], notes: '' },
    },
    supplies: { torches: '', lanterns: '', oil: '', rations: '' },
    treasureNotes: { gems: '', misc: '' },
    notes: '',
  });
});

test('setting validators reject malformed values and normalize valid values', () => {
  assert.deepEqual(validateHudPosition({ left: 10, top: 20, width: 360 }), {
    left: 10,
    top: 20,
    width: 360,
  });
  assert.deepEqual(validateHudPosition({ left: 'bad' }), {});
  assert.equal(validateMinimumEditRole(2), 2);
  assert.throws(() => validateMinimumEditRole(0), /role/i);
  assert.throws(() => validateMinimumEditRole(5), /role/i);
  assert.deepEqual(
    validateExplicitEditorUserIds(['player', 'player', '', 'trusted']),
    ['player', 'trusted'],
  );
  assert.throws(() => validateExplicitEditorUserIds('player'), /array/i);
});
