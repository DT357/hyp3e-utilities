import { MODULE_TITLE } from './constants.mjs';

export function createLogger(consoleApi = console) {
  const write = (method, message, ...details) => {
    consoleApi[method]?.(`${MODULE_TITLE} | ${message}`, ...details);
  };

  return Object.freeze({
    debug: (message, ...details) => write('debug', message, ...details),
    info: (message, ...details) => write('info', message, ...details),
    warn: (message, ...details) => write('warn', message, ...details),
    error: (message, ...details) => write('error', message, ...details),
  });
}

export const logger = createLogger();
