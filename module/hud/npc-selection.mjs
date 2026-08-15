import { hyp3eAdapter } from '../adapters/hyp3e-adapter.mjs';
import {
  HOOK_NAMES,
  MODULE_ID,
  SETTING_KEYS,
} from '../core/constants.mjs';

const REFRESH_HOOKS = Object.freeze([
  'controlToken',
  'createToken',
  'deleteToken',
  HOOK_NAMES.settingsChanged,
]);

const HIGH_FREQUENCY_REFRESH_HOOKS = Object.freeze([
  'updateToken',
  'updateActor',
]);

function freezeModel({ rows = [], skipped = [] } = {}) {
  const frozenRows = Object.freeze(rows);
  return Object.freeze({
    visible: frozenRows.length > 0,
    selectedCount: frozenRows.length,
    rows: frozenRows,
    skipped: Object.freeze(skipped),
  });
}

const EMPTY_MODEL = freezeModel();
const EMPTY_CANDIDATES = Object.freeze([]);

function getTokenParts(token) {
  const document = token?.document ?? token;
  return {
    actor: token?.actor ?? document?.actor ?? null,
    document,
    tokenUuid: document?.uuid ?? token?.uuid ?? null,
  };
}

function createSkippedTarget(token, reason) {
  const { actor, document, tokenUuid } = getTokenParts(token);
  return Object.freeze({
    tokenUuid,
    actorUuid: actor?.uuid ?? null,
    name: document?.name ?? token?.name ?? actor?.name ?? '',
    reason,
  });
}

function compareRows(left, right) {
  return left.name.localeCompare(right.name)
    || left.tokenUuid.localeCompare(right.tokenUuid);
}

export function buildNpcSelectionViewModel(
  controlledTokens,
  { adapter = hyp3eAdapter } = {},
) {
  if (!Array.isArray(controlledTokens)) {
    throw new TypeError('Controlled tokens must be an array.');
  }

  const rows = [];
  const skipped = [];
  const seenTokenUuids = new Set();

  for (const token of controlledTokens) {
    const { actor, document, tokenUuid } = getTokenParts(token);
    if (!actor) {
      skipped.push(createSkippedTarget(token, 'missingActor'));
      continue;
    }
    if (!adapter.isNpcActor(actor)) {
      skipped.push(createSkippedTarget(token, 'unsupportedActor'));
      continue;
    }
    if (!tokenUuid) {
      skipped.push(createSkippedTarget(token, 'missingTokenUuid'));
      continue;
    }
    if (seenTokenUuids.has(tokenUuid)) {
      skipped.push(createSkippedTarget(token, 'duplicateToken'));
      continue;
    }
    seenTokenUuids.add(tokenUuid);

    const actorSummary = adapter.getActorSummary(actor);
    const morale = adapter.getMorale(actor);
    const saves = adapter.getSaves(actor);
    rows.push(Object.freeze({
      key: tokenUuid,
      tokenUuid,
      tokenId: document?.id ?? token?.id ?? null,
      actorId: actorSummary.id,
      actorUuid: actorSummary.uuid,
      isSynthetic: actorSummary.isSynthetic,
      name: document?.name ?? token?.name ?? actorSummary.name,
      hp: Object.freeze({ ...actorSummary.hp }),
      armor: Object.freeze({ ...actorSummary.armor }),
      movement: actorSummary.movement,
      morale,
      hasMorale: Number.isFinite(morale),
      saves: Object.freeze({ ...saves }),
    }));
  }

  rows.sort(compareRows);
  return freezeModel({ rows, skipped });
}

function modelSignature(model) {
  return JSON.stringify(model);
}

export function createNpcSelectionController({
  adapter = hyp3eAdapter,
  canvasProvider = () => globalThis.canvas,
  clearTimeout = globalThis.clearTimeout,
  debounceMilliseconds = 50,
  game = globalThis.game,
  hooks = globalThis.Hooks,
  logger = console,
  setTimeout = globalThis.setTimeout,
} = {}) {
  let activeCanvas = canvasProvider()?.ready === true;
  let candidates = EMPTY_CANDIDATES;
  let currentModel = EMPTY_MODEL;
  let currentSignature = modelSignature(currentModel);
  let pendingDebounce = null;
  let pendingSync = null;
  let started = false;
  const hookRegistrations = [];
  const subscribers = new Set();

  function isSelectionEnabled() {
    return game?.system?.id === 'hyp3e'
      && game?.user?.isGM === true
      && activeCanvas
      && canvasProvider()?.ready === true
      && game?.settings?.get?.(
        MODULE_ID,
        SETTING_KEYS.enableNpcActionHud,
      ) === true;
  }

  function notifySubscribers(model) {
    for (const subscriber of subscribers) {
      try {
        subscriber(model);
      } catch (error) {
        logger.warn?.('NPC selection subscriber failed.', error);
      }
    }
  }

  function sync() {
    const controlledTokens = isSelectionEnabled()
      ? Array.from(canvasProvider()?.tokens?.controlled ?? [])
      : [];
    const nextModel = buildNpcSelectionViewModel(controlledTokens, { adapter });
    const tokensByUuid = new Map(controlledTokens.map((token) => [
      getTokenParts(token).tokenUuid,
      token,
    ]));
    candidates = Object.freeze(nextModel.rows.map((row) => Object.freeze({
      tokenUuid: row.tokenUuid,
      actor: getTokenParts(tokensByUuid.get(row.tokenUuid)).actor,
    })));

    const nextSignature = modelSignature(nextModel);
    if (nextSignature === currentSignature) return currentModel;
    currentModel = nextModel;
    currentSignature = nextSignature;
    notifySubscribers(currentModel);
    return currentModel;
  }

  function requestSync() {
    if (pendingSync) return pendingSync;
    pendingSync = Promise.resolve()
      .then(() => (started ? sync() : currentModel))
      .catch((error) => {
        logger.warn?.('NPC selection synchronization failed.', error);
        return currentModel;
      })
      .finally(() => {
        pendingSync = null;
      });
    return pendingSync;
  }

  function requestDebouncedSync() {
    if (!started) return Promise.resolve(currentModel);
    if (!pendingDebounce) {
      let resolve;
      const promise = new Promise((resolver) => {
        resolve = resolver;
      });
      pendingDebounce = { promise, resolve, timerId: null };
    }

    const scheduled = pendingDebounce;
    if (scheduled.timerId !== null) clearTimeout(scheduled.timerId);
    scheduled.timerId = setTimeout(async () => {
      if (pendingDebounce === scheduled) pendingDebounce = null;
      scheduled.resolve(await requestSync());
    }, debounceMilliseconds);
    return scheduled.promise;
  }

  function cancelDebouncedSync() {
    if (!pendingDebounce) return;
    if (pendingDebounce.timerId !== null) {
      clearTimeout(pendingDebounce.timerId);
    }
    pendingDebounce.resolve(currentModel);
    pendingDebounce = null;
  }

  function registerHook(name, callback) {
    hookRegistrations.push({ name, id: hooks.on(name, callback) });
  }

  function start() {
    if (started) return currentModel;
    if (typeof hooks?.on !== 'function') {
      throw new TypeError('Foundry Hooks.on is unavailable.');
    }
    started = true;
    activeCanvas = canvasProvider()?.ready === true;
    registerHook('canvasReady', () => {
      activeCanvas = true;
      return requestSync();
    });
    registerHook('canvasTearDown', () => {
      activeCanvas = false;
      return requestSync();
    });
    for (const hookName of REFRESH_HOOKS) {
      registerHook(hookName, requestSync);
    }
    for (const hookName of HIGH_FREQUENCY_REFRESH_HOOKS) {
      registerHook(hookName, requestDebouncedSync);
    }
    return sync();
  }

  function destroy() {
    cancelDebouncedSync();
    for (const { name, id } of hookRegistrations.splice(0)) {
      hooks.off?.(name, id);
    }
    started = false;
    activeCanvas = false;
    candidates = EMPTY_CANDIDATES;
    currentModel = EMPTY_MODEL;
    currentSignature = modelSignature(currentModel);
    subscribers.clear();
  }

  function subscribe(subscriber) {
    if (typeof subscriber !== 'function') {
      throw new TypeError('NPC selection subscriber must be a function.');
    }
    subscribers.add(subscriber);
    return () => subscribers.delete(subscriber);
  }

  return Object.freeze({
    destroy,
    getRollCandidates: () => candidates,
    getViewModel: () => currentModel,
    requestSync,
    start,
    subscribe,
    sync,
  });
}
