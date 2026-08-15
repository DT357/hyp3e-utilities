import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import test from 'node:test';

import { createFoundationApplications } from '../../module/apps/foundation-applications.mjs';
import { hyp3eAdapter } from '../../module/adapters/hyp3e-adapter.mjs';
import {
  MODULE_ID,
  SAVE_KEYS,
  SETTING_KEYS,
} from '../../module/core/constants.mjs';
import {
  NPC_ACTION_HUD_ID,
  createNpcActionHud,
} from '../../module/hud/npc-action-hud.mjs';
import {
  buildNpcSelectionViewModel,
  createNpcSelectionController,
} from '../../module/hud/npc-selection.mjs';
import { createPartyFollowerService } from '../../module/party/party-followers.mjs';
import {
  createMarchingOrderModel,
} from '../../module/party/party-marching-order.mjs';
import { createPartyMemberService } from '../../module/party/party-members.mjs';
import { createPartyStateDefault } from '../../module/party/party-state.mjs';
import {
  PARTY_TREASURY_OPERATIONS,
  createPartyTreasuryService,
} from '../../module/party/party-treasury.mjs';
import { createPartyXpPreviewService } from '../../module/party/party-xp-preview.mjs';
import { characterActor, npcActor } from '../fixtures/hyp3e-documents.mjs';

const STRESS_BUDGET_MS = 1_000;

function timed(callback) {
  const startedAt = performance.now();
  const value = callback();
  return { elapsed: performance.now() - startedAt, value };
}

function createWorldActor(template, id, type) {
  const actor = structuredClone(template);
  actor.documentName = 'Actor';
  actor.id = id;
  actor.isToken = false;
  actor.name = `${type} ${id}`;
  actor.type = type;
  actor.uuid = `Actor.${id}`;
  return actor;
}

test('large party rows, marching order, and XP preview remain linear and responsive', () => {
  const state = createPartyStateDefault();
  const actors = [];
  const actorsById = new Map();
  actors.get = (id) => actorsById.get(id);
  for (let index = 0; index < 400; index += 1) {
    const member = createWorldActor(characterActor, `member-${index}`, 'character');
    const follower = createWorldActor(
      index % 2 === 0 ? characterActor : npcActor,
      `follower-${index}`,
      index % 2 === 0 ? 'character' : 'npc',
    );
    actors.push(member, follower);
    actorsById.set(member.id, member);
    actorsById.set(follower.id, follower);
    state.memberActorUuids.push(member.uuid);
    state.followerActorUuids.push(follower.uuid);
    state.shares[member.uuid] = 1;
    state.shares[follower.uuid] = 0.5;
    state.followerWages[follower.uuid] = 2;
  }
  state.marchingOrder.front.actorUuids = state.memberActorUuids.slice(0, 200);
  state.marchingOrder.middle.actorUuids = state.followerActorUuids.slice(0, 200);
  const store = {
    getState: () => state,
    registerMutation: () => {},
  };
  const game = { actors };
  const members = createPartyMemberService({ adapter: hyp3eAdapter, game, store });
  const followers = createPartyFollowerService({ adapter: hyp3eAdapter, game, store });
  const xp = createPartyXpPreviewService({ adapter: hyp3eAdapter, game, store });

  const { elapsed, value } = timed(() => ({
    followers: followers.getFollowerRows(),
    marching: createMarchingOrderModel(state),
    members: members.getMemberRows(),
    xp: xp.getPreview({ totalXp: 100_000 }),
  }));

  assert.equal(value.members.length, 400);
  assert.equal(value.followers.length, 400);
  assert.equal(value.xp.distributions.length, 800);
  assert.equal(value.marching.groups.flatMap(({ rows }) => rows).length, 800);
  assert.ok(elapsed < STRESS_BUDGET_MS, `${elapsed.toFixed(1)}ms`);
});

test('large managed treasury snapshot remains responsive and complete', () => {
  const treasury = createWorldActor(characterActor, 'treasury', 'treasure');
  treasury.flags = { [MODULE_ID]: { partyTreasury: true } };
  treasury.getFlag = (namespace, key) => treasury.flags?.[namespace]?.[key];
  treasury.items = Array.from({ length: 2_000 }, (_, index) => ({
    id: `item-${index}`,
    img: 'icons/svg/item-bag.svg',
    name: `Item ${index}`,
    system: { quantity: { bundle: 1, max: null, value: 1 } },
    type: 'item',
    uuid: `Actor.treasury.Item.item-${index}`,
  }));
  const actors = [treasury];
  actors.get = (id) => actors.find((actor) => actor.id === id);
  const state = createPartyStateDefault();
  state.revision = 7;
  state.treasuryActorUuid = treasury.uuid;
  const operations = new Map();
  createPartyTreasuryService({
    adapter: hyp3eAdapter,
    game: { actors, user: { id: 'gm', isGM: true }, users: { activeGM: { id: 'gm' } } },
    mutations: {
      registerOperation: (operation, definition) => operations.set(operation, definition),
      request: async () => ({ ok: true }),
    },
    store: {
      getState: () => state,
      registerMutation: () => {},
    },
  });
  const snapshot = operations.get(PARTY_TREASURY_OPERATIONS.snapshot);

  const { elapsed, value } = timed(() => snapshot.execute({
    expectedRevision: state.revision,
    payload: snapshot.validatePayload({}),
  }));

  assert.equal(value.ready, true);
  assert.equal(value.items.length, 2_000);
  assert.equal(value.items.every((item) => item.transferable), true);
  assert.ok(elapsed < STRESS_BUDGET_MS, `${elapsed.toFixed(1)}ms`);
});

function createHookBus() {
  const registrations = new Map();
  let nextId = 0;
  return {
    registrations,
    on(name, callback) {
      const callbacks = registrations.get(name) ?? new Map();
      const id = ++nextId;
      callbacks.set(id, callback);
      registrations.set(name, callbacks);
      return id;
    },
    off(name, id) {
      registrations.get(name)?.delete(id);
    },
    async emit(name, ...args) {
      await Promise.all([...(registrations.get(name)?.values() ?? [])]
        .map((callback) => callback(...args)));
    },
  };
}

function createScheduler() {
  const callbacks = new Map();
  let nextId = 0;
  return {
    clearTimeout: (id) => callbacks.delete(id),
    get size() { return callbacks.size; },
    async flush() {
      const pending = [...callbacks.values()];
      callbacks.clear();
      await Promise.all(pending.map((callback) => callback()));
    },
    setTimeout(callback) {
      const id = ++nextId;
      callbacks.set(id, callback);
      return id;
    },
  };
}

test('rapid NPC selection updates coalesce and scene changes do not leak hooks', async () => {
  const actor = createWorldActor(npcActor, 'shared-npc', 'npc');
  const controlled = Array.from({ length: 1_000 }, (_, index) => ({
    actor,
    document: {
      actor,
      id: `token-${index}`,
      name: `NPC ${String(index).padStart(4, '0')}`,
      uuid: `Scene.scene.Token.token-${index}`,
    },
  }));
  const viewModelTiming = timed(() => buildNpcSelectionViewModel(controlled));
  assert.equal(viewModelTiming.value.rows.length, 1_000);
  assert.ok(
    viewModelTiming.elapsed < STRESS_BUDGET_MS,
    `${viewModelTiming.elapsed.toFixed(1)}ms`,
  );

  const scheduler = createScheduler();
  const hooks = createHookBus();
  const canvas = { ready: true, tokens: { controlled } };
  const controller = createNpcSelectionController({
    canvasProvider: () => canvas,
    clearTimeout: scheduler.clearTimeout,
    game: {
      system: { id: 'hyp3e' },
      user: { isGM: true },
      settings: {
        get: (namespace, key) => (
          namespace === MODULE_ID
          && key === SETTING_KEYS.enableNpcActionHud
        ),
      },
    },
    hooks,
    setTimeout: (callback) => scheduler.setTimeout(callback),
  });
  controller.start();
  const updatePromises = Array.from({ length: 1_000 }, (_, index) => (
    hooks.emit(index % 2 === 0 ? 'updateActor' : 'updateToken', actor)
  ));
  assert.equal(scheduler.size, 1);
  await scheduler.flush();
  await Promise.all(updatePromises);
  assert.equal(controller.getViewModel().rows.length, 1_000);

  for (let index = 0; index < 50; index += 1) {
    canvas.ready = false;
    await hooks.emit('canvasTearDown', canvas);
    assert.equal(controller.getViewModel().visible, false);
    canvas.ready = true;
    await hooks.emit('canvasReady', canvas);
    assert.equal(controller.getViewModel().visible, true);
  }
  assert.equal(
    [...hooks.registrations.values()].reduce((total, entries) => total + entries.size, 0),
    8,
  );
  controller.destroy();
  assert.equal(
    [...hooks.registrations.values()].every((entries) => entries.size === 0),
    true,
  );
});

test('repeated HUD start and destroy cycles release subscriptions and listeners', async () => {
  const elements = new Map();
  const counters = {
    hookOff: 0,
    hookOn: 0,
    resizeOff: 0,
    resizeOn: 0,
    subscribe: 0,
    unsubscribe: 0,
  };
  class FakeElement {
    constructor() {
      this.isConnected = false;
      this.listeners = new Map();
      this.style = {};
    }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    getBoundingClientRect() { return { height: 200, left: 20, top: 20, width: 400 }; }
    remove() { this.isConnected = false; elements.delete(this.id); }
  }
  const document = {
    body: {
      append(element) {
        element.isConnected = true;
        elements.set(element.id, element);
      },
    },
    createElement: () => new FakeElement(),
    getElementById: (id) => elements.get(id) ?? null,
  };
  const hooks = {
    on() { counters.hookOn += 1; return counters.hookOn; },
    off() { counters.hookOff += 1; },
  };
  const window = {
    innerHeight: 900,
    innerWidth: 1_400,
    addEventListener(name) { if (name === 'resize') counters.resizeOn += 1; },
    removeEventListener(name) { if (name === 'resize') counters.resizeOff += 1; },
  };
  const model = {
    rows: [{
      armor: { ac: 5, dr: 1 },
      hasMorale: true,
      hp: { max: 10, value: 10 },
      morale: 8,
      movement: 40,
      name: 'Stress NPC',
      saves: Object.fromEntries(SAVE_KEYS.map((key) => [key, 10])),
      tokenUuid: 'Scene.scene.Token.npc',
    }],
    visible: true,
  };
  const selection = {
    getRollCandidates: () => [],
    getViewModel: () => model,
    subscribe() {
      counters.subscribe += 1;
      return () => { counters.unsubscribe += 1; };
    },
  };
  const hud = createNpcActionHud({
    document,
    game: {
      i18n: { localize: (key) => key },
      settings: { get: () => ({}) },
    },
    hooks,
    renderTemplate: async () => '<section>Stress HUD</section>',
    selection,
    window,
  });

  for (let index = 0; index < 100; index += 1) {
    await hud.start();
    await hud.start();
    assert.ok(document.getElementById(NPC_ACTION_HUD_ID));
    hud.destroy();
    assert.equal(document.getElementById(NPC_ACTION_HUD_ID), null);
  }

  assert.deepEqual(counters, {
    hookOff: 100,
    hookOn: 100,
    resizeOff: 100,
    resizeOn: 100,
    subscribe: 100,
    unsubscribe: 100,
  });
});

class LifecycleApplicationV2 {
  async close() { this.rendered = false; }
  async render() { this.rendered = true; return this; }
  bringToFront() {}
}

test('repeated Party Sheet open and close cycles remove every hook', async () => {
  const activeHooks = new Map();
  let registered = 0;
  let removed = 0;
  const hooks = {
    on(name, callback) {
      const id = ++registered;
      activeHooks.set(id, { callback, name });
      return id;
    },
    off(_name, id) {
      if (activeHooks.delete(id)) removed += 1;
    },
  };
  const classes = createFoundationApplications({
    ApplicationV2: LifecycleApplicationV2,
    HandlebarsApplicationMixin: (Base) => class extends Base {},
    game: { settings: {}, users: [] },
    hooks,
  });
  const instances = new Set();

  const startedAt = performance.now();
  for (let index = 0; index < 100; index += 1) {
    const app = new classes.OpenPartySheetApplication();
    instances.add(app);
    await app._onFirstRender({}, {});
    await app.render({ force: true });
    await app.close();
    assert.equal(activeHooks.size, 0);
  }
  const lifecycleElapsed = performance.now() - startedAt;

  assert.equal(instances.size, 100);
  assert.equal(registered, 800);
  assert.equal(removed, 800);
  assert.ok(lifecycleElapsed < STRESS_BUDGET_MS, `${lifecycleElapsed.toFixed(1)}ms`);
});
