import assert from 'node:assert/strict';
import test from 'node:test';

import { hyp3eAdapter } from '../../module/adapters/hyp3e-adapter.mjs';
import {
  PARTY_WAGE_PREVIEW_OPERATIONS,
  createPartyWagePreviewService,
} from '../../module/party/party-wage-preview.mjs';
import { createPartyStateDefault } from '../../module/party/party-state.mjs';

function createActor(id, type, name = id) {
  return {
    documentName: 'Actor',
    flags: {},
    id,
    isToken: false,
    name,
    system: {
      money: {
        cp: { value: '0' }, sp: { value: '0' }, ep: { value: '0' },
        gp: { value: '0' }, pp: { value: '0' },
      },
    },
    type,
    update: async () => { throw new Error('Wage preview must not write.'); },
    uuid: `Actor.${id}`,
  };
}

function createHarness() {
  const character = createActor('character', 'character', 'Character Retainer');
  const npc = createActor('npc', 'npc', 'NPC Hireling');
  const zero = createActor('zero', 'npc', 'Unpaid Guide');
  const treasury = createActor('treasury', 'treasure', 'Party Treasury');
  treasury.flags = { 'hyp3e-utilities': { partyTreasury: true } };
  treasury.getFlag = (namespace, key) => treasury.flags?.[namespace]?.[key];
  treasury.system.money.gp.value = '8';
  const actors = [character, npc, zero, treasury];
  actors.get = (id) => actors.find((actor) => actor.id === id);
  const state = createPartyStateDefault();
  state.revision = 15;
  state.treasuryActorUuid = treasury.uuid;
  state.followerActorUuids = [
    character.uuid, npc.uuid, zero.uuid, 'Actor.missing',
  ];
  state.followerWages = {
    [character.uuid]: 3,
    [npc.uuid]: 5,
    [zero.uuid]: 0,
    'Actor.missing': 4,
  };
  const definitions = new Map();
  const mutations = {
    registerOperation: (operation, definition) => definitions.set(operation, definition),
    request: async (operation, envelope) => {
      const definition = definitions.get(operation);
      try {
        return {
          ok: true,
          value: await definition.execute({
            expectedRevision: envelope.expectedRevision,
            payload: definition.validatePayload(envelope.payload),
            requester: { id: 'trusted', isGM: false },
          }),
        };
      }
      catch (error) {
        return { error: { code: error.code, message: error.message }, ok: false };
      }
    },
  };
  const service = createPartyWagePreviewService({
    adapter: hyp3eAdapter,
    game: { actors },
    mutations,
    requestIdProvider: () => 'wage-preview-request',
    store: { getState: () => state },
  });
  return { definitions, service, state, treasury };
}

test('wage preview uses authoritative follower wages and treasury GP without writes', async () => {
  const harness = createHarness();
  const response = await harness.service.requestPreview({}, 15);

  assert.equal(response.ok, true);
  assert.equal(response.value.availableGp, 8);
  assert.equal(response.value.totalDueGp, 8);
  assert.equal(response.value.remainingGp, 0);
  assert.equal(response.value.canSettle, true);
  assert.equal(response.value.treasuryActorUuid, 'Actor.treasury');
  assert.deepEqual(response.value.followers.map((entry) => ({
    actorUuid: entry.actorUuid,
    missing: entry.missing,
    name: entry.name,
    paymentGp: entry.paymentGp,
    selected: entry.selected,
    wageGp: entry.wageGp,
  })), [
    { actorUuid: 'Actor.character', missing: false, name: 'Character Retainer', paymentGp: 3, selected: true, wageGp: 3 },
    { actorUuid: 'Actor.npc', missing: false, name: 'NPC Hireling', paymentGp: 5, selected: true, wageGp: 5 },
    { actorUuid: 'Actor.zero', missing: false, name: 'Unpaid Guide', paymentGp: 0, selected: true, wageGp: 0 },
    { actorUuid: 'Actor.missing', missing: true, name: 'Actor.missing', paymentGp: 0, selected: false, wageGp: 0 },
  ]);
});

test('wage preview supports partial selection and reports insufficient GP', async () => {
  const harness = createHarness();
  const partial = await harness.service.requestPreview({
    selectedActorUuids: ['Actor.character'],
  }, 15);
  assert.equal(partial.value.totalDueGp, 3);
  assert.equal(partial.value.remainingGp, 5);

  harness.treasury.system.money.gp.value = '2';
  const insufficient = await harness.service.requestPreview({
    selectedActorUuids: ['Actor.character'],
  }, 15);
  assert.equal(insufficient.value.enoughGp, false);
  assert.equal(insufficient.value.shortfallGp, 1);
  assert.equal(insufficient.value.remainingGp, 2);
  assert.equal(insufficient.value.canSettle, false);
});

test('wage preview rejects stale and malformed requests', async () => {
  const harness = createHarness();
  const stale = await harness.service.requestPreview({}, 14);
  assert.equal(stale.error.code, 'staleRevision');

  const definition = harness.definitions.get(PARTY_WAGE_PREVIEW_OPERATIONS.preview);
  assert.throws(
    () => definition.validatePayload({ selectedActorUuids: [], extra: true }),
    /unknown field/i,
  );
  assert.throws(
    () => definition.validatePayload({ selectedActorUuids: ['bad'] }),
    /world actor uuid/i,
  );
});
