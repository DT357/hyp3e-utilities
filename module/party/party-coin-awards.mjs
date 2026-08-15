import { COIN_KEYS } from '../core/constants.mjs';
import {
  PartyMutationError,
  assertExactObject,
} from './party-mutation-protocol.mjs';
import {
  assertDistributionPreflight,
  createDistributionTransaction,
} from './distribution-transaction.mjs';

const WORLD_ACTOR_UUID_PATTERN = /^Actor\.([^\.\s]+)$/;

export const PARTY_COIN_AWARD_OPERATIONS = Object.freeze({
  distribute: 'party.distributeCoins',
});

export const PARTY_COIN_AWARD_ERROR_CODES = Object.freeze({
  auditFailed: 'coinDistributionAuditFailed',
  invalidActor: 'coinDistributionInvalidActor',
  invalidPreview: 'coinDistributionInvalidPreview',
  overflow: 'coinDistributionOverflow',
  previewChanged: 'coinDistributionPreviewChanged',
  rollbackFailed: 'coinDistributionRollbackFailed',
  writeFailed: 'coinDistributionWriteFailed',
});

function createRequestId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `coin-distribution-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function validateCoins(value, label) {
  assertExactObject(value, { allowedKeys: COIN_KEYS, label });
  return Object.fromEntries(COIN_KEYS.map((coinKey) => {
    const amount = Number(value[coinKey]);
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new TypeError(`${label} ${coinKey} must be a non-negative safe integer.`);
    }
    return [coinKey, amount];
  }));
}

function validatePayload(payload) {
  assertExactObject(payload, {
    allowedKeys: ['expectedFingerprint', 'selectedActorUuids', 'splitCoins'],
    label: 'Coin distribution payload',
  });
  if (
    typeof payload.expectedFingerprint !== 'string'
    || payload.expectedFingerprint.length < 2
    || payload.expectedFingerprint.length > 262144
  ) {
    throw new TypeError('Coin distribution fingerprint is invalid.');
  }
  if (!Array.isArray(payload.selectedActorUuids)) {
    throw new TypeError('Coin distribution selected Actor UUIDs must be an array.');
  }
  const selectedActorUuids = payload.selectedActorUuids.map((actorUuid) => {
    if (typeof actorUuid !== 'string' || !WORLD_ACTOR_UUID_PATTERN.test(actorUuid)) {
      throw new TypeError('Coin distribution recipients must be world Actor UUIDs.');
    }
    return actorUuid;
  });
  if (new Set(selectedActorUuids).size !== selectedActorUuids.length) {
    throw new TypeError('Coin distribution recipients must be unique.');
  }
  return {
    expectedFingerprint: payload.expectedFingerprint,
    selectedActorUuids,
    splitCoins: validateCoins(payload.splitCoins, 'Coin split'),
  };
}

function previewFingerprint(preview) {
  return JSON.stringify({
    availableCoins: preview.availableCoins,
    distributedTotals: preview.distributedTotals,
    distributions: preview.distributions.map((entry) => ({
      actorType: entry.actorType,
      actorUuid: entry.actorUuid,
      awards: entry.awards,
      included: entry.included,
      writeback: entry.writeback,
    })),
    remainingTreasuryCoins: preview.remainingTreasuryCoins,
    splitCoins: preview.splitCoins,
    splitRemainders: preview.splitRemainders,
    totalShares: preview.totalShares,
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

function hasCoins(coins) {
  return COIN_KEYS.some((coinKey) => coins[coinKey] > 0);
}

export function createPartyCoinAwardService({
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
    throw new TypeError('Party coin awards require a Party Store.');
  }
  if (
    typeof mutations?.registerOperation !== 'function'
    || typeof mutations?.request !== 'function'
  ) {
    throw new TypeError('Party coin awards require Party mutations.');
  }
  if (typeof previewService?.getPreview !== 'function') {
    throw new TypeError('Party coin awards require the coin preview service.');
  }
  if (typeof chatCards?.createCoinDistributionReport !== 'function') {
    throw new TypeError('Party coin awards require coin audit chat.');
  }
  let executionQueue = Promise.resolve();

  function enqueue(task) {
    const pending = executionQueue.then(task);
    executionQueue = pending.catch(() => undefined);
    return pending;
  }

  async function execute({ expectedRevision, payload, requester, requestId }) {
    const state = store.getState();
    let preview;
    assertDistributionPreflight({
      actualFingerprint: () => {
        preview = previewService.getPreview({
          selectedActorUuids: payload.selectedActorUuids,
          splitCoins: payload.splitCoins,
        }, state);
        return previewFingerprint(preview);
      },
      changedError: {
        code: PARTY_COIN_AWARD_ERROR_CODES.previewChanged,
        message: 'The treasury, recipients, shares, or split changed after preview.',
      },
      expectedFingerprint: payload.expectedFingerprint,
      expectedRevision,
      staleMessage: 'The Party Sheet changed before coin distribution was confirmed.',
      state,
    });
    if (!hasCoins(preview.distributedTotals)) {
      throw new PartyMutationError(
        PARTY_COIN_AWARD_ERROR_CODES.invalidPreview,
        'Coin distribution requires at least one positive award.',
      );
    }
    const treasury = resolveActor(game, preview.treasuryActorUuid);
    if (!adapter.isManagedTreasury(treasury)) {
      throw new PartyMutationError(
        PARTY_COIN_AWARD_ERROR_CODES.invalidActor,
        'The managed Party Treasury is unavailable or invalid.',
      );
    }

    const transaction = createDistributionTransaction({
      auditError: {
        code: PARTY_COIN_AWARD_ERROR_CODES.auditFailed,
        message: 'The coin audit could not be created; purse balances were restored.',
      },
      label: 'Coin distribution',
      logger,
      rollbackError: {
        code: PARTY_COIN_AWARD_ERROR_CODES.rollbackFailed,
        message: 'The coin distribution failed and a purse rollback also failed.',
      },
      writeError: {
        code: PARTY_COIN_AWARD_ERROR_CODES.writeFailed,
        message: 'The coin distribution failed; prior purse balances were restored.',
      },
    });
    const recipientReports = [];
    await transaction.runWrites(async ({ write }) => {
      for (const distribution of preview.distributions.filter(
        (entry) => entry.included,
      )) {
        if (!distribution.writeback) {
          recipientReports.push({
            ...distribution,
            afterCoins: null,
            beforeCoins: null,
          });
          continue;
        }
        const actor = resolveActor(game, distribution.actorUuid);
        if (
          actor?.type !== adapter.actorTypes.character
          || !adapter.canWriteMoney(actor)
        ) {
          throw new PartyMutationError(
            PARTY_COIN_AWARD_ERROR_CODES.invalidActor,
            `Coin recipient "${distribution.actorUuid}" is no longer a compatible character Actor.`,
          );
        }
        const beforeCoins = adapter.getMoney(actor);
        const afterCoins = Object.fromEntries(COIN_KEYS.map((coinKey) => {
          const amount = beforeCoins[coinKey] + distribution.awards[coinKey];
          if (!Number.isSafeInteger(amount)) {
            throw new PartyMutationError(
              PARTY_COIN_AWARD_ERROR_CODES.overflow,
              `Coin recipient "${distribution.actorUuid}" would exceed the supported purse range.`,
            );
          }
          return [coinKey, amount];
        }));
        if (hasCoins(distribution.awards)) {
          await write(
            () => actor.update(adapter.buildMoneyUpdate(afterCoins)),
            () => actor.update(adapter.buildMoneyUpdate(beforeCoins)),
          );
        }
        recipientReports.push({
          ...distribution,
          afterCoins,
          beforeCoins,
        });
      }
      const treasuryBeforeCoins = adapter.getMoney(treasury);
      await write(
        () => treasury.update(
          adapter.buildMoneyUpdate(preview.remainingTreasuryCoins),
        ),
        () => treasury.update(adapter.buildMoneyUpdate(treasuryBeforeCoins)),
      );
    });

    await transaction.runAudit(() => (
      chatCards.createCoinDistributionReport({
        recipients: recipientReports,
        remainingTreasuryCoins: preview.remainingTreasuryCoins,
        requestId,
        requesterName: requester?.name ?? '',
        requesterUserId: requester?.id ?? '',
        revision: state.revision,
        splitRemainders: preview.splitRemainders,
        totalShares: preview.totalShares,
        treasuryActorUuid: preview.treasuryActorUuid,
        treasuryName: preview.treasuryName,
      })
    ));

    return {
      consumedNpcTotals: preview.consumedNpcTotals,
      recipients: recipientReports,
      remainingTreasuryCoins: preview.remainingTreasuryCoins,
      splitRemainders: preview.splitRemainders,
    };
  }

  mutations.registerOperation(PARTY_COIN_AWARD_OPERATIONS.distribute, {
    execute(context) {
      return enqueue(() => execute(context));
    },
    validatePayload,
  });

  function distribute(
    preview,
    expectedRevision = store.getState().revision,
    requestId = requestIdProvider(),
  ) {
    return mutations.request(PARTY_COIN_AWARD_OPERATIONS.distribute, {
      expectedRevision,
      payload: {
        expectedFingerprint: previewFingerprint(preview),
        selectedActorUuids: preview.distributions
          .filter((entry) => entry.selected)
          .map((entry) => entry.actorUuid),
        splitCoins: preview.splitCoins,
      },
      requestId,
    });
  }

  return Object.freeze({ distribute });
}
