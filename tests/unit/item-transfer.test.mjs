import assert from 'node:assert/strict';
import test from 'node:test';

import { hyp3eAdapter } from '../../module/adapters/hyp3e-adapter.mjs';
import {
  ITEM_TRANSFER_ERROR_CODES,
  ItemTransferPlanError,
  buildItemTransferPlan,
} from '../../module/party/item-transfer.mjs';
import {
  PARTY_ITEM_TRANSFER_ERROR_CODES,
  PARTY_ITEM_TRANSFER_OPERATIONS,
  createPartyItemTransferService,
} from '../../module/party/party-item-transfer.mjs';

function createActor(id, type = 'character') {
  return {
    documentName: 'Actor',
    id,
    isToken: false,
    type,
    uuid: `Actor.${id}`,
  };
}

function createItem({
  actor,
  bundle = 0,
  id = 'source-item',
  max = 5,
  name = 'Test Item',
  quantity = 5,
  system = {},
  type = 'item',
} = {}) {
  return {
    id,
    name,
    parent: actor,
    system: {
      ...system,
      quantity: { bundle, max, value: quantity },
    },
    type,
    uuid: `${actor?.uuid}.Item.${id}`,
  };
}

function planTransfer(overrides = {}) {
  const sourceActor = overrides.sourceActor ?? createActor('source');
  const destinationActor = overrides.destinationActor
    ?? createActor('treasury', 'treasure');
  const sourceItem = overrides.sourceItem
    ?? createItem({ actor: sourceActor });

  return buildItemTransferPlan({
    adapter: hyp3eAdapter,
    destinationActor,
    destinationItems: [],
    expectedSourceQuantity: 5,
    quantity: 5,
    sourceActor,
    sourceItem,
    ...overrides,
  });
}

function assertPlanError(code, callback) {
  assert.throws(callback, (error) => {
    assert.equal(error instanceof ItemTransferPlanError, true);
    assert.equal(error.code, code);
    return true;
  });
}

test('full transfers preserve quantity metadata and never merge equipment', () => {
  const sourceActor = createActor('source');
  const destinationActor = createActor('treasury', 'treasure');
  const sourceItem = createItem({
    actor: sourceActor,
    bundle: 2,
    max: 8,
    quantity: 5,
    type: 'weapon',
  });
  const destinationItem = createItem({
    actor: destinationActor,
    id: 'matching-weapon',
    quantity: 1,
    type: 'weapon',
  });

  const plan = planTransfer({
    canMerge: () => true,
    destinationActor,
    destinationItems: [destinationItem],
    expectedSourceQuantity: 5,
    sourceActor,
    sourceItem,
  });

  assert.equal(plan.category, 'weapon');
  assert.equal(plan.quantity, 5);
  assert.deepEqual(plan.source, {
    action: 'delete',
    actorUuid: sourceActor.uuid,
    itemId: sourceItem.id,
    itemUuid: sourceItem.uuid,
    quantityBefore: { bundle: 2, max: 8, value: 5 },
    quantityAfter: null,
  });
  assert.deepEqual(plan.destination, {
    action: 'create',
    actorUuid: destinationActor.uuid,
    itemId: null,
    itemUuid: null,
    quantityBefore: null,
    quantityAfter: { bundle: 2, max: 8, value: 5 },
  });
});

test('partial transfers partition maximum and preserve bundle metadata', () => {
  const sourceActor = createActor('source');
  const sourceItem = createItem({
    actor: sourceActor,
    bundle: 4,
    max: 12,
    quantity: 10,
  });

  const plan = planTransfer({
    expectedSourceQuantity: 10,
    quantity: 3,
    sourceActor,
    sourceItem,
  });

  assert.deepEqual(plan.source.quantityAfter, {
    bundle: 4,
    max: 9,
    value: 7,
  });
  assert.deepEqual(plan.destination.quantityAfter, {
    bundle: 4,
    max: 3,
    value: 3,
  });
});

test('ordinary items merge only when an explicit compatibility check approves', () => {
  const sourceActor = createActor('source');
  const destinationActor = createActor('treasury', 'treasure');
  const sourceItem = createItem({ actor: sourceActor, quantity: 5 });
  const destinationItem = createItem({
    actor: destinationActor,
    id: 'destination-item',
    max: 4,
    name: sourceItem.name,
    quantity: 2,
  });

  const createPlan = planTransfer({
    destinationActor,
    destinationItems: [destinationItem],
    quantity: 2,
    sourceActor,
    sourceItem,
  });
  assert.equal(createPlan.destination.action, 'create');

  const mergePlan = planTransfer({
    canMerge: (source, destination) => (
      source.type === destination.type
      && source.system.quantity.bundle === destination.system.quantity.bundle
    ),
    destinationActor,
    destinationItems: [destinationItem],
    quantity: 2,
    sourceActor,
    sourceItem,
  });
  assert.deepEqual(mergePlan.destination, {
    action: 'update',
    actorUuid: destinationActor.uuid,
    itemId: destinationItem.id,
    itemUuid: destinationItem.uuid,
    quantityBefore: { bundle: 0, max: 4, value: 2 },
    quantityAfter: { bundle: 0, max: 6, value: 4 },
  });
});

test('planner rejects same-Actor and synthetic-Actor transfers', () => {
  const actor = createActor('same');
  const sourceItem = createItem({ actor });

  assertPlanError(ITEM_TRANSFER_ERROR_CODES.sameActor, () => planTransfer({
    destinationActor: actor,
    sourceActor: actor,
    sourceItem,
  }));

  const syntheticActor = {
    ...createActor('synthetic'),
    isToken: true,
    uuid: 'Scene.scene.Token.token.Actor.synthetic',
  };
  assertPlanError(ITEM_TRANSFER_ERROR_CODES.invalidActor, () => planTransfer({
    sourceActor: syntheticActor,
    sourceItem: createItem({ actor: syntheticActor }),
  }));
});

test('planner rejects stale, invalid, and excessive quantities', () => {
  assertPlanError(ITEM_TRANSFER_ERROR_CODES.staleQuantity, () => planTransfer({
    expectedSourceQuantity: 4,
  }));

  for (const quantity of [0, -1, 1.5, 6]) {
    assertPlanError(ITEM_TRANSFER_ERROR_CODES.invalidQuantity, () => (
      planTransfer({ quantity })
    ));
  }
});

test('planner rejects unsupported types, containers, and source mismatches', () => {
  const sourceActor = createActor('source');

  assertPlanError(ITEM_TRANSFER_ERROR_CODES.unsupportedItem, () => planTransfer({
    sourceActor,
    sourceItem: createItem({ actor: sourceActor, type: 'spell' }),
  }));

  assertPlanError(ITEM_TRANSFER_ERROR_CODES.unsupportedContainer, () => (
    planTransfer({
      sourceActor,
      sourceItem: createItem({
        actor: sourceActor,
        system: { contents: ['contained-item'], isContainer: true },
      }),
    })
  ));

  assertPlanError(ITEM_TRANSFER_ERROR_CODES.sourceMismatch, () => planTransfer({
    sourceActor,
    sourceItem: createItem({ actor: createActor('other') }),
  }));
});

test('planner rejects ambiguous compatible stacks instead of choosing one', () => {
  const destinationActor = createActor('treasury', 'treasure');
  const destinationItems = [
    createItem({ actor: destinationActor, id: 'one' }),
    createItem({ actor: destinationActor, id: 'two' }),
  ];

  assertPlanError(ITEM_TRANSFER_ERROR_CODES.ambiguousMerge, () => planTransfer({
    canMerge: () => true,
    destinationActor,
    destinationItems,
  }));
});

test('planner output is immutable and input quantities are not modified', () => {
  const sourceActor = createActor('source');
  const sourceItem = createItem({ actor: sourceActor, quantity: 5 });
  const originalQuantity = structuredClone(sourceItem.system.quantity);
  const plan = planTransfer({ quantity: 2, sourceActor, sourceItem });

  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.source.quantityAfter), true);
  assert.deepEqual(sourceItem.system.quantity, originalQuantity);
});

function createOperationHarness({
  requester = { id: 'player', isGM: false },
  sourceOwned = true,
} = {}) {
  const calls = [];
  const failures = {
    destinationCreate: false,
    destinationRollback: false,
    sourceWrite: false,
  };
  const definitions = new Map();
  const sourceActor = createActor('source');
  sourceActor.ownership = { default: 0, player: sourceOwned ? 3 : 0 };
  sourceActor.testUserPermission = (user, permission) => (
    permission === 'OWNER' && sourceActor.ownership[user.id] === 3
  );
  const sourceItem = createItem({
    actor: sourceActor,
    bundle: 2,
    id: 'source-item',
    max: 8,
    quantity: 5,
    system: { containerId: 'backpack' },
  });
  sourceItem.toObject = () => ({
    _id: sourceItem.id,
    name: sourceItem.name,
    system: structuredClone(sourceItem.system),
    type: sourceItem.type,
  });
  sourceItem.update = async (update) => {
    calls.push(['sourceUpdate', structuredClone(update)]);
    if (failures.sourceWrite) throw new Error('source update failed');
    sourceItem.system.quantity = {
      bundle: update['system.quantity.bundle'],
      max: update['system.quantity.max'],
      value: update['system.quantity.value'],
    };
  };
  sourceActor.items = [sourceItem];
  sourceActor.items.get = (id) => sourceActor.items.find(
    (item) => item.id === id,
  );
  sourceActor.deleteEmbeddedDocuments = async (_type, ids) => {
    calls.push(['sourceDelete', [...ids]]);
    if (failures.sourceWrite) throw new Error('source delete failed');
    sourceActor.items.splice(
      sourceActor.items.findIndex((item) => item.id === ids[0]),
      1,
    );
  };

  const destinationActor = createActor('treasury', 'treasure');
  destinationActor.flags = {
    'hyp3e-utilities': { partyTreasury: true },
  };
  destinationActor.getFlag = (namespace, key) => (
    destinationActor.flags?.[namespace]?.[key]
  );
  destinationActor.items = [];
  destinationActor.items.get = (id) => destinationActor.items.find(
    (item) => item.id === id,
  );
  destinationActor.createEmbeddedDocuments = async (_type, itemData) => {
    calls.push(['destinationCreate', structuredClone(itemData)]);
    if (failures.destinationCreate) throw new Error('create failed');
    const created = createItem({
      actor: destinationActor,
      bundle: itemData[0].system.quantity.bundle,
      id: 'created-item',
      max: itemData[0].system.quantity.max,
      name: itemData[0].name,
      quantity: itemData[0].system.quantity.value,
      type: itemData[0].type,
    });
    destinationActor.items.push(created);
    return [created];
  };
  destinationActor.deleteEmbeddedDocuments = async (_type, ids) => {
    calls.push(['destinationDelete', [...ids]]);
    if (failures.destinationRollback) throw new Error('rollback failed');
    destinationActor.items.splice(
      destinationActor.items.findIndex((item) => item.id === ids[0]),
      1,
    );
  };

  const actors = [sourceActor, destinationActor];
  actors.get = (id) => actors.find((actor) => actor.id === id);
  const state = {
    revision: 7,
    treasuryActorUuid: destinationActor.uuid,
  };
  const mutations = {
    registerOperation(operation, definition) {
      definitions.set(operation, definition);
    },
    async request(operation, envelope) {
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
        return {
          error: {
            code: error.code ?? 'invalidRequest',
            message: error.message,
          },
          ok: false,
        };
      }
    },
  };
  const service = createPartyItemTransferService({
    adapter: hyp3eAdapter,
    game: { actors },
    logger: { warn() {} },
    mutations,
    requestIdProvider: () => 'transfer-request',
    store: { getState: () => state },
  });

  return {
    calls,
    destinationActor,
    failures,
    service,
    sourceActor,
    sourceItem,
    state,
  };
}

function transferRequest(harness, overrides = {}) {
  return harness.service.transferToTreasury({
    expectedSourceQuantity: 5,
    quantity: 5,
    sourceActorUuid: harness.sourceActor.uuid,
    sourceItemUuid: harness.sourceItem.uuid,
    ...overrides,
  });
}

test('character-to-treasury full transfer creates destination before deletion', async () => {
  const harness = createOperationHarness();
  const response = await transferRequest(harness);

  assert.equal(response.ok, true);
  assert.deepEqual(harness.calls.map(([name]) => name), [
    'destinationCreate',
    'sourceDelete',
  ]);
  assert.equal(harness.calls[0][1][0]._id, undefined);
  assert.deepEqual(harness.calls[0][1][0].system.quantity, {
    bundle: 2,
    max: 8,
    value: 5,
  });
  assert.equal(harness.calls[0][1][0].system.containerId, '');
  assert.equal(harness.sourceActor.items.length, 0);
  assert.equal(harness.destinationActor.items.length, 1);
  assert.deepEqual(response.value, {
    destinationActorUuid: harness.destinationActor.uuid,
    destinationItemUuid: `${harness.destinationActor.uuid}.Item.created-item`,
    merged: false,
    quantity: 5,
    sourceActorUuid: harness.sourceActor.uuid,
    sourceDeleted: true,
    sourceItemUuid: harness.sourceItem.uuid,
  });
});

test('character-to-treasury partial transfer updates the source stack', async () => {
  const harness = createOperationHarness();
  const response = await transferRequest(harness, { quantity: 2 });

  assert.equal(response.ok, true);
  assert.deepEqual(harness.calls.map(([name]) => name), [
    'destinationCreate',
    'sourceUpdate',
  ]);
  assert.deepEqual(harness.sourceItem.system.quantity, {
    bundle: 2,
    max: 6,
    value: 3,
  });
  assert.deepEqual(harness.destinationActor.items[0].system.quantity, {
    bundle: 2,
    max: 2,
    value: 2,
  });
});

test('transfer operation enforces caller ownership and current party revision', async () => {
  const unowned = createOperationHarness({ sourceOwned: false });
  const denied = await transferRequest(unowned);
  assert.equal(denied.ok, false);
  assert.equal(
    denied.error.code,
    PARTY_ITEM_TRANSFER_ERROR_CODES.sourceOwnershipRequired,
  );
  assert.equal(unowned.calls.length, 0);

  const stale = createOperationHarness();
  const response = await stale.service.transferToTreasury({
    expectedSourceQuantity: 5,
    quantity: 5,
    sourceActorUuid: stale.sourceActor.uuid,
    sourceItemUuid: stale.sourceItem.uuid,
  }, stale.state.revision - 1);
  assert.equal(response.ok, false);
  assert.equal(response.error.code, 'staleRevision');
  assert.equal(stale.calls.length, 0);

  const gm = createOperationHarness({
    requester: { id: 'gm', isGM: true },
    sourceOwned: false,
  });
  assert.equal((await transferRequest(gm)).ok, true);
});

test('serialized transfers reject the second stale source plan', async () => {
  const harness = createOperationHarness();
  const [first, second] = await Promise.all([
    transferRequest(harness, { quantity: 2 }),
    transferRequest(harness, { quantity: 2 }),
  ]);

  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.error.code, ITEM_TRANSFER_ERROR_CODES.staleQuantity);
  assert.equal(harness.destinationActor.items.length, 1);
  assert.equal(harness.sourceItem.system.quantity.value, 3);
});

test('transfer operation rejects a stale source quantity before writes', async () => {
  const harness = createOperationHarness();
  const response = await transferRequest(harness, {
    expectedSourceQuantity: 4,
  });

  assert.equal(response.ok, false);
  assert.equal(response.error.code, 'staleQuantity');
  assert.equal(harness.calls.length, 0);
});

test('destination write failure leaves the source untouched', async () => {
  const harness = createOperationHarness();
  harness.failures.destinationCreate = true;
  const response = await transferRequest(harness);

  assert.equal(response.ok, false);
  assert.equal(response.error.code, PARTY_ITEM_TRANSFER_ERROR_CODES.writeFailed);
  assert.deepEqual(harness.calls.map(([name]) => name), ['destinationCreate']);
  assert.equal(harness.sourceActor.items.length, 1);
});

test('source write failure removes the created destination Item', async () => {
  const harness = createOperationHarness();
  harness.failures.sourceWrite = true;
  const response = await transferRequest(harness);

  assert.equal(response.ok, false);
  assert.equal(response.error.code, PARTY_ITEM_TRANSFER_ERROR_CODES.writeFailed);
  assert.deepEqual(harness.calls.map(([name]) => name), [
    'destinationCreate',
    'sourceDelete',
    'destinationDelete',
  ]);
  assert.equal(harness.sourceActor.items.length, 1);
  assert.equal(harness.destinationActor.items.length, 0);
});

test('failed compensation reports rollback failure without claiming success', async () => {
  const harness = createOperationHarness();
  harness.failures.sourceWrite = true;
  harness.failures.destinationRollback = true;
  const response = await transferRequest(harness);

  assert.equal(response.ok, false);
  assert.equal(
    response.error.code,
    PARTY_ITEM_TRANSFER_ERROR_CODES.rollbackFailed,
  );
  assert.equal(harness.destinationActor.items.length, 1);
});

test('transfer request uses the registered operation and strict payload', async () => {
  const harness = createOperationHarness({ requester: { id: 'gm', isGM: true } });
  const response = await harness.service.transferToTreasury({
    expectedSourceQuantity: 5,
    extra: true,
    quantity: 5,
    sourceActorUuid: harness.sourceActor.uuid,
    sourceItemUuid: harness.sourceItem.uuid,
  });

  assert.equal(response.ok, false);
  assert.equal(response.error.code, 'invalidRequest');
  assert.equal(harness.calls.length, 0);
  assert.equal(
    PARTY_ITEM_TRANSFER_OPERATIONS.toTreasury,
    'party.transferItemToTreasury',
  );
});
