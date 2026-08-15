import {
  assertExactObject,
  PartyMutationError,
} from './party-mutation-protocol.mjs';

const WORLD_ACTOR_UUID_PATTERN = /^Actor\.([^.\s]+)$/;

export const PARTY_FOLLOWER_OPERATIONS = Object.freeze({
  add: 'party.addFollower',
  remove: 'party.removeFollower',
  setEmployment: 'party.setFollowerEmployment',
});

export const PARTY_FOLLOWER_ERROR_CODES = Object.freeze({
  actorPermissionDenied: 'actorPermissionDenied',
  alreadyTracked: 'alreadyTracked',
  invalidActor: 'invalidActor',
  notTracked: 'notTracked',
});

function validateActorUuidPayload(payload) {
  assertExactObject(payload, {
    allowedKeys: ['actorUuid'],
    label: 'Party follower payload',
  });
  if (typeof payload.actorUuid !== 'string' || !payload.actorUuid.trim()) {
    throw new TypeError('Party follower actorUuid must be a non-empty string.');
  }
  return { actorUuid: payload.actorUuid.trim() };
}

function normalizeWholeGp(value) {
  const wageGp = Number(value);
  if (!Number.isInteger(wageGp) || wageGp < 0) {
    throw new TypeError('Follower wageGp must be a non-negative whole number.');
  }
  return wageGp;
}

function normalizeQuarterShare(value) {
  const share = Number(value);
  if (
    !Number.isFinite(share)
    || share < 0
    || !Number.isInteger(share * 4)
  ) {
    throw new TypeError('Follower share must be a non-negative quarter-share value.');
  }
  return share;
}

function validateEmploymentPayload(payload) {
  assertExactObject(payload, {
    allowedKeys: ['actorUuid', 'share', 'wageGp'],
    label: 'Follower employment payload',
  });
  return {
    ...validateActorUuidPayload({ actorUuid: payload.actorUuid }),
    share: normalizeQuarterShare(payload.share),
    wageGp: normalizeWholeGp(payload.wageGp),
  };
}

function resolveWorldActor(game, actorUuid) {
  const match = WORLD_ACTOR_UUID_PATTERN.exec(actorUuid);
  if (!match) return null;
  const actor = game?.actors?.get?.(match[1]) ?? null;
  if (
    actor?.documentName !== 'Actor'
    || actor?.uuid !== actorUuid
    || actor?.isToken === true
  ) return null;
  return actor;
}

function throwFollowerError(code, message) {
  throw new PartyMutationError(code, message);
}

export function createPartyFollowerService({
  adapter,
  game,
  store,
} = {}) {
  if (typeof store?.registerMutation !== 'function') {
    throw new TypeError('Party follower service requires a Party Store.');
  }
  const supportedTypes = new Set([
    adapter.actorTypes.character,
    adapter.actorTypes.npc,
  ]);

  function getActor(actorUuid) {
    return resolveWorldActor(game, actorUuid);
  }

  function getFollowerRows(state = store.getState()) {
    return state.followerActorUuids.map((actorUuid) => {
      const actor = getActor(actorUuid);
      const share = state.shares[actorUuid] ?? 1;
      const wageGp = state.followerWages[actorUuid] ?? 0;
      if (!actor) {
        return {
          actorUuid,
          canRollMorale: false,
          canRollSave: false,
          img: 'icons/svg/mystery-man.svg',
          invalidType: false,
          missing: true,
          name: actorUuid,
          npcSubtype: '',
          share,
          summary: null,
          wageGp,
        };
      }

      return {
        actorUuid,
        canRollMorale: Number.isFinite(adapter.getMorale(actor)),
        canRollSave: adapter.canRollSave(actor),
        img: actor.img || 'icons/svg/mystery-man.svg',
        invalidType: !supportedTypes.has(actor.type),
        missing: false,
        name: actor.name,
        npcSubtype: adapter.getNpcSubtype(actor),
        share,
        summary: adapter.getActorSummary(actor),
        wageGp,
      };
    });
  }

  store.registerMutation(PARTY_FOLLOWER_OPERATIONS.add, {
    validatePayload: validateActorUuidPayload,
    async mutate({ payload, requester, state }) {
      const actor = getActor(payload.actorUuid);
      if (!actor || !supportedTypes.has(actor.type)) {
        throwFollowerError(
          PARTY_FOLLOWER_ERROR_CODES.invalidActor,
          'Followers must be durable world character or NPC Actors.',
        );
      }
      if (
        !requester?.isGM
        && actor.testUserPermission?.(requester, 'OWNER') !== true
      ) {
        throwFollowerError(
          PARTY_FOLLOWER_ERROR_CODES.actorPermissionDenied,
          'The requesting user does not own this Actor.',
        );
      }
      if (
        state.memberActorUuids.includes(payload.actorUuid)
        || state.followerActorUuids.includes(payload.actorUuid)
      ) {
        throwFollowerError(
          PARTY_FOLLOWER_ERROR_CODES.alreadyTracked,
          'The Actor is already tracked by the Party Sheet.',
        );
      }

      state.followerActorUuids.push(payload.actorUuid);
      state.followerWages[payload.actorUuid] = 0;
      state.shares[payload.actorUuid] = 1;
    },
  });

  store.registerMutation(PARTY_FOLLOWER_OPERATIONS.setEmployment, {
    validatePayload: validateEmploymentPayload,
    async mutate({ payload, state }) {
      if (!state.followerActorUuids.includes(payload.actorUuid)) {
        throwFollowerError(
          PARTY_FOLLOWER_ERROR_CODES.notTracked,
          'The Actor is not a Party Sheet follower.',
        );
      }
      state.followerWages[payload.actorUuid] = payload.wageGp;
      state.shares[payload.actorUuid] = payload.share;
    },
  });

  store.registerMutation(PARTY_FOLLOWER_OPERATIONS.remove, {
    validatePayload: validateActorUuidPayload,
    async mutate({ payload, state }) {
      if (!state.followerActorUuids.includes(payload.actorUuid)) {
        throwFollowerError(
          PARTY_FOLLOWER_ERROR_CODES.notTracked,
          'The Actor is not a Party Sheet follower.',
        );
      }

      state.followerActorUuids = state.followerActorUuids.filter(
        (actorUuid) => actorUuid !== payload.actorUuid,
      );
      delete state.followerWages[payload.actorUuid];
      delete state.shares[payload.actorUuid];
      for (const rank of Object.values(state.marchingOrder)) {
        rank.actorUuids = rank.actorUuids.filter(
          (actorUuid) => actorUuid !== payload.actorUuid,
        );
      }
    },
  });

  return Object.freeze({
    getActor,
    getFollowerRows,
  });
}
