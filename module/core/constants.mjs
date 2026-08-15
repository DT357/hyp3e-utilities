export const MODULE_ID = 'hyp3e-utilities';
export const MODULE_TITLE = 'Hyp3e Utilities';

export const SUPPORTED_ENVIRONMENT = Object.freeze({
  foundryMinimum: 13,
  foundryMaximum: 14,
  systemId: 'hyp3e',
  systemMinimum: '4.0.3',
});

export const SAVE_KEYS = Object.freeze([
  'death',
  'device',
  'transformation',
  'avoidance',
  'sorcery',
]);

export const COIN_KEYS = Object.freeze(['cp', 'sp', 'ep', 'gp', 'pp']);

export const SETTING_KEYS = Object.freeze({
  enableNpcActionHud: 'enableNpcActionHud',
  npcActionHudPosition: 'npcActionHudPosition',
  partyState: 'partyState',
  partySheetMinimumEditRole: 'partySheetMinimumEditRole',
  partySheetExplicitEditorUserIds: 'partySheetExplicitEditorUserIds',
});

export const FLAG_KEYS = Object.freeze({
  partyTreasury: 'partyTreasury',
});

export const HOOK_NAMES = Object.freeze({
  partyStateUpdated: `${MODULE_ID}.partyStateUpdated`,
  ready: `${MODULE_ID}.ready`,
  settingsChanged: `${MODULE_ID}.settingsChanged`,
  socketReady: `${MODULE_ID}.socketReady`,
});

export const TEMPLATE_PATHS = Object.freeze({
  foundation: `modules/${MODULE_ID}/templates/foundation-shell.hbs`,
  resetHudPosition:
    `modules/${MODULE_ID}/templates/settings/reset-hud-position.hbs`,
  permissions:
    `modules/${MODULE_ID}/templates/settings/party-sheet-permissions.hbs`,
  partySheetPlaceholder:
    `modules/${MODULE_ID}/templates/party-sheet-placeholder.hbs`,
  npcActionHud:
    `modules/${MODULE_ID}/templates/npc-action-hud.hbs`,
});

export const CSS_NAMESPACE = MODULE_ID;
