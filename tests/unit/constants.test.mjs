import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COIN_KEYS,
  FLAG_KEYS,
  HOOK_NAMES,
  MODULE_ID,
  MODULE_TITLE,
  SAVE_KEYS,
  SETTING_KEYS,
  TEMPLATE_PATHS,
} from '../../module/core/constants.mjs';
import { createLogger } from '../../module/core/logger.mjs';

test('foundation constants expose stable namespaced contracts', () => {
  assert.equal(MODULE_ID, 'hyp3e-utilities');
  assert.equal(MODULE_TITLE, 'Hyp3e Utilities');
  assert.deepEqual(SAVE_KEYS, [
    'death',
    'device',
    'transformation',
    'avoidance',
    'sorcery',
  ]);
  assert.deepEqual(COIN_KEYS, ['cp', 'sp', 'ep', 'gp', 'pp']);
  assert.deepEqual(SETTING_KEYS, {
    enableNpcActionHud: 'enableNpcActionHud',
    npcActionHudPosition: 'npcActionHudPosition',
    partyState: 'partyState',
    partySheetMinimumEditRole: 'partySheetMinimumEditRole',
    partySheetExplicitEditorUserIds: 'partySheetExplicitEditorUserIds',
  });
  assert.deepEqual(FLAG_KEYS, { partyTreasury: 'partyTreasury' });
  assert.ok(Object.values(HOOK_NAMES).every(
    (hookName) => hookName.startsWith(`${MODULE_ID}.`),
  ));
  assert.ok(Object.values(TEMPLATE_PATHS).every(
    (path) => path.startsWith(`modules/${MODULE_ID}/templates/`),
  ));
});

test('logger consistently prefixes messages with the module title', () => {
  const calls = [];
  const logger = createLogger({
    info: (...args) => calls.push(args),
  });

  logger.info('Ready', { version: 1 });

  assert.deepEqual(calls, [
    ['Hyp3e Utilities | Ready', { version: 1 }],
  ]);
});
