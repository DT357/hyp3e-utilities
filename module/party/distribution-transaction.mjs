import {
  PARTY_MUTATION_ERROR_CODES,
  PartyMutationError,
} from './party-mutation-protocol.mjs';

export function assertDistributionPreflight({
  actualFingerprint,
  changedError,
  expectedFingerprint,
  expectedRevision,
  staleMessage,
  state,
}) {
  if (expectedRevision !== state?.revision) {
    throw new PartyMutationError(
      PARTY_MUTATION_ERROR_CODES.staleRevision,
      staleMessage,
      { state },
    );
  }
  const currentFingerprint = typeof actualFingerprint === 'function'
    ? actualFingerprint()
    : actualFingerprint;
  if (currentFingerprint !== expectedFingerprint) {
    throw new PartyMutationError(changedError.code, changedError.message);
  }
}

export function createDistributionTransaction({
  auditError,
  label,
  logger = console,
  rollbackError,
  writeError,
} = {}) {
  const compensations = [];

  async function rollback() {
    const failures = [];
    for (const compensate of [...compensations].reverse()) {
      try {
        await compensate();
      }
      catch (error) {
        failures.push(error);
      }
    }
    compensations.length = 0;
    if (failures.length) {
      logger.warn?.(`${label} rollback failed.`, failures);
      throw new PartyMutationError(
        rollbackError.code,
        rollbackError.message,
      );
    }
  }

  async function write(apply, compensate) {
    if (typeof apply !== 'function' || typeof compensate !== 'function') {
      throw new TypeError('Distribution writes require apply and compensation functions.');
    }
    await apply();
    compensations.push(compensate);
  }

  async function runWrites(callback) {
    try {
      return await callback({ write });
    }
    catch (error) {
      await rollback();
      if (error instanceof PartyMutationError) throw error;
      logger.warn?.(`${label} document write failed.`, error);
      throw new PartyMutationError(writeError.code, writeError.message);
    }
  }

  async function runAudit(callback) {
    try {
      return await callback();
    }
    catch (error) {
      logger.warn?.(`${label} audit chat failed.`, error);
      await rollback();
      throw new PartyMutationError(auditError.code, auditError.message);
    }
  }

  return Object.freeze({ runAudit, runWrites });
}
