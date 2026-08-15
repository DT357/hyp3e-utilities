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
  toTreasury: 'party.transferItemToTreasury',
});

export const PARTY_ITEM_TRANSFER_ERROR_CODES = Object.freeze({
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
  canMerge = () => false,
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
  let executionQueue = Promise.resolve();

  function enqueue(task) {
    const pending = executionQueue.then(task);
    executionQueue = pending.catch(() => undefined);
    return pending;
  }

  function resolveSource(payload) {
    const actor = resolveActor(game, payload.sourceActorUuid);
    const itemId = EMBEDDED_ITEM_UUID_PATTERN.exec(
      payload.sourceItemUuid,
    )?.[2];
    const item = itemId ? actor?.items?.get?.(itemId) : null;
    if (
      actor?.documentName !== 'Actor'
      || actor.isToken === true
      || actor.type !== adapter.actorTypes.character
      || item?.uuid !== payload.sourceItemUuid
    ) {
      throw new PartyMutationError(
        PARTY_ITEM_TRANSFER_ERROR_CODES.invalidSource,
        'The transfer source is not a durable character Item.',
      );
    }
    return { actor, item };
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

  async function executeTransfer({ expectedRevision, payload, requester }) {
    const state = store.getState();
    if (expectedRevision !== state.revision) {
      throw new PartyMutationError(
        PARTY_MUTATION_ERROR_CODES.staleRevision,
        'The Party Sheet changed before the item transfer was confirmed.',
        { state },
      );
    }
    const source = resolveSource(payload);
    if (!ownsActor(source.actor, requester, ownerLevel)) {
      throw new PartyMutationError(
        PARTY_ITEM_TRANSFER_ERROR_CODES.sourceOwnershipRequired,
        'The requesting user does not own the source character.',
      );
    }
    const destinationActor = resolveTreasury(state);

    let plan;
    try {
      plan = buildItemTransferPlan({
        adapter,
        canMerge,
        destinationActor,
        destinationItems: destinationActor.items,
        expectedSourceQuantity: payload.expectedSourceQuantity,
        quantity: payload.quantity,
        sourceActor: source.actor,
        sourceItem: source.item,
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
        source.item,
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
      await writeSource(plan, source.actor, source.item);
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
      sourceActorUuid: source.actor.uuid,
      sourceDeleted: plan.source.action === 'delete',
      sourceItemUuid: source.item.uuid,
    };
  }

  mutations.registerOperation(PARTY_ITEM_TRANSFER_OPERATIONS.toTreasury, {
    execute(context) {
      return enqueue(() => executeTransfer(context));
    },
    validatePayload: validateTransferPayload,
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

  return Object.freeze({ transferToTreasury });
}
