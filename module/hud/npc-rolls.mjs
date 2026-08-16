import { hyp3eAdapter } from '../adapters/hyp3e-adapter.mjs';
import { SAVE_KEYS } from '../core/constants.mjs';
import { getReactionOutcome } from './reaction-table.mjs';

function getActor(candidate) {
  return candidate?.actor ?? candidate;
}

function snapshotTarget(candidate, adapter) {
  const actor = getActor(candidate);
  const summary = adapter.getActorSummary(actor);
  return Object.freeze({
    tokenUuid: candidate?.actor
      ? candidate.tokenUuid ?? candidate.uuid ?? null
      : null,
    actorId: summary.id,
    actorUuid: summary.uuid,
    name: summary.name,
    type: summary.type,
  });
}

function createBatch(kind, candidates, planCandidate, metadata = {}) {
  if (!Array.isArray(candidates)) {
    throw new TypeError('Roll targets must be an array.');
  }

  const rolls = [];
  const skipped = [];
  for (const candidate of candidates) {
    const target = planCandidate(candidate);
    if (target.roll) rolls.push(Object.freeze(target.roll));
    else skipped.push(Object.freeze({
      target: target.target,
      reason: target.reason,
    }));
  }

  return Object.freeze({
    kind,
    ...metadata,
    rolls: Object.freeze(rolls),
    skipped: Object.freeze(skipped),
  });
}

export function planReactionBatch(
  candidates,
  { adapter = hyp3eAdapter } = {},
) {
  return createBatch('reaction', candidates, (candidate) => {
    const actor = getActor(candidate);
    const target = snapshotTarget(candidate, adapter);
    if (!adapter.isNpcActor(actor)) {
      return { target, reason: 'unsupportedActor' };
    }
    return {
      roll: {
        kind: 'reaction',
        formula: '2d6',
        modifier: 0,
        target,
      },
    };
  });
}

export function planSaveBatch(
  candidates,
  saveKey,
  { adapter = hyp3eAdapter, modifier: modifierValue = 0 } = {},
) {
  if (!SAVE_KEYS.includes(saveKey)) {
    throw new TypeError(`Unknown save category "${saveKey}".`);
  }
  const modifier = Number(modifierValue);
  if (
    !Number.isSafeInteger(modifier)
    || modifier < -99
    || modifier > 99
  ) {
    throw new TypeError('A situational modifier from -99 through 99 is required.');
  }
  const formula = modifier === 0
    ? '1d20'
    : `1d20 ${modifier > 0 ? '+' : '-'} ${Math.abs(modifier)}`;

  return createBatch('save', candidates, (candidate) => {
    const actor = getActor(candidate);
    const target = snapshotTarget(candidate, adapter);
    if (!adapter.canRollSave(actor)) {
      return { target, reason: 'unsupportedActor' };
    }
    const targetValue = adapter.getSave(actor, saveKey);
    if (!Number.isFinite(targetValue)) {
      return { target, reason: 'missingSaveTarget' };
    }
    return {
      roll: {
        kind: 'save',
        saveKey,
        formula,
        modifier,
        comparison: 'greaterThanOrEqual',
        targetValue,
        target,
      },
    };
  }, { modifier, saveKey });
}

export function planMoraleBatch(
  candidates,
  { adapter = hyp3eAdapter } = {},
) {
  return createBatch('morale', candidates, (candidate) => {
    const actor = getActor(candidate);
    const target = snapshotTarget(candidate, adapter);
    if (!adapter.isNpcActor(actor)) {
      return { target, reason: 'unsupportedActor' };
    }
    const targetValue = adapter.getMorale(actor);
    if (!Number.isFinite(targetValue)) {
      return { target, reason: 'missingMoraleTarget' };
    }
    return {
      roll: {
        kind: 'morale',
        formula: '2d6',
        comparison: 'lessThanOrEqual',
        targetValue,
        target,
      },
    };
  });
}

export function evaluateCheckRoll(instruction, value) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) {
    throw new TypeError('Roll total must be a finite number.');
  }
  const total = Number(value);
  if (!Number.isFinite(total)) {
    throw new TypeError('Roll total must be a finite number.');
  }

  let success;
  if (instruction?.kind === 'save') {
    success = total >= instruction.targetValue;
  } else if (instruction?.kind === 'morale') {
    success = total <= instruction.targetValue;
  } else {
    throw new TypeError('A save or morale check instruction is required.');
  }

  return Object.freeze({ ...instruction, total, success });
}

export const npcRolls = Object.freeze({
  evaluateCheckRoll,
  getReactionOutcome,
  planMoraleBatch,
  planReactionBatch,
  planSaveBatch,
});
