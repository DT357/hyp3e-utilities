import {
  HOOK_NAMES,
  MODULE_ID,
  SETTING_KEYS,
} from '../core/constants.mjs';
import { createPartyStateDefault } from '../party/party-state.mjs';

export { createPartyStateDefault } from '../party/party-state.mjs';

const SETTING_NAMESPACE = `${MODULE_ID}.settings`;

export function validateHudPosition(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const allowedKeys = ['left', 'top', 'width'];
  const entries = allowedKeys
    .filter((key) => value[key] !== undefined)
    .map((key) => [key, Number(value[key])]);
  if (entries.some(([, entryValue]) => !Number.isFinite(entryValue))) return {};
  return Object.fromEntries(entries);
}

export function validateMinimumEditRole(value) {
  const role = Number(value);
  if (!Number.isInteger(role) || role < 1 || role > 4) {
    throw new TypeError('The minimum edit role must be an integer from 1 to 4.');
  }
  return role;
}

export function validateExplicitEditorUserIds(value) {
  if (!Array.isArray(value)) {
    throw new TypeError('Explicit editor user IDs must be an array.');
  }
  return [...new Set(value
    .filter((userId) => typeof userId === 'string')
    .map((userId) => userId.trim())
    .filter(Boolean))];
}

export function registerSettings({ game, hooks = globalThis.Hooks, menuTypes }) {
  const register = (key, options) => game.settings.register(
    MODULE_ID,
    key,
    options,
  );

  register(SETTING_KEYS.enableNpcActionHud, {
    name: `${SETTING_NAMESPACE}.enableNpcActionHud.name`,
    hint: `${SETTING_NAMESPACE}.enableNpcActionHud.hint`,
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
    onChange: (value) => hooks?.callAll?.(
      HOOK_NAMES.settingsChanged,
      SETTING_KEYS.enableNpcActionHud,
      value,
    ),
  });
  register(SETTING_KEYS.npcActionHudPosition, {
    name: `${SETTING_NAMESPACE}.npcActionHudPosition.name`,
    scope: 'client',
    config: false,
    type: Object,
    default: {},
    onChange: (value) => hooks?.callAll?.(
      HOOK_NAMES.settingsChanged,
      SETTING_KEYS.npcActionHudPosition,
      value,
    ),
  });
  register(SETTING_KEYS.partyState, {
    name: `${SETTING_NAMESPACE}.partyState.name`,
    scope: 'world',
    config: false,
    type: Object,
    default: createPartyStateDefault(),
    onChange: (value) => hooks?.callAll?.(
      HOOK_NAMES.partyStateUpdated,
      value,
    ),
  });
  register(SETTING_KEYS.partySheetMinimumEditRole, {
    name: `${SETTING_NAMESPACE}.partySheetMinimumEditRole.name`,
    scope: 'world',
    config: false,
    type: Number,
    default: 4,
  });
  register(SETTING_KEYS.partySheetExplicitEditorUserIds, {
    name: `${SETTING_NAMESPACE}.partySheetExplicitEditorUserIds.name`,
    scope: 'world',
    config: false,
    type: Array,
    default: [],
  });

  const registerMenu = (key, options) => game.settings.registerMenu(
    MODULE_ID,
    key,
    options,
  );
  registerMenu('resetHudPosition', {
    name: `${SETTING_NAMESPACE}.resetHudPosition.name`,
    label: `${SETTING_NAMESPACE}.resetHudPosition.label`,
    hint: `${SETTING_NAMESPACE}.resetHudPosition.hint`,
    icon: 'fas fa-arrows-to-dot',
    type: menuTypes.ResetHudPositionApplication,
    restricted: false,
  });
  registerMenu('partySheetPermissions', {
    name: `${SETTING_NAMESPACE}.partySheetPermissions.name`,
    label: `${SETTING_NAMESPACE}.partySheetPermissions.label`,
    hint: `${SETTING_NAMESPACE}.partySheetPermissions.hint`,
    icon: 'fas fa-user-shield',
    type: menuTypes.PartyPermissionsApplication,
    restricted: true,
  });
  registerMenu('openPartySheet', {
    name: `${SETTING_NAMESPACE}.openPartySheet.name`,
    label: `${SETTING_NAMESPACE}.openPartySheet.label`,
    hint: `${SETTING_NAMESPACE}.openPartySheet.hint`,
    icon: 'fas fa-users',
    type: menuTypes.OpenPartySheetApplication,
    restricted: false,
  });
}
