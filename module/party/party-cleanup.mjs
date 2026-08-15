import {
  PARTY_MUTATION_ERROR_CODES,
  assertExactObject,
} from './party-mutation-protocol.mjs';

const WORLD_ACTOR_UUID_PATTERN = /^Actor\.([^\.\s]+)$/;
const MAX_STALE_RETRIES = 3;

export const PARTY_CLEANUP_OPERATIONS = Object.freeze({
  prune: 'party.pruneDeletedActors',
});

function createRequestId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `cleanup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function validateCleanupPayload(payload) {
  assertExactObject(payload, {
    allowedKeys: ['actorUuids'],
    label: 'Party cleanup payload',
  });
  if (!Array.isArray(payload.actorUuids) || payload.actorUuids.length < 1) {
    throw new TypeError('Party cleanup requires at least one world Actor UUID.');
  }
  const actorUuids = [...new Set(payload.actorUuids.map((actorUuid) => {
    if (typeof actorUuid !== 'string') return '';
    return actorUuid.trim();
  }))];
  if (
    actorUuids.some((actorUuid) => !WORLD_ACTOR_UUID_PATTERN.test(actorUuid))
  ) {
    throw new TypeError('Party cleanup actorUuids must be world Actor UUIDs.');
  }
  return { actorUuids };
}

function trackedActorUuids(state) {
  return [
    ...state.memberActorUuids,
    ...state.followerActorUuids,
  ];
}

function removeActorReferences(state, actorUuids) {
  const removed = new Set(actorUuids);
  state.memberActorUuids = state.memberActorUuids.filter(
    (actorUuid) => !removed.has(actorUuid),
  );
  state.followerActorUuids = state.followerActorUuids.filter(
    (actorUuid) => !removed.has(actorUuid),
  );
  for (const actorUuid of removed) {
    delete state.followerWages[actorUuid];
    delete state.shares[actorUuid];
  }
  for (const rank of Object.values(state.marchingOrder)) {
    rank.actorUuids = rank.actorUuids.filter(
      (actorUuid) => !removed.has(actorUuid),
    );
  }
}

export function createPartyCleanupService({
  game,
  hooks = globalThis.Hooks,
  logger = console,
  mutations,
  requestIdProvider = createRequestId,
  store,
} = {}) {
  if (
    typeof store?.getState !== 'function'
    || typeof store?.registerMutation !== 'function'
  ) {
    throw new TypeError('Party cleanup service requires a Party Store.');
  }
  if (typeof mutations?.request !== 'function') {
    throw new TypeError('Party cleanup service requires Party mutations.');
  }
  let cleanupQueue = Promise.resolve();
  let deleteActorHookId = null;

  store.registerMutation(PARTY_CLEANUP_OPERATIONS.prune, {
    validatePayload: validateCleanupPayload,
    async mutate({ payload, state }) {
      removeActorReferences(state, payload.actorUuids);
    },
  });

  function isActiveGm() {
    return Boolean(
      game?.user?.isGM
      && game.users?.activeGM?.id
      && game.users.activeGM.id === game.user.id,
    );
  }

  function enqueue(task) {
    const pending = cleanupQueue.then(task);
    cleanupQueue = pending.catch(() => undefined);
    return pending;
  }

  function findTrackedCandidates(actorUuids, state) {
    const candidates = new Set(actorUuids);
    return trackedActorUuids(state).filter((actorUuid) => (
      candidates.has(actorUuid)
    ));
  }

  function pruneActorUuids(actorUuids) {
    return enqueue(async () => {
      if (!isActiveGm()) return { ok: true, skipped: true };

      for (let attempt = 0; attempt <= MAX_STALE_RETRIES; attempt += 1) {
        const state = store.getState();
        const candidates = findTrackedCandidates(actorUuids, state);
        if (!candidates.length) return { ok: true, skipped: true };

        const response = await mutations.request(
          PARTY_CLEANUP_OPERATIONS.prune,
          {
            expectedRevision: state.revision,
            payload: { actorUuids: candidates },
            requestId: requestIdProvider(),
          },
        );
        if (response?.ok) return response;
        if (
          response?.error?.code
          !== PARTY_MUTATION_ERROR_CODES.staleRevision
        ) {
          logger.warn?.('Party reference cleanup failed.', response?.error);
          return response;
        }
      }

      const response = {
        error: {
          code: PARTY_MUTATION_ERROR_CODES.staleRevision,
          message: 'Party reference cleanup remained stale after retry.',
        },
        ok: false,
      };
      logger.warn?.('Party reference cleanup exhausted stale retries.');
      return response;
    });
  }

  function pruneDeletedActor(actor) {
    if (
      actor?.documentName !== 'Actor'
      || actor.isToken === true
      || !WORLD_ACTOR_UUID_PATTERN.test(actor.uuid ?? '')
    ) return Promise.resolve({ ok: true, skipped: true });
    return pruneActorUuids([actor.uuid]);
  }

  function pruneMissingReferences() {
    const state = store.getState();
    const missing = trackedActorUuids(state).filter((actorUuid) => {
      const actorId = WORLD_ACTOR_UUID_PATTERN.exec(actorUuid)?.[1];
      return actorId && !game?.actors?.get?.(actorId);
    });
    return pruneActorUuids(missing);
  }

  function start() {
    if (deleteActorHookId !== null) return;
    deleteActorHookId = hooks?.on?.('deleteActor', (actor) => {
      void pruneDeletedActor(actor).catch((error) => {
        logger.warn?.('Deleted Actor cleanup failed.', error);
      });
    }) ?? null;
  }

  function stop() {
    if (deleteActorHookId === null) return;
    hooks?.off?.('deleteActor', deleteActorHookId);
    deleteActorHookId = null;
  }

  return Object.freeze({
    pruneDeletedActor,
    pruneMissingReferences,
    start,
    stop,
  });
}
