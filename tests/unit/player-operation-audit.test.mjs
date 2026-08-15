import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

import { PLAYER_OPERATION_AUDIT } from '../fixtures/player-operation-audit.mjs';

const PARTY_MODULE_DIRECTORY = new URL('../../module/party/', import.meta.url);
const OPERATION_LITERAL_PATTERN = /['"](party\.[A-Za-z][A-Za-z0-9]*)['"]/g;

async function findDeclaredPlayerOperations() {
  const filenames = (await readdir(PARTY_MODULE_DIRECTORY))
    .filter((filename) => filename.endsWith('.mjs'));
  const operations = new Set();
  for (const filename of filenames) {
    const source = await readFile(new URL(filename, PARTY_MODULE_DIRECTORY), 'utf8');
    for (const match of source.matchAll(OPERATION_LITERAL_PATTERN)) {
      operations.add(match[1]);
    }
  }
  return [...operations].sort();
}

test('every declared player operation has an authorization-audit entry', async () => {
  const auditedOperations = PLAYER_OPERATION_AUDIT
    .map(({ operation }) => operation)
    .sort();

  assert.equal(new Set(auditedOperations).size, auditedOperations.length);
  assert.deepEqual(await findDeclaredPlayerOperations(), auditedOperations);
});

test('audit entries use only reviewed authorization policies', () => {
  const policies = new Set(['gm', 'partyEditor', 'partyEditor+ownedActor']);
  for (const entry of PLAYER_OPERATION_AUDIT) {
    assert.equal(policies.has(entry.authorization), true, entry.operation);
    assert.equal(Object.isFrozen(entry), true, entry.operation);
  }
});
