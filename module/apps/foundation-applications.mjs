import {
  CSS_NAMESPACE,
  HOOK_NAMES,
  MODULE_ID,
  SAVE_KEYS,
  SETTING_KEYS,
  TEMPLATE_PATHS,
} from '../core/constants.mjs';
import { PARTY_FOLLOWER_OPERATIONS } from '../party/party-followers.mjs';
import { evaluatePartyEditPermission } from '../party/party-permissions.mjs';
import { PARTY_MEMBER_OPERATIONS } from '../party/party-members.mjs';
import { createPartyStateDefault } from '../party/party-state.mjs';
import {
  validateExplicitEditorUserIds,
  validateMinimumEditRole,
} from '../settings/settings.mjs';

const APP_NAMESPACE = `${MODULE_ID}.applications`;

function notify(notifications, method, message) {
  (notifications ?? globalThis.ui?.notifications)?.[method]?.(
    message,
    { localize: true },
  );
}

function createRequestId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `party-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createFoundationApplications({
  ApplicationV2,
  HandlebarsApplicationMixin,
  game,
  hooks = globalThis.Hooks,
  logger = console,
  notifications = globalThis.ui?.notifications,
  actorDirectoryProvider = () => globalThis.ui?.actors,
  canvasProvider = () => globalThis.canvas,
  partyActionsProvider = () => game.modules?.get?.(MODULE_ID)?.api?.partyActions,
  partyFollowersProvider = () => game.modules?.get?.(MODULE_ID)?.api?.partyFollowers,
  partyMembersProvider = () => game.modules?.get?.(MODULE_ID)?.api?.partyMembers,
  partyMutationsProvider = () => game.modules?.get?.(MODULE_ID)?.api?.partyMutations,
  partyStoreProvider = () => game.modules?.get?.(MODULE_ID)?.api?.partyStore,
  requestIdProvider = createRequestId,
}) {
  const HandlebarsApplication = HandlebarsApplicationMixin(ApplicationV2);
  let partySheetInstance = null;

  class FoundationApplication extends HandlebarsApplication {
    static DEFAULT_OPTIONS = {
      id: `${MODULE_ID}-foundation`,
      classes: [CSS_NAMESPACE, `${CSS_NAMESPACE}--application`],
      window: {
        title: `${APP_NAMESPACE}.foundation.title`,
        minimizable: false,
        resizable: false,
      },
      position: { width: 420, height: 'auto' },
    };

    static PARTS = {
      main: { template: TEMPLATE_PATHS.foundation },
    };

    async _prepareContext(options) {
      const context = await super._prepareContext?.(options) ?? {};
      return {
        ...context,
        message: `${APP_NAMESPACE}.foundation.message`,
      };
    }
  }

  class ResetHudPositionApplication extends HandlebarsApplication {
    static DEFAULT_OPTIONS = {
      id: `${MODULE_ID}-reset-hud-position`,
      classes: [CSS_NAMESPACE, `${CSS_NAMESPACE}--application`],
      window: {
        title: `${APP_NAMESPACE}.resetHudPosition.title`,
        minimizable: false,
        resizable: false,
      },
      position: { width: 420, height: 'auto' },
      actions: { reset: ResetHudPositionApplication.reset },
    };

    static PARTS = {
      main: { template: TEMPLATE_PATHS.resetHudPosition },
    };

    static async reset() {
      await game.settings.set(
        MODULE_ID,
        SETTING_KEYS.npcActionHudPosition,
        {},
      );
      notify(
        notifications,
        'info',
        `${APP_NAMESPACE}.resetHudPosition.complete`,
      );
      await this.close();
    }
  }

  class PartyPermissionsApplication extends HandlebarsApplication {
    static DEFAULT_OPTIONS = {
      id: `${MODULE_ID}-party-permissions`,
      tag: 'form',
      classes: [CSS_NAMESPACE, `${CSS_NAMESPACE}--application`],
      window: {
        title: `${APP_NAMESPACE}.permissions.title`,
        minimizable: false,
        resizable: false,
      },
      position: { width: 480, height: 'auto' },
      form: {
        closeOnSubmit: false,
        handler: PartyPermissionsApplication.submit,
      },
    };

    static PARTS = {
      main: { template: TEMPLATE_PATHS.permissions },
    };

    async _prepareContext(options) {
      const context = await super._prepareContext?.(options) ?? {};
      const minimumRole = validateMinimumEditRole(game.settings.get(
        MODULE_ID,
        SETTING_KEYS.partySheetMinimumEditRole,
      ));
      const explicitIds = new Set(validateExplicitEditorUserIds(
        game.settings.get(
          MODULE_ID,
          SETTING_KEYS.partySheetExplicitEditorUserIds,
        ),
      ));
      const users = Array.from(game.users ?? [])
        .filter((user) => !user.isGM)
        .map((user) => ({
          id: user.id,
          name: user.name,
          checked: explicitIds.has(user.id),
        }));

      return {
        ...context,
        minimumRole,
        roles: [
          { value: 1, label: 'USER.RolePlayer' },
          { value: 2, label: 'USER.RoleTrusted' },
          { value: 3, label: 'USER.RoleAssistant' },
          { value: 4, label: 'USER.RoleGamemaster' },
        ].map((role) => ({
          ...role,
          selected: role.value === minimumRole,
        })),
        users,
      };
    }

    static async submit(_event, _form, formData) {
      const formObject = formData?.object ?? {};
      const minimumRole = validateMinimumEditRole(formObject.minimumEditRole);
      const submittedUserIds = formData?.getAll?.('editorUserIds')
        ?? formObject.editorUserIds
        ?? [];
      const editorUserIds = validateExplicitEditorUserIds(
        Array.isArray(submittedUserIds)
          ? submittedUserIds
          : [submittedUserIds],
      );
      const validUserIds = new Set(Array.from(game.users ?? [])
        .filter((user) => !user.isGM)
        .map((user) => user.id));
      const filteredUserIds = editorUserIds.filter(
        (userId) => validUserIds.has(userId),
      );

      await game.settings.set(
        MODULE_ID,
        SETTING_KEYS.partySheetMinimumEditRole,
        minimumRole,
      );
      await game.settings.set(
        MODULE_ID,
        SETTING_KEYS.partySheetExplicitEditorUserIds,
        filteredUserIds,
      );
      notify(notifications, 'info', `${APP_NAMESPACE}.permissions.saved`);
      await this.render({ force: true });
    }
  }

  class OpenPartySheetApplication extends HandlebarsApplication {
    constructor(options = {}) {
      if (partySheetInstance) return partySheetInstance;
      super(options);
      partySheetInstance = this;
      this._activeTab = 'overview';
      this._partyHookSubscriptions = [];
    }

    static DEFAULT_OPTIONS = {
      id: `${MODULE_ID}-party-sheet`,
      classes: [CSS_NAMESPACE, `${CSS_NAMESPACE}--application`],
      window: {
        title: `${APP_NAMESPACE}.partySheet.title`,
        minimizable: true,
        resizable: true,
      },
      position: { width: 760, height: 640 },
      actions: {
        addControlledMembers: OpenPartySheetApplication.addControlledMembers,
        addSelectedActor: OpenPartySheetApplication.addSelectedActor,
        openFollower: OpenPartySheetApplication.openFollower,
        openMember: OpenPartySheetApplication.openMember,
        pingActor: OpenPartySheetApplication.pingActor,
        removeFollower: OpenPartySheetApplication.removeFollower,
        removeMember: OpenPartySheetApplication.removeMember,
        rollAllFollowerMorale:
          OpenPartySheetApplication.rollAllFollowerMorale,
        rollFollowerMorale: OpenPartySheetApplication.rollFollowerMorale,
        rollFollowerSave: OpenPartySheetApplication.rollFollowerSave,
        rollMemberSave: OpenPartySheetApplication.rollMemberSave,
        saveFollower: OpenPartySheetApplication.saveFollower,
        selectTab: OpenPartySheetApplication.selectTab,
      },
    };

    static PARTS = {
      main: { template: TEMPLATE_PATHS.partySheet, scrollable: [''] },
    };

    static async selectTab(_event, target) {
      const tab = target?.dataset?.tab;
      if (!['overview', 'followers', 'marchingOrder', 'supplies', 'treasure', 'notes'].includes(tab)) return;
      this._activeTab = tab;
      await this.render({ force: true });
    }

    static activateActorDirectory(application) {
      const element = application?.element;
      if (
        !element?.querySelector
        || element.querySelector(`.${CSS_NAMESPACE}__directory-button`)
      ) return;
      const document = element.ownerDocument ?? globalThis.document;
      const button = document?.createElement?.('button');
      if (!button) return;
      button.className = `${CSS_NAMESPACE}__directory-button`;
      button.type = 'button';
      button.title = game.i18n.localize(
        `${APP_NAMESPACE}.partySheet.directoryButtonTitle`,
      );
      button.innerHTML = '<i class="fa-solid fa-users" aria-hidden="true"></i>';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        void new OpenPartySheetApplication().render({ force: true });
      });
      const searchModeButton = element.querySelector('.toggle-search-mode');
      if (searchModeButton?.parentNode) {
        searchModeButton.parentNode.insertBefore(button, searchModeButton);
      }
      else {
        element.prepend(button);
      }
    }

    static async addControlledMembers() {
      const tokens = canvasProvider()?.tokens?.controlled ?? [];
      const actorUuids = [...new Set(tokens
        .map((token) => token.actor)
        .filter((actor) => (
          actor?.documentName === 'Actor'
          && actor?.type === 'character'
          && actor?.isToken !== true
          && /^Actor\.[^.\s]+$/.test(actor?.uuid)
        ))
        .map((actor) => actor.uuid))];
      if (!actorUuids.length) {
        notify(
          notifications,
          'warn',
          `${APP_NAMESPACE}.partySheet.noControlledMembers`,
        );
        return;
      }

      let expectedRevision = partyStoreProvider()?.getState()?.revision ?? 0;
      for (const actorUuid of actorUuids) {
        const response = await this._requestPartyOperation(
          PARTY_MEMBER_OPERATIONS.add,
          { actorUuid },
          expectedRevision,
        );
        if (!response?.ok) break;
        expectedRevision = response.value.state.revision;
      }
    }

    static async addSelectedActor() {
      const selectedEntry = actorDirectoryProvider()?.element?.querySelector?.(
        '.directory-item.active[data-entry-id]',
      );
      const actor = game.actors?.get?.(selectedEntry?.dataset?.entryId);
      if (!actor?.uuid) {
        notify(
          notifications,
          'warn',
          `${APP_NAMESPACE}.partySheet.noSelectedActor`,
        );
        return;
      }
      await this._requestPartyOperation(
        PARTY_MEMBER_OPERATIONS.add,
        { actorUuid: actor.uuid },
      );
    }

    static async openFollower(_event, target) {
      const actor = partyFollowersProvider()?.getActor(
        target?.dataset?.actorUuid,
      );
      if (!actor) {
        notify(
          notifications,
          'warn',
          `${APP_NAMESPACE}.partySheet.missingActor`,
        );
        return;
      }
      await actor.sheet?.render?.(true);
    }

    static async openMember(_event, target) {
      const actor = partyMembersProvider()?.getActor(
        target?.dataset?.actorUuid,
      );
      if (!actor) {
        notify(
          notifications,
          'warn',
          `${APP_NAMESPACE}.partySheet.missingActor`,
        );
        return;
      }
      await actor.sheet?.render?.(true);
    }

    static async removeMember(_event, target) {
      await this._requestPartyOperation(
        PARTY_MEMBER_OPERATIONS.remove,
        { actorUuid: target?.dataset?.actorUuid },
      );
    }

    static async removeFollower(_event, target) {
      await this._requestPartyOperation(
        PARTY_FOLLOWER_OPERATIONS.remove,
        { actorUuid: target?.dataset?.actorUuid },
        undefined,
        `${APP_NAMESPACE}.partySheet.followerOperationFailed`,
      );
    }

    static async pingActor(_event, target) {
      return this._executePartyAction(
        () => partyActionsProvider().pingActor(target?.dataset?.actorUuid),
        `${APP_NAMESPACE}.partySheet.tokenUnavailable`,
      );
    }

    static async rollMemberSave(_event, target) {
      const actor = partyMembersProvider()?.getActor(
        target?.dataset?.actorUuid,
      );
      const saveKey = target?.closest?.('[data-party-actor-row]')
        ?.querySelector?.('[data-field="party-save"]')?.value;
      return this._executePartyAction(
        () => partyActionsProvider().rollSave(actor, saveKey),
        `${APP_NAMESPACE}.partySheet.rollUnavailable`,
      );
    }

    static async rollFollowerSave(_event, target) {
      const actor = partyFollowersProvider()?.getActor(
        target?.dataset?.actorUuid,
      );
      const saveKey = target?.closest?.('[data-party-actor-row]')
        ?.querySelector?.('[data-field="party-save"]')?.value;
      return this._executePartyAction(
        () => partyActionsProvider().rollSave(actor, saveKey),
        `${APP_NAMESPACE}.partySheet.rollUnavailable`,
      );
    }

    static async rollFollowerMorale(_event, target) {
      const actor = partyFollowersProvider()?.getActor(
        target?.dataset?.actorUuid,
      );
      return this._executePartyAction(
        () => partyActionsProvider().rollMorale([actor]),
        `${APP_NAMESPACE}.partySheet.rollUnavailable`,
      );
    }

    static async rollAllFollowerMorale() {
      const followerService = partyFollowersProvider();
      const actors = followerService.getFollowerRows(
        partyStoreProvider()?.getState(),
      ).filter((row) => row.canRollMorale)
        .map((row) => followerService.getActor(row.actorUuid))
        .filter(Boolean);
      return this._executePartyAction(
        () => partyActionsProvider().rollMorale(actors),
        `${APP_NAMESPACE}.partySheet.rollUnavailable`,
      );
    }

    static async saveFollower(_event, target) {
      const row = target?.closest?.('[data-follower-row]');
      await this._requestPartyOperation(
        PARTY_FOLLOWER_OPERATIONS.setEmployment,
        {
          actorUuid: target?.dataset?.actorUuid,
          share: row?.querySelector?.('[data-field="follower-share"]')?.value,
          wageGp: row?.querySelector?.('[data-field="follower-wage"]')?.value,
        },
        undefined,
        `${APP_NAMESPACE}.partySheet.followerOperationFailed`,
      );
    }

    async _requestPartyOperation(
      operation,
      payload,
      expectedRevision = partyStoreProvider()?.getState()?.revision ?? 0,
      failureMessage = `${APP_NAMESPACE}.partySheet.memberOperationFailed`,
    ) {
      if (!payload?.actorUuid) return null;
      const response = await partyMutationsProvider()?.request?.(
        operation,
        {
          expectedRevision,
          payload,
          requestId: requestIdProvider(),
        },
      );
      if (!response?.ok) {
        notify(
          notifications,
          'error',
          failureMessage,
        );
      }
      return response ?? null;
    }

    async _executePartyAction(action, failureMessage) {
      try {
        const report = await action();
        if (report?.failures?.length || report?.skipped?.length) {
          notify(
            notifications,
            'warn',
            `${APP_NAMESPACE}.partySheet.partyActionPartial`,
          );
        }
        return report;
      }
      catch (error) {
        logger.warn?.('Party Sheet action failed.', error);
        notify(notifications, 'error', failureMessage);
        return null;
      }
    }

    async _handleActorDrop(event) {
      event.preventDefault();
      let dropData;
      try {
        dropData = JSON.parse(event.dataTransfer?.getData('text/plain') ?? '');
      }
      catch {
        return;
      }
      if (dropData?.type !== 'Actor') return;
      const actorUuid = dropData.uuid
        ?? (dropData.id ? `Actor.${dropData.id}` : '');
      await this._requestPartyOperation(
        PARTY_MEMBER_OPERATIONS.add,
        { actorUuid },
      );
    }

    async _handleFollowerDrop(event) {
      event.preventDefault();
      let dropData;
      try {
        dropData = JSON.parse(event.dataTransfer?.getData('text/plain') ?? '');
      }
      catch {
        return;
      }
      if (dropData?.type !== 'Actor') return;
      const actorUuid = dropData.uuid
        ?? (dropData.id ? `Actor.${dropData.id}` : '');
      await this._requestPartyOperation(
        PARTY_FOLLOWER_OPERATIONS.add,
        { actorUuid },
        undefined,
        `${APP_NAMESPACE}.partySheet.followerOperationFailed`,
      );
    }

    async _prepareContext(options) {
      const context = await super._prepareContext?.(options) ?? {};
      const decision = evaluatePartyEditPermission({
        explicitEditorUserIds: game.settings.get(
          MODULE_ID,
          SETTING_KEYS.partySheetExplicitEditorUserIds,
        ),
        minimumEditRole: game.settings.get(
          MODULE_ID,
          SETTING_KEYS.partySheetMinimumEditRole,
        ),
        user: game.user,
      });
      const state = partyStoreProvider()?.getState()
        ?? createPartyStateDefault();
      const followers = partyFollowersProvider()?.getFollowerRows?.(state)
        ?? [];
      const members = partyMembersProvider()?.getMemberRows?.(state) ?? [];
      const saveOptions = SAVE_KEYS.map((id) => ({
        id,
        label: `${APP_NAMESPACE}.partySheet.saves.${id}`,
      }));
      const tabs = [
        ['overview', `${APP_NAMESPACE}.partySheet.tabs.overview`],
        ['followers', `${APP_NAMESPACE}.partySheet.tabs.followers`],
        ['marchingOrder', `${APP_NAMESPACE}.partySheet.tabs.marchingOrder`],
        ['supplies', `${APP_NAMESPACE}.partySheet.tabs.supplies`],
        ['treasure', `${APP_NAMESPACE}.partySheet.tabs.treasure`],
        ['notes', `${APP_NAMESPACE}.partySheet.tabs.notes`],
      ].map(([id, label]) => ({
        active: id === this._activeTab,
        id,
        label,
      }));

      return {
        ...context,
        activeTab: tabs.find((tab) => tab.active),
        canEdit: decision.allowed,
        canRollPartyActions: game.user?.isGM === true,
        followers,
        hasFollowers: followers.length > 0,
        hasFollowerMorale: followers.some((row) => row.canRollMorale),
        hasMembers: members.length > 0,
        members,
        permissionReason: decision.reason,
        saveOptions,
        showOverview: this._activeTab === 'overview',
        showFollowers: this._activeTab === 'followers',
        state,
        tabs,
      };
    }

    async _onRender(context, options) {
      await super._onRender?.(context, options);
      const dropZone = this.element?.querySelector?.(
        '[data-party-member-drop-zone]',
      );
      const followerDropZone = this.element?.querySelector?.(
        '[data-party-follower-drop-zone]',
      );
      if (context.canEdit !== true) return;
      for (const [element, handler] of [
        [dropZone, this._handleActorDrop.bind(this)],
        [followerDropZone, this._handleFollowerDrop.bind(this)],
      ]) {
        if (!element) continue;
        element.addEventListener('dragover', (event) => event.preventDefault());
        element.addEventListener('drop', (event) => {
          void handler(event).catch((error) => {
            logger.warn?.('Party Sheet Actor drop failed.', error);
          });
        });
      }
    }

    async _onFirstRender(context, options) {
      await super._onFirstRender?.(context, options);
      if (this._partyHookSubscriptions.length) return;
      const rerender = () => {
        if (!this.rendered) return;
        void this.render({ force: true }).catch((error) => {
          logger.warn?.('Party Sheet refresh failed.', error);
        });
      };
      for (const hookName of [
        HOOK_NAMES.partyStateUpdated,
        HOOK_NAMES.partyPermissionsUpdated,
      ]) {
        this._partyHookSubscriptions.push([
          hookName,
          hooks.on(hookName, rerender),
        ]);
      }
    }

    async render(options) {
      const rendered = await super.render(options);
      this.bringToFront?.();
      return rendered;
    }

    async close(options) {
      for (const [hookName, hookId] of this._partyHookSubscriptions) {
        hooks.off(hookName, hookId);
      }
      this._partyHookSubscriptions = [];
      try {
        return await super.close(options);
      }
      finally {
        if (partySheetInstance === this) partySheetInstance = null;
      }
    }
  }

  return Object.freeze({
    FoundationApplication,
    ResetHudPositionApplication,
    PartyPermissionsApplication,
    OpenPartySheetApplication,
  });
}

export async function preloadFoundationTemplates(loadTemplates) {
  if (typeof loadTemplates !== 'function') return [];
  const paths = Object.values(TEMPLATE_PATHS);
  await loadTemplates(paths);
  return paths;
}
