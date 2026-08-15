import assert from 'node:assert/strict';
import test from 'node:test';

import {
  allocateExperience,
} from '../../module/party/xp-distribution.mjs';

function recipient(actorUuid, {
  actorType = 'character',
  bonusPercent = 0,
  share = 1,
} = {}) {
  return { actorType, actorUuid, bonusPercent, share };
}

test('XP allocation applies positive, zero, and negative character adjustments', () => {
  const allocation = allocateExperience({
    recipients: [
      recipient('Actor.positive', { bonusPercent: 10 }),
      recipient('Actor.zero'),
      recipient('Actor.negative', { bonusPercent: -10 }),
    ],
    totalXp: 301,
  });

  assert.equal(allocation.totalShares, 3);
  assert.equal(allocation.baseRemainderXp, 1);
  assert.deepEqual(
    allocation.distributions.map((entry) => ({
      adjustmentXp: entry.adjustmentXp,
      baseXp: entry.baseXp,
      finalAwardXp: entry.finalAwardXp,
    })),
    [
      { adjustmentXp: 10, baseXp: 100, finalAwardXp: 110 },
      { adjustmentXp: 0, baseXp: 100, finalAwardXp: 100 },
      { adjustmentXp: -10, baseXp: 100, finalAwardXp: 90 },
    ],
  );
});

test('XP allocation includes NPC shares but consumes their award without writeback', () => {
  const allocation = allocateExperience({
    recipients: [
      recipient('Actor.character', { bonusPercent: 10, share: 1 }),
      recipient('Actor.npc', {
        actorType: 'npc',
        bonusPercent: 50,
        share: 0.5,
      }),
    ],
    totalXp: 150,
  });

  assert.deepEqual(allocation.distributions, [
    {
      actorType: 'character',
      actorUuid: 'Actor.character',
      adjustmentXp: 10,
      baseXp: 100,
      bonusPercent: 10,
      finalAwardXp: 110,
      included: true,
      persistentAwardXp: 110,
      selected: true,
      share: 1,
      writeback: true,
    },
    {
      actorType: 'npc',
      actorUuid: 'Actor.npc',
      adjustmentXp: 0,
      baseXp: 50,
      bonusPercent: 0,
      finalAwardXp: 50,
      included: true,
      persistentAwardXp: 0,
      selected: true,
      share: 0.5,
      writeback: false,
    },
  ]);
  assert.equal(allocation.consumedNpcXp, 50);
  assert.equal(allocation.persistedXp, 110);
});

test('XP allocation exposes floor remainder and respects explicit selection', () => {
  const allocation = allocateExperience({
    recipients: [
      recipient('Actor.full'),
      recipient('Actor.quarter', { share: 0.25 }),
      recipient('Actor.skipped', { share: 1 }),
    ],
    selectedActorUuids: ['Actor.full', 'Actor.quarter'],
    totalXp: 7,
  });

  assert.equal(allocation.totalShares, 1.25);
  assert.equal(allocation.baseRemainderXp, 1);
  assert.deepEqual(
    allocation.distributions.map((entry) => [
      entry.actorUuid,
      entry.selected,
      entry.included,
      entry.baseXp,
    ]),
    [
      ['Actor.full', true, true, 5],
      ['Actor.quarter', true, true, 1],
      ['Actor.skipped', false, false, 0],
    ],
  );
});

test('XP allocation normalizes invalid totals, shares, bonuses, and reductions below zero', () => {
  const allocation = allocateExperience({
    recipients: [
      recipient('Actor.zero-share', { share: 0 }),
      recipient('Actor.invalid-share', { share: 'invalid' }),
      recipient('Actor.reduced', { bonusPercent: -150, share: 0.26 }),
      recipient('Actor.invalid-bonus', { bonusPercent: 'invalid', share: 1 }),
    ],
    totalXp: '19.9',
  });

  assert.equal(allocation.totalXp, 19);
  assert.equal(allocation.totalShares, 1.25);
  assert.deepEqual(
    allocation.distributions.map((entry) => [
      entry.actorUuid,
      entry.share,
      entry.baseXp,
      entry.adjustmentXp,
      entry.finalAwardXp,
    ]),
    [
      ['Actor.zero-share', 0, 0, 0, 0],
      ['Actor.invalid-share', 0, 0, 0, 0],
      ['Actor.reduced', 0.25, 3, -3, 0],
      ['Actor.invalid-bonus', 1, 15, 0, 15],
    ],
  );
  assert.equal(allocation.baseRemainderXp, 1);
});

test('XP allocation returns all XP as remainder when no positive shares are selected', () => {
  const allocation = allocateExperience({
    recipients: [recipient('Actor.zero', { share: 0 })],
    totalXp: 500,
  });

  assert.equal(allocation.totalShares, 0);
  assert.equal(allocation.baseRemainderXp, 500);
  assert.equal(allocation.distributions[0].included, false);
  assert.equal(allocation.distributions[0].finalAwardXp, 0);
});

test('XP allocation preserves safe whole-number precision for large totals', () => {
  const allocation = allocateExperience({
    recipients: [
      recipient('Actor.one', { share: 1 }),
      recipient('Actor.two', { share: 2 }),
    ],
    totalXp: Number.MAX_SAFE_INTEGER,
  });

  assert.deepEqual(
    allocation.distributions.map((entry) => entry.baseXp),
    [3002399751580330, 6004799503160660],
  );
  assert.equal(allocation.baseRemainderXp, 1);
});
