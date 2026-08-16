export const PARTY_ACTION_ERROR_CODES = Object.freeze({
  gmRequired: 'gmRequired',
  rollUnavailable: 'rollUnavailable',
  tokenUnavailable: 'tokenUnavailable',
});

export class PartyActionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PartyActionError';
    this.code = code;
  }
}

export function createPartyActionService({
  canvasProvider,
  chatCards,
  game,
  npcRolls,
} = {}) {
  async function pingActor(actorUuid) {
    const canvas = canvasProvider?.();
    const token = [...(canvas?.tokens?.placeables ?? [])]
      .filter((candidate) => candidate.actor?.uuid === actorUuid)
      .sort((left, right) => (
        Number(right.controlled === true) - Number(left.controlled === true)
        || String(left.document?.id ?? '').localeCompare(
          String(right.document?.id ?? ''),
        )
      ))[0];
    if (
      canvas?.ready !== true
      || !token?.center
      || typeof canvas.ping !== 'function'
    ) {
      throw new PartyActionError(
        PARTY_ACTION_ERROR_CODES.tokenUnavailable,
        'No placed token for this Actor is available on the current scene.',
      );
    }
    await canvas.ping(token.center);
    return token;
  }

  async function createRollBatch(planBatch, options) {
    if (!game?.user?.isGM) {
      throw new PartyActionError(
        PARTY_ACTION_ERROR_CODES.gmRequired,
        'Only a GM can roll Party Sheet actions.',
      );
    }
    const batch = planBatch();
    if (!Array.isArray(batch?.rolls) || batch.rolls.length === 0) {
      throw new PartyActionError(
        PARTY_ACTION_ERROR_CODES.rollUnavailable,
        'No eligible Party Sheet target can roll this action.',
      );
    }
    return chatCards.createNpcRollBatch(batch, options);
  }

  function rollSave(actor, saveKey, { modifier = 0, rollMode } = {}) {
    return createRollBatch(
      () => npcRolls.planSaveBatch([actor], saveKey, { modifier }),
      rollMode ? { rollMode } : undefined,
    );
  }

  function rollMorale(actors) {
    return createRollBatch(() => npcRolls.planMoraleBatch(actors));
  }

  return Object.freeze({ pingActor, rollMorale, rollSave });
}
