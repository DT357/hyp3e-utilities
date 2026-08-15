import assert from 'node:assert/strict';
import test from 'node:test';

import { hyp3eAdapter } from '../../module/adapters/hyp3e-adapter.mjs';
import {
  ITEM_TRANSFER_DRAG_TYPE,
  createItemTransferUiController,
} from '../../module/party/item-transfer-ui.mjs';

function createHarness({
  authorized = true,
  dialogResult = 2,
  owned = true,
  treasuryVisible = true,
} = {}) {
  const calls = [];
  const notifications = [];
  const hooks = {
    handlers: new Map(),
    nextId: 0,
    on(name, callback) {
      this.handlers.set(name, callback);
      return ++this.nextId;
    },
    off(name, id) {
      calls.push(['hookOff', name, id]);
    },
  };
  const user = { id: 'player', isGM: false, role: 1 };
  const character = {
    documentName: 'Actor',
    id: 'character',
    isToken: false,
    name: 'Astra',
    ownership: { default: 0, player: owned ? 3 : 0 },
    testUserPermission: () => owned,
    type: 'character',
    uuid: 'Actor.character',
  };
  const characterItem = {
    id: 'rations',
    name: 'Rations',
    parent: character,
    system: { quantity: { bundle: 0, max: 5, value: 5 } },
    type: 'item',
    uuid: 'Actor.character.Item.rations',
  };
  character.items = [characterItem];
  character.items.get = (id) => character.items.find((item) => item.id === id);
  const treasury = {
    documentName: 'Actor',
    flags: { 'hyp3e-utilities': { partyTreasury: true } },
    getFlag: (namespace, key) => treasury.flags?.[namespace]?.[key],
    id: 'treasury',
    isToken: false,
    name: 'Party Treasury',
    type: 'treasure',
    uuid: 'Actor.treasury',
  };
  const treasuryItem = {
    id: 'rope',
    name: 'Rope',
    parent: treasury,
    system: { quantity: { bundle: 0, max: 3, value: 3 } },
    type: 'item',
    uuid: 'Actor.treasury.Item.rope',
  };
  treasury.items = [treasuryItem];
  treasury.items.get = (id) => treasury.items.find((item) => item.id === id);
  const actors = treasuryVisible ? [character, treasury] : [character];
  actors.get = (id) => actors.find((actor) => actor.id === id);
  const state = {
    followerActorUuids: [],
    memberActorUuids: [character.uuid],
    revision: 4,
    treasuryActorUuid: treasury.uuid,
  };
  const game = {
    actors,
    i18n: {
      format: (key, data) => `${key}:${JSON.stringify(data)}`,
      localize: (key) => key,
    },
    settings: {
      get: (_namespace, key) => key.includes('Minimum')
        ? (authorized ? 1 : 4)
        : [],
    },
    user,
  };
  const dialog = {
    async prompt(config) {
      calls.push(['prompt', config]);
      return dialogResult;
    },
  };
  const transfers = {
    async transferFromTreasury(payload, revision) {
      calls.push(['fromTreasury', payload, revision]);
      return { ok: true, value: {} };
    },
    async transferToTreasury(payload, revision) {
      calls.push(['toTreasury', payload, revision]);
      return { ok: true, value: {} };
    },
  };
  const controller = createItemTransferUiController({
    adapter: hyp3eAdapter,
    dialog,
    game,
    hooks,
    itemTransfers: transfers,
    notifications: {
      info: (message) => notifications.push(['info', message]),
      warn: (message) => notifications.push(['warn', message]),
      error: (message) => notifications.push(['error', message]),
    },
    store: { getState: () => state },
    treasury: {
      getStatus: () => treasuryVisible
        ? { actor: treasury, kind: 'ready' }
        : { actor: null, kind: 'missing' },
    },
  });
  return {
    calls,
    character,
    characterItem,
    controller,
    hooks,
    notifications,
    state,
    treasury,
    treasuryItem,
    user,
  };
}

function createDropEvent(data, target = null) {
  const eventCalls = [];
  return {
    dataTransfer: { getData: () => JSON.stringify(data) },
    eventCalls,
    preventDefault: () => eventCalls.push('preventDefault'),
    stopImmediatePropagation: () => eventCalls.push('stopImmediatePropagation'),
    target,
  };
}

test('valid native Item drop confirms and requests character-to-treasury transfer', async () => {
  const harness = createHarness({ dialogResult: 2 });
  const event = createDropEvent({
    type: 'Item',
    uuid: harness.characterItem.uuid,
  });

  const response = await harness.controller.handlePartyDrop(event);

  assert.equal(response.ok, true);
  assert.deepEqual(event.eventCalls, [
    'preventDefault',
    'stopImmediatePropagation',
  ]);
  assert.equal(harness.calls[0][0], 'prompt');
  assert.deepEqual(harness.calls[1], [
    'toTreasury',
    {
      expectedSourceQuantity: 5,
      quantity: 2,
      sourceActorUuid: harness.character.uuid,
      sourceItemUuid: harness.characterItem.uuid,
    },
    harness.state.revision,
  ]);
});

test('treasury drag confirms and requests treasury-to-character transfer', async () => {
  const harness = createHarness({ dialogResult: 3 });
  const event = createDropEvent({
    itemUuid: harness.treasuryItem.uuid,
    type: ITEM_TRANSFER_DRAG_TYPE,
  });

  const response = await harness.controller.handleActorDrop(
    event,
    harness.character,
  );

  assert.equal(response.ok, true);
  assert.deepEqual(harness.calls[1], [
    'fromTreasury',
    {
      destinationActorUuid: harness.character.uuid,
      expectedSourceQuantity: 3,
      quantity: 3,
      sourceItemUuid: harness.treasuryItem.uuid,
    },
    harness.state.revision,
  ]);
});

test('snapshot reference supports reverse transfer when treasury is locally hidden', async () => {
  const harness = createHarness({ dialogResult: 1, treasuryVisible: false });
  const response = await harness.controller.transferFromTreasury({
    expectedSourceQuantity: 3,
    itemName: harness.treasuryItem.name,
    itemUuid: harness.treasuryItem.uuid,
    sourceName: harness.treasury.name,
  }, harness.character.uuid);

  assert.equal(response.ok, true);
  assert.deepEqual(harness.calls[1], [
    'fromTreasury',
    {
      destinationActorUuid: harness.character.uuid,
      expectedSourceQuantity: 3,
      quantity: 1,
      sourceItemUuid: harness.treasuryItem.uuid,
    },
    harness.state.revision,
  ]);
});

test('cancelled confirmation and invalid drop payload perform no request', async () => {
  const cancelled = createHarness({ dialogResult: null });
  const cancelResponse = await cancelled.controller.handlePartyDrop(
    createDropEvent({ type: 'Item', uuid: cancelled.characterItem.uuid }),
  );
  assert.equal(cancelResponse, null);
  assert.deepEqual(cancelled.calls.map(([name]) => name), ['prompt']);

  const invalid = createHarness();
  const invalidEvent = createDropEvent({ type: 'Actor', uuid: 'Actor.bad' });
  const invalidResponse = await invalid.controller.handlePartyDrop(invalidEvent);
  assert.equal(invalidResponse, null);
  assert.equal(invalid.calls.length, 0);
  assert.deepEqual(invalid.notifications, [[
    'warn',
    'hyp3e-utilities.applications.partySheet.itemTransferInvalid',
  ]]);
});

test('unauthorized or unowned users cannot open a dialog or request transfer', async () => {
  for (const options of [
    { authorized: false, owned: true },
    { authorized: true, owned: false },
  ]) {
    const harness = createHarness(options);
    const response = await harness.controller.transferToTreasury(
      harness.characterItem.uuid,
    );
    assert.equal(response, null);
    assert.equal(harness.calls.length, 0);
    assert.deepEqual(harness.notifications, [[
      'warn',
      'hyp3e-utilities.applications.partySheet.itemTransferUnauthorized',
    ]]);
  }
});

test('destination options include only owned party characters', () => {
  const harness = createHarness();
  assert.deepEqual(harness.controller.getDestinationOptions(), [{
    actorUuid: harness.character.uuid,
    name: harness.character.name,
  }]);
  harness.character.testUserPermission = () => false;
  assert.deepEqual(harness.controller.getDestinationOptions(), []);
  harness.user.isGM = true;
  assert.deepEqual(harness.controller.getDestinationOptions(), [{
    actorUuid: harness.character.uuid,
    name: harness.character.name,
  }]);
});

test('Actor sheet activation adds owned-character controls and custom drop capture', () => {
  const harness = createHarness();
  const listeners = new Map();
  const buttons = [];
  const row = {
    append(button) { buttons.push(button); },
    querySelector: () => null,
    dataset: { itemId: harness.characterItem.id },
  };
  const root = {
    addEventListener(name, handler, capture) {
      listeners.set(name, { capture, handler });
    },
    ownerDocument: {
      createElement: () => ({
        addEventListener(name, handler) { this[name] = handler; },
        dataset: {},
      }),
    },
    querySelectorAll: () => [row],
  };

  assert.equal(harness.controller.activateActorSheet({
    actor: harness.character,
    element: root,
  }), true);
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].dataset.itemUuid, harness.characterItem.uuid);
  assert.equal(listeners.get('drop').capture, true);
  assert.equal(listeners.get('dragover').capture, true);
});

test('controller lifecycle registers and removes one Actor sheet hook', () => {
  const harness = createHarness();
  assert.equal(harness.controller.start(), true);
  assert.equal(harness.controller.start(), false);
  assert.equal(typeof harness.hooks.handlers.get('renderActorSheet'), 'function');
  assert.equal(harness.controller.stop(), true);
  assert.deepEqual(harness.calls.at(-1), ['hookOff', 'renderActorSheet', 1]);
});
