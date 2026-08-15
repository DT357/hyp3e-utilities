import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PARTY_STATE_SCHEMA_VERSION,
  advancePartyStateRevision,
  createPartyStateDefault,
  migratePartyState,
  normalizePartyState,
} from '../../module/party/party-state.mjs';

test('party state defaults round-trip as independent canonical values', () => {
  const first = createPartyStateDefault();
  const second = createPartyStateDefault();
  first.memberActorUuids.push('Actor.changed');

  assert.equal(PARTY_STATE_SCHEMA_VERSION, 1);
  assert.deepEqual(normalizePartyState(second), second);
  assert.deepEqual(second.memberActorUuids, []);
  assert.notEqual(first.memberActorUuids, second.memberActorUuids);
  assert.notEqual(first.marchingOrder.front, second.marchingOrder.front);
});

test('normalization fills missing fields and enforces party invariants', () => {
  const input = {
    schemaVersion: 1,
    revision: '4',
    treasuryActorUuid: ' Actor.treasury ',
    memberActorUuids: [
      'Actor.hero',
      'Actor.hero',
      'Scene.scene.Token.synthetic',
      '',
    ],
    followerActorUuids: [
      'Actor.hero',
      'Actor.retainer',
      'Actor.guard',
      'Actor.retainer',
    ],
    followerWages: {
      'Actor.retainer': '3.9',
      'Actor.hero': 99,
      'Actor.missing': 8,
      'Actor.guard': -2,
    },
    shares: {
      'Actor.hero': 1.12,
      'Actor.retainer': '0.63',
      'Actor.guard': -2,
      'Actor.missing': 4,
    },
    marchingOrder: {
      front: {
        actorUuids: ['Actor.hero', 'Actor.retainer', 'Actor.hero'],
        notes: 'Front note',
      },
      middle: {
        actorUuids: ['Actor.retainer', 'Actor.guard', 'Actor.missing'],
      },
    },
    supplies: { torches: 3, oil: null },
    treasureNotes: { gems: 'Three rubies' },
  };
  const original = structuredClone(input);

  const state = normalizePartyState(input);

  assert.deepEqual(input, original);
  assert.deepEqual(state, {
    schemaVersion: 1,
    revision: 4,
    treasuryActorUuid: 'Actor.treasury',
    memberActorUuids: ['Actor.hero'],
    followerActorUuids: ['Actor.retainer', 'Actor.guard'],
    followerWages: {
      'Actor.retainer': 3,
      'Actor.guard': 0,
    },
    shares: {
      'Actor.hero': 1,
      'Actor.retainer': 0.75,
      'Actor.guard': 0,
    },
    marchingOrder: {
      front: {
        actorUuids: ['Actor.hero', 'Actor.retainer'],
        notes: 'Front note',
      },
      middle: { actorUuids: ['Actor.guard'], notes: '' },
      rear: { actorUuids: [], notes: '' },
    },
    supplies: { torches: '3', lanterns: '', oil: '', rations: '' },
    treasureNotes: { gems: 'Three rubies', misc: '' },
    notes: '',
  });
});

test('state schemas reject invalid containers, unknown fields, and future versions', () => {
  for (const value of [null, [], 'state']) {
    assert.throws(() => normalizePartyState(value), /plain object/i);
  }
  assert.throws(
    () => normalizePartyState({ schemaVersion: 1, unexpected: true }),
    /unknown field "unexpected"/i,
  );
  assert.throws(
    () => normalizePartyState({
      schemaVersion: 1,
      marchingOrder: {
        front: { actorUuids: [], notes: '', unexpected: true },
      },
    }),
    /unknown field "unexpected"/i,
  );
  assert.throws(
    () => normalizePartyState({
      schemaVersion: 1,
      supplies: { torches: '', arrows: '20' },
    }),
    /unknown field "arrows"/i,
  );
  assert.throws(
    () => normalizePartyState({ schemaVersion: 2 }),
    /newer.*schema/i,
  );
});

test('version zero state migrates deterministically without changing revision', () => {
  const versionZero = {
    schemaVersion: 0,
    treasuryActorUuid: 'Actor.treasury',
    memberActorUuids: ['Actor.hero'],
    notes: 'Legacy notes',
  };

  const migrated = migratePartyState(versionZero);
  const normalized = normalizePartyState(versionZero);

  assert.deepEqual(migrated, {
    ...versionZero,
    schemaVersion: 1,
    revision: 0,
  });
  assert.equal(normalized.schemaVersion, 1);
  assert.equal(normalized.revision, 0);
  assert.deepEqual(normalized.memberActorUuids, ['Actor.hero']);
  assert.equal(normalized.notes, 'Legacy notes');
  assert.throws(
    () => migratePartyState({ schemaVersion: -1 }),
    /schemaVersion/i,
  );
});

test('revision advancement is monotonic, canonical, and does not mutate input', () => {
  const current = {
    ...createPartyStateDefault(),
    revision: 8,
    memberActorUuids: ['Actor.hero', 'Actor.hero'],
  };

  const next = advancePartyStateRevision(current);

  assert.equal(current.revision, 8);
  assert.equal(next.revision, 9);
  assert.deepEqual(next.memberActorUuids, ['Actor.hero']);
  assert.throws(
    () => advancePartyStateRevision({
      ...current,
      revision: Number.MAX_SAFE_INTEGER,
    }),
    /revision/i,
  );
});

test('supply normalization keeps blanks and canonical non-negative whole counts', () => {
  const state = normalizePartyState({
    ...createPartyStateDefault(),
    supplies: {
      torches: '003',
      lanterns: '-1',
      oil: 'not a number',
      rations: 4.9,
    },
  });

  assert.deepEqual(state.supplies, {
    torches: '3',
    lanterns: '',
    oil: '',
    rations: '4',
  });
});
