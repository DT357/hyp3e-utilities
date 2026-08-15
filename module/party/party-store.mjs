import {
  MODULE_ID,
  SETTING_KEYS,
} from '../core/constants.mjs';
import {
  PARTY_MUTATION_ERROR_CODES,
  PartyMutationError,
} from './party-mutation-protocol.mjs';
import {
  PARTY_STATE_SCHEMA_VERSION,
  advancePartyStateRevision,
  normalizePartyState,
} from './party-state.mjs';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneSettingValue(value) {
  if (Array.isArray(value)) return value.map(cloneSettingValue);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, cloneSettingValue(entry)]),
  );
}

function valuesMatch(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createPartyStore({
  game,
  logger = console,
  protocol,
} = {}) {
  let queue = Promise.resolve();

  function enqueue(task) {
    const pending = queue.then(task);
    queue = pending.catch(() => undefined);
    return pending;
  }

  function readRawState() {
    return cloneSettingValue(game.settings.get(MODULE_ID, SETTING_KEYS.partyState));
  }

  function getState() {
    return normalizePartyState(readRawState());
  }

  function isActiveGm() {
    const activeGm = game.users?.activeGM;
    return Boolean(
      game.user?.isGM
      && activeGm?.id
      && activeGm.id === game.user.id,
    );
  }

  function requireActiveGm() {
    if (isActiveGm()) return;
    throw new PartyMutationError(
      PARTY_MUTATION_ERROR_CODES.notActiveGm,
      'Party state can only be written by the active GM.',
    );
  }

  async function persistWithRollback(previousSnapshot, nextState) {
    try {
      await game.settings.set(MODULE_ID, SETTING_KEYS.partyState, nextState);
      return;
    }
    catch (writeError) {
      let rolledBack = false;
      try {
        const observedState = readRawState();
        if (valuesMatch(observedState, previousSnapshot)) {
          rolledBack = true;
        }
        else {
          await game.settings.set(
            MODULE_ID,
            SETTING_KEYS.partyState,
            cloneSettingValue(previousSnapshot),
          );
          rolledBack = valuesMatch(readRawState(), previousSnapshot);
        }
      }
      catch (rollbackError) {
        logger.warn?.('Party state rollback failed.', rollbackError);
        throw new PartyMutationError(
          PARTY_MUTATION_ERROR_CODES.rollbackFailed,
          'The Party Sheet write failed and its prior state could not be restored.',
          { rolledBack: false },
        );
      }

      logger.warn?.('Party state write failed.', writeError);
      if (!rolledBack) {
        throw new PartyMutationError(
          PARTY_MUTATION_ERROR_CODES.rollbackFailed,
          'The Party Sheet write failed and rollback could not be verified.',
          { rolledBack: false },
        );
      }
      throw new PartyMutationError(
        PARTY_MUTATION_ERROR_CODES.stateWriteFailed,
        'The Party Sheet write failed; its prior state was restored.',
        { rolledBack: true },
      );
    }
  }

  async function initialize() {
    return enqueue(async () => {
      const rawState = readRawState();
      const state = normalizePartyState(rawState);
      if (!isActiveGm() || valuesMatch(rawState, state)) return state;
      requireActiveGm();
      await persistWithRollback(rawState, state);
      return state;
    });
  }

  function registerMutation(operation, { mutate, validatePayload }) {
    if (typeof mutate !== 'function') {
      throw new TypeError(`Party mutation "${operation}" requires a mutator.`);
    }
    protocol.registerOperation(operation, {
      validatePayload,
      execute: (context) => enqueue(async () => {
        requireActiveGm();
        const rawState = readRawState();
        const currentState = normalizePartyState(rawState);
        if (context.expectedRevision !== currentState.revision) {
          throw new PartyMutationError(
            PARTY_MUTATION_ERROR_CODES.staleRevision,
            'The Party Sheet changed before this operation could be applied.',
            { state: currentState },
          );
        }

        const draft = cloneSettingValue(currentState);
        const returnedState = await mutate({
          payload: context.payload,
          requester: context.requester,
          requestId: context.requestId,
          state: draft,
        });
        const candidate = returnedState ?? draft;
        if (!isPlainObject(candidate)) {
          throw new TypeError(`Party mutation "${operation}" must return state or mutate its state draft.`);
        }
        const nextState = advancePartyStateRevision({
          ...candidate,
          schemaVersion: PARTY_STATE_SCHEMA_VERSION,
          revision: currentState.revision,
        });
        requireActiveGm();
        await persistWithRollback(rawState, nextState);
        return {
          previousRevision: currentState.revision,
          state: nextState,
        };
      }),
    });
  }

  return Object.freeze({
    getState,
    initialize,
    registerMutation,
  });
}
