export const PARTY_STATE_SCHEMA_VERSION = 1;

const TOP_LEVEL_KEYS = Object.freeze([
  'schemaVersion',
  'revision',
  'treasuryActorUuid',
  'memberActorUuids',
  'followerActorUuids',
  'followerWages',
  'shares',
  'marchingOrder',
  'supplies',
  'treasureNotes',
  'notes',
]);
const MARCHING_RANKS = Object.freeze(['front', 'middle', 'rear']);
const SUPPLY_KEYS = Object.freeze(['torches', 'lanterns', 'oil', 'rations']);
const TREASURE_NOTE_KEYS = Object.freeze(['gems', 'misc']);
const WORLD_ACTOR_UUID_PATTERN = /^Actor\.[^.\s]+$/;

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertKnownObject(value, allowedKeys, label) {
  if (!isPlainObject(value)) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  const allowed = new Set(allowedKeys);
  const unknownKey = Object.keys(value).find((key) => !allowed.has(key));
  if (unknownKey) {
    throw new TypeError(`${label} has unknown field "${unknownKey}".`);
  }
  return value;
}

function cloneJsonValue(value) {
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, cloneJsonValue(entry)]),
  );
}

function normalizeRevision(value) {
  const revision = Number(value);
  return Number.isInteger(revision) && revision >= 0 ? revision : 0;
}

function normalizeWorldActorUuid(value) {
  if (typeof value !== 'string') return '';
  const uuid = value.trim();
  return WORLD_ACTOR_UUID_PATTERN.test(uuid) ? uuid : '';
}

function normalizeUuidArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeWorldActorUuid).filter(Boolean))];
}

function normalizeWage(value) {
  const wage = Number(value);
  return Number.isFinite(wage) ? Math.max(0, Math.trunc(wage)) : 0;
}

function normalizeShare(value) {
  const share = Number(value);
  if (!Number.isFinite(share)) return 0;
  return Math.max(0, Math.round(share * 4) / 4);
}

function normalizeDynamicMap(value, actorUuids, normalizeValue) {
  if (!isPlainObject(value)) return {};
  return Object.fromEntries(actorUuids
    .filter((actorUuid) => Object.hasOwn(value, actorUuid))
    .map((actorUuid) => [actorUuid, normalizeValue(value[actorUuid])]));
}

function normalizeText(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeSupply(value) {
  if (typeof value === 'string') return value;
  if (!Number.isFinite(value)) return '';
  return String(Math.max(0, Math.trunc(value)));
}

function normalizeSupplies(value) {
  if (value === undefined) value = {};
  assertKnownObject(value, SUPPLY_KEYS, 'Party supplies');
  return Object.fromEntries(
    SUPPLY_KEYS.map((key) => [key, normalizeSupply(value[key])]),
  );
}

function normalizeTreasureNotes(value) {
  if (value === undefined) value = {};
  assertKnownObject(value, TREASURE_NOTE_KEYS, 'Party treasure notes');
  return Object.fromEntries(
    TREASURE_NOTE_KEYS.map((key) => [key, normalizeText(value[key])]),
  );
}

function normalizeMarchingOrder(value, trackedActorUuids) {
  if (value === undefined) value = {};
  assertKnownObject(value, MARCHING_RANKS, 'Party marching order');
  const tracked = new Set(trackedActorUuids);
  const assigned = new Set();

  return Object.fromEntries(MARCHING_RANKS.map((rank) => {
    const rankValue = value[rank] ?? {};
    assertKnownObject(
      rankValue,
      ['actorUuids', 'notes'],
      `Party marching-order rank "${rank}"`,
    );
    const actorUuids = normalizeUuidArray(rankValue.actorUuids).filter(
      (actorUuid) => {
        if (!tracked.has(actorUuid) || assigned.has(actorUuid)) return false;
        assigned.add(actorUuid);
        return true;
      },
    );
    return [rank, {
      actorUuids,
      notes: normalizeText(rankValue.notes),
    }];
  }));
}

export function createPartyStateDefault() {
  return {
    schemaVersion: PARTY_STATE_SCHEMA_VERSION,
    revision: 0,
    treasuryActorUuid: '',
    memberActorUuids: [],
    followerActorUuids: [],
    followerWages: {},
    shares: {},
    marchingOrder: {
      front: { actorUuids: [], notes: '' },
      middle: { actorUuids: [], notes: '' },
      rear: { actorUuids: [], notes: '' },
    },
    supplies: { torches: '', lanterns: '', oil: '', rations: '' },
    treasureNotes: { gems: '', misc: '' },
    notes: '',
  };
}

export function migratePartyState(value) {
  assertKnownObject(value, TOP_LEVEL_KEYS, 'Party state');
  const source = cloneJsonValue(value);
  const version = source.schemaVersion ?? PARTY_STATE_SCHEMA_VERSION;
  if (!Number.isInteger(version) || version < 0) {
    throw new TypeError('Party state schemaVersion must be a non-negative integer.');
  }
  if (version > PARTY_STATE_SCHEMA_VERSION) {
    throw new TypeError(
      `Party state uses newer schema version ${version}; this module supports ${PARTY_STATE_SCHEMA_VERSION}.`,
    );
  }
  if (version === 0) {
    return {
      ...source,
      schemaVersion: 1,
      revision: normalizeRevision(source.revision),
    };
  }
  return source;
}

export function normalizePartyState(value) {
  const source = migratePartyState(value);
  const memberActorUuids = normalizeUuidArray(source.memberActorUuids);
  const memberSet = new Set(memberActorUuids);
  const followerActorUuids = normalizeUuidArray(
    source.followerActorUuids,
  ).filter((actorUuid) => !memberSet.has(actorUuid));
  const trackedActorUuids = [...memberActorUuids, ...followerActorUuids];

  return {
    schemaVersion: PARTY_STATE_SCHEMA_VERSION,
    revision: normalizeRevision(source.revision),
    treasuryActorUuid: normalizeWorldActorUuid(source.treasuryActorUuid),
    memberActorUuids,
    followerActorUuids,
    followerWages: normalizeDynamicMap(
      source.followerWages,
      followerActorUuids,
      normalizeWage,
    ),
    shares: normalizeDynamicMap(
      source.shares,
      trackedActorUuids,
      normalizeShare,
    ),
    marchingOrder: normalizeMarchingOrder(
      source.marchingOrder,
      trackedActorUuids,
    ),
    supplies: normalizeSupplies(source.supplies),
    treasureNotes: normalizeTreasureNotes(source.treasureNotes),
    notes: normalizeText(source.notes),
  };
}

export function advancePartyStateRevision(value) {
  const state = normalizePartyState(value);
  if (state.revision >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Party state revision cannot be advanced safely.');
  }
  return {
    ...state,
    revision: state.revision + 1,
  };
}
