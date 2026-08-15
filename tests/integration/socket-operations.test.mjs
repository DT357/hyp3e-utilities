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
import { createSocketTransport } from '../../module/socket/socket-transport.mjs';

function createHarness() {
  const handlers = new Map();
  const gm = { id: 'gm', isGM: true, role: 4 };
  const trusted = { id: 'trusted', isGM: false, role: 2 };
  const explicit = { id: 'explicit', isGM: false, role: 1 };
  const denied = { id: 'denied', isGM: false, role: 1 };
  const users = new Map([gm, trusted, explicit, denied].map(
    (user) => [user.id, user],
  ));
  users.activeGM = gm;
  const settingValues = new Map([
    [SETTING_KEYS.partySheetMinimumEditRole, 2],
    [SETTING_KEYS.partySheetExplicitEditorUserIds, ['explicit']],
  ]);
  const game = {
    modules: new Map([['socketlib', { active: true }]]),
    settings: {
      get: (namespace, key) => {
        assert.equal(namespace, MODULE_ID);
        return settingValues.get(key);
      },
    },
    user: gm,
    users,
  };
  let requesterUserId = trusted.id;
  const socket = {
    register: (name, handler) => handlers.set(name, handler),
    executeAsGM: async (name, ...args) => handlers.get(name).call(
      { socketdata: { userId: requesterUserId } },
      ...args,
    ),
  };
  const transport = createSocketTransport({
    game,
    logger: { warn() {} },
    socketlib: { registerModule: () => socket },
  });
  const warnings = [];
  const protocol = createPartyMutationProtocol({
    game,
    logger: { warn: (...args) => warnings.push(args) },
    transport,
  });
  let executionCount = 0;
  protocol.registerOperation('party.addMember', {
    execute: async ({ payload, requester }) => {
      executionCount += 1;
      return { actorUuid: payload.actorUuid, requesterUserId: requester.id };
    },
    validatePayload(payload) {
      assertExactObject(payload, {
        allowedKeys: ['actorUuid'],
        label: 'Add-member payload',
        requiredKeys: ['actorUuid'],
      });
      if (typeof payload.actorUuid !== 'string' || !payload.actorUuid.trim()) {
        throw new TypeError('actorUuid must be a non-empty string.');
      }
      return { actorUuid: payload.actorUuid.trim() };
    },
  });
  transport.initialize();

  return {
    game,
    get executionCount() {
      return executionCount;
    },
    protocol,
    setRequester: (userId) => {
      requesterUserId = userId;
    },
    settingValues,
    transport,
    warnings,
  };
}

function request(requestId, payload = { actorUuid: 'Actor.hero' }) {
  return {
    expectedRevision: 0,
    payload,
    requestId,
  };
}

test('GM, threshold, and explicit users dispatch; denied and spoofed users do not', async () => {
  const harness = createHarness();

  for (const userId of ['gm', 'trusted', 'explicit']) {
    harness.setRequester(userId);
    const response = await harness.protocol.request(
      'party.addMember',
      request(`allowed-${userId}`),
    );
    assert.equal(response.ok, true);
    assert.equal(response.value.requesterUserId, userId);
  }

  harness.setRequester('denied');
  const denied = await harness.protocol.request(
    'party.addMember',
    request('denied'),
  );
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, PARTY_MUTATION_ERROR_CODES.unauthorized);

  const spoofed = await harness.protocol.request(
    'party.addMember',
    request('spoofed', {
      actorUuid: 'Actor.hero',
      claimedUserId: 'gm',
    }),
  );
  assert.equal(spoofed.ok, false);
  assert.equal(spoofed.error.code, PARTY_MUTATION_ERROR_CODES.unauthorized);
  assert.equal(harness.executionCount, 3);
});

test('strict envelope and payload validation reject malformed requests', async () => {
  const harness = createHarness();
  const malformed = [
    null,
    {},
    request('', { actorUuid: 'Actor.hero' }),
    { ...request('negative-revision'), expectedRevision: -1 },
    { ...request('unknown-envelope'), extra: true },
    request('unknown-payload', { actorUuid: 'Actor.hero', extra: true }),
    request('missing-payload-field', {}),
    request('invalid-payload-field', { actorUuid: 42 }),
  ];

  for (const [index, envelope] of malformed.entries()) {
    const response = await harness.protocol.request(
      'party.addMember',
      envelope,
    );
    assert.equal(response.ok, false, `malformed request ${index}`);
    assert.equal(
      response.error.code,
      PARTY_MUTATION_ERROR_CODES.invalidRequest,
      `malformed request ${index}`,
    );
  }
  assert.equal(harness.executionCount, 0);
});

test('in-flight and completed duplicate request IDs execute exactly once', async () => {
  const harness = createHarness();
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  let executions = 0;
  harness.protocol.registerOperation('party.slowMutation', {
    execute: async () => {
      executions += 1;
      await pending;
      return { applied: true };
    },
    validatePayload(payload) {
      assertExactObject(payload, { allowedKeys: [] });
      return {};
    },
  });

  const envelope = request('same-id', {});
  const first = harness.protocol.request('party.slowMutation', envelope);
  const inFlightDuplicate = harness.protocol.request(
    'party.slowMutation',
    envelope,
  );
  release();
  const [firstResult, duplicateResult] = await Promise.all([
    first,
    inFlightDuplicate,
  ]);
  const completedDuplicate = await harness.protocol.request(
    'party.slowMutation',
    envelope,
  );

  assert.equal(executions, 1);
  assert.deepEqual(duplicateResult, firstResult);
  assert.deepEqual(completedDuplicate, firstResult);
});

test('no active GM and unknown operations return structured client errors', async () => {
  const harness = createHarness();
  harness.game.users.activeGM = null;

  const unavailable = await harness.protocol.request(
    'party.addMember',
    request('no-gm'),
  );
  assert.equal(unavailable.ok, false);
  assert.equal(
    unavailable.error.code,
    PARTY_MUTATION_ERROR_CODES.transportUnavailable,
  );

  harness.game.users.activeGM = harness.game.users.get('gm');
  const unknown = await harness.protocol.request(
    'party.replaceEverything',
    request('unknown'),
  );
  assert.equal(unknown.ok, false);
  assert.equal(
    unknown.error.code,
    PARTY_MUTATION_ERROR_CODES.unknownOperation,
  );
});

test('execution failures are logged but return a sanitized structured error', async () => {
  const harness = createHarness();
  harness.protocol.registerOperation('party.fail', {
    execute: () => {
      throw new Error('private technical detail');
    },
    validatePayload: () => ({}),
  });

  const response = await harness.protocol.request(
    'party.fail',
    request('failure', {}),
  );

  assert.equal(response.ok, false);
  assert.equal(
    response.error.code,
    PARTY_MUTATION_ERROR_CODES.executionFailed,
  );
  assert.doesNotMatch(response.error.message, /private technical detail/);
  assert.match(String(harness.warnings[0]?.[1]), /private technical detail/);
});
