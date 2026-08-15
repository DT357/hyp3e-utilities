import { assertExactObject } from './party-mutation-protocol.mjs';
import { normalizePartyState } from './party-state.mjs';

export const PARTY_SUPPLY_KEYS = Object.freeze([
  'torches',
  'lanterns',
  'oil',
  'rations',
]);

export const PARTY_SUPPLY_OPERATIONS = Object.freeze({
  set: 'party.setSupplies',
});

function validateCount(value, label) {
  if (value === '') return '';
  if (
    typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
  ) return String(value);
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new TypeError(`${label} must be blank or a non-negative whole number.`);
  }
  const count = Number(value);
  if (!Number.isSafeInteger(count)) {
    throw new TypeError(`${label} exceeds the supported whole-number range.`);
  }
  return String(count);
}

function validateSupplyPayload(payload) {
  assertExactObject(payload, {
    allowedKeys: PARTY_SUPPLY_KEYS,
    requiredKeys: PARTY_SUPPLY_KEYS,
    label: 'Party supplies payload',
  });
  return Object.fromEntries(PARTY_SUPPLY_KEYS.map((key) => [
    key,
    validateCount(payload[key], `Party supply "${key}"`),
  ]));
}

export function createPartySupplyService({ store } = {}) {
  if (
    typeof store?.getState !== 'function'
    || typeof store?.registerMutation !== 'function'
  ) {
    throw new TypeError('Party supply service requires a Party Store.');
  }

  store.registerMutation(PARTY_SUPPLY_OPERATIONS.set, {
    validatePayload: validateSupplyPayload,
    async mutate({ payload, state }) {
      state.supplies = { ...payload };
    },
  });

  return Object.freeze({
    getSupplies(state = store.getState()) {
      return { ...normalizePartyState(state).supplies };
    },
  });
}
