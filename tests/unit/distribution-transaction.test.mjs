import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertDistributionPreflight,
  createDistributionTransaction,
} from '../../module/party/distribution-transaction.mjs';
import { PartyMutationError } from '../../module/party/party-mutation-protocol.mjs';

function createTransaction(warnings = []) {
  return createDistributionTransaction({
    auditError: {
      code: 'auditFailed',
      message: 'Audit failed; writes restored.',
    },
    label: 'Test distribution',
    logger: { warn: (...args) => warnings.push(args) },
    rollbackError: {
      code: 'rollbackFailed',
      message: 'Rollback failed.',
    },
    writeError: {
      code: 'writeFailed',
      message: 'Write failed; prior writes restored.',
    },
  });
}

test('distribution preflight rejects stale state and changed fingerprints', () => {
  assert.throws(
    () => assertDistributionPreflight({
      actualFingerprint: 'same',
      changedError: { code: 'changed', message: 'Changed.' },
      expectedFingerprint: 'same',
      expectedRevision: 4,
      staleMessage: 'Stale.',
      state: { revision: 5 },
    }),
    (error) => error.code === 'staleRevision' && error.details.state.revision === 5,
  );
  assert.throws(
    () => assertDistributionPreflight({
      actualFingerprint: 'new',
      changedError: { code: 'changed', message: 'Changed.' },
      expectedFingerprint: 'old',
      expectedRevision: 5,
      staleMessage: 'Stale.',
      state: { revision: 5 },
    }),
    (error) => error.code === 'changed',
  );
});

test('distribution journal compensates successful writes in reverse order', async () => {
  const events = [];
  const transaction = createTransaction();

  await assert.rejects(
    transaction.runWrites(async ({ write }) => {
      await write(
        async () => events.push('write-one'),
        async () => events.push('restore-one'),
      );
      await write(
        async () => events.push('write-two'),
        async () => events.push('restore-two'),
      );
      throw new Error('third boundary failed');
    }),
    (error) => error.code === 'writeFailed',
  );
  assert.deepEqual(events, [
    'write-one', 'write-two', 'restore-two', 'restore-one',
  ]);
});

test('distribution journal preserves domain errors after compensation', async () => {
  const events = [];
  const transaction = createTransaction();
  await assert.rejects(
    transaction.runWrites(async ({ write }) => {
      await write(async () => events.push('write'), async () => events.push('restore'));
      throw new PartyMutationError('invalidActor', 'Actor changed.');
    }),
    (error) => error.code === 'invalidActor',
  );
  assert.deepEqual(events, ['write', 'restore']);
});

test('distribution audit failure compensates and reports rollback failure distinctly', async () => {
  const warnings = [];
  const transaction = createTransaction(warnings);
  await transaction.runWrites(async ({ write }) => {
    await write(async () => {}, async () => {});
  });
  await assert.rejects(
    transaction.runAudit(async () => { throw new Error('chat failed'); }),
    (error) => error.code === 'auditFailed',
  );
  assert.equal(warnings.length, 1);

  const rollbackFailure = createTransaction();
  await rollbackFailure.runWrites(async ({ write }) => {
    await write(async () => {}, async () => { throw new Error('restore failed'); });
  });
  await assert.rejects(
    rollbackFailure.runAudit(async () => { throw new Error('chat failed'); }),
    (error) => error.code === 'rollbackFailed',
  );
});

test('distribution rollback attempts every compensation after one fails', async () => {
  const events = [];
  const transaction = createTransaction();
  await transaction.runWrites(async ({ write }) => {
    await write(async () => {}, async () => events.push('restore-one'));
    await write(async () => {}, async () => {
      events.push('restore-two');
      throw new Error('restore two failed');
    });
  });

  await assert.rejects(
    transaction.runAudit(async () => { throw new Error('chat failed'); }),
    (error) => error.code === 'rollbackFailed',
  );
  assert.deepEqual(events, ['restore-two', 'restore-one']);
});
