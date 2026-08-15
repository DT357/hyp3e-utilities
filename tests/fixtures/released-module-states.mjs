const EMPTY_MARCHING_ORDER = {
  front: { actorUuids: [], notes: '' },
  middle: { actorUuids: [], notes: '' },
  rear: { actorUuids: [], notes: '' },
};

const EMPTY_SUPPLIES = {
  torches: '', lanterns: '', oil: '', rations: '',
};

const EMPTY_TREASURE_NOTES = { gems: '', misc: '' };

function completeState(overrides = {}) {
  return {
    schemaVersion: 1,
    revision: 0,
    treasuryActorUuid: '',
    memberActorUuids: [],
    followerActorUuids: [],
    followerWages: {},
    shares: {},
    marchingOrder: structuredClone(EMPTY_MARCHING_ORDER),
    supplies: { ...EMPTY_SUPPLIES },
    treasureNotes: { ...EMPTY_TREASURE_NOTES },
    notes: '',
    ...overrides,
  };
}

function treasury(id, name) {
  return {
    flags: { 'hyp3e-utilities': { partyTreasury: true } },
    id,
    name,
    type: 'treasure',
  };
}

const version010Expected = completeState();

const version020State = completeState({
  revision: 17,
  memberActorUuids: ['Actor.hero'],
  followerActorUuids: ['Actor.retainer'],
  followerWages: { 'Actor.retainer': 3 },
  shares: { 'Actor.hero': 1, 'Actor.retainer': 0.5 },
  marchingOrder: {
    front: { actorUuids: ['Actor.hero'], notes: 'Lead' },
    middle: { actorUuids: ['Actor.retainer'], notes: '' },
    rear: { actorUuids: [], notes: '' },
  },
});

const version030State = completeState({
  revision: 42,
  memberActorUuids: ['Actor.hero'],
  followerActorUuids: ['Actor.retainer'],
  followerWages: { 'Actor.retainer': 4 },
  shares: { 'Actor.hero': 1, 'Actor.retainer': 0.5 },
  supplies: { torches: '6', lanterns: '1', oil: '2', rations: '9' },
  treasureNotes: { gems: '<p>Two gems</p>', misc: '' },
  notes: '<p>Meet at dawn.</p>',
});

const version040State = completeState({
  revision: 73,
  treasuryActorUuid: 'Actor.pre-import-id',
  memberActorUuids: ['Actor.hero'],
  followerActorUuids: ['Actor.retainer', 'Actor.hireling'],
  followerWages: { 'Actor.retainer': 4, 'Actor.hireling': 2 },
  shares: {
    'Actor.hero': 1,
    'Actor.retainer': 0.5,
    'Actor.hireling': 0.25,
  },
});

const version050State = completeState({
  revision: 91,
  treasuryActorUuid: 'Actor.current-treasury',
  memberActorUuids: ['Actor.hero'],
  followerActorUuids: ['Actor.retainer', 'Actor.hireling'],
  followerWages: { 'Actor.retainer': 4, 'Actor.hireling': 2 },
  shares: {
    'Actor.hero': 1,
    'Actor.retainer': 0.5,
    'Actor.hireling': 0.25,
  },
  supplies: { torches: '6', lanterns: '1', oil: '2', rations: '9' },
  treasureNotes: { gems: '<p>Two gems</p>', misc: '<p>One idol</p>' },
  notes: '<p>Meet at dawn.</p>',
});

export const RELEASED_MODULE_FIXTURES = Object.freeze([
  {
    moduleVersion: '0.1.0',
    partyState: null,
    expectedPartyState: version010Expected,
    treasuries: [],
    expectedTreasuryAction: 'create',
  },
  {
    moduleVersion: '0.2.0',
    partyState: version020State,
    expectedPartyState: version020State,
    treasuries: [],
    expectedTreasuryAction: 'create',
  },
  {
    moduleVersion: '0.3.0',
    partyState: version030State,
    expectedPartyState: version030State,
    treasuries: [],
    expectedTreasuryAction: 'create',
  },
  {
    moduleVersion: '0.4.0',
    partyState: version040State,
    expectedPartyState: version040State,
    treasuries: [treasury('imported-treasury', 'Imported Party Treasury')],
    expectedTreasuryAction: 'rebind',
    expectedTreasuryId: 'imported-treasury',
  },
  {
    moduleVersion: '0.5.0',
    partyState: version050State,
    expectedPartyState: version050State,
    treasuries: [treasury('current-treasury', 'Party Treasury')],
    expectedTreasuryAction: 'retain',
    expectedTreasuryId: 'current-treasury',
  },
]);
