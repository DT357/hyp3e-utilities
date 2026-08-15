import assert from 'node:assert/strict';
import test from 'node:test';

import { allocateCoins } from '../../module/party/coin-distribution.mjs';

const ZERO_COINS = Object.freeze({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });

function recipient(actorUuid, {
  actorType = 'character',
  share = 1,
} = {}) {
  return { actorType, actorUuid, share };
}

test('coin allocation splits all five denominations independently by shares', () => {
  const allocation = allocateCoins({
    availableCoins: { cp: 11, sp: 10, ep: 9, gp: 8, pp: 7 },
    recipients: [
      recipient('Actor.one', { share: 1 }),
      recipient('Actor.two', { share: 0.5 }),
    ],
  });

  assert.equal(allocation.totalShares, 1.5);
  assert.deepEqual(allocation.distributions.map((entry) => entry.awards), [
    { cp: 7, sp: 6, ep: 6, gp: 5, pp: 4 },
    { cp: 3, sp: 3, ep: 3, gp: 2, pp: 2 },
  ]);
  assert.deepEqual(allocation.distributedTotals, {
    cp: 10, sp: 9, ep: 9, gp: 7, pp: 6,
  });
  assert.deepEqual(allocation.splitRemainders, {
    cp: 1, sp: 1, ep: 0, gp: 1, pp: 1,
  });
  assert.deepEqual(allocation.remainingTreasuryCoins, {
    cp: 1, sp: 1, ep: 0, gp: 1, pp: 1,
  });
});

test('coin allocation caps requested split amounts and retains withheld coins', () => {
  const allocation = allocateCoins({
    availableCoins: { cp: 10, sp: 20, ep: 30, gp: 40, pp: 50 },
    recipients: [recipient('Actor.hero')],
    splitCoins: { cp: 5, sp: 200, ep: -1, gp: '12.9', pp: 'invalid' },
  });

  assert.deepEqual(allocation.splitCoins, {
    cp: 5, sp: 20, ep: 0, gp: 12, pp: 0,
  });
  assert.deepEqual(allocation.distributions[0].awards, {
    cp: 5, sp: 20, ep: 0, gp: 12, pp: 0,
  });
  assert.deepEqual(allocation.remainingTreasuryCoins, {
    cp: 5, sp: 0, ep: 30, gp: 28, pp: 50,
  });
});

test('coin allocation consumes selected NPC shares without persistent awards', () => {
  const allocation = allocateCoins({
    availableCoins: { cp: 0, sp: 0, ep: 3, gp: 9, pp: 0 },
    recipients: [
      recipient('Actor.hero'),
      recipient('Actor.npc', { actorType: 'npc', share: 0.5 }),
    ],
  });

  assert.deepEqual(allocation.distributions[0].awards, {
    cp: 0, sp: 0, ep: 2, gp: 6, pp: 0,
  });
  assert.deepEqual(allocation.distributions[0].persistentAwards, {
    cp: 0, sp: 0, ep: 2, gp: 6, pp: 0,
  });
  assert.deepEqual(allocation.distributions[1].awards, {
    cp: 0, sp: 0, ep: 1, gp: 3, pp: 0,
  });
  assert.deepEqual(allocation.distributions[1].persistentAwards, ZERO_COINS);
  assert.deepEqual(allocation.consumedNpcTotals, {
    cp: 0, sp: 0, ep: 1, gp: 3, pp: 0,
  });
  assert.deepEqual(allocation.remainingTreasuryCoins, ZERO_COINS);
});

test('coin allocation respects selection, quarter shares, and zero shares', () => {
  const allocation = allocateCoins({
    availableCoins: { cp: 10, sp: 0, ep: 0, gp: 0, pp: 0 },
    recipients: [
      recipient('Actor.full'),
      recipient('Actor.quarter', { share: 0.26 }),
      recipient('Actor.zero', { share: 0 }),
      recipient('Actor.skipped'),
    ],
    selectedActorUuids: ['Actor.full', 'Actor.quarter', 'Actor.zero'],
  });

  assert.equal(allocation.totalShares, 1.25);
  assert.deepEqual(allocation.distributions.map((entry) => [
    entry.actorUuid,
    entry.selected,
    entry.included,
    entry.share,
    entry.awards.cp,
  ]), [
    ['Actor.full', true, true, 1, 8],
    ['Actor.quarter', true, true, 0.25, 2],
    ['Actor.zero', true, false, 0, 0],
    ['Actor.skipped', false, false, 1, 0],
  ]);
});

test('coin allocation leaves every coin in treasury when no shares participate', () => {
  const allocation = allocateCoins({
    availableCoins: { cp: 1, sp: 2, ep: 3, gp: 4, pp: 5 },
    recipients: [recipient('Actor.zero', { share: 0 })],
  });

  assert.deepEqual(allocation.distributedTotals, ZERO_COINS);
  assert.deepEqual(allocation.splitRemainders, {
    cp: 1, sp: 2, ep: 3, gp: 4, pp: 5,
  });
  assert.deepEqual(allocation.remainingTreasuryCoins, {
    cp: 1, sp: 2, ep: 3, gp: 4, pp: 5,
  });
});

test('coin allocation preserves safe whole-number precision for large balances', () => {
  const allocation = allocateCoins({
    availableCoins: {
      cp: Number.MAX_SAFE_INTEGER,
      sp: Number.MAX_SAFE_INTEGER,
      ep: Number.MAX_SAFE_INTEGER,
      gp: Number.MAX_SAFE_INTEGER,
      pp: Number.MAX_SAFE_INTEGER,
    },
    recipients: [
      recipient('Actor.one', { share: 1 }),
      recipient('Actor.two', { share: 2 }),
    ],
  });

  assert.equal(allocation.distributions[0].awards.gp, 3002399751580330);
  assert.equal(allocation.distributions[1].awards.gp, 6004799503160660);
  assert.equal(allocation.splitRemainders.gp, 1);
  assert.equal(allocation.remainingTreasuryCoins.gp, 1);
});
