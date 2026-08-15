import assert from 'node:assert/strict';
import test from 'node:test';

import { hyp3eAdapter } from '../../module/adapters/hyp3e-adapter.mjs';
import { createPartyStateDefault } from '../../module/party/party-state.mjs';
import {
  PARTY_WAGE_SETTLEMENT_ERROR_CODES,
  PARTY_WAGE_SETTLEMENT_OPERATIONS,
  createPartyWageSettlementService,
} from '../../module/party/party-wage-settlement.mjs';
import { createPartyWagePreviewService } from '../../module/party/party-wage-preview.mjs';

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

function createActor(id, type, coins = {}) {
  const actor = {
    documentName: 'Actor',
    flags: {},
    id,
    isToken: false,
    name: id,
    system: {
      money: Object.fromEntries(COIN_KEYS.map((key) => [
        key,
        { value: String(coins[key] ?? 0) },
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
  const character = createActor('character', 'character');
  const npc = createActor('npc', 'npc');
  const zero = createActor('zero', 'npc');
  const treasury = createActor('treasury', 'treasure', {
    cp: 1, sp: 2, ep: 3, gp: 10, pp: 4,
  });
  treasury.flags = { 'hyp3e-utilities': { partyTreasury: true } };
  const actors = [character, npc, zero, treasury];
  actors.get = (id) => actors.find((actor) => actor.id === id);

  const state = createPartyStateDefault();
  state.revision = 12;
  state.treasuryActorUuid = treasury.uuid;
  state.followerActorUuids = [character.uuid, npc.uuid, zero.uuid];
  state.followerWages = {
    [character.uuid]: 3,
    [npc.uuid]: 5,
    [zero.uuid]: 0,
  };

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
  const store = { getState: () => state };
  const previewService = createPartyWagePreviewService({
    adapter: hyp3eAdapter,
    game: { actors },
    mutations,
    store,
  });
  const reports = [];
  let auditFailure = false;
  const service = createPartyWageSettlementService({
    adapter: hyp3eAdapter,
    chatCards: {
      async createWageSettlementReport(report) {
        if (auditFailure) throw new Error('chat failed');
        reports.push(structuredClone(report));
      },
    },
    game: { actors },
    logger: { warn: () => {} },
    mutations,
    previewService,
    requestIdProvider: () => 'wage-settlement-request',
    store,
  });
  const preview = previewService.getPreview({}, state);

  return {
    character,
    definitions,
    get auditFailure() { return auditFailure; },
    set auditFailure(value) { auditFailure = value; },
    npc,
    preview,
    previewService,
    reports,
    service,
    state,
    treasury,
    zero,
  };
}

test('wage settlement deducts only treasury GP and audits positive selected payments', async () => {
  const harness = createHarness();
  const followerWagesBefore = structuredClone(harness.state.followerWages);

  const response = await harness.service.settle(harness.preview, 12);

  assert.equal(response.ok, true);
  assert.deepEqual(hyp3eAdapter.getMoney(harness.treasury), {
    cp: 1, sp: 2, ep: 3, gp: 2, pp: 4,
  });
  assert.equal(harness.treasury.updateCallCount, 1);
  assert.equal(harness.character.updateCallCount, 0);
  assert.equal(harness.npc.updateCallCount, 0);
  assert.equal(harness.zero.updateCallCount, 0);
  assert.deepEqual(harness.state.followerWages, followerWagesBefore);
  assert.equal(harness.reports.length, 1);
  assert.deepEqual(harness.reports[0].payments, [
    { actorUuid: 'Actor.character', name: 'character', paymentGp: 3 },
    { actorUuid: 'Actor.npc', name: 'npc', paymentGp: 5 },
  ]);
  assert.equal(harness.reports[0].totalPaidGp, 8);
  assert.equal(harness.reports[0].remainingGp, 2);
});

test('wage settlement restores treasury after audit failure', async () => {
  const harness = createHarness();
  harness.auditFailure = true;

  const response = await harness.service.settle(harness.preview, 12);

  assert.equal(response.error.code, PARTY_WAGE_SETTLEMENT_ERROR_CODES.auditFailed);
  assert.deepEqual(hyp3eAdapter.getMoney(harness.treasury), {
    cp: 1, sp: 2, ep: 3, gp: 10, pp: 4,
  });
  assert.equal(harness.treasury.updateCallCount, 2);
  assert.equal(harness.reports.length, 0);
});

test('wage settlement reports write and rollback failures distinctly', async () => {
  const writeHarness = createHarness();
  writeHarness.treasury.failOnUpdateCalls = new Set([1]);
  const writeFailure = await writeHarness.service.settle(writeHarness.preview, 12);
  assert.equal(writeFailure.error.code, PARTY_WAGE_SETTLEMENT_ERROR_CODES.writeFailed);
  assert.equal(writeHarness.reports.length, 0);

  const rollbackHarness = createHarness();
  rollbackHarness.auditFailure = true;
  rollbackHarness.treasury.failOnUpdateCalls = new Set([2]);
  const rollbackFailure = await rollbackHarness.service.settle(
    rollbackHarness.preview,
    12,
  );
  assert.equal(
    rollbackFailure.error.code,
    PARTY_WAGE_SETTLEMENT_ERROR_CODES.rollbackFailed,
  );
});

test('wage settlement rejects stale, changed, insufficient, and malformed previews without writes', async () => {
  const harness = createHarness();
  harness.state.revision = 13;
  const stale = await harness.service.settle(harness.preview, 12);
  assert.equal(stale.error.code, 'staleRevision');

  harness.state.revision = 12;
  harness.treasury.system.money.gp.value = '9';
  const changed = await harness.service.settle(harness.preview, 12);
  assert.equal(
    changed.error.code,
    PARTY_WAGE_SETTLEMENT_ERROR_CODES.previewChanged,
  );

  const insufficientHarness = createHarness();
  insufficientHarness.treasury.system.money.gp.value = '7';
  const insufficientPreview = insufficientHarness.previewService.getPreview(
    {},
    insufficientHarness.state,
  );
  const insufficient = await insufficientHarness.service.settle(
    insufficientPreview,
    12,
  );
  assert.equal(
    insufficient.error.code,
    PARTY_WAGE_SETTLEMENT_ERROR_CODES.invalidPreview,
  );

  const definition = harness.definitions.get(
    PARTY_WAGE_SETTLEMENT_OPERATIONS.settle,
  );
  assert.throws(
    () => definition.validatePayload({
      expectedFingerprint: '{}',
      selectedActorUuids: [],
      extra: true,
    }),
    /unknown field/i,
  );
  assert.equal(harness.treasury.updateCallCount, 0);
});
