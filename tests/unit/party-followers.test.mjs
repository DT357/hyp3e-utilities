import assert from 'node:assert/strict';
import test from 'node:test';

import { hyp3eAdapter } from '../../module/adapters/hyp3e-adapter.mjs';
import {
  PARTY_FOLLOWER_ERROR_CODES,
  PARTY_FOLLOWER_OPERATIONS,
  createPartyFollowerService,
} from '../../module/party/party-followers.mjs';
import { createPartyStateDefault } from '../../module/party/party-state.mjs';

function createActor(id, {
  name = id,
  owner = true,
  type = 'npc',
  uuid = `Actor.${id}`,
} = {}) {
  return {
    documentName: 'Actor',
    id,
    img: `icons/${id}.webp`,
    isToken: uuid.startsWith('Scene.'),
    name,
    system: {
      ac: { dr: 1, value: 5 },
      details: {
        class: 'Fighter',
        level: { value: 3 },
        race: 'Human',
      },
      hp: { value: 7, max: 9 },
      movement: { base: { value: 40 } },
      npcType: 'retainer',
    },
    testUserPermission: () => owner,
    type,
    uuid,
  };
}

function createHarness() {
  const character = createActor('character', {
    name: 'Character Follower',
    type: 'character',
  });
  const npc = createActor('npc', { name: 'NPC Follower' });
  const unowned = createActor('unowned', { owner: false });
  const treasure = createActor('treasure', { type: 'treasure' });
  const actors = new Map([character, npc, unowned, treasure]
    .map((actor) => [actor.id, actor]));
  const definitions = new Map();
  const service = createPartyFollowerService({
    adapter: hyp3eAdapter,
    game: { actors },
    store: {
      getState: createPartyStateDefault,
      registerMutation: (operation, definition) => {
        definitions.set(operation, definition);
      },
    },
  });
  return { character, definitions, npc, service, unowned };
}

test('follower rows preserve order, subtype, employment values, and missing references', () => {
  const harness = createHarness();
  const state = createPartyStateDefault();
  state.followerActorUuids = ['Actor.npc', 'Actor.missing', 'Actor.character'];
  state.followerWages = { 'Actor.npc': 3, 'Actor.missing': 2 };
  state.shares = { 'Actor.npc': 0.5, 'Actor.missing': 1.25 };

  const rows = harness.service.getFollowerRows(state);

  assert.deepEqual(rows.map(({ actorUuid }) => actorUuid), [
    'Actor.npc',
    'Actor.missing',
    'Actor.character',
  ]);
  assert.deepEqual(rows[0], {
    actorUuid: 'Actor.npc',
    canRollMorale: false,
    canRollSave: true,
    img: 'icons/npc.webp',
    invalidType: false,
    missing: false,
    name: 'NPC Follower',
    npcSubtype: 'retainer',
    share: 0.5,
    summary: hyp3eAdapter.getActorSummary(harness.npc),
    wageGp: 3,
  });
  assert.equal(rows[1].missing, true);
  assert.equal(rows[1].name, 'Actor.missing');
  assert.equal(rows[2].npcSubtype, '');
});

test('add-follower mutation accepts owned world characters and NPCs only', async () => {
  const harness = createHarness();
  const add = harness.definitions.get(PARTY_FOLLOWER_OPERATIONS.add);
  const requester = { id: 'player', isGM: false };
  const state = createPartyStateDefault();

  for (const actorUuid of ['Actor.character', 'Actor.npc']) {
    await add.mutate({
      payload: add.validatePayload({ actorUuid }),
      requester,
      state,
    });
  }
  assert.deepEqual(state.followerActorUuids, [
    'Actor.character',
    'Actor.npc',
  ]);
  assert.deepEqual(state.followerWages, {
    'Actor.character': 0,
    'Actor.npc': 0,
  });
  assert.deepEqual(state.shares, {
    'Actor.character': 1,
    'Actor.npc': 1,
  });

  for (const [actorUuid, code] of [
    ['Actor.treasure', PARTY_FOLLOWER_ERROR_CODES.invalidActor],
    ['Actor.unowned', PARTY_FOLLOWER_ERROR_CODES.actorPermissionDenied],
    ['Scene.scene.Token.synthetic', PARTY_FOLLOWER_ERROR_CODES.invalidActor],
    ['Actor.missing', PARTY_FOLLOWER_ERROR_CODES.invalidActor],
  ]) {
    await assert.rejects(
      add.mutate({
        payload: { actorUuid },
        requester,
        state: createPartyStateDefault(),
      }),
      (error) => error.code === code,
    );
  }

  const memberState = createPartyStateDefault();
  memberState.memberActorUuids = ['Actor.character'];
  await assert.rejects(
    add.mutate({
      payload: { actorUuid: 'Actor.character' },
      requester,
      state: memberState,
    }),
    (error) => error.code === PARTY_FOLLOWER_ERROR_CODES.alreadyTracked,
  );
});

test('employment validation is strict and removal clears follower metadata only', async () => {
  const harness = createHarness();
  const setEmployment = harness.definitions.get(
    PARTY_FOLLOWER_OPERATIONS.setEmployment,
  );
  const remove = harness.definitions.get(PARTY_FOLLOWER_OPERATIONS.remove);
  const state = createPartyStateDefault();
  state.memberActorUuids = ['Actor.character'];
  state.followerActorUuids = ['Actor.npc'];
  state.followerWages = { 'Actor.npc': 1 };
  state.shares = { 'Actor.character': 1, 'Actor.npc': 1 };
  state.marchingOrder.rear.actorUuids = ['Actor.npc', 'Actor.character'];

  await setEmployment.mutate({
    payload: setEmployment.validatePayload({
      actorUuid: 'Actor.npc',
      share: '1.25',
      wageGp: '4',
    }),
    state,
  });
  assert.equal(state.followerWages['Actor.npc'], 4);
  assert.equal(state.shares['Actor.npc'], 1.25);

  for (const payload of [
    { actorUuid: 'Actor.npc', share: 1.1, wageGp: 4 },
    { actorUuid: 'Actor.npc', share: -0.25, wageGp: 4 },
    { actorUuid: 'Actor.npc', share: 1, wageGp: 1.5 },
    { actorUuid: 'Actor.npc', share: 1, wageGp: -1 },
    { actorUuid: 'Actor.npc', share: 1, wageGp: 1, extra: true },
  ]) {
    assert.throws(() => setEmployment.validatePayload(payload));
  }

  await remove.mutate({
    payload: remove.validatePayload({ actorUuid: 'Actor.npc' }),
    state,
  });
  assert.deepEqual(state.followerActorUuids, []);
  assert.equal(Object.hasOwn(state.followerWages, 'Actor.npc'), false);
  assert.equal(Object.hasOwn(state.shares, 'Actor.npc'), false);
  assert.deepEqual(state.marchingOrder.rear.actorUuids, ['Actor.character']);
  assert.deepEqual(state.memberActorUuids, ['Actor.character']);
  assert.equal(state.shares['Actor.character'], 1);
});
