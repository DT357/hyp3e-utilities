import assert from 'node:assert/strict';
import test from 'node:test';

import { hyp3eAdapter } from '../../module/adapters/hyp3e-adapter.mjs';
import { HOOK_NAMES, MODULE_ID, SETTING_KEYS } from '../../module/core/constants.mjs';
import {
  buildNpcSelectionViewModel,
  createNpcSelectionController,
} from '../../module/hud/npc-selection.mjs';
import {
  characterActor,
  npcActor,
  syntheticNpcActor,
} from '../fixtures/hyp3e-documents.mjs';

function createToken({ actor, id, name }) {
  const document = {
    actor,
    id,
    name,
    uuid: `Scene.scene-id.Token.${id}`,
  };
  return { actor, document, id, name };
}

function createHookBus() {
  const callbacks = new Map();
  let nextId = 1;

  return {
    callbacks,
    on(name, callback) {
      const id = nextId;
      nextId += 1;
      const registrations = callbacks.get(name) ?? new Map();
      registrations.set(id, callback);
      callbacks.set(name, registrations);
      return id;
    },
    off(name, id) {
      callbacks.get(name)?.delete(id);
    },
    async emit(name, ...args) {
      await Promise.all(
        [...(callbacks.get(name)?.values() ?? [])]
          .map((callback) => callback(...args)),
      );
    },
  };
}

function createControllerHarness({
  controllerOptions = {},
  enabled = true,
  isGM = true,
} = {}) {
  const actor = structuredClone(npcActor);
  const token = createToken({ actor, id: 'npc-token', name: 'Guard' });
  const controlled = [token];
  const hookBus = createHookBus();
  const game = {
    system: { id: 'hyp3e' },
    user: { isGM },
    settings: {
      get(namespace, key) {
        assert.equal(namespace, MODULE_ID);
        assert.equal(key, SETTING_KEYS.enableNpcActionHud);
        return enabled;
      },
    },
  };
  const canvas = { ready: true, tokens: { controlled } };
  const warnings = [];
  const controller = createNpcSelectionController({
    canvasProvider: () => canvas,
    game,
    hooks: hookBus,
    logger: { warn: (...args) => warnings.push(args) },
    ...controllerOptions,
  });

  return {
    actor,
    canvas,
    controlled,
    controller,
    game,
    hookBus,
    setEnabled(value) {
      enabled = value;
    },
    token,
    warnings,
  };
}

function createScheduler() {
  const callbacks = new Map();
  let nextId = 1;
  return {
    clearTimeout(id) {
      callbacks.delete(id);
    },
    get size() {
      return callbacks.size;
    },
    async flush() {
      const pending = [...callbacks.values()];
      callbacks.clear();
      await Promise.all(pending.map((callback) => callback()));
    },
    setTimeout(callback) {
      const id = nextId;
      nextId += 1;
      callbacks.set(id, callback);
      return id;
    },
  };
}

test('view model preserves token identity, filters mixed selection, and sorts rows', () => {
  const monsterActor = {
    ...npcActor,
    system: { ...npcActor.system, npcType: 'monster' },
  };
  const missingMoraleActor = {
    ...syntheticNpcActor,
    system: { ...syntheticNpcActor.system, morale: null, npcType: 'npc' },
  };
  const zulu = createToken({ actor: monsterActor, id: 'zulu', name: 'Zulu' });
  const alpha = createToken({ actor: monsterActor, id: 'alpha', name: 'Alpha' });
  const beta = createToken({
    actor: missingMoraleActor,
    id: 'beta',
    name: 'Beta',
  });
  const hero = createToken({ actor: characterActor, id: 'hero', name: 'Hero' });

  const model = buildNpcSelectionViewModel([
    zulu,
    hero,
    beta,
    alpha,
    zulu,
    { document: { id: 'missing', uuid: 'Scene.scene-id.Token.missing' } },
  ]);

  assert.equal(model.visible, true);
  assert.equal(model.selectedCount, 3);
  assert.deepEqual(model.rows.map(({ name }) => name), ['Alpha', 'Beta', 'Zulu']);
  assert.deepEqual(model.rows.map(({ tokenUuid }) => tokenUuid), [
    alpha.document.uuid,
    beta.document.uuid,
    zulu.document.uuid,
  ]);
  assert.equal(model.rows[0].actorUuid, npcActor.uuid);
  assert.equal(model.rows[2].actorUuid, npcActor.uuid);
  assert.equal(model.rows[1].actorUuid, syntheticNpcActor.uuid);
  assert.equal('npcSubtype' in model.rows[0], false);
  assert.deepEqual(model.rows[1].hp, { value: 2, max: 9 });
  assert.equal(model.rows[1].hasMorale, false);
  assert.deepEqual(model.skipped.map(({ reason }) => reason), [
    'unsupportedActor',
    'duplicateToken',
    'missingActor',
  ]);
  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.rows), true);
  assert.equal(Object.isFrozen(model.rows[0]), true);
  assert.equal(Object.isFrozen(model.rows[0].hp), true);
  assert.equal(Object.isFrozen(model.rows[0].armor), true);
});

test('controller refreshes changed Actors, preserves stable models, and removes deleted tokens', async () => {
  const harness = createControllerHarness();
  const observed = [];
  harness.controller.subscribe((model) => observed.push(model));

  const initial = harness.controller.start();
  assert.equal(initial.visible, true);
  assert.equal(initial.rows[0].hp.value, 9);
  assert.deepEqual(harness.controller.getRollCandidates(), [
    { tokenUuid: harness.token.document.uuid, actor: harness.actor },
  ]);

  await harness.hookBus.emit('updateActor', harness.actor);
  assert.equal(harness.controller.getViewModel(), initial);
  assert.equal(observed.length, 1);

  harness.actor.system.hp.value = 4;
  await harness.hookBus.emit('updateActor', harness.actor);
  const updated = harness.controller.getViewModel();
  assert.notEqual(updated, initial);
  assert.equal(updated.rows[0].hp.value, 4);
  assert.equal(observed.length, 2);

  harness.controlled.splice(0, 1);
  await harness.hookBus.emit('deleteToken', harness.token.document);
  assert.deepEqual(harness.controller.getViewModel(), {
    visible: false,
    selectedCount: 0,
    rows: [],
    skipped: [],
  });
  assert.deepEqual(harness.controller.getRollCandidates(), []);

  harness.controlled.push(harness.token);
  await harness.hookBus.emit('controlToken', harness.token, true);
  assert.equal(harness.controller.getViewModel().visible, true);
  await harness.hookBus.emit('canvasTearDown', harness.canvas);
  assert.equal(harness.controller.getViewModel().visible, false);

  harness.controller.destroy();
  assert.equal(
    [...harness.hookBus.callbacks.values()]
      .every((registrations) => registrations.size === 0),
    true,
  );
  assert.equal(harness.warnings.length, 0);
});

test('controller visibility follows the world setting, GM role, and canvas readiness', async () => {
  const harness = createControllerHarness({ enabled: false });
  harness.controller.start();
  assert.equal(harness.controller.getViewModel().visible, false);

  harness.setEnabled(true);
  await harness.hookBus.emit(
    HOOK_NAMES.settingsChanged,
    SETTING_KEYS.enableNpcActionHud,
    true,
  );
  assert.equal(harness.controller.getViewModel().visible, true);

  harness.game.user.isGM = false;
  await harness.hookBus.emit('controlToken', harness.token, true);
  assert.equal(harness.controller.getViewModel().visible, false);

  harness.game.user.isGM = true;
  harness.canvas.ready = false;
  await harness.hookBus.emit('controlToken', harness.token, true);
  assert.equal(harness.controller.getViewModel().visible, false);

  harness.controller.destroy();
});

test('high-frequency updates debounce once and lifecycle hooks never duplicate', async () => {
  const scheduler = createScheduler();
  let summaryReads = 0;
  const adapter = {
    ...hyp3eAdapter,
    getActorSummary(actor) {
      summaryReads += 1;
      return hyp3eAdapter.getActorSummary(actor);
    },
  };
  const harness = createControllerHarness({
    controllerOptions: {
      adapter,
      clearTimeout: (id) => scheduler.clearTimeout(id),
      debounceMilliseconds: 50,
      setTimeout: (callback) => scheduler.setTimeout(callback),
    },
  });
  const observed = [];
  harness.controller.subscribe((model) => observed.push(model));

  harness.controller.start();
  harness.controller.start();
  const initialHookCount = [...harness.hookBus.callbacks.values()]
    .reduce((count, registrations) => count + registrations.size, 0);
  assert.equal(initialHookCount, 8);
  assert.equal(summaryReads, 1);

  harness.actor.system.hp.value = 3;
  const first = harness.hookBus.emit('updateActor', harness.actor);
  const second = harness.hookBus.emit('updateActor', harness.actor);
  const third = harness.hookBus.emit('updateToken', harness.token.document);
  assert.equal(scheduler.size, 1);
  assert.equal(summaryReads, 1);

  await scheduler.flush();
  await Promise.all([first, second, third]);
  assert.equal(summaryReads, 2);
  assert.equal(observed.at(-1).rows[0].hp.value, 3);

  harness.controller.destroy();
  assert.equal(scheduler.size, 0);
  assert.equal(
    [...harness.hookBus.callbacks.values()]
      .every((registrations) => registrations.size === 0),
    true,
  );

  harness.controller.start();
  const restartedHookCount = [...harness.hookBus.callbacks.values()]
    .reduce((count, registrations) => count + registrations.size, 0);
  assert.equal(restartedHookCount, 8);
  harness.controller.destroy();
});
