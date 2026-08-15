const MODULE_ID = 'hyp3e-utilities';
const DIAGNOSTIC_ID = 'hyp3e-utilities-diagnostics';
const FIXTURE_FLAG = 'm5Distributions';
const COIN_KEYS = ['cp', 'sp', 'ep', 'gp', 'pp'];

let fixtureSnapshot = null;

function clone(value) {
  return foundry.utils.deepClone(value);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function getApi() {
  const api = game.modules.get(MODULE_ID)?.api;
  if (!api) throw new Error('Hyp3e Utilities API is unavailable.');
  return api;
}

function findFixture(role) {
  return game.actors.find(
    (actor) => actor.getFlag(DIAGNOSTIC_ID, FIXTURE_FLAG) === role,
  );
}

function getAuditMessages() {
  const fixtureUuids = new Set([
    findFixture('hero')?.uuid,
    findFixture('retainer')?.uuid,
    findFixture('npc')?.uuid,
  ].filter(Boolean));
  return game.messages.filter((message) => {
    const flags = message.flags?.[MODULE_ID];
    if (!['xpDistribution', 'coinDistribution', 'wageSettlement'].includes(
      flags?.action,
    )) return false;
    return message.content && [...fixtureUuids].some(
      (actorUuid) => message.content.includes(actorUuid),
    );
  });
}

async function removeFixtureDocuments() {
  const actors = game.actors.filter(
    (actor) => actor.getFlag(DIAGNOSTIC_ID, FIXTURE_FLAG),
  );
  const fixtureUuids = new Set(actors.map((actor) => actor.uuid));
  const messages = game.messages.filter((message) => {
    const flags = message.flags?.[MODULE_ID];
    if (!['xpDistribution', 'coinDistribution', 'wageSettlement'].includes(
      flags?.action,
    )) return false;
    return message.content && [...fixtureUuids].some(
      (actorUuid) => message.content.includes(actorUuid),
    );
  });
  if (messages.length) {
    await ChatMessage.deleteDocuments(messages.map((message) => message.id));
  }
  if (actors.length) {
    await Actor.deleteDocuments(actors.map((actor) => actor.id));
  }
}

async function setup() {
  if (!game.user.isGM) throw new Error('M5 fixture setup requires a GM.');
  if (fixtureSnapshot) throw new Error('M5 fixtures are already active.');
  const api = getApi();
  const treasury = api.partyTreasury.getStatus().actor;
  if (!treasury) throw new Error('M5 diagnostics require a managed treasury.');
  await removeFixtureDocuments();

  const player = game.users.find((user) => !user.isGM && user.active);
  if (!player) throw new Error('M5 diagnostics require one connected Player.');
  const ownership = {
    default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
    [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
    [player.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
  };
  const created = await Actor.createDocuments([
    {
      flags: { [DIAGNOSTIC_ID]: { [FIXTURE_FLAG]: 'hero' } },
      name: 'M5 Distribution Hero',
      ownership,
      type: 'character',
    },
    {
      flags: { [DIAGNOSTIC_ID]: { [FIXTURE_FLAG]: 'retainer' } },
      name: 'M5 Distribution Retainer',
      ownership,
      type: 'character',
    },
    {
      flags: { [DIAGNOSTIC_ID]: { [FIXTURE_FLAG]: 'npc' } },
      name: 'M5 Distribution NPC',
      ownership,
      type: 'npc',
    },
  ]);
  const byRole = new Map(created.map((actor) => [
    actor.getFlag(DIAGNOSTIC_ID, FIXTURE_FLAG),
    actor,
  ]));
  const hero = byRole.get('hero');
  const retainer = byRole.get('retainer');
  const npc = byRole.get('npc');
  fixtureSnapshot = {
    actorIds: created.map((actor) => actor.id),
    partyState: clone(game.settings.get(MODULE_ID, 'partyState')),
    treasuryCoins: api.adapter.getMoney(treasury),
    treasuryUuid: treasury.uuid,
  };

  await hero.update({
    ...api.adapter.buildCharacterExperienceUpdate(100),
    ...api.adapter.buildMoneyUpdate({ cp: 1, sp: 1, ep: 1, gp: 1, pp: 1 }),
    'system.details.xp.bonus': 10,
  });
  await retainer.update({
    ...api.adapter.buildCharacterExperienceUpdate(200),
    ...api.adapter.buildMoneyUpdate({ cp: 2, sp: 2, ep: 2, gp: 2, pp: 2 }),
    'system.details.xp.bonus': -10,
  });
  await npc.update({
    ...api.adapter.buildMoneyUpdate({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }),
    'system.xp': 75,
  });
  const treasuryCoins = { cp: 12, sp: 8, ep: 4, gp: 20, pp: 4 };
  await treasury.update(api.adapter.buildMoneyUpdate(treasuryCoins));

  const original = api.partyStore.getState();
  const state = {
    ...clone(original),
    followerActorUuids: [retainer.uuid, npc.uuid],
    followerWages: { [retainer.uuid]: 3, [npc.uuid]: 5 },
    marchingOrder: {
      front: { actorUuids: [hero.uuid], notes: '' },
      middle: { actorUuids: [retainer.uuid, npc.uuid], notes: '' },
      rear: { actorUuids: [], notes: '' },
    },
    memberActorUuids: [hero.uuid],
    revision: original.revision + 1,
    shares: { [hero.uuid]: 1, [retainer.uuid]: 0.5, [npc.uuid]: 0.5 },
    treasuryActorUuid: treasury.uuid,
  };
  await game.settings.set(MODULE_ID, 'partyState', state);

  return {
    actorUuids: {
      hero: hero.uuid,
      npc: npc.uuid,
      retainer: retainer.uuid,
      treasury: treasury.uuid,
    },
    playerUserId: player.id,
    revision: state.revision,
    treasuryCoins,
  };
}

async function runGmXp() {
  if (!game.user.isGM) throw new Error('M5 XP diagnostics require a GM.');
  const api = getApi();
  const preview = api.partyXp.getPreview({ totalXp: 400 });
  const requestId = `m5-xp-${foundry.utils.randomID()}`;
  const first = await api.partyXpAwards.distribute(
    preview,
    api.partyStore.getState().revision,
    requestId,
  );
  const duplicate = await api.partyXpAwards.distribute(
    preview,
    api.partyStore.getState().revision,
    requestId,
  );
  const hero = findFixture('hero');
  const retainer = findFixture('retainer');
  const npc = findFixture('npc');
  const audits = getAuditMessages().filter(
    (message) => message.flags?.[MODULE_ID]?.requestId === requestId,
  );
  return {
    auditCount: audits.length,
    auditPublic: audits.every((message) => message.whisper.length === 0),
    duplicateMatched: JSON.stringify(first) === JSON.stringify(duplicate),
    first,
    heroXp: api.adapter.getCharacterExperience(hero).value,
    npcXp: api.adapter.getEncounterExperience(npc),
    preview,
    retainerXp: api.adapter.getCharacterExperience(retainer).value,
  };
}

async function runPlayerCoinsAndWages() {
  if (game.user.isGM) throw new Error('M5 coin/wage diagnostics require a Player.');
  const api = getApi();
  const revision = api.partyStore.getState().revision;
  const wagePreviewResponse = await api.partyWages.requestPreview({}, revision);
  if (!wagePreviewResponse.ok) return { wagePreviewResponse };
  const wageRequestId = `m5-wage-${foundry.utils.randomID()}`;
  const wageFirst = await api.partyWageSettlement.settle(
    wagePreviewResponse.value,
    revision,
    wageRequestId,
  );
  const wageDuplicate = await api.partyWageSettlement.settle(
    wagePreviewResponse.value,
    revision,
    wageRequestId,
  );

  const coinPreviewResponse = await api.partyCoins.requestPreview({}, revision);
  if (!coinPreviewResponse.ok) {
    return { coinPreviewResponse, wageFirst, wagePreviewResponse };
  }
  const coinRequestId = `m5-coin-${foundry.utils.randomID()}`;
  const coinFirst = await api.partyCoinAwards.distribute(
    coinPreviewResponse.value,
    revision,
    coinRequestId,
  );
  const coinDuplicate = await api.partyCoinAwards.distribute(
    coinPreviewResponse.value,
    revision,
    coinRequestId,
  );

  return {
    coinDuplicateMatched:
      JSON.stringify(coinFirst) === JSON.stringify(coinDuplicate),
    coinFirst,
    coinPreview: coinPreviewResponse.value,
    coinRequestId,
    wageDuplicateMatched:
      JSON.stringify(wageFirst) === JSON.stringify(wageDuplicate),
    wageFirst,
    wagePreview: wagePreviewResponse.value,
    wageRequestId,
  };
}

function inspect() {
  const api = getApi();
  const hero = findFixture('hero');
  const retainer = findFixture('retainer');
  const npc = findFixture('npc');
  const treasury = api.partyTreasury.getStatus().actor;
  const audits = getAuditMessages();
  return {
    auditActions: audits.map(
      (message) => message.flags?.[MODULE_ID]?.action,
    ).sort(),
    auditsPublic: audits.every((message) => message.whisper.length === 0),
    followerWages: clone(api.partyStore.getState().followerWages),
    heroCoins: api.adapter.getMoney(hero),
    heroXp: api.adapter.getCharacterExperience(hero).value,
    npcCoins: api.adapter.getMoney(npc),
    npcXp: api.adapter.getEncounterExperience(npc),
    retainerCoins: api.adapter.getMoney(retainer),
    retainerXp: api.adapter.getCharacterExperience(retainer).value,
    treasuryCoins: api.adapter.getMoney(treasury),
  };
}

async function cleanup() {
  if (!game.user.isGM) throw new Error('M5 fixture cleanup requires a GM.');
  const api = getApi();
  const snapshot = fixtureSnapshot;
  if (!snapshot) {
    await removeFixtureDocuments();
    return { restored: false, reason: 'No active fixture snapshot.' };
  }
  const fixtureActors = game.actors.filter(
    (actor) => snapshot.actorIds.includes(actor.id),
  );
  const fixtureUuids = new Set(fixtureActors.map((actor) => actor.uuid));
  const messages = game.messages.filter((message) => (
    ['xpDistribution', 'coinDistribution', 'wageSettlement'].includes(
      message.flags?.[MODULE_ID]?.action,
    )
    && [...fixtureUuids].some((uuid) => message.content?.includes(uuid))
  ));
  if (messages.length) {
    // Foundry animates chat notifications asynchronously. Give each new card
    // time to mount before deleting the diagnostic messages it represents.
    await wait(500);
    await ChatMessage.deleteDocuments(messages.map((message) => message.id));
  }
  const treasury = await fromUuid(snapshot.treasuryUuid);
  if (treasury) {
    await treasury.update(api.adapter.buildMoneyUpdate(snapshot.treasuryCoins));
  }
  await game.settings.set(MODULE_ID, 'partyState', snapshot.partyState);
  if (fixtureActors.length) {
    await Actor.deleteDocuments(fixtureActors.map((actor) => actor.id));
  }
  const restoredState = game.settings.get(MODULE_ID, 'partyState');
  const restoredTreasuryCoins = treasury
    ? api.adapter.getMoney(treasury)
    : null;
  const remainingActorCount = game.actors.filter(
    (actor) => snapshot.actorIds.includes(actor.id),
  ).length;
  const remainingAuditCount = game.messages.filter(
    (message) => messages.some((deleted) => deleted.id === message.id),
  ).length;
  fixtureSnapshot = null;
  return {
    auditMessagesDeleted: messages.length,
    actorsDeleted: fixtureActors.length,
    exactPartyStateRestored:
      JSON.stringify(restoredState) === JSON.stringify(snapshot.partyState),
    exactTreasuryRestored:
      JSON.stringify(restoredTreasuryCoins)
        === JSON.stringify(snapshot.treasuryCoins),
    remainingActorCount,
    remainingAuditCount,
    restored: true,
  };
}

globalThis.Hyp3eUtilitiesM5 = Object.freeze({
  cleanup,
  inspect,
  runGmXp,
  runPlayerCoinsAndWages,
  setup,
});

function mountDiagnosticControls() {
  document.getElementById('hyp3e-utilities-m5-diagnostics')?.remove();
  const panel = document.createElement('section');
  panel.id = 'hyp3e-utilities-m5-diagnostics';
  panel.style.cssText = [
    'position:fixed',
    'z-index:100000',
    'right:8px',
    'bottom:8px',
    'padding:8px',
    'background:#111',
    'color:#eee',
    'border:1px solid #777',
  ].join(';');
  const actions = game.user.isGM
    ? [
      ['setup', setup],
      ['run-gm-xp', runGmXp],
      ['inspect', inspect],
      ['cleanup', cleanup],
    ]
    : [['run-player', runPlayerCoinsAndWages]];
  for (const [action, callback] of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.m5Action = action;
    button.textContent = action;
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const value = await callback();
        output.textContent = JSON.stringify({ action, ok: true, value });
      }
      catch (error) {
        output.textContent = JSON.stringify({
          action,
          error: { message: error?.message ?? String(error), stack: error?.stack },
          ok: false,
        });
      }
      finally {
        button.disabled = false;
      }
    });
    panel.append(button);
  }
  const output = document.createElement('pre');
  output.dataset.m5Output = '';
  output.style.display = 'none';
  panel.append(output);
  document.body.append(panel);
}

Hooks.once('ready', mountDiagnosticControls);
