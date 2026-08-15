import assert from 'node:assert/strict';
import test from 'node:test';

import { hyp3eAdapter } from '../../module/adapters/hyp3e-adapter.mjs';
import {
  PARTY_XP_AWARD_ERROR_CODES,
  PARTY_XP_AWARD_OPERATIONS,
  createPartyXpAwardService,
} from '../../module/party/party-xp-awards.mjs';
import { createPartyStateDefault } from '../../module/party/party-state.mjs';
import { createPartyXpPreviewService } from '../../module/party/party-xp-preview.mjs';

function applyFlatUpdate(actor, update) {
  for (const [path, value] of Object.entries(update)) {
    const keys = path.split('.');
    const last = keys.pop();
    let target = actor;
    for (const key of keys) target = target[key] ??= {};
    target[last] = value;
  }
}

function createActor(id, type, { bonus = 0, xp = 0 } = {}) {
  const actor = {
    documentName: 'Actor',
    id,
    isToken: false,
    name: id,
    system: {
      details: { xp: { bonus, value: String(xp) } },
      xp: String(xp),
    },
    type,
    uuid: `Actor.${id}`,
    updateCallCount: 0,
  };
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
  const hero = createActor('hero', 'character', { bonus: 10, xp: 1000 });
  const retainer = createActor('retainer', 'character', { bonus: -5, xp: 500 });
  const npc = createActor('npc', 'npc', { xp: 75 });
  const actors = [hero, retainer, npc];
  actors.get = (id) => actors.find((actor) => actor.id === id);
  const state = createPartyStateDefault();
  state.revision = 7;
  state.memberActorUuids = [hero.uuid];
  state.followerActorUuids = [retainer.uuid, npc.uuid];
  state.shares = { [hero.uuid]: 1, [retainer.uuid]: 0.5, [npc.uuid]: 0.25 };
  const store = { getState: () => state };
  const previewService = createPartyXpPreviewService({
    adapter: hyp3eAdapter,
    game: { actors },
    store,
  });
  const definitions = new Map();
  const requests = [];
  const requester = { id: 'gm', isGM: true, name: 'Game Master' };
  const mutations = {
    registerOperation: (operation, definition) => definitions.set(operation, definition),
    request: async (operation, envelope) => {
      requests.push({ envelope: structuredClone(envelope), operation });
      const definition = definitions.get(operation);
      try {
        const payload = definition.validatePayload(envelope.payload);
        const value = await definition.execute({
          expectedRevision: envelope.expectedRevision,
          payload,
          requester,
          requestId: envelope.requestId,
        });
        return { ok: true, value };
      }
      catch (error) {
        return { error: { code: error.code, message: error.message }, ok: false };
      }
    },
  };
  const reports = [];
  let auditFailure = false;
  const service = createPartyXpAwardService({
    adapter: hyp3eAdapter,
    chatCards: {
      async createXpDistributionReport(report) {
        if (auditFailure) throw new Error('chat failed');
        reports.push(structuredClone(report));
      },
    },
    game: { actors },
    logger: { warn: () => {} },
    mutations,
    previewService,
    requestIdProvider: () => 'xp-request-id',
    store,
  });
  const preview = previewService.getPreview({ totalXp: 700 });
  return {
    definitions,
    get auditFailure() { return auditFailure; },
    set auditFailure(value) { auditFailure = value; },
    hero,
    npc,
    preview,
    reports,
    requests,
    retainer,
    service,
    state,
  };
}

test('XP award transaction updates each character once, never NPC XP, and audits final values', async () => {
  const harness = createHarness();

  const response = await harness.service.distribute(harness.preview, 7);

  assert.equal(response.ok, true);
  assert.equal(harness.hero.system.details.xp.value, '1440');
  assert.equal(harness.retainer.system.details.xp.value, '690');
  assert.equal(harness.npc.system.xp, '75');
  assert.equal(harness.hero.updateCallCount, 1);
  assert.equal(harness.retainer.updateCallCount, 1);
  assert.equal(harness.npc.updateCallCount, 0);
  assert.equal(harness.reports.length, 1);
  assert.deepEqual(harness.reports[0].recipients.map((entry) => ({
    actorUuid: entry.actorUuid,
    afterXp: entry.afterXp,
    baseXp: entry.baseXp,
    finalAwardXp: entry.finalAwardXp,
    writeback: entry.writeback,
  })), [
    { actorUuid: 'Actor.hero', afterXp: 1440, baseXp: 400, finalAwardXp: 440, writeback: true },
    { actorUuid: 'Actor.retainer', afterXp: 690, baseXp: 200, finalAwardXp: 190, writeback: true },
    { actorUuid: 'Actor.npc', afterXp: null, baseXp: 100, finalAwardXp: 100, writeback: false },
  ]);
  assert.equal(response.value.consumedNpcXp, 100);
  assert.equal(response.value.baseRemainderXp, 0);
});

test('XP award transaction restores earlier character writes after a later failure', async () => {
  const harness = createHarness();
  harness.retainer.failOnUpdateCalls = new Set([1]);

  const response = await harness.service.distribute(harness.preview, 7);

  assert.equal(response.ok, false);
  assert.equal(response.error.code, PARTY_XP_AWARD_ERROR_CODES.writeFailed);
  assert.equal(harness.hero.system.details.xp.value, '1000');
  assert.equal(harness.retainer.system.details.xp.value, '500');
  assert.equal(harness.npc.system.xp, '75');
  assert.equal(harness.hero.updateCallCount, 2);
  assert.equal(harness.reports.length, 0);
});

test('XP award transaction reports a failed compensation explicitly', async () => {
  const harness = createHarness();
  harness.retainer.failOnUpdateCalls = new Set([1]);
  harness.hero.failOnUpdateCalls = new Set([2]);

  const response = await harness.service.distribute(harness.preview, 7);

  assert.equal(response.ok, false);
  assert.equal(response.error.code, PARTY_XP_AWARD_ERROR_CODES.rollbackFailed);
  assert.equal(harness.hero.system.details.xp.value, '1440');
  assert.equal(harness.reports.length, 0);
});

test('XP audit failure restores character totals and never claims success', async () => {
  const harness = createHarness();
  harness.auditFailure = true;

  const response = await harness.service.distribute(harness.preview, 7);

  assert.equal(response.ok, false);
  assert.equal(response.error.code, PARTY_XP_AWARD_ERROR_CODES.auditFailed);
  assert.equal(harness.hero.system.details.xp.value, '1000');
  assert.equal(harness.retainer.system.details.xp.value, '500');
  assert.equal(harness.npc.system.xp, '75');
});

test('XP award preflight rejects stale, changed, player, and malformed previews without writes', async () => {
  const harness = createHarness();
  harness.state.revision = 8;
  const stale = await harness.service.distribute(harness.preview, 7);
  assert.equal(stale.error.code, 'staleRevision');

  harness.state.revision = 7;
  harness.hero.system.details.xp.bonus = 20;
  const changed = await harness.service.distribute(harness.preview, 7);
  assert.equal(changed.error.code, PARTY_XP_AWARD_ERROR_CODES.previewChanged);

  const definition = harness.definitions.get(PARTY_XP_AWARD_OPERATIONS.distribute);
  const requestPayload = harness.requests.at(-1).envelope.payload;
  await assert.rejects(
    definition.execute({
      expectedRevision: 7,
      payload: definition.validatePayload(requestPayload),
      requester: { id: 'player', isGM: false },
      requestId: 'direct-player',
    }),
    (error) => error.code === PARTY_XP_AWARD_ERROR_CODES.gmRequired,
  );
  assert.throws(
    () => definition.validatePayload({ ...requestPayload, extra: true }),
    /unknown field/i,
  );
  assert.equal(harness.hero.updateCallCount, 0);
  assert.equal(harness.retainer.updateCallCount, 0);
  assert.equal(harness.npc.updateCallCount, 0);
  assert.equal(harness.reports.length, 0);
});
