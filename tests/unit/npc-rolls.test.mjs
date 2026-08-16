import assert from 'node:assert/strict';
import test from 'node:test';

import { SAVE_KEYS } from '../../module/core/constants.mjs';
import {
  evaluateCheckRoll,
  planMoraleBatch,
  planSaveBatch,
} from '../../module/hud/npc-rolls.mjs';
import {
  characterActor,
  npcActor,
  treasureActor,
} from '../fixtures/hyp3e-documents.mjs';

function withNpcSystem(systemChanges) {
  return {
    ...npcActor,
    system: { ...npcActor.system, ...systemChanges },
  };
}

test('save planner accepts each explicit save category and current target', () => {
  for (const saveKey of SAVE_KEYS) {
    const batch = planSaveBatch([
      { tokenUuid: 'Scene.scene.Token.npc', actor: npcActor },
    ], saveKey);

    assert.equal(batch.kind, 'save');
    assert.equal(batch.saveKey, saveKey);
    assert.equal(batch.rolls.length, 1);
    assert.equal(batch.rolls[0].formula, '1d20');
    assert.equal(batch.rolls[0].targetValue, npcActor.system.saves[saveKey].curr);
  }
});

test('save planner uses the prepared target including applied modifiers', () => {
  const modifiedNpc = withNpcSystem({
    saves: {
      ...npcActor.system.saves,
      death: { value: 10, curr: '12' },
    },
  });
  const batch = planSaveBatch([modifiedNpc, characterActor], 'death');

  assert.deepEqual(batch.rolls.map(({ targetValue }) => targetValue), [12, 11]);
  assert.equal(evaluateCheckRoll(batch.rolls[0], 12).success, true);
  assert.equal(evaluateCheckRoll(batch.rolls[0], 11).success, false);
});

test('save planner applies a validated situational modifier to the formula', () => {
  const positive = planSaveBatch([npcActor], 'death', { modifier: 3 });
  const negative = planSaveBatch([npcActor], 'death', { modifier: -2 });

  assert.equal(positive.modifier, 3);
  assert.equal(positive.rolls[0].formula, '1d20 + 3');
  assert.equal(positive.rolls[0].modifier, 3);
  assert.equal(negative.rolls[0].formula, '1d20 - 2');
  assert.throws(
    () => planSaveBatch([npcActor], 'death', { modifier: 1.5 }),
    /modifier/i,
  );
});

test('save planner rejects unknown categories and skips missing targets', () => {
  const missingSaveNpc = withNpcSystem({
    saves: {
      ...npcActor.system.saves,
      death: { curr: null },
    },
  });
  const invalidSaveNpc = withNpcSystem({
    saves: {
      ...npcActor.system.saves,
      death: { curr: 'not-a-number' },
    },
  });
  const batch = planSaveBatch(
    [missingSaveNpc, invalidSaveNpc, treasureActor],
    'death',
  );

  assert.equal(batch.rolls.length, 0);
  assert.deepEqual(
    batch.skipped.map(({ reason }) => reason),
    ['missingSaveTarget', 'missingSaveTarget', 'unsupportedActor'],
  );
  assert.throws(() => planSaveBatch([npcActor], 'generic'), /save category/i);
});

test('morale planner accepts numeric strings and zero but skips missing data', () => {
  const numericStringNpc = withNpcSystem({ morale: '8' });
  const zeroMoraleNpc = withNpcSystem({ morale: 0 });
  const missingMoraleNpc = withNpcSystem({ morale: null });
  const invalidMoraleNpc = withNpcSystem({ morale: 'not-a-number' });
  const batch = planMoraleBatch([
    numericStringNpc,
    zeroMoraleNpc,
    missingMoraleNpc,
    invalidMoraleNpc,
    characterActor,
  ]);

  assert.equal(batch.kind, 'morale');
  assert.deepEqual(
    batch.rolls.map(({ formula, targetValue }) => ({ formula, targetValue })),
    [
      { formula: '2d6', targetValue: 8 },
      { formula: '2d6', targetValue: 0 },
    ],
  );
  assert.deepEqual(
    batch.skipped.map(({ reason }) => reason),
    [
      'missingMoraleTarget',
      'missingMoraleTarget',
      'unsupportedActor',
    ],
  );
  assert.equal(evaluateCheckRoll(batch.rolls[0], 8).success, true);
  assert.equal(evaluateCheckRoll(batch.rolls[0], 9).success, false);
});

test('check evaluation rejects totals and instructions it cannot interpret', () => {
  const saveRoll = planSaveBatch([npcActor], 'sorcery').rolls[0];

  assert.throws(() => evaluateCheckRoll(saveRoll, null), /roll total/i);
  assert.throws(
    () => evaluateCheckRoll({ ...saveRoll, kind: 'reaction' }, 10),
    /check instruction/i,
  );
});
