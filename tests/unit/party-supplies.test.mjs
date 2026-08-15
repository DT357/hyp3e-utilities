import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PARTY_SUPPLY_OPERATIONS,
  createPartySupplyService,
} from '../../module/party/party-supplies.mjs';
import { createPartyStateDefault } from '../../module/party/party-state.mjs';

function createHarness() {
  const definitions = new Map();
  let state = createPartyStateDefault();
  const service = createPartySupplyService({
    store: {
      getState: () => state,
      registerMutation: (operation, definition) => {
        definitions.set(operation, definition);
      },
    },
  });
  return {
    definitions,
    getState: () => state,
    service,
    setState: (nextState) => { state = nextState; },
  };
}

test('supply service returns four independent manual count fields', () => {
  const harness = createHarness();
  const state = createPartyStateDefault();
  state.supplies = {
    torches: '12',
    lanterns: '2',
    oil: '',
    rations: '30',
  };
  harness.setState(state);

  const supplies = harness.service.getSupplies();

  assert.deepEqual(supplies, state.supplies);
  assert.notEqual(supplies, state.supplies);
});

test('supply mutation validates and atomically replaces all four counts', async () => {
  const harness = createHarness();
  const definition = harness.definitions.get(PARTY_SUPPLY_OPERATIONS.set);
  const payload = definition.validatePayload({
    torches: '12',
    lanterns: '',
    oil: '03',
    rations: 20,
  });
  const state = harness.getState();

  await definition.mutate({ payload, state });

  assert.deepEqual(state.supplies, {
    torches: '12',
    lanterns: '',
    oil: '3',
    rations: '20',
  });
  for (const invalid of [
    { torches: '-1', lanterns: '', oil: '', rations: '' },
    { torches: '1.5', lanterns: '', oil: '', rations: '' },
    { torches: 'one', lanterns: '', oil: '', rations: '' },
    { torches: '', lanterns: '', oil: '', rations: '', arrows: '20' },
    { torches: '', lanterns: '', oil: '' },
    { torches: Number.MAX_SAFE_INTEGER + 1, lanterns: '', oil: '', rations: '' },
  ]) {
    assert.throws(() => definition.validatePayload(invalid));
  }
});
