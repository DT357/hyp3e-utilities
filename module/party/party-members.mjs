import {
  assertExactObject,
  PartyMutationError,
} from './party-mutation-protocol.mjs';

const WORLD_ACTOR_UUID_PATTERN = /^Actor\.([^.\s]+)$/;

export const PARTY_MEMBER_OPERATIONS = Object.freeze({
  add: 'party.addMember',
  remove: 'party.removeMember',
});

export const PARTY_MEMBER_ERROR_CODES = Object.freeze({
  actorPermissionDenied: 'actorPermissionDenied',
  alreadyTracked: 'alreadyTracked',
  invalidActor: 'invalidActor',
  notTracked: 'notTracked',
});

function validateActorUuidPayload(payload) {
  assertExactObject(payload, {
    allowedKeys: ['actorUuid'],
    label: 'Party member payload',
  });
  if (typeof payload.actorUuid !== 'string' || !payload.actorUuid.trim()) {
    throw new TypeError('Party member actorUuid must be a non-empty string.');
  }
  return { actorUuid: payload.actorUuid.trim() };
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

function throwMemberError(code, message) {
  throw new PartyMutationError(code, message);
}

export function createPartyMemberService({
  adapter,
  game,
  store,
} = {}) {
  if (typeof store?.registerMutation !== 'function') {
    throw new TypeError('Party member service requires a Party Store.');
  }

  function getActor(actorUuid) {
    return resolveWorldActor(game, actorUuid);
  }

  function getMemberRows(state = store.getState()) {
    return state.memberActorUuids.map((actorUuid) => {
      const actor = getActor(actorUuid);
      const share = state.shares[actorUuid] ?? 1;
      if (!actor) {
        return {
          actorUuid,
          className: '',
          img: 'icons/svg/mystery-man.svg',
          invalidType: false,
          level: 0,
          missing: true,
          name: actorUuid,
          race: '',
          share,
          summary: null,
        };
      }

      const summary = adapter.getActorSummary(actor);
      return {
        actorUuid,
        className: summary.className,
        img: actor.img || 'icons/svg/mystery-man.svg',
        invalidType: actor.type !== adapter.actorTypes.character,
        level: summary.level,
        missing: false,
        name: actor.name,
        race: summary.race,
        share,
        summary,
      };
    });
  }

  store.registerMutation(PARTY_MEMBER_OPERATIONS.add, {
    validatePayload: validateActorUuidPayload,
    async mutate({ payload, requester, state }) {
      const actor = getActor(payload.actorUuid);
      if (!actor || actor.type !== adapter.actorTypes.character) {
        throwMemberError(
          PARTY_MEMBER_ERROR_CODES.invalidActor,
          'Party members must be durable world character Actors.',
        );
      }
      if (
        !requester?.isGM
        && actor.testUserPermission?.(requester, 'OWNER') !== true
      ) {
        throwMemberError(
          PARTY_MEMBER_ERROR_CODES.actorPermissionDenied,
          'The requesting user does not own this Actor.',
        );
      }
      if (
        state.memberActorUuids.includes(payload.actorUuid)
        || state.followerActorUuids.includes(payload.actorUuid)
      ) {
        throwMemberError(
          PARTY_MEMBER_ERROR_CODES.alreadyTracked,
          'The Actor is already tracked by the Party Sheet.',
        );
      }

      state.memberActorUuids.push(payload.actorUuid);
      state.shares[payload.actorUuid] ??= 1;
    },
  });

  store.registerMutation(PARTY_MEMBER_OPERATIONS.remove, {
    validatePayload: validateActorUuidPayload,
    async mutate({ payload, state }) {
      if (!state.memberActorUuids.includes(payload.actorUuid)) {
        throwMemberError(
          PARTY_MEMBER_ERROR_CODES.notTracked,
          'The Actor is not a Party Sheet member.',
        );
      }

      state.memberActorUuids = state.memberActorUuids.filter(
        (actorUuid) => actorUuid !== payload.actorUuid,
      );
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
    getMemberRows,
  });
}
