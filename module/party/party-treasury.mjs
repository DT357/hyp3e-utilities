import { FLAG_KEYS, MODULE_ID } from '../core/constants.mjs';
import {
  assertExactObject,
  PartyMutationError,
} from './party-mutation-protocol.mjs';

const DEFAULT_TREASURY_NAME = 'Party Treasury';
const MODULE_FOLDER_NAME = 'Hyp3e Utilities';
const WORLD_ACTOR_UUID_PATTERN = /^Actor\.([^\.\s]+)$/;

export const PARTY_TREASURY_OPERATIONS = Object.freeze({
  bind: 'party.bindTreasury',
});

export const PARTY_TREASURY_ERROR_CODES = Object.freeze({
  activeGmRequired: 'treasuryActiveGmRequired',
  creationFailed: 'treasuryCreationFailed',
  gmRequired: 'treasuryGmRequired',
  invalidTreasury: 'invalidTreasury',
  missingTreasury: 'missingTreasury',
  multipleTreasuries: 'multipleTreasuries',
});

function createRequestId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `treasury-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createError(code, message) {
  return { error: { code, message }, ok: false };
}

function validateBindPayload(payload) {
  assertExactObject(payload, {
    allowedKeys: ['actorUuid'],
    label: 'Party treasury payload',
  });
  if (
    typeof payload.actorUuid !== 'string'
    || !WORLD_ACTOR_UUID_PATTERN.test(payload.actorUuid.trim())
  ) {
    throw new TypeError('Party treasury actorUuid must be a world Actor UUID.');
  }
  return { actorUuid: payload.actorUuid.trim() };
}

export function createPartyTreasuryService({
  ActorClass = globalThis.Actor,
  adapter,
  FolderClass = globalThis.Folder,
  game,
  logger = console,
  mutations,
  ownershipLevels = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS,
  requestIdProvider = createRequestId,
  store,
} = {}) {
  if (
    typeof store?.getState !== 'function'
    || typeof store?.registerMutation !== 'function'
  ) {
    throw new TypeError('Party treasury service requires a Party Store.');
  }
  if (typeof mutations?.request !== 'function') {
    throw new TypeError('Party treasury service requires Party mutations.');
  }
  if (typeof adapter?.isManagedTreasury !== 'function') {
    throw new TypeError('Party treasury service requires the hyp3e adapter.');
  }
  let creationQueue = Promise.resolve();

  function isDurableManagedTreasury(actor) {
    return actor?.documentName === 'Actor'
      && actor.isToken !== true
      && WORLD_ACTOR_UUID_PATTERN.test(actor.uuid ?? '')
      && adapter.isManagedTreasury(actor);
  }

  function resolveActor(actorUuid) {
    const actorId = WORLD_ACTOR_UUID_PATTERN.exec(actorUuid ?? '')?.[1];
    const actor = actorId ? game?.actors?.get?.(actorId) : null;
    return isDurableManagedTreasury(actor) ? actor : null;
  }

  function getCandidates() {
    return Array.from(game?.actors ?? [])
      .filter(isDurableManagedTreasury)
      .sort((left, right) => (
        left.name.localeCompare(right.name)
        || left.uuid.localeCompare(right.uuid)
      ));
  }

  function getStatus(state = store.getState()) {
    const configuredUuid = state.treasuryActorUuid ?? '';
    const actor = resolveActor(configuredUuid);
    const candidates = getCandidates();
    if (actor) {
      return {
        actor,
        candidates,
        configuredUuid,
        hasDuplicates: candidates.length > 1,
        kind: 'ready',
      };
    }
    if (candidates.length > 1) {
      return {
        actor: null,
        candidates,
        configuredUuid,
        hasDuplicates: true,
        kind: 'ambiguous',
      };
    }
    if (candidates.length === 1) {
      return {
        actor: null,
        candidates,
        configuredUuid,
        hasDuplicates: false,
        kind: 'recoverable',
      };
    }
    return {
      actor: null,
      candidates,
      configuredUuid,
      hasDuplicates: false,
      kind: configuredUuid ? 'missing' : 'unbound',
    };
  }

  store.registerMutation(PARTY_TREASURY_OPERATIONS.bind, {
    validatePayload: validateBindPayload,
    async mutate({ payload, requester, state }) {
      if (requester?.isGM !== true) {
        throw new PartyMutationError(
          PARTY_TREASURY_ERROR_CODES.gmRequired,
          'Only a GM may bind the Party Treasury.',
        );
      }
      if (!resolveActor(payload.actorUuid)) {
        throw new PartyMutationError(
          PARTY_TREASURY_ERROR_CODES.invalidTreasury,
          'The selected Actor is not a flagged world treasure Actor.',
        );
      }
      state.treasuryActorUuid = payload.actorUuid;
    },
  });

  function isActiveGm() {
    return Boolean(
      game?.user?.isGM
      && game.users?.activeGM?.id
      && game.users.activeGM.id === game.user.id,
    );
  }

  function bindTreasury(actorUuid) {
    const state = store.getState();
    return mutations.request(
      PARTY_TREASURY_OPERATIONS.bind,
      {
        expectedRevision: state.revision,
        payload: { actorUuid },
        requestId: requestIdProvider(),
      },
    );
  }

  async function getOrCreateFolder() {
    const existing = Array.from(game?.folders ?? []).find((folder) => (
      folder?.type === 'Actor'
      && folder.name === MODULE_FOLDER_NAME
      && !folder.folder
    ));
    if (existing) return existing;
    if (typeof FolderClass?.create !== 'function') return null;
    try {
      return await FolderClass.create({
        folder: null,
        name: MODULE_FOLDER_NAME,
        type: 'Actor',
      });
    }
    catch (error) {
      logger.warn?.('Party Treasury folder could not be created.', error);
      return null;
    }
  }

  function enqueueCreation(task) {
    const pending = creationQueue.then(task);
    creationQueue = pending.catch(() => undefined);
    return pending;
  }

  function recreateTreasury() {
    return enqueueCreation(async () => {
      if (game?.user?.isGM !== true) {
        return createError(
          PARTY_TREASURY_ERROR_CODES.gmRequired,
          'Only a GM may create the Party Treasury.',
        );
      }
      if (!isActiveGm()) {
        return createError(
          PARTY_TREASURY_ERROR_CODES.activeGmRequired,
          'Only the active GM may create the Party Treasury.',
        );
      }

      const status = getStatus();
      if (status.kind === 'ready') {
        return { actor: status.actor, created: false, ok: true, status };
      }
      if (status.kind === 'recoverable') {
        const response = await bindTreasury(status.candidates[0].uuid);
        return { ...response, created: false, rebound: response.ok === true };
      }
      if (status.kind === 'ambiguous') {
        return createError(
          PARTY_TREASURY_ERROR_CODES.multipleTreasuries,
          'Multiple flagged Party Treasury Actors require GM selection.',
        );
      }
      if (typeof ActorClass?.create !== 'function') {
        return createError(
          PARTY_TREASURY_ERROR_CODES.creationFailed,
          'The Party Treasury Actor could not be created.',
        );
      }

      const folder = await getOrCreateFolder();
      const data = {
        flags: {
          [MODULE_ID]: { [FLAG_KEYS.partyTreasury]: true },
        },
        name: DEFAULT_TREASURY_NAME,
        ownership: {
          default: ownershipLevels?.NONE ?? 0,
          [game.user.id]: ownershipLevels?.OWNER ?? 3,
        },
        type: adapter.actorTypes.treasure,
      };
      if (folder?.id) data.folder = folder.id;

      let actor;
      try {
        actor = await ActorClass.create(data);
      }
      catch (error) {
        logger.warn?.('Party Treasury Actor creation failed.', error);
        return createError(
          PARTY_TREASURY_ERROR_CODES.creationFailed,
          'The Party Treasury Actor could not be created.',
        );
      }
      if (!isDurableManagedTreasury(actor)) {
        return createError(
          PARTY_TREASURY_ERROR_CODES.creationFailed,
          'The created Party Treasury Actor was invalid.',
        );
      }
      const response = await bindTreasury(actor.uuid);
      return {
        ...response,
        actor,
        created: response.ok === true,
      };
    });
  }

  async function initialize() {
    const status = getStatus();
    if (!isActiveGm()) return { ok: true, skipped: true, status };
    if (status.kind === 'ready') {
      return { actor: status.actor, created: false, ok: true, status };
    }
    if (status.kind === 'recoverable') {
      const response = await bindTreasury(status.candidates[0].uuid);
      return { ...response, created: false, rebound: response.ok === true };
    }
    if (status.kind === 'ambiguous') {
      return createError(
        PARTY_TREASURY_ERROR_CODES.multipleTreasuries,
        'Multiple flagged Party Treasury Actors require GM selection.',
      );
    }
    if (status.kind === 'missing') {
      return createError(
        PARTY_TREASURY_ERROR_CODES.missingTreasury,
        'The configured Party Treasury is missing and may be recreated by the GM.',
      );
    }
    return recreateTreasury();
  }

  return Object.freeze({
    bindTreasury,
    getStatus,
    initialize,
    recreateTreasury,
  });
}
