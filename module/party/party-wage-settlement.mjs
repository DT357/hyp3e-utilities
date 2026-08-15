import {
  PARTY_MUTATION_ERROR_CODES,
  PartyMutationError,
  assertExactObject,
} from './party-mutation-protocol.mjs';

const WORLD_ACTOR_UUID_PATTERN = /^Actor\.([^\.\s]+)$/;

export const PARTY_WAGE_SETTLEMENT_OPERATIONS = Object.freeze({
  settle: 'party.settleFollowerWages',
});

export const PARTY_WAGE_SETTLEMENT_ERROR_CODES = Object.freeze({
  auditFailed: 'wageSettlementAuditFailed',
  invalidActor: 'wageSettlementInvalidActor',
  invalidPreview: 'wageSettlementInvalidPreview',
  previewChanged: 'wageSettlementPreviewChanged',
  rollbackFailed: 'wageSettlementRollbackFailed',
  writeFailed: 'wageSettlementWriteFailed',
});

function createRequestId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `wage-settlement-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function validatePayload(payload) {
  assertExactObject(payload, {
    allowedKeys: ['expectedFingerprint', 'selectedActorUuids'],
    label: 'Wage settlement payload',
  });
  if (
    typeof payload.expectedFingerprint !== 'string'
    || payload.expectedFingerprint.length < 2
    || payload.expectedFingerprint.length > 262144
  ) {
    throw new TypeError('Wage settlement fingerprint is invalid.');
  }
  if (!Array.isArray(payload.selectedActorUuids)) {
    throw new TypeError('Wage settlement recipients must be an array.');
  }
  const selectedActorUuids = payload.selectedActorUuids.map((actorUuid) => {
    if (typeof actorUuid !== 'string' || !WORLD_ACTOR_UUID_PATTERN.test(actorUuid)) {
      throw new TypeError('Wage settlement recipients must use world Actor UUIDs.');
    }
    return actorUuid;
  });
  if (new Set(selectedActorUuids).size !== selectedActorUuids.length) {
    throw new TypeError('Wage settlement recipients must be unique.');
  }
  return { expectedFingerprint: payload.expectedFingerprint, selectedActorUuids };
}

function previewFingerprint(preview) {
  return JSON.stringify({
    availableGp: preview.availableGp,
    canSettle: preview.canSettle,
    enoughGp: preview.enoughGp,
    followers: preview.followers.map((follower) => ({
      actorUuid: follower.actorUuid,
      missing: follower.missing,
      paymentGp: follower.paymentGp,
      selected: follower.selected,
      wageGp: follower.wageGp,
    })),
    remainingGp: preview.remainingGp,
    totalDueGp: preview.totalDueGp,
    treasuryActorUuid: preview.treasuryActorUuid,
  });
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

export function createPartyWageSettlementService({
  adapter,
  chatCards,
  game,
  logger = console,
  mutations,
  previewService,
  requestIdProvider = createRequestId,
  store,
} = {}) {
  if (typeof store?.getState !== 'function') {
    throw new TypeError('Party wage settlement requires a Party Store.');
  }
  if (
    typeof mutations?.registerOperation !== 'function'
    || typeof mutations?.request !== 'function'
  ) {
    throw new TypeError('Party wage settlement requires Party mutations.');
  }
  if (typeof previewService?.getPreview !== 'function') {
    throw new TypeError('Party wage settlement requires the wage preview service.');
  }
  if (typeof chatCards?.createWageSettlementReport !== 'function') {
    throw new TypeError('Party wage settlement requires wage audit chat.');
  }
  let executionQueue = Promise.resolve();

  async function restoreTreasury(treasury, beforeCoins) {
    try {
      await treasury.update(adapter.buildMoneyUpdate(beforeCoins));
    }
    catch (error) {
      logger.warn?.('Wage settlement rollback failed.', error);
      throw new PartyMutationError(
        PARTY_WAGE_SETTLEMENT_ERROR_CODES.rollbackFailed,
        'The wage settlement failed and the treasury rollback also failed.',
      );
    }
  }

  async function execute({ expectedRevision, payload, requester, requestId }) {
    const state = store.getState();
    if (expectedRevision !== state.revision) {
      throw new PartyMutationError(
        PARTY_MUTATION_ERROR_CODES.staleRevision,
        'The Party Sheet changed before wage settlement was confirmed.',
        { state },
      );
    }
    const preview = previewService.getPreview({
      selectedActorUuids: payload.selectedActorUuids,
    }, state);
    if (previewFingerprint(preview) !== payload.expectedFingerprint) {
      throw new PartyMutationError(
        PARTY_WAGE_SETTLEMENT_ERROR_CODES.previewChanged,
        'The treasury, followers, or wage rates changed after preview.',
      );
    }
    if (!preview.canSettle) {
      throw new PartyMutationError(
        PARTY_WAGE_SETTLEMENT_ERROR_CODES.invalidPreview,
        'Wage settlement requires valid positive wages and sufficient treasury GP.',
      );
    }
    const treasury = resolveActor(game, preview.treasuryActorUuid);
    if (!adapter.isManagedTreasury(treasury) || !adapter.canWriteMoney(treasury)) {
      throw new PartyMutationError(
        PARTY_WAGE_SETTLEMENT_ERROR_CODES.invalidActor,
        'The managed Party Treasury is unavailable or invalid.',
      );
    }

    const beforeCoins = adapter.getMoney(treasury);
    const afterCoins = { ...beforeCoins, gp: preview.remainingGp };
    try {
      await treasury.update(adapter.buildMoneyUpdate(afterCoins));
    }
    catch (error) {
      logger.warn?.('Wage settlement treasury write failed.', error);
      throw new PartyMutationError(
        PARTY_WAGE_SETTLEMENT_ERROR_CODES.writeFailed,
        'The wage settlement failed before the treasury could be updated.',
      );
    }

    const payments = preview.followers
      .filter((follower) => follower.selected && follower.paymentGp > 0)
      .map((follower) => ({
        actorUuid: follower.actorUuid,
        name: follower.name,
        paymentGp: follower.paymentGp,
      }));
    try {
      await chatCards.createWageSettlementReport({
        payments,
        remainingGp: preview.remainingGp,
        requestId,
        requesterName: requester?.name ?? '',
        requesterUserId: requester?.id ?? '',
        revision: state.revision,
        totalPaidGp: preview.totalDueGp,
        treasuryActorUuid: preview.treasuryActorUuid,
        treasuryName: preview.treasuryName,
      });
    }
    catch (error) {
      logger.warn?.('Wage settlement audit chat failed.', error);
      await restoreTreasury(treasury, beforeCoins);
      throw new PartyMutationError(
        PARTY_WAGE_SETTLEMENT_ERROR_CODES.auditFailed,
        'The wage audit could not be created; treasury GP was restored.',
      );
    }

    return {
      payments,
      remainingGp: preview.remainingGp,
      totalPaidGp: preview.totalDueGp,
      treasuryActorUuid: preview.treasuryActorUuid,
    };
  }

  mutations.registerOperation(PARTY_WAGE_SETTLEMENT_OPERATIONS.settle, {
    execute(context) {
      const pending = executionQueue.then(() => execute(context));
      executionQueue = pending.catch(() => undefined);
      return pending;
    },
    validatePayload,
  });

  function settle(
    preview,
    expectedRevision = store.getState().revision,
    requestId = requestIdProvider(),
  ) {
    return mutations.request(PARTY_WAGE_SETTLEMENT_OPERATIONS.settle, {
      expectedRevision,
      payload: {
        expectedFingerprint: previewFingerprint(preview),
        selectedActorUuids: preview.followers
          .filter((follower) => follower.selected)
          .map((follower) => follower.actorUuid),
      },
      requestId,
    });
  }

  return Object.freeze({ settle });
}
