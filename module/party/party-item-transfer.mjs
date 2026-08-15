import {
  PARTY_MUTATION_ERROR_CODES,
  PartyMutationError,
  assertExactObject,
} from './party-mutation-protocol.mjs';
import {
  ItemTransferPlanError,
  buildItemTransferPlan,
} from './item-transfer.mjs';

const WORLD_ACTOR_UUID_PATTERN = /^Actor\.([^\.\s]+)$/;
const EMBEDDED_ITEM_UUID_PATTERN = /^Actor\.([^\.\s]+)\.Item\.([^\.\s]+)$/;

export const PARTY_ITEM_TRANSFER_OPERATIONS = Object.freeze({
  fromTreasury: 'party.transferItemFromTreasury',
  toTreasury: 'party.transferItemToTreasury',
});

export const PARTY_ITEM_TRANSFER_ERROR_CODES = Object.freeze({
  destinationOwnershipRequired: 'itemTransferDestinationOwnershipRequired',
  invalidDestination: 'itemTransferInvalidDestination',
  invalidSource: 'itemTransferInvalidSource',
  invalidTreasury: 'itemTransferInvalidTreasury',
  rollbackFailed: 'itemTransferRollbackFailed',
  sourceOwnershipRequired: 'itemTransferSourceOwnershipRequired',
  writeFailed: 'itemTransferWriteFailed',
});

function createRequestId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `item-transfer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function validateTransferPayload(payload) {
  assertExactObject(payload, {
    allowedKeys: [
      'expectedSourceQuantity',
      'quantity',
      'sourceActorUuid',
      'sourceItemUuid',
    ],
    label: 'Item transfer payload',
  });
  const actorMatch = WORLD_ACTOR_UUID_PATTERN.exec(payload.sourceActorUuid);
  const itemMatch = EMBEDDED_ITEM_UUID_PATTERN.exec(payload.sourceItemUuid);
  if (!actorMatch) {
    throw new TypeError('Item transfer sourceActorUuid must be a world Actor UUID.');
  }
  if (!itemMatch || itemMatch[1] !== actorMatch[1]) {
    throw new TypeError('Item transfer sourceItemUuid must belong to its source Actor UUID.');
  }
  if (
    !Number.isInteger(payload.expectedSourceQuantity)
    || payload.expectedSourceQuantity < 0
  ) {
    throw new TypeError('Expected source quantity must be a non-negative integer.');
  }
  if (!Number.isInteger(payload.quantity) || payload.quantity <= 0) {
    throw new TypeError('Item transfer quantity must be a positive integer.');
  }
  return {
    expectedSourceQuantity: payload.expectedSourceQuantity,
    quantity: payload.quantity,
    sourceActorUuid: payload.sourceActorUuid,
    sourceItemUuid: payload.sourceItemUuid,
  };
}

function validateReverseTransferPayload(payload) {
  assertExactObject(payload, {
    allowedKeys: [
      'destinationActorUuid',
      'expectedSourceQuantity',
      'quantity',
      'sourceItemUuid',
    ],
    label: 'Reverse item transfer payload',
  });
  const actorMatch = WORLD_ACTOR_UUID_PATTERN.exec(
    payload.destinationActorUuid,
  );
  const itemMatch = EMBEDDED_ITEM_UUID_PATTERN.exec(payload.sourceItemUuid);
  if (!actorMatch) {
    throw new TypeError('Item transfer destinationActorUuid must be a world Actor UUID.');
  }
  if (!itemMatch) {
    throw new TypeError('Item transfer sourceItemUuid must be an embedded world Item UUID.');
  }
  if (
    !Number.isInteger(payload.expectedSourceQuantity)
    || payload.expectedSourceQuantity < 0
  ) {
    throw new TypeError('Expected source quantity must be a non-negative integer.');
  }
  if (!Number.isInteger(payload.quantity) || payload.quantity <= 0) {
    throw new TypeError('Item transfer quantity must be a positive integer.');
  }
  return {
    destinationActorUuid: payload.destinationActorUuid,
    expectedSourceQuantity: payload.expectedSourceQuantity,
    quantity: payload.quantity,
    sourceItemUuid: payload.sourceItemUuid,
  };
}

function resolveActor(game, actorUuid) {
  const actorId = WORLD_ACTOR_UUID_PATTERN.exec(actorUuid ?? '')?.[1];
  return actorId ? game?.actors?.get?.(actorId) ?? null : null;
}

function ownsActor(actor, requester, ownerLevel) {
  if (requester?.isGM === true) return true;
  if (typeof actor?.testUserPermission === 'function') {
    return actor.testUserPermission(requester, 'OWNER');
  }
  const level = actor?.ownership?.[requester?.id]
    ?? actor?.ownership?.default
    ?? 0;
  return Number(level) >= ownerLevel;
}

function applyFlatUpdate(target, update) {
  for (const [path, value] of Object.entries(update)) {
    const parts = path.split('.');
    const finalKey = parts.pop();
    let parent = target;
    for (const part of parts) parent = parent[part] ??= {};
    parent[finalKey] = value;
  }
  return target;
}

export function createPartyItemTransferService({
  adapter,
  canMerge,
  game,
  logger = console,
  mutations,
  ownerLevel = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3,
  requestIdProvider = createRequestId,
  store,
} = {}) {
  if (typeof store?.getState !== 'function') {
    throw new TypeError('Party item transfers require a Party Store.');
  }
  if (
    typeof mutations?.request !== 'function'
    || typeof mutations?.registerOperation !== 'function'
  ) {
    throw new TypeError('Party item transfers require Party mutations.');
  }
  if (
    typeof adapter?.isManagedTreasury !== 'function'
    || typeof adapter?.buildItemQuantityUpdate !== 'function'
    || typeof adapter?.buildItemTransferCreateUpdate !== 'function'
  ) {
    throw new TypeError('Party item transfers require the hyp3e adapter.');
  }
  const mergeCompatibility = typeof canMerge === 'function'
    ? canMerge
    : adapter.areItemsStackCompatible;
  if (typeof mergeCompatibility !== 'function') {
    throw new TypeError('Party item transfers require Item compatibility.');
  }
  let executionQueue = Promise.resolve();

  function enqueue(task) {
    const pending = executionQueue.then(task);
    executionQueue = pending.catch(() => undefined);
    return pending;
  }

  function resolveCharacter(actorUuid, code, message) {
    const actor = resolveActor(game, actorUuid);
    if (
      actor?.documentName !== 'Actor'
      || actor.isToken === true
      || actor.type !== adapter.actorTypes.character
    ) {
      throw new PartyMutationError(code, message);
    }
    return actor;
  }

  function resolveEmbeddedItem(actor, itemUuid) {
    const itemMatch = EMBEDDED_ITEM_UUID_PATTERN.exec(itemUuid);
    const item = itemMatch?.[1] === actor.id
      ? actor.items?.get?.(itemMatch[2])
      : null;
    if (!item || item.uuid !== itemUuid) {
      throw new PartyMutationError(
        PARTY_ITEM_TRANSFER_ERROR_CODES.invalidSource,
        'The transfer source Item is unavailable or invalid.',
      );
    }
    return item;
  }

  function resolveTreasury(state) {
    const actor = resolveActor(game, state.treasuryActorUuid);
    if (
      actor?.documentName !== 'Actor'
      || actor.isToken === true
      || !adapter.isManagedTreasury(actor)
    ) {
      throw new PartyMutationError(
        PARTY_ITEM_TRANSFER_ERROR_CODES.invalidTreasury,
        'The configured Party Treasury is unavailable or invalid.',
      );
    }
    return actor;
  }

  async function writeDestination(plan, sourceItem, destinationActor) {
    if (plan.destination.action === 'create') {
      const itemData = sourceItem.toObject();
      delete itemData._id;
      applyFlatUpdate(
        itemData,
        adapter.buildItemTransferCreateUpdate(plan.destination.quantityAfter),
      );
      const [createdItem] = await destinationActor.createEmbeddedDocuments(
        'Item',
        [itemData],
      );
      if (!createdItem?.id || !createdItem?.uuid) {
        throw new Error('Destination Item creation returned no Item.');
      }
      return { action: 'create', item: createdItem };
    }

    const item = destinationActor.items.get(plan.destination.itemId);
    if (!item || item.uuid !== plan.destination.itemUuid) {
      throw new Error('Destination merge Item is unavailable.');
    }
    await item.update(
      adapter.buildItemQuantityUpdate(plan.destination.quantityAfter),
    );
    return { action: 'update', item };
  }

  async function rollbackDestination(receipt, plan, destinationActor) {
    if (receipt.action === 'create') {
      await destinationActor.deleteEmbeddedDocuments('Item', [receipt.item.id]);
      return;
    }
    await receipt.item.update(
      adapter.buildItemQuantityUpdate(plan.destination.quantityBefore),
    );
  }

  async function writeSource(plan, sourceActor, sourceItem) {
    if (plan.source.action === 'delete') {
      await sourceActor.deleteEmbeddedDocuments('Item', [sourceItem.id]);
      return;
    }
    await sourceItem.update(
      adapter.buildItemQuantityUpdate(plan.source.quantityAfter),
    );
  }

  async function executeTransfer(
    { expectedRevision, payload, requester },
    direction,
  ) {
    const state = store.getState();
    if (expectedRevision !== state.revision) {
      throw new PartyMutationError(
        PARTY_MUTATION_ERROR_CODES.staleRevision,
        'The Party Sheet changed before the item transfer was confirmed.',
        { state },
      );
    }
    const treasury = resolveTreasury(state);
    const toTreasury = direction === 'toTreasury';
    const character = resolveCharacter(
      toTreasury ? payload.sourceActorUuid : payload.destinationActorUuid,
      toTreasury
        ? PARTY_ITEM_TRANSFER_ERROR_CODES.invalidSource
        : PARTY_ITEM_TRANSFER_ERROR_CODES.invalidDestination,
      toTreasury
        ? 'The transfer source is not a durable character Actor.'
        : 'The transfer destination is not a durable character Actor.',
    );
    const ownershipCode = toTreasury
      ? PARTY_ITEM_TRANSFER_ERROR_CODES.sourceOwnershipRequired
      : PARTY_ITEM_TRANSFER_ERROR_CODES.destinationOwnershipRequired;
    if (!ownsActor(character, requester, ownerLevel)) {
      throw new PartyMutationError(
        ownershipCode,
        toTreasury
          ? 'The requesting user does not own the source character.'
          : 'The requesting user does not own the destination character.',
      );
    }
    const sourceActor = toTreasury ? character : treasury;
    const destinationActor = toTreasury ? treasury : character;
    const sourceItem = resolveEmbeddedItem(sourceActor, payload.sourceItemUuid);

    let plan;
    try {
      plan = buildItemTransferPlan({
        adapter,
        canMerge: mergeCompatibility,
        destinationActor,
        destinationItems: destinationActor.items,
        expectedSourceQuantity: payload.expectedSourceQuantity,
        quantity: payload.quantity,
        sourceActor,
        sourceItem,
      });
    }
    catch (error) {
      if (error instanceof ItemTransferPlanError) {
        throw new PartyMutationError(error.code, error.message);
      }
      throw error;
    }

    let destinationReceipt;
    try {
      destinationReceipt = await writeDestination(
        plan,
        sourceItem,
        destinationActor,
      );
    }
    catch (error) {
      logger.warn?.('Item transfer destination write failed.', error);
      throw new PartyMutationError(
        PARTY_ITEM_TRANSFER_ERROR_CODES.writeFailed,
        'The destination Item could not be written; the source was unchanged.',
      );
    }

    try {
      await writeSource(plan, sourceActor, sourceItem);
    }
    catch (error) {
      logger.warn?.('Item transfer source write failed.', error);
      try {
        await rollbackDestination(
          destinationReceipt,
          plan,
          destinationActor,
        );
      }
      catch (rollbackError) {
        logger.warn?.('Item transfer destination rollback failed.', rollbackError);
        throw new PartyMutationError(
          PARTY_ITEM_TRANSFER_ERROR_CODES.rollbackFailed,
          'The item transfer failed and its destination rollback also failed.',
        );
      }
      throw new PartyMutationError(
        PARTY_ITEM_TRANSFER_ERROR_CODES.writeFailed,
        'The source Item could not be written; the destination was restored.',
      );
    }

    return {
      destinationActorUuid: destinationActor.uuid,
      destinationItemUuid: destinationReceipt.item.uuid,
      merged: destinationReceipt.action === 'update',
      quantity: plan.quantity,
      sourceActorUuid: sourceActor.uuid,
      sourceDeleted: plan.source.action === 'delete',
      sourceItemUuid: sourceItem.uuid,
    };
  }

  mutations.registerOperation(PARTY_ITEM_TRANSFER_OPERATIONS.toTreasury, {
    execute(context) {
      return enqueue(() => executeTransfer(context, 'toTreasury'));
    },
    validatePayload: validateTransferPayload,
  });
  mutations.registerOperation(PARTY_ITEM_TRANSFER_OPERATIONS.fromTreasury, {
    execute(context) {
      return enqueue(() => executeTransfer(context, 'fromTreasury'));
    },
    validatePayload: validateReverseTransferPayload,
  });

  function transferToTreasury(
    payload,
    expectedRevision = store.getState().revision,
  ) {
    return mutations.request(
      PARTY_ITEM_TRANSFER_OPERATIONS.toTreasury,
      {
        expectedRevision,
        payload,
        requestId: requestIdProvider(),
      },
    );
  }

  function transferFromTreasury(
    payload,
    expectedRevision = store.getState().revision,
  ) {
    return mutations.request(
      PARTY_ITEM_TRANSFER_OPERATIONS.fromTreasury,
      {
        expectedRevision,
        payload,
        requestId: requestIdProvider(),
      },
    );
  }

  return Object.freeze({ transferFromTreasury, transferToTreasury });
}
