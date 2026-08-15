import {
  CSS_NAMESPACE,
  HOOK_NAMES,
  MODULE_ID,
  SETTING_KEYS,
  TEMPLATE_PATHS,
} from '../core/constants.mjs';
import { evaluatePartyEditPermission } from '../party/party-permissions.mjs';
import { createPartyStateDefault } from '../party/party-state.mjs';
import {
  validateExplicitEditorUserIds,
  validateMinimumEditRole,
} from '../settings/settings.mjs';

const APP_NAMESPACE = `${MODULE_ID}.applications`;

function notify(notifications, method, message) {
  notifications?.[method]?.(message, { localize: true });
}

export function createFoundationApplications({
  ApplicationV2,
  HandlebarsApplicationMixin,
  game,
  hooks = globalThis.Hooks,
  logger = console,
  notifications = globalThis.ui?.notifications,
  partyStoreProvider = () => game.modules?.get?.(MODULE_ID)?.api?.partyStore,
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
      actions: { selectTab: OpenPartySheetApplication.selectTab },
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
        permissionReason: decision.reason,
        state,
        tabs,
      };
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
