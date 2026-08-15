import {
  CSS_NAMESPACE,
  MODULE_ID,
  SAVE_KEYS,
  TEMPLATE_PATHS,
} from '../core/constants.mjs';

export const NPC_ACTION_HUD_ID = `${MODULE_ID}-npc-action-hud`;

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function createHpContext(hp = {}) {
  const value = Number(hp.value);
  const max = Number(hp.max);
  const safeValue = Number.isFinite(value) ? value : 0;
  const safeMax = Number.isFinite(max) ? Math.max(0, max) : 0;
  const percent = safeMax > 0
    ? Math.round(clamp(safeValue / safeMax, 0, 1) * 100)
    : 0;

  return Object.freeze({
    value: safeValue,
    max: safeMax,
    percent,
  });
}

function normalizeSaveKey(saveKey) {
  return SAVE_KEYS.includes(saveKey) ? saveKey : SAVE_KEYS[0];
}

export function buildNpcActionHudContext(
  selectionModel,
  { selectedSaveKey = SAVE_KEYS[0] } = {},
) {
  const activeSaveKey = normalizeSaveKey(selectedSaveKey);
  const rows = Object.freeze((selectionModel?.rows ?? []).map((row) => (
    Object.freeze({
      ...row,
      armor: Object.freeze({ ...row.armor }),
      hp: createHpContext(row.hp),
    })
  )));

  return Object.freeze({
    selectedCount: rows.length,
    rows,
    moraleAvailable: rows.some((row) => row.hasMorale),
    selectedSaveKey: activeSaveKey,
    saveOptions: Object.freeze(SAVE_KEYS.map((key) => Object.freeze({
      key,
      label: `${MODULE_ID}.hud.saves.${key}`,
      selected: key === activeSaveKey,
    }))),
  });
}

function formatMessage(game, key, values) {
  if (values && typeof game?.i18n?.format === 'function') {
    return game.i18n.format(key, values);
  }
  return game?.i18n?.localize?.(key) ?? key;
}

export function createNpcActionHud({
  chatCards,
  document = globalThis.document,
  fromUuid = globalThis.fromUuid,
  game = globalThis.game,
  logger = console,
  notifications = globalThis.ui?.notifications,
  npcRolls,
  renderTemplate = globalThis.foundry?.applications?.handlebars?.renderTemplate
    ?? globalThis.renderTemplate,
  selection,
} = {}) {
  let selectedSaveKey = SAVE_KEYS[0];
  let renderVersion = 0;
  let started = false;
  let unsubscribe = null;
  let boundOverlay = null;

  function getOverlay() {
    return document?.getElementById?.(NPC_ACTION_HUD_ID) ?? null;
  }

  function remove() {
    const overlay = getOverlay();
    overlay?.remove();
    if (boundOverlay === overlay) boundOverlay = null;
  }

  function notifyPartialReport(report) {
    const skipped = report?.skipped?.length ?? 0;
    const failed = report?.failures?.length ?? 0;
    if (skipped === 0 && failed === 0) return;
    notifications?.warn?.(formatMessage(
      game,
      `${MODULE_ID}.hud.partialWarning`,
      { skipped, failed },
    ));
  }

  async function createRollBatch(batch) {
    if (typeof chatCards?.createNpcRollBatch !== 'function') {
      throw new Error('The NPC chat-card service is unavailable.');
    }
    const report = await chatCards.createNpcRollBatch(batch);
    notifyPartialReport(report);
    return report;
  }

  async function openActorSheet(tokenUuid) {
    if (!tokenUuid || typeof fromUuid !== 'function') {
      throw new Error('A token UUID is required to open an NPC sheet.');
    }
    const token = await fromUuid(tokenUuid);
    if (typeof token?.actor?.sheet?.render !== 'function') {
      throw new Error(`Could not open the Actor sheet for "${tokenUuid}".`);
    }
    return token.actor.sheet.render(true);
  }

  async function executeAction(action, { tokenUuid } = {}) {
    if (action === 'openActorSheet') return openActorSheet(tokenUuid);

    const candidates = selection?.getRollCandidates?.() ?? [];
    if (action === 'reaction') {
      return createRollBatch(npcRolls.planReactionBatch(candidates));
    }
    if (action === 'save') {
      return createRollBatch(
        npcRolls.planSaveBatch(candidates, selectedSaveKey),
      );
    }
    if (action === 'morale') {
      return createRollBatch(npcRolls.planMoraleBatch(candidates));
    }
    throw new TypeError(`Unknown HUD action "${action}".`);
  }

  function reportActionError(error) {
    logger.warn?.('NPC Action HUD action failed.', error);
    notifications?.error?.(formatMessage(
      game,
      `${MODULE_ID}.hud.actionFailed`,
    ));
  }

  async function onClick(event) {
    const control = event.target?.closest?.('[data-action]');
    if (!control) return null;
    event.preventDefault?.();
    try {
      return await executeAction(control.dataset.action, {
        tokenUuid: control.dataset.tokenUuid,
      });
    }
    catch (error) {
      reportActionError(error);
      return null;
    }
  }

  function setSelectedSaveKey(saveKey) {
    if (!SAVE_KEYS.includes(saveKey)) {
      throw new TypeError(`Unknown save category "${saveKey}".`);
    }
    selectedSaveKey = saveKey;
    return selectedSaveKey;
  }

  function onChange(event) {
    if (event.target?.matches?.('[data-role="save-category"]')) {
      setSelectedSaveKey(event.target.value);
    }
  }

  function ensureOverlay() {
    if (!document?.body || typeof document.createElement !== 'function') {
      throw new Error('The browser document is unavailable.');
    }
    const overlay = getOverlay() ?? document.createElement('div');
    overlay.id = NPC_ACTION_HUD_ID;
    overlay.className = `${CSS_NAMESPACE} ${MODULE_ID}-npc-action-hud-overlay`;
    if (boundOverlay !== overlay) {
      overlay.addEventListener('click', onClick);
      overlay.addEventListener('change', onChange);
      boundOverlay = overlay;
    }
    if (!overlay.isConnected) document.body.append(overlay);
    return overlay;
  }

  async function render(model = selection?.getViewModel?.()) {
    const version = ++renderVersion;
    if (!model?.visible) {
      remove();
      return null;
    }
    if (typeof renderTemplate !== 'function') {
      throw new Error('Foundry template rendering is unavailable.');
    }

    const context = buildNpcActionHudContext(model, { selectedSaveKey });
    const markup = await renderTemplate(TEMPLATE_PATHS.npcActionHud, context);
    if (version !== renderVersion) return getOverlay();

    const overlay = ensureOverlay();
    overlay.innerHTML = markup;
    return overlay;
  }

  async function start() {
    if (started) return getOverlay();
    if (typeof selection?.subscribe !== 'function') {
      throw new Error('The NPC selection controller is unavailable.');
    }
    started = true;
    unsubscribe = selection.subscribe((model) => render(model).catch(
      (error) => reportActionError(error),
    ));
    return render(selection.getViewModel());
  }

  function destroy() {
    renderVersion += 1;
    unsubscribe?.();
    unsubscribe = null;
    started = false;
    remove();
  }

  return Object.freeze({
    destroy,
    executeAction,
    getElement: getOverlay,
    getSelectedSaveKey: () => selectedSaveKey,
    remove,
    render,
    setSelectedSaveKey,
    start,
  });
}
