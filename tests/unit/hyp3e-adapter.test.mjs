import assert from 'node:assert/strict';
import test from 'node:test';

import {
  characterActor,
  npcActor,
  physicalItems,
  syntheticNpcActor,
  treasureActor,
} from '../fixtures/hyp3e-documents.mjs';
import { hyp3eAdapter } from '../../module/adapters/hyp3e-adapter.mjs';

test('adapter reads character display, saves, XP, and money fields', () => {
  assert.deepEqual(hyp3eAdapter.getActorSummary(characterActor), {
    id: 'character-id',
    uuid: 'Actor.character-id',
    name: 'Astra',
    type: 'character',
    isSynthetic: false,
    hp: { value: 7, max: 12 },
    armor: { ac: 4, dr: 1 },
    movement: 40,
    race: 'Kelt',
    className: 'Fighter',
    level: 3,
  });
  assert.deepEqual(hyp3eAdapter.getSaves(characterActor), {
    death: 11,
    device: 12,
    transformation: 13,
    avoidance: 14,
    sorcery: 15,
  });
  assert.deepEqual(hyp3eAdapter.getCharacterExperience(characterActor), {
    value: 1250,
    bonus: 10,
  });
  assert.deepEqual(hyp3eAdapter.getMoney(characterActor), {
    cp: 5,
    sp: 6,
    ep: 7,
    gp: 8,
    pp: 9,
  });
  assert.equal(hyp3eAdapter.canWriteExperience(characterActor), true);
  assert.equal(hyp3eAdapter.canWriteMoney(characterActor), true);
  assert.deepEqual(hyp3eAdapter.buildCharacterExperienceUpdate(1325), {
    'system.details.xp.value': '1325',
  });
  assert.deepEqual(hyp3eAdapter.buildMoneyUpdate({ gp: 12 }), {
    'system.money.cp.value': '0',
    'system.money.sp.value': '0',
    'system.money.ep.value': '0',
    'system.money.gp.value': '12',
    'system.money.pp.value': '0',
  });
});

test('adapter reads NPC-only fields without treating NPC XP as writable', () => {
  assert.equal(hyp3eAdapter.getNpcSubtype(npcActor), 'monster');
  assert.equal(hyp3eAdapter.getMorale(npcActor), 8);
  assert.equal(hyp3eAdapter.getLoyalty(npcActor), 6);
  assert.equal(hyp3eAdapter.getEncounterExperience(npcActor), 35);
  assert.equal(hyp3eAdapter.getCharacterExperience(npcActor), null);
  assert.equal(hyp3eAdapter.canWriteExperience(npcActor), false);
  assert.equal(hyp3eAdapter.canWriteMoney(npcActor), false);
});

test('adapter preserves synthetic Actor identity and token-specific values', () => {
  const summary = hyp3eAdapter.getActorSummary(syntheticNpcActor);

  assert.equal(summary.uuid, syntheticNpcActor.uuid);
  assert.equal(summary.isSynthetic, true);
  assert.deepEqual(summary.hp, { value: 2, max: 9 });
});

test('adapter validates managed treasure Actors and all five coin fields', () => {
  assert.equal(hyp3eAdapter.isManagedTreasury(treasureActor), true);
  assert.deepEqual(hyp3eAdapter.getMoney(treasureActor), {
    cp: 100,
    sp: 50,
    ep: 20,
    gp: 10,
    pp: 2,
  });
  assert.equal(hyp3eAdapter.canWriteMoney(treasureActor), true);
  assert.equal(
    hyp3eAdapter.isManagedTreasury({ ...treasureActor, type: 'npc' }),
    false,
  );
});

test('adapter classifies physical item types and reads quantity contracts', () => {
  for (const item of physicalItems) {
    assert.equal(hyp3eAdapter.isSupportedPhysicalItem(item), true);
    assert.equal(hyp3eAdapter.getItemCategory(item), item.type);
    assert.deepEqual(hyp3eAdapter.getItemQuantity(item), item.system.quantity);
  }

  assert.deepEqual(hyp3eAdapter.buildItemQuantityUpdate({
    value: 3,
    max: 8,
    bundle: 2,
  }), {
    'system.quantity.value': 3,
    'system.quantity.max': 8,
    'system.quantity.bundle': 2,
  });
  assert.deepEqual(hyp3eAdapter.buildItemTransferCreateUpdate({
    value: 3,
    max: 8,
    bundle: 2,
  }), {
    'system.quantity.value': 3,
    'system.quantity.max': 8,
    'system.quantity.bundle': 2,
    'system.containerId': '',
  });

  assert.equal(
    hyp3eAdapter.isSupportedPhysicalItem({ type: 'container', system: {} }),
    false,
  );
  assert.equal(
    hyp3eAdapter.getItemQuantity({ type: 'spell', system: {} }),
    null,
  );
});

test('adapter merges only intrinsically identical ordinary items', () => {
  const source = {
    effects: [],
    flags: { world: { quality: 'standard' } },
    img: 'icons/svg/item-bag.svg',
    name: 'Iron Spikes',
    system: {
      containerId: 'backpack-id',
      cost: '1 gp',
      description: 'A set of iron spikes.',
      equipped: true,
      inStorage: false,
      location: 'Backpack',
      quantity: { bundle: 6, max: 12, value: 8 },
      weight: 1,
    },
    type: 'item',
  };
  const compatible = structuredClone(source);
  compatible.system.containerId = '';
  compatible.system.equipped = false;
  compatible.system.inStorage = true;
  compatible.system.location = 'Treasury';
  compatible.system.quantity = { bundle: 6, max: 30, value: 20 };

  assert.equal(
    hyp3eAdapter.areItemsStackCompatible(source, compatible),
    true,
  );

  for (const mutate of [
    (item) => { item.name = 'Iron Spike'; },
    (item) => { item.img = 'icons/svg/sword.svg'; },
    (item) => { item.system.cost = '2 gp'; },
    (item) => { item.system.quantity.bundle = 12; },
    (item) => { item.system.upstreamField = true; },
    (item) => { item.flags.world.quality = 'fine'; },
    (item) => { item.effects.push({ name: 'Magic' }); },
  ]) {
    const different = structuredClone(compatible);
    mutate(different);
    assert.equal(
      hyp3eAdapter.areItemsStackCompatible(source, different),
      false,
    );
  }

  for (const type of ['weapon', 'armor', 'shield']) {
    assert.equal(
      hyp3eAdapter.areItemsStackCompatible(
        { ...source, type },
        { ...compatible, type },
      ),
      false,
    );
  }
  assert.equal(
    hyp3eAdapter.areItemsStackCompatible(
      { ...source, system: { ...source.system, isContainer: true } },
      compatible,
    ),
    false,
  );
  assert.equal(hyp3eAdapter.isContainerItem(source), false);
  assert.equal(
    hyp3eAdapter.isContainerItem({
      ...source,
      system: { ...source.system, isContainer: true },
    }),
    true,
  );
  assert.equal(
    hyp3eAdapter.isContainerItem({ ...source, type: 'container' }),
    true,
  );
});

test('adapter normalizes invalid numeric storage safely', () => {
  const malformedCharacter = {
    ...characterActor,
    system: {
      ...characterActor.system,
      details: {
        ...characterActor.system.details,
        xp: { value: '-5', bonus: 'bad' },
      },
      money: {
        ...characterActor.system.money,
        gp: { value: '3.8' },
        pp: { value: 'bad' },
      },
    },
  };

  assert.deepEqual(hyp3eAdapter.getCharacterExperience(malformedCharacter), {
    value: 0,
    bonus: 0,
  });
  assert.equal(hyp3eAdapter.getMoney(malformedCharacter).gp, 3);
  assert.equal(hyp3eAdapter.getMoney(malformedCharacter).pp, 0);
});

test('adapter preserves missing save, morale, and loyalty values as null', () => {
  const missingValuesNpc = {
    ...npcActor,
    system: {
      ...npcActor.system,
      saves: {
        ...npcActor.system.saves,
        death: { curr: null },
        device: { curr: 'not-a-number' },
      },
      morale: null,
      loyalty: '',
    },
  };

  assert.equal(hyp3eAdapter.getSave(missingValuesNpc, 'death'), null);
  assert.equal(hyp3eAdapter.getSave(missingValuesNpc, 'device'), null);
  assert.equal(hyp3eAdapter.getMorale(missingValuesNpc), null);
  assert.equal(hyp3eAdapter.getLoyalty(missingValuesNpc), null);
});
