import assert from 'node:assert/strict';
import test from 'node:test';

import { hyp3eAdapter } from '../../module/adapters/hyp3e-adapter.mjs';
import {
  createPartyStateDefault,
  normalizePartyState,
} from '../../module/party/party-state.mjs';
import { createPartyTreasuryService } from '../../module/party/party-treasury.mjs';
import {
  RELEASED_MODULE_FIXTURES,
} from '../fixtures/released-module-states.mjs';

function createTreasuryHarness(fixture) {
  let state = normalizePartyState(
    fixture.partyState ?? createPartyStateDefault(),
  );
  let actorSequence = 0;
  const actors = fixture.treasuries.map((treasury) => ({
    documentName: 'Actor',
    flags: structuredClone(treasury.flags),
    id: treasury.id,
    isToken: false,
    items: [],
    name: treasury.name,
    ownership: {},
    system: { money: {} },
    type: treasury.type,
    uuid: `Actor.${treasury.id}`,
    getFlag(namespace, key) {
      return this.flags?.[namespace]?.[key];
    },
  }));
  actors.get = (id) => actors.find((actor) => actor.id === id);
  const game = {
    actors,
    folders: [],
    user: { id: 'gm', isGM: true },
    users: { activeGM: { id: 'gm' } },
  };
  const storeMutations = new Map();
  const operations = new Map();
  const store = {
    getState: () => state,
    registerMutation: (operation, definition) => {
      storeMutations.set(operation, definition);
    },
  };
  const mutations = {
    registerOperation: (operation, definition) => operations.set(operation, definition),
    request: async (operation, envelope) => {
      const operationDefinition = operations.get(operation);
      if (operationDefinition) {
        return {
          ok: true,
          value: await operationDefinition.execute({
            expectedRevision: envelope.expectedRevision,
            payload: operationDefinition.validatePayload(envelope.payload),
            requester: game.user,
          }),
        };
      }
      const definition = storeMutations.get(operation);
      const draft = structuredClone(state);
      await definition.mutate({
        payload: definition.validatePayload(envelope.payload),
        requester: game.user,
        state: draft,
      });
      state = { ...draft, revision: state.revision + 1 };
      return { ok: true, value: { state } };
    },
  };
  const service = createPartyTreasuryService({
    ActorClass: {
      async create(data) {
        actorSequence += 1;
        const actor = {
          documentName: 'Actor',
          flags: structuredClone(data.flags),
          id: `created-${actorSequence}`,
          isToken: false,
          items: [],
          name: data.name,
          ownership: structuredClone(data.ownership),
          system: { money: {} },
          type: data.type,
          get uuid() { return `Actor.${this.id}`; },
          getFlag(namespace, key) {
            return this.flags?.[namespace]?.[key];
          },
        };
        actors.push(actor);
        return actor;
      },
    },
    adapter: hyp3eAdapter,
    FolderClass: { create: async () => null },
    game,
    mutations,
    ownershipLevels: { NONE: 0, OWNER: 3 },
    requestIdProvider: () => 'release-migration',
    store,
  });
  return { actors, getState: () => state, service };
}

test('every released module fixture upgrades to the current Party State schema', () => {
  assert.deepEqual(
    RELEASED_MODULE_FIXTURES.map((fixture) => fixture.moduleVersion),
    ['0.1.0', '0.2.0', '0.3.0', '0.4.0', '0.5.0'],
  );

  for (const fixture of RELEASED_MODULE_FIXTURES) {
    const source = fixture.partyState ?? createPartyStateDefault();
    const before = structuredClone(source);
    const upgraded = normalizePartyState(source);

    assert.deepEqual(source, before, `${fixture.moduleVersion} mutated source`);
    assert.deepEqual(
      upgraded,
      fixture.expectedPartyState,
      `${fixture.moduleVersion} Party State`,
    );
  }
});

test('every released module fixture reaches a ready managed treasury safely', async () => {
  for (const fixture of RELEASED_MODULE_FIXTURES) {
    const harness = createTreasuryHarness(fixture);
    const beforeActorIds = harness.actors.map((actor) => actor.id);

    const result = await harness.service.initialize();
    const status = harness.service.getStatus();

    assert.equal(result.ok, true, `${fixture.moduleVersion} initialization`);
    assert.equal(status.kind, 'ready', `${fixture.moduleVersion} status`);
    assert.equal(
      harness.getState().treasuryActorUuid,
      status.actor.uuid,
      `${fixture.moduleVersion} binding`,
    );
    assert.equal(
      status.actor.getFlag('hyp3e-utilities', 'partyTreasury'),
      true,
      `${fixture.moduleVersion} flag`,
    );
    if (fixture.expectedTreasuryAction === 'create') {
      assert.equal(harness.actors.length, beforeActorIds.length + 1);
    }
    else {
      assert.deepEqual(harness.actors.map((actor) => actor.id), beforeActorIds);
      assert.equal(
        status.actor.id,
        fixture.expectedTreasuryId,
        `${fixture.moduleVersion} recovered Actor`,
      );
    }
  }
});
