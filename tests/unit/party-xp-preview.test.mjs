import assert from 'node:assert/strict';
import test from 'node:test';

import { hyp3eAdapter } from '../../module/adapters/hyp3e-adapter.mjs';
import { createPartyStateDefault } from '../../module/party/party-state.mjs';
import { createPartyXpPreviewService } from '../../module/party/party-xp-preview.mjs';

function createActor(id, type, { bonus = 0, name = id } = {}) {
  return {
    documentName: 'Actor',
    id,
    img: `icons/${id}.webp`,
    isToken: false,
    name,
    system: {
      details: { xp: { bonus, value: '1000' } },
      xp: '75',
    },
    type,
    uuid: `Actor.${id}`,
  };
}

function createHarness() {
  const hero = createActor('hero', 'character', { bonus: 10, name: 'Hero' });
  const retainer = createActor('retainer', 'character', {
    bonus: -5,
    name: 'Retainer',
  });
  const npc = createActor('npc', 'npc', { bonus: 50, name: 'NPC Hireling' });
  const state = createPartyStateDefault();
  state.memberActorUuids = [hero.uuid];
  state.followerActorUuids = [retainer.uuid, npc.uuid, 'Actor.missing'];
  state.shares = {
    [hero.uuid]: 1,
    [retainer.uuid]: 0.5,
    [npc.uuid]: 0.25,
    'Actor.missing': 1,
  };
  const actors = new Map([hero, retainer, npc].map((actor) => [actor.id, actor]));
  const service = createPartyXpPreviewService({
    adapter: hyp3eAdapter,
    game: { actors },
    store: { getState: () => state },
  });
  return { service, state };
}

test('XP preview adapts authoritative member and follower rows without changing math', () => {
  const { service } = createHarness();
  const preview = service.getPreview({ totalXp: 703 });

  assert.equal(preview.totalShares, 1.75);
  assert.equal(preview.baseRemainderXp, 2);
  assert.deepEqual(preview.distributions.map((entry) => ({
    actorType: entry.actorType,
    actorUuid: entry.actorUuid,
    adjustmentXp: entry.adjustmentXp,
    baseXp: entry.baseXp,
    finalAwardXp: entry.finalAwardXp,
    missing: entry.missing,
    name: entry.name,
    persistentAwardXp: entry.persistentAwardXp,
    share: entry.share,
    writeback: entry.writeback,
  })), [
    {
      actorType: 'character',
      actorUuid: 'Actor.hero',
      adjustmentXp: 40,
      baseXp: 401,
      finalAwardXp: 441,
      missing: false,
      name: 'Hero',
      persistentAwardXp: 441,
      share: 1,
      writeback: true,
    },
    {
      actorType: 'character',
      actorUuid: 'Actor.retainer',
      adjustmentXp: -10,
      baseXp: 200,
      finalAwardXp: 190,
      missing: false,
      name: 'Retainer',
      persistentAwardXp: 190,
      share: 0.5,
      writeback: true,
    },
    {
      actorType: 'npc',
      actorUuid: 'Actor.npc',
      adjustmentXp: 0,
      baseXp: 100,
      finalAwardXp: 100,
      missing: false,
      name: 'NPC Hireling',
      persistentAwardXp: 0,
      share: 0.25,
      writeback: false,
    },
    {
      actorType: 'missing',
      actorUuid: 'Actor.missing',
      adjustmentXp: 0,
      baseXp: 0,
      finalAwardXp: 0,
      missing: true,
      name: 'Actor.missing',
      persistentAwardXp: 0,
      share: 0,
      writeback: false,
    },
  ]);
});

test('XP preview selection output is the exact calculator result used for display', () => {
  const { service } = createHarness();
  const preview = service.getPreview({
    selectedActorUuids: ['Actor.retainer', 'Actor.npc'],
    totalXp: 300,
  });

  assert.deepEqual(preview.distributions.map((entry) => ({
    actorUuid: entry.actorUuid,
    adjustmentXp: entry.adjustmentXp,
    baseXp: entry.baseXp,
    bonusPercent: entry.bonusPercent,
    finalAwardXp: entry.finalAwardXp,
    included: entry.included,
    persistentAwardXp: entry.persistentAwardXp,
    selected: entry.selected,
    share: entry.share,
    writeback: entry.writeback,
  })), [
    {
      actorUuid: 'Actor.hero', adjustmentXp: 0, baseXp: 0,
      bonusPercent: 10, finalAwardXp: 0, included: false,
      persistentAwardXp: 0, selected: false, share: 1, writeback: true,
    },
    {
      actorUuid: 'Actor.retainer', adjustmentXp: -10, baseXp: 200,
      bonusPercent: -5, finalAwardXp: 190, included: true,
      persistentAwardXp: 190, selected: true, share: 0.5, writeback: true,
    },
    {
      actorUuid: 'Actor.npc', adjustmentXp: 0, baseXp: 100,
      bonusPercent: 0, finalAwardXp: 100, included: true,
      persistentAwardXp: 0, selected: true, share: 0.25, writeback: false,
    },
    {
      actorUuid: 'Actor.missing', adjustmentXp: 0, baseXp: 0,
      bonusPercent: 0, finalAwardXp: 0, included: false,
      persistentAwardXp: 0, selected: false, share: 0, writeback: false,
    },
  ]);
});

test('XP preview is read-only and returns independent result objects', () => {
  const { service, state } = createHarness();
  const originalState = structuredClone(state);

  const first = service.getPreview({ totalXp: 100 });
  first.distributions[0].name = 'Changed locally';
  const second = service.getPreview({ totalXp: 100 });

  assert.equal(second.distributions[0].name, 'Hero');
  assert.deepEqual(state, originalState);
});
