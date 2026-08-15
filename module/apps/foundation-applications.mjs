import {
  CSS_NAMESPACE,
  HOOK_NAMES,
  MODULE_ID,
  SETTING_KEYS,
  TEMPLATE_PATHS,
} from '../core/constants.mjs';
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
        openMember: OpenPartySheetApplication.openMember,
        removeMember: OpenPartySheetApplication.removeMember,
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
        const response = await this._requestMemberOperation(
          PARTY_MEMBER_OPERATIONS.add,
          actorUuid,
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
      await this._requestMemberOperation(
        PARTY_MEMBER_OPERATIONS.add,
        actor.uuid,
      );
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
      await this._requestMemberOperation(
        PARTY_MEMBER_OPERATIONS.remove,
        target?.dataset?.actorUuid,
      );
    }

    async _requestMemberOperation(
      operation,
      actorUuid,
      expectedRevision = partyStoreProvider()?.getState()?.revision ?? 0,
    ) {
      if (typeof actorUuid !== 'string' || !actorUuid) return null;
      const response = await partyMutationsProvider()?.request?.(
        operation,
        {
          expectedRevision,
          payload: { actorUuid },
          requestId: requestIdProvider(),
        },
      );
      if (!response?.ok) {
        notify(
          notifications,
          'error',
          `${APP_NAMESPACE}.partySheet.memberOperationFailed`,
        );
      }
      return response ?? null;
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
      await this._requestMemberOperation(
        PARTY_MEMBER_OPERATIONS.add,
        actorUuid,
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
      const members = partyMembersProvider()?.getMemberRows?.(state) ?? [];
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
        hasMembers: members.length > 0,
        members,
        permissionReason: decision.reason,
        showOverview: this._activeTab === 'overview',
        state,
        tabs,
      };
    }

    async _onRender(context, options) {
      await super._onRender?.(context, options);
      const dropZone = this.element?.querySelector?.(
        '[data-party-member-drop-zone]',
      );
      if (!dropZone || context.canEdit !== true) return;
      dropZone.addEventListener('dragover', (event) => event.preventDefault());
      dropZone.addEventListener('drop', (event) => {
        void this._handleActorDrop(event).catch((error) => {
          logger.warn?.('Party Sheet Actor drop failed.', error);
        });
      });
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
