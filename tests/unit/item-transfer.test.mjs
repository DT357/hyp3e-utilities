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

test('partial transfers preserve nullable maximum and bundle metadata', () => {
  const sourceActor = createActor('source');
  const sourceItem = createItem({
    actor: sourceActor,
    bundle: null,
    max: null,
    quantity: 5,
  });
  const plan = planTransfer({
    expectedSourceQuantity: 5,
    quantity: 2,
    sourceActor,
    sourceItem,
  });

  assert.deepEqual(plan.source.quantityAfter, {
    bundle: null,
    max: null,
    value: 3,
  });
  assert.deepEqual(plan.destination.quantityAfter, {
    bundle: null,
    max: null,
    value: 2,
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

test('full compatible-item merges conserve value, maximum, and bundle', () => {
  const sourceActor = createActor('source');
  const destinationActor = createActor('treasury', 'treasure');
  const sourceItem = createItem({
    actor: sourceActor,
    bundle: 2,
    max: 8,
    quantity: 5,
  });
  const destinationItem = createItem({
    actor: destinationActor,
    bundle: 2,
    id: 'destination-item',
    max: 4,
    quantity: 2,
  });
  const plan = planTransfer({
    canMerge: hyp3eAdapter.areItemsStackCompatible,
    destinationActor,
    destinationItems: [destinationItem],
    sourceActor,
    sourceItem,
  });

  assert.equal(plan.destination.action, 'update');
  assert.deepEqual(plan.destination.quantityAfter, {
    bundle: 2,
    max: 12,
    value: 7,
  });
  assert.equal(plan.source.action, 'delete');
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
  const auditReports = [];
  const failures = {
    audit: false,
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
    chatCards: {
      async createItemTransferReport(report) {
        auditReports.push(structuredClone(report));
        if (failures.audit) throw new Error('audit failed');
        return { message: { id: `audit-${auditReports.length}` } };
      },
    },
    game: { actors },
    logger: { warn() {} },
    mutations,
    requestIdProvider: () => 'transfer-request',
    store: { getState: () => state },
  });

  return {
    auditReports,
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

function prepareReverseHarness(options) {
  const harness = createOperationHarness(options);
  const destinationActor = harness.sourceActor;
  const sourceActor = harness.destinationActor;
  destinationActor.items.splice(0);
  const sourceItem = createItem({
    actor: sourceActor,
    bundle: 3,
    id: 'treasury-item',
    max: 7,
    quantity: 5,
  });
  sourceItem.toObject = () => ({
    _id: sourceItem.id,
    name: sourceItem.name,
    system: structuredClone(sourceItem.system),
    type: sourceItem.type,
  });
  sourceItem.update = async (update) => {
    harness.calls.push(['treasuryUpdate', structuredClone(update)]);
    if (harness.failures.reverseSourceWrite) {
      throw new Error('treasury update failed');
    }
    sourceItem.system.quantity = {
      bundle: update['system.quantity.bundle'],
      max: update['system.quantity.max'],
      value: update['system.quantity.value'],
    };
  };
  sourceActor.items.push(sourceItem);
  sourceActor.deleteEmbeddedDocuments = async (_type, ids) => {
    harness.calls.push(['treasuryDelete', [...ids]]);
    if (harness.failures.reverseSourceWrite) {
      throw new Error('treasury delete failed');
    }
    sourceActor.items.splice(
      sourceActor.items.findIndex((item) => item.id === ids[0]),
      1,
    );
  };
  destinationActor.createEmbeddedDocuments = async (_type, itemData) => {
    harness.calls.push(['characterCreate', structuredClone(itemData)]);
    if (harness.failures.reverseDestinationCreate) {
      throw new Error('character create failed');
    }
    const created = createItem({
      actor: destinationActor,
      bundle: itemData[0].system.quantity.bundle,
      id: 'character-created-item',
      max: itemData[0].system.quantity.max,
      name: itemData[0].name,
      quantity: itemData[0].system.quantity.value,
      type: itemData[0].type,
    });
    destinationActor.items.push(created);
    return [created];
  };
  destinationActor.deleteEmbeddedDocuments = async (_type, ids) => {
    harness.calls.push(['characterDelete', [...ids]]);
    if (harness.failures.reverseRollback) {
      throw new Error('character rollback failed');
    }
    destinationActor.items.splice(
      destinationActor.items.findIndex((item) => item.id === ids[0]),
      1,
    );
  };
  harness.calls.splice(0);
  return {
    ...harness,
    destinationActor,
    sourceActor,
    sourceItem,
  };
}

function reverseTransferRequest(harness, overrides = {}) {
  return harness.service.transferFromTreasury({
    destinationActorUuid: harness.destinationActor.uuid,
    expectedSourceQuantity: 5,
    quantity: 5,
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
    auditCreated: true,
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

test('non-empty container transfer is rejected before any document write', async () => {
  const harness = createOperationHarness();
  harness.sourceItem.system.isContainer = true;
  harness.sourceItem.contents = [{ id: 'contained-item' }];
  const response = await transferRequest(harness);

  assert.equal(response.ok, false);
  assert.equal(
    response.error.code,
    ITEM_TRANSFER_ERROR_CODES.unsupportedContainer,
  );
  assert.equal(harness.calls.length, 0);
  assert.equal(harness.sourceActor.items.length, 1);
  assert.equal(harness.destinationActor.items.length, 0);
});

test('destination write failure leaves the source untouched', async () => {
  const harness = createOperationHarness();
  harness.failures.destinationCreate = true;
  const response = await transferRequest(harness);

  assert.equal(response.ok, false);
  assert.equal(response.error.code, PARTY_ITEM_TRANSFER_ERROR_CODES.writeFailed);
  assert.deepEqual(harness.calls.map(([name]) => name), ['destinationCreate']);
  assert.equal(harness.sourceActor.items.length, 1);
  assert.equal(harness.auditReports.length, 0);
});

test('destination merge failure leaves both stacks untouched', async () => {
  const harness = createOperationHarness();
  const existing = createItem({
    actor: harness.destinationActor,
    bundle: 2,
    id: 'existing-item',
    max: 4,
    quantity: 2,
  });
  existing.update = async () => {
    harness.calls.push(['destinationUpdate']);
    throw new Error('merge failed');
  };
  harness.destinationActor.items.push(existing);

  const response = await transferRequest(harness, { quantity: 2 });

  assert.equal(response.ok, false);
  assert.equal(response.error.code, PARTY_ITEM_TRANSFER_ERROR_CODES.writeFailed);
  assert.deepEqual(harness.calls.map(([name]) => name), ['destinationUpdate']);
  assert.equal(harness.sourceItem.system.quantity.value, 5);
  assert.equal(existing.system.quantity.value, 2);
  assert.equal(harness.auditReports.length, 0);
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

test('transfer service merges compatible ordinary items and restores them on failure', async () => {
  const harness = createOperationHarness();
  const existing = createItem({
    actor: harness.destinationActor,
    bundle: 2,
    id: 'existing-item',
    max: 4,
    quantity: 2,
    system: { location: 'Treasury' },
  });
  existing.update = async (update) => {
    harness.calls.push(['destinationUpdate', structuredClone(update)]);
    existing.system.quantity = {
      bundle: update['system.quantity.bundle'],
      max: update['system.quantity.max'],
      value: update['system.quantity.value'],
    };
  };
  harness.destinationActor.items.push(existing);

  const response = await transferRequest(harness, { quantity: 2 });
  assert.equal(response.ok, true);
  assert.equal(response.value.merged, true);
  assert.deepEqual(harness.calls.map(([name]) => name), [
    'destinationUpdate',
    'sourceUpdate',
  ]);
  assert.deepEqual(existing.system.quantity, {
    bundle: 2,
    max: 6,
    value: 4,
  });

  const rollbackHarness = createOperationHarness();
  const rollbackTarget = createItem({
    actor: rollbackHarness.destinationActor,
    bundle: 2,
    id: 'rollback-item',
    max: 4,
    quantity: 2,
  });
  rollbackTarget.update = async (update) => {
    rollbackHarness.calls.push(['destinationUpdate', structuredClone(update)]);
    rollbackTarget.system.quantity = {
      bundle: update['system.quantity.bundle'],
      max: update['system.quantity.max'],
      value: update['system.quantity.value'],
    };
  };
  rollbackHarness.destinationActor.items.push(rollbackTarget);
  rollbackHarness.failures.sourceWrite = true;

  const failed = await transferRequest(rollbackHarness, { quantity: 2 });
  assert.equal(failed.ok, false);
  assert.equal(failed.error.code, PARTY_ITEM_TRANSFER_ERROR_CODES.writeFailed);
  assert.deepEqual(rollbackTarget.system.quantity, {
    bundle: 2,
    max: 4,
    value: 2,
  });
  assert.deepEqual(rollbackHarness.calls.map(([name]) => name), [
    'destinationUpdate',
    'sourceUpdate',
    'destinationUpdate',
  ]);
});

test('transfer audit reports exact participants after successful writes', async () => {
  const harness = createOperationHarness();
  const response = await transferRequest(harness, { quantity: 2 });

  assert.equal(response.ok, true);
  assert.equal(response.value.auditCreated, true);
  assert.deepEqual(harness.auditReports, [{
    destinationActorUuid: harness.destinationActor.uuid,
    destinationName: harness.destinationActor.name ?? '',
    itemName: harness.sourceItem.name,
    merged: false,
    quantity: 2,
    requesterName: '',
    requesterUserId: 'player',
    sourceActorUuid: harness.sourceActor.uuid,
    sourceItemUuid: harness.sourceItem.uuid,
    sourceName: harness.sourceActor.name ?? '',
  }]);
  assert.deepEqual(harness.calls.map(([name]) => name), [
    'destinationCreate',
    'sourceUpdate',
  ]);
});

test('audit failure keeps completed documents consistent and returns warning state', async () => {
  const harness = createOperationHarness();
  harness.failures.audit = true;
  const response = await transferRequest(harness);

  assert.equal(response.ok, true);
  assert.equal(response.value.auditCreated, false);
  assert.equal(harness.sourceActor.items.length, 0);
  assert.equal(harness.destinationActor.items.length, 1);
  assert.equal(harness.auditReports.length, 1);
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

test('treasury-to-character full transfer creates destination before deletion', async () => {
  const harness = prepareReverseHarness();
  const response = await reverseTransferRequest(harness);

  assert.equal(response.ok, true);
  assert.deepEqual(harness.calls.map(([name]) => name), [
    'characterCreate',
    'treasuryDelete',
  ]);
  assert.equal(harness.sourceActor.items.length, 0);
  assert.equal(harness.destinationActor.items.length, 1);
  assert.deepEqual(response.value, {
    auditCreated: true,
    destinationActorUuid: harness.destinationActor.uuid,
    destinationItemUuid:
      `${harness.destinationActor.uuid}.Item.character-created-item`,
    merged: false,
    quantity: 5,
    sourceActorUuid: harness.sourceActor.uuid,
    sourceDeleted: true,
    sourceItemUuid: harness.sourceItem.uuid,
  });
});

test('treasury-to-character partial transfer updates the treasury stack', async () => {
  const harness = prepareReverseHarness();
  const response = await reverseTransferRequest(harness, { quantity: 2 });

  assert.equal(response.ok, true);
  assert.deepEqual(harness.calls.map(([name]) => name), [
    'characterCreate',
    'treasuryUpdate',
  ]);
  assert.deepEqual(harness.sourceItem.system.quantity, {
    bundle: 3,
    max: 5,
    value: 3,
  });
  assert.deepEqual(harness.destinationActor.items[0].system.quantity, {
    bundle: 3,
    max: 2,
    value: 2,
  });
});

test('reverse transfer enforces destination ownership and source freshness', async () => {
  const unowned = prepareReverseHarness({ sourceOwned: false });
  const denied = await reverseTransferRequest(unowned);
  assert.equal(denied.ok, false);
  assert.equal(
    denied.error.code,
    PARTY_ITEM_TRANSFER_ERROR_CODES.destinationOwnershipRequired,
  );
  assert.equal(unowned.calls.length, 0);

  const stale = prepareReverseHarness();
  const staleResponse = await reverseTransferRequest(stale, {
    expectedSourceQuantity: 4,
  });
  assert.equal(staleResponse.ok, false);
  assert.equal(staleResponse.error.code, ITEM_TRANSFER_ERROR_CODES.staleQuantity);
  assert.equal(stale.calls.length, 0);
});

test('reverse source failure removes the created character Item', async () => {
  const harness = prepareReverseHarness();
  harness.failures.reverseSourceWrite = true;
  const response = await reverseTransferRequest(harness);

  assert.equal(response.ok, false);
  assert.equal(response.error.code, PARTY_ITEM_TRANSFER_ERROR_CODES.writeFailed);
  assert.deepEqual(harness.calls.map(([name]) => name), [
    'characterCreate',
    'treasuryDelete',
    'characterDelete',
  ]);
  assert.equal(harness.sourceActor.items.length, 1);
  assert.equal(harness.destinationActor.items.length, 0);
  assert.equal(
    PARTY_ITEM_TRANSFER_OPERATIONS.fromTreasury,
    'party.transferItemFromTreasury',
  );
});

test('reverse destination failure leaves the treasury Item untouched', async () => {
  const harness = prepareReverseHarness();
  harness.failures.reverseDestinationCreate = true;

  const response = await reverseTransferRequest(harness);

  assert.equal(response.ok, false);
  assert.equal(response.error.code, PARTY_ITEM_TRANSFER_ERROR_CODES.writeFailed);
  assert.deepEqual(harness.calls.map(([name]) => name), ['characterCreate']);
  assert.equal(harness.sourceActor.items.length, 1);
  assert.equal(harness.sourceItem.system.quantity.value, 5);
  assert.equal(harness.destinationActor.items.length, 0);
  assert.equal(harness.auditReports.length, 0);
});
