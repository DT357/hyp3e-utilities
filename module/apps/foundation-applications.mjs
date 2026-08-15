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
import { PARTY_MARCHING_OPERATIONS } from '../party/party-marching-order.mjs';
import { PARTY_MEMBER_OPERATIONS } from '../party/party-members.mjs';
import { PARTY_NOTE_OPERATIONS } from '../party/party-notes.mjs';
import { PARTY_SUPPLY_OPERATIONS } from '../party/party-supplies.mjs';
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
  chatCardsProvider = () => game.modules?.get?.(MODULE_ID)?.api?.chatCards,
  partyActionsProvider = () => game.modules?.get?.(MODULE_ID)?.api?.partyActions,
  partyFollowersProvider = () => game.modules?.get?.(MODULE_ID)?.api?.partyFollowers,
  partyMarchingOrderProvider = () => game.modules?.get?.(MODULE_ID)?.api?.partyMarchingOrder,
  partyMembersProvider = () => game.modules?.get?.(MODULE_ID)?.api?.partyMembers,
  partyMutationsProvider = () => game.modules?.get?.(MODULE_ID)?.api?.partyMutations,
  partyNotesProvider = () => game.modules?.get?.(MODULE_ID)?.api?.partyNotes,
  partyStoreProvider = () => game.modules?.get?.(MODULE_ID)?.api?.partyStore,
  partySuppliesProvider = () => game.modules?.get?.(MODULE_ID)?.api?.partySupplies,
  partyTreasuryProvider = () => game.modules?.get?.(MODULE_ID)?.api?.partyTreasury,
  proseMirrorElementClass = globalThis.foundry?.applications?.elements
    ?.HTMLProseMirrorElement,
  requestIdProvider = createRequestId,
  scheduleExternalRefresh = globalThis.queueMicrotask
    ?? ((callback) => void Promise.resolve().then(callback)),
  textEditorProvider = () => globalThis.foundry?.applications?.ux?.TextEditor
    ?.implementation,
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
      this._followerDrafts = new Map();
      this._marchingNoteDrafts = new Map();
      this._partyNoteDraft = null;
      this._partyTabScrollPositions = new Map();
      this._supplyDraft = null;
      this._externalRefreshScheduled = false;
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
        bindPartyTreasury: OpenPartySheetApplication.bindPartyTreasury,
        discardPartyDrafts: OpenPartySheetApplication.discardPartyDrafts,
        moveMarchingActor: OpenPartySheetApplication.moveMarchingActor,
        openFollower: OpenPartySheetApplication.openFollower,
        openMarchingActor: OpenPartySheetApplication.openMarchingActor,
        openMember: OpenPartySheetApplication.openMember,
        openPartyTreasury: OpenPartySheetApplication.openPartyTreasury,
        pingActor: OpenPartySheetApplication.pingActor,
        reportMarchingOrder: OpenPartySheetApplication.reportMarchingOrder,
        removeFollower: OpenPartySheetApplication.removeFollower,
        removeMember: OpenPartySheetApplication.removeMember,
        recreatePartyTreasury: OpenPartySheetApplication.recreatePartyTreasury,
        rollAllFollowerMorale:
          OpenPartySheetApplication.rollAllFollowerMorale,
        rollFollowerMorale: OpenPartySheetApplication.rollFollowerMorale,
        rollFollowerSave: OpenPartySheetApplication.rollFollowerSave,
        rollMemberSave: OpenPartySheetApplication.rollMemberSave,
        saveFollower: OpenPartySheetApplication.saveFollower,
        saveMarchingNote: OpenPartySheetApplication.saveMarchingNote,
        savePartyNotes: OpenPartySheetApplication.savePartyNotes,
        saveSupplies: OpenPartySheetApplication.saveSupplies,
        selectTab: OpenPartySheetApplication.selectTab,
      },
    };

    static PARTS = {
      main: { template: TEMPLATE_PATHS.partySheet, scrollable: [''] },
    };

    static async selectTab(_event, target) {
      const tab = target?.dataset?.tab;
      if (!['overview', 'followers', 'marchingOrder', 'supplies', 'treasure', 'notes'].includes(tab)) return;
      this._capturePartySheetViewState();
      await this._flushPartyNoteEditors();
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
        const partySheet = new OpenPartySheetApplication();
        if (partySheet.rendered) partySheet._requestExternalRefresh();
        else void partySheet.render({ force: true });
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

    static async bindPartyTreasury(_event, target) {
      const response = await partyTreasuryProvider()?.bindTreasury?.(
        target?.dataset?.actorUuid,
      );
      if (!response?.ok) {
        notify(
          notifications,
          'error',
          `${APP_NAMESPACE}.partySheet.treasuryOperationFailed`,
        );
        return response ?? null;
      }
      notify(
        notifications,
        'info',
        `${APP_NAMESPACE}.partySheet.treasuryBound`,
      );
      await this.render({ force: true });
      return response;
    }

    static async recreatePartyTreasury() {
      const response = await partyTreasuryProvider()?.recreateTreasury?.();
      if (!response?.ok) {
        notify(
          notifications,
          'error',
          `${APP_NAMESPACE}.partySheet.treasuryOperationFailed`,
        );
        return response ?? null;
      }
      notify(
        notifications,
        'info',
        `${APP_NAMESPACE}.partySheet.treasuryCreated`,
      );
      await this.render({ force: true });
      return response;
    }

    static async openPartyTreasury() {
      const actor = partyTreasuryProvider()?.getStatus?.()?.actor;
      if (!actor) {
        notify(
          notifications,
          'warn',
          `${APP_NAMESPACE}.partySheet.treasuryMissing`,
        );
        return null;
      }
      await actor.sheet?.render?.(true);
      return actor;
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
      const actorUuid = target?.dataset?.actorUuid;
      const response = await this._requestPartyOperation(
        PARTY_FOLLOWER_OPERATIONS.remove,
        { actorUuid },
        undefined,
        `${APP_NAMESPACE}.partySheet.followerOperationFailed`,
      );
      if (response?.ok) this._followerDrafts.delete(actorUuid);
    }

    static async discardPartyDrafts() {
      this._followerDrafts.clear();
      this._marchingNoteDrafts.clear();
      this._partyNoteDraft = null;
      this._supplyDraft = null;
      await this.render({ force: true });
    }

    static async moveMarchingActor(_event, target) {
      const actorUuid = target?.dataset?.actorUuid;
      const targetRank = target?.dataset?.targetRank;
      if (targetRank === 'unassigned') {
        return this._requestPartyOperation(
          PARTY_MARCHING_OPERATIONS.remove,
          { actorUuid },
          undefined,
          `${APP_NAMESPACE}.partySheet.marchingOperationFailed`,
        );
      }
      const payload = { actorUuid, rank: targetRank };
      if (target?.dataset?.targetPosition !== undefined) {
        payload.position = Number(target.dataset.targetPosition);
      }
      return this._requestPartyOperation(
        PARTY_MARCHING_OPERATIONS.place,
        payload,
        undefined,
        `${APP_NAMESPACE}.partySheet.marchingOperationFailed`,
      );
    }

    static async openMarchingActor(_event, target) {
      const actorUuid = target?.dataset?.actorUuid;
      const actor = partyMembersProvider()?.getActor?.(actorUuid)
        ?? partyFollowersProvider()?.getActor?.(actorUuid);
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

    static async pingActor(_event, target) {
      return this._executePartyAction(
        () => partyActionsProvider().pingActor(target?.dataset?.actorUuid),
        `${APP_NAMESPACE}.partySheet.tokenUnavailable`,
      );
    }

    static async reportMarchingOrder() {
      const state = partyStoreProvider()?.getState?.()
        ?? createPartyStateDefault();
      const model = partyMarchingOrderProvider()?.getModel?.(state)
        ?? { groups: [] };
      const resolveActor = (actorUuid) => (
        partyMembersProvider()?.getActor?.(actorUuid)
        ?? partyFollowersProvider()?.getActor?.(actorUuid)
      );
      const groups = model.groups
        .filter(({ id }) => id !== 'unassigned')
        .map((group) => ({
          id: group.id,
          notes: group.notes,
          rows: group.rows.map(({ actorUuid }) => ({
            actorUuid,
            name: resolveActor(actorUuid)?.name ?? actorUuid,
          })),
        }));
      return this._executePartyAction(
        () => chatCardsProvider().createMarchingOrderReport({
          groups,
          revision: state.revision,
        }),
        `${APP_NAMESPACE}.partySheet.marchingReportFailed`,
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
      const actorUuid = target?.dataset?.actorUuid;
      const draft = this._followerDrafts.get(actorUuid);
      const response = await this._requestPartyOperation(
        PARTY_FOLLOWER_OPERATIONS.setEmployment,
        {
          actorUuid,
          share: row?.querySelector?.('[data-field="follower-share"]')?.value,
          wageGp: row?.querySelector?.('[data-field="follower-wage"]')?.value,
        },
        draft?.baseRevision,
        `${APP_NAMESPACE}.partySheet.followerOperationFailed`,
      );
      if (!response?.ok) return;
      this._followerDrafts.delete(actorUuid);
      await this.render({ force: true });
    }

    static async saveMarchingNote(_event, target) {
      const rank = target?.dataset?.marchingRank;
      const draft = this._marchingNoteDrafts.get(rank);
      if (!draft) return null;
      const response = await this._requestPartyOperation(
        PARTY_MARCHING_OPERATIONS.setNote,
        { rank, text: draft.text },
        draft.baseRevision,
        `${APP_NAMESPACE}.partySheet.marchingOperationFailed`,
      );
      if (!response?.ok) return response;
      this._marchingNoteDrafts.delete(rank);
      await this.render({ force: true });
      return response;
    }

    static async saveSupplies() {
      const draft = this._supplyDraft;
      if (!draft) return null;
      const response = await this._requestPartyOperation(
        PARTY_SUPPLY_OPERATIONS.set,
        draft.values,
        draft.baseRevision,
        `${APP_NAMESPACE}.partySheet.supplyOperationFailed`,
      );
      if (!response?.ok) return response;
      this._supplyDraft = null;
      await this.render({ force: true });
      return response;
    }

    static async savePartyNotes() {
      await this._flushPartyNoteEditors();
      const draft = this._partyNoteDraft;
      if (!draft) return null;
      const response = await this._requestPartyOperation(
        PARTY_NOTE_OPERATIONS.set,
        draft.values,
        draft.baseRevision,
        `${APP_NAMESPACE}.partySheet.noteOperationFailed`,
      );
      if (!response?.ok) return response;
      this._partyNoteDraft = null;
      await this.render({ force: true });
      return response;
    }

    async _requestPartyOperation(
      operation,
      payload,
      expectedRevision = partyStoreProvider()?.getState()?.revision ?? 0,
      failureMessage = `${APP_NAMESPACE}.partySheet.memberOperationFailed`,
    ) {
      if (!payload || typeof payload !== 'object') return null;
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

    _captureFollowerDraft(event) {
      const row = event.target?.closest?.('[data-follower-row]');
      const actorUuid = row?.dataset?.actorUuid;
      if (!actorUuid) return;
      const existing = this._followerDrafts.get(actorUuid);
      this._followerDrafts.set(actorUuid, {
        baseRevision: existing?.baseRevision
          ?? partyStoreProvider()?.getState()?.revision
          ?? 0,
        share: row.querySelector('[data-field="follower-share"]')?.value ?? '',
        wageGp: row.querySelector('[data-field="follower-wage"]')?.value ?? '',
      });
    }

    _captureMarchingNoteDraft(event) {
      const group = event.target?.closest?.('[data-marching-rank]');
      const rank = group?.dataset?.marchingRank;
      if (!rank || rank === 'unassigned') return;
      const existing = this._marchingNoteDrafts.get(rank);
      this._marchingNoteDrafts.set(rank, {
        baseRevision: existing?.baseRevision
          ?? partyStoreProvider()?.getState()?.revision
          ?? 0,
        text: event.target?.value ?? '',
      });
    }

    _captureSupplyDraft(event) {
      const section = event.target?.closest?.('[data-party-supplies]');
      if (!section) return;
      this._supplyDraft = {
        baseRevision: this._supplyDraft?.baseRevision
          ?? partyStoreProvider()?.getState()?.revision
          ?? 0,
        values: Object.fromEntries([
          'torches',
          'lanterns',
          'oil',
          'rations',
        ].map((key) => [
          key,
          section.querySelector(`[data-field="${key}"]`)?.value ?? '',
        ])),
      };
    }

    _capturePartyNoteDraft(field, value, baseRevision) {
      if (!['notes', 'gems', 'misc'].includes(field)) return;
      const state = partyStoreProvider()?.getState?.()
        ?? createPartyStateDefault();
      const saved = partyNotesProvider()?.getNotes?.(state) ?? {
        notes: state.notes ?? '',
        treasureNotes: { ...state.treasureNotes },
      };
      const current = this._partyNoteDraft?.values ?? saved;
      const nextValue = value ?? '';
      const currentValue = field === 'notes'
        ? current.notes
        : current.treasureNotes[field];
      if (currentValue === nextValue) return;
      const values = {
        notes: current.notes,
        treasureNotes: { ...current.treasureNotes },
      };
      if (field === 'notes') values.notes = nextValue;
      else values.treasureNotes[field] = nextValue;
      if (
        values.notes === saved.notes
        && values.treasureNotes.gems === saved.treasureNotes.gems
        && values.treasureNotes.misc === saved.treasureNotes.misc
      ) {
        this._partyNoteDraft = null;
        return;
      }
      this._partyNoteDraft = {
        baseRevision: this._partyNoteDraft?.baseRevision
          ?? baseRevision
          ?? state.revision,
        values,
      };
    }

    _getMountedPartyNoteEditors() {
      return Array.from(this.element?.querySelectorAll?.(
        '[data-party-note-editor]',
      ) ?? []).map((host) => ({
        editor: host.querySelector?.('prose-mirror') ?? host.editor,
        field: host.dataset?.partyNoteField,
        revision: Number(host.dataset?.partyNoteRevision),
      })).filter(({ editor, field }) => editor && field);
    }

    _captureMountedPartyNoteEditors({ dirtyOnly = false } = {}) {
      for (const { editor, field, revision } of this._getMountedPartyNoteEditors()) {
        if (dirtyOnly && editor.isDirty?.() !== true) continue;
        this._capturePartyNoteDraft(field, editor.value ?? '', revision);
      }
    }

    async _flushPartyNoteEditors() {
      const editors = this._getMountedPartyNoteEditors();
      this._captureMountedPartyNoteEditors({ dirtyOnly: true });
      for (const { editor } of editors) {
        if (editor.open) editor.open = false;
      }
      await Promise.resolve();
    }

    _capturePartySheetViewState() {
      this._captureMountedPartyNoteEditors({ dirtyOnly: true });
      const panel = this.element?.querySelector?.(
        `.${CSS_NAMESPACE}__party-panel`,
      );
      if (!panel) return;
      this._partyTabScrollPositions.set(this._activeTab, {
        left: panel.scrollLeft,
        top: panel.scrollTop,
      });
    }

    _restorePartySheetViewState() {
      const position = this._partyTabScrollPositions.get(this._activeTab);
      if (!position) return;
      const panel = this.element?.querySelector?.(
        `.${CSS_NAMESPACE}__party-panel`,
      );
      if (!panel) return;
      panel.scrollLeft = position.left;
      panel.scrollTop = position.top;
    }

    _isRelevantPartyActor(actor) {
      const actorUuid = actor?.uuid;
      if (!actorUuid) return false;
      const state = partyStoreProvider()?.getState?.()
        ?? createPartyStateDefault();
      return actorUuid === state.treasuryActorUuid
        || state.memberActorUuids.includes(actorUuid)
        || state.followerActorUuids.includes(actorUuid);
    }

    _isRelevantPartyItem(item) {
      const actor = item?.parent?.documentName === 'Actor'
        ? item.parent
        : item?.actor;
      return this._isRelevantPartyActor(actor);
    }

    _requestExternalRefresh() {
      if (!this.rendered || this._externalRefreshScheduled) return false;
      this._capturePartySheetViewState();
      this._externalRefreshScheduled = true;
      try {
        scheduleExternalRefresh(async () => {
          if (!this._externalRefreshScheduled) return;
          this._externalRefreshScheduled = false;
          if (!this.rendered) return;
          try {
            await this.render({ force: true });
          }
          catch (error) {
            logger.warn?.('Party Sheet refresh failed.', error);
          }
        });
      }
      catch (error) {
        this._externalRefreshScheduled = false;
        logger.warn?.('Party Sheet refresh could not be scheduled.', error);
        return false;
      }
      return true;
    }

    _mountPartyNoteEditors(context) {
      const hosts = Array.from(this.element?.querySelectorAll?.(
        '[data-party-note-editor]',
      ) ?? []);
      if (!hosts.length) return;
      if (typeof proseMirrorElementClass?.create !== 'function') {
        logger.warn?.('Foundry ProseMirror element API is unavailable.');
        return;
      }
      for (const host of hosts) {
        const field = host.dataset?.partyNoteField;
        if (!['notes', 'gems', 'misc'].includes(field)) continue;
        host.dataset.partyNoteRevision = String(context.state.revision);
        const isPartyNotes = field === 'notes';
        const value = isPartyNotes
          ? context.partyNotes.notes
          : context.partyNotes.treasureNotes[field];
        const enriched = isPartyNotes
          ? context.enrichedPartyNotes.notes
          : context.enrichedPartyNotes.treasureNotes[field];
        const editor = proseMirrorElementClass.create({
          collaborate: false,
          editable: context.canEdit,
          enriched,
          name: isPartyNotes ? 'notes' : `treasureNotes.${field}`,
          toggled: true,
          value,
        });
        if (context.canEdit) {
          const capture = () => {
            this._capturePartyNoteDraft(
              field,
              editor.value ?? '',
              context.state.revision,
            );
          };
          editor.addEventListener('change', capture);
          editor.addEventListener('input', capture);
        }
        host.replaceChildren(editor);
      }
    }

    _handleMarchingDragStart(event) {
      const row = event.target?.closest?.('[data-marching-row]');
      const actorUuid = row?.dataset?.actorUuid;
      if (!actorUuid) return;
      event.dataTransfer?.setData?.('text/plain', JSON.stringify({
        actorUuid,
        type: 'Hyp3eUtilitiesMarchingActor',
      }));
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    }

    async _handleMarchingDrop(event) {
      event.preventDefault();
      let dropData;
      try {
        dropData = JSON.parse(event.dataTransfer?.getData('text/plain') ?? '');
      }
      catch {
        return;
      }
      if (
        dropData?.type !== 'Hyp3eUtilitiesMarchingActor'
        || !dropData.actorUuid
      ) return;
      const row = event.target?.closest?.('[data-marching-row]');
      const group = event.target?.closest?.('[data-marching-rank]');
      const rank = row?.dataset?.marchingRank
        ?? group?.dataset?.marchingRank;
      if (!rank || row?.dataset?.actorUuid === dropData.actorUuid) return;
      const target = {
        dataset: {
          actorUuid: dropData.actorUuid,
          targetRank: rank,
        },
      };
      if (row?.dataset?.marchingPosition !== undefined) {
        target.dataset.targetPosition = row.dataset.marchingPosition;
      }
      await OpenPartySheetApplication.moveMarchingActor.call(
        this,
        event,
        target,
      );
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
      const followerActorUuids = new Set(state.followerActorUuids);
      for (const actorUuid of this._followerDrafts.keys()) {
        if (!followerActorUuids.has(actorUuid)) {
          this._followerDrafts.delete(actorUuid);
        }
      }
      const followers = (partyFollowersProvider()?.getFollowerRows?.(state)
        ?? []).map((row) => {
        const draft = decision.allowed
          ? this._followerDrafts.get(row.actorUuid)
          : null;
        return draft ? {
          ...row,
          share: draft.share,
          wageGp: draft.wageGp,
        } : row;
      });
      const members = partyMembersProvider()?.getMemberRows?.(state) ?? [];
      const marchingRows = new Map([
        ...members.map((row) => [row.actorUuid, { ...row, kind: 'member' }]),
        ...followers.map((row) => [
          row.actorUuid,
          { ...row, kind: 'follower' },
        ]),
      ]);
      const marchingModel = partyMarchingOrderProvider()?.getModel?.(state)
        ?? { groups: [], hasAssignments: false };
      const marchingGroups = marchingModel.groups.map((group, groupIndex) => {
        const draft = decision.allowed
          ? this._marchingNoteDrafts.get(group.id)
          : null;
        return {
          ...group,
          acceptsNotes: group.id !== 'unassigned',
          label: `${APP_NAMESPACE}.partySheet.marchingGroups.${group.id}`,
          notes: draft?.text ?? group.notes,
          rows: group.rows.map((slot) => ({
            ...slot,
            ...(marchingRows.get(slot.actorUuid) ?? {
              img: 'icons/svg/mystery-man.svg',
              missing: true,
              name: slot.actorUuid,
            }),
            canMoveDown:
              group.id !== 'unassigned'
              && slot.position < group.rows.length - 1,
            canMoveNext: groupIndex < marchingModel.groups.length - 1,
            canMovePrevious: groupIndex > 0,
            canMoveUp: group.id !== 'unassigned' && slot.position > 0,
            downPosition: slot.position + 1,
            nextRank: marchingModel.groups[groupIndex + 1]?.id,
            previousRank: marchingModel.groups[groupIndex - 1]?.id,
            upPosition: slot.position - 1,
          })),
        };
      });
      const supplies = decision.allowed && this._supplyDraft
        ? { ...this._supplyDraft.values }
        : partySuppliesProvider()?.getSupplies?.(state)
          ?? { ...state.supplies };
      const savedPartyNotes = partyNotesProvider()?.getNotes?.(state) ?? {
        notes: state.notes ?? '',
        treasureNotes: { ...state.treasureNotes },
      };
      const partyNotes = decision.allowed && this._partyNoteDraft
        ? {
          notes: this._partyNoteDraft.values.notes,
          treasureNotes: {
            ...this._partyNoteDraft.values.treasureNotes,
          },
        }
        : savedPartyNotes;
      const textEditor = textEditorProvider();
      const enrichHtml = textEditor?.enrichHTML;
      const enrich = typeof enrichHtml === 'function'
        ? (html) => enrichHtml.call(textEditor, html, { async: true })
        : async () => '';
      const [enrichedNotes, enrichedGems, enrichedMisc] = await Promise.all([
        enrich(partyNotes.notes),
        enrich(partyNotes.treasureNotes.gems),
        enrich(partyNotes.treasureNotes.misc),
      ]);
      const enrichedPartyNotes = {
        notes: enrichedNotes,
        treasureNotes: { gems: enrichedGems, misc: enrichedMisc },
      };
      const treasuryStatus = partyTreasuryProvider()?.getStatus?.(state) ?? {
        actor: null,
        candidates: [],
        configuredUuid: state.treasuryActorUuid ?? '',
        hasDuplicates: false,
        kind: state.treasuryActorUuid ? 'missing' : 'unbound',
      };
      const treasury = {
        actorUuid: treasuryStatus.actor?.uuid ?? '',
        candidates: treasuryStatus.candidates.map((actor) => ({
          actorUuid: actor.uuid,
          bound: actor.uuid === treasuryStatus.actor?.uuid,
          name: actor.name,
        })),
        configuredUuid: treasuryStatus.configuredUuid,
        hasDuplicates: treasuryStatus.hasDuplicates,
        kind: treasuryStatus.kind,
        name: treasuryStatus.actor?.name ?? '',
        needsRecreation: ['missing', 'unbound'].includes(treasuryStatus.kind),
        needsSelection: ['ambiguous', 'recoverable'].includes(
          treasuryStatus.kind,
        ),
        ready: treasuryStatus.kind === 'ready',
        showCandidates:
          treasuryStatus.hasDuplicates
          || ['ambiguous', 'recoverable'].includes(treasuryStatus.kind),
      };
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
        canManageTreasury: game.user?.isGM === true,
        canRollPartyActions: game.user?.isGM === true,
        followers,
        hasFollowers: followers.length > 0,
        hasFollowerMorale: followers.some((row) => row.canRollMorale),
        hasStaleDraft: decision.allowed && [
          ...this._followerDrafts.values(),
          ...this._marchingNoteDrafts.values(),
          ...(this._partyNoteDraft ? [this._partyNoteDraft] : []),
          ...(this._supplyDraft ? [this._supplyDraft] : []),
        ].some((draft) => draft.baseRevision !== state.revision),
        hasUnsavedChanges:
          decision.allowed && (
            this._followerDrafts.size > 0
            || this._marchingNoteDrafts.size > 0
            || this._partyNoteDraft !== null
            || this._supplyDraft !== null
          ),
        hasMembers: members.length > 0,
        members,
        marchingGroups,
        enrichedPartyNotes,
        partyNotes,
        permissionReason: decision.reason,
        saveOptions,
        showOverview: this._activeTab === 'overview',
        showFollowers: this._activeTab === 'followers',
        showMarchingOrder: this._activeTab === 'marchingOrder',
        showNotes: this._activeTab === 'notes',
        showSupplies: this._activeTab === 'supplies',
        showTreasure: this._activeTab === 'treasure',
        state,
        supplies,
        tabs,
        treasury,
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
      const marchingOrder = this.element?.querySelector?.(
        '[data-party-marching-order]',
      );
      const supplies = this.element?.querySelector?.('[data-party-supplies]');
      this._mountPartyNoteEditors(context);
      this._restorePartySheetViewState();
      if (context.canEdit !== true) return;
      followerDropZone?.addEventListener(
        'input',
        this._captureFollowerDraft.bind(this),
      );
      marchingOrder?.addEventListener(
        'input',
        this._captureMarchingNoteDraft.bind(this),
      );
      supplies?.addEventListener(
        'input',
        this._captureSupplyDraft.bind(this),
      );
      marchingOrder?.addEventListener(
        'dragstart',
        this._handleMarchingDragStart.bind(this),
      );
      marchingOrder?.addEventListener(
        'dragover',
        (event) => event.preventDefault(),
      );
      marchingOrder?.addEventListener('drop', (event) => {
        void this._handleMarchingDrop(event).catch((error) => {
          logger.warn?.('Party Sheet marching-order drop failed.', error);
        });
      });
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
      const rerender = () => this._requestExternalRefresh();
      const rerenderForActor = (actor) => {
        if (this._isRelevantPartyActor(actor)) rerender();
      };
      const rerenderForItem = (item) => {
        if (this._isRelevantPartyItem(item)) rerender();
      };
      for (const [hookName, callback] of [
        [HOOK_NAMES.partyStateUpdated, rerender],
        [HOOK_NAMES.partyPermissionsUpdated, rerender],
        ['createActor', rerenderForActor],
        ['updateActor', rerenderForActor],
        ['deleteActor', rerenderForActor],
        ['createItem', rerenderForItem],
        ['updateItem', rerenderForItem],
        ['deleteItem', rerenderForItem],
      ]) {
        this._partyHookSubscriptions.push([
          hookName,
          hooks.on(hookName, callback),
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
      this._externalRefreshScheduled = false;
      this._followerDrafts.clear();
      this._marchingNoteDrafts.clear();
      this._partyNoteDraft = null;
      this._partyTabScrollPositions.clear();
      this._supplyDraft = null;
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
