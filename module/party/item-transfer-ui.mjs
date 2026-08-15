import { MODULE_ID, SETTING_KEYS } from '../core/constants.mjs';
import { evaluatePartyEditPermission } from './party-permissions.mjs';

const APP_NAMESPACE = `${MODULE_ID}.applications.partySheet`;
const EMBEDDED_ITEM_UUID_PATTERN = /^Actor\.([^\.\s]+)\.Item\.([^\.\s]+)$/;
const WORLD_ACTOR_UUID_PATTERN = /^Actor\.[^\.\s]+$/;

export const ITEM_TRANSFER_DRAG_TYPE = 'Hyp3eUtilitiesTreasuryItem';
export const ITEM_TRANSFER_MIME_TYPE = 'application/x-hyp3e-utilities-item';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character]);
}

function notify(notifications, method, key) {
  notifications?.[method]?.(key, { localize: true });
}

function parseDropData(event) {
  try {
    const value = JSON.parse(
      event?.dataTransfer?.getData?.('text/plain') ?? '',
    );
    return value && typeof value === 'object' ? value : null;
  }
  catch {
    return null;
  }
}

export function createItemTransferUiController({
  adapter,
  dialog = globalThis.foundry?.applications?.api?.DialogV2,
  game,
  hooks = globalThis.Hooks,
  itemTransfers,
  logger = console,
  notifications = globalThis.ui?.notifications,
  ownerLevel = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3,
  permissionEvaluator = evaluatePartyEditPermission,
  store,
  treasury,
} = {}) {
  if (
    typeof adapter?.getItemQuantity !== 'function'
    || typeof adapter?.isSupportedPhysicalItem !== 'function'
  ) {
    throw new TypeError('Item transfer UI requires the hyp3e adapter.');
  }
  if (
    typeof itemTransfers?.transferToTreasury !== 'function'
    || typeof itemTransfers?.transferFromTreasury !== 'function'
  ) {
    throw new TypeError('Item transfer UI requires item transfer operations.');
  }
  if (typeof store?.getState !== 'function') {
    throw new TypeError('Item transfer UI requires a Party Store.');
  }
  let actorSheetHookId = null;
  const boundRoots = new WeakSet();

  function isPartyEditor() {
    try {
      return permissionEvaluator({
        explicitEditorUserIds: game.settings.get(
          MODULE_ID,
          SETTING_KEYS.partySheetExplicitEditorUserIds,
        ),
        minimumEditRole: game.settings.get(
          MODULE_ID,
          SETTING_KEYS.partySheetMinimumEditRole,
        ),
        user: game.user,
      }).allowed;
    }
    catch (error) {
      logger.warn?.('Item transfer permission could not be evaluated.', error);
      return false;
    }
  }

  function ownsActor(actor) {
    if (game.user?.isGM === true) return true;
    if (typeof actor?.testUserPermission === 'function') {
      return actor.testUserPermission(game.user, 'OWNER');
    }
    const level = actor?.ownership?.[game.user?.id]
      ?? actor?.ownership?.default
      ?? 0;
    return Number(level) >= ownerLevel;
  }

  function isDurableCharacter(actor) {
    return actor?.documentName === 'Actor'
      && actor.isToken !== true
      && actor.type === adapter.actorTypes.character
      && WORLD_ACTOR_UUID_PATTERN.test(actor.uuid ?? '');
  }

  function resolveActor(actorUuid) {
    const actorId = WORLD_ACTOR_UUID_PATTERN.test(actorUuid ?? '')
      ? actorUuid.split('.')[1]
      : null;
    return actorId ? game.actors?.get?.(actorId) ?? null : null;
  }

  function resolveItem(itemUuid) {
    const match = EMBEDDED_ITEM_UUID_PATTERN.exec(itemUuid ?? '');
    const actor = match ? game.actors?.get?.(match[1]) : null;
    const item = actor?.items?.get?.(match?.[2]);
    return item?.uuid === itemUuid ? { actor, item } : null;
  }

  function getManagedTreasury() {
    const status = treasury?.getStatus?.(store.getState());
    return status?.kind === 'ready' ? status.actor : null;
  }

  function canTransferItem(item) {
    return adapter.isSupportedPhysicalItem(item)
      && item.system?.isContainer !== true
      && adapter.getItemQuantity(item)?.value > 0;
  }

  async function promptQuantity({ destinationActor, item, sourceActor }) {
    const maximum = adapter.getItemQuantity(item)?.value ?? 0;
    if (!Number.isInteger(maximum) || maximum <= 0) {
      notify(notifications, 'warn', `${APP_NAMESPACE}.itemTransferInvalid`);
      return null;
    }
    if (typeof dialog?.prompt !== 'function') {
      notify(notifications, 'error', `${APP_NAMESPACE}.itemTransferFailed`);
      return null;
    }
    const prompt = game.i18n.format(`${APP_NAMESPACE}.itemTransferPrompt`, {
      destination: destinationActor.name,
      item: item.name,
      source: sourceActor.name,
    });
    const quantity = await dialog.prompt({
      content: [
        `<p>${escapeHtml(prompt)}</p>`,
        '<label>',
        `<span>${escapeHtml(game.i18n.localize(`${APP_NAMESPACE}.quantity`))}</span>`,
        `<input name="quantity" type="number" min="1" max="${maximum}" step="1" value="${maximum}" autofocus>`,
        '</label>',
      ].join(''),
      modal: true,
      ok: {
        callback: (_event, button) => (
          button.form.elements.quantity.valueAsNumber
        ),
        label: game.i18n.localize(`${APP_NAMESPACE}.itemTransferConfirm`),
      },
      rejectClose: false,
      window: {
        title: game.i18n.localize(`${APP_NAMESPACE}.itemTransferTitle`),
      },
    });
    if (quantity == null) return null;
    const normalized = Number(quantity);
    if (
      !Number.isInteger(normalized)
      || normalized <= 0
      || normalized > maximum
    ) {
      notify(notifications, 'warn', `${APP_NAMESPACE}.itemTransferInvalid`);
      return null;
    }
    return { expectedSourceQuantity: maximum, quantity: normalized };
  }

  function rejectUnauthorized() {
    notify(
      notifications,
      'warn',
      `${APP_NAMESPACE}.itemTransferUnauthorized`,
    );
    return null;
  }

  async function transferToTreasury(sourceItemUuid) {
    const source = resolveItem(sourceItemUuid);
    const destinationActor = getManagedTreasury();
    if (
      !source
      || !isDurableCharacter(source.actor)
      || !canTransferItem(source.item)
      || !destinationActor
    ) {
      notify(notifications, 'warn', `${APP_NAMESPACE}.itemTransferInvalid`);
      return null;
    }
    if (!isPartyEditor() || !ownsActor(source.actor)) {
      return rejectUnauthorized();
    }
    const selection = await promptQuantity({
      destinationActor,
      item: source.item,
      sourceActor: source.actor,
    });
    if (!selection) return null;
    const revision = store.getState().revision;
    const response = await itemTransfers.transferToTreasury({
      ...selection,
      sourceActorUuid: source.actor.uuid,
      sourceItemUuid: source.item.uuid,
    }, revision);
    notify(
      notifications,
      response?.ok ? 'info' : 'error',
      `${APP_NAMESPACE}.${response?.ok ? 'itemTransferComplete' : 'itemTransferFailed'}`,
    );
    return response ?? null;
  }

  async function transferFromTreasury(sourceItemUuid, destinationActorUuid) {
    const reference = typeof sourceItemUuid === 'string'
      ? { itemUuid: sourceItemUuid }
      : sourceItemUuid;
    const source = resolveItem(reference?.itemUuid);
    const state = store.getState();
    const sourceActor = getManagedTreasury() ?? {
      name: reference?.sourceName ?? 'Party Treasury',
      uuid: state.treasuryActorUuid,
    };
    const destinationActor = resolveActor(destinationActorUuid);
    const snapshotQuantity = Number(reference?.expectedSourceQuantity);
    const snapshotItem = {
      name: reference?.itemName ?? '',
      system: {
        quantity: {
          bundle: null,
          max: snapshotQuantity,
          value: snapshotQuantity,
        },
      },
      type: 'item',
      uuid: reference?.itemUuid,
    };
    const item = source?.item ?? snapshotItem;
    if (
      !reference
      || !sourceActor?.uuid
      || !reference.itemUuid?.startsWith(`${sourceActor.uuid}.Item.`)
      || (source && source.actor?.uuid !== sourceActor.uuid)
      || !canTransferItem(item)
      || !isDurableCharacter(destinationActor)
    ) {
      notify(notifications, 'warn', `${APP_NAMESPACE}.itemTransferInvalid`);
      return null;
    }
    if (!isPartyEditor() || !ownsActor(destinationActor)) {
      return rejectUnauthorized();
    }
    const selection = await promptQuantity({
      destinationActor,
      item,
      sourceActor,
    });
    if (!selection) return null;
    const revision = state.revision;
    const response = await itemTransfers.transferFromTreasury({
      destinationActorUuid: destinationActor.uuid,
      ...selection,
      sourceItemUuid: item.uuid,
    }, revision);
    notify(
      notifications,
      response?.ok ? 'info' : 'error',
      `${APP_NAMESPACE}.${response?.ok ? 'itemTransferComplete' : 'itemTransferFailed'}`,
    );
    return response ?? null;
  }

  async function handlePartyDrop(event) {
    event?.preventDefault?.();
    event?.stopImmediatePropagation?.();
    const dropData = parseDropData(event);
    if (dropData?.type !== 'Item' || !dropData.uuid) {
      notify(notifications, 'warn', `${APP_NAMESPACE}.itemTransferInvalid`);
      return null;
    }
    return transferToTreasury(dropData.uuid);
  }

  async function handleActorDrop(event, destinationActor) {
    const dropData = parseDropData(event);
    if (
      dropData?.type !== ITEM_TRANSFER_DRAG_TYPE
      || !dropData.itemUuid
    ) return null;
    event?.preventDefault?.();
    event?.stopImmediatePropagation?.();
    return transferFromTreasury(dropData, destinationActor?.uuid);
  }

  function getDestinationOptions(state = store.getState()) {
    if (!isPartyEditor()) return [];
    const actorUuids = [...new Set([
      ...(state.memberActorUuids ?? []),
      ...(state.followerActorUuids ?? []),
    ])];
    return actorUuids.map(resolveActor)
      .filter((actor) => isDurableCharacter(actor) && ownsActor(actor))
      .sort((left, right) => (
        left.name.localeCompare(right.name) || left.uuid.localeCompare(right.uuid)
      ))
      .map((actor) => ({ actorUuid: actor.uuid, name: actor.name }));
  }

  function activateActorSheet(application, html) {
    const actor = application?.actor ?? application?.document;
    const root = application?.element ?? html?.[0] ?? html;
    if (
      !root?.addEventListener
      || !isDurableCharacter(actor)
      || !isPartyEditor()
      || !ownsActor(actor)
    ) return false;
    if (!boundRoots.has(root)) {
      boundRoots.add(root);
      root.addEventListener('dragover', (event) => {
        if (Array.from(event.dataTransfer?.types ?? []).includes(
          ITEM_TRANSFER_MIME_TYPE,
        )) {
          event.preventDefault();
          event.stopImmediatePropagation?.();
        }
      }, true);
      root.addEventListener('drop', (event) => {
        void handleActorDrop(event, actor).catch((error) => {
          logger.warn?.('Actor Sheet item transfer drop failed.', error);
          notify(notifications, 'error', `${APP_NAMESPACE}.itemTransferFailed`);
        });
      }, true);
    }
    for (const row of root.querySelectorAll?.('.item-entry[data-item-id]') ?? []) {
      const item = actor.items?.get?.(row.dataset?.itemId);
      if (
        !canTransferItem(item)
        || row.querySelector?.(`.${MODULE_ID}__send-item`)
      ) continue;
      const button = root.ownerDocument?.createElement?.('button');
      if (!button) continue;
      button.type = 'button';
      button.className = `${MODULE_ID}__send-item`;
      button.dataset.itemUuid = item.uuid;
      button.textContent = game.i18n.localize(
        `${APP_NAMESPACE}.sendItemToTreasury`,
      );
      button.title = button.textContent;
      button.addEventListener('click', (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        void transferToTreasury(item.uuid).catch((error) => {
          logger.warn?.('Actor Sheet item transfer action failed.', error);
          notify(notifications, 'error', `${APP_NAMESPACE}.itemTransferFailed`);
        });
      });
      row.append(button);
    }
    return true;
  }

  function start() {
    if (actorSheetHookId !== null || typeof hooks?.on !== 'function') {
      return false;
    }
    actorSheetHookId = hooks.on(
      'renderActorSheet',
      (application, html) => activateActorSheet(application, html),
    );
    return true;
  }

  function stop() {
    if (actorSheetHookId === null) return false;
    hooks.off?.('renderActorSheet', actorSheetHookId);
    actorSheetHookId = null;
    return true;
  }

  return Object.freeze({
    activateActorSheet,
    createTreasuryDragData(reference) {
      return {
        ...(typeof reference === 'string'
          ? { itemUuid: reference }
          : reference),
        type: ITEM_TRANSFER_DRAG_TYPE,
      };
    },
    getDestinationOptions,
    handleActorDrop,
    handlePartyDrop,
    start,
    stop,
    transferFromTreasury,
    transferToTreasury,
  });
}
