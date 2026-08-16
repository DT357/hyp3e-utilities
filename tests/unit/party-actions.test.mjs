import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PARTY_ACTION_ERROR_CODES,
  createPartyActionService,
} from '../../module/party/party-actions.mjs';

function createHarness({ isGM = true, tokens = [] } = {}) {
  const calls = { chat: [], morale: [], ping: [], save: [] };
  const chatCards = {
    async createNpcRollBatch(batch, options) {
      calls.chat.push({ batch, options });
      return { created: batch.rolls, failures: [], skipped: batch.skipped };
    },
  };
  const npcRolls = {
    planMoraleBatch(candidates) {
      calls.morale.push(candidates);
      return {
        kind: 'morale',
        rolls: candidates.map((actor) => ({ target: { actorUuid: actor.uuid } })),
        skipped: [],
      };
    },
    planSaveBatch(candidates, saveKey, options) {
      calls.save.push({ candidates, options, saveKey });
      return {
        kind: 'save',
        rolls: candidates.map((actor) => ({ target: { actorUuid: actor.uuid } })),
        skipped: [],
      };
    },
  };
  const canvas = {
    ping: async (center) => calls.ping.push(center),
    ready: true,
    tokens: { placeables: tokens },
  };
  const service = createPartyActionService({
    canvasProvider: () => canvas,
    chatCards,
    game: { user: { isGM } },
    npcRolls,
  });
  return { calls, npcRolls, service };
}

test('ping prefers a controlled matching token then stable document ID', async () => {
  const actor = { uuid: 'Actor.hero' };
  const harness = createHarness({
    tokens: [
      { actor, center: { x: 2, y: 2 }, controlled: false, document: { id: 'b' } },
      { actor, center: { x: 3, y: 3 }, controlled: true, document: { id: 'c' } },
      { actor, center: { x: 1, y: 1 }, controlled: false, document: { id: 'a' } },
      {
        actor: { uuid: 'Actor.other' },
        center: { x: 0, y: 0 },
        controlled: true,
        document: { id: 'd' },
      },
    ],
  });

  const token = await harness.service.pingActor('Actor.hero');
  assert.equal(token.document.id, 'c');
  assert.deepEqual(harness.calls.ping, [{ x: 3, y: 3 }]);

  token.controlled = false;
  const stableToken = await harness.service.pingActor('Actor.hero');
  assert.equal(stableToken.document.id, 'a');
  assert.deepEqual(harness.calls.ping.at(-1), { x: 1, y: 1 });
});

test('missing canvas tokens fail without attempting a ping', async () => {
  const harness = createHarness();
  await assert.rejects(
    harness.service.pingActor('Actor.missing'),
    (error) => error.code === PARTY_ACTION_ERROR_CODES.tokenUnavailable,
  );
  assert.deepEqual(harness.calls.ping, []);
});

test('save and morale actions delegate one unchanged batch to shared services', async () => {
  const harness = createHarness();
  const character = { uuid: 'Actor.character' };
  const npc = { uuid: 'Actor.npc' };

  const saveReport = await harness.service.rollSave(character, 'device', {
    modifier: 2,
    rollMode: 'blindroll',
  });
  const moraleReport = await harness.service.rollMorale([npc, character]);

  assert.deepEqual(harness.calls.save, [{
    candidates: [character],
    options: { modifier: 2 },
    saveKey: 'device',
  }]);
  assert.deepEqual(harness.calls.morale, [[npc, character]]);
  assert.equal(harness.calls.chat.length, 2);
  assert.equal(harness.calls.chat[0].batch.kind, 'save');
  assert.deepEqual(harness.calls.chat[0].options, { rollMode: 'blindroll' });
  assert.equal(harness.calls.chat[1].batch.kind, 'morale');
  assert.equal(harness.calls.chat[1].options, undefined);
  assert.equal(saveReport.created.length, 1);
  assert.equal(moraleReport.created.length, 2);
});

test('roll actions fail closed for players and empty planned batches', async () => {
  const player = createHarness({ isGM: false });
  await assert.rejects(
    player.service.rollSave({ uuid: 'Actor.hero' }, 'death'),
    (error) => error.code === PARTY_ACTION_ERROR_CODES.gmRequired,
  );
  assert.equal(player.calls.save.length, 0);
  assert.equal(player.calls.chat.length, 0);

  const gm = createHarness();
  gm.npcRolls.planMoraleBatch = () => ({
    kind: 'morale',
    rolls: [],
    skipped: [{ reason: 'missingMoraleTarget' }],
  });
  await assert.rejects(
    gm.service.rollMorale([{ uuid: 'Actor.npc' }]),
    (error) => error.code === PARTY_ACTION_ERROR_CODES.rollUnavailable,
  );
  assert.equal(gm.calls.chat.length, 0);
});
