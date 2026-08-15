import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PARTY_NOTE_OPERATIONS,
  createPartyNoteService,
} from '../../module/party/party-notes.mjs';
import { createPartyStateDefault } from '../../module/party/party-state.mjs';

function createHarness({ sanitizeHtml = (html) => html } = {}) {
  const definitions = new Map();
  let state = createPartyStateDefault();
  const service = createPartyNoteService({
    sanitizeHtml,
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

test('note service returns independent party and treasure-note values', () => {
  const harness = createHarness();
  const state = createPartyStateDefault();
  state.notes = '<p>Watch the north door.</p>';
  state.treasureNotes = {
    gems: '<p>Three moonstones</p>',
    misc: '<p>Silver idol</p>',
  };
  harness.setState(state);

  const notes = harness.service.getNotes();

  assert.deepEqual(notes, {
    notes: state.notes,
    treasureNotes: state.treasureNotes,
  });
  assert.notEqual(notes.treasureNotes, state.treasureNotes);
});

test('note mutation validates, sanitizes, and atomically replaces all fields', async () => {
  const sanitized = [];
  const harness = createHarness({
    sanitizeHtml: (html) => {
      sanitized.push(html);
      if (html === '<p>reject</p>') throw new Error('Rejected HTML');
      return html.replaceAll(/<script>.*?<\/script>/g, '');
    },
  });
  const definition = harness.definitions.get(PARTY_NOTE_OPERATIONS.set);
  const payload = definition.validatePayload({
    notes: '<p>Camp notes</p><script>alert(1)</script>',
    treasureNotes: {
      gems: '<p>Four sapphires</p>',
      misc: '<p>Ivory comb</p>',
    },
  });
  const state = harness.getState();

  await definition.mutate({ payload, state });

  assert.deepEqual(sanitized, [
    '<p>Camp notes</p><script>alert(1)</script>',
    '<p>Four sapphires</p>',
    '<p>Ivory comb</p>',
  ]);
  assert.deepEqual({
    notes: state.notes,
    treasureNotes: state.treasureNotes,
  }, {
    notes: '<p>Camp notes</p>',
    treasureNotes: {
      gems: '<p>Four sapphires</p>',
      misc: '<p>Ivory comb</p>',
    },
  });

  const beforeRejectedMutation = structuredClone(state);
  const rejectedPayload = definition.validatePayload({
    notes: '<p>Changed notes</p>',
    treasureNotes: {
      gems: '<p>Changed gems</p>',
      misc: '<p>reject</p>',
    },
  });
  await assert.rejects(
    definition.mutate({ payload: rejectedPayload, state }),
    /Rejected HTML/,
  );
  assert.deepEqual(state, beforeRejectedMutation);

  for (const invalid of [
    { notes: '', treasureNotes: { gems: '', misc: '' }, extra: '' },
    { notes: '', treasureNotes: { gems: '' } },
    { notes: '', treasureNotes: { gems: '', misc: '', coins: '' } },
    { notes: 7, treasureNotes: { gems: '', misc: '' } },
    { notes: '', treasureNotes: { gems: [], misc: '' } },
  ]) {
    assert.throws(() => definition.validatePayload(invalid));
  }
});

test('note service requires both a Party Store and HTML sanitizer', () => {
  const store = {
    getState: () => createPartyStateDefault(),
    registerMutation: () => {},
  };

  assert.throws(() => createPartyNoteService({ store }), /sanitizer/i);
  assert.throws(
    () => createPartyNoteService({ sanitizeHtml: (html) => html }),
    /Party Store/,
  );
});
