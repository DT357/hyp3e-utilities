import { COIN_KEYS } from '../core/constants.mjs';
import { allocateCoins } from './coin-distribution.mjs';
import {
  PARTY_MUTATION_ERROR_CODES,
  PartyMutationError,
  assertExactObject,
} from './party-mutation-protocol.mjs';

const WORLD_ACTOR_UUID_PATTERN = /^Actor\.([^\.\s]+)$/;

export const PARTY_COIN_PREVIEW_OPERATIONS = Object.freeze({
  preview: 'party.previewCoinDistribution',
});

export const PARTY_COIN_PREVIEW_ERROR_CODES = Object.freeze({
  invalidTreasury: 'coinDistributionInvalidTreasury',
});

function createRequestId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `coin-preview-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeSafeWhole(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.max(0, Math.trunc(numericValue)),
  );
}

function validateSplitCoins(value) {
  assertExactObject(value, {
    allowedKeys: COIN_KEYS,
    label: 'Coin preview split amounts',
  });
  return Object.fromEntries(COIN_KEYS.map((coinKey) => [
    coinKey,
    normalizeSafeWhole(value[coinKey]),
  ]));
}

function validateSelectedActorUuids(value) {
  if (!Array.isArray(value)) {
    throw new TypeError('Coin preview selected Actor UUIDs must be an array.');
  }
  const actorUuids = value.map((actorUuid) => {
    if (typeof actorUuid !== 'string' || !WORLD_ACTOR_UUID_PATTERN.test(actorUuid)) {
      throw new TypeError('Coin preview recipients must be world Actor UUIDs.');
    }
    return actorUuid;
  });
  if (new Set(actorUuids).size !== actorUuids.length) {
    throw new TypeError('Coin preview recipients must be unique.');
  }
  return actorUuids;
}

function validatePayload(payload) {
  assertExactObject(payload, {
    allowedKeys: ['selectedActorUuids', 'splitCoins'],
    label: 'Coin preview payload',
    requiredKeys: [],
  });
  return {
    selectedActorUuids: payload.selectedActorUuids === undefined
      ? null
      : validateSelectedActorUuids(payload.selectedActorUuids),
    splitCoins: payload.splitCoins === undefined
      ? null
      : validateSplitCoins(payload.splitCoins),
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

export function createPartyCoinPreviewService({
  adapter,
  game,
  mutations,
  requestIdProvider = createRequestId,
  store,
} = {}) {
  if (typeof store?.getState !== 'function') {
    throw new TypeError('Party coin preview requires a Party Store.');
  }
  if (
    typeof mutations?.registerOperation !== 'function'
    || typeof mutations?.request !== 'function'
  ) {
    throw new TypeError('Party coin preview requires Party mutations.');
  }

  function execute({ expectedRevision, payload }) {
    const state = store.getState();
    if (expectedRevision !== state.revision) {
      throw new PartyMutationError(
        PARTY_MUTATION_ERROR_CODES.staleRevision,
        'The Party Sheet changed before the coin preview was calculated.',
        { state },
      );
    }
    const treasury = resolveActor(game, state.treasuryActorUuid);
    if (!adapter.isManagedTreasury(treasury)) {
      throw new PartyMutationError(
        PARTY_COIN_PREVIEW_ERROR_CODES.invalidTreasury,
        'The configured Party Treasury is unavailable or invalid.',
      );
    }
    const recipientRows = [
      ...state.memberActorUuids,
      ...state.followerActorUuids,
    ].map((actorUuid) => {
      const actor = resolveActor(game, actorUuid);
      const supported = [adapter.actorTypes.character, adapter.actorTypes.npc]
        .includes(actor?.type);
      return {
        actorType: supported ? actor.type : 'missing',
        actorUuid,
        img: actor?.img || 'icons/svg/mystery-man.svg',
        missing: !supported,
        name: supported ? actor.name : actorUuid,
        share: supported ? (state.shares[actorUuid] ?? 1) : 0,
      };
    });
    const allocation = allocateCoins({
      availableCoins: adapter.getMoney(treasury),
      recipients: recipientRows,
      selectedActorUuids: payload.selectedActorUuids ?? undefined,
      splitCoins: payload.splitCoins ?? undefined,
    });
    return {
      ...allocation,
      distributions: allocation.distributions.map((distribution, index) => ({
        ...distribution,
        img: recipientRows[index].img,
        missing: recipientRows[index].missing,
        name: recipientRows[index].name,
        writebackLabel: distribution.writeback
          ? 'hyp3e-utilities.applications.partySheet.coinWritebackCharacter'
          : 'hyp3e-utilities.applications.partySheet.coinWritebackNpc',
      })),
      revision: state.revision,
      treasuryActorUuid: treasury.uuid,
      treasuryName: treasury.name ?? '',
    };
  }

  mutations.registerOperation(PARTY_COIN_PREVIEW_OPERATIONS.preview, {
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
    if (input.splitCoins !== undefined) payload.splitCoins = input.splitCoins;
    return mutations.request(PARTY_COIN_PREVIEW_OPERATIONS.preview, {
      expectedRevision,
      payload,
      requestId: requestIdProvider(),
    });
  }

  return Object.freeze({ requestPreview });
}
