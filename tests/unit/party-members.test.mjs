import assert from 'node:assert/strict';
import test from 'node:test';

import { hyp3eAdapter } from '../../module/adapters/hyp3e-adapter.mjs';
import {
  PARTY_MEMBER_ERROR_CODES,
  PARTY_MEMBER_OPERATIONS,
  createPartyMemberService,
} from '../../module/party/party-members.mjs';
import { createPartyStateDefault } from '../../module/party/party-state.mjs';

function createActor(id, {
  name = id,
  owner = true,
  type = 'character',
  uuid = `Actor.${id}`,
} = {}) {
  return {
    documentName: 'Actor',
    id,
    img: `icons/${id}.webp`,
    isToken: uuid.startsWith('Scene.'),
    name,
    system: {
      ac: { value: 5 },
      details: {
        class: 'Fighter',
        level: { value: 3 },
        move: 40,
        race: 'Human',
      },
      dr: { value: 1 },
      hp: { value: 7, max: 9 },
    },
    testUserPermission: () => owner,
    type,
    uuid,
  };
}

function createHarness() {
  const hero = createActor('hero', { name: 'A Hero' });
  const npc = createActor('npc', { type: 'npc' });
  const unowned = createActor('unowned', { owner: false });
  const actors = new Map([
    [hero.id, hero],
    [npc.id, npc],
    [unowned.id, unowned],
  ]);
  const definitions = new Map();
  const service = createPartyMemberService({
    adapter: hyp3eAdapter,
    game: { actors },
    store: {
      getState: createPartyStateDefault,
      registerMutation: (operation, definition) => {
        definitions.set(operation, definition);
      },
    },
  });
  return { actors, definitions, hero, npc, service, unowned };
}

test('member rows preserve state order and retain missing references', () => {
  const harness = createHarness();
  const state = createPartyStateDefault();
  state.memberActorUuids = ['Actor.hero', 'Actor.deleted', 'Actor.npc'];
  state.shares = { 'Actor.hero': 1.25, 'Actor.deleted': 0.5 };

  const rows = harness.service.getMemberRows(state);

  assert.deepEqual(rows.map(({ actorUuid }) => actorUuid), [
    'Actor.hero',
    'Actor.deleted',
    'Actor.npc',
  ]);
  assert.deepEqual(rows[0], {
    actorUuid: 'Actor.hero',
    className: 'Fighter',
    img: 'icons/hero.webp',
    invalidType: false,
    level: 3,
    missing: false,
    name: 'A Hero',
    race: 'Human',
    share: 1.25,
    summary: hyp3eAdapter.getActorSummary(harness.hero),
  });
  assert.equal(rows[1].missing, true);
  assert.equal(rows[1].name, 'Actor.deleted');
  assert.equal(rows[2].invalidType, true);
});

test('add-member mutation accepts only owned durable world characters', async () => {
  const harness = createHarness();
  const definition = harness.definitions.get(PARTY_MEMBER_OPERATIONS.add);
  const requester = { id: 'player', isGM: false };
  const state = createPartyStateDefault();

  const payload = definition.validatePayload({ actorUuid: ' Actor.hero ' });
  await definition.mutate({ payload, requester, state });
  assert.deepEqual(state.memberActorUuids, ['Actor.hero']);
  assert.equal(state.shares['Actor.hero'], 1);

  for (const [actorUuid, code] of [
    ['Actor.npc', PARTY_MEMBER_ERROR_CODES.invalidActor],
    ['Actor.unowned', PARTY_MEMBER_ERROR_CODES.actorPermissionDenied],
    ['Scene.scene.Token.synthetic', PARTY_MEMBER_ERROR_CODES.invalidActor],
    ['Actor.missing', PARTY_MEMBER_ERROR_CODES.invalidActor],
  ]) {
    await assert.rejects(
      definition.mutate({
        payload: { actorUuid },
        requester,
        state: createPartyStateDefault(),
      }),
      (error) => error.code === code,
    );
  }
  await assert.rejects(
    definition.mutate({ payload, requester, state }),
    (error) => error.code === PARTY_MEMBER_ERROR_CODES.alreadyTracked,
  );
  assert.throws(
    () => definition.validatePayload({ actorUuid: 'Actor.hero', extra: true }),
    /unknown field/i,
  );
});

test('GM add bypasses ownership and removal clears member metadata only', async () => {
  const harness = createHarness();
  const add = harness.definitions.get(PARTY_MEMBER_OPERATIONS.add);
  const remove = harness.definitions.get(PARTY_MEMBER_OPERATIONS.remove);
  const state = createPartyStateDefault();
  state.followerActorUuids = ['Actor.npc'];
  state.followerWages = { 'Actor.npc': 2 };

  await add.mutate({
    payload: { actorUuid: 'Actor.unowned' },
    requester: { id: 'gm', isGM: true },
    state,
  });
  state.shares['Actor.unowned'] = 1.5;
  state.marchingOrder.front.actorUuids = ['Actor.unowned', 'Actor.npc'];
  await remove.mutate({
    payload: remove.validatePayload({ actorUuid: 'Actor.unowned' }),
    state,
  });

  assert.deepEqual(state.memberActorUuids, []);
  assert.equal(Object.hasOwn(state.shares, 'Actor.unowned'), false);
  assert.deepEqual(state.marchingOrder.front.actorUuids, ['Actor.npc']);
  assert.deepEqual(state.followerActorUuids, ['Actor.npc']);
  assert.deepEqual(state.followerWages, { 'Actor.npc': 2 });
  await assert.rejects(
    remove.mutate({
      payload: { actorUuid: 'Actor.unowned' },
      state,
    }),
    (error) => error.code === PARTY_MEMBER_ERROR_CODES.notTracked,
  );
});
