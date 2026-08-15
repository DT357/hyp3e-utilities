import {
  CSS_NAMESPACE,
  HOOK_NAMES,
  MODULE_ID,
  SAVE_KEYS,
  SETTING_KEYS,
  TEMPLATE_PATHS,
} from '../core/constants.mjs';
import { validateHudPosition } from '../settings/settings.mjs';

export const NPC_ACTION_HUD_ID = `${MODULE_ID}-npc-action-hud`;
export const NPC_ACTION_HUD_MARGIN = 12;
export const NPC_ACTION_HUD_MAX_WIDTH = 704;
export const NPC_ACTION_HUD_MIN_WIDTH = 320;

const INTERACTIVE_CONTROL_SELECTOR = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  '[contenteditable="true"]',
].join(', ');

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function getHudWidth(width, viewportWidth, margin) {
  const availableWidth = Math.max(0, viewportWidth - (margin * 2));
  const maximumWidth = Math.min(NPC_ACTION_HUD_MAX_WIDTH, availableWidth);
  const minimumWidth = Math.min(NPC_ACTION_HUD_MIN_WIDTH, maximumWidth);
  const requestedWidth = Number.isFinite(Number(width))
    ? Number(width)
    : maximumWidth;
  return Math.round(clamp(requestedWidth, minimumWidth, maximumWidth));
}

export function getDefaultNpcActionHudPosition({
  margin = NPC_ACTION_HUD_MARGIN,
  viewportWidth,
} = {}) {
  const safeViewportWidth = Math.max(0, Number(viewportWidth) || 0);
  const width = getHudWidth(undefined, safeViewportWidth, margin);
  return Object.freeze({
    left: Math.round(Math.max(margin, (safeViewportWidth - width) / 2)),
    top: margin,
    width,
  });
}

export function clampNpcActionHudPosition(position = {}, {
  margin = NPC_ACTION_HUD_MARGIN,
  overlayHeight = 0,
  viewportHeight,
  viewportWidth,
} = {}) {
  const safeViewportHeight = Math.max(0, Number(viewportHeight) || 0);
  const safeViewportWidth = Math.max(0, Number(viewportWidth) || 0);
  const defaults = getDefaultNpcActionHudPosition({
    margin,
    viewportWidth: safeViewportWidth,
  });
  const width = getHudWidth(position.width, safeViewportWidth, margin);
  const maximumLeft = Math.max(margin, safeViewportWidth - width - margin);
  const maximumTop = Math.max(
    margin,
    safeViewportHeight - Math.max(0, Number(overlayHeight) || 0) - margin,
  );
  const requestedLeft = Number.isFinite(Number(position.left))
    ? Number(position.left)
    : defaults.left;
  const requestedTop = Number.isFinite(Number(position.top))
    ? Number(position.top)
    : defaults.top;

  return Object.freeze({
    left: Math.round(clamp(requestedLeft, margin, maximumLeft)),
    top: Math.round(clamp(requestedTop, margin, maximumTop)),
    width,
  });
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
  hooks = globalThis.Hooks,
  logger = console,
  notifications = globalThis.ui?.notifications,
  npcRolls,
  renderTemplate = globalThis.foundry?.applications?.handlebars?.renderTemplate
    ?? globalThis.renderTemplate,
  selection,
  window = globalThis.window,
} = {}) {
  let selectedSaveKey = SAVE_KEYS[0];
  let renderVersion = 0;
  let started = false;
  let unsubscribe = null;
  let boundOverlay = null;
  let dragState = null;
  let resizeBound = false;
  let settingsHookId = null;

  function getOverlay() {
    return document?.getElementById?.(NPC_ACTION_HUD_ID) ?? null;
  }

  function getViewport() {
    const viewportHeight = Number(window?.innerHeight);
    const viewportWidth = Number(window?.innerWidth);
    if (!Number.isFinite(viewportHeight) || !Number.isFinite(viewportWidth)) {
      return null;
    }
    return { viewportHeight, viewportWidth };
  }

  function applyPosition(overlay, position) {
    const viewport = getViewport();
    if (!overlay?.style || !viewport) return null;
    const rect = overlay.getBoundingClientRect?.() ?? {};
    const nextPosition = clampNpcActionHudPosition(
      validateHudPosition(position),
      { ...viewport, overlayHeight: rect.height },
    );
    overlay.style.left = `${nextPosition.left}px`;
    overlay.style.top = `${nextPosition.top}px`;
    overlay.style.transform = 'none';
    overlay.style.width = `${nextPosition.width}px`;
    return nextPosition;
  }

  function applyStoredPosition(overlay = getOverlay(), value) {
    const storedPosition = value ?? game?.settings?.get?.(
      MODULE_ID,
      SETTING_KEYS.npcActionHudPosition,
    ) ?? {};
    return applyPosition(overlay, storedPosition);
  }

  function applyCurrentPosition(overlay = getOverlay()) {
    const rect = overlay?.getBoundingClientRect?.();
    if (!rect) return null;
    return applyPosition(overlay, {
      left: rect.left,
      top: rect.top,
      width: rect.width,
    });
  }

  function onResize() {
    applyCurrentPosition();
  }

  function bindWindowListeners() {
    if (resizeBound || typeof window?.addEventListener !== 'function') return;
    window.addEventListener('resize', onResize);
    resizeBound = true;
  }

  function unbindWindowListeners() {
    if (!resizeBound) return;
    window?.removeEventListener?.('resize', onResize);
    resizeBound = false;
  }

  function remove() {
    const overlay = getOverlay();
    dragState = null;
    unbindWindowListeners();
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

  function getDragPosition(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return null;
    return {
      left: event.clientX - dragState.offsetX,
      top: event.clientY - dragState.offsetY,
      width: dragState.width,
    };
  }

  function onPointerDown(event) {
    if (
      event.button !== 0
      || event.isPrimary === false
      || !event.target?.closest?.('[data-drag-handle]')
      || event.target.closest(INTERACTIVE_CONTROL_SELECTOR)
    ) {
      return;
    }

    const overlay = getOverlay();
    const rect = overlay?.getBoundingClientRect?.();
    if (!overlay || !rect) return;
    dragState = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      pointerId: event.pointerId,
      width: rect.width,
    };
    try {
      overlay.setPointerCapture?.(event.pointerId);
    }
    catch {
      // Synthetic pointer events and some touch browsers cannot be captured.
    }
    overlay.classList?.add?.(`${MODULE_ID}-npc-action-hud-overlay--dragging`);
    event.preventDefault?.();
  }

  function onPointerMove(event) {
    const position = getDragPosition(event);
    if (!position) return null;
    event.preventDefault?.();
    return applyPosition(getOverlay(), position);
  }

  async function onPointerEnd(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return null;
    const overlay = getOverlay();
    const pointerId = dragState.pointerId;
    const position = Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
      ? onPointerMove(event)
      : applyCurrentPosition(overlay);
    dragState = null;
    try {
      overlay?.releasePointerCapture?.(pointerId);
    }
    catch {
      // The pointer can already be released when the browser cancels a drag.
    }
    overlay?.classList?.remove?.(
      `${MODULE_ID}-npc-action-hud-overlay--dragging`,
    );
    if (!position || typeof game?.settings?.set !== 'function') return position;
    try {
      await game.settings.set(
        MODULE_ID,
        SETTING_KEYS.npcActionHudPosition,
        { ...position },
      );
    }
    catch (error) {
      logger.warn?.('NPC Action HUD position could not be saved.', error);
    }
    return position;
  }

  function onSettingsChanged(key, value) {
    if (key === SETTING_KEYS.npcActionHudPosition) {
      applyStoredPosition(getOverlay(), value);
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
      overlay.addEventListener('pointerdown', onPointerDown);
      overlay.addEventListener('pointermove', onPointerMove);
      overlay.addEventListener('pointerup', onPointerEnd);
      overlay.addEventListener('pointercancel', onPointerEnd);
      boundOverlay = overlay;
    }
    if (!overlay.isConnected) document.body.append(overlay);
    bindWindowListeners();
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
    applyStoredPosition(overlay);
    return overlay;
  }

  async function start() {
    if (started) return getOverlay();
    if (typeof selection?.subscribe !== 'function') {
      throw new Error('The NPC selection controller is unavailable.');
    }
    started = true;
    if (typeof hooks?.on === 'function') {
      settingsHookId = hooks.on(HOOK_NAMES.settingsChanged, onSettingsChanged);
    }
    unsubscribe = selection.subscribe((model) => render(model).catch(
      (error) => reportActionError(error),
    ));
    return render(selection.getViewModel());
  }

  function destroy() {
    renderVersion += 1;
    unsubscribe?.();
    unsubscribe = null;
    if (settingsHookId !== null) {
      hooks?.off?.(HOOK_NAMES.settingsChanged, settingsHookId);
      settingsHookId = null;
    }
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
