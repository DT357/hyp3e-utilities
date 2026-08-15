import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SocketTransportUnavailableError,
  createSocketTransport,
} from '../../module/socket/socket-transport.mjs';

function createHarness({ active = true } = {}) {
  const handlers = new Map();
  const calls = [];
  const activeGm = { id: 'gm-one', active: true, isGM: true };
  const game = {
    user: activeGm,
    users: { activeGM: activeGm },
    modules: new Map([['socketlib', { active, version: 'v1.1.4' }]]),
  };
  const socket = {
    register: (name, handler) => handlers.set(name, handler),
    executeAsGM: async (name, ...args) => {
      calls.push({ gmId: game.users.activeGM?.id, name, args });
      const handler = handlers.get(name);
      return handler.call(
        { socketdata: { userId: 'requesting-player' } },
        ...args,
      );
    },
  };
  const socketlib = { registerModule: () => socket };
  return { calls, game, handlers, socketlib };
}

test('transport registers named operations and derives caller identity', async () => {
  const harness = createHarness();
  const transport = createSocketTransport(harness);
  transport.registerOperation('party.inspect', function inspect(payload) {
    return {
      payload,
      requesterUserId: this.socketdata.userId,
    };
  });

  assert.equal(transport.initialize(), true);
  const response = await transport.executeAsActiveGM('ping', {
    claimedUserId: 'gm-one',
  });

  assert.deepEqual(response, {
    requesterUserId: 'requesting-player',
    executingUserId: 'gm-one',
    executingUserIsGM: true,
  });
  assert.equal(transport.available, true);
  assert.deepEqual(
    await transport.executeAsActiveGM('party.inspect', { value: 1 }),
    {
      payload: { value: 1 },
      requesterUserId: 'requesting-player',
    },
  );
  assert.throws(
    () => transport.registerOperation('party.inspect', () => {}),
    /already registered/i,
  );
  await assert.rejects(
    transport.executeAsActiveGM('replacePartyState', {}),
    /not registered/i,
  );
});

test('transport binds operations registered after initialization', async () => {
  const harness = createHarness();
  const transport = createSocketTransport(harness);
  transport.initialize();

  transport.registerOperation('party.late', () => 'late-bound');

  assert.equal(
    await transport.executeAsActiveGM('party.late'),
    'late-bound',
  );
});

test('transport reports a missing or inactive SocketLib dependency', () => {
  for (const harness of [createHarness({ active: false }), {
    game: {
      modules: new Map(),
      users: { activeGM: null },
    },
    socketlib: undefined,
  }]) {
    const warnings = [];
    const transport = createSocketTransport({
      ...harness,
      logger: { warn: (...args) => warnings.push(args.join(' ')) },
    });

    assert.equal(transport.initialize(), false);
    assert.equal(transport.available, false);
    assert.match(warnings.join(' '), /SocketLib/);
  }
});

test('transport handles absent and changed active GMs without stale routing', async () => {
  const harness = createHarness();
  const transport = createSocketTransport(harness);
  transport.initialize();
  harness.game.users.activeGM = null;

  await assert.rejects(
    transport.executeAsActiveGM('ping'),
    SocketTransportUnavailableError,
  );

  harness.game.users.activeGM = {
    id: 'gm-two',
    active: true,
    isGM: true,
  };
  harness.game.user = harness.game.users.activeGM;
  const response = await transport.executeAsActiveGM('ping');

  assert.equal(response.executingUserId, 'gm-two');
  assert.equal(harness.calls.at(-1).gmId, 'gm-two');
  assert.equal(transport.initialize(), true, 'reinitialization is idempotent');
});
