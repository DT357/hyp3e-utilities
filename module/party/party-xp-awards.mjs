import {
  PartyMutationError,
  assertExactObject,
} from './party-mutation-protocol.mjs';
import {
  assertDistributionPreflight,
  createDistributionTransaction,
} from './distribution-transaction.mjs';

const WORLD_ACTOR_UUID_PATTERN = /^Actor\.([^\.\s]+)$/;

export const PARTY_XP_AWARD_OPERATIONS = Object.freeze({
  distribute: 'party.distributeXp',
});

export const PARTY_XP_AWARD_ERROR_CODES = Object.freeze({
  auditFailed: 'xpDistributionAuditFailed',
  gmRequired: 'xpDistributionGmRequired',
  invalidActor: 'xpDistributionInvalidActor',
  invalidPreview: 'xpDistributionInvalidPreview',
  overflow: 'xpDistributionOverflow',
  previewChanged: 'xpDistributionPreviewChanged',
  rollbackFailed: 'xpDistributionRollbackFailed',
  writeFailed: 'xpDistributionWriteFailed',
});

function createRequestId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `xp-distribution-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function requireSafeWhole(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

function requireSignedSafeWhole(value, label) {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${label} must be a signed safe integer.`);
  }
  return value;
}

function validateExpectedDistribution(value, index) {
  assertExactObject(value, {
    allowedKeys: [
      'actorType',
      'actorUuid',
      'adjustmentXp',
      'baseXp',
      'bonusPercent',
      'finalAwardXp',
      'included',
      'writeback',
    ],
    label: `XP preview recipient ${index}`,
  });
  if (!['character', 'npc', 'missing'].includes(value.actorType)) {
    throw new TypeError(`XP preview recipient ${index} has an invalid Actor type.`);
  }
  if (typeof value.actorUuid !== 'string' || !WORLD_ACTOR_UUID_PATTERN.test(value.actorUuid)) {
    throw new TypeError(`XP preview recipient ${index} requires a world Actor UUID.`);
  }
  if (typeof value.included !== 'boolean' || typeof value.writeback !== 'boolean') {
    throw new TypeError(`XP preview recipient ${index} requires boolean status fields.`);
  }
  return {
    actorType: value.actorType,
    actorUuid: value.actorUuid,
    adjustmentXp: requireSignedSafeWhole(
      value.adjustmentXp,
      `XP preview recipient ${index} adjustment`,
    ),
    baseXp: requireSafeWhole(value.baseXp, `XP preview recipient ${index} base XP`),
    bonusPercent: requireSignedSafeWhole(
      value.bonusPercent,
      `XP preview recipient ${index} bonus`,
    ),
    finalAwardXp: requireSafeWhole(
      value.finalAwardXp,
      `XP preview recipient ${index} final XP`,
    ),
    included: value.included,
    writeback: value.writeback,
  };
}

function validateExpectedPreview(value) {
  assertExactObject(value, {
    allowedKeys: ['baseRemainderXp', 'distributions', 'totalShares'],
    label: 'Expected XP preview',
  });
  if (!Array.isArray(value.distributions)) {
    throw new TypeError('Expected XP preview distributions must be an array.');
  }
  const totalShares = Number(value.totalShares);
  if (
    !Number.isFinite(totalShares)
    || totalShares < 0
    || !Number.isInteger(totalShares * 4)
  ) {
    throw new TypeError('Expected XP preview total shares must use quarter shares.');
  }
  return {
    baseRemainderXp: requireSafeWhole(
      value.baseRemainderXp,
      'Expected XP preview remainder',
    ),
    distributions: value.distributions.map(validateExpectedDistribution),
    totalShares,
  };
}

function validatePayload(payload) {
  assertExactObject(payload, {
    allowedKeys: ['expectedPreview', 'selectedActorUuids', 'totalXp'],
    label: 'XP distribution payload',
  });
  if (!Array.isArray(payload.selectedActorUuids)) {
    throw new TypeError('XP selected Actor UUIDs must be an array.');
  }
  const selectedActorUuids = payload.selectedActorUuids.map((actorUuid) => {
    if (typeof actorUuid !== 'string' || !WORLD_ACTOR_UUID_PATTERN.test(actorUuid)) {
      throw new TypeError('XP selected recipients must be world Actor UUIDs.');
    }
    return actorUuid;
  });
  if (new Set(selectedActorUuids).size !== selectedActorUuids.length) {
    throw new TypeError('XP selected recipients must be unique.');
  }
  return {
    expectedPreview: validateExpectedPreview(payload.expectedPreview),
    selectedActorUuids,
    totalXp: requireSafeWhole(payload.totalXp, 'XP distribution total'),
  };
}

function previewFingerprint(preview) {
  return {
    baseRemainderXp: preview.baseRemainderXp,
    distributions: preview.distributions.map((entry) => ({
      actorType: entry.actorType,
      actorUuid: entry.actorUuid,
      adjustmentXp: entry.adjustmentXp,
      baseXp: entry.baseXp,
      bonusPercent: entry.bonusPercent,
      finalAwardXp: entry.finalAwardXp,
      included: entry.included,
      writeback: entry.writeback,
    })),
    totalShares: preview.totalShares,
  };
}

function resolveActor(game, actorUuid) {
  const actorId = WORLD_ACTOR_UUID_PATTERN.exec(actorUuid)?.[1];
  const actor = actorId ? game?.actors?.get?.(actorId) ?? null : null;
  return actor?.documentName === 'Actor'
    && actor.uuid === actorUuid
    && actor.isToken !== true
    ? actor
    : null;
}

export function createPartyXpAwardService({
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
    throw new TypeError('Party XP awards require a Party Store.');
  }
  if (
    typeof mutations?.registerOperation !== 'function'
    || typeof mutations?.request !== 'function'
  ) {
    throw new TypeError('Party XP awards require Party mutations.');
  }
  if (typeof previewService?.getPreview !== 'function') {
    throw new TypeError('Party XP awards require the XP preview service.');
  }
  if (typeof chatCards?.createXpDistributionReport !== 'function') {
    throw new TypeError('Party XP awards require XP audit chat.');
  }
  let executionQueue = Promise.resolve();

  function enqueue(task) {
    const pending = executionQueue.then(task);
    executionQueue = pending.catch(() => undefined);
    return pending;
  }

  async function execute({ expectedRevision, payload, requester, requestId }) {
    if (requester?.isGM !== true) {
      throw new PartyMutationError(
        PARTY_XP_AWARD_ERROR_CODES.gmRequired,
        'Only a GM may distribute Party Sheet XP.',
      );
    }
    const state = store.getState();
    let preview;
    assertDistributionPreflight({
      actualFingerprint: () => {
        preview = previewService.getPreview({
          selectedActorUuids: payload.selectedActorUuids,
          totalXp: payload.totalXp,
        }, state);
        return JSON.stringify(previewFingerprint(preview));
      },
      changedError: {
        code: PARTY_XP_AWARD_ERROR_CODES.previewChanged,
        message: 'The XP inputs or recipient Actors changed after the preview.',
      },
      expectedFingerprint: JSON.stringify(payload.expectedPreview),
      expectedRevision,
      staleMessage: 'The Party Sheet changed before XP distribution was confirmed.',
      state,
    });
    const included = preview.distributions.filter((entry) => entry.included);
    if (payload.totalXp <= 0 || included.length === 0) {
      throw new PartyMutationError(
        PARTY_XP_AWARD_ERROR_CODES.invalidPreview,
        'XP distribution requires a positive total and at least one recipient.',
      );
    }

    const transaction = createDistributionTransaction({
      auditError: {
        code: PARTY_XP_AWARD_ERROR_CODES.auditFailed,
        message: 'The XP audit could not be created; character totals were restored.',
      },
      label: 'XP distribution',
      logger,
      rollbackError: {
        code: PARTY_XP_AWARD_ERROR_CODES.rollbackFailed,
        message: 'The XP distribution failed and an Actor rollback also failed.',
      },
      writeError: {
        code: PARTY_XP_AWARD_ERROR_CODES.writeFailed,
        message: 'The XP distribution failed; prior character totals were restored.',
      },
    });
    const recipientReports = [];
    await transaction.runWrites(async ({ write }) => {
      for (const distribution of included) {
        if (!distribution.writeback) {
          recipientReports.push({
            ...distribution,
            afterXp: null,
            beforeXp: null,
          });
          continue;
        }
        const actor = resolveActor(game, distribution.actorUuid);
        if (actor?.type !== adapter.actorTypes.character) {
          throw new PartyMutationError(
            PARTY_XP_AWARD_ERROR_CODES.invalidActor,
            `XP recipient "${distribution.actorUuid}" is no longer a character Actor.`,
          );
        }
        const beforeXp = adapter.getCharacterExperience(actor)?.value;
        const afterXp = beforeXp + distribution.finalAwardXp;
        if (!Number.isSafeInteger(afterXp)) {
          throw new PartyMutationError(
            PARTY_XP_AWARD_ERROR_CODES.overflow,
            `XP recipient "${distribution.actorUuid}" would exceed the supported XP range.`,
          );
        }
        if (distribution.finalAwardXp > 0) {
          await write(
            () => actor.update(adapter.buildCharacterExperienceUpdate(afterXp)),
            () => actor.update(adapter.buildCharacterExperienceUpdate(beforeXp)),
          );
        }
        recipientReports.push({ ...distribution, afterXp, beforeXp });
      }
    });

    await transaction.runAudit(() => (
      chatCards.createXpDistributionReport({
        baseRemainderXp: preview.baseRemainderXp,
        recipients: recipientReports,
        requestId,
        requesterName: requester.name ?? '',
        requesterUserId: requester.id ?? '',
        revision: state.revision,
        totalShares: preview.totalShares,
        totalXp: preview.totalXp,
      })
    ));

    return {
      baseRemainderXp: preview.baseRemainderXp,
      consumedNpcXp: preview.consumedNpcXp,
      recipients: recipientReports,
      totalXp: preview.totalXp,
    };
  }

  mutations.registerOperation(PARTY_XP_AWARD_OPERATIONS.distribute, {
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
    return mutations.request(PARTY_XP_AWARD_OPERATIONS.distribute, {
      expectedRevision,
      payload: {
        expectedPreview: previewFingerprint(preview),
        selectedActorUuids: preview.distributions
          .filter((entry) => entry.selected)
          .map((entry) => entry.actorUuid),
        totalXp: preview.totalXp,
      },
      requestId,
    });
  }

  return Object.freeze({ distribute });
}
