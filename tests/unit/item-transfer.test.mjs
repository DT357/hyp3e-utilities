import assert from 'node:assert/strict';
import test from 'node:test';

import { hyp3eAdapter } from '../../module/adapters/hyp3e-adapter.mjs';
import {
  ITEM_TRANSFER_ERROR_CODES,
  ItemTransferPlanError,
  buildItemTransferPlan,
} from '../../module/party/item-transfer.mjs';

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
