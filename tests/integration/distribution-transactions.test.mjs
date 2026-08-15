import assert from 'node:assert/strict';
import test from 'node:test';

import { hyp3eAdapter } from '../../module/adapters/hyp3e-adapter.mjs';
import { MODULE_ID, SETTING_KEYS } from '../../module/core/constants.mjs';
import { createPartyCoinAwardService } from '../../module/party/party-coin-awards.mjs';
import { createPartyCoinPreviewService } from '../../module/party/party-coin-preview.mjs';
import { createPartyMutationProtocol } from '../../module/party/party-mutation-protocol.mjs';
import { createPartyStateDefault } from '../../module/party/party-state.mjs';
import { createPartyWagePreviewService } from '../../module/party/party-wage-preview.mjs';
import { createPartyWageSettlementService } from '../../module/party/party-wage-settlement.mjs';
import { createPartyXpAwardService } from '../../module/party/party-xp-awards.mjs';
import { createPartyXpPreviewService } from '../../module/party/party-xp-preview.mjs';

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

function createActor(id, type, { coins = {}, xp = 0 } = {}) {
  const actor = {
    documentName: 'Actor',
    flags: {},
    id,
    isToken: false,
    name: id,
    system: {
      details: {
        experience: { bonus: 0, value: String(xp) },
      },
      money: Object.fromEntries(COIN_KEYS.map((key) => [
        key,
        { value: String(coins[key] ?? 0) },
      ])),
      xp: 50,
    },
    type,
    updateCallCount: 0,
    uuid: `Actor.${id}`,
  };
  actor.getFlag = (namespace, key) => actor.flags?.[namespace]?.[key];
  actor.update = async (update) => {
    actor.updateCallCount += 1;
    applyFlatUpdate(actor, update);
  };
  return actor;
}

function createHarness() {
  const hero = createActor('hero', 'character', { xp: 10 });
  const npc = createActor('npc', 'npc');
  const treasury = createActor('treasury', 'treasure', {
    coins: { cp: 4, sp: 4, ep: 4, gp: 10, pp: 4 },
  });
  treasury.flags = { [MODULE_ID]: { partyTreasury: true } };
  const actors = [hero, npc, treasury];
  actors.get = (id) => actors.find((actor) => actor.id === id);

  const gm = { id: 'gm', isGM: true, name: 'GM', role: 4 };
  const trusted = {
    id: 'trusted', isGM: false, name: 'Trusted Player', role: 2,
  };
  const users = new Map([[gm.id, gm], [trusted.id, trusted]]);
  users.activeGM = gm;
  const game = {
    actors,
    settings: {
      get: (namespace, key) => {
        assert.equal(namespace, MODULE_ID);
        if (key === SETTING_KEYS.partySheetMinimumEditRole) return 2;
        if (key === SETTING_KEYS.partySheetExplicitEditorUserIds) return [];
        throw new Error(`Unexpected setting ${key}`);
      },
    },
    users,
  };
  let requesterUserId = trusted.id;
  const handlers = new Map();
  const transport = {
    executeAsActiveGM: (operation, envelope) => handlers.get(operation).call(
      { socketdata: { userId: requesterUserId } },
      envelope,
    ),
    registerOperation: (operation, handler) => handlers.set(operation, handler),
  };
  const mutations = createPartyMutationProtocol({
    game,
    logger: { warn: () => {} },
    transport,
  });
  const state = createPartyStateDefault();
  state.revision = 3;
  state.treasuryActorUuid = treasury.uuid;
  state.memberActorUuids = [hero.uuid];
  state.followerActorUuids = [npc.uuid];
  state.shares = { [hero.uuid]: 1, [npc.uuid]: 1 };
  state.followerWages = { [npc.uuid]: 2 };
  const store = { getState: () => state };
  const auditCounts = { coin: 0, wage: 0, xp: 0 };
  const chatCards = {
    createCoinDistributionReport: async () => { auditCounts.coin += 1; },
    createWageSettlementReport: async () => { auditCounts.wage += 1; },
    createXpDistributionReport: async () => { auditCounts.xp += 1; },
  };
  const coinPreview = createPartyCoinPreviewService({
    adapter: hyp3eAdapter, game, mutations, store,
  });
  const coins = createPartyCoinAwardService({
    adapter: hyp3eAdapter, chatCards, game, mutations,
    previewService: coinPreview, store,
  });
  const wagePreview = createPartyWagePreviewService({
    adapter: hyp3eAdapter, game, mutations, store,
  });
  const wages = createPartyWageSettlementService({
    adapter: hyp3eAdapter, chatCards, game, mutations,
    previewService: wagePreview, store,
  });
  const xpPreview = createPartyXpPreviewService({
    adapter: hyp3eAdapter, game, store,
  });
  const xp = createPartyXpAwardService({
    adapter: hyp3eAdapter, chatCards, game, mutations,
    previewService: xpPreview, store,
  });

  return {
    auditCounts,
    coinPreview,
    coins,
    hero,
    npc,
    setRequester: (userId) => { requesterUserId = userId; },
    state,
    treasury,
    wagePreview,
    wages,
    xp,
    xpPreview,
  };
}

async function assertDuplicateIsIdempotent({ execute, getCounts }) {
  const first = execute();
  const duplicateInFlight = execute();
  const [firstResult, inFlightResult] = await Promise.all([
    first,
    duplicateInFlight,
  ]);
  const countsAfterFirst = getCounts();
  const completedResult = await execute();

  assert.equal(firstResult.ok, true);
  assert.deepEqual(inFlightResult, firstResult);
  assert.deepEqual(completedResult, firstResult);
  assert.deepEqual(getCounts(), countsAfterFirst);
}

test('XP distribution duplicate request IDs write and audit exactly once', async () => {
  const harness = createHarness();
  harness.setRequester('gm');
  const preview = harness.xpPreview.getPreview({ totalXp: 100 });

  await assertDuplicateIsIdempotent({
    execute: () => harness.xp.distribute(preview, 3, 'duplicate-xp'),
    getCounts: () => ({
      audit: harness.auditCounts.xp,
      heroWrites: harness.hero.updateCallCount,
      npcWrites: harness.npc.updateCallCount,
    }),
  });
  assert.deepEqual({
    audit: harness.auditCounts.xp,
    heroWrites: harness.hero.updateCallCount,
    npcWrites: harness.npc.updateCallCount,
  }, { audit: 1, heroWrites: 1, npcWrites: 0 });
});

test('coin distribution duplicate request IDs write and audit exactly once', async () => {
  const harness = createHarness();
  const preview = harness.coinPreview.getPreview({}, harness.state);

  await assertDuplicateIsIdempotent({
    execute: () => harness.coins.distribute(preview, 3, 'duplicate-coin'),
    getCounts: () => ({
      audit: harness.auditCounts.coin,
      heroWrites: harness.hero.updateCallCount,
      npcWrites: harness.npc.updateCallCount,
      treasuryWrites: harness.treasury.updateCallCount,
    }),
  });
  assert.deepEqual({
    audit: harness.auditCounts.coin,
    heroWrites: harness.hero.updateCallCount,
    npcWrites: harness.npc.updateCallCount,
    treasuryWrites: harness.treasury.updateCallCount,
  }, { audit: 1, heroWrites: 1, npcWrites: 0, treasuryWrites: 1 });
});

test('wage settlement duplicate request IDs write and audit exactly once', async () => {
  const harness = createHarness();
  const preview = harness.wagePreview.getPreview({}, harness.state);

  await assertDuplicateIsIdempotent({
    execute: () => harness.wages.settle(preview, 3, 'duplicate-wage'),
    getCounts: () => ({
      audit: harness.auditCounts.wage,
      npcWrites: harness.npc.updateCallCount,
      treasuryWrites: harness.treasury.updateCallCount,
    }),
  });
  assert.deepEqual({
    audit: harness.auditCounts.wage,
    npcWrites: harness.npc.updateCallCount,
    treasuryWrites: harness.treasury.updateCallCount,
  }, { audit: 1, npcWrites: 0, treasuryWrites: 1 });
});
