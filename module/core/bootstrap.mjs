import {
  createFoundationApplications,
  preloadFoundationTemplates,
} from '../apps/foundation-applications.mjs';
import { hyp3eAdapter } from '../adapters/hyp3e-adapter.mjs';
import { npcRolls } from '../hud/npc-rolls.mjs';
import {
  HOOK_NAMES,
  MODULE_ID,
  SUPPORTED_ENVIRONMENT,
} from './constants.mjs';
import { registerSettings } from '../settings/settings.mjs';
import { createSocketTransport } from '../socket/socket-transport.mjs';

function parseVersionParts(version) {
  return String(version ?? '')
    .replace(/^v/i, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersions(left, right) {
  const leftParts = parseVersionParts(left);
  const rightParts = parseVersionParts(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

export function evaluateCompatibility({
  foundryVersion,
  systemId,
  systemVersion,
}) {
  const reasons = [];
  const foundryMajor = parseVersionParts(foundryVersion)[0];

  if (systemId !== SUPPORTED_ENVIRONMENT.systemId) {
    reasons.push(
      `System "${systemId}" is unsupported; expected "${SUPPORTED_ENVIRONMENT.systemId}".`,
    );
  }
  if (
    foundryMajor < SUPPORTED_ENVIRONMENT.foundryMinimum
    || foundryMajor > SUPPORTED_ENVIRONMENT.foundryMaximum
  ) {
    reasons.push(
      `Foundry ${foundryMajor} is unsupported; expected ${SUPPORTED_ENVIRONMENT.foundryMinimum}-${SUPPORTED_ENVIRONMENT.foundryMaximum}.`,
    );
  }
  if (compareVersions(
    systemVersion,
    SUPPORTED_ENVIRONMENT.systemMinimum,
  ) < 0) {
    reasons.push(
      `hyp3e ${systemVersion} is unsupported; expected ${SUPPORTED_ENVIRONMENT.systemMinimum} or newer.`,
    );
  }

  return { supported: reasons.length === 0, reasons };
}

function getEnvironment(game) {
  return {
    foundryVersion: game.version,
    systemId: game.system?.id,
    systemVersion: game.system?.version,
  };
}

export function registerModuleLifecycle({
  game,
  gameProvider = () => game ?? globalThis.game,
  hooks,
  logger,
  foundryApi = globalThis.foundry?.applications?.api,
  loadTemplates,
  socketlibProvider = () => globalThis.socketlib,
  notifications = globalThis.ui?.notifications,
}) {
  let compatibility;
  let api;
  let transport;
  let socketlibReady = false;
  let foundationInitialized = false;

  hooks.once('socketlib.ready', () => {
    socketlibReady = true;
    if (!foundationInitialized) return;
    if (transport.initialize()) {
      hooks.callAll?.(HOOK_NAMES.socketReady, transport);
    }
  });

  hooks.once('init', () => {
    const currentGame = gameProvider();
    logger.info?.('Initializing');
    compatibility = evaluateCompatibility(getEnvironment(currentGame));
    if (!compatibility.supported) {
      logger.warn?.(
        `Module initialization stopped for an unsupported environment: ${compatibility.reasons.join(' ')}`,
      );
      return;
    }

    if (
      typeof foundryApi?.ApplicationV2 !== 'function'
      || typeof foundryApi?.HandlebarsApplicationMixin !== 'function'
    ) {
      compatibility.supported = false;
      compatibility.reasons.push('Foundry ApplicationV2 APIs are unavailable.');
      logger.warn?.(compatibility.reasons.at(-1));
      return;
    }

    const applications = createFoundationApplications({
      ApplicationV2: foundryApi.ApplicationV2,
      HandlebarsApplicationMixin: foundryApi.HandlebarsApplicationMixin,
      game: currentGame,
      notifications,
    });
    registerSettings({ game: currentGame, menuTypes: applications });
    const templateLoader = loadTemplates
      ?? globalThis.foundry?.applications?.handlebars?.loadTemplates;
    void preloadFoundationTemplates(templateLoader).catch((error) => {
      logger.warn?.('Foundation template preload failed.', error);
    });

    transport ??= createSocketTransport({
      game: currentGame,
      socketlib: socketlibProvider(),
      logger,
    });
    foundationInitialized = true;
    if (socketlibReady && transport.initialize()) {
      hooks.callAll?.(HOOK_NAMES.socketReady, transport);
    }
    api = Object.freeze({
      adapter: hyp3eAdapter,
      applications,
      compatibility,
      npcRolls,
      socket: transport,
    });
    const module = currentGame.modules?.get?.(MODULE_ID);
    if (module) module.api = api;

    hooks.once('ready', () => {
      if (!transport.available) transport.initialize();
      hooks.callAll?.(HOOK_NAMES.ready, api);
      logger.info?.('Ready', getEnvironment(currentGame));
    });
  });

  return () => api;
}
