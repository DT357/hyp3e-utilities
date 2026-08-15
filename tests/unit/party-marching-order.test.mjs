import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PARTY_MARCHING_ERROR_CODES,
  PARTY_MARCHING_OPERATIONS,
  createMarchingOrderModel,
  createPartyMarchingOrderService,
  placeMarchingActor,
  removeMarchingActor,
  swapMarchingActors,
} from '../../module/party/party-marching-order.mjs';
import { createPartyStateDefault } from '../../module/party/party-state.mjs';

function createState() {
  const state = createPartyStateDefault();
  state.memberActorUuids = [
    'Actor.hero',
    'Actor.mage',
    'Actor.missing',
  ];
  state.followerActorUuids = ['Actor.retainer'];
  state.marchingOrder.front = {
    actorUuids: ['Actor.hero'],
    notes: 'Scout ahead',
  };
  state.marchingOrder.middle = {
    actorUuids: ['Actor.mage'],
    notes: '',
  };
  return state;
}

test('marching model exposes ordered ranks and tracked unassigned rows', () => {
  const state = createState();
  const model = createMarchingOrderModel(state);

  assert.deepEqual(model.groups.map(({ id }) => id), [
    'unassigned',
    'front',
    'middle',
    'rear',
  ]);
  assert.deepEqual(model.groups[0].rows, [
    { actorUuid: 'Actor.missing', position: 0, rank: 'unassigned' },
    { actorUuid: 'Actor.retainer', position: 1, rank: 'unassigned' },
  ]);
  assert.deepEqual(model.groups[1].rows, [
    { actorUuid: 'Actor.hero', position: 0, rank: 'front' },
  ]);
  assert.equal(model.groups[1].notes, 'Scout ahead');
  assert.equal(model.hasAssignments, true);
});

test('place appends, inserts, repositions, and removes prior duplicates', () => {
  const state = createState();
  state.marchingOrder.rear.actorUuids = ['Actor.hero', 'Actor.retainer'];

  const appended = placeMarchingActor(state, {
    actorUuid: 'Actor.missing',
    rank: 'rear',
  });
  assert.deepEqual(appended.rear.actorUuids, [
    'Actor.retainer',
    'Actor.missing',
  ]);
  assert.deepEqual(appended.front.actorUuids, ['Actor.hero']);

  const inserted = placeMarchingActor(
    { ...state, marchingOrder: appended },
    { actorUuid: 'Actor.mage', position: 0, rank: 'rear' },
  );
  assert.deepEqual(inserted.middle.actorUuids, []);
  assert.deepEqual(inserted.rear.actorUuids, [
    'Actor.mage',
    'Actor.retainer',
    'Actor.missing',
  ]);

  const repositioned = placeMarchingActor(
    { ...state, marchingOrder: inserted },
    { actorUuid: 'Actor.retainer', position: 2, rank: 'rear' },
  );
  assert.deepEqual(repositioned.rear.actorUuids, [
    'Actor.mage',
    'Actor.missing',
    'Actor.retainer',
  ]);
  assert.equal(state.marchingOrder.rear.actorUuids.includes('Actor.missing'), false);
});

test('swap exchanges ranked and unassigned Actors while remove is idempotent', () => {
  const state = createState();
  state.marchingOrder.rear.actorUuids = ['Actor.retainer'];

  const rankedSwap = swapMarchingActors(state, {
    actorUuid: 'Actor.hero',
    otherActorUuid: 'Actor.retainer',
  });
  assert.deepEqual(rankedSwap.front.actorUuids, ['Actor.retainer']);
  assert.deepEqual(rankedSwap.rear.actorUuids, ['Actor.hero']);

  const unassignedSwap = swapMarchingActors(
    { ...state, marchingOrder: rankedSwap },
    { actorUuid: 'Actor.missing', otherActorUuid: 'Actor.hero' },
  );
  assert.deepEqual(unassignedSwap.rear.actorUuids, ['Actor.missing']);
  assert.deepEqual(
    createMarchingOrderModel({
      ...state,
      marchingOrder: unassignedSwap,
    }).groups[0].rows.map(({ actorUuid }) => actorUuid),
    ['Actor.hero'],
  );

  const removed = removeMarchingActor(
    { ...state, marchingOrder: unassignedSwap },
    'Actor.missing',
  );
  const removedAgain = removeMarchingActor(
    { ...state, marchingOrder: removed },
    'Actor.missing',
  );
  assert.deepEqual(removedAgain, removed);
  assert.deepEqual(state.marchingOrder.rear.actorUuids, ['Actor.retainer']);
});

test('marching mutations validate tracked Actors, ranks, positions, swaps, and notes', async () => {
  const definitions = new Map();
  const service = createPartyMarchingOrderService({
    store: {
      getState: createState,
      registerMutation: (operation, definition) => {
        definitions.set(operation, definition);
      },
    },
  });
  assert.equal(service.getModel().groups.length, 4);

  const place = definitions.get(PARTY_MARCHING_OPERATIONS.place);
  const state = createState();
  await place.mutate({
    payload: place.validatePayload({
      actorUuid: 'Actor.retainer',
      position: 0,
      rank: 'front',
    }),
    state,
  });
  assert.deepEqual(state.marchingOrder.front.actorUuids, [
    'Actor.retainer',
    'Actor.hero',
  ]);

  for (const payload of [
    { actorUuid: 'Actor.hero', position: -1, rank: 'front' },
    { actorUuid: 'Actor.hero', position: 0.5, rank: 'front' },
    { actorUuid: 'Actor.hero', rank: 'side' },
    { actorUuid: 'Actor.hero', rank: 'front', extra: true },
  ]) {
    assert.throws(() => place.validatePayload(payload));
  }
  await assert.rejects(
    place.mutate({
      payload: { actorUuid: 'Actor.unknown', rank: 'front' },
      state,
    }),
    (error) => error.code === PARTY_MARCHING_ERROR_CODES.notTracked,
  );
  await assert.rejects(
    place.mutate({
      payload: { actorUuid: 'Actor.mage', position: 9, rank: 'front' },
      state,
    }),
    (error) => error.code === PARTY_MARCHING_ERROR_CODES.invalidPosition,
  );

  const swap = definitions.get(PARTY_MARCHING_OPERATIONS.swap);
  assert.throws(() => swap.validatePayload({
    actorUuid: 'Actor.hero',
    otherActorUuid: 'Actor.hero',
  }));

  const note = definitions.get(PARTY_MARCHING_OPERATIONS.setNote);
  await note.mutate({
    payload: note.validatePayload({ rank: 'rear', text: 'Guard the mule.' }),
    state,
  });
  assert.equal(state.marchingOrder.rear.notes, 'Guard the mule.');

  const remove = definitions.get(PARTY_MARCHING_OPERATIONS.remove);
  await remove.mutate({
    payload: remove.validatePayload({ actorUuid: 'Actor.retainer' }),
    state,
  });
  assert.deepEqual(state.marchingOrder.front.actorUuids, ['Actor.hero']);
});
