import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateCompatibility,
  registerModuleLifecycle,
} from '../../module/core/bootstrap.mjs';

test('compatibility guard accepts the validated Foundry/hyp3e matrix', () => {
  for (const environment of [
    { foundryVersion: '13.351', systemId: 'hyp3e', systemVersion: '4.0.3' },
    { foundryVersion: '14.365', systemId: 'hyp3e', systemVersion: '4.1.0' },
  ]) {
    assert.deepEqual(evaluateCompatibility(environment), {
      supported: true,
      reasons: [],
    });
  }
});

test('compatibility guard explains unsupported system and versions', () => {
  const incompatible = evaluateCompatibility({
    foundryVersion: '15.0',
    systemId: 'dnd5e',
    systemVersion: '4.0.2',
  });

  assert.equal(incompatible.supported, false);
  assert.equal(incompatible.reasons.length, 3);
  assert.match(incompatible.reasons.join(' '), /dnd5e/);
  assert.match(incompatible.reasons.join(' '), /Foundry 15/);
  assert.match(incompatible.reasons.join(' '), /4\.0\.2/);
});

test('unsupported systems do not register feature lifecycle hooks', async () => {
  const registeredHooks = [];
  const callbacks = new Map();
  const hooks = {
    once(name, callback) {
      registeredHooks.push(name);
      callbacks.set(name, callback);
    },
  };
  const loggerMessages = [];
  const logger = {
    info: () => {},
    warn: (...args) => loggerMessages.push(args.join(' ')),
  };
  const game = {
    version: '14.365',
    system: { id: 'dnd5e', version: '5.0.0' },
  };

  registerModuleLifecycle({ game, hooks, logger });
  callbacks.get('socketlib.ready')();
  callbacks.get('init')();

  assert.deepEqual(registeredHooks, ['socketlib.ready', 'init']);
  assert.equal(registeredHooks.includes('ready'), false);
  assert.match(loggerMessages.join(' '), /unsupported/i);
});

test('bootstrap waits for init data and survives dependency-first hook ordering', () => {
  const callbacks = new Map();
  const hooks = {
    once: (name, callback) => callbacks.set(name, callback),
    callAll: () => {},
  };
  const moduleRecord = {};
  let activeGame = {
    user: { id: 'gm', isGM: true },
    users: { activeGM: { id: 'gm', isGM: true, active: true } },
    modules: new Map([
      ['hyp3e-utilities', moduleRecord],
      ['socketlib', { active: true }],
    ]),
    settings: {
      register: () => {},
      registerMenu: () => {},
    },
  };
  let registrationCount = 0;
  const socketlib = {
    registerModule: () => {
      registrationCount += 1;
      return { register: () => {}, executeAsGM: () => {} };
    },
  };
  class ApplicationV2 {}
  const getApi = registerModuleLifecycle({
    gameProvider: () => activeGame,
    hooks,
    logger: { info: () => {}, warn: () => {} },
    foundryApi: {
      ApplicationV2,
      HandlebarsApplicationMixin: (Base) => class extends Base {},
    },
    loadTemplates: undefined,
    socketlibProvider: () => socketlib,
  });

  callbacks.get('socketlib.ready')();
  activeGame = {
    ...activeGame,
    version: '14.365',
    system: { id: 'hyp3e', version: '4.1.0' },
  };
  callbacks.get('init')();
  callbacks.get('ready')();

  assert.equal(registrationCount, 1);
  assert.equal(getApi().socket.available, true);
  assert.equal(typeof getApi().npcRolls.planReactionBatch, 'function');
  assert.equal(typeof getApi().chatCards.createNpcRollBatch, 'function');
  assert.equal(moduleRecord.api, getApi());
});
