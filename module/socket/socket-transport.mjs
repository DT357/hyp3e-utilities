import { MODULE_ID } from '../core/constants.mjs';

export class SocketTransportUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SocketTransportUnavailableError';
  }
}

export function createSocketTransport({
  game,
  socketlib,
  logger = console,
}) {
  let socket = null;
  const operations = new Set(['ping']);

  return {
    get available() {
      return socket !== null;
    },

    initialize() {
      if (socket) return true;
      const dependency = game.modules?.get?.('socketlib');
      if (!dependency?.active || typeof socketlib?.registerModule !== 'function') {
        logger.warn?.(
          'SocketLib is missing or inactive; authenticated module operations are unavailable.',
        );
        return false;
      }

      socket = socketlib.registerModule(MODULE_ID);
      socket.register('ping', function ping() {
        return {
          requesterUserId: this.socketdata.userId,
          executingUserId: game.user.id,
          executingUserIsGM: game.user.isGM,
        };
      });
      return true;
    },

    async executeAsActiveGM(operationName, ...args) {
      if (!operations.has(operationName)) {
        throw new TypeError(
          `Socket operation "${operationName}" is not registered.`,
        );
      }
      if (!socket) {
        throw new SocketTransportUnavailableError(
          'SocketLib transport has not initialized.',
        );
      }
      if (!game.users?.activeGM) {
        throw new SocketTransportUnavailableError(
          'No active GM is available for this operation.',
        );
      }
      return socket.executeAsGM(operationName, ...args);
    },
  };
}
