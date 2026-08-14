import { registerModuleLifecycle } from './core/bootstrap.mjs';
import { logger } from './core/logger.mjs';

registerModuleLifecycle({
  gameProvider: () => globalThis.game,
  hooks: Hooks,
  logger,
});
