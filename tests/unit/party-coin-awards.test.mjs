import assert from 'node:assert/strict';
import test from 'node:test';

import { hyp3eAdapter } from '../../module/adapters/hyp3e-adapter.mjs';
import {
  PARTY_COIN_AWARD_ERROR_CODES,
  PARTY_COIN_AWARD_OPERATIONS,
  createPartyCoinAwardService,
} from '../../module/party/party-coin-awards.mjs';
import { createPartyCoinPreviewService } from '../../module/party/party-coin-preview.mjs';
import { createPartyStateDefault } from '../../module/party/party-state.mjs';

const COIN_KEYS = ['cp', 'sp', 'ep', 'gp', 'pp'];

function applyFlatUpdate(actor, update) {
  for (const [path, value] of Object.entries(update)) {
    const keys = path.split('.');
    const last = keys.pop();
    let target = actor;
    for (const key of keys) target = target[key] ??= {};
    target[last] = value;
  }
}

function createActor(id, type, coins) {
  const actor = {
    documentName: 'Actor',
    flags: {},
    id,
    isToken: false,
    name: id,
    system: {
      money: Object.fromEntries(COIN_KEYS.map((key) => [
        key,
        { value: String(coins?.[key] ?? 0) },
      ])),
    },
    type,
    updateCallCount: 0,
    uuid: `Actor.${id}`,
  };
  actor.getFlag = (namespace, key) => actor.flags?.[namespace]?.[key];
  actor.update = async (update) => {
    actor.updateCallCount += 1;
    if (actor.failOnUpdateCalls?.has(actor.updateCallCount)) {
      throw new Error(`${id} update ${actor.updateCallCount} failed`);
    }
    applyFlatUpdate(actor, update);
  };
  return actor;
}

function createHarness() {
  const hero = createActor('hero', 'character', {
    cp: 1, sp: 1, ep: 1, gp: 1, pp: 1,
  });
  const retainer = createActor('retainer', 'character', {
    cp: 2, sp: 2, ep: 2, gp: 2, pp: 2,
  });
  const npc = createActor('npc', 'npc');
  const treasury = createActor('treasury', 'treasure', {
    cp: 12, sp: 8, ep: 4, gp: 20, pp: 0,
  });
  treasury.flags = { 'hyp3e-utilities': { partyTreasury: true } };
  const actors = [hero, retainer, npc, treasury];
  actors.get = (id) => actors.find((actor) => actor.id === id);
  const state = createPartyStateDefault();
  state.revision = 7;
  state.treasuryActorUuid = treasury.uuid;
  state.memberActorUuids = [hero.uuid];
  state.followerActorUuids = [retainer.uuid, npc.uuid];
  state.shares = { [hero.uuid]: 1, [retainer.uuid]: 0.5, [npc.uuid]: 0.5 };
  const store = { getState: () => state };
  const definitions = new Map();
  const requester = { id: 'trusted', isGM: false, name: 'Trusted Player' };
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
            requester,
            requestId: envelope.requestId,
          }),
        };
      }
      catch (error) {
        return { error: { code: error.code, message: error.message }, ok: false };
      }
    },
  };
  const previewService = createPartyCoinPreviewService({
    adapter: hyp3eAdapter,
    game: { actors },
    mutations,
    store,
  });
  const reports = [];
  let auditFailure = false;
  const service = createPartyCoinAwardService({
    adapter: hyp3eAdapter,
    chatCards: {
      async createCoinDistributionReport(report) {
        if (auditFailure) throw new Error('chat failed');
        reports.push(structuredClone(report));
      },
    },
    game: { actors },
    logger: { warn: () => {} },
    mutations,
    previewService,
    requestIdProvider: () => 'coin-award-request',
    store,
  });
  const preview = previewService.getPreview({}, state);
  return {
    definitions,
    get auditFailure() { return auditFailure; },
    set auditFailure(value) { auditFailure = value; },
    hero,
    npc,
    preview,
    reports,
    retainer,
    service,
    state,
    treasury,
  };
}

test('coin transaction conserves all denominations, writes characters and treasury once, and audits NPC consumption', async () => {
  const harness = createHarness();

  const response = await harness.service.distribute(harness.preview, 7);

  assert.equal(response.ok, true);
  assert.deepEqual(hyp3eAdapter.getMoney(harness.hero), {
    cp: 7, sp: 5, ep: 3, gp: 11, pp: 1,
  });
  assert.deepEqual(hyp3eAdapter.getMoney(harness.retainer), {
    cp: 5, sp: 4, ep: 3, gp: 7, pp: 2,
  });
  assert.deepEqual(hyp3eAdapter.getMoney(harness.treasury), {
    cp: 0, sp: 0, ep: 0, gp: 0, pp: 0,
  });
  assert.equal(harness.hero.updateCallCount, 1);
  assert.equal(harness.retainer.updateCallCount, 1);
  assert.equal(harness.treasury.updateCallCount, 1);
  assert.equal(harness.npc.updateCallCount, 0);
  assert.equal(harness.reports.length, 1);
  assert.deepEqual(harness.reports[0].recipients.map((entry) => ({
    actorUuid: entry.actorUuid,
    awards: entry.awards,
    writeback: entry.writeback,
  })), [
    { actorUuid: 'Actor.hero', awards: { cp: 6, sp: 4, ep: 2, gp: 10, pp: 0 }, writeback: true },
    { actorUuid: 'Actor.retainer', awards: { cp: 3, sp: 2, ep: 1, gp: 5, pp: 0 }, writeback: true },
    { actorUuid: 'Actor.npc', awards: { cp: 3, sp: 2, ep: 1, gp: 5, pp: 0 }, writeback: false },
  ]);
});

test('coin transaction restores earlier character purses after a later character failure', async () => {
  const harness = createHarness();
  harness.retainer.failOnUpdateCalls = new Set([1]);

  const response = await harness.service.distribute(harness.preview, 7);

  assert.equal(response.error.code, PARTY_COIN_AWARD_ERROR_CODES.writeFailed);
  assert.deepEqual(hyp3eAdapter.getMoney(harness.hero), {
    cp: 1, sp: 1, ep: 1, gp: 1, pp: 1,
  });
  assert.deepEqual(hyp3eAdapter.getMoney(harness.treasury), harness.preview.availableCoins);
  assert.equal(harness.reports.length, 0);
});

test('coin transaction restores character purses after treasury or chat failure', async () => {
  for (const failure of ['treasury', 'chat']) {
    const harness = createHarness();
    if (failure === 'treasury') harness.treasury.failOnUpdateCalls = new Set([1]);
    else harness.auditFailure = true;

    const response = await harness.service.distribute(harness.preview, 7);

    assert.equal(response.error.code, failure === 'treasury'
      ? PARTY_COIN_AWARD_ERROR_CODES.writeFailed
      : PARTY_COIN_AWARD_ERROR_CODES.auditFailed);
    assert.deepEqual(hyp3eAdapter.getMoney(harness.hero), {
      cp: 1, sp: 1, ep: 1, gp: 1, pp: 1,
    });
    assert.deepEqual(hyp3eAdapter.getMoney(harness.retainer), {
      cp: 2, sp: 2, ep: 2, gp: 2, pp: 2,
    });
    assert.deepEqual(hyp3eAdapter.getMoney(harness.treasury), harness.preview.availableCoins);
    assert.equal(harness.reports.length, 0);
  }
});

test('coin transaction reports compensation failure and rejects stale, changed, and malformed previews', async () => {
  const rollbackHarness = createHarness();
  rollbackHarness.retainer.failOnUpdateCalls = new Set([1]);
  rollbackHarness.hero.failOnUpdateCalls = new Set([2]);
  const failedRollback = await rollbackHarness.service.distribute(
    rollbackHarness.preview,
    7,
  );
  assert.equal(
    failedRollback.error.code,
    PARTY_COIN_AWARD_ERROR_CODES.rollbackFailed,
  );

  const harness = createHarness();
  harness.state.revision = 8;
  const stale = await harness.service.distribute(harness.preview, 7);
  assert.equal(stale.error.code, 'staleRevision');
  harness.state.revision = 7;
  harness.treasury.system.money.gp.value = '19';
  const changed = await harness.service.distribute(harness.preview, 7);
  assert.equal(changed.error.code, PARTY_COIN_AWARD_ERROR_CODES.previewChanged);

  const definition = harness.definitions.get(PARTY_COIN_AWARD_OPERATIONS.distribute);
  assert.throws(
    () => definition.validatePayload({ expectedFingerprint: '{}', selectedActorUuids: [], splitCoins: {}, extra: true }),
    /unknown field/i,
  );
  assert.equal(harness.hero.updateCallCount, 0);
  assert.equal(harness.npc.updateCallCount, 0);
});
