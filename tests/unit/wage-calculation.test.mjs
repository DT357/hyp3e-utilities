import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateWageSettlement } from '../../module/party/wage-calculation.mjs';

function follower(actorUuid, wageGp, name = actorUuid) {
  return { actorUuid, name, wageGp };
}

test('wage preview totals selected daily GP wages and remaining treasury GP', () => {
  const preview = calculateWageSettlement({
    availableGp: 20,
    followers: [
      follower('Actor.one', 3, 'One'),
      follower('Actor.two', 5, 'Two'),
      follower('Actor.three', 7, 'Three'),
    ],
    selectedActorUuids: ['Actor.one', 'Actor.three'],
  });

  assert.equal(preview.totalDueGp, 10);
  assert.equal(preview.remainingGp, 10);
  assert.equal(preview.shortfallGp, 0);
  assert.equal(preview.canSettle, true);
  assert.deepEqual(preview.followers.map((entry) => ({
    actorUuid: entry.actorUuid,
    paymentGp: entry.paymentGp,
    selected: entry.selected,
  })), [
    { actorUuid: 'Actor.one', paymentGp: 3, selected: true },
    { actorUuid: 'Actor.two', paymentGp: 0, selected: false },
    { actorUuid: 'Actor.three', paymentGp: 7, selected: true },
  ]);
});

test('wage preview rejects insufficient GP without calculating a negative purse', () => {
  const preview = calculateWageSettlement({
    availableGp: 4,
    followers: [follower('Actor.one', 3), follower('Actor.two', 5)],
  });

  assert.equal(preview.totalDueGp, 8);
  assert.equal(preview.enoughGp, false);
  assert.equal(preview.shortfallGp, 4);
  assert.equal(preview.remainingGp, 4);
  assert.equal(preview.canSettle, false);
});

test('wage preview handles zero wages and an empty selection', () => {
  const zero = calculateWageSettlement({
    availableGp: 10,
    followers: [follower('Actor.zero', 0)],
  });
  const empty = calculateWageSettlement({
    availableGp: 10,
    followers: [follower('Actor.one', 2)],
    selectedActorUuids: [],
  });

  assert.equal(zero.totalDueGp, 0);
  assert.equal(zero.canSettle, false);
  assert.equal(zero.followers[0].selected, true);
  assert.equal(empty.selectedCount, 0);
  assert.equal(empty.remainingGp, 10);
  assert.equal(empty.canSettle, false);
});

test('wage preview flags invalid rates instead of silently charging them', () => {
  const preview = calculateWageSettlement({
    availableGp: '20.9',
    followers: [
      follower('Actor.negative', -1),
      follower('Actor.fractional', 1.5),
      follower('Actor.text', 'bad'),
      follower('Actor.valid', '4'),
    ],
  });

  assert.equal(preview.availableGp, 20);
  assert.equal(preview.invalidSelectedCount, 3);
  assert.equal(preview.totalDueGp, 4);
  assert.equal(preview.remainingGp, 20);
  assert.equal(preview.canSettle, false);
  assert.deepEqual(
    preview.followers.map((entry) => [entry.actorUuid, entry.invalidWage, entry.paymentGp]),
    [
      ['Actor.negative', true, 0],
      ['Actor.fractional', true, 0],
      ['Actor.text', true, 0],
      ['Actor.valid', false, 4],
    ],
  );
});

test('wage preview rejects unsafe total accumulation', () => {
  assert.throws(
    () => calculateWageSettlement({
      availableGp: Number.MAX_SAFE_INTEGER,
      followers: [
        follower('Actor.one', Number.MAX_SAFE_INTEGER),
        follower('Actor.two', 1),
      ],
    }),
    /safe integer range/i,
  );
});
