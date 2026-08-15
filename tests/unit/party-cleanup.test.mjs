import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PARTY_CLEANUP_OPERATIONS,
  createPartyCleanupService,
} from '../../module/party/party-cleanup.mjs';
import { createPartyStateDefault } from '../../module/party/party-state.mjs';

function createTrackedState() {
  const state = createPartyStateDefault();
  state.revision = 4;
  state.treasuryActorUuid = 'Actor.treasury';
  state.memberActorUuids = ['Actor.hero', 'Actor.deletedMember'];
  state.followerActorUuids = ['Actor.retainer', 'Actor.deletedFollower'];
  state.followerWages = {
    'Actor.retainer': 2,
    'Actor.deletedFollower': 5,
  };
  state.shares = {
    'Actor.hero': 1,
    'Actor.deletedMember': 1.25,
    'Actor.retainer': 0.5,
    'Actor.deletedFollower': 0.75,
  };
  state.marchingOrder.front.actorUuids = [
    'Actor.hero',
    'Actor.deletedFollower',
  ];
  state.marchingOrder.rear.actorUuids = [
    'Actor.deletedMember',
    'Actor.retainer',
  ];
  return state;
}

function createHarness({ state = createTrackedState() } = {}) {
  const definitions = new Map();
  const requests = [];
  const subscriptions = new Map();
  let nextHookId = 1;
  const game = {
    actors: new Map([
      ['hero', { id: 'hero', uuid: 'Actor.hero' }],
      ['retainer', { id: 'retainer', uuid: 'Actor.retainer' }],
      ['treasury', { id: 'treasury', uuid: 'Actor.treasury' }],
    ]),
    user: { id: 'gm', isGM: true },
    users: { activeGM: { id: 'gm' } },
  };
  const hooks = {
    off(name, id) {
      if (subscriptions.get(id)?.name === name) subscriptions.delete(id);
    },
    on(name, callback) {
      const id = nextHookId;
      nextHookId += 1;
      subscriptions.set(id, { callback, name });
      return id;
    },
  };
  const service = createPartyCleanupService({
    game,
    hooks,
    mutations: {
      request: async (operation, envelope) => {
        requests.push({ envelope, operation });
        return { ok: true, value: { state } };
      },
    },
    requestIdProvider: (() => {
      let sequence = 0;
      return () => `cleanup-${sequence += 1}`;
    })(),
    store: {
      getState: () => state,
      registerMutation: (operation, definition) => {
        definitions.set(operation, definition);
      },
    },
  });
  return {
    definitions,
    game,
    requests,
    service,
    state,
    subscriptions,
  };
}

test('cleanup mutation removes deleted member/follower metadata but preserves treasury', async () => {
  const harness = createHarness();
  const definition = harness.definitions.get(PARTY_CLEANUP_OPERATIONS.prune);
  const payload = definition.validatePayload({
    actorUuids: ['Actor.deletedMember', 'Actor.deletedFollower'],
  });

  await definition.mutate({ payload, state: harness.state });

  assert.deepEqual(harness.state.memberActorUuids, ['Actor.hero']);
  assert.deepEqual(harness.state.followerActorUuids, ['Actor.retainer']);
  assert.deepEqual(harness.state.followerWages, { 'Actor.retainer': 2 });
  assert.deepEqual(harness.state.shares, {
    'Actor.hero': 1,
    'Actor.retainer': 0.5,
  });
  assert.deepEqual(harness.state.marchingOrder.front.actorUuids, ['Actor.hero']);
  assert.deepEqual(harness.state.marchingOrder.rear.actorUuids, ['Actor.retainer']);
  assert.equal(harness.state.treasuryActorUuid, 'Actor.treasury');

  assert.throws(
    () => definition.validatePayload({ actorUuids: ['Actor.valid', 'bad'] }),
    /world Actor UUID/i,
  );
  assert.throws(
    () => definition.validatePayload({ actorUuids: [], extra: true }),
    /unknown field/i,
  );
});

test('cleanup skips treasury and synthetic Actor deletion without writing state', async () => {
  const harness = createHarness();

  for (const actor of [
    {
      documentName: 'Actor',
      isToken: false,
      uuid: 'Actor.treasury',
    },
    {
      documentName: 'Actor',
      isToken: true,
      uuid: 'Scene.scene.Token.token',
    },
  ]) {
    const result = await harness.service.pruneDeletedActor(actor);
    assert.equal(result.skipped, true);
  }

  assert.equal(harness.requests.length, 0);
  assert.equal(harness.state.treasuryActorUuid, 'Actor.treasury');
});

test('cleanup discovers missing tracked Actors and registers one deletion hook', async () => {
  const harness = createHarness();

  harness.service.start();
  harness.service.start();
  assert.equal(harness.subscriptions.size, 1);
  assert.equal([...harness.subscriptions.values()][0].name, 'deleteActor');

  await harness.service.pruneMissingReferences();
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.requests[0].operation, PARTY_CLEANUP_OPERATIONS.prune);
  assert.equal(harness.requests[0].envelope.expectedRevision, 4);
  assert.deepEqual(harness.requests[0].envelope.payload.actorUuids, [
    'Actor.deletedMember',
    'Actor.deletedFollower',
  ]);

  harness.service.stop();
  assert.equal(harness.subscriptions.size, 0);
});

test('cleanup retries a stale authoritative request with fresh state', async () => {
  const harness = createHarness();
  harness.service.stop();
  harness.service = createPartyCleanupService({
    game: harness.game,
    hooks: { on: () => 1, off: () => {} },
    mutations: {
      request: async (operation, envelope) => {
        harness.requests.push({ envelope, operation });
        if (harness.requests.length === 1) {
          harness.state.revision = 5;
          return { error: { code: 'staleRevision' }, ok: false };
        }
        return { ok: true };
      },
    },
    requestIdProvider: (() => {
      let sequence = 0;
      return () => `retry-${sequence += 1}`;
    })(),
    store: {
      getState: () => harness.state,
      registerMutation: () => {},
    },
  });

  const result = await harness.service.pruneDeletedActor({
    documentName: 'Actor',
    isToken: false,
    uuid: 'Actor.deletedMember',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    harness.requests.map(({ envelope }) => envelope.expectedRevision),
    [4, 5],
  );
  assert.notEqual(
    harness.requests[0].envelope.requestId,
    harness.requests[1].envelope.requestId,
  );
});
