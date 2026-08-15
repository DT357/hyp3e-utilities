import { assertExactObject } from './party-mutation-protocol.mjs';
import { normalizePartyState } from './party-state.mjs';

export const PARTY_NOTE_OPERATIONS = Object.freeze({
  set: 'party.setNotes',
});

function validateHtml(value, label) {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be an HTML string.`);
  }
  return value;
}

function validateNotePayload(payload) {
  assertExactObject(payload, {
    allowedKeys: ['notes', 'treasureNotes'],
    requiredKeys: ['notes', 'treasureNotes'],
    label: 'Party notes payload',
  });
  assertExactObject(payload.treasureNotes, {
    allowedKeys: ['gems', 'misc'],
    requiredKeys: ['gems', 'misc'],
    label: 'Party treasure notes payload',
  });
  return {
    notes: validateHtml(payload.notes, 'Party notes'),
    treasureNotes: {
      gems: validateHtml(payload.treasureNotes.gems, 'Party gem notes'),
      misc: validateHtml(payload.treasureNotes.misc, 'Party miscellaneous treasure notes'),
    },
  };
}

export function createPartyNoteService({ sanitizeHtml, store } = {}) {
  if (
    typeof store?.getState !== 'function'
    || typeof store?.registerMutation !== 'function'
  ) {
    throw new TypeError('Party note service requires a Party Store.');
  }
  if (typeof sanitizeHtml !== 'function') {
    throw new TypeError('Party note service requires an HTML sanitizer.');
  }

  store.registerMutation(PARTY_NOTE_OPERATIONS.set, {
    validatePayload: validateNotePayload,
    async mutate({ payload, state }) {
      const notes = sanitizeHtml(payload.notes);
      const treasureNotes = {
        gems: sanitizeHtml(payload.treasureNotes.gems),
        misc: sanitizeHtml(payload.treasureNotes.misc),
      };
      state.notes = notes;
      state.treasureNotes = treasureNotes;
    },
  });

  return Object.freeze({
    getNotes(state = store.getState()) {
      const normalized = normalizePartyState(state);
      return {
        notes: normalized.notes,
        treasureNotes: { ...normalized.treasureNotes },
      };
    },
  });
}
