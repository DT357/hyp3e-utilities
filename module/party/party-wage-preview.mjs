import { calculateWageSettlement } from './wage-calculation.mjs';
import {
  PARTY_MUTATION_ERROR_CODES,
  PartyMutationError,
  assertExactObject,
} from './party-mutation-protocol.mjs';

const WORLD_ACTOR_UUID_PATTERN = /^Actor\.([^\.\s]+)$/;

export const PARTY_WAGE_PREVIEW_OPERATIONS = Object.freeze({
  preview: 'party.previewFollowerWages',
});

export const PARTY_WAGE_PREVIEW_ERROR_CODES = Object.freeze({
  invalidTreasury: 'wageSettlementInvalidTreasury',
});

function createRequestId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `wage-preview-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function validateSelectedActorUuids(value) {
  if (!Array.isArray(value)) {
    throw new TypeError('Wage preview selected Actor UUIDs must be an array.');
  }
  const actorUuids = value.map((actorUuid) => {
    if (typeof actorUuid !== 'string' || !WORLD_ACTOR_UUID_PATTERN.test(actorUuid)) {
      throw new TypeError('Wage preview recipients must use a world Actor UUID.');
    }
    return actorUuid;
  });
  if (new Set(actorUuids).size !== actorUuids.length) {
    throw new TypeError('Wage preview recipients must be unique.');
  }
  return actorUuids;
}

function validatePayload(payload) {
  assertExactObject(payload, {
    allowedKeys: ['selectedActorUuids'],
    label: 'Wage preview payload',
    requiredKeys: [],
  });
  return {
    selectedActorUuids: payload.selectedActorUuids === undefined
      ? null
      : validateSelectedActorUuids(payload.selectedActorUuids),
  };
}

function resolveActor(game, actorUuid) {
  const actorId = WORLD_ACTOR_UUID_PATTERN.exec(actorUuid ?? '')?.[1];
  const actor = actorId ? game?.actors?.get?.(actorId) ?? null : null;
  return actor?.documentName === 'Actor'
    && actor.uuid === actorUuid
    && actor.isToken !== true
    ? actor
    : null;
}

export function createPartyWagePreviewService({
  adapter,
  game,
  mutations,
  requestIdProvider = createRequestId,
  store,
} = {}) {
  if (typeof store?.getState !== 'function') {
    throw new TypeError('Party wage preview requires a Party Store.');
  }
  if (
    typeof mutations?.registerOperation !== 'function'
    || typeof mutations?.request !== 'function'
  ) {
    throw new TypeError('Party wage preview requires Party mutations.');
  }

  function getPreview(
    { selectedActorUuids = null } = {},
    state = store.getState(),
  ) {
    const treasury = resolveActor(game, state.treasuryActorUuid);
    if (!adapter.isManagedTreasury(treasury)) {
      throw new PartyMutationError(
        PARTY_WAGE_PREVIEW_ERROR_CODES.invalidTreasury,
        'The configured Party Treasury is unavailable or invalid.',
      );
    }
    const followerRows = state.followerActorUuids.map((actorUuid) => {
      const actor = resolveActor(game, actorUuid);
      const supported = [adapter.actorTypes.character, adapter.actorTypes.npc]
        .includes(actor?.type);
      return {
        actorUuid,
        img: actor?.img || 'icons/svg/mystery-man.svg',
        missing: !supported,
        name: supported ? actor.name : actorUuid,
        wageGp: supported ? (state.followerWages[actorUuid] ?? 0) : 0,
      };
    });
    const defaultSelectedActorUuids = followerRows
      .filter((follower) => !follower.missing)
      .map((follower) => follower.actorUuid);
    const calculation = calculateWageSettlement({
      availableGp: adapter.getMoney(treasury).gp,
      followers: followerRows,
      selectedActorUuids: selectedActorUuids ?? defaultSelectedActorUuids,
    });
    return {
      ...calculation,
      followers: calculation.followers.map((follower, index) => ({
        ...follower,
        img: followerRows[index].img,
        missing: followerRows[index].missing,
      })),
      revision: state.revision,
      treasuryActorUuid: treasury.uuid,
      treasuryName: treasury.name ?? '',
    };
  }

  function execute({ expectedRevision, payload }) {
    const state = store.getState();
    if (expectedRevision !== state.revision) {
      throw new PartyMutationError(
        PARTY_MUTATION_ERROR_CODES.staleRevision,
        'The Party Sheet changed before the wage preview was calculated.',
        { state },
      );
    }
    return getPreview(payload, state);
  }

  mutations.registerOperation(PARTY_WAGE_PREVIEW_OPERATIONS.preview, {
    execute,
    validatePayload,
  });

  function requestPreview(
    input = {},
    expectedRevision = store.getState().revision,
  ) {
    const payload = {};
    if (input.selectedActorUuids !== undefined) {
      payload.selectedActorUuids = input.selectedActorUuids;
    }
    return mutations.request(PARTY_WAGE_PREVIEW_OPERATIONS.preview, {
      expectedRevision,
      payload,
      requestId: requestIdProvider(),
    });
  }

  return Object.freeze({ getPreview, requestPreview });
}
