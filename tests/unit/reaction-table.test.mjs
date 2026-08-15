import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getReactionOutcome,
} from '../../module/hud/reaction-table.mjs';
import {
  planReactionBatch,
} from '../../module/hud/npc-rolls.mjs';
import {
  characterActor,
  npcActor,
} from '../fixtures/hyp3e-documents.mjs';

test('reaction outcomes match every Hyperborea boundary', () => {
  const cases = [
    [-5, 'violent'],
    [0, 'violent'],
    [2, 'violent'],
    [3, 'hostile'],
    [4, 'unfriendly'],
    [5, 'unfriendly'],
    [6, 'neutral'],
    [8, 'neutral'],
    [9, 'friendly'],
    [10, 'friendly'],
    [11, 'agreeable'],
    [12, 'affable'],
    [19, 'affable'],
  ];

  for (const [total, expectedId] of cases) {
    assert.equal(getReactionOutcome(total).id, expectedId, `total ${total}`);
  }
  assert.equal(getReactionOutcome(6).reroll, true);
  assert.equal(getReactionOutcome(8).reroll, true);
  assert.equal(getReactionOutcome(9).reroll, false);
  assert.throws(() => getReactionOutcome('not-a-number'), /total/i);
});

test('reaction batch plans exactly one unmodified roll per selected NPC token', () => {
  const batch = planReactionBatch([
    { tokenUuid: 'Scene.scene.Token.first', actor: npcActor },
    { tokenUuid: 'Scene.scene.Token.second', actor: npcActor },
    { tokenUuid: 'Scene.scene.Token.hero', actor: characterActor },
  ]);

  assert.equal(batch.kind, 'reaction');
  assert.equal(batch.rolls.length, 2);
  assert.deepEqual(
    batch.rolls.map(({ formula, modifier, target }) => ({
      formula,
      modifier,
      tokenUuid: target.tokenUuid,
      actorUuid: target.actorUuid,
    })),
    [
      {
        formula: '2d6',
        modifier: 0,
        tokenUuid: 'Scene.scene.Token.first',
        actorUuid: npcActor.uuid,
      },
      {
        formula: '2d6',
        modifier: 0,
        tokenUuid: 'Scene.scene.Token.second',
        actorUuid: npcActor.uuid,
      },
    ],
  );
  assert.equal(batch.skipped.length, 1);
  assert.equal(batch.skipped[0].reason, 'unsupportedActor');
  assert.equal(Object.isFrozen(batch), true);
  assert.equal(Object.isFrozen(batch.rolls), true);
});

test('reaction batch handles an empty selection without planning a roll', () => {
  assert.deepEqual(planReactionBatch([]), {
    kind: 'reaction',
    rolls: [],
    skipped: [],
  });
});
