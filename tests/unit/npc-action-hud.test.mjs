import assert from 'node:assert/strict';
import test from 'node:test';

import { SAVE_KEYS } from '../../module/core/constants.mjs';
import {
  NPC_ACTION_HUD_ID,
  buildNpcActionHudContext,
  createNpcActionHud,
} from '../../module/hud/npc-action-hud.mjs';

function createRow({
  name,
  tokenUuid = `Scene.scene.Token.${name}`,
  hp = { value: 5, max: 10 },
  morale = 8,
  hasMorale = true,
  saves = Object.fromEntries(SAVE_KEYS.map((key, index) => [key, 10 + index])),
} = {}) {
  return {
    key: tokenUuid,
    tokenUuid,
    actorUuid: `Actor.${name}`,
    name,
    npcSubtype: 'monster',
    hp,
    armor: { ac: 7, dr: 1 },
    movement: 40,
    morale,
    hasMorale,
    saves,
  };
}

function createModel(rows) {
  return {
    visible: rows.length > 0,
    selectedCount: rows.length,
    rows,
    skipped: [],
  };
}

function createFakeDocument() {
  const elements = new Map();

  class FakeElement {
    constructor() {
      this.className = '';
      this.id = '';
      this.innerHTML = '';
      this.isConnected = false;
      this.listeners = new Map();
    }

    addEventListener(name, callback) {
      this.listeners.set(name, callback);
    }

    async dispatch(name, event) {
      return this.listeners.get(name)?.(event);
    }

    remove() {
      this.isConnected = false;
      elements.delete(this.id);
    }
  }

  return {
    body: {
      append(element) {
        element.isConnected = true;
        elements.set(element.id, element);
      },
    },
    createElement: () => new FakeElement(),
    getElementById: (id) => elements.get(id) ?? null,
  };
}

function createHudHarness({
  injectNotifications = true,
  report = { skipped: [], failures: [] },
} = {}) {
  const model = createModel([createRow({ name: 'Guard' })]);
  const actor = {
    sheet: {
      render: async (force) => {
        actor.sheet.force = force;
        return 'opened';
      },
    },
  };
  const candidates = [{
    tokenUuid: model.rows[0].tokenUuid,
    actor,
  }];
  let subscriber;
  const selection = {
    getRollCandidates: () => candidates,
    getViewModel: () => model,
    subscribe(callback) {
      subscriber = callback;
      return () => {
        subscriber = null;
      };
    },
  };
  const plans = [];
  const npcRolls = {
    planReactionBatch(received) {
      const batch = { kind: 'reaction', rolls: received, skipped: [] };
      plans.push(batch);
      return batch;
    },
    planSaveBatch(received, saveKey) {
      const batch = { kind: 'save', saveKey, rolls: received, skipped: [] };
      plans.push(batch);
      return batch;
    },
    planMoraleBatch(received) {
      const batch = { kind: 'morale', rolls: received, skipped: [] };
      plans.push(batch);
      return batch;
    },
  };
  const createdBatches = [];
  const chatCards = {
    async createNpcRollBatch(batch) {
      createdBatches.push(batch);
      return report;
    },
  };
  const document = createFakeDocument();
  const notifications = { errors: [], warnings: [] };
  const renderedContexts = [];
  const hudOptions = {
    chatCards,
    document,
    fromUuid: async (uuid) => {
      assert.equal(uuid, model.rows[0].tokenUuid);
      return { actor };
    },
    game: {
      i18n: {
        format: (key, values) => `${key}:${JSON.stringify(values)}`,
        localize: (key) => key,
      },
    },
    logger: { warn: () => {} },
    npcRolls,
    renderTemplate: async (_path, context) => {
      renderedContexts.push(context);
      return `<section>${context.rows.map((row) => row.name).join(',')}</section>`;
    },
    selection,
  };
  if (injectNotifications) {
    hudOptions.notifications = {
      error: (message) => notifications.errors.push(message),
      warn: (message) => notifications.warnings.push(message),
    };
  }
  const hud = createNpcActionHud(hudOptions);

  return {
    actor,
    candidates,
    chatCards,
    createdBatches,
    document,
    hud,
    model,
    notifications,
    npcRolls,
    plans,
    publish: (nextModel) => subscriber?.(nextModel),
    renderedContexts,
  };
}

test('HUD context clamps HP and provides the approved five-save selector', () => {
  const context = buildNpcActionHudContext(createModel([
    createRow({ name: 'Over', hp: { value: 15, max: 10 } }),
    createRow({ name: 'Under', hp: { value: -5, max: 10 } }),
    createRow({
      name: 'No Maximum',
      hp: { value: 5, max: 0 },
      hasMorale: false,
      morale: null,
    }),
  ]), { selectedSaveKey: 'invalid' });

  assert.deepEqual(context.saveOptions.map(({ key }) => key), SAVE_KEYS);
  assert.equal(context.saveOptions.every(({ available }) => available), true);
  assert.equal(context.saveAvailable, true);
  assert.equal(context.saveOptions[0].selected, true);
  assert.deepEqual(context.rows.map(({ hp }) => hp.percent), [100, 0, 0]);
  assert.equal(context.rows[0].armor.ac, 7);
  assert.equal(context.rows[0].movement, 40);
  assert.equal(context.rows[2].hasMorale, false);
  assert.equal(context.moraleAvailable, true);
  assert.equal(Object.isFrozen(context), true);
  assert.equal(Object.isFrozen(context.rows[0].hp), true);
});

test('HUD context disables unavailable saves and morale without hiding choices', () => {
  const context = buildNpcActionHudContext(createModel([
    createRow({
      name: 'Unprepared',
      hasMorale: false,
      morale: null,
      saves: Object.fromEntries(SAVE_KEYS.map((key) => [key, null])),
    }),
  ]), { selectedSaveKey: 'sorcery' });

  assert.deepEqual(context.saveOptions.map(({ key }) => key), SAVE_KEYS);
  assert.equal(context.saveOptions.every(({ available }) => !available), true);
  assert.equal(context.saveAvailable, false);
  assert.equal(context.moraleAvailable, false);
});

test('HUD renders one stable overlay and removes it when selection is hidden', async () => {
  const harness = createHudHarness();
  await harness.hud.start();

  const overlay = harness.document.getElementById(NPC_ACTION_HUD_ID);
  assert.ok(overlay);
  assert.match(overlay.innerHTML, /Guard/);

  await harness.publish(createModel([]));
  assert.equal(harness.document.getElementById(NPC_ACTION_HUD_ID), null);

  await harness.publish(harness.model);
  assert.ok(harness.document.getElementById(NPC_ACTION_HUD_ID));
  harness.hud.destroy();
  assert.equal(harness.document.getElementById(NPC_ACTION_HUD_ID), null);
});

test('HUD actions reuse planners, chat cards, and exact token Actor sheets', async () => {
  const partialReport = { skipped: [{ reason: 'missingMorale' }], failures: [] };
  const harness = createHudHarness({ report: partialReport });

  await harness.hud.executeAction('reaction');
  harness.hud.setSelectedSaveKey('sorcery');
  await harness.hud.executeAction('save');
  await harness.hud.executeAction('morale');
  const sheetResult = await harness.hud.executeAction('openActorSheet', {
    tokenUuid: harness.model.rows[0].tokenUuid,
  });

  assert.deepEqual(harness.plans.map(({ kind }) => kind), [
    'reaction',
    'save',
    'morale',
  ]);
  assert.equal(harness.plans[1].saveKey, 'sorcery');
  assert.equal(
    harness.plans.every(({ rolls }) => rolls === harness.candidates),
    true,
  );
  assert.equal(harness.createdBatches.length, 3);
  assert.equal(harness.notifications.warnings.length, 3);
  assert.equal(harness.actor.sheet.force, true);
  assert.equal(sheetResult, 'opened');
  await assert.rejects(
    harness.hud.executeAction('unknown'),
    /unknown HUD action/i,
  );
});

test('HUD actions reject an unavailable target batch without creating chat', async () => {
  const harness = createHudHarness();
  harness.candidates.splice(0);

  await assert.rejects(harness.hud.executeAction('reaction'), /unavailable/i);
  await assert.rejects(harness.hud.executeAction('save'), /unavailable/i);
  await assert.rejects(harness.hud.executeAction('morale'), /unavailable/i);
  assert.equal(harness.createdBatches.length, 0);
});

test('changing the save category refreshes its unavailable action state', async () => {
  const harness = createHudHarness();
  harness.model.rows[0].saves.death = null;
  await harness.hud.start();
  const overlay = harness.document.getElementById(NPC_ACTION_HUD_ID);

  await overlay.dispatch('change', {
    target: {
      matches: () => true,
      value: 'device',
    },
  });

  assert.equal(harness.renderedContexts[0].saveAvailable, false);
  assert.equal(harness.renderedContexts.at(-1).selectedSaveKey, 'device');
  assert.equal(harness.renderedContexts.at(-1).saveAvailable, true);
});

test('delegated UI failures produce one localized error notice', async () => {
  const harness = createHudHarness();
  await harness.hud.start();
  const overlay = harness.document.getElementById(NPC_ACTION_HUD_ID);

  await overlay.dispatch('click', {
    preventDefault() {},
    target: {
      closest: () => ({
        dataset: {
          action: 'openActorSheet',
          tokenUuid: 'Scene.scene.Token.missing',
        },
      }),
    },
  });

  assert.deepEqual(harness.notifications.errors, [
    'hyp3e-utilities.hud.actionFailed',
  ]);
});

test('HUD resolves Foundry notifications when UI initializes after module setup', async () => {
  const originalUi = globalThis.ui;
  const errors = [];
  try {
    globalThis.ui = undefined;
    const harness = createHudHarness({ injectNotifications: false });
    globalThis.ui = {
      notifications: {
        error: (message) => errors.push(message),
      },
    };
    await harness.hud.start();
    const overlay = harness.document.getElementById(NPC_ACTION_HUD_ID);

    await overlay.dispatch('click', {
      preventDefault() {},
      target: {
        closest: () => ({ dataset: { action: 'unknown' } }),
      },
    });

    assert.deepEqual(errors, ['hyp3e-utilities.hud.actionFailed']);
  }
  finally {
    globalThis.ui = originalUi;
  }
});

test('a stale async render cannot replace a newer HUD model', async () => {
  const document = createFakeDocument();
  const renders = [];
  const hud = createNpcActionHud({
    chatCards: {},
    document,
    game: { i18n: { localize: (key) => key } },
    npcRolls: {},
    renderTemplate: (_path, context) => new Promise((resolve) => {
      renders.push({ context, resolve });
    }),
    selection: {
      getRollCandidates: () => [],
      getViewModel: () => createModel([]),
      subscribe: () => () => {},
    },
  });
  const first = hud.render(createModel([createRow({ name: 'Old' })]));
  const second = hud.render(createModel([createRow({ name: 'New' })]));

  renders[1].resolve('<section>New</section>');
  await second;
  renders[0].resolve('<section>Old</section>');
  await first;

  assert.match(
    document.getElementById(NPC_ACTION_HUD_ID).innerHTML,
    /New/,
  );
});
