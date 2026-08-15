export const ITEM_TRANSFER_ERROR_CODES = Object.freeze({
  ambiguousMerge: 'ambiguousMerge',
  invalidActor: 'invalidActor',
  invalidQuantity: 'invalidQuantity',
  sameActor: 'sameActor',
  sourceMismatch: 'sourceMismatch',
  staleQuantity: 'staleQuantity',
  unsupportedContainer: 'unsupportedContainer',
  unsupportedItem: 'unsupportedItem',
});

export class ItemTransferPlanError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ItemTransferPlanError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ItemTransferPlanError(code, message);
}

function isDurableTransferActor(actor, adapter) {
  return (
    actor?.documentName === 'Actor'
    && actor.isToken !== true
    && /^Actor\.[^.]+$/.test(actor.uuid ?? '')
    && [adapter.actorTypes.character, adapter.actorTypes.treasure]
      .includes(actor.type)
  );
}

function belongsToActor(item, actor) {
  return item?.parent?.uuid === actor.uuid
    && item.uuid?.startsWith(`${actor.uuid}.Item.`) === true;
}

function isContainer(item, adapter) {
  return typeof adapter?.isContainerItem === 'function'
    ? adapter.isContainerItem(item)
    : item?.type === 'container' || item?.system?.isContainer === true;
}

function partitionQuantity(quantity, transferAmount, isFullTransfer) {
  if (isFullTransfer) {
    return {
      destination: { ...quantity },
      source: null,
    };
  }

  const sourceValue = quantity.value - transferAmount;
  return {
    destination: {
      bundle: quantity.bundle,
      max: quantity.max == null ? null : transferAmount,
      value: transferAmount,
    },
    source: {
      bundle: quantity.bundle,
      max: quantity.max == null
        ? null
        : Math.max(quantity.max - transferAmount, sourceValue),
      value: sourceValue,
    },
  };
}

function mergeQuantity(destination, transferred) {
  return {
    bundle: destination.bundle,
    max: destination.max == null || transferred.max == null
      ? null
      : destination.max + transferred.max,
    value: destination.value + transferred.value,
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

/**
 * Build a validated transfer plan without mutating any Foundry document.
 */
export function buildItemTransferPlan({
  adapter,
  canMerge = () => false,
  destinationActor,
  destinationItems = [],
  expectedSourceQuantity,
  quantity,
  sourceActor,
  sourceItem,
}) {
  if (
    !isDurableTransferActor(sourceActor, adapter)
    || !isDurableTransferActor(destinationActor, adapter)
  ) {
    fail(
      ITEM_TRANSFER_ERROR_CODES.invalidActor,
      'Item transfers require durable character or treasure Actors.',
    );
  }
  if (sourceActor.uuid === destinationActor.uuid) {
    fail(
      ITEM_TRANSFER_ERROR_CODES.sameActor,
      'Source and destination Actors must be different.',
    );
  }
  if (!belongsToActor(sourceItem, sourceActor)) {
    fail(
      ITEM_TRANSFER_ERROR_CODES.sourceMismatch,
      'The source Item does not belong to the source Actor.',
    );
  }
  if (isContainer(sourceItem, adapter)) {
    fail(
      ITEM_TRANSFER_ERROR_CODES.unsupportedContainer,
      'Container transfers are not supported.',
    );
  }
  if (!adapter.isSupportedPhysicalItem(sourceItem)) {
    fail(
      ITEM_TRANSFER_ERROR_CODES.unsupportedItem,
      `Item type ${sourceItem.type ?? 'unknown'} is not supported.`,
    );
  }

  const sourceQuantity = adapter.getItemQuantity(sourceItem);
  if (
    !Number.isInteger(expectedSourceQuantity)
    || expectedSourceQuantity < 0
    || sourceQuantity.value !== expectedSourceQuantity
  ) {
    fail(
      ITEM_TRANSFER_ERROR_CODES.staleQuantity,
      'The source Item quantity changed before transfer planning.',
    );
  }
  if (
    !Number.isInteger(quantity)
    || quantity <= 0
    || quantity > sourceQuantity.value
  ) {
    fail(
      ITEM_TRANSFER_ERROR_CODES.invalidQuantity,
      'Transfer quantity must be a positive whole number on hand.',
    );
  }

  const category = adapter.getItemCategory(sourceItem);
  const compatibleItems = category === 'item'
    ? Array.from(destinationItems).filter((candidate) => (
      belongsToActor(candidate, destinationActor)
      && adapter.getItemCategory(candidate) === 'item'
      && !isContainer(candidate, adapter)
      && canMerge(sourceItem, candidate) === true
    ))
    : [];
  if (compatibleItems.length > 1) {
    fail(
      ITEM_TRANSFER_ERROR_CODES.ambiguousMerge,
      'More than one destination stack is compatible.',
    );
  }

  const partition = partitionQuantity(
    sourceQuantity,
    quantity,
    quantity === sourceQuantity.value,
  );
  const mergeTarget = compatibleItems[0] ?? null;
  const destinationQuantity = mergeTarget
    ? adapter.getItemQuantity(mergeTarget)
    : null;

  return deepFreeze({
    category,
    quantity,
    source: {
      action: partition.source ? 'update' : 'delete',
      actorUuid: sourceActor.uuid,
      itemId: sourceItem.id,
      itemUuid: sourceItem.uuid,
      quantityBefore: sourceQuantity,
      quantityAfter: partition.source,
    },
    destination: {
      action: mergeTarget ? 'update' : 'create',
      actorUuid: destinationActor.uuid,
      itemId: mergeTarget?.id ?? null,
      itemUuid: mergeTarget?.uuid ?? null,
      quantityBefore: destinationQuantity,
      quantityAfter: mergeTarget
        ? mergeQuantity(destinationQuantity, partition.destination)
        : partition.destination,
    },
  });
}
