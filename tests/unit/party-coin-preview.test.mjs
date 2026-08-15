import assert from 'node:assert/strict';
import test from 'node:test';

import { hyp3eAdapter } from '../../module/adapters/hyp3e-adapter.mjs';
import {
  PARTY_COIN_PREVIEW_OPERATIONS,
  createPartyCoinPreviewService,
} from '../../module/party/party-coin-preview.mjs';
import { createPartyStateDefault } from '../../module/party/party-state.mjs';

function createActor(id, type, name = id) {
  return {
    documentName: 'Actor',
    id,
    isToken: false,
    name,
    system: {
      money: Object.fromEntries(['cp', 'sp', 'ep', 'gp', 'pp'].map(
        (key) => [key, { value: '0' }],
      )),
    },
    type,
    update: async () => { throw new Error('Preview must not write.'); },
    uuid: `Actor.${id}`,
  };
}

function createHarness() {
  const hero = createActor('hero', 'character', 'Hero');
  const npc = createActor('npc', 'npc', 'NPC Hireling');
  const treasury = createActor('treasury', 'treasure', 'Party Treasury');
  treasury.flags = { 'hyp3e-utilities': { partyTreasury: true } };
  treasury.getFlag = (namespace, key) => treasury.flags?.[namespace]?.[key];
  Object.assign(treasury.system.money, {
    cp: { value: '11' }, sp: { value: '10' }, ep: { value: '9' },
    gp: { value: '8' }, pp: { value: '7' },
  });
  const actors = [hero, npc, treasury];
  actors.get = (id) => actors.find((actor) => actor.id === id);
  const state = createPartyStateDefault();
  state.revision = 12;
  state.treasuryActorUuid = treasury.uuid;
  state.memberActorUuids = [hero.uuid];
  state.followerActorUuids = [npc.uuid, 'Actor.missing'];
  state.shares = { [hero.uuid]: 1, [npc.uuid]: 0.5, 'Actor.missing': 1 };
  const definitions = new Map();
  const requests = [];
  const mutations = {
    registerOperation: (operation, definition) => definitions.set(operation, definition),
    request: async (operation, envelope) => {
      requests.push({ envelope: structuredClone(envelope), operation });
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
  const service = createPartyCoinPreviewService({
    adapter: hyp3eAdapter,
    game: { actors },
    mutations,
    requestIdProvider: () => 'coin-preview-request',
    store: { getState: () => state },
  });
  return { definitions, hero, npc, requests, service, state, treasury };
}

test('coin preview uses authoritative treasury and tracked Actor data without writes', async () => {
  const harness = createHarness();
  const response = await harness.service.requestPreview({
    selectedActorUuids: ['Actor.hero', 'Actor.npc'],
    splitCoins: { cp: 11, sp: 6, ep: 3, gp: 8, pp: 0 },
  }, 12);

  assert.equal(response.ok, true);
  assert.equal(response.value.revision, 12);
  assert.equal(response.value.treasuryActorUuid, 'Actor.treasury');
  assert.deepEqual(response.value.availableCoins, {
    cp: 11, sp: 10, ep: 9, gp: 8, pp: 7,
  });
  assert.deepEqual(response.value.distributions.map((entry) => ({
    actorType: entry.actorType,
    actorUuid: entry.actorUuid,
    awards: entry.awards,
    missing: entry.missing,
    name: entry.name,
    writeback: entry.writeback,
  })), [
    {
      actorType: 'character', actorUuid: 'Actor.hero',
      awards: { cp: 7, sp: 4, ep: 2, gp: 5, pp: 0 },
      missing: false, name: 'Hero', writeback: true,
    },
    {
      actorType: 'npc', actorUuid: 'Actor.npc',
      awards: { cp: 3, sp: 2, ep: 1, gp: 2, pp: 0 },
      missing: false, name: 'NPC Hireling', writeback: false,
    },
    {
      actorType: 'missing', actorUuid: 'Actor.missing',
      awards: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      missing: true, name: 'Actor.missing', writeback: false,
    },
  ]);
  assert.deepEqual(response.value.splitRemainders, {
    cp: 1, sp: 0, ep: 0, gp: 1, pp: 0,
  });
  assert.deepEqual(response.value.remainingTreasuryCoins, {
    cp: 1, sp: 4, ep: 6, gp: 1, pp: 7,
  });
});

test('coin preview defaults to all available coins and positive-share recipients', async () => {
  const harness = createHarness();
  const response = await harness.service.requestPreview({}, 12);

  assert.equal(response.ok, true);
  assert.deepEqual(response.value.splitCoins, response.value.availableCoins);
  assert.deepEqual(response.value.distributions.map((entry) => entry.selected), [
    true, true, true,
  ]);
  assert.equal(response.value.distributions[2].included, false);
});

test('coin preview rejects stale and malformed requests before calculation', async () => {
  const harness = createHarness();
  const stale = await harness.service.requestPreview({}, 11);
  assert.equal(stale.error.code, 'staleRevision');

  const definition = harness.definitions.get(PARTY_COIN_PREVIEW_OPERATIONS.preview);
  assert.throws(
    () => definition.validatePayload({ selectedActorUuids: [], extra: true }),
    /unknown field/i,
  );
  assert.throws(
    () => definition.validatePayload({ splitCoins: { cp: 1 } }),
    /missing field/i,
  );
});
