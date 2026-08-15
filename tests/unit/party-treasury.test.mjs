import assert from 'node:assert/strict';
import test from 'node:test';

import { hyp3eAdapter } from '../../module/adapters/hyp3e-adapter.mjs';
import { createPartyStateDefault } from '../../module/party/party-state.mjs';
import {
  PARTY_TREASURY_ERROR_CODES,
  PARTY_TREASURY_OPERATIONS,
  createPartyTreasuryService,
} from '../../module/party/party-treasury.mjs';

function createHarness({ state: suppliedState } = {}) {
  let state = suppliedState ?? createPartyStateDefault();
  let actorSequence = 0;
  let folderSequence = 0;
  let requester = { id: 'gm', isGM: true, role: 4 };
  let activeGmId = 'gm';
  const actorCreates = [];
  const actors = [];
  const definitions = new Map();
  const protocolDefinitions = new Map();
  const folderCreates = [];
  const folders = [];
  actors.get = (id) => actors.find((actor) => actor.id === id);
  folders.find = Array.prototype.find.bind(folders);
  const game = {
    actors,
    folders,
    user: requester,
    users: {
      get activeGM() {
        return activeGmId ? { id: activeGmId } : null;
      },
    },
  };

  function addActor({
    flags = { 'hyp3e-utilities': { partyTreasury: true } },
    folder = null,
    id = `treasury-${++actorSequence}`,
    name = 'Imported Treasury',
    ownership = {},
    items = [],
    system = {},
    type = 'treasure',
  } = {}) {
    items.get = (id) => items.find((item) => item.id === id);
    const actor = {
      documentName: 'Actor',
      flags,
      folder,
      id,
      isToken: false,
      items,
      name,
      ownership,
      system,
      type,
      uuid: `Actor.${id}`,
      getFlag(namespace, key) {
        return this.flags?.[namespace]?.[key];
      },
    };
    actors.push(actor);
    return actor;
  }

  const ActorClass = {
    async create(data) {
      actorCreates.push(structuredClone(data));
      return addActor({
        flags: data.flags,
        folder: data.folder ?? null,
        name: data.name,
        ownership: data.ownership,
        type: data.type,
      });
    },
  };
  const FolderClass = {
    async create(data) {
      folderCreates.push(structuredClone(data));
      const folder = {
        folder: data.folder ?? null,
        id: `folder-${++folderSequence}`,
        name: data.name,
        type: data.type,
      };
      folders.push(folder);
      return folder;
    },
  };
  const store = {
    getState: () => state,
    registerMutation: (operation, definition) => {
      definitions.set(operation, definition);
    },
  };
  const mutations = {
    registerOperation(operation, definition) {
      protocolDefinitions.set(operation, definition);
    },
    async request(operation, envelope) {
      const protocolDefinition = protocolDefinitions.get(operation);
      const definition = protocolDefinition ?? definitions.get(operation);
      try {
        const payload = definition.validatePayload(envelope.payload);
        if (protocolDefinition) {
          const value = await definition.execute({
            expectedRevision: envelope.expectedRevision,
            payload,
            requester,
            requestId: envelope.requestId,
          });
          return { ok: true, value };
        }
        const draft = structuredClone(state);
        await definition.mutate({ payload, requester, state: draft });
        state = { ...draft, revision: state.revision + 1 };
        return { ok: true, value: { state } };
      }
      catch (error) {
        return {
          error: { code: error.code ?? 'executionFailed', message: error.message },
          ok: false,
        };
      }
    },
  };
  const service = createPartyTreasuryService({
    ActorClass,
    adapter: hyp3eAdapter,
    FolderClass,
    game,
    mutations,
    ownershipLevels: { NONE: 0, OWNER: 3 },
    requestIdProvider: () => 'treasury-request',
    store,
  });

  return {
    actorCreates,
    actors,
    addActor,
    definitions,
    folderCreates,
    folders,
    game,
    getState: () => state,
    protocolDefinitions,
    service,
    setActiveGmId: (id) => { activeGmId = id; },
    setRequester(nextRequester) {
      requester = nextRequester;
      game.user = nextRequester;
    },
  };
}

test('concurrent treasury initialization creates, folders, flags, owns, and binds once', async () => {
  const harness = createHarness();

  const initializationResults = await Promise.all([
    harness.service.initialize(),
    harness.service.initialize(),
  ]);
  const initialized = initializationResults.find((entry) => entry.created);
  const created = harness.actors[0];

  assert.equal(initializationResults.every((entry) => entry.ok), true);
  assert.equal(
    initializationResults.filter((entry) => entry.created).length,
    1,
  );
  assert.equal(initialized.ok, true);
  assert.equal(initialized.created, true);
  assert.equal(harness.actorCreates.length, 1);
  assert.deepEqual(harness.folderCreates, [{
    folder: null,
    name: 'Hyp3e Utilities',
    type: 'Actor',
  }]);
  assert.equal(created.name, 'Party Treasury');
  assert.equal(created.type, 'treasure');
  assert.equal(created.folder, harness.folders[0].id);
  assert.deepEqual(created.flags, {
    'hyp3e-utilities': { partyTreasury: true },
  });
  assert.deepEqual(created.ownership, { default: 0, gm: 3 });
  assert.equal(harness.getState().treasuryActorUuid, created.uuid);

  created.name = 'Renamed After Export and Import';
  const status = harness.service.getStatus();
  assert.equal(status.kind, 'ready');
  assert.equal(status.actor, created);
  assert.equal(status.hasDuplicates, false);

  const repeated = await harness.service.initialize();
  assert.equal(repeated.ok, true);
  assert.equal(repeated.created, false);
  assert.equal(harness.actorCreates.length, 1);
  assert.equal(harness.folderCreates.length, 1);
});

test('treasury recovery rebinds one imported flag but requires recreate after deletion', async () => {
  const state = createPartyStateDefault();
  state.treasuryActorUuid = 'Actor.deleted-treasury';
  const harness = createHarness({ state });
  const imported = harness.addActor({
    id: 'imported-treasury',
    name: 'Completely Different Imported Name',
  });

  const rebound = await harness.service.initialize();

  assert.equal(rebound.ok, true);
  assert.equal(rebound.rebound, true);
  assert.equal(harness.getState().treasuryActorUuid, imported.uuid);
  assert.equal(harness.actorCreates.length, 0);

  harness.actors.splice(harness.actors.indexOf(imported), 1);
  const missing = await harness.service.initialize();
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, PARTY_TREASURY_ERROR_CODES.missingTreasury);
  assert.equal(harness.actorCreates.length, 0);
  assert.equal(harness.service.getStatus().kind, 'missing');

  const recreated = await harness.service.recreateTreasury();
  assert.equal(recreated.ok, true);
  assert.equal(recreated.created, true);
  assert.equal(harness.actorCreates.length, 1);
  assert.equal(
    harness.getState().treasuryActorUuid,
    harness.actors[0].uuid,
  );
});

test('duplicate flagged treasuries require explicit GM selection and remain intact', async () => {
  const state = createPartyStateDefault();
  state.treasuryActorUuid = 'Actor.missing';
  const harness = createHarness({ state });
  const first = harness.addActor({ id: 'first' });
  const second = harness.addActor({ id: 'second' });
  const beforeRevision = harness.getState().revision;

  const ambiguous = await harness.service.initialize();

  assert.equal(ambiguous.ok, false);
  assert.equal(
    ambiguous.error.code,
    PARTY_TREASURY_ERROR_CODES.multipleTreasuries,
  );
  assert.equal(harness.getState().revision, beforeRevision);
  assert.equal(harness.service.getStatus().kind, 'ambiguous');
  assert.deepEqual(
    harness.service.getStatus().candidates.map((actor) => actor.uuid),
    [first.uuid, second.uuid],
  );

  const selected = await harness.service.bindTreasury(second.uuid);
  assert.equal(selected.ok, true);
  assert.equal(harness.getState().treasuryActorUuid, second.uuid);
  assert.equal(harness.actors.length, 2);
  assert.equal(harness.service.getStatus().hasDuplicates, true);
});

test('treasury lifecycle rejects non-GM binding, invalid Actors, and inactive creation', async () => {
  const harness = createHarness();
  const unflagged = harness.addActor({
    flags: {},
    id: 'unflagged',
  });
  const bind = harness.definitions.get(PARTY_TREASURY_OPERATIONS.bind);

  assert.throws(
    () => bind.validatePayload({ actorUuid: unflagged.uuid, extra: true }),
  );
  await assert.rejects(
    bind.mutate({
      payload: { actorUuid: unflagged.uuid },
      requester: { id: 'gm', isGM: true },
      state: createPartyStateDefault(),
    }),
    (error) => error.code === PARTY_TREASURY_ERROR_CODES.invalidTreasury,
  );
  await assert.rejects(
    bind.mutate({
      payload: { actorUuid: unflagged.uuid },
      requester: { id: 'player', isGM: false },
      state: createPartyStateDefault(),
    }),
    (error) => error.code === PARTY_TREASURY_ERROR_CODES.gmRequired,
  );

  harness.actors.splice(0);
  harness.setRequester({ id: 'assistant', isGM: true, role: 3 });
  harness.setActiveGmId('different-gm');
  const inactive = await harness.service.recreateTreasury();
  assert.equal(inactive.ok, false);
  assert.equal(
    inactive.error.code,
    PARTY_TREASURY_ERROR_CODES.activeGmRequired,
  );
  assert.equal(harness.actorCreates.length, 0);

  harness.setRequester({ id: 'player', isGM: false, role: 1 });
  harness.setActiveGmId('gm');
  const player = await harness.service.recreateTreasury();
  assert.equal(player.ok, false);
  assert.equal(player.error.code, PARTY_TREASURY_ERROR_CODES.gmRequired);
  assert.equal(harness.actorCreates.length, 0);
});

test('treasury snapshot returns every coin and preserves supported and unknown items', async () => {
  const state = createPartyStateDefault();
  state.revision = 8;
  state.treasuryActorUuid = 'Actor.snapshot';
  const harness = createHarness({ state });
  const weapon = {
    id: 'weapon',
    img: '',
    name: 'Silver Spear',
    system: { quantity: { bundle: 2, max: 9, value: 3 } },
    type: 'weapon',
    uuid: 'Actor.snapshot.Item.weapon',
  };
  const unknown = {
    id: 'spell',
    img: 'icons/svg/book.svg',
    name: 'Unknown Embedded Type',
    system: { quantity: { value: 12 } },
    type: 'spell',
    uuid: 'Actor.snapshot.Item.spell',
  };
  harness.addActor({
    id: 'snapshot',
    items: [weapon, unknown],
    system: {
      money: {
        cp: { value: '1' },
        sp: { value: '2' },
        ep: { value: '3' },
        gp: { value: '4' },
        pp: { value: '5' },
      },
    },
  });

  const response = await harness.service.requestSnapshot();

  assert.equal(response.ok, true);
  assert.deepEqual(response.value, {
    actorUuid: 'Actor.snapshot',
    coins: { cp: 1, sp: 2, ep: 3, gp: 4, pp: 5 },
    items: [
      {
        category: 'weapon',
        id: 'weapon',
        img: 'icons/svg/item-bag.svg',
        name: 'Silver Spear',
        quantity: { bundle: 2, max: 9, value: 3 },
        supported: true,
        type: 'weapon',
        uuid: 'Actor.snapshot.Item.weapon',
      },
      {
        category: null,
        id: 'spell',
        img: 'icons/svg/book.svg',
        name: 'Unknown Embedded Type',
        quantity: null,
        supported: false,
        type: 'spell',
        uuid: 'Actor.snapshot.Item.spell',
      },
    ],
    kind: 'ready',
    name: 'Imported Treasury',
    ready: true,
    revision: 8,
  });
});

test('treasury snapshot distinguishes empty inventory, missing binding, and stale state', async () => {
  const state = createPartyStateDefault();
  state.revision = 3;
  state.treasuryActorUuid = 'Actor.empty';
  const harness = createHarness({ state });
  harness.addActor({ id: 'empty', items: [] });

  const empty = await harness.service.requestSnapshot();
  assert.equal(empty.ok, true);
  assert.deepEqual(empty.value.items, []);
  assert.equal(empty.value.ready, true);

  harness.actors.splice(0);
  const missing = await harness.service.requestSnapshot();
  assert.equal(missing.ok, true);
  assert.deepEqual(missing.value, {
    actorUuid: '',
    coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    items: [],
    kind: 'missing',
    name: '',
    ready: false,
    revision: 3,
  });

  const snapshotOperation = harness.protocolDefinitions.get(
    PARTY_TREASURY_OPERATIONS.snapshot,
  );
  assert.throws(
    () => snapshotOperation.execute({ expectedRevision: 2 }),
    (error) => error.code === 'staleRevision'
      && error.details.state.revision === 3,
  );
});
