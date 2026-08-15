import {
  PartyMutationError,
  assertExactObject,
} from './party-mutation-protocol.mjs';
import { normalizePartyState } from './party-state.mjs';

export const MARCHING_ORDER_RANKS = Object.freeze([
  'front',
  'middle',
  'rear',
]);
const MARCHING_ORDER_GROUPS = Object.freeze([
  'unassigned',
  ...MARCHING_ORDER_RANKS,
]);
const WORLD_ACTOR_UUID_PATTERN = /^Actor\.[^.\s]+$/;

export const PARTY_MARCHING_OPERATIONS = Object.freeze({
  place: 'party.placeMarchingActor',
  remove: 'party.removeMarchingActor',
  setNote: 'party.setMarchingNote',
  swap: 'party.swapMarchingActors',
});

export const PARTY_MARCHING_ERROR_CODES = Object.freeze({
  invalidPosition: 'invalidPosition',
  notTracked: 'notTracked',
});

function validateActorUuid(actorUuid, label = 'Marching-order actorUuid') {
  if (
    typeof actorUuid !== 'string'
    || !WORLD_ACTOR_UUID_PATTERN.test(actorUuid.trim())
  ) {
    throw new TypeError(`${label} must be a world Actor UUID.`);
  }
  return actorUuid.trim();
}

function validateRank(rank) {
  if (!MARCHING_ORDER_RANKS.includes(rank)) {
    throw new TypeError('Marching-order rank is invalid.');
  }
  return rank;
}

function validatePlacePayload(payload) {
  assertExactObject(payload, {
    allowedKeys: ['actorUuid', 'position', 'rank'],
    requiredKeys: ['actorUuid', 'rank'],
    label: 'Marching-order placement payload',
  });
  const validated = {
    actorUuid: validateActorUuid(payload.actorUuid),
    rank: validateRank(payload.rank),
  };
  if (Object.hasOwn(payload, 'position')) {
    if (!Number.isInteger(payload.position) || payload.position < 0) {
      throw new TypeError(
        'Marching-order position must be a non-negative integer.',
      );
    }
    validated.position = payload.position;
  }
  return validated;
}

function validateActorPayload(payload) {
  assertExactObject(payload, {
    allowedKeys: ['actorUuid'],
    label: 'Marching-order Actor payload',
  });
  return { actorUuid: validateActorUuid(payload.actorUuid) };
}

function validateSwapPayload(payload) {
  assertExactObject(payload, {
    allowedKeys: ['actorUuid', 'otherActorUuid'],
    label: 'Marching-order swap payload',
  });
  const actorUuid = validateActorUuid(payload.actorUuid);
  const otherActorUuid = validateActorUuid(
    payload.otherActorUuid,
    'Marching-order otherActorUuid',
  );
  if (actorUuid === otherActorUuid) {
    throw new TypeError('Marching-order swap Actors must be distinct.');
  }
  return { actorUuid, otherActorUuid };
}

function validateNotePayload(payload) {
  assertExactObject(payload, {
    allowedKeys: ['rank', 'text'],
    label: 'Marching-order note payload',
  });
  if (typeof payload.text !== 'string') {
    throw new TypeError('Marching-order note text must be a string.');
  }
  return { rank: validateRank(payload.rank), text: payload.text };
}

function cloneMarchingOrder(state) {
  const order = normalizePartyState(state).marchingOrder;
  return Object.fromEntries(MARCHING_ORDER_RANKS.map((rank) => [
    rank,
    {
      actorUuids: [...order[rank].actorUuids],
      notes: order[rank].notes,
    },
  ]));
}

function getTrackedActorUuids(state) {
  const normalized = normalizePartyState(state);
  return [
    ...normalized.memberActorUuids,
    ...normalized.followerActorUuids,
  ];
}

function requireTrackedActor(state, actorUuid) {
  if (getTrackedActorUuids(state).includes(actorUuid)) return;
  throw new PartyMutationError(
    PARTY_MARCHING_ERROR_CODES.notTracked,
    'Marching order only accepts tracked party Actors.',
  );
}

function removeFromOrder(order, actorUuid) {
  for (const rank of MARCHING_ORDER_RANKS) {
    order[rank].actorUuids = order[rank].actorUuids.filter(
      (entry) => entry !== actorUuid,
    );
  }
}

function findLocation(order, actorUuid) {
  for (const rank of MARCHING_ORDER_RANKS) {
    const position = order[rank].actorUuids.indexOf(actorUuid);
    if (position >= 0) return { position, rank };
  }
  return null;
}

export function createMarchingOrderModel(state) {
  const normalized = normalizePartyState(state);
  const assigned = new Set(MARCHING_ORDER_RANKS.flatMap(
    (rank) => normalized.marchingOrder[rank].actorUuids,
  ));
  const unassignedActorUuids = [
    ...normalized.memberActorUuids,
    ...normalized.followerActorUuids,
  ].filter((actorUuid) => !assigned.has(actorUuid));
  const groups = MARCHING_ORDER_GROUPS.map((id) => {
    const actorUuids = id === 'unassigned'
      ? unassignedActorUuids
      : normalized.marchingOrder[id].actorUuids;
    return {
      id,
      notes: id === 'unassigned' ? '' : normalized.marchingOrder[id].notes,
      rows: actorUuids.map((actorUuid, position) => ({
        actorUuid,
        position,
        rank: id,
      })),
    };
  });
  return {
    groups,
    hasAssignments: groups.slice(1).some(({ rows }) => rows.length > 0),
  };
}

export function placeMarchingActor(state, {
  actorUuid,
  position,
  rank,
}) {
  requireTrackedActor(state, actorUuid);
  validateRank(rank);
  const order = cloneMarchingOrder(state);
  removeFromOrder(order, actorUuid);
  const target = order[rank].actorUuids;
  const insertionPosition = position ?? target.length;
  if (
    !Number.isInteger(insertionPosition)
    || insertionPosition < 0
    || insertionPosition > target.length
  ) {
    throw new PartyMutationError(
      PARTY_MARCHING_ERROR_CODES.invalidPosition,
      'Marching-order position is outside the target rank.',
    );
  }
  target.splice(insertionPosition, 0, actorUuid);
  return order;
}

export function removeMarchingActor(state, actorUuid) {
  requireTrackedActor(state, actorUuid);
  const order = cloneMarchingOrder(state);
  removeFromOrder(order, actorUuid);
  return order;
}

export function swapMarchingActors(state, {
  actorUuid,
  otherActorUuid,
}) {
  requireTrackedActor(state, actorUuid);
  requireTrackedActor(state, otherActorUuid);
  if (actorUuid === otherActorUuid) {
    throw new TypeError('Marching-order swap Actors must be distinct.');
  }
  const order = cloneMarchingOrder(state);
  const location = findLocation(order, actorUuid);
  const otherLocation = findLocation(order, otherActorUuid);
  if (!location && !otherLocation) return order;
  if (location) {
    order[location.rank].actorUuids[location.position] = otherActorUuid;
  }
  if (otherLocation) {
    order[otherLocation.rank].actorUuids[otherLocation.position] = actorUuid;
  }
  return order;
}

export function createPartyMarchingOrderService({ store } = {}) {
  if (
    typeof store?.getState !== 'function'
    || typeof store?.registerMutation !== 'function'
  ) {
    throw new TypeError('Party marching-order service requires a Party Store.');
  }

  store.registerMutation(PARTY_MARCHING_OPERATIONS.place, {
    validatePayload: validatePlacePayload,
    async mutate({ payload, state }) {
      state.marchingOrder = placeMarchingActor(state, payload);
    },
  });
  store.registerMutation(PARTY_MARCHING_OPERATIONS.remove, {
    validatePayload: validateActorPayload,
    async mutate({ payload, state }) {
      state.marchingOrder = removeMarchingActor(state, payload.actorUuid);
    },
  });
  store.registerMutation(PARTY_MARCHING_OPERATIONS.swap, {
    validatePayload: validateSwapPayload,
    async mutate({ payload, state }) {
      state.marchingOrder = swapMarchingActors(state, payload);
    },
  });
  store.registerMutation(PARTY_MARCHING_OPERATIONS.setNote, {
    validatePayload: validateNotePayload,
    async mutate({ payload, state }) {
      state.marchingOrder[payload.rank].notes = payload.text;
    },
  });

  return Object.freeze({
    getModel: (state = store.getState()) => createMarchingOrderModel(state),
  });
}
