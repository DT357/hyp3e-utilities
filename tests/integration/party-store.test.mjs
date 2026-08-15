import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MODULE_ID,
  SETTING_KEYS,
} from '../../module/core/constants.mjs';
import {
  PARTY_MUTATION_ERROR_CODES,
  assertExactObject,
  createPartyMutationProtocol,
} from '../../module/party/party-mutation-protocol.mjs';
import { createPartyStore } from '../../module/party/party-store.mjs';
import { createPartyStateDefault } from '../../module/party/party-state.mjs';
import { createSocketTransport } from '../../module/socket/socket-transport.mjs';

function createHarness({ partyState = createPartyStateDefault() } = {}) {
  const handlers = new Map();
  const gm = { id: 'gm', isGM: true, role: 4 };
  const player = { id: 'player', isGM: false, role: 2 };
  const users = new Map([[gm.id, gm], [player.id, player]]);
  users.activeGM = gm;
  const settingValues = new Map([
    [SETTING_KEYS.partyState, structuredClone(partyState)],
    [SETTING_KEYS.partySheetMinimumEditRole, 2],
    [SETTING_KEYS.partySheetExplicitEditorUserIds, []],
  ]);
  const settingWrites = [];
  let writeBehavior = null;
  const game = {
    modules: new Map([['socketlib', { active: true }]]),
    settings: {
      get: (namespace, key) => {
        assert.equal(namespace, MODULE_ID);
        return structuredClone(settingValues.get(key));
      },
      set: async (namespace, key, value) => {
        assert.equal(namespace, MODULE_ID);
        const snapshot = structuredClone(value);
        settingWrites.push([key, snapshot]);
        if (writeBehavior) return writeBehavior({ key, snapshot, settingValues });
        settingValues.set(key, snapshot);
        return snapshot;
      },
    },
    user: gm,
    users,
  };
  let requesterUserId = player.id;
  const socket = {
    register: (name, handler) => handlers.set(name, handler),
    executeAsGM: async (name, ...args) => handlers.get(name).call(
      { socketdata: { userId: requesterUserId } },
      ...args,
    ),
  };
  const warnings = [];
  const transport = createSocketTransport({
    game,
    logger: { warn: (...args) => warnings.push(args) },
    socketlib: { registerModule: () => socket },
  });
  const protocol = createPartyMutationProtocol({
    game,
    logger: { warn: (...args) => warnings.push(args) },
    transport,
  });
  const store = createPartyStore({
    game,
    logger: { warn: (...args) => warnings.push(args) },
    protocol,
  });
  transport.initialize();

  return {
    game,
    protocol,
    setWriteBehavior: (behavior) => {
      writeBehavior = behavior;
    },
    settingValues,
    settingWrites,
    store,
    users,
    warnings,
  };
}

function createRequest(requestId, expectedRevision, payload) {
  return { expectedRevision, payload, requestId };
}

function registerAddMember(store, mutate) {
  store.registerMutation('party.addMember', {
    mutate,
    validatePayload(payload) {
      assertExactObject(payload, {
        allowedKeys: ['actorUuid'],
        label: 'Add-member payload',
      });
      if (typeof payload.actorUuid !== 'string') {
        throw new TypeError('actorUuid must be a string.');
      }
      return { actorUuid: payload.actorUuid };
    },
  });
}

test('serialized writes reject the stale concurrent request with fresh state', async () => {
  const harness = createHarness();
  let releaseFirst;
  const firstMayFinish = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  let mutationCount = 0;
  registerAddMember(harness.store, async ({ payload, state }) => {
    mutationCount += 1;
    await firstMayFinish;
    state.memberActorUuids.push(payload.actorUuid);
  });

  const first = harness.protocol.request(
    'party.addMember',
    createRequest('first', 0, { actorUuid: 'Actor.first' }),
  );
  const stale = harness.protocol.request(
    'party.addMember',
    createRequest('stale', 0, { actorUuid: 'Actor.second' }),
  );
  releaseFirst();
  const [firstResult, staleResult] = await Promise.all([first, stale]);

  assert.equal(firstResult.ok, true);
  assert.equal(firstResult.value.previousRevision, 0);
  assert.equal(firstResult.value.state.revision, 1);
  assert.deepEqual(firstResult.value.state.memberActorUuids, ['Actor.first']);
  assert.equal(staleResult.ok, false);
  assert.equal(
    staleResult.error.code,
    PARTY_MUTATION_ERROR_CODES.staleRevision,
  );
  assert.equal(staleResult.error.details.state.revision, 1);
  assert.equal(mutationCount, 1);
  assert.deepEqual(
    harness.settingValues.get(SETTING_KEYS.partyState),
    firstResult.value.state,
  );
});

test('a partially applied setting failure restores the prior state', async () => {
  const harness = createHarness();
  registerAddMember(harness.store, ({ payload, state }) => {
    state.memberActorUuids.push(payload.actorUuid);
  });
  let firstWrite = true;
  harness.setWriteBehavior(({ key, snapshot, settingValues }) => {
    settingValues.set(key, snapshot);
    if (firstWrite) {
      firstWrite = false;
      throw new Error('injected post-write failure');
    }
    return snapshot;
  });

  const response = await harness.protocol.request(
    'party.addMember',
    createRequest('rollback', 0, { actorUuid: 'Actor.hero' }),
  );

  assert.equal(response.ok, false);
  assert.equal(
    response.error.code,
    PARTY_MUTATION_ERROR_CODES.stateWriteFailed,
  );
  assert.equal(response.error.details.rolledBack, true);
  assert.deepEqual(
    harness.settingValues.get(SETTING_KEYS.partyState),
    createPartyStateDefault(),
  );
  assert.equal(harness.settingWrites.length, 2);
});

test('a failed compensation reports rollback failure without claiming safety', async () => {
  const harness = createHarness();
  registerAddMember(harness.store, ({ payload, state }) => {
    state.memberActorUuids.push(payload.actorUuid);
  });
  let writeCount = 0;
  harness.setWriteBehavior(({ key, snapshot, settingValues }) => {
    writeCount += 1;
    if (writeCount === 1) settingValues.set(key, snapshot);
    throw new Error(writeCount === 1 ? 'write failed late' : 'rollback failed');
  });

  const response = await harness.protocol.request(
    'party.addMember',
    createRequest('rollback-failure', 0, { actorUuid: 'Actor.hero' }),
  );

  assert.equal(response.ok, false);
  assert.equal(
    response.error.code,
    PARTY_MUTATION_ERROR_CODES.rollbackFailed,
  );
  assert.equal(response.error.details.rolledBack, false);
  assert.equal(
    harness.settingValues.get(SETTING_KEYS.partyState).revision,
    1,
  );
});

test('an active-GM change during mutation prevents the final write', async () => {
  const harness = createHarness();
  const replacementGm = { id: 'replacement-gm', isGM: true, role: 4 };
  harness.users.set(replacementGm.id, replacementGm);
  registerAddMember(harness.store, ({ payload, state }) => {
    state.memberActorUuids.push(payload.actorUuid);
    harness.users.activeGM = replacementGm;
  });

  const response = await harness.protocol.request(
    'party.addMember',
    createRequest('gm-change', 0, { actorUuid: 'Actor.hero' }),
  );

  assert.equal(response.ok, false);
  assert.equal(
    response.error.code,
    PARTY_MUTATION_ERROR_CODES.notActiveGm,
  );
  assert.equal(harness.settingWrites.length, 0);
  assert.deepEqual(
    harness.settingValues.get(SETTING_KEYS.partyState),
    createPartyStateDefault(),
  );
});

test('mutation failure leaves state untouched and performs no setting write', async () => {
  const harness = createHarness();
  registerAddMember(harness.store, () => {
    throw new Error('mutator failed');
  });

  const response = await harness.protocol.request(
    'party.addMember',
    createRequest('mutator-failure', 0, { actorUuid: 'Actor.hero' }),
  );

  assert.equal(response.ok, false);
  assert.equal(
    response.error.code,
    PARTY_MUTATION_ERROR_CODES.executionFailed,
  );
  assert.equal(harness.settingWrites.length, 0);
  assert.deepEqual(harness.store.getState(), createPartyStateDefault());
});

test('only the active GM persists a schema migration without a revision bump', async () => {
  const versionZero = {
    schemaVersion: 0,
    memberActorUuids: ['Actor.hero'],
    notes: 'Old notes',
  };
  const activeHarness = createHarness({ partyState: versionZero });

  const activeState = await activeHarness.store.initialize();

  assert.equal(activeState.schemaVersion, 1);
  assert.equal(activeState.revision, 0);
  assert.equal(activeHarness.settingWrites.length, 1);
  assert.deepEqual(
    activeHarness.settingValues.get(SETTING_KEYS.partyState),
    activeState,
  );

  const inactiveHarness = createHarness({ partyState: versionZero });
  inactiveHarness.game.user = inactiveHarness.users.get('player');
  const inactiveState = await inactiveHarness.store.initialize();

  assert.equal(inactiveState.schemaVersion, 1);
  assert.equal(inactiveState.revision, 0);
  assert.equal(inactiveHarness.settingWrites.length, 0);
  assert.equal(
    inactiveHarness.settingValues.get(SETTING_KEYS.partyState).schemaVersion,
    0,
  );
});
