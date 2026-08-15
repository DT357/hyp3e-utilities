import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HOOK_NAMES,
  MODULE_ID,
  SETTING_KEYS,
} from '../../module/core/constants.mjs';
import {
  clampNpcActionHudPosition,
  createNpcActionHud,
  getDefaultNpcActionHudPosition,
} from '../../module/hud/npc-action-hud.mjs';

function createModel(visible = true) {
  const rows = visible ? [{
    key: 'Scene.scene.Token.guard',
    tokenUuid: 'Scene.scene.Token.guard',
    actorUuid: 'Actor.guard',
    name: 'Guard',
    npcSubtype: 'monster',
    hp: { value: 5, max: 10 },
    armor: { ac: 7, dr: 1 },
    movement: 40,
    morale: 8,
    hasMorale: true,
  }] : [];
  return { visible, selectedCount: rows.length, rows, skipped: [] };
}

function createWindow() {
  const listeners = new Map();
  return {
    innerHeight: 700,
    innerWidth: 1000,
    addEventListener(name, callback) {
      listeners.set(name, callback);
    },
    dispatch(name) {
      listeners.get(name)?.();
    },
    listenerCount(name) {
      return listeners.has(name) ? 1 : 0;
    },
    removeEventListener(name, callback) {
      if (listeners.get(name) === callback) listeners.delete(name);
    },
  };
}

function createHooks() {
  const listeners = new Map();
  let nextId = 1;
  return {
    call(name, ...args) {
      for (const callback of listeners.get(name)?.values() ?? []) {
        callback(...args);
      }
    },
    count(name) {
      return listeners.get(name)?.size ?? 0;
    },
    off(name, id) {
      listeners.get(name)?.delete(id);
    },
    on(name, callback) {
      const id = nextId;
      nextId += 1;
      if (!listeners.has(name)) listeners.set(name, new Map());
      listeners.get(name).set(id, callback);
      return id;
    },
  };
}

function createDocument() {
  const elements = new Map();

  class FakeElement {
    constructor() {
      this.classList = {
        add: (name) => this.classes.add(name),
        remove: (name) => this.classes.delete(name),
      };
      this.classes = new Set();
      this.id = '';
      this.innerHTML = '';
      this.isConnected = false;
      this.listeners = new Map();
      this.style = {};
      this.capturedPointerId = null;
    }

    addEventListener(name, callback) {
      this.listeners.set(name, callback);
    }

    async dispatch(name, event = {}) {
      return this.listeners.get(name)?.(event);
    }

    getBoundingClientRect() {
      const left = Number.parseFloat(this.style.left) || 0;
      const top = Number.parseFloat(this.style.top) || 0;
      const width = Number.parseFloat(this.style.width) || 704;
      const height = 240;
      return {
        bottom: top + height,
        height,
        left,
        right: left + width,
        top,
        width,
      };
    }

    releasePointerCapture(pointerId) {
      if (this.capturedPointerId === pointerId) this.capturedPointerId = null;
    }

    remove() {
      this.isConnected = false;
      elements.delete(this.id);
    }

    setPointerCapture(pointerId) {
      this.capturedPointerId = pointerId;
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

function createPointerTarget({ handle = true, interactive = false } = {}) {
  return {
    closest(selector) {
      if (selector === '[data-drag-handle]') return handle ? this : null;
      if (selector.includes('button')) return interactive ? this : null;
      return null;
    },
  };
}

test('HUD positions default to center and clamp inside every viewport edge', () => {
  assert.deepEqual(getDefaultNpcActionHudPosition({
    viewportHeight: 720,
    viewportWidth: 1280,
  }), { left: 288, top: 12, width: 704 });

  assert.deepEqual(clampNpcActionHudPosition(
    { left: 900, top: 900, width: 900 },
    { overlayHeight: 200, viewportHeight: 600, viewportWidth: 800 },
  ), { left: 84, top: 388, width: 704 });

  assert.deepEqual(clampNpcActionHudPosition(
    { left: -200, top: -50, width: 900 },
    { overlayHeight: 200, viewportHeight: 600, viewportWidth: 800 },
  ), { left: 12, top: 12, width: 704 });

  assert.deepEqual(getDefaultNpcActionHudPosition({
    viewportHeight: 500,
    viewportWidth: 300,
  }), { left: 12, top: 12, width: 276 });
});

test('HUD dragging persists per-client position and cleanup removes listeners', async () => {
  const document = createDocument();
  const hooks = createHooks();
  const windowObject = createWindow();
  let model = createModel();
  let subscriber;
  let storedPosition = {};
  const writes = [];
  const game = {
    i18n: { localize: (key) => key },
    settings: {
      get(namespace, key) {
        assert.equal(namespace, MODULE_ID);
        assert.equal(key, SETTING_KEYS.npcActionHudPosition);
        return storedPosition;
      },
      async set(namespace, key, value) {
        assert.equal(namespace, MODULE_ID);
        assert.equal(key, SETTING_KEYS.npcActionHudPosition);
        storedPosition = value;
        writes.push(value);
        return value;
      },
    },
  };
  const hud = createNpcActionHud({
    chatCards: {},
    document,
    game,
    hooks,
    npcRolls: {},
    renderTemplate: async () => '<section>Guard</section>',
    selection: {
      getRollCandidates: () => [],
      getViewModel: () => model,
      subscribe(callback) {
        subscriber = callback;
        return () => {
          subscriber = null;
        };
      },
    },
    window: windowObject,
  });

  await hud.start();
  const overlay = hud.getElement();
  assert.equal(overlay.style.left, '148px');
  assert.equal(overlay.style.top, '12px');
  assert.equal(overlay.style.width, '704px');
  assert.equal(windowObject.listenerCount('resize'), 1);
  assert.equal(hooks.count(HOOK_NAMES.settingsChanged), 1);

  const handle = createPointerTarget();
  await overlay.dispatch('pointerdown', {
    button: 0,
    clientX: 168,
    clientY: 32,
    isPrimary: true,
    pointerId: 7,
    preventDefault() {},
    target: handle,
  });
  assert.equal(overlay.capturedPointerId, 7);
  await overlay.dispatch('pointermove', {
    clientX: 268,
    clientY: 132,
    pointerId: 7,
    preventDefault() {},
  });
  await overlay.dispatch('pointerup', {
    clientX: 268,
    clientY: 132,
    pointerId: 7,
    preventDefault() {},
  });
  assert.deepEqual(writes, [{ left: 248, top: 112, width: 704 }]);
  assert.equal(overlay.capturedPointerId, null);

  await overlay.dispatch('pointerdown', {
    button: 0,
    clientX: 260,
    clientY: 120,
    isPrimary: true,
    pointerId: 8,
    target: createPointerTarget({ interactive: true }),
  });
  assert.equal(overlay.capturedPointerId, null);
  assert.equal(writes.length, 1);

  windowObject.innerHeight = 400;
  windowObject.innerWidth = 500;
  windowObject.dispatch('resize');
  assert.equal(overlay.style.left, '12px');
  assert.equal(overlay.style.top, '112px');
  assert.equal(overlay.style.width, '476px');

  windowObject.innerHeight = 700;
  windowObject.innerWidth = 1000;
  storedPosition = {};
  hooks.call(
    HOOK_NAMES.settingsChanged,
    SETTING_KEYS.npcActionHudPosition,
    storedPosition,
  );
  assert.equal(overlay.style.left, '148px');
  assert.equal(overlay.style.top, '12px');
  assert.equal(overlay.style.width, '704px');

  model = createModel(false);
  await subscriber(model);
  assert.equal(windowObject.listenerCount('resize'), 0);
  assert.equal(hooks.count(HOOK_NAMES.settingsChanged), 1);

  hud.destroy();
  assert.equal(hooks.count(HOOK_NAMES.settingsChanged), 0);
});
