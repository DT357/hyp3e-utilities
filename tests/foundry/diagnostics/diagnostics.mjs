const MODULE_ID = 'hyp3e-utilities';
const DIAGNOSTIC_ID = 'hyp3e-utilities-diagnostics';
const DIAGNOSTIC_SOCKET = `module.${DIAGNOSTIC_ID}`;
const SAVE_KEYS = [
  'death',
  'device',
  'transformation',
  'avoidance',
  'sorcery',
];
const RUN_PREFIX = 'Hyp3e Utilities Compatibility';

let diagnosticSocket;
let productionMutationExecutions = 0;
let itemTransferCleanup = async () => {};
let treasuryViewCleanup = async () => {};

const results = {
  status: 'initializing',
  environment: {},
  pb003: {},
  pb004: {},
  pb005: {},
  pb006: {},
  pb007: {},
  pb008: {},
  par001: {},
  par002: {},
  par004: {},
  par005: {},
  par006: {},
  par007: {},
  par008: {},
  par009: {},
  par010: {},
  mar002: {},
  mar003: {},
  sup001: {},
  not001: {},
  ref001: {},
  try001: {},
  try002: {},
  itm007: {},
  fnd001: {},
  fnd002: {},
  fnd003: {},
  fnd004: {},
  fnd005: {},
  fnd006: {},
  hud001: {},
  hud002: {},
  hud003: {},
  hud004: {},
  hud005: {},
  hud006: {},
  hud007: {},
  hud008: {},
  errors: [],
};

globalThis.Hyp3eUtilitiesCompatibility = results;

function serializeError(error) {
  return {
    message: error?.message ?? String(error),
    stack: error?.stack ?? null,
  };
}

function publishResults() {
  let output = document.getElementById('hyp3e-utilities-compatibility-results');
  if (!output) {
    output = document.createElement('pre');
    output.id = 'hyp3e-utilities-compatibility-results';
    output.hidden = true;
    document.body.append(output);
  }
  output.textContent = JSON.stringify(results);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitUntil(predicate, timeoutMilliseconds = 5000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await wait(100);
  }
  return false;
}

function incrementDiagnosticValue() {
  this.diagnosticValue += 1;
  this.actionCount += 1;
  this.render(true);
}

function defineDiagnosticApplication() {
  const {
    ApplicationV2,
    HandlebarsApplicationMixin,
  } = foundry.applications.api;

  return class CompatibilityDiagnosticApplication
    extends HandlebarsApplicationMixin(ApplicationV2) {
    diagnosticValue = 1;
    actionCount = 0;
    renderCount = 0;

    static DEFAULT_OPTIONS = {
      id: 'hyp3e-utilities-compatibility-diagnostic',
      classes: ['hyp3e-utilities-compatibility-diagnostic'],
      window: {
        title: 'Hyp3e Utilities Compatibility Diagnostic',
        minimizable: false,
        resizable: false,
      },
      position: {
        width: 360,
        height: 'auto',
      },
      actions: {
        increment: incrementDiagnosticValue,
      },
    };

    static PARTS = {
      main: {
        template: `modules/${DIAGNOSTIC_ID}/templates/diagnostic-app.hbs`,
      },
    };

    async _prepareContext() {
      return { value: this.diagnosticValue };
    }

    _onRender(context, options) {
      super._onRender(context, options);
      this.renderCount += 1;
    }
  };
}

async function testSaveFields(character, npc) {
  const effectData = {
    name: `${RUN_PREFIX} Save Modifier`,
    icon: 'icons/svg/aura.svg',
    changes: [
      {
        key: 'system.saves.death.curr',
        mode: game.release.generation >= 14
          ? 'add'
          : CONST.ACTIVE_EFFECT_MODES.ADD,
        value: 2,
        priority: 20,
      },
    ],
    disabled: false,
  };

  await character.createEmbeddedDocuments('ActiveEffect', [effectData]);
  await npc.createEmbeddedDocuments('ActiveEffect', [effectData]);

  const actorResult = (actor) => ({
    type: actor.type,
    saves: Object.fromEntries(
      SAVE_KEYS.map((saveKey) => [
        saveKey,
        {
          value: actor.system.saves[saveKey].value,
          curr: actor.system.saves[saveKey].curr,
        },
      ]),
    ),
    deathEffectApplied:
      actor.system.saves.death.curr === actor.system.saves.death.value + 2,
  });

  const characterResult = actorResult(character);
  const npcResult = actorResult(npc);

  return {
    recommendedTargetField: 'system.saves.<kind>.curr',
    character: characterResult,
    npc: npcResult,
    allFiveCurrentFieldsNumeric: [characterResult, npcResult].every(
      (actor) => SAVE_KEYS.every(
        (saveKey) => Number.isFinite(actor.saves[saveKey].curr),
      ),
    ),
    activeEffectsApplyToCurrent:
      characterResult.deathEffectApplied && npcResult.deathEffectApplied,
  };
}

async function waitForCanvasScene(sceneId) {
  return waitUntil(
    () => canvas.ready && canvas.scene?.id === sceneId,
    10000,
  );
}

async function testTokenIdentity(npc) {
  const originalScene = game.scenes.active;
  const scene = await Scene.create({
    name: `${RUN_PREFIX} Token Identity`,
    active: false,
    navigation: false,
    width: 1200,
    height: 900,
    padding: 0,
    grid: {
      type: CONST.GRID_TYPES.SQUARE,
      size: 100,
      distance: 5,
    },
  });

  try {
    const tokenDocuments = await scene.createEmbeddedDocuments('Token', [
      {
        name: `${RUN_PREFIX} Linked A`,
        actorId: npc.id,
        actorLink: true,
        x: 100,
        y: 100,
      },
      {
        name: `${RUN_PREFIX} Linked B`,
        actorId: npc.id,
        actorLink: true,
        x: 300,
        y: 100,
      },
      {
        name: `${RUN_PREFIX} Unlinked`,
        actorId: npc.id,
        actorLink: false,
        x: 500,
        y: 100,
      },
    ]);
    const tokenByName = new Map(
      tokenDocuments.map((token) => [token.name, token]),
    );
    const linkedA = tokenByName.get(`${RUN_PREFIX} Linked A`);
    const linkedB = tokenByName.get(`${RUN_PREFIX} Linked B`);
    const unlinked = tokenByName.get(`${RUN_PREFIX} Unlinked`);
    const initialSyntheticHp = unlinked.actor.system.hp.value;

    await npc.update({ 'system.hp.value': 7 });
    const linkedTracksBaseActor =
      linkedA.actor.system.hp.value === 7
      && linkedB.actor.system.hp.value === 7;
    const syntheticRetainsSnapshot =
      unlinked.actor.system.hp.value === initialSyntheticHp;

    await unlinked.actor.update({ 'system.hp.value': 3 });
    const syntheticUpdateIsIsolated =
      unlinked.actor.system.hp.value === 3
      && npc.system.hp.value === 7;

    await scene.activate();
    const canvasActivated = await waitForCanvasScene(scene.id);
    let selection = {
      canvasActivated,
      one: [],
      multiple: [],
      released: [],
    };

    if (canvasActivated) {
      const linkedAObject = canvas.tokens.get(linkedA.id);
      const linkedBObject = canvas.tokens.get(linkedB.id);
      canvas.tokens.releaseAll();
      linkedAObject.control({ releaseOthers: true });
      selection.one = canvas.tokens.controlled.map((token) => token.document.id);
      linkedBObject.control({ releaseOthers: false });
      selection.multiple = canvas.tokens.controlled.map(
        (token) => token.document.id,
      );
      canvas.tokens.releaseAll();
      selection.released = canvas.tokens.controlled.map(
        (token) => token.document.id,
      );
    }

    const deletedTokenId = linkedB.id;
    await scene.deleteEmbeddedDocuments('Token', [deletedTokenId]);

    return {
      linkedActorUuid: linkedA.actor.uuid,
      duplicateLinkedActorUuid: linkedB.actor.uuid,
      syntheticActorUuid: unlinked.actor.uuid,
      linkedTokensShareActorUuid: linkedA.actor.uuid === linkedB.actor.uuid,
      syntheticActorHasDistinctUuid: unlinked.actor.uuid !== npc.uuid,
      linkedTracksBaseActor,
      syntheticRetainsSnapshot,
      syntheticUpdateIsIsolated,
      deletedTokenAbsent: !scene.tokens.has(deletedTokenId),
      selection,
      selectionTransitionsValid:
        selection.one.length === 1
        && selection.multiple.length === 2
        && selection.released.length === 0,
    };
  }
  finally {
    canvas.tokens?.releaseAll();
    if (originalScene && game.scenes.active?.id !== originalScene.id) {
      await originalScene.activate();
      await waitForCanvasScene(originalScene.id);
    }
    await scene.delete();
  }
}

async function testTreasuryLifecycle() {
  const ownership = {
    default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
    [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
  };
  const createTreasury = (suffix) => Actor.create({
    name: `${RUN_PREFIX} Treasury ${suffix}`,
    type: 'treasure',
    ownership,
    flags: {
      [MODULE_ID]: {
        partyTreasury: true,
      },
    },
  });
  const managedTreasuries = () => game.actors.filter(
    (actor) => actor.getFlag(MODULE_ID, 'partyTreasury') === true,
  );

  const primary = await createTreasury('Primary');
  const primaryUuid = primary.uuid;
  await primary.update({ name: `${RUN_PREFIX} Treasury Renamed` });
  const renamedFoundByFlag = managedTreasuries().some(
    (actor) => actor.uuid === primaryUuid,
  );
  await primary.delete();
  const deletedAbsent = !game.actors.has(primary.id);

  const replacement = await createTreasury('Replacement');
  const duplicate = await createTreasury('Duplicate');
  const duplicateIds = managedTreasuries()
    .filter((actor) => [replacement.id, duplicate.id].includes(actor.id))
    .map((actor) => actor.id);

  const result = {
    actorTypeSupported: replacement.type === 'treasure',
    flagPersisted:
      replacement.getFlag(MODULE_ID, 'partyTreasury') === true,
    ownershipPersisted:
      replacement.ownership[game.user.id]
      === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
    renameTolerant: renamedFoundByFlag,
    deletionDetected: deletedAbsent,
    recreationSucceeded: replacement.documentName === 'Actor',
    duplicateCount: duplicateIds.length,
    duplicateDetectionSucceeded: duplicateIds.length === 2,
  };

  await Actor.deleteDocuments([replacement.id, duplicate.id]);
  return result;
}

async function testApplicationV2() {
  const DiagnosticApplication = defineDiagnosticApplication();
  const application = new DiagnosticApplication();
  const singletonReference = application;

  await application.render(true);
  const firstRenderReady = await waitUntil(
    () => application.rendered && application.element?.isConnected,
  );
  const firstValue = application.element
    ?.querySelector('[data-diagnostic-value]')
    ?.textContent
    ?.trim();

  application.element
    ?.querySelector('[data-action="increment"]')
    ?.click();
  const actionRerendered = await waitUntil(
    () => application.actionCount === 1 && application.renderCount >= 2,
  );
  const secondValue = application.element
    ?.querySelector('[data-diagnostic-value]')
    ?.textContent
    ?.trim();

  await application.render(true);
  const explicitRerenderSucceeded = await waitUntil(
    () => application.renderCount >= 3,
  );
  await application.close();
  const closedCleanly = await waitUntil(() => !application.rendered);

  return {
    apiPresent:
      typeof foundry.applications.api.ApplicationV2 === 'function'
      && typeof foundry.applications.api.HandlebarsApplicationMixin
        === 'function',
    firstRenderReady,
    templateRendered: firstValue === '1',
    actionListenerRan: application.actionCount === 1,
    actionRerendered,
    updatedContextRendered: secondValue === '2',
    explicitRerenderSucceeded,
    singletonReferenceStable: singletonReference === application,
    closedCleanly,
    finalRenderCount: application.renderCount,
  };
}

async function testProductionFoundation(character, npc) {
  const module = game.modules.get(MODULE_ID);
  const api = module?.api;

  results.fnd001 = {
    apiPublished: Boolean(api),
    adapterPublished: Boolean(api?.adapter),
    applicationsPublished: Boolean(api?.applications),
    chatCardsPublished: Boolean(api?.chatCards),
    partyMutationsPublished: Boolean(api?.partyMutations),
    partyActionsPublished: Boolean(api?.partyActions),
    partyCleanupPublished: Boolean(api?.partyCleanup),
    partyFollowersPublished: Boolean(api?.partyFollowers),
    partyMarchingOrderPublished: Boolean(api?.partyMarchingOrder),
    partyMembersPublished: Boolean(api?.partyMembers),
    partyNotesPublished: Boolean(api?.partyNotes),
    partyPermissionsPublished: Boolean(api?.partyPermissions),
    partyStorePublished: Boolean(api?.partyStore),
    partyTreasuryPublished: Boolean(api?.partyTreasury),
    socketPublished: Boolean(api?.socket),
  };

  const characterSummary = api?.adapter?.getActorSummary(character);
  const npcSummary = api?.adapter?.getActorSummary(npc);
  results.fnd002 = {
    characterSummary,
    npcSummary,
    allFiveSavesRead:
      Object.keys(api?.adapter?.getSaves(character) ?? {}).length === 5
      && Object.keys(api?.adapter?.getSaves(npc) ?? {}).length === 5,
    characterXpWritable: api?.adapter?.canWriteExperience(character) === true,
    npcXpNotWritable: api?.adapter?.canWriteExperience(npc) === false,
  };

  const settingKeys = [
    'enableNpcActionHud',
    'displayDetailedNpcInformation',
    'npcActionHudPosition',
    'partyState',
    'partySheetMinimumEditRole',
    'partySheetExplicitEditorUserIds',
  ];
  const menuKeys = [
    'resetHudPosition',
    'partySheetPermissions',
    'openPartySheet',
  ];
  results.fnd003 = {
    settingsRegistered: settingKeys.every(
      (key) => game.settings.settings.has(`${MODULE_ID}.${key}`),
    ),
    menusRegistered: menuKeys.every(
      (key) => game.settings.menus.has(`${MODULE_ID}.${key}`),
    ),
    hudDisabledByDefault:
      game.settings.get(MODULE_ID, 'enableNpcActionHud') === false,
    detailedNpcInformationEnabledByDefault:
      game.settings.get(MODULE_ID, 'displayDetailedNpcInformation') === true,
    partySchemaVersion:
      game.settings.get(MODULE_ID, 'partyState')?.schemaVersion ?? null,
    minimumEditRole:
      game.settings.get(MODULE_ID, 'partySheetMinimumEditRole'),
  };

  try {
    const socketResponse = await api.socket.executeAsActiveGM('ping');
    results.fnd004 = {
      available: api.socket.available,
      socketResponse,
      authenticatedRoundTrip:
        socketResponse.requesterUserId === game.user.id
        && socketResponse.executingUserId === game.user.id
        && socketResponse.executingUserIsGM === true,
    };
  }
  catch (error) {
    results.fnd004 = {
      available: api?.socket?.available ?? false,
      error: serializeError(error),
      authenticatedRoundTrip: false,
    };
  }

  const applicationResults = {};
  for (const [name, ApplicationClass] of Object.entries(api.applications)) {
    const application = new ApplicationClass();
    await application.render(true);
    const rendered = await waitUntil(
      () => application.rendered && application.element?.isConnected,
    );
    const localized = !application.element?.textContent?.includes(
      `${MODULE_ID}.applications`,
    );
    await application.close();
    const closed = await waitUntil(() => !application.rendered);
    applicationResults[name] = { rendered, localized, closed };
  }
  results.fnd005 = {
    applications: applicationResults,
    allRenderedLocalizedAndClosed: Object.values(applicationResults).every(
      (application) => application.rendered
        && application.localized
        && application.closed,
    ),
  };

  results.fnd006 = {
    supported: api.compatibility.supported,
    reasons: api.compatibility.reasons,
    systemMatches: game.system.id === 'hyp3e',
    foundryGenerationSupported: [13, 14].includes(game.release.generation),
  };
}

function testProductionHudRules(character, npc) {
  const { npcRolls } = game.modules.get(MODULE_ID).api;
  const reactionTotals = [-1, 0, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 18];
  const reactionOutcomeIds = reactionTotals.map(
    (total) => npcRolls.getReactionOutcome(total).id,
  );
  const reactionBatch = npcRolls.planReactionBatch([
    { tokenUuid: 'Scene.diagnostic.Token.first', actor: npc },
    { tokenUuid: 'Scene.diagnostic.Token.second', actor: npc },
    { tokenUuid: 'Scene.diagnostic.Token.character', actor: character },
  ]);
  results.hud001 = {
    reactionTotals,
    reactionOutcomeIds,
    boundariesMatch: reactionOutcomeIds.join(',')
      === [
        'violent',
        'violent',
        'violent',
        'hostile',
        'unfriendly',
        'unfriendly',
        'neutral',
        'neutral',
        'friendly',
        'friendly',
        'agreeable',
        'affable',
        'affable',
      ].join(','),
    oneRollPerNpcToken: reactionBatch.rolls.length === 2,
    distinctTokenTargets:
      reactionBatch.rolls[0].target.tokenUuid
      !== reactionBatch.rolls[1].target.tokenUuid,
    nonNpcSkipped:
      reactionBatch.skipped[0]?.reason === 'unsupportedActor',
    neutralRequestsReroll: npcRolls.getReactionOutcome(6).reroll === true,
  };

  const savePlans = Object.fromEntries(SAVE_KEYS.map((saveKey) => {
    const instruction = npcRolls.planSaveBatch([npc], saveKey).rolls[0];
    return [saveKey, {
      formula: instruction.formula,
      targetValue: instruction.targetValue,
      currentTarget: npc.system.saves[saveKey].curr,
      targetMatches: instruction.targetValue
        === npc.system.saves[saveKey].curr,
    }];
  }));
  const deathInstruction = npcRolls.planSaveBatch([npc], 'death').rolls[0];
  const moraleInstruction = npcRolls.planMoraleBatch([npc]).rolls[0];
  const missingNpc = {
    id: 'missing-rules-id',
    uuid: 'Actor.missing-rules-id',
    name: 'Missing Rules Data',
    type: 'npc',
    system: {
      saves: { death: { curr: null } },
      morale: null,
    },
  };
  const missingSavePlan = npcRolls.planSaveBatch([missingNpc], 'death');
  const missingMoralePlan = npcRolls.planMoraleBatch([missingNpc]);
  results.hud002 = {
    savePlans,
    allFiveSaveTargetsMatch: Object.values(savePlans).every(
      ({ formula, targetMatches }) => formula === '1d20' && targetMatches,
    ),
    preparedModifierIncluded:
      npc.system.saves.death.curr === npc.system.saves.death.value + 2
      && deathInstruction.targetValue === npc.system.saves.death.curr,
    saveBoundaryPass:
      npcRolls.evaluateCheckRoll(
        deathInstruction,
        deathInstruction.targetValue,
      ).success
      && !npcRolls.evaluateCheckRoll(
        deathInstruction,
        deathInstruction.targetValue - 1,
      ).success,
    moraleFormula: moraleInstruction.formula,
    moraleBoundaryPass:
      npcRolls.evaluateCheckRoll(
        moraleInstruction,
        moraleInstruction.targetValue,
      ).success
      && !npcRolls.evaluateCheckRoll(
        moraleInstruction,
        moraleInstruction.targetValue + 1,
      ).success,
    missingSaveSkipped:
      missingSavePlan.skipped[0]?.reason === 'missingSaveTarget',
    missingMoraleSkipped:
      missingMoralePlan.skipped[0]?.reason === 'missingMoraleTarget',
  };
}

async function testProductionHudChat(npc) {
  const api = game.modules.get(MODULE_ID).api;
  const originalName = npc.name;
  const unsafeName = `${RUN_PREFIX} <script>alert("unsafe")</script>`;
  const scene = await Scene.create({
    name: `${RUN_PREFIX} Chat Cards`,
    active: false,
    navigation: false,
    width: 1200,
    height: 900,
    padding: 0,
    grid: {
      type: CONST.GRID_TYPES.SQUARE,
      size: 100,
      distance: 5,
    },
  });

  try {
    await npc.update({ name: unsafeName });
    const tokens = await scene.createEmbeddedDocuments('Token', [
      {
        name: `${RUN_PREFIX} Chat First`,
        actorId: npc.id,
        actorLink: true,
        x: 100,
        y: 100,
      },
      {
        name: `${RUN_PREFIX} Chat Second`,
        actorId: npc.id,
        actorLink: true,
        x: 300,
        y: 100,
      },
    ]);
    const reactionBatch = api.npcRolls.planReactionBatch(
      tokens.map((token) => ({ tokenUuid: token.uuid, actor: token.actor })),
    );
    const reports = [
      await api.chatCards.createNpcRollBatch(reactionBatch),
      await api.chatCards.createNpcRollBatch(
        api.npcRolls.planSaveBatch([npc], 'death'),
      ),
      await api.chatCards.createNpcRollBatch(
        api.npcRolls.planMoraleBatch([npc]),
      ),
    ];
    const messages = reports.flatMap(
      (report) => report.created.map(({ message }) => message),
    );
    const gmRecipientIds = ChatMessage.getWhisperRecipients('GM')
      .map((user) => user.id)
      .sort();
    const reactionMessages = messages.filter(
      (message) => message.flags[MODULE_ID].action === 'reaction',
    );
    const cardsRendered = await waitUntil(
      () => document.querySelectorAll(`.${MODULE_ID}-chat-card`).length >= 4,
    );

    return {
      messageIds: messages.map((message) => message.id),
      messageCount: messages.length,
      oneMessagePerInstruction: messages.length === 4,
      oneRollPerMessage: messages.every(
        (message) => message.rolls.length === 1,
      ),
      gmOnly: messages.every(
        (message) => [...message.whisper].sort().join(',')
          === gmRecipientIds.join(','),
      ),
      actorAttributed: messages.every(
        (message) => message.speaker.actor === npc.id,
      ),
      tokenAttributed:
        reactionMessages.length === 2
        && reactionMessages.every((message) => Boolean(message.speaker.token)),
      tokenOrderStable:
        reactionMessages[0]?.speaker.token === tokens[0].id
        && reactionMessages[1]?.speaker.token === tokens[1].id,
      rollsEvaluated: messages.every(
        (message) => Number.isFinite(message.rolls[0].total),
      ),
      sharedReactionBatchId:
        reactionMessages.length === 2
        && reactionMessages[0].flags[MODULE_ID].batchId
          === reactionMessages[1].flags[MODULE_ID].batchId,
      saveCategoryFlagged: messages.some(
        (message) => message.flags[MODULE_ID].action === 'save'
          && message.flags[MODULE_ID].category === 'death',
      ),
      unsafeNameEscaped: messages.every(
        (message) => !message.content.includes('<script>')
          && message.content.includes('&lt;script&gt;'),
      ),
      cardsRendered,
      cardCount: document.querySelectorAll(`.${MODULE_ID}-chat-card`).length,
      reportsComplete: reports.every(
        (report) => report.failures.length === 0 && report.skipped.length === 0,
      ),
    };
  }
  finally {
    await npc.update({ name: originalName });
    await scene.delete();
  }
}

async function testProductionHudSelection(character, npc) {
  const api = game.modules.get(MODULE_ID).api;
  const originalScene = game.scenes.active;
  const originalEnabled = game.settings.get(MODULE_ID, 'enableNpcActionHud');
  const scene = await Scene.create({
    name: `${RUN_PREFIX} HUD Selection`,
    active: false,
    navigation: false,
    width: 1200,
    height: 900,
    padding: 0,
    grid: {
      type: CONST.GRID_TYPES.SQUARE,
      size: 100,
      distance: 5,
    },
  });

  try {
    const tokenDocuments = await scene.createEmbeddedDocuments('Token', [
      {
        name: `${RUN_PREFIX} Zulu`,
        actorId: npc.id,
        actorLink: true,
        x: 100,
        y: 100,
      },
      {
        name: `${RUN_PREFIX} Alpha`,
        actorId: npc.id,
        actorLink: true,
        x: 300,
        y: 100,
      },
      {
        name: `${RUN_PREFIX} Beta`,
        actorId: npc.id,
        actorLink: false,
        x: 500,
        y: 100,
      },
      {
        name: `${RUN_PREFIX} Hero`,
        actorId: character.id,
        actorLink: true,
        x: 700,
        y: 100,
      },
    ]);
    const tokenBySuffix = new Map(tokenDocuments.map((token) => [
      token.name.replace(`${RUN_PREFIX} `, ''),
      token,
    ]));

    await game.settings.set(MODULE_ID, 'enableNpcActionHud', true);
    await scene.activate();
    const canvasActivated = await waitForCanvasScene(scene.id);
    if (!canvasActivated) throw new Error('HUD-004 scene did not activate.');

    const tokenObject = (suffix) => canvas.tokens.get(tokenBySuffix.get(suffix).id);
    canvas.tokens.releaseAll();
    tokenObject('Zulu').control({ releaseOthers: true });
    tokenObject('Hero').control({ releaseOthers: false });
    tokenObject('Beta').control({ releaseOthers: false });
    tokenObject('Alpha').control({ releaseOthers: false });
    const selectionReady = await waitUntil(
      () => api.npcSelection.getViewModel().selectedCount === 3,
    );
    const initialModel = api.npcSelection.getViewModel();
    const initialCandidates = api.npcSelection.getRollCandidates();
    const stableModelIdentity = await api.npcSelection.requestSync()
      === initialModel;
    const linkedRows = initialModel.rows.filter((row) => !row.isSynthetic);
    const syntheticRow = initialModel.rows.find((row) => row.isSynthetic);
    const syntheticCandidate = initialCandidates.find(
      (candidate) => candidate.tokenUuid === syntheticRow?.tokenUuid,
    );

    await tokenObject('Beta').actor.update({ 'system.hp.value': 2 });
    const actorUpdateRefreshed = await waitUntil(() => (
      api.npcSelection.getViewModel().rows
        .find((row) => row.tokenUuid === syntheticRow?.tokenUuid)
        ?.hp.value === 2
    ));

    const deletedTokenId = tokenBySuffix.get('Alpha').id;
    await scene.deleteEmbeddedDocuments('Token', [deletedTokenId]);
    const deletionRefreshed = await waitUntil(
      () => api.npcSelection.getViewModel().selectedCount === 2,
    );

    canvas.tokens.releaseAll();
    const emptySelectionHidden = await waitUntil(
      () => api.npcSelection.getViewModel().visible === false,
    );
    tokenObject('Zulu').control({ releaseOthers: true });
    const selectionVisible = await waitUntil(
      () => api.npcSelection.getViewModel().visible === true,
    );
    await game.settings.set(MODULE_ID, 'enableNpcActionHud', false);
    const settingHidesSelection = await waitUntil(
      () => api.npcSelection.getViewModel().visible === false,
    );

    return {
      canvasActivated,
      selectionReady,
      selectedCount: initialModel.selectedCount,
      tokenNames: initialModel.rows.map((row) => row.name),
      rowsAlphabetized:
        initialModel.rows.map((row) => row.name).join('|')
        === [...initialModel.rows]
          .sort((left, right) => left.name.localeCompare(right.name))
          .map((row) => row.name)
          .join('|'),
      mixedCharacterFiltered:
        initialModel.skipped.length === 1
        && initialModel.skipped[0].reason === 'unsupportedActor',
      linkedTokensDistinct:
        linkedRows.length === 2
        && linkedRows[0].tokenUuid !== linkedRows[1].tokenUuid
        && linkedRows[0].actorUuid === linkedRows[1].actorUuid,
      syntheticIdentityRetained:
        Boolean(syntheticRow?.actorUuid.startsWith('Scene.'))
        && syntheticCandidate?.actor?.uuid === syntheticRow.actorUuid,
      rollCandidatesExact: initialCandidates.length === 3,
      stableModelIdentity,
      actorUpdateRefreshed,
      deletionRefreshed,
      emptySelectionHidden,
      selectionVisible,
      settingHidesSelection,
    };
  }
  finally {
    canvas.tokens?.releaseAll();
    await game.settings.set(
      MODULE_ID,
      'enableNpcActionHud',
      originalEnabled,
    );
    if (originalScene && game.scenes.active?.id !== originalScene.id) {
      await originalScene.activate();
      await waitForCanvasScene(originalScene.id);
    }
    await scene.delete();
  }
}

async function testProductionHudOverlay(npc) {
  const api = game.modules.get(MODULE_ID).api;
  const originalScene = game.scenes.active;
  const originalEnabled = game.settings.get(MODULE_ID, 'enableNpcActionHud');
  const originalDetailed = game.settings.get(
    MODULE_ID,
    'displayDetailedNpcInformation',
  );
  const missingMoraleActor = await Actor.create({
    name: `${RUN_PREFIX} No Morale`,
    type: 'npc',
    system: {
      npcType: 'monster',
      hp: { value: 4, max: 8 },
      ac: { value: 6, dr: 1 },
      movement: { base: { value: 30 } },
      saves: Object.fromEntries(SAVE_KEYS.map((saveKey, index) => [
        saveKey,
        { value: 11 + index },
      ])),
      morale: null,
    },
  });
  const scene = await Scene.create({
    name: `${RUN_PREFIX} HUD Overlay`,
    active: false,
    navigation: false,
    width: 1200,
    height: 900,
    padding: 0,
    grid: {
      type: CONST.GRID_TYPES.SQUARE,
      size: 100,
      distance: 5,
    },
  });
  let openedSheet;

  try {
    const tokenDocuments = await scene.createEmbeddedDocuments('Token', [
      {
        name: `${RUN_PREFIX} Overlay Beta`,
        actorId: npc.id,
        actorLink: false,
        x: 100,
        y: 100,
      },
      {
        name: `${RUN_PREFIX} Overlay No Morale`,
        actorId: missingMoraleActor.id,
        actorLink: true,
        x: 300,
        y: 100,
      },
    ]);
    const [betaDocument] = tokenDocuments;

    await game.settings.set(MODULE_ID, 'displayDetailedNpcInformation', true);
    await game.settings.set(MODULE_ID, 'enableNpcActionHud', true);
    await scene.activate();
    const canvasActivated = await waitForCanvasScene(scene.id);
    if (!canvasActivated) throw new Error('HUD-005 scene did not activate.');

    const betaToken = canvas.tokens.get(betaDocument.id);
    const noMoraleToken = canvas.tokens.get(tokenDocuments[1].id);
    canvas.tokens.releaseAll();
    betaToken.control({ releaseOthers: true });
    noMoraleToken.control({ releaseOthers: false });

    const overlayReady = await waitUntil(() => (
      document.querySelectorAll('#hyp3e-utilities-npc-action-hud').length === 1
      && document.querySelectorAll(
        '#hyp3e-utilities-npc-action-hud .hyp3e-utilities-npc-action-hud__target',
      ).length === 2
    ));
    const overlay = document.getElementById('hyp3e-utilities-npc-action-hud');
    const rowElements = [...overlay.querySelectorAll(
      '.hyp3e-utilities-npc-action-hud__target',
    )];
    const saveSelect = overlay.querySelector('[data-role="save-category"]');
    const saveOptions = [...saveSelect.options].map((option) => option.value);
    const initialRect = overlay.getBoundingClientRect();

    if (new URLSearchParams(window.location.search).has('hudPreview')) {
      await wait(12000);
    }

    saveSelect.value = 'sorcery';
    saveSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await betaToken.actor.update({ 'system.hp.value': 2 });
    const selectorPersists = await waitUntil(() => (
      document.querySelector(
        '#hyp3e-utilities-npc-action-hud [data-role="save-category"]',
      )?.value === 'sorcery'
    ));

    openedSheet = betaToken.actor.sheet;
    document.querySelector(
      `#hyp3e-utilities-npc-action-hud [data-action="openActorSheet"][data-token-uuid="${betaDocument.uuid}"]`,
    ).click();
    const exactActorSheetOpened = await waitUntil(
      () => openedSheet.rendered === true,
    );

    const existingMessageIds = new Set(Array.from(game.messages ?? [])
      .map((message) => message.id));
    const newHudMessages = () => Array.from(game.messages ?? []).filter(
      (message) => !existingMessageIds.has(message.id)
        && message.flags?.[MODULE_ID]?.feature === 'npcActionHud',
    );
    const actionButton = (action) => document.querySelector(
      `#hyp3e-utilities-npc-action-hud [data-action="${action}"]`,
    );

    actionButton('reaction').click();
    const reactionCompleted = await waitUntil(
      () => newHudMessages().filter(
        (message) => message.flags[MODULE_ID].action === 'reaction',
      ).length === 2,
    );
    actionButton('save').click();
    const saveCompleted = await waitUntil(
      () => newHudMessages().filter(
        (message) => message.flags[MODULE_ID].action === 'save',
      ).length === 2,
    );
    actionButton('morale').click();
    const moraleCompleted = await waitUntil(
      () => newHudMessages().filter(
        (message) => message.flags[MODULE_ID].action === 'morale',
      ).length === 1,
    );
    const messages = newHudMessages();
    const saveMessages = messages.filter(
      (message) => message.flags[MODULE_ID].action === 'save',
    );

    await game.settings.set(
      MODULE_ID,
      'displayDetailedNpcInformation',
      false,
    );
    const detailedSettingHidesStats = await waitUntil(() => (
      document.querySelectorAll(
        '#hyp3e-utilities-npc-action-hud .hyp3e-utilities-npc-action-hud__stats',
      ).length === 0
      && document.querySelectorAll(
        '#hyp3e-utilities-npc-action-hud [data-action="openActorSheet"]',
      ).length === 2
    ));
    const compactRows = [...document.querySelectorAll(
      '#hyp3e-utilities-npc-action-hud .hyp3e-utilities-npc-action-hud__target',
    )];
    const compactCardMarginsReset = compactRows.every((row) => {
      const styles = getComputedStyle(row);
      return styles.marginTop === '0px'
        && styles.marginRight === '0px'
        && styles.marginBottom === '0px'
        && styles.marginLeft === '0px';
    });
    const compactCardHeightsUniform = new Set(compactRows.map(
      (row) => row.getBoundingClientRect().height,
    )).size === 1;
    await game.settings.set(
      MODULE_ID,
      'displayDetailedNpcInformation',
      true,
    );
    const detailedSettingRestoresStats = await waitUntil(() => (
      document.querySelectorAll(
        '#hyp3e-utilities-npc-action-hud .hyp3e-utilities-npc-action-hud__stats',
      ).length === 4
    ));

    await game.settings.set(MODULE_ID, 'enableNpcActionHud', false);
    const settingRemovesOverlay = await waitUntil(
      () => document.getElementById('hyp3e-utilities-npc-action-hud') == null,
    );

    return {
      canvasActivated,
      overlayReady,
      oneStableOverlay: overlayReady,
      rowCount: rowElements.length,
      rowNames: rowElements.map((row) => row.querySelector(
        '.hyp3e-utilities-npc-action-hud__actor',
      ).textContent.trim()),
      tokenRowsDistinct:
        new Set(rowElements.map((row) => row.dataset.tokenUuid)).size === 2,
      hpWidthsValid: rowElements.every((row) => {
        const width = Number.parseFloat(row.querySelector(
          '.hyp3e-utilities-npc-action-hud__actor-health',
        ).style.width);
        return Number.isFinite(width) && width >= 0 && width <= 100;
      }),
      statsRendered: rowElements.every((row) => (
        row.querySelectorAll('.hyp3e-utilities-npc-action-hud__stats dt').length
          === 5
      )),
      subtypeRemoved: rowElements.every((row) => (
        row.querySelector('.hyp3e-utilities-npc-action-hud__subtype') == null
      )),
      statLinesRendered: rowElements.every((row) => {
        const statLines = row.querySelectorAll(
          '.hyp3e-utilities-npc-action-hud__stats',
        );
        return statLines.length === 2
          && statLines[0].querySelectorAll('dt').length === 3
          && statLines[1].querySelectorAll('dt').length === 2;
      }),
      compactCardMarginsReset,
      compactCardHeightsUniform,
      detailedSettingHidesStats,
      detailedSettingRestoresStats,
      missingMoraleDisplayed: rowElements.some((row) => (
        row.querySelector('.hyp3e-utilities-npc-action-hud__missing')
          ?.textContent.trim() === 'Missing'
      )),
      saveOptions,
      fiveSaveSelector: saveOptions.join(',') === SAVE_KEYS.join(','),
      selectorPersists,
      exactActorSheetOpened,
      reactionCompleted,
      saveCompleted,
      moraleCompleted,
      actionMessageCount: messages.length,
      saveCategoryExplicit: saveMessages.every(
        (message) => message.flags[MODULE_ID].category === 'sorcery',
      ),
      viewportFit:
        initialRect.left >= 0
        && initialRect.top >= 0
        && initialRect.right <= window.innerWidth,
      settingRemovesOverlay,
    };
  }
  finally {
    if (openedSheet?.rendered) await openedSheet.close();
    canvas.tokens?.releaseAll();
    await game.settings.set(
      MODULE_ID,
      'displayDetailedNpcInformation',
      originalDetailed,
    );
    await game.settings.set(
      MODULE_ID,
      'enableNpcActionHud',
      originalEnabled,
    );
    if (originalScene && game.scenes.active?.id !== originalScene.id) {
      await originalScene.activate();
      await waitForCanvasScene(originalScene.id);
    }
    await scene.delete();
    await missingMoraleActor.delete();
  }
}

async function testProductionHudPosition(npc) {
  const originalScene = game.scenes.active;
  const originalEnabled = game.settings.get(MODULE_ID, 'enableNpcActionHud');
  const originalPosition = game.settings.get(
    MODULE_ID,
    'npcActionHudPosition',
  );
  const scene = await Scene.create({
    name: `${RUN_PREFIX} HUD Position`,
    active: false,
    navigation: false,
    width: 1200,
    height: 900,
    padding: 0,
    grid: {
      type: CONST.GRID_TYPES.SQUARE,
      size: 100,
      distance: 5,
    },
  });

  const approximately = (actual, expected) => Math.abs(actual - expected) <= 1;
  const getOverlay = () => document.getElementById(
    'hyp3e-utilities-npc-action-hud',
  );

  try {
    const [tokenDocument] = await scene.createEmbeddedDocuments('Token', [{
      name: `${RUN_PREFIX} Position Target`,
      actorId: npc.id,
      actorLink: false,
      x: 100,
      y: 100,
    }]);
    await game.settings.set(MODULE_ID, 'npcActionHudPosition', {});
    await game.settings.set(MODULE_ID, 'enableNpcActionHud', true);
    await scene.activate();
    const canvasActivated = await waitForCanvasScene(scene.id);
    if (!canvasActivated) throw new Error('HUD-006 scene did not activate.');

    const token = canvas.tokens.get(tokenDocument.id);
    canvas.tokens.releaseAll();
    token.control({ releaseOthers: true });
    const overlayReady = await waitUntil(() => Boolean(getOverlay()));
    if (!overlayReady) throw new Error('HUD-006 overlay did not render.');

    if (new URLSearchParams(window.location.search).has('hudPositionPreview')) {
      await wait(12000);
    }

    const initialOverlay = getOverlay();
    const initialRect = initialOverlay.getBoundingClientRect();
    const defaultPosition =
      approximately(initialRect.left, (window.innerWidth - initialRect.width) / 2)
      && approximately(initialRect.top, 12)
      && initialRect.width <= 704;
    const pointerHandlePresent = Boolean(
      initialOverlay.querySelector('[data-drag-handle]'),
    );

    await game.settings.set(MODULE_ID, 'npcActionHudPosition', {
      left: 99999,
      top: 99999,
      width: 99999,
    });
    const offscreenRecovered = await waitUntil(() => {
      const rect = getOverlay()?.getBoundingClientRect();
      return Boolean(
        rect
        && rect.left >= 12
        && rect.top >= 12
        && rect.right <= window.innerWidth - 11
        && rect.bottom <= window.innerHeight - 11
        && rect.width <= 704,
      );
    });

    const persistedPosition = { left: 40, top: 60, width: 500 };
    await game.settings.set(
      MODULE_ID,
      'npcActionHudPosition',
      persistedPosition,
    );
    const positioned = await waitUntil(() => {
      const rect = getOverlay()?.getBoundingClientRect();
      return Boolean(
        rect
        && approximately(rect.left, persistedPosition.left)
        && approximately(rect.top, persistedPosition.top)
        && approximately(rect.width, persistedPosition.width),
      );
    });

    await game.settings.set(MODULE_ID, 'enableNpcActionHud', false);
    const removed = await waitUntil(() => getOverlay() == null);
    await game.settings.set(MODULE_ID, 'enableNpcActionHud', true);
    const restoredAfterRecreate = await waitUntil(() => {
      const rect = getOverlay()?.getBoundingClientRect();
      return Boolean(
        rect
        && approximately(rect.left, persistedPosition.left)
        && approximately(rect.top, persistedPosition.top)
        && approximately(rect.width, persistedPosition.width),
      );
    });

    const dragOverlay = getOverlay();
    const dragRect = dragOverlay.getBoundingClientRect();
    const dragHandle = dragOverlay.querySelector('[data-drag-handle] h2');
    const pointerId = 61;
    const start = { x: dragRect.left + 20, y: dragRect.top + 20 };
    const finish = { x: start.x + 80, y: start.y + 50 };
    dragHandle.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: start.x,
      clientY: start.y,
      isPrimary: true,
      pointerId,
    }));
    dragOverlay.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      clientX: finish.x,
      clientY: finish.y,
      isPrimary: true,
      pointerId,
    }));
    dragOverlay.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      button: 0,
      clientX: finish.x,
      clientY: finish.y,
      isPrimary: true,
      pointerId,
    }));
    const dragPersisted = await waitUntil(() => {
      const position = game.settings.get(MODULE_ID, 'npcActionHudPosition');
      return approximately(position.left, persistedPosition.left + 80)
        && approximately(position.top, persistedPosition.top + 50)
        && approximately(position.width, persistedPosition.width);
    });

    await game.settings.set(MODULE_ID, 'npcActionHudPosition', {});
    const resetApplied = await waitUntil(() => {
      const rect = getOverlay()?.getBoundingClientRect();
      return Boolean(
        rect
        && approximately(rect.left, (window.innerWidth - rect.width) / 2)
        && approximately(rect.top, 12)
        && rect.width <= 704,
      );
    });
    window.dispatchEvent(new Event('resize'));
    await wait(50);
    const resizedRect = getOverlay()?.getBoundingClientRect();
    const resizeRemainsClamped = Boolean(
      resizedRect
      && resizedRect.left >= 12
      && resizedRect.top >= 12
      && resizedRect.right <= window.innerWidth - 11
      && resizedRect.bottom <= window.innerHeight - 11,
    );

    return {
      canvasActivated,
      overlayReady,
      defaultPosition,
      pointerHandlePresent,
      offscreenRecovered,
      positioned,
      removed,
      restoredAfterRecreate,
      dragPersisted,
      resetApplied,
      resizeRemainsClamped,
    };
  }
  finally {
    canvas.tokens?.releaseAll();
    await game.settings.set(
      MODULE_ID,
      'npcActionHudPosition',
      originalPosition,
    );
    await game.settings.set(
      MODULE_ID,
      'enableNpcActionHud',
      originalEnabled,
    );
    if (originalScene && game.scenes.active?.id !== originalScene.id) {
      await originalScene.activate();
      await waitForCanvasScene(originalScene.id);
    }
    await scene.delete();
  }
}

async function testProductionHudLifecycle(npc) {
  const api = game.modules.get(MODULE_ID).api;
  const originalScene = game.scenes.active;
  const originalEnabled = game.settings.get(MODULE_ID, 'enableNpcActionHud');
  const scene = await Scene.create({
    name: `${RUN_PREFIX} HUD Lifecycle`,
    active: false,
    navigation: false,
    width: 1200,
    height: 900,
    padding: 0,
    grid: {
      type: CONST.GRID_TYPES.SQUARE,
      size: 100,
      distance: 5,
    },
  });
  const getOverlayCount = () => document.querySelectorAll(
    '#hyp3e-utilities-npc-action-hud',
  ).length;

  try {
    const [tokenDocument] = await scene.createEmbeddedDocuments('Token', [{
      name: `${RUN_PREFIX} Lifecycle Target`,
      actorId: npc.id,
      actorLink: false,
      x: 100,
      y: 100,
    }]);
    await game.settings.set(MODULE_ID, 'enableNpcActionHud', true);
    await scene.activate();
    const canvasActivated = await waitForCanvasScene(scene.id);
    if (!canvasActivated) throw new Error('HUD-007 scene did not activate.');

    const token = canvas.tokens.get(tokenDocument.id);
    canvas.tokens.releaseAll();
    token.control({ releaseOthers: true });
    const overlayReady = await waitUntil(() => getOverlayCount() === 1);
    if (!overlayReady) throw new Error('HUD-007 overlay did not render.');

    let modelNotifications = 0;
    const unsubscribe = api.npcSelection.subscribe(() => {
      modelNotifications += 1;
    });
    const hpValues = [6, 5, 4, 3, 2];
    for (const hpValue of hpValues) {
      token.actor.updateSource({ 'system.hp.value': hpValue });
      Hooks.callAll('updateActor', token.actor, {}, {}, game.user.id);
      await wait(10);
    }
    await wait(100);
    const finalModel = api.npcSelection.getViewModel();
    const burstDebounced = modelNotifications === 1
      && finalModel.rows[0]?.hp.value === hpValues.at(-1);
    unsubscribe();

    let enableDisableClean = true;
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await game.settings.set(MODULE_ID, 'enableNpcActionHud', false);
      enableDisableClean &&= await waitUntil(() => getOverlayCount() === 0);
      await game.settings.set(MODULE_ID, 'enableNpcActionHud', true);
      enableDisableClean &&= await waitUntil(() => getOverlayCount() === 1);
    }

    let lifecycleCyclesClean = true;
    for (let cycle = 0; cycle < 2; cycle += 1) {
      api.npcActionHud.destroy();
      api.npcSelection.destroy();
      lifecycleCyclesClean &&= getOverlayCount() === 0;
      api.npcSelection.start();
      await api.npcActionHud.start();
      lifecycleCyclesClean &&= await waitUntil(() => getOverlayCount() === 1);
    }

    api.npcSelection.start();
    await api.npcActionHud.start();
    const idempotentStarts = getOverlayCount() === 1;

    return {
      canvasActivated,
      overlayReady,
      burstDebounced,
      finalHp: finalModel.rows[0]?.hp.value,
      modelNotifications,
      enableDisableClean,
      lifecycleCyclesClean,
      idempotentStarts,
      singleOverlay: getOverlayCount() === 1,
    };
  }
  finally {
    canvas.tokens?.releaseAll();
    await game.settings.set(
      MODULE_ID,
      'enableNpcActionHud',
      originalEnabled,
    );
    if (originalScene && game.scenes.active?.id !== originalScene.id) {
      await originalScene.activate();
      await waitForCanvasScene(originalScene.id);
    }
    await scene.delete();
  }
}

async function testProductionHudAccessibility(npc) {
  const api = game.modules.get(MODULE_ID).api;
  const originalScene = game.scenes.active;
  const originalEnabled = game.settings.get(MODULE_ID, 'enableNpcActionHud');
  const scene = await Scene.create({
    name: `${RUN_PREFIX} HUD Accessibility`,
    active: false,
    navigation: false,
    width: 1200,
    height: 900,
    padding: 0,
    grid: {
      type: CONST.GRID_TYPES.SQUARE,
      size: 100,
      distance: 5,
    },
  });
  const getOverlay = () => document.getElementById(
    'hyp3e-utilities-npc-action-hud',
  );

  try {
    const [tokenDocument] = await scene.createEmbeddedDocuments('Token', [{
      name: `${RUN_PREFIX} Accessibility Target`,
      actorId: npc.id,
      actorLink: false,
      x: 100,
      y: 100,
    }]);
    await game.settings.set(MODULE_ID, 'enableNpcActionHud', true);
    await scene.activate();
    const canvasActivated = await waitForCanvasScene(scene.id);
    if (!canvasActivated) throw new Error('HUD-008 scene did not activate.');

    const token = canvas.tokens.get(tokenDocument.id);
    for (const saveKey of SAVE_KEYS) {
      token.actor.system.saves[saveKey].curr = null;
    }
    token.actor.system.morale = null;
    canvas.tokens.releaseAll();
    token.control({ releaseOthers: true });
    Hooks.callAll('updateActor', token.actor, {}, {}, game.user.id);
    const overlayReady = await waitUntil(() => Boolean(getOverlay()));
    if (!overlayReady) throw new Error('HUD-008 overlay did not render.');
    await wait(100);

    const overlay = getOverlay();
    const region = overlay.querySelector('[role="region"]');
    const titleId = region?.getAttribute('aria-labelledby');
    const count = overlay.querySelector(
      '.hyp3e-utilities-npc-action-hud__count',
    );
    const dragHandle = overlay.querySelector('[data-drag-handle]');
    const reactionButton = overlay.querySelector('[data-action="reaction"]');
    const saveSelector = overlay.querySelector('[data-role="save-category"]');
    const saveButton = overlay.querySelector('[data-action="save"]');
    const moraleButton = overlay.querySelector('[data-action="morale"]');
    const actorButton = overlay.querySelector('[data-action="openActorSheet"]');
    const options = Array.from(saveSelector.options);
    const localizedActionFailure = game.i18n.localize(
      `${MODULE_ID}.hud.actionFailed`,
    );

    const chatCount = game.messages.size;
    let unavailableActionRejected = false;
    try {
      await api.npcActionHud.executeAction('save');
    }
    catch (error) {
      unavailableActionRejected = /unavailable/i.test(error.message);
    }
    const unavailableActionCreatesNoChat = game.messages.size === chatCount;

    const errorButton = getOverlay().querySelector('[data-action="reaction"]');
    errorButton.dataset.action = 'unsupported-diagnostic-action';
    errorButton.click();
    const localizedErrorNotice = await waitUntil(() => (
      Array.from(document.querySelectorAll('.notification'))
        .some((notification) => notification.textContent.includes(
          localizedActionFailure,
        ))
    ));

    token.actor.system.saves.device.curr = 11;
    Hooks.callAll('updateActor', token.actor, {}, {}, game.user.id);
    const partialSaveStateReady = await waitUntil(() => {
      const currentSelector = getOverlay()?.querySelector(
        '[data-role="save-category"]',
      );
      return currentSelector?.querySelector('option[value="device"]')
        ?.disabled === false;
    });
    const partialSaveSelector = getOverlay().querySelector(
      '[data-role="save-category"]',
    );
    partialSaveSelector.value = 'device';
    partialSaveSelector.dispatchEvent(new Event('change', { bubbles: true }));
    const selectedSaveEnablesAction = await waitUntil(() => (
      getOverlay()?.querySelector('[data-action="save"]')?.disabled === false
    ));

    return {
      canvasActivated,
      overlayReady,
      regionLabelled: Boolean(titleId && overlay.querySelector(`#${titleId}`)),
      selectionCountAnnounced: count?.getAttribute('aria-live') === 'polite',
      dragInstructionLocalized:
        dragHandle?.title === game.i18n.localize(`${MODULE_ID}.hud.dragHandle`),
      fiveSaveChoicesVisible:
        options.map((option) => option.value).join(',') === SAVE_KEYS.join(','),
      unavailableSaveChoicesDisabled: options.every((option) => option.disabled),
      unavailableSaveControlsDisabled:
        saveSelector.disabled && saveButton.disabled,
      unavailableMoraleDisabled: moraleButton.disabled,
      reactionRemainsAvailable: !reactionButton.disabled,
      nativeKeyboardControls: [reactionButton, actorButton].every(
        (control) => control instanceof HTMLButtonElement && control.tabIndex >= 0,
      ),
      actorLabelLocalized:
        actorButton.getAttribute('aria-label')
          === game.i18n.format(`${MODULE_ID}.hud.openActorSheetFor`, {
            name: token.document.name,
          }),
      unavailableActionRejected,
      unavailableActionCreatesNoChat,
      localizedErrorNotice,
      partialSaveStateReady,
      selectedSaveEnablesAction,
    };
  }
  finally {
    canvas.tokens?.releaseAll();
    await game.settings.set(
      MODULE_ID,
      'enableNpcActionHud',
      originalEnabled,
    );
    if (originalScene && game.scenes.active?.id !== originalScene.id) {
      await originalScene.activate();
      await waitForCanvasScene(originalScene.id);
    }
    await scene.delete();
  }
}

function validateProductionMutationPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('Diagnostic mutation payload must be an object.');
  }
  const allowedKeys = ['claimedUserId', 'value'];
  const unknownKey = Object.keys(payload).find(
    (key) => !allowedKeys.includes(key),
  );
  if (unknownKey) {
    throw new TypeError(`Unknown diagnostic payload field "${unknownKey}".`);
  }
  if (
    typeof payload.claimedUserId !== 'string'
    || !Number.isInteger(payload.value)
  ) {
    throw new TypeError('Diagnostic mutation payload fields are invalid.');
  }
  return {
    claimedUserId: payload.claimedUserId,
    value: payload.value,
  };
}

function registerProductionPartyDiagnostic() {
  const api = game.modules.get(MODULE_ID)?.api;
  api.partyMutations.registerOperation('party.compatibilityMutation', {
    execute: ({ expectedRevision, payload, requester, requestId }) => {
      productionMutationExecutions += 1;
      return {
        claimedUserId: payload.claimedUserId,
        executingUserId: game.user.id,
        executingUserIsGm: game.user.isGM,
        executionCount: productionMutationExecutions,
        expectedRevision,
        requestId,
        requesterUserId: requester.id,
        value: payload.value,
      };
    },
    validatePayload: validateProductionMutationPayload,
  });
  api.partyStore.registerMutation('party.compatibilityStateMutation', {
    async mutate({ payload, state }) {
      await wait(50);
      state.memberActorUuids.push(payload.actorUuid);
    },
    validatePayload(payload) {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new TypeError('Compatibility state payload must be an object.');
      }
      const unknownKey = Object.keys(payload).find(
        (key) => key !== 'actorUuid',
      );
      if (unknownKey) {
        throw new TypeError(`Unknown compatibility state field "${unknownKey}".`);
      }
      if (typeof payload.actorUuid !== 'string') {
        throw new TypeError('Compatibility actorUuid must be a string.');
      }
      return { actorUuid: payload.actorUuid };
    },
  });
  api.partyStore.registerMutation('party.compatibilityFollowerMutation', {
    async mutate({ payload, state }) {
      state.followerActorUuids.push(payload.actorUuid);
      state.followerWages[payload.actorUuid] = 2;
      state.shares[payload.actorUuid] = 1;
    },
    validatePayload(payload) {
      if (
        !payload
        || typeof payload !== 'object'
        || Array.isArray(payload)
        || Object.keys(payload).some((key) => key !== 'actorUuid')
        || typeof payload.actorUuid !== 'string'
      ) {
        throw new TypeError('Compatibility follower payload is invalid.');
      }
      return { actorUuid: payload.actorUuid };
    },
  });
  api.partyStore.registerMutation('party.compatibilityNotesMutation', {
    async mutate({ payload, state }) {
      state.notes = payload.notes;
    },
    validatePayload(payload) {
      if (
        !payload
        || typeof payload !== 'object'
        || Array.isArray(payload)
        || Object.keys(payload).some((key) => key !== 'notes')
        || typeof payload.notes !== 'string'
      ) {
        throw new TypeError('Compatibility notes payload is invalid.');
      }
      return { notes: payload.notes };
    },
  });
  api.partyStore.registerMutation('party.compatibilityCleanupSetup', {
    async mutate({ payload, state }) {
      state.treasuryActorUuid = payload.treasuryActorUuid;
      state.memberActorUuids.push(payload.memberActorUuid);
      state.followerActorUuids.push(payload.followerActorUuid);
      state.followerWages[payload.followerActorUuid] = 6;
      state.shares[payload.memberActorUuid] = 1.25;
      state.shares[payload.followerActorUuid] = 0.75;
      state.marchingOrder.front.actorUuids.push(payload.memberActorUuid);
      state.marchingOrder.rear.actorUuids.push(payload.followerActorUuid);
    },
    validatePayload(payload) {
      const keys = [
        'followerActorUuid',
        'memberActorUuid',
        'treasuryActorUuid',
      ];
      if (
        !payload
        || typeof payload !== 'object'
        || Array.isArray(payload)
        || Object.keys(payload).some((key) => !keys.includes(key))
        || keys.some((key) => typeof payload[key] !== 'string')
      ) {
        throw new TypeError('Compatibility cleanup payload is invalid.');
      }
      return Object.fromEntries(keys.map((key) => [key, payload[key]]));
    },
  });
  api.partyStore.registerMutation('party.compatibilityTreasuryMutation', {
    async mutate({ payload, state }) {
      state.treasuryActorUuid = payload.actorUuid;
    },
    validatePayload(payload) {
      if (
        !payload
        || typeof payload !== 'object'
        || Array.isArray(payload)
        || Object.keys(payload).some((key) => key !== 'actorUuid')
        || typeof payload.actorUuid !== 'string'
      ) {
        throw new TypeError('Compatibility treasury payload is invalid.');
      }
      return { actorUuid: payload.actorUuid };
    },
  });
}

function testProductionPartyPermissions() {
  const { evaluatePartyEditPermission } = game.modules.get(MODULE_ID)
    .api.partyPermissions;
  const decide = (user, minimumEditRole, explicitEditorUserIds = []) => (
    evaluatePartyEditPermission({
      explicitEditorUserIds,
      minimumEditRole,
      user,
    })
  );
  const gm = decide({ id: 'gm', isGM: true, role: 0 }, 4, 'malformed');
  const threshold = decide(
    { id: 'trusted', isGM: false, role: 2 },
    2,
  );
  const explicit = decide(
    { id: 'explicit', isGM: false, role: 1 },
    4,
    ['explicit'],
  );
  const denied = decide(
    { id: 'denied', isGM: false, role: 1 },
    4,
  );
  const invalid = decide(
    { id: 'invalid', isGM: false, role: 4 },
    '4',
  );
  return {
    gm,
    threshold,
    explicit,
    denied,
    invalid,
    matrixPassed:
      gm.allowed
      && gm.reason === 'gm'
      && threshold.allowed
      && threshold.reason === 'minimumRole'
      && explicit.allowed
      && explicit.reason === 'explicitGrant'
      && !denied.allowed
      && denied.reason === 'denied'
      && !invalid.allowed
      && invalid.reason === 'invalidConfiguration',
  };
}

async function grantDiagnosticPartyAccess() {
  const diagnosticPlayerName = `${RUN_PREFIX} Player`;
  let diagnosticPlayer = game.users.find(
    (user) => user.name === diagnosticPlayerName,
  );
  diagnosticPlayer ??= await User.create({
    name: diagnosticPlayerName,
    role: CONST.USER_ROLES.PLAYER,
  });
  const playerUserIds = [diagnosticPlayer.id];
  const current = game.settings.get(
    MODULE_ID,
    'partySheetExplicitEditorUserIds',
  );
  await game.settings.set(
    MODULE_ID,
    'partySheetExplicitEditorUserIds',
    [...new Set([...current, ...playerUserIds])],
  );
  return playerUserIds;
}

async function testProductionPartySheetApplication() {
  const api = game.modules.get(MODULE_ID).api;
  const PartySheet = api.applications.OpenPartySheetApplication;
  const menu = game.settings.menus.get(`${MODULE_ID}.openPartySheet`);
  const first = new PartySheet();
  const reopened = new PartySheet();
  const singletonBeforeRender = first === reopened;
  await first.render({ force: true });
  const rendered = await waitUntil(
    () => first.rendered && first.element?.isConnected,
  );
  const tabButtons = [...first.element.querySelectorAll('[role="tab"]')];
  const initialRevisionText = first.element.textContent.includes(
    String(api.partyStore.getState().revision),
  );
  const settingsMenuUsesSingletonClass = menu?.type === PartySheet;
  const followersButton = first.element.querySelector(
    '[data-action="selectTab"][data-tab="followers"]',
  );
  followersButton?.click();
  const tabChanged = await waitUntil(() => (
    first.element?.querySelector('[data-tab="followers"]')
      ?.getAttribute('aria-selected') === 'true'
  ));
  let externalRenderCount = 0;
  const originalRender = first.render.bind(first);
  first.render = async (...args) => {
    externalRenderCount += 1;
    return originalRender(...args);
  };
  Hooks.callAll(`${MODULE_ID}.partyStateUpdated`, api.partyStore.getState());
  const externalUpdateRerendered = await waitUntil(
    () => externalRenderCount >= 1,
  );
  await reopened.render({ force: true });
  const oneConnectedWindow = document.querySelectorAll(
    `#${MODULE_ID}-party-sheet`,
  ).length === 1;
  await first.close();
  const renderCountAfterClose = externalRenderCount;
  Hooks.callAll(`${MODULE_ID}.partyStateUpdated`, api.partyStore.getState());
  await wait(100);
  const closedListenerRemoved = externalRenderCount === renderCountAfterClose;
  const replacement = new PartySheet();
  const replacementCreated = replacement !== first;
  await replacement.render({ force: true });
  const replacementRendered = await waitUntil(
    () => replacement.rendered && replacement.element?.isConnected,
  );
  await replacement.close();

  return {
    singletonBeforeRender,
    rendered,
    sixTabs: tabButtons.length === 6,
    initialRevisionText,
    settingsMenuUsesSingletonClass,
    tabChanged,
    externalUpdateRerendered,
    oneConnectedWindow,
    closedListenerRemoved,
    replacementCreated,
    replacementRendered,
  };
}

async function testProductionPartyMembers(character, npc) {
  const api = game.modules.get(MODULE_ID).api;
  const request = (operation, actorUuid) => api.partyMutations.request(
    operation,
    {
      expectedRevision: api.partyStore.getState().revision,
      payload: { actorUuid },
      requestId: `par006-${foundry.utils.randomID()}`,
    },
  );
  const characterAdd = await request('party.addMember', character.uuid);
  const revisionAfterCharacter = api.partyStore.getState().revision;
  const npcAdd = await request('party.addMember', npc.uuid);
  const revisionAfterNpc = api.partyStore.getState().revision;
  const rowsAfterAdd = api.partyMembers.getMemberRows();
  const characterRow = rowsAfterAdd.find(
    (row) => row.actorUuid === character.uuid,
  );
  const PartySheet = api.applications.OpenPartySheetApplication;
  const sheet = new PartySheet();
  await sheet.render({ force: true });
  const overviewRendered = await waitUntil(() => Boolean(
    sheet.element?.querySelector(
      `[data-action="openMember"][data-actor-uuid="${character.uuid}"]`,
    ),
  ));
  const overviewText = sheet.element?.textContent ?? '';
  const memberElement = sheet.element?.querySelector(
    `[data-party-actor-row]:has([data-action="openMember"][data-actor-uuid="${character.uuid}"])`,
  );
  const portraitPing = memberElement?.querySelector(
    `.hyp3e-utilities__party-member-portrait[data-action="pingActor"][data-actor-uuid="${character.uuid}"]`,
  );
  const memberSaveActions = memberElement?.querySelector(
    '.hyp3e-utilities__party-row-actions--member',
  );
  const memberSaveSelect = memberSaveActions?.querySelector(
    '[data-field="party-save"]',
  );
  const memberSaveButton = memberSaveActions?.querySelector(
    '[data-action="rollMemberSave"]',
  );
  const memberRemoveButton = memberElement?.querySelector(
    '.hyp3e-utilities__party-member-remove--icon',
  );
  const memberStatsRect = memberElement?.querySelector(
    '.hyp3e-utilities__party-member-stats',
  )?.getBoundingClientRect?.();
  const memberStatRects = Object.fromEntries([
    'hp', 'ac', 'dr', 'movement', 'share',
  ].map((stat) => [
    stat,
    memberElement?.querySelector(
      `.hyp3e-utilities__party-member-stat--${stat}`,
    )?.getBoundingClientRect?.(),
  ]));
  const memberSaveActionsRect = memberSaveActions?.getBoundingClientRect?.();
  const memberRemoveRect = memberRemoveButton?.getBoundingClientRect?.();
  const saveSelectRect = memberSaveSelect?.getBoundingClientRect?.();
  const saveButtonRect = memberSaveButton?.getBoundingClientRect?.();
  const portraitPingIntegrated = Boolean(
    portraitPing?.querySelector('img')
    && portraitPing.getAttribute('aria-label')
    && portraitPing.textContent.trim() === '',
  );
  const memberSaveActionsCompact = Boolean(
    memberSaveSelect
    && memberSaveButton
    && saveSelectRect.width <= 120
    && Math.abs(saveSelectRect.top - saveButtonRect.top) <= 2,
  );
  const memberControlsDoNotOverlap = Boolean(
    memberRemoveButton?.querySelector('.fa-xmark')
    && memberRemoveButton.getAttribute('aria-label')
    && memberRemoveButton.textContent.trim() === ''
    && memberStatsRect.right <= memberSaveActionsRect.left
    && memberSaveActionsRect.right <= memberRemoveRect.left,
  );
  const memberStatsUseTwoVisibleLines = Boolean(
    Math.abs(memberStatRects.hp.top - memberStatRects.ac.top) <= 2
    && Math.abs(memberStatRects.ac.top - memberStatRects.dr.top) <= 2
    && memberStatRects.movement.top > memberStatRects.hp.top
    && Math.abs(
      memberStatRects.movement.top - memberStatRects.share.top,
    ) <= 2
    && memberStatRects.share.right <= memberStatsRect.right + 1,
  );

  sheet.element?.querySelector(
    `[data-action="openMember"][data-actor-uuid="${character.uuid}"]`,
  )?.click();
  const actorSheetOpened = await waitUntil(() => character.sheet?.rendered);
  if (character.sheet?.rendered) await character.sheet.close();

  sheet.element?.querySelector(
    `[data-action="removeMember"][data-actor-uuid="${character.uuid}"]`,
  )?.click();
  const removedThroughUi = await waitUntil(
    () => !api.partyStore.getState().memberActorUuids.includes(character.uuid),
  );

  await sheet._handleActorDrop({
    preventDefault: () => {},
    dataTransfer: {
      getData: () => JSON.stringify({ type: 'Actor', uuid: character.uuid }),
    },
  });
  const actorDropAdded = api.partyStore.getState().memberActorUuids.includes(
    character.uuid,
  );
  if (actorDropAdded) await request('party.removeMember', character.uuid);
  await sheet.close();

  const missingActor = await Actor.create({
    name: `${RUN_PREFIX} Deleted Member`,
    type: 'character',
  });
  const missingActorUuid = missingActor.uuid;
  const missingAdd = await request('party.addMember', missingActorUuid);
  await missingActor.delete();
  const missingRowRetained = api.partyMembers.getMemberRows().some(
    (row) => row.actorUuid === missingActorUuid && row.missing,
  );
  const missingSheet = new PartySheet();
  await missingSheet.render({ force: true });
  const missingReferenceRendered = await waitUntil(() => Boolean(
    missingSheet.element?.querySelector(
      `.hyp3e-utilities__party-member--missing [data-actor-uuid="${missingActorUuid}"]`,
    ),
  ));
  missingSheet.element?.querySelector(
    `[data-action="removeMember"][data-actor-uuid="${missingActorUuid}"]`,
  )?.click();
  const missingReferenceCleaned = await waitUntil(
    () => !api.partyStore.getState().memberActorUuids.includes(missingActorUuid),
  );
  await missingSheet.close();

  return {
    characterAddSucceeded: characterAdd.ok,
    npcRejected:
      !npcAdd.ok && npcAdd.error.code === 'invalidActor',
    stateRevisionAdvancedOnce:
      characterAdd.ok
      && revisionAfterCharacter === characterAdd.value.state.revision
      && revisionAfterNpc === revisionAfterCharacter,
    summaryMatchesAdapter:
      characterRow?.summary?.uuid === character.uuid
      && characterRow.summary.name === character.name
      && characterRow.summary.type === 'character',
    overviewRendered,
    overviewShowsCharacter:
      overviewText.includes(character.name)
      && overviewText.includes(
        `${characterRow?.summary?.hp?.value} / ${characterRow?.summary?.hp?.max}`,
      ),
    portraitPingIntegrated,
    memberSaveActionsCompact,
    memberControlsDoNotOverlap,
    memberStatsUseTwoVisibleLines,
    actorSheetOpened,
    removedThroughUi,
    actorDropAdded,
    missingAddSucceeded: missingAdd.ok,
    missingRowRetained,
    missingReferenceRendered,
    missingReferenceCleaned,
  };
}

async function testProductionPartyFollowers(character, npc) {
  const api = game.modules.get(MODULE_ID).api;
  const request = (operation, payload) => api.partyMutations.request(
    operation,
    {
      expectedRevision: api.partyStore.getState().revision,
      payload,
      requestId: `par007-${foundry.utils.randomID()}`,
    },
  );
  const characterAdd = await request(
    'party.addFollower',
    { actorUuid: character.uuid },
  );
  const PartySheet = api.applications.OpenPartySheetApplication;
  const sheet = new PartySheet();
  await sheet.render({ force: true });
  sheet.element?.querySelector(
    '[data-action="selectTab"][data-tab="followers"]',
  )?.click();
  const followersTabRendered = await waitUntil(() => (
    sheet.element?.querySelector('[data-tab="followers"]')
      ?.getAttribute('aria-selected') === 'true'
  ));

  await sheet._handleFollowerDrop({
    preventDefault: () => {},
    dataTransfer: {
      getData: () => JSON.stringify({ type: 'Actor', uuid: npc.uuid }),
    },
  });
  const npcDropAdded = await waitUntil(() => (
    api.partyStore.getState().followerActorUuids.includes(npc.uuid)
  ));
  const twoFollowersRendered = await waitUntil(() => (
    sheet.element?.querySelectorAll('[data-follower-row]')?.length === 2
  ));
  const rows = api.partyFollowers.getFollowerRows();
  const npcRow = rows.find((row) => row.actorUuid === npc.uuid);
  const npcElement = [...sheet.element.querySelectorAll('[data-follower-row]')]
    .find((row) => row.querySelector(
      `[data-actor-uuid="${npc.uuid}"]`,
    ));
  const npcSubtypeRendered = (
    npcRow?.npcSubtype === api.adapter.getNpcSubtype(npc)
    && sheet.element?.textContent?.includes(npcRow.npcSubtype)
  );
  const wageInput = npcElement?.querySelector('[data-field="follower-wage"]');
  const shareInput = npcElement?.querySelector('[data-field="follower-share"]');
  const followerPortrait = npcElement?.querySelector(
    '.hyp3e-utilities__party-follower-portrait[data-action="pingActor"]',
  );
  const followerEmployment = npcElement?.querySelector(
    '.hyp3e-utilities__party-employment--compact',
  );
  const followerActions = npcElement?.querySelector(
    '.hyp3e-utilities__party-row-actions--follower',
  );
  const followerRemove = npcElement?.querySelector(
    '.hyp3e-utilities__party-follower-remove--icon',
  );
  const followerStatRects = Object.fromEntries([
    'hp', 'ac', 'dr', 'movement', 'share',
  ].map((stat) => [
    stat,
    npcElement?.querySelector(
      `.hyp3e-utilities__party-member-stat--${stat}`,
    )?.getBoundingClientRect?.(),
  ]));
  const followerEmploymentRect = followerEmployment?.getBoundingClientRect?.();
  const followerActionsRect = followerActions?.getBoundingClientRect?.();
  const followerRemoveRect = followerRemove?.getBoundingClientRect?.();
  const centerY = (rect) => rect.top + (rect.height / 2);
  const compactFollowerRosterRendered = Boolean(
    followerPortrait?.querySelector('img')
    && followerPortrait.getAttribute('aria-label')
    && followerPortrait.textContent.trim() === ''
    && shareInput?.closest('.hyp3e-utilities__party-member-stat--share')
    && wageInput?.closest('.hyp3e-utilities__party-employment--compact')
    && followerActions?.querySelector('[data-field="party-save"]')
    && followerActions?.querySelector('[data-action="rollFollowerSave"]')
    && followerActions?.querySelector('[data-action="rollFollowerMorale"]')
    && followerRemove?.querySelector('.fa-xmark')
    && followerRemove === npcElement.lastElementChild
    && Math.abs(centerY(followerStatRects.hp) - centerY(followerStatRects.ac)) <= 2
    && Math.abs(centerY(followerStatRects.ac) - centerY(followerStatRects.dr)) <= 2
    && Math.abs(centerY(followerStatRects.dr) - centerY(followerActionsRect)) <= 2
    && followerActionsRect.left >= followerStatRects.dr.right
    && followerStatRects.movement.top > followerStatRects.hp.top
    && Math.abs(
      centerY(followerStatRects.movement) - centerY(followerStatRects.share),
    ) <= 2
    && Math.abs(
      centerY(followerStatRects.share) - centerY(followerEmploymentRect),
    ) <= 2
    && followerEmploymentRect.left >= followerStatRects.share.right
    && Math.abs(centerY(followerEmploymentRect) - centerY(followerRemoveRect)) <= 2,
  );
  if (wageInput) wageInput.value = '5';
  if (shareInput) shareInput.value = '0.75';
  npcElement?.querySelector('[data-action="saveFollower"]')?.click();
  const employmentSaved = await waitUntil(() => (
    api.partyStore.getState().followerWages[npc.uuid] === 5
    && api.partyStore.getState().shares[npc.uuid] === 0.75
  ));

  sheet.element?.querySelector(
    `[data-action="openFollower"][data-actor-uuid="${npc.uuid}"]`,
  )?.click();
  const actorSheetOpened = await waitUntil(() => npc.sheet?.rendered);
  if (npc.sheet?.rendered) await npc.sheet.close();

  sheet.element?.querySelector(
    `[data-action="removeFollower"][data-actor-uuid="${character.uuid}"]`,
  )?.click();
  const characterRemoved = await waitUntil(() => (
    !api.partyStore.getState().followerActorUuids.includes(character.uuid)
  ));

  const missingActor = await Actor.create({
    name: `${RUN_PREFIX} Deleted Follower`,
    type: 'npc',
  });
  const missingActorUuid = missingActor.uuid;
  const missingAdd = await request(
    'party.addFollower',
    { actorUuid: missingActorUuid },
  );
  await missingActor.delete();
  await sheet.render({ force: true });
  const missingRowRetained = api.partyFollowers.getFollowerRows().some(
    (row) => row.actorUuid === missingActorUuid && row.missing,
  );
  const missingReferenceRendered = Boolean(sheet.element?.querySelector(
    `.hyp3e-utilities__party-member--missing [data-actor-uuid="${missingActorUuid}"]`,
  ));
  sheet.element?.querySelector(
    `[data-action="removeFollower"][data-actor-uuid="${missingActorUuid}"]`,
  )?.click();
  const missingReferenceCleaned = await waitUntil(() => (
    !api.partyStore.getState().followerActorUuids.includes(missingActorUuid)
  ));
  const npcRemove = await request(
    'party.removeFollower',
    { actorUuid: npc.uuid },
  );
  await sheet.close();

  return {
    characterAddSucceeded: characterAdd.ok,
    followersTabRendered,
    npcDropAdded,
    twoFollowersRendered,
    characterAndNpcRows:
      rows.some((row) => (
        row.actorUuid === character.uuid
        && row.summary?.type === 'character'
      ))
      && npcRow?.summary?.type === 'npc',
    npcSubtypeRendered,
    compactFollowerRosterRendered,
    employmentSaved,
    actorSheetOpened,
    characterRemoved,
    missingAddSucceeded: missingAdd.ok,
    missingRowRetained,
    missingReferenceRendered,
    missingReferenceCleaned,
    npcRemoved: npcRemove.ok,
  };
}

async function testProductionPartyActions(character, npc) {
  const api = game.modules.get(MODULE_ID).api;
  const originalScene = game.scenes.active;
  const scene = await Scene.create({
    name: `${RUN_PREFIX} Party Actions`,
    active: false,
    navigation: false,
    width: 1200,
    height: 900,
    padding: 0,
    grid: {
      type: CONST.GRID_TYPES.SQUARE,
      size: 100,
      distance: 5,
    },
  });
  let sheet;
  let originalPing;
  let originalNotificationError;

  const request = (operation, actorUuid) => api.partyMutations.request(
    operation,
    {
      expectedRevision: api.partyStore.getState().revision,
      payload: { actorUuid },
      requestId: `par008-${foundry.utils.randomID()}`,
    },
  );

  try {
    const tokenDocuments = await scene.createEmbeddedDocuments('Token', [
      {
        name: `${RUN_PREFIX} Party Character`,
        actorId: character.id,
        actorLink: true,
        x: 100,
        y: 100,
      },
      {
        name: `${RUN_PREFIX} Party NPC`,
        actorId: npc.id,
        actorLink: true,
        x: 300,
        y: 100,
      },
    ]);
    await scene.activate();
    const canvasActivated = await waitForCanvasScene(scene.id);
    const characterToken = tokenDocuments.find(
      (token) => token.actorId === character.id,
    );
    const npcToken = tokenDocuments.find((token) => token.actorId === npc.id);
    const characterCenter = { ...canvas.tokens.get(characterToken.id).center };
    const npcCenter = { ...canvas.tokens.get(npcToken.id).center };
    await request('party.addMember', character.uuid);
    await request('party.addFollower', npc.uuid);

    const pings = [];
    const notices = [];
    originalPing = canvas.ping;
    canvas.ping = async (origin, options) => {
      pings.push({ x: origin.x, y: origin.y });
      return originalPing.call(canvas, origin, options);
    };
    originalNotificationError = ui.notifications.error;
    ui.notifications.error = (message, options) => {
      notices.push(message);
      return originalNotificationError.call(ui.notifications, message, options);
    };

    const beforeMessageIds = new Set(game.messages.map((message) => message.id));
    const partyMessages = () => game.messages.filter((message) => (
      !beforeMessageIds.has(message.id)
      && message.getFlag(MODULE_ID, 'feature') === 'npcActionHud'
    ));
    sheet = new api.applications.OpenPartySheetApplication();
    await sheet.render({ force: true });
    const memberRow = [...sheet.element.querySelectorAll(
      '[data-party-actor-row]',
    )].find((row) => row.querySelector(
      `[data-actor-uuid="${character.uuid}"]`,
    ));
    const memberSave = memberRow.querySelector('[data-field="party-save"]');
    const memberFiveSaves = memberSave.options.length === 5;
    memberSave.value = 'device';
    memberRow.querySelector('[data-action="pingActor"]').click();
    const memberPinged = await waitUntil(() => pings.length === 1);
    memberRow.querySelector('[data-action="rollMemberSave"]').click();
    const memberSaveCreated = await waitUntil(() => partyMessages().length >= 1);

    sheet.element.querySelector(
      '[data-action="selectTab"][data-tab="followers"]',
    ).click();
    await waitUntil(() => (
      sheet.element?.querySelector('[data-tab="followers"]')
        ?.getAttribute('aria-selected') === 'true'
    ));
    const followerRow = [...sheet.element.querySelectorAll(
      '[data-party-actor-row]',
    )].find((row) => row.querySelector(
      `[data-actor-uuid="${npc.uuid}"]`,
    ));
    const followerSave = followerRow.querySelector('[data-field="party-save"]');
    const followerFiveSaves = followerSave.options.length === 5;
    followerSave.value = 'sorcery';
    followerRow.querySelector('[data-action="pingActor"]').click();
    const followerPinged = await waitUntil(() => pings.length === 2);
    followerRow.querySelector('[data-action="rollFollowerSave"]').click();
    const followerSaveCreated = await waitUntil(() => partyMessages().length >= 2);
    followerRow.querySelector('[data-action="rollFollowerMorale"]').click();
    const followerMoraleCreated = await waitUntil(() => partyMessages().length >= 3);
    sheet.element.querySelector('[data-action="rollAllFollowerMorale"]').click();
    const bulkMoraleCreated = await waitUntil(() => partyMessages().length >= 4);

    await scene.deleteEmbeddedDocuments('Token', [characterToken.id]);
    const pingsBeforeMissing = pings.length;
    sheet.element.querySelector(
      '[data-action="selectTab"][data-tab="overview"]',
    ).click();
    await waitUntil(() => (
      sheet.element?.querySelector('[data-tab="overview"]')
        ?.getAttribute('aria-selected') === 'true'
    ));
    sheet.element.querySelector(
      `[data-action="pingActor"][data-actor-uuid="${character.uuid}"]`,
    ).click();
    const missingTokenNotice = await waitUntil(() => notices.includes(
      `${MODULE_ID}.applications.partySheet.tokenUnavailable`,
    ));
    const missingTokenCreatedNoPing = pings.length === pingsBeforeMissing;

    const messages = partyMessages();
    const messageFlags = messages.map((message) => ({
      action: message.getFlag(MODULE_ID, 'action'),
      actorUuid: message.getFlag(MODULE_ID, 'actorUuid'),
      category: message.getFlag(MODULE_ID, 'category'),
      whisper: [...message.whisper],
    }));
    const gmIds = new Set(game.users.filter((user) => user.isGM).map(
      (user) => user.id,
    ));
    const allWhisperedOnlyToGms = messageFlags.every((entry) => (
      entry.whisper.length > 0
      && entry.whisper.every((userId) => gmIds.has(userId))
    ));

    return {
      canvasActivated,
      memberFiveSaves,
      followerFiveSaves,
      memberPinged,
      followerPinged,
      pingCentersMatch:
        pings[0]?.x === characterCenter.x
        && pings[0]?.y === characterCenter.y
        && pings[1]?.x === npcCenter.x
        && pings[1]?.y === npcCenter.y,
      memberSaveCreated,
      followerSaveCreated,
      followerMoraleCreated,
      bulkMoraleCreated,
      exactlyFourMessages: messages.length === 4,
      actionsReuseExpectedFlags:
        messageFlags[0]?.action === 'save'
        && messageFlags[0]?.category === 'device'
        && messageFlags[0]?.actorUuid === character.uuid
        && messageFlags[1]?.action === 'save'
        && messageFlags[1]?.category === 'sorcery'
        && messageFlags[1]?.actorUuid === npc.uuid
        && messageFlags.slice(2).every((entry) => (
          entry.action === 'morale' && entry.actorUuid === npc.uuid
        )),
      allWhisperedOnlyToGms,
      missingTokenNotice,
      missingTokenCreatedNoPing,
    };
  }
  finally {
    if (originalPing) canvas.ping = originalPing;
    if (originalNotificationError) {
      ui.notifications.error = originalNotificationError;
    }
    if (sheet?.rendered) await sheet.close();
    const state = api.partyStore.getState();
    if (state.memberActorUuids.includes(character.uuid)) {
      await request('party.removeMember', character.uuid);
    }
    if (api.partyStore.getState().followerActorUuids.includes(npc.uuid)) {
      await request('party.removeFollower', npc.uuid);
    }
    if (originalScene && game.scenes.active?.id !== originalScene.id) {
      await originalScene.activate();
      await waitForCanvasScene(originalScene.id);
    }
    await scene.delete();
  }
}

async function testProductionPartyCleanup() {
  const api = game.modules.get(MODULE_ID).api;
  const originalTreasuryActorUuid = api.partyStore.getState()
    .treasuryActorUuid;
  let member;
  let follower;
  let treasury;
  let scene;
  const request = (operation, payload, suffix) => api.partyMutations.request(
    operation,
    {
      expectedRevision: api.partyStore.getState().revision,
      payload,
      requestId: `par010-${game.user.id}-${suffix}`,
    },
  );

  try {
    [member, follower, treasury] = await Actor.createDocuments([
      { name: `${RUN_PREFIX} Cleanup Member`, type: 'character' },
      { name: `${RUN_PREFIX} Cleanup Follower`, type: 'npc' },
      { name: `${RUN_PREFIX} Cleanup Treasury`, type: 'treasure' },
    ]);
    const setupResult = await request(
      'party.compatibilityCleanupSetup',
      {
        followerActorUuid: follower.uuid,
        memberActorUuid: member.uuid,
        treasuryActorUuid: treasury.uuid,
      },
      'setup',
    );
    const setupObserved = await waitUntil(() => {
      const state = api.partyStore.getState();
      return state.memberActorUuids.includes(member.uuid)
        && state.followerActorUuids.includes(follower.uuid)
        && state.treasuryActorUuid === treasury.uuid;
    });

    scene = await Scene.create({
      name: `${RUN_PREFIX} Cleanup Synthetic`,
      active: false,
      navigation: false,
    });
    const [token] = await scene.createEmbeddedDocuments('Token', [{
      actorId: follower.id,
      actorLink: false,
      name: `${RUN_PREFIX} Cleanup Synthetic`,
    }]);
    const beforeSyntheticRevision = api.partyStore.getState().revision;
    const syntheticResult = await api.partyCleanup.pruneDeletedActor(
      token.actor,
    );
    await token.delete();
    await wait(200);
    const afterSynthetic = api.partyStore.getState();

    const beforeTreasuryRevision = afterSynthetic.revision;
    await treasury.delete();
    await wait(300);
    const afterTreasury = api.partyStore.getState();

    const beforeMemberRevision = afterTreasury.revision;
    await member.delete();
    const memberCleanupObserved = await waitUntil(() => (
      !api.partyStore.getState().memberActorUuids.includes(member.uuid)
    ));
    const afterMember = api.partyStore.getState();

    const beforeFollowerRevision = afterMember.revision;
    await follower.delete();
    const followerCleanupObserved = await waitUntil(() => (
      !api.partyStore.getState().followerActorUuids.includes(follower.uuid)
    ));
    const afterFollower = api.partyStore.getState();

    return {
      setupSucceeded: setupResult.ok && setupObserved,
      syntheticSkipped: syntheticResult.skipped === true,
      syntheticDeletionDidNotRevise:
        afterSynthetic.revision === beforeSyntheticRevision,
      syntheticDeletionKeptFollower:
        afterSynthetic.followerActorUuids.includes(follower.uuid),
      treasuryDeletionDidNotRevise:
        afterTreasury.revision === beforeTreasuryRevision,
      treasuryReferencePreserved:
        afterTreasury.treasuryActorUuid === treasury.uuid,
      memberCleanupObserved,
      memberCleanupRevisedOnce:
        afterMember.revision === beforeMemberRevision + 1,
      memberMetadataPruned:
        !Object.hasOwn(afterMember.shares, member.uuid)
        && !afterMember.marchingOrder.front.actorUuids.includes(member.uuid),
      followerRetainedAfterMemberCleanup:
        afterMember.followerActorUuids.includes(follower.uuid)
        && afterMember.followerWages[follower.uuid] === 6,
      followerCleanupObserved,
      followerCleanupRevisedOnce:
        afterFollower.revision === beforeFollowerRevision + 1,
      followerMetadataPruned:
        !Object.hasOwn(afterFollower.followerWages, follower.uuid)
        && !Object.hasOwn(afterFollower.shares, follower.uuid)
        && !afterFollower.marchingOrder.rear.actorUuids.includes(follower.uuid),
      treasuryStillPreservedAfterTrackedCleanup:
        afterFollower.treasuryActorUuid === treasury.uuid,
    };
  }
  finally {
    if (scene) await scene.delete();
    const actorIds = [member, follower, treasury]
      .filter((actor) => actor && game.actors.has(actor.id))
      .map((actor) => actor.id);
    if (actorIds.length) await Actor.deleteDocuments(actorIds);
    await api.partyCleanup.pruneMissingReferences();
    if (
      api.partyStore.getState().treasuryActorUuid
      !== originalTreasuryActorUuid
    ) {
      await request(
        'party.compatibilityTreasuryMutation',
        { actorUuid: originalTreasuryActorUuid },
        'restore-treasury',
      );
    }
  }
}

async function testProductionMarchingOrder(character, npc) {
  const api = game.modules.get(MODULE_ID).api;
  const request = (operation, payload, suffix) => api.partyMutations.request(
    operation,
    {
      expectedRevision: api.partyStore.getState().revision,
      payload,
      requestId: `mar002-gm-${game.user.id}-${suffix}`,
    },
  );
  let sheet;

  try {
    const memberResult = await request(
      'party.addMember',
      { actorUuid: character.uuid },
      'member',
    );
    const followerResult = await request(
      'party.addFollower',
      { actorUuid: npc.uuid },
      'follower',
    );
    sheet = new api.applications.OpenPartySheetApplication();
    await sheet.render({ force: true });
    sheet.element.querySelector(
      '[data-action="selectTab"][data-tab="marchingOrder"]',
    ).click();
    const marchingRendered = await waitUntil(() => (
      sheet.element?.querySelectorAll('[data-marching-rank]').length >= 4
    ));
    const getRow = (actorUuid) => sheet.element?.querySelector(
      `[data-marching-row][data-actor-uuid="${actorUuid}"]`,
    );
    const initialCharacterRow = getRow(character.uuid);
    const initialNpcRow = getRow(npc.uuid);
    const enrichedRows = initialCharacterRow?.textContent.includes(
      character.name,
    ) && initialNpcRow?.textContent.includes(npc.name);
    const accessibleControls = [initialCharacterRow, initialNpcRow].every(
      (row) => row?.querySelectorAll(
        '[data-action="moveMarchingActor"]',
      ).length === 4,
    );
    const unassignedPreviousDisabled = initialCharacterRow?.querySelector(
      '[data-action="moveMarchingActor"][data-target-rank=""]',
    )?.disabled === true;

    initialCharacterRow.querySelector(
      '[data-action="moveMarchingActor"][data-target-rank="front"]',
    ).click();
    const characterMovedFront = await waitUntil(() => (
      api.partyStore.getState().marchingOrder.front.actorUuids.includes(
        character.uuid,
      )
    ));
    getRow(npc.uuid).querySelector(
      '[data-action="moveMarchingActor"][data-target-rank="front"]',
    ).click();
    const npcMovedFront = await waitUntil(() => (
      api.partyStore.getState().marchingOrder.front.actorUuids.at(-1)
        === npc.uuid
    ));
    getRow(npc.uuid).querySelector(
      '[data-action="moveMarchingActor"][data-target-rank="front"][data-target-position="0"]',
    ).click();
    const movedUp = await waitUntil(() => (
      api.partyStore.getState().marchingOrder.front.actorUuids[0] === npc.uuid
    ));

    const dataTransfer = new DataTransfer();
    getRow(character.uuid).dispatchEvent(new DragEvent('dragstart', {
      bubbles: true,
      dataTransfer,
    }));
    sheet.element.querySelector(
      '[data-marching-rank="middle"]',
    ).dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      dataTransfer,
    }));
    const dragMovedMiddle = await waitUntil(() => (
      api.partyStore.getState().marchingOrder.middle.actorUuids.includes(
        character.uuid,
      )
    ));
    const groups = [...sheet.element.querySelectorAll(
      '.hyp3e-utilities__marching-group',
    )];
    const responsiveWrap = new Set(groups.map(
      (group) => Math.round(group.getBoundingClientRect().top),
    )).size > 1;

    const unsafeNote = 'Watch <script>alert("marching")</script>';
    const noteResult = await request(
      'party.setMarchingNote',
      { rank: 'front', text: unsafeNote },
      'report-note',
    );
    const reportRevision = api.partyStore.getState().revision;
    const messageCount = game.messages.size;
    sheet.element.querySelector(
      '[data-action="reportMarchingOrder"]',
    ).click();
    const reportCreated = await waitUntil(() => game.messages.size > messageCount);
    const reportMessage = [...game.messages].reverse().find(
      (message) => message.flags?.[MODULE_ID]?.action
        === 'marchingOrderReport',
    );
    const reportContent = reportMessage?.content ?? '';
    const frontIndex = reportContent.indexOf('data-rank="front"');
    const middleIndex = reportContent.indexOf('data-rank="middle"');
    const rearIndex = reportContent.indexOf('data-rank="rear"');

    return {
      mar002: {
        setupSucceeded: memberResult.ok && followerResult.ok,
        marchingRendered,
        fourGroupsRendered: groups.length === 4,
        enrichedRows,
        accessibleControls,
        unassignedPreviousDisabled,
        threeNoteFields:
          sheet.element.querySelectorAll('[data-field="marching-note"]')
            .length === 3,
        characterMovedFront,
        npcMovedFront,
        movedUp,
        dragMovedMiddle,
        responsiveWrap,
      },
      mar003: {
        noteSaved: noteResult.ok,
        reportCreated,
        publicMessage: (reportMessage?.whisper?.length ?? 0) === 0,
        revisionFlagged:
          reportMessage?.flags?.[MODULE_ID]?.revision === reportRevision,
        ranksOrdered:
          frontIndex >= 0
          && frontIndex < middleIndex
          && middleIndex < rearIndex,
        actorsOrdered:
          reportContent.indexOf(npc.name)
          < reportContent.indexOf(character.name),
        emptyRearVisible: reportContent.includes(
          game.i18n.localize(`${MODULE_ID}.chat.marchingOrder.empty`),
        ),
        noteEscaped:
          reportContent.includes('Watch &lt;script&gt;')
          && reportContent.includes('&lt;/script&gt;')
          && !reportContent.includes('<script>'),
      },
    };
  }
  finally {
    if (sheet?.rendered) await sheet.close();
    if (api.partyStore.getState().memberActorUuids.includes(character.uuid)) {
      await request(
        'party.removeMember',
        { actorUuid: character.uuid },
        'cleanup-member',
      );
    }
    if (api.partyStore.getState().followerActorUuids.includes(npc.uuid)) {
      await request(
        'party.removeFollower',
        { actorUuid: npc.uuid },
        'cleanup-follower',
      );
    }
  }
}

async function testProductionSupplies() {
  const api = game.modules.get(MODULE_ID).api;
  const originalSupplies = { ...api.partyStore.getState().supplies };
  const request = (payload, suffix) => api.partyMutations.request(
    'party.setSupplies',
    {
      expectedRevision: api.partyStore.getState().revision,
      payload,
      requestId: `sup001-gm-${game.user.id}-${suffix}`,
    },
  );
  const savedValues = {
    torches: '11',
    lanterns: '2',
    oil: '5',
    rations: '30',
  };
  const refreshedValues = {
    torches: '7',
    lanterns: '',
    oil: '3',
    rations: '24',
  };
  const sheet = new api.applications.OpenPartySheetApplication();

  try {
    await sheet.render({ force: true });
    sheet.element.querySelector(
      '[data-action="selectTab"][data-tab="supplies"]',
    ).click();
    const rendered = await waitUntil(() => (
      sheet.element?.querySelectorAll('[data-party-supplies] input').length === 4
    ));
    const getInput = (key) => sheet.element?.querySelector(
      `[data-party-supplies] [data-field="${key}"]`,
    );
    for (const [key, value] of Object.entries(savedValues)) {
      getInput(key).value = value;
    }
    getInput('torches').dispatchEvent(new Event('input', { bubbles: true }));
    const beforeSaveRevision = api.partyStore.getState().revision;
    sheet.element.querySelector('[data-action="saveSupplies"]').click();
    const persisted = await waitUntil(() => (
      api.partyStore.getState().revision === beforeSaveRevision + 1
      && Object.entries(savedValues).every(
        ([key, value]) => api.partyStore.getState().supplies[key] === value,
      )
    ));
    const beforeInvalidRevision = api.partyStore.getState().revision;
    const invalidResult = await request(
      { ...savedValues, torches: '-1' },
      'invalid',
    );
    const invalidRejected = !invalidResult.ok
      && invalidResult.error.code === 'invalidRequest'
      && api.partyStore.getState().revision === beforeInvalidRevision;
    const externalResult = await request(refreshedValues, 'refresh');
    const externalRefreshRendered = await waitUntil(() => (
      Object.entries(refreshedValues).every(
        ([key, value]) => getInput(key)?.value === value,
      )
    ));

    return {
      rendered,
      fourWholeNumberInputs: ['torches', 'lanterns', 'oil', 'rations'].every(
        (key) => getInput(key)?.type === 'number'
          && getInput(key)?.min === '0'
          && getInput(key)?.step === '1',
      ),
      persisted,
      invalidRejected,
      externalMutationSucceeded: externalResult.ok,
      externalRefreshRendered,
    };
  }
  finally {
    if (sheet.rendered) await sheet.close();
    await request(originalSupplies, 'restore');
  }
}

async function testProductionNotes() {
  const api = game.modules.get(MODULE_ID).api;
  const initialState = api.partyStore.getState();
  const original = {
    notes: initialState.notes,
    treasureNotes: { ...initialState.treasureNotes },
  };
  const unsafe = {
    notes: '<p onclick="alert(1)">NOT-001 party</p><script>alert(1)</script>',
    treasureNotes: {
      gems: '<p>NOT-001 gems</p><img src="x" onerror="alert(1)">',
      misc: '<p>NOT-001 miscellaneous</p><script>alert(1)</script>',
    },
  };
  const request = (payload, suffix) => api.partyMutations.request(
    'party.setNotes',
    {
      expectedRevision: api.partyStore.getState().revision,
      payload,
      requestId: `not001-gm-${game.user.id}-${suffix}-${foundry.utils.randomID()}`,
    },
  );
  const sheet = new api.applications.OpenPartySheetApplication();

  try {
    const beforeRevision = initialState.revision;
    const mutation = await request(unsafe, 'save');
    const saved = api.partyStore.getState();
    await sheet.render({ force: true });
    sheet.element.querySelector(
      '[data-action="selectTab"][data-tab="treasure"]',
    ).click();
    const treasureRendered = await waitUntil(() => (
      sheet.element?.querySelectorAll(
        '[data-party-note-editor] prose-mirror',
      ).length === 2
    ));
    const treasureEditors = [...sheet.element.querySelectorAll(
      '[data-party-note-editor] prose-mirror',
    )];
    sheet.element.querySelector(
      '[data-action="selectTab"][data-tab="notes"]',
    ).click();
    const partyRendered = await waitUntil(() => (
      sheet.element?.querySelectorAll(
        '[data-party-note-editor] prose-mirror',
      ).length === 1
    ));
    const partyEditor = sheet.element.querySelector(
      '[data-party-note-editor] prose-mirror[name="notes"]',
    );
    const serialized = JSON.stringify({
      notes: saved.notes,
      treasureNotes: saved.treasureNotes,
    });

    return {
      servicePublished: typeof api.partyNotes?.getNotes === 'function',
      mutationSucceeded: mutation.ok,
      atomicRevision: saved.revision === beforeRevision + 1,
      allFieldsPersisted:
        saved.notes.includes('NOT-001 party')
        && saved.treasureNotes.gems.includes('NOT-001 gems')
        && saved.treasureNotes.misc.includes('NOT-001 miscellaneous'),
      unsafeMarkupRemoved:
        !serialized.includes('<script')
        && !serialized.includes('onclick=')
        && !serialized.includes('onerror='),
      treasureRendered,
      partyRendered,
      twoTreasureEditors: treasureEditors.length === 2,
      onePartyEditor: Boolean(partyEditor),
      gmEditorsEnabled:
        treasureEditors.every((editor) => !editor.disabled)
        && partyEditor?.disabled === false,
    };
  }
  finally {
    if (sheet.rendered) await sheet.close();
    await request(original, 'restore');
  }
}

async function testProductionPartyRefreshPolicy(character, untrackedActor) {
  const api = game.modules.get(MODULE_ID).api;
  const initialState = api.partyStore.getState();
  const memberWasTracked = initialState.memberActorUuids.includes(
    character.uuid,
  );
  const request = (operation, payload, suffix) => api.partyMutations.request(
    operation,
    {
      expectedRevision: api.partyStore.getState().revision,
      payload,
      requestId: `ref001-gm-${game.user.id}-${suffix}-${foundry.utils.randomID()}`,
    },
  );
  const originalCharacterHp = character.system.hp.value;
  const originalUntrackedHp = untrackedActor.system.hp.value;
  let diagnosticItem;
  const sheet = new api.applications.OpenPartySheetApplication();
  const productionRender = sheet.render.bind(sheet);
  let renderCount = 0;
  sheet.render = async (...args) => {
    renderCount += 1;
    return productionRender(...args);
  };

  try {
    if (!memberWasTracked) {
      await request(
        'party.addMember',
        { actorUuid: character.uuid },
        'add-member',
      );
    }
    const trackedMemberAdded = api.partyStore.getState().memberActorUuids
      .includes(character.uuid);
    await sheet.render({ force: true });
    sheet.element.querySelector(
      '[data-action="selectTab"][data-tab="notes"]',
    ).click();
    const notesTabRendered = await waitUntil(() => (
      sheet.element?.querySelector('[data-tab="notes"]')
        ?.getAttribute('aria-selected') === 'true'
    ));
    const baseline = renderCount;

    await untrackedActor.update({
      'system.hp.value': originalUntrackedHp + 1,
    });
    await wait(250);
    const unrelatedActorIgnored = renderCount === baseline;

    const draftMarker = `<p>REF-001 draft ${game.user.id}</p>`;
    sheet._capturePartyNoteDraft(
      'notes',
      draftMarker,
      api.partyStore.getState().revision,
    );
    Hooks.callAll('updateActor', character, {}, {}, game.user.id);
    Hooks.callAll('updateActor', character, {}, {}, game.user.id);
    const burstRendered = await waitUntil(() => renderCount === baseline + 1);
    await wait(150);
    const actorBurstCoalesced = burstRendered && renderCount === baseline + 1;
    const draftPreservedAfterBurst = sheet._partyNoteDraft?.values?.notes
      === draftMarker;

    await character.update({
      'system.hp.value': originalCharacterHp + 1,
    });
    const actualActorUpdateRendered = await waitUntil(
      () => renderCount === baseline + 2,
    );

    [diagnosticItem] = await character.createEmbeddedDocuments('Item', [{
      name: `${RUN_PREFIX} REF-001 Item`,
      type: 'weapon',
    }]);
    const embeddedItemCreateRendered = await waitUntil(
      () => renderCount === baseline + 3,
    );

    Hooks.callAll(`${MODULE_ID}.partyStateUpdated`, api.partyStore.getState());
    Hooks.callAll(
      `${MODULE_ID}.partyPermissionsUpdated`,
      'partySheetMinimumEditRole',
      game.user.role,
    );
    const statePermissionBurstRendered = await waitUntil(
      () => renderCount === baseline + 4,
    );
    await wait(150);

    return {
      trackedMemberAdded,
      notesTabRendered,
      unrelatedActorIgnored,
      actorBurstCoalesced,
      actualActorUpdateRendered,
      embeddedItemCreateRendered,
      statePermissionBurstCoalesced:
        statePermissionBurstRendered && renderCount === baseline + 4,
      draftPreserved:
        draftPreservedAfterBurst
        && sheet._partyNoteDraft?.values?.notes === draftMarker,
      activeTabPreserved:
        sheet.element?.querySelector('[data-tab="notes"]')
          ?.getAttribute('aria-selected') === 'true',
    };
  }
  finally {
    if (sheet.rendered) await sheet.close();
    if (diagnosticItem) {
      await character.deleteEmbeddedDocuments('Item', [diagnosticItem.id]);
    }
    await character.update({ 'system.hp.value': originalCharacterHp });
    await untrackedActor.update({ 'system.hp.value': originalUntrackedHp });
    if (!memberWasTracked
      && api.partyStore.getState().memberActorUuids.includes(character.uuid)) {
      await request(
        'party.removeMember',
        { actorUuid: character.uuid },
        'cleanup-member',
      );
    }
  }
}

async function testProductionPartyTreasuryLifecycle() {
  const api = game.modules.get(MODULE_ID).api;
  const service = api.partyTreasury;
  const initialStatus = service.getStatus();
  let primary = initialStatus.actor;
  let duplicate;
  let sheet;

  if (!primary) {
    const prepared = initialStatus.kind === 'recoverable'
      ? await service.bindTreasury(initialStatus.candidates[0].uuid)
      : await service.recreateTreasury();
    if (!prepared.ok) {
      throw new Error(
        `TRY-001 could not prepare a managed treasury: ${prepared.error?.code}`,
      );
    }
    primary = service.getStatus().actor;
  }
  if (!primary) throw new Error('TRY-001 did not resolve a managed treasury.');

  const originalName = primary.name;
  const originalUuid = primary.uuid;
  const exported = primary.toObject();
  delete exported._id;

  try {
    await primary.update({ name: `${RUN_PREFIX} TRY-001 Renamed` });
    const renamedStatus = service.getStatus();
    const renameStable = renamedStatus.kind === 'ready'
      && renamedStatus.actor?.uuid === originalUuid;
    const folderCreated = primary.folder?.name === 'Hyp3e Utilities';
    const flagPersisted = primary.getFlag(MODULE_ID, 'partyTreasury') === true;
    const activeGmOwns = primary.ownership[game.user.id]
      === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    const defaultOwnershipNone = primary.ownership.default
      === CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;

    await primary.delete();
    primary = null;
    const revisionBeforeMissingInitialize = api.partyStore.getState().revision;
    const missingInitialize = await service.initialize();
    const missingRequiresExplicitRecovery = !missingInitialize.ok
      && missingInitialize.error?.code === 'missingTreasury'
      && service.getStatus().kind === 'missing'
      && api.partyStore.getState().revision === revisionBeforeMissingInitialize;

    const recreated = await service.recreateTreasury();
    primary = recreated.actor ?? service.getStatus().actor;
    const recreationSucceeded = recreated.ok
      && recreated.created
      && primary?.uuid !== originalUuid
      && service.getStatus().actor?.uuid === primary?.uuid;

    await primary.delete();
    primary = null;
    exported.name = `${RUN_PREFIX} TRY-001 Imported`;
    const imported = await Actor.create(exported);
    primary = imported;
    const importedUuid = imported.uuid;
    const importedRebound = await service.initialize();
    const importExportRecovered = importedRebound.ok
      && importedRebound.rebound
      && service.getStatus().actor?.uuid === importedUuid;

    duplicate = await Actor.create({
      flags: { [MODULE_ID]: { partyTreasury: true } },
      folder: imported.folder?.id ?? null,
      name: `${RUN_PREFIX} TRY-001 Duplicate`,
      ownership: {
        default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
        [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
      },
      type: 'treasure',
    });
    const duplicateStatus = service.getStatus();
    const duplicateWarningDetected = duplicateStatus.kind === 'ready'
      && duplicateStatus.hasDuplicates
      && duplicateStatus.candidates.length >= 2;

    sheet = new api.applications.OpenPartySheetApplication();
    await sheet.render({ force: true });
    sheet.element.querySelector(
      '[data-action="selectTab"][data-tab="treasure"]',
    )?.click();
    const treasuryTabRendered = await waitUntil(() => (
      sheet.element?.querySelector('[data-tab="treasure"]')
        ?.getAttribute('aria-selected') === 'true'
    ));
    const duplicateWarningRendered = Boolean(sheet.element?.querySelector(
      '.hyp3e-utilities__party-treasury-warning',
    ));
    const candidateRowsRendered = sheet.element?.querySelectorAll(
      '.hyp3e-utilities__party-treasury-candidates li',
    ).length >= 2;
    const bindButton = [...sheet.element.querySelectorAll(
      '[data-action="bindPartyTreasury"]',
    )].find((button) => button.dataset.actorUuid === duplicate.uuid);
    bindButton?.click();
    const explicitSelectionSucceeded = await waitUntil(() => (
      api.partyStore.getState().treasuryActorUuid === duplicate.uuid
    ));
    const duplicatesPreserved = game.actors.has(imported.id)
      && game.actors.has(duplicate.id);

    await imported.delete();
    primary = null;
    await duplicate.update({ name: `${RUN_PREFIX} TRY-001 Final Treasury` });
    const finalStatus = service.getStatus();

    return {
      activeGmOwns,
      candidateRowsRendered,
      defaultOwnershipNone,
      duplicateWarningDetected,
      duplicateWarningRendered,
      duplicatesPreserved,
      explicitSelectionSucceeded,
      finalManagedActorUuid: duplicate.uuid,
      finalReadyAfterRename:
        finalStatus.kind === 'ready'
        && finalStatus.actor?.uuid === duplicate.uuid
        && !finalStatus.hasDuplicates,
      flagPersisted,
      folderCreated,
      importExportRecovered,
      missingRequiresExplicitRecovery,
      recreationSucceeded,
      renameStable,
      treasuryTabRendered,
    };
  }
  finally {
    if (sheet?.rendered) await sheet.close();
    if (primary && game.actors.has(primary.id) && duplicate?.id !== primary.id) {
      await primary.update({ name: originalName });
    }
  }
}

async function testProductionPartyTreasuryViews() {
  const api = game.modules.get(MODULE_ID).api;
  const actor = api.partyTreasury.getStatus().actor;
  if (!actor) throw new Error('TRY-002 requires the managed Party Treasury.');

  const originalMoney = api.adapter.getMoney(actor);
  const testMoney = { cp: 11, sp: 22, ep: 33, gp: 44, pp: 55 };
  const createdItemIds = [];
  const sheet = new api.applications.OpenPartySheetApplication();
  treasuryViewCleanup = async () => {
    const currentActor = game.actors.get(actor.id);
    if (!currentActor) return;
    const remainingIds = createdItemIds.filter(
      (itemId) => currentActor.items.has(itemId),
    );
    if (remainingIds.length) {
      await currentActor.deleteEmbeddedDocuments('Item', remainingIds);
    }
    await currentActor.update(api.adapter.buildMoneyUpdate(originalMoney));
  };

  await actor.update(api.adapter.buildMoneyUpdate(testMoney));
  await sheet.render({ force: true });
  sheet.element.querySelector(
    '[data-action="selectTab"][data-tab="supplies"]',
  )?.click();
  const suppliesTabRendered = await waitUntil(() => (
    sheet.element?.querySelector('[data-tab="supplies"]')
      ?.getAttribute('aria-selected') === 'true'
  ));
  const emptyInventoryRendered = actor.items.size === 0
    && Boolean(sheet.element?.querySelector('[data-empty-treasury-inventory]'));

  const fixtures = await actor.createEmbeddedDocuments('Item', [
    {
      flags: { [DIAGNOSTIC_ID]: { try002: true } },
      img: '',
      name: `${RUN_PREFIX} TRY-002 Weapon`,
      system: { quantity: { bundle: 2, max: 9, value: 3 } },
      type: 'weapon',
    },
    {
      flags: { [DIAGNOSTIC_ID]: { try002: true } },
      name: `${RUN_PREFIX} TRY-002 Armour`,
      system: { quantity: { value: 1 } },
      type: 'armor',
    },
    {
      flags: { [DIAGNOSTIC_ID]: { try002: true } },
      name: `${RUN_PREFIX} TRY-002 Shield`,
      system: { quantity: { value: 1 } },
      type: 'shield',
    },
    {
      flags: { [DIAGNOSTIC_ID]: { try002: true } },
      name: `${RUN_PREFIX} TRY-002 Gear`,
      system: { quantity: { bundle: 4, max: 20, value: 7 } },
      type: 'item',
    },
    {
      flags: { [DIAGNOSTIC_ID]: { try002: true } },
      name: `${RUN_PREFIX} TRY-002 Unsupported`,
      type: 'spell',
    },
  ]);
  createdItemIds.push(...fixtures.map((item) => item.id));
  const weaponFixture = fixtures.find((item) => item.type === 'weapon');
  const unsupportedFixture = fixtures.find((item) => item.type === 'spell');
  await sheet.render({ force: true });
  const snapshotResponse = await api.partyTreasury.requestSnapshot();
  const snapshot = snapshotResponse.value;
  const fixtureSnapshots = snapshot.items.filter(
    (item) => createdItemIds.includes(item.id),
  );
  const renderedRows = [...sheet.element.querySelectorAll(
    '[data-treasury-item]',
  )];
  const missingImageRow = renderedRows.find(
    (row) => row.dataset.itemId === weaponFixture?.id,
  );
  const unknownRow = renderedRows.find(
    (row) => row.dataset.itemId === unsupportedFixture?.id,
  );

  sheet.element.querySelector(
    '[data-action="selectTab"][data-tab="treasure"]',
  )?.click();
  const treasureTabRendered = await waitUntil(() => (
    sheet.element?.querySelector('[data-tab="treasure"]')
      ?.getAttribute('aria-selected') === 'true'
  ));
  const renderedCoins = Object.fromEntries(
    [...sheet.element.querySelectorAll('[data-coin-key]')].map((row) => [
      row.dataset.coinKey,
      Number(row.querySelector('dd')?.textContent?.trim()),
    ]),
  );

  if (sheet.rendered) await sheet.close();
  return {
    allFiveCoinsInSnapshot:
      snapshotResponse.ok
      && JSON.stringify(snapshot.coins) === JSON.stringify(testMoney),
    allFiveCoinsRendered:
      JSON.stringify(renderedCoins) === JSON.stringify(testMoney),
    emptyInventoryRendered,
    itemImageRendered: Boolean(
      missingImageRow?.querySelector('img')?.getAttribute('src'),
    ),
    physicalTypesRendered: ['weapon', 'armor', 'shield', 'item'].every(
      (type) => renderedRows.some((row) => row.dataset.itemType === type),
    ),
    quantitiesPreserved:
      fixtureSnapshots.find((item) => item.id === weaponFixture?.id)
        ?.quantity?.value === 3
      && fixtureSnapshots.find((item) => item.id === weaponFixture?.id)
        ?.quantity?.bundle === 2
      && fixtureSnapshots.find((item) => item.id === weaponFixture?.id)
        ?.quantity?.max === 9,
    snapshotAuthorized: snapshotResponse.ok && snapshot.ready,
    suppliesTabRendered,
    treasureTabRendered,
    unknownTypePreserved:
      fixtureSnapshots.find((item) => item.id === unsupportedFixture?.id)
        ?.supported === false,
    unknownTypeRendered: Boolean(
      unknownRow?.querySelector('.hyp3e-utilities__party-treasury-warning'),
    ),
  };
}

async function cleanupItemTransferFixtures() {
  if (!game.user.isGM) return;
  const api = game.modules.get(MODULE_ID).api;
  const fixtureActors = game.actors.filter(
    (actor) => actor.getFlag(DIAGNOSTIC_ID, 'itm007') === true,
  );
  const fixtureActorUuids = new Set(fixtureActors.map((actor) => actor.uuid));
  for (const actor of fixtureActors) {
    const state = api.partyStore.getState();
    const operations = [
      ['memberActorUuids', 'party.removeMember'],
      ['followerActorUuids', 'party.removeFollower'],
    ];
    for (const [collection, operation] of operations) {
      if (!state[collection].includes(actor.uuid)) continue;
      await api.partyMutations.request(operation, {
        expectedRevision: api.partyStore.getState().revision,
        payload: { actorUuid: actor.uuid },
        requestId: `itm007-cleanup-${operation}-${foundry.utils.randomID()}`,
      });
    }
  }
  if (fixtureActors.length) {
    await Actor.deleteDocuments(fixtureActors.map((actor) => actor.id));
  }

  const treasury = api.partyTreasury.getStatus().actor;
  const treasuryItemIds = treasury?.items.filter(
    (item) => item.getFlag(DIAGNOSTIC_ID, 'itm007') === true,
  ).map((item) => item.id) ?? [];
  if (treasuryItemIds.length) {
    await treasury.deleteEmbeddedDocuments('Item', treasuryItemIds);
  }

  const auditMessageIds = game.messages.filter((message) => {
    const flags = message.flags?.[MODULE_ID];
    return flags?.action === 'itemTransfer'
      && (
        fixtureActorUuids.has(flags.sourceActorUuid)
        || fixtureActorUuids.has(flags.destinationActorUuid)
      );
  }).map((message) => message.id);
  if (auditMessageIds.length) {
    // Foundry animates chat notifications asynchronously. Give each new card
    // time to mount before deleting the diagnostic messages it represents.
    await wait(500);
    await ChatMessage.deleteDocuments(auditMessageIds);
  }
}

async function testProductionItemTransfers(playerUserIds) {
  const api = game.modules.get(MODULE_ID).api;
  await cleanupItemTransferFixtures();
  itemTransferCleanup = cleanupItemTransferFixtures;
  const treasury = api.partyTreasury.getStatus().actor;
  if (!treasury) throw new Error('ITM-007 requires the managed Party Treasury.');

  const ownership = {
    default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
    [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
  };
  for (const playerUserId of playerUserIds) {
    ownership[playerUserId] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  }
  const actor = await Actor.create({
    flags: { [DIAGNOSTIC_ID]: { itm007: true } },
    name: `${RUN_PREFIX} ITM-007 Character`,
    ownership,
    type: 'character',
  });
  const addMember = await api.partyMutations.request('party.addMember', {
    expectedRevision: api.partyStore.getState().revision,
    payload: { actorUuid: actor.uuid },
    requestId: `itm007-add-member-${foundry.utils.randomID()}`,
  });
  const [gmItem, playerItem] = await actor.createEmbeddedDocuments('Item', [
    {
      flags: { [DIAGNOSTIC_ID]: { itm007: true, role: 'gm' } },
      name: `${RUN_PREFIX} ITM-007 GM Item`,
      system: { quantity: { bundle: 2, max: 4, value: 4 } },
      type: 'item',
    },
    {
      flags: { [DIAGNOSTIC_ID]: { itm007: true, role: 'player' } },
      name: `${RUN_PREFIX} ITM-007 Player Item`,
      system: { quantity: { bundle: 1, max: 3, value: 3 } },
      type: 'item',
    },
  ]);

  const toTreasury = await api.partyItemTransfers.transferToTreasury({
    expectedSourceQuantity: 4,
    quantity: 2,
    sourceActorUuid: actor.uuid,
    sourceItemUuid: gmItem.uuid,
  });
  const treasuryItem = treasury.items.get(
    toTreasury.value?.destinationItemUuid?.split('.').at(-1),
  );
  const partialTransferConserved = toTreasury.ok
    && api.adapter.getItemQuantity(gmItem).value === 2
    && api.adapter.getItemQuantity(treasuryItem).value === 2;
  const fromTreasury = await api.partyItemTransfers.transferFromTreasury({
    destinationActorUuid: actor.uuid,
    expectedSourceQuantity: 2,
    quantity: 2,
    sourceItemUuid: treasuryItem?.uuid,
  });
  const gmAuditMessages = game.messages.filter((message) => {
    const flags = message.flags?.[MODULE_ID];
    return flags?.action === 'itemTransfer'
      && flags.requesterUserId === game.user.id
      && (
        flags.sourceActorUuid === actor.uuid
        || flags.destinationActorUuid === actor.uuid
      );
  });

  return {
    actorUuid: actor.uuid,
    addMemberSucceeded: addMember.ok,
    auditCardsCreated:
      gmAuditMessages.length === 2
      && gmAuditMessages.every((message) => message.whisper.length === 0),
    bidirectionalSucceeded: toTreasury.ok && fromTreasury.ok,
    itemServicePublished:
      typeof api.partyItemTransfers?.transferToTreasury === 'function'
      && typeof api.partyItemTransfers?.transferFromTreasury === 'function',
    partialTransferConserved,
    restoredToCharacter:
      !treasury.items.has(treasuryItem?.id)
      && api.adapter.getItemQuantity(gmItem).value === 4,
    playerFixtureReady:
      playerItem.parent?.uuid === actor.uuid
      && api.adapter.getItemQuantity(playerItem).value === 3,
  };
}

async function testPlayerItemTransfers() {
  const api = game.modules.get(MODULE_ID).api;
  const actor = game.actors.find(
    (entry) => entry.getFlag(DIAGNOSTIC_ID, 'itm007') === true,
  );
  const item = actor?.items.find(
    (entry) => entry.getFlag(DIAGNOSTIC_ID, 'role') === 'player',
  );
  if (!actor || !item) throw new Error('ITM-007 Player fixtures are unavailable.');

  await actor.sheet.render(true);
  let actorSheetControl = null;
  const actorSheetControlRendered = await waitUntil(() => {
    actorSheetControl = actor.sheet.element?.querySelector?.(
      `.${MODULE_ID}__send-item[data-item-uuid="${item.uuid}"]`,
    );
    return Boolean(actorSheetControl);
  });
  const actorSheetControlIntegrated = Boolean(
    actorSheetControl?.parentElement?.classList?.contains('item-controls')
    && actorSheetControl.querySelector?.('.fa-dolly')
    && actorSheetControl.getAttribute?.('role') === 'button'
    && actorSheetControl.getAttribute?.('aria-label')
    && actorSheetControl.textContent.trim() === '',
  );
  if (actor.sheet.rendered) await actor.sheet.close();

  const toTreasury = await api.partyItemTransfers.transferToTreasury({
    expectedSourceQuantity: 3,
    quantity: 3,
    sourceActorUuid: actor.uuid,
    sourceItemUuid: item.uuid,
  });
  const sheet = new api.applications.OpenPartySheetApplication();
  let partySheetTakeControlRendered = false;
  try {
    await sheet.render({ force: true });
    sheet.element.querySelector(
      '[data-action="selectTab"][data-tab="supplies"]',
    )?.click();
    partySheetTakeControlRendered = await waitUntil(() => Boolean(
      sheet.element?.querySelector(
        `[data-action="takeTreasuryItem"][data-item-uuid="${toTreasury.value?.destinationItemUuid}"]:not([disabled])`,
      ),
    ));
  }
  finally {
    if (sheet.rendered) await sheet.close();
  }

  const fromTreasury = await api.partyItemTransfers.transferFromTreasury({
    destinationActorUuid: actor.uuid,
    expectedSourceQuantity: 3,
    quantity: 3,
    sourceItemUuid: toTreasury.value?.destinationItemUuid,
  });
  const returnedItem = actor.items.get(
    fromTreasury.value?.destinationItemUuid?.split('.').at(-1),
  );
  const playerAuditMessages = game.messages.filter((message) => {
    const flags = message.flags?.[MODULE_ID];
    return flags?.action === 'itemTransfer'
      && flags.requesterUserId === game.user.id
      && (
        flags.sourceActorUuid === actor.uuid
        || flags.destinationActorUuid === actor.uuid
      );
  });

  return {
    actorSheetControlIntegrated,
    actorSheetControlRendered,
    auditCardsCreated:
      playerAuditMessages.length === 2
      && playerAuditMessages.every((message) => message.whisper.length === 0),
    bidirectionalSucceeded: toTreasury.ok && fromTreasury.ok,
    ownershipEnforced: actor.testUserPermission(game.user, 'OWNER'),
    partySheetTakeControlRendered,
    quantityConserved: api.adapter.getItemQuantity(returnedItem).value === 3,
  };
}

async function createDiagnosticActors() {
  const saveData = Object.fromEntries(
    SAVE_KEYS.map((saveKey, index) => [
      saveKey,
      { value: 10 + index },
    ]),
  );
  const actorData = (type) => ({
    name: `${RUN_PREFIX} ${type}`,
    type,
    system: {
      hp: { value: 5, max: 10 },
      saves: saveData,
      ...(type === 'npc' ? { morale: 8 } : {}),
      ...(type === 'npc' ? { npcType: 'monster' } : {}),
    },
  });

  const actors = await Actor.createDocuments([
    actorData('character'),
    actorData('npc'),
  ]);
  const actorByType = new Map(actors.map((actor) => [actor.type, actor]));
  const character = actorByType.get('character');
  const npc = actorByType.get('npc');
  return { character, npc };
}

async function runGmDiagnostics() {
  results.status = 'running';
  let character;
  let npc;

  try {
    ({ character, npc } = await createDiagnosticActors());
    results.pb004 = await testSaveFields(character, npc);
    results.pb005 = await testTokenIdentity(npc);
    results.pb006 = await testTreasuryLifecycle();
    results.pb007 = await testApplicationV2();
    await testProductionFoundation(character, npc);
    testProductionHudRules(character, npc);
    results.hud003 = await testProductionHudChat(npc);
    results.hud004 = await testProductionHudSelection(character, npc);
    results.hud005 = await testProductionHudOverlay(npc);
    results.hud006 = await testProductionHudPosition(npc);
    results.hud007 = await testProductionHudLifecycle(npc);
    results.hud008 = await testProductionHudAccessibility(npc);
    results.par001 = testProductionPartyPermissions();
    results.par005 = await testProductionPartySheetApplication();
    results.par006 = await testProductionPartyMembers(character, npc);
    results.par007 = await testProductionPartyFollowers(character, npc);
    results.par008 = await testProductionPartyActions(character, npc);
    results.par010 = await testProductionPartyCleanup();
    const marchingResults = await testProductionMarchingOrder(character, npc);
    results.mar002 = {
      gm: marchingResults.mar002,
      waitingForPlayer: true,
    };
    results.mar003 = {
      gm: marchingResults.mar003,
      waitingForPlayer: true,
    };
    results.sup001 = {
      gm: await testProductionSupplies(),
      waitingForPlayer: true,
    };
    results.not001 = {
      gm: await testProductionNotes(),
      waitingForPlayer: true,
    };
    results.ref001 = {
      gm: await testProductionPartyRefreshPolicy(character, npc),
      waitingForPlayer: true,
    };
    results.try001 = {
      gm: await testProductionPartyTreasuryLifecycle(),
      waitingForPlayer: true,
    };
    results.try002 = {
      gm: await testProductionPartyTreasuryViews(),
      waitingForPlayer: true,
    };
    const grantedPlayerUserIds = await grantDiagnosticPartyAccess();
    results.par002 = {
      grantedPlayerUserIds,
      waitingForPlayer: true,
    };
    results.itm007 = {
      gm: await testProductionItemTransfers(grantedPlayerUserIds),
      waitingForPlayer: true,
    };
    results.par004 = { waitingForPlayer: true };
    results.par009 = { waitingForPlayer: true };
    results.status = 'complete';
  }
  catch (error) {
    await itemTransferCleanup();
    await treasuryViewCleanup();
    results.errors.push(serializeError(error));
    results.status = 'failed';
    console.error(`${DIAGNOSTIC_ID} | Runtime diagnostic failed`, error);
  }
  finally {
    const actorIds = [character?.id, npc?.id].filter(Boolean);
    if (actorIds.length) await Actor.deleteDocuments(actorIds);
  }

  console.info(`${DIAGNOSTIC_ID} | Results`, results);
  publishResults();
}

async function testPlayerDraftConflict(partyMutations) {
  const api = game.modules.get(MODULE_ID).api;
  const actorUuid = `Actor.par009${game.user.id}`;
  const addResult = await partyMutations.request(
    'party.compatibilityFollowerMutation',
    {
      expectedRevision: api.partyStore.getState().revision,
      payload: { actorUuid },
      requestId: `par009-${game.user.id}-add`,
    },
  );
  await waitUntil(() => api.partyStore.getState().followerActorUuids.includes(
    actorUuid,
  ));
  const PartySheet = api.applications.OpenPartySheetApplication;
  const sheet = new PartySheet();

  try {
    await sheet.render({ force: true });
    sheet.element.querySelector(
      '[data-action="selectTab"][data-tab="followers"]',
    ).click();
    await waitUntil(() => (
      sheet.element?.querySelector('[data-tab="followers"]')
        ?.getAttribute('aria-selected') === 'true'
    ));
    const row = sheet.element.querySelector(
      `[data-follower-row][data-actor-uuid="${actorUuid}"]`,
    );
    const wageInput = row?.querySelector('[data-field="follower-wage"]');
    const shareInput = row?.querySelector('[data-field="follower-share"]');
    wageInput.value = '9';
    shareInput.value = '1.5';
    wageInput.dispatchEvent(new Event('input', { bubbles: true }));
    const draftRevision = api.partyStore.getState().revision;

    const externalResult = await partyMutations.request(
      'party.compatibilityNotesMutation',
      {
        expectedRevision: draftRevision,
        payload: { notes: `PAR-009 external ${game.user.id}` },
        requestId: `par009-${game.user.id}-external`,
      },
    );
    const externalRevisionObserved = await waitUntil(() => (
      api.partyStore.getState().revision === draftRevision + 1
    ));
    const draftPreserved = await waitUntil(() => (
      sheet.element?.querySelector(
        `[data-follower-row][data-actor-uuid="${actorUuid}"] [data-field="follower-wage"]`,
      )?.value === '9'
      && sheet.element?.querySelector(
        `[data-follower-row][data-actor-uuid="${actorUuid}"] [data-field="follower-share"]`,
      )?.value === '1.5'
    ));
    const staleWarningRendered = await waitUntil(() => Boolean(
      sheet.element?.querySelector('.hyp3e-utilities__party-draft-status strong'),
    ));

    sheet.element.querySelector(
      `[data-action="saveFollower"][data-actor-uuid="${actorUuid}"]`,
    ).click();
    await wait(300);
    const afterRejectedSave = api.partyStore.getState();
    const staleSaveRejected = afterRejectedSave.revision === draftRevision + 1
      && afterRejectedSave.followerWages[actorUuid] === 2
      && afterRejectedSave.shares[actorUuid] === 1
      && Boolean(sheet.element?.querySelector(
        '.hyp3e-utilities__party-draft-status strong',
      ));

    sheet.element.querySelector('[data-action="discardPartyDrafts"]').click();
    const discardRestoredAuthoritative = await waitUntil(() => (
      sheet.element?.querySelector(
        `[data-follower-row][data-actor-uuid="${actorUuid}"] [data-field="follower-wage"]`,
      )?.value === '2'
      && !sheet.element?.querySelector('.hyp3e-utilities__party-draft-status')
    ));
    const cleanupResult = await partyMutations.request(
      'party.removeFollower',
      {
        expectedRevision: api.partyStore.getState().revision,
        payload: { actorUuid },
        requestId: `par009-${game.user.id}-cleanup`,
      },
    );

    return {
      addSucceeded: addResult.ok,
      authorizedPlayerCanEdit: Boolean(wageInput && shareInput),
      externalMutationSucceeded: externalResult.ok,
      externalRevisionObserved,
      draftPreserved,
      staleWarningRendered,
      staleSaveRejected,
      discardRestoredAuthoritative,
      cleanupSucceeded: cleanupResult.ok,
    };
  }
  finally {
    if (sheet.rendered) await sheet.close();
    if (api.partyStore.getState().followerActorUuids.includes(actorUuid)) {
      await partyMutations.request('party.removeFollower', {
        expectedRevision: api.partyStore.getState().revision,
        payload: { actorUuid },
        requestId: `par009-${game.user.id}-finally`,
      });
    }
  }
}

async function testPlayerMarchingOrder(partyMutations, actorUuid) {
  const api = game.modules.get(MODULE_ID).api;
  const PartySheet = api.applications.OpenPartySheetApplication;
  const sheet = new PartySheet();

  try {
    await sheet.render({ force: true });
    sheet.element.querySelector(
      '[data-action="selectTab"][data-tab="marchingOrder"]',
    ).click();
    const rowRendered = await waitUntil(() => Boolean(
      sheet.element?.querySelector(
        `[data-marching-row][data-actor-uuid="${actorUuid}"]`,
      ),
    ));
    const getRow = () => sheet.element?.querySelector(
      `[data-marching-row][data-actor-uuid="${actorUuid}"]`,
    );
    const missingRowVisible = getRow()?.classList.contains(
      'hyp3e-utilities__party-member--missing',
    );
    const fourKeyboardControls = getRow()?.querySelectorAll(
      '[data-action="moveMarchingActor"]',
    ).length === 4;
    getRow().querySelector(
      '[data-action="moveMarchingActor"][data-target-rank="front"]',
    ).click();
    const controlMoveSucceeded = await waitUntil(() => (
      api.partyStore.getState().marchingOrder.front.actorUuids.includes(
        actorUuid,
      )
    ));

    const authoritativeNote = api.partyStore.getState()
      .marchingOrder.front.notes;
    const noteInput = sheet.element.querySelector(
      '[data-marching-rank="front"] [data-field="marching-note"]',
    );
    noteInput.value = `MAR-002 draft ${game.user.id}`;
    noteInput.dispatchEvent(new Event('input', { bubbles: true }));
    const draftRevision = api.partyStore.getState().revision;
    const externalResult = await partyMutations.request(
      'party.compatibilityNotesMutation',
      {
        expectedRevision: draftRevision,
        payload: { notes: `MAR-002 external ${game.user.id}` },
        requestId: `mar002-${game.user.id}-external`,
      },
    );
    const externalRevisionObserved = await waitUntil(() => (
      api.partyStore.getState().revision === draftRevision + 1
    ));
    const noteDraftPreserved = await waitUntil(() => (
      sheet.element?.querySelector(
        '[data-marching-rank="front"] [data-field="marching-note"]',
      )?.value === `MAR-002 draft ${game.user.id}`
    ));
    const staleWarningRendered = await waitUntil(() => Boolean(
      sheet.element?.querySelector('.hyp3e-utilities__party-draft-status strong'),
    ));
    sheet.element.querySelector(
      '[data-action="saveMarchingNote"][data-marching-rank="front"]',
    ).click();
    await wait(300);
    const afterRejectedSave = api.partyStore.getState();
    const staleSaveRejected = afterRejectedSave.revision === draftRevision + 1
      && afterRejectedSave.marchingOrder.front.notes === authoritativeNote
      && Boolean(sheet.element.querySelector(
        '.hyp3e-utilities__party-draft-status strong',
      ));
    sheet.element.querySelector(
      '[data-action="discardPartyDrafts"]',
    ).click();
    const discardRestoredAuthoritative = await waitUntil(() => (
      sheet.element?.querySelector(
        '[data-marching-rank="front"] [data-field="marching-note"]',
      )?.value === authoritativeNote
      && !sheet.element?.querySelector(
        '.hyp3e-utilities__party-draft-status',
      )
    ));

    const dataTransfer = new DataTransfer();
    getRow().dispatchEvent(new DragEvent('dragstart', {
      bubbles: true,
      dataTransfer,
    }));
    sheet.element.querySelector(
      '[data-marching-rank="middle"]',
    ).dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      dataTransfer,
    }));
    const dragMoveSucceeded = await waitUntil(() => (
      api.partyStore.getState().marchingOrder.middle.actorUuids.includes(
        actorUuid,
      )
    ));
    const groups = [...sheet.element.querySelectorAll(
      '.hyp3e-utilities__marching-group',
    )];
    const responsiveWrap = new Set(groups.map(
      (group) => Math.round(group.getBoundingClientRect().top),
    )).size > 1;
    const cleanupResult = await partyMutations.request(
      'party.removeMember',
      {
        expectedRevision: api.partyStore.getState().revision,
        payload: { actorUuid },
        requestId: `mar002-${game.user.id}-cleanup`,
      },
    );

    return {
      rowRendered,
      missingRowVisible,
      fourKeyboardControls,
      controlMoveSucceeded,
      externalMutationSucceeded: externalResult.ok,
      externalRevisionObserved,
      noteDraftPreserved,
      staleWarningRendered,
      staleSaveRejected,
      discardRestoredAuthoritative,
      dragMoveSucceeded,
      responsiveWrap,
      cleanupSucceeded: cleanupResult.ok,
    };
  }
  finally {
    if (sheet.rendered) await sheet.close();
    if (api.partyStore.getState().memberActorUuids.includes(actorUuid)) {
      await partyMutations.request('party.removeMember', {
        expectedRevision: api.partyStore.getState().revision,
        payload: { actorUuid },
        requestId: `mar002-${game.user.id}-finally`,
      });
    }
  }
}

async function testPlayerSupplies(partyMutations) {
  const api = game.modules.get(MODULE_ID).api;
  const originalSupplies = { ...api.partyStore.getState().supplies };
  const draftValues = {
    torches: '8',
    lanterns: '3',
    oil: '6',
    rations: '18',
  };
  const finalValues = {
    torches: '9',
    lanterns: '4',
    oil: '',
    rations: '21',
  };
  const PartySheet = api.applications.OpenPartySheetApplication;
  const sheet = new PartySheet();
  const requestSupplies = (payload, suffix) => partyMutations.request(
    'party.setSupplies',
    {
      expectedRevision: api.partyStore.getState().revision,
      payload,
      requestId: `sup001-${game.user.id}-${suffix}`,
    },
  );

  try {
    await sheet.render({ force: true });
    sheet.element.querySelector(
      '[data-action="selectTab"][data-tab="supplies"]',
    ).click();
    const authorizedPlayerCanEdit = await waitUntil(() => (
      sheet.element?.querySelectorAll('[data-party-supplies] input').length === 4
    ));
    const getInput = (key) => sheet.element?.querySelector(
      `[data-party-supplies] [data-field="${key}"]`,
    );
    for (const [key, value] of Object.entries(draftValues)) {
      getInput(key).value = value;
    }
    getInput('torches').dispatchEvent(new Event('input', { bubbles: true }));
    const draftRevision = api.partyStore.getState().revision;
    const externalResult = await partyMutations.request(
      'party.compatibilityNotesMutation',
      {
        expectedRevision: draftRevision,
        payload: { notes: `SUP-001 external ${game.user.id}` },
        requestId: `sup001-${game.user.id}-external`,
      },
    );
    const externalRevisionObserved = await waitUntil(() => (
      api.partyStore.getState().revision === draftRevision + 1
    ));
    const draftPreserved = await waitUntil(() => Object.entries(draftValues)
      .every(([key, value]) => getInput(key)?.value === value));
    const staleWarningRendered = await waitUntil(() => Boolean(
      sheet.element?.querySelector('.hyp3e-utilities__party-draft-status strong'),
    ));
    sheet.element.querySelector('[data-action="saveSupplies"]').click();
    await wait(300);
    const staleSaveRejected = api.partyStore.getState().revision
        === draftRevision + 1
      && Object.entries(originalSupplies).every(
        ([key, value]) => api.partyStore.getState().supplies[key] === value,
      );
    sheet.element.querySelector('[data-action="discardPartyDrafts"]').click();
    const discardRestoredAuthoritative = await waitUntil(() => (
      Object.entries(originalSupplies).every(
        ([key, value]) => getInput(key)?.value === value,
      )
    ));

    for (const [key, value] of Object.entries(finalValues)) {
      getInput(key).value = value;
    }
    getInput('torches').dispatchEvent(new Event('input', { bubbles: true }));
    sheet.element.querySelector('[data-action="saveSupplies"]').click();
    const validSavePersisted = await waitUntil(() => Object.entries(finalValues)
      .every(([key, value]) => api.partyStore.getState().supplies[key] === value));
    const beforeInvalidRevision = api.partyStore.getState().revision;
    const invalidResult = await requestSupplies(
      { ...finalValues, oil: '1.5' },
      'invalid',
    );
    const invalidRejected = !invalidResult.ok
      && invalidResult.error.code === 'invalidRequest'
      && api.partyStore.getState().revision === beforeInvalidRevision;

    return {
      authorizedPlayerCanEdit,
      externalMutationSucceeded: externalResult.ok,
      externalRevisionObserved,
      draftPreserved,
      staleWarningRendered,
      staleSaveRejected,
      discardRestoredAuthoritative,
      validSavePersisted,
      invalidRejected,
    };
  }
  finally {
    if (sheet.rendered) await sheet.close();
    if (JSON.stringify(api.partyStore.getState().supplies)
      !== JSON.stringify(originalSupplies)) {
      await requestSupplies(originalSupplies, 'restore');
    }
  }
}

async function testPlayerNotes(partyMutations) {
  const api = game.modules.get(MODULE_ID).api;
  const initialState = api.partyStore.getState();
  const original = {
    notes: initialState.notes,
    treasureNotes: { ...initialState.treasureNotes },
  };
  const uniqueRequestId = (suffix) => (
    `not001-${game.user.id}-${suffix}-${foundry.utils.randomID()}`
  );
  const requestNotes = (payload, suffix) => partyMutations.request(
    'party.setNotes',
    {
      expectedRevision: api.partyStore.getState().revision,
      payload,
      requestId: uniqueRequestId(suffix),
    },
  );
  const sheet = new api.applications.OpenPartySheetApplication();

  try {
    await sheet.render({ force: true });
    sheet.element.querySelector(
      '[data-action="selectTab"][data-tab="treasure"]',
    ).click();
    const treasureEditorsRendered = await waitUntil(() => (
      sheet.element?.querySelectorAll(
        '[data-party-note-editor] prose-mirror',
      ).length === 2
    ));
    const treasureEditorsEnabled = [...sheet.element.querySelectorAll(
      '[data-party-note-editor] prose-mirror',
    )].every((editor) => !editor.disabled);
    sheet.element.querySelector(
      '[data-action="selectTab"][data-tab="notes"]',
    ).click();
    const partyEditorRendered = await waitUntil(() => Boolean(
      sheet.element?.querySelector(
        '[data-party-note-editor] prose-mirror[name="notes"]',
      ),
    ));

    const draftRevision = api.partyStore.getState().revision;
    const draftNotes = `NOT-001 Player draft ${game.user.id}`;
    sheet._capturePartyNoteDraft('notes', draftNotes, draftRevision);
    const externalNotes = `NOT-001 external ${game.user.id}`;
    const externalResult = await partyMutations.request(
      'party.compatibilityNotesMutation',
      {
        expectedRevision: draftRevision,
        payload: { notes: externalNotes },
        requestId: uniqueRequestId('external'),
      },
    );
    const draftPreserved = await waitUntil(() => (
      sheet.element?.textContent?.includes(draftNotes)
    ));
    const staleWarningRendered = await waitUntil(() => Boolean(
      sheet.element?.querySelector('.hyp3e-utilities__party-draft-status strong'),
    ));
    sheet.element.querySelector('[data-action="savePartyNotes"]').click();
    await wait(300);
    const staleSaveRejected =
      api.partyStore.getState().revision === draftRevision + 1
      && api.partyStore.getState().notes === externalNotes
      && Boolean(sheet.element?.querySelector(
        '.hyp3e-utilities__party-draft-status strong',
      ));
    sheet.element.querySelector('[data-action="discardPartyDrafts"]').click();
    const discardRestoredAuthoritative = await waitUntil(() => (
      sheet.element?.textContent?.includes(externalNotes)
      && !sheet.element?.querySelector('.hyp3e-utilities__party-draft-status')
    ));

    const final = {
      notes: `NOT-001 saved ${game.user.id}`,
      treasureNotes: {
        gems: `NOT-001 gems ${game.user.id}`,
        misc: `NOT-001 miscellaneous ${game.user.id}`,
      },
    };
    sheet._capturePartyNoteDraft('notes', final.notes);
    sheet._capturePartyNoteDraft('gems', final.treasureNotes.gems);
    sheet._capturePartyNoteDraft('misc', final.treasureNotes.misc);
    sheet.element.querySelector('[data-action="savePartyNotes"]').click();
    const validSavePersisted = await waitUntil(() => {
      const state = api.partyStore.getState();
      return state.notes === final.notes
        && state.treasureNotes.gems === final.treasureNotes.gems
        && state.treasureNotes.misc === final.treasureNotes.misc;
    });

    return {
      authorizedPlayerCanEdit:
        treasureEditorsEnabled
        && partyEditorRendered,
      treasureEditorsRendered,
      externalMutationSucceeded: externalResult.ok,
      draftPreserved,
      staleWarningRendered,
      staleSaveRejected,
      discardRestoredAuthoritative,
      validSavePersisted,
      activeTabPreserved:
        sheet.element?.querySelector('[data-tab="notes"]')
          ?.getAttribute('aria-selected') === 'true',
    };
  }
  finally {
    if (sheet.rendered) await sheet.close();
    await requestNotes(original, 'restore');
  }
}

async function runPlayerSocketDiagnostic() {
  if (!diagnosticSocket) {
    results.pb008 = { error: 'SocketLib registration was unavailable.' };
    results.status = 'failed';
    publishResults();
    return;
  }

  const claimedUserId = game.users.find((user) => user.isGM)?.id ?? 'missing-gm';
  try {
    const response = await diagnosticSocket.executeAsGM(
      'inspectCaller',
      claimedUserId,
    );
    const playerResult = {
      actualPlayerUserId: game.user.id,
      claimedUserId,
      response,
      senderDerivedIndependently:
        response.senderUserId === game.user.id
        && response.senderUserId !== claimedUserId,
    };
    const api = game.modules.get(MODULE_ID).api;
    const partyMutations = api.partyMutations;
    const requestId = `par002-${game.user.id}`;
    const mutationRequest = {
      expectedRevision: 7,
      payload: { claimedUserId, value: 42 },
      requestId,
    };
    const firstMutation = await partyMutations.request(
      'party.compatibilityMutation',
      mutationRequest,
    );
    const duplicateMutation = await partyMutations.request(
      'party.compatibilityMutation',
      mutationRequest,
    );
    const malformedMutation = await partyMutations.request(
      'party.compatibilityMutation',
      {
        expectedRevision: 7,
        payload: { claimedUserId, extra: true, value: 42 },
        requestId: `${requestId}-malformed`,
      },
    );
    const partyMutationResult = {
      firstMutation,
      duplicateMutation,
      malformedMutation,
      actualCallerAuthorized:
        firstMutation.ok
        && firstMutation.value.requesterUserId === game.user.id
        && firstMutation.value.claimedUserId === claimedUserId
        && firstMutation.value.requesterUserId !== claimedUserId,
      gmExecuted:
        firstMutation.ok
        && firstMutation.value.executingUserIsGm
        && firstMutation.value.executingUserId === claimedUserId,
      duplicateExecutedOnce:
        duplicateMutation.ok
        && duplicateMutation.value.executionCount === 1
        && duplicateMutation.requestId === firstMutation.requestId,
      malformedRejected:
        !malformedMutation.ok
        && malformedMutation.error.code === 'invalidRequest',
    };
    const partyStore = game.modules.get(MODULE_ID).api.partyStore;
    const beforeState = partyStore.getState();
    const firstActorUuid = `Actor.par004${game.user.id}first`;
    const secondActorUuid = `Actor.par004${game.user.id}second`;
    const concurrentRequests = [firstActorUuid, secondActorUuid].map(
      (actorUuid, index) => partyMutations.request(
        'party.compatibilityStateMutation',
        {
          expectedRevision: beforeState.revision,
          payload: { actorUuid },
          requestId: `par004-${game.user.id}-${index}`,
        },
      ),
    );
    const concurrentResults = await Promise.all(concurrentRequests);
    const successfulIndex = concurrentResults.findIndex((entry) => entry.ok);
    const staleIndex = concurrentResults.findIndex(
      (entry) => !entry.ok && entry.error.code === 'staleRevision',
    );
    const staleActorUuid = [firstActorUuid, secondActorUuid][staleIndex];
    const retryResult = staleIndex >= 0
      ? await partyMutations.request(
        'party.compatibilityStateMutation',
        {
          expectedRevision:
            concurrentResults[staleIndex].error.details.state.revision,
          payload: { actorUuid: staleActorUuid },
          requestId: `par004-${game.user.id}-retry`,
        },
      )
      : null;
    await waitUntil(
      () => partyStore.getState().revision >= beforeState.revision + 2,
    );
    const finalState = partyStore.getState();
    const partyStoreResult = {
      beforeRevision: beforeState.revision,
      concurrentResults,
      retryResult,
      finalState,
      exactlyOneConcurrentSuccess:
        concurrentResults.filter((entry) => entry.ok).length === 1,
      exactlyOneStaleRejection:
        concurrentResults.filter(
          (entry) => !entry.ok && entry.error.code === 'staleRevision',
        ).length === 1,
      staleReturnedFreshState:
        staleIndex >= 0
        && concurrentResults[staleIndex].error.details.state.revision
          === beforeState.revision + 1,
      retrySucceeded:
        retryResult?.ok
        && retryResult.value.previousRevision === beforeState.revision + 1
        && retryResult.value.state.revision === beforeState.revision + 2,
      finalStateConserved:
        successfulIndex >= 0
        && finalState.revision === beforeState.revision + 2
        && finalState.memberActorUuids.includes(firstActorUuid)
        && finalState.memberActorUuids.includes(secondActorUuid),
    };
    const partyDraftResult = await testPlayerDraftConflict(partyMutations);
    const marchingResult = await testPlayerMarchingOrder(
      partyMutations,
      firstActorUuid,
    );
    const marchingReportMessage = [...game.messages].reverse().find(
      (message) => message.flags?.[MODULE_ID]?.action
        === 'marchingOrderReport',
    );
    const marchingReportResult = {
      observed: Boolean(marchingReportMessage),
      publicMessage:
        (marchingReportMessage?.whisper?.length ?? 0) === 0,
      ranksVisible: ['front', 'middle', 'rear'].every((rank) => (
        marchingReportMessage?.content?.includes(`data-rank="${rank}"`)
      )),
    };
    const supplyResult = await testPlayerSupplies(partyMutations);
    const noteResult = await testPlayerNotes(partyMutations);
    const refreshResult = {
      stateUpdatePreservedDraft: noteResult.draftPreserved,
      activeTabPreserved: noteResult.activeTabPreserved,
      staleStateRejected: noteResult.staleSaveRejected,
    };
    const treasuryRevision = api.partyStore.getState().revision;
    const treasuryBind = await api.partyTreasury.bindTreasury(
      api.partyStore.getState().treasuryActorUuid,
    );
    const treasurySheet = new api.applications.OpenPartySheetApplication();
    let treasuryPlayerResult;
    try {
      await treasurySheet.render({ force: true });
      treasurySheet.element.querySelector(
        '[data-action="selectTab"][data-tab="treasure"]',
      )?.click();
      const treasureTabRendered = await waitUntil(() => (
        treasurySheet.element?.querySelector('[data-tab="treasure"]')
          ?.getAttribute('aria-selected') === 'true'
      ));
      treasuryPlayerResult = {
        bindDenied:
          !treasuryBind.ok
          && treasuryBind.error?.code === 'treasuryGmRequired',
        noLifecycleControls:
          treasurySheet.element?.querySelectorAll(
            '[data-action="bindPartyTreasury"], '
            + '[data-action="recreatePartyTreasury"], '
            + '[data-action="openPartyTreasury"]',
          ).length === 0,
        revisionUnchanged:
          api.partyStore.getState().revision === treasuryRevision,
        statusVisible: Boolean(treasurySheet.element?.querySelector(
          '.hyp3e-utilities__party-treasury',
        )),
        treasureTabRendered,
      };
    }
    finally {
      if (treasurySheet.rendered) await treasurySheet.close();
    }
    const treasuryViewSnapshot = await api.partyTreasury.requestSnapshot();
    const treasuryViewSheet = new api.applications.OpenPartySheetApplication();
    let treasuryViewPlayerResult;
    try {
      await treasuryViewSheet.render({ force: true });
      treasuryViewSheet.element.querySelector(
        '[data-action="selectTab"][data-tab="supplies"]',
      )?.click();
      const suppliesTabRendered = await waitUntil(() => (
        treasuryViewSheet.element?.querySelector('[data-tab="supplies"]')
          ?.getAttribute('aria-selected') === 'true'
      ));
      const itemRows = [...treasuryViewSheet.element.querySelectorAll(
        '[data-treasury-item]',
      )];
      treasuryViewSheet.element.querySelector(
        '[data-action="selectTab"][data-tab="treasure"]',
      )?.click();
      const treasureTabRendered = await waitUntil(() => (
        treasuryViewSheet.element?.querySelector('[data-tab="treasure"]')
          ?.getAttribute('aria-selected') === 'true'
      ));
      treasuryViewPlayerResult = {
        allFiveCoinsVisible:
          treasuryViewSheet.element?.querySelectorAll('[data-coin-key]')
            .length === 5,
        allPhysicalTypesVisible: ['weapon', 'armor', 'shield', 'item'].every(
          (type) => itemRows.some((row) => row.dataset.itemType === type),
        ),
        contentsReceived:
          treasuryViewSnapshot.ok
          && treasuryViewSnapshot.value?.ready
          && treasuryViewSnapshot.value?.items?.length >= 5,
        suppliesTabRendered,
        treasureTabRendered,
        unknownTypeVisible: itemRows.some(
          (row) => row.dataset.itemType === 'spell',
        ),
      };
    }
    finally {
      if (treasuryViewSheet.rendered) await treasuryViewSheet.close();
    }
    const itemTransferResult = await testPlayerItemTransfers();
    results.pb008 = playerResult;
    results.par002 = partyMutationResult;
    results.par004 = partyStoreResult;
    results.par009 = partyDraftResult;
    results.mar002 = marchingResult;
    results.mar003 = marchingReportResult;
    results.sup001 = supplyResult;
    results.not001 = noteResult;
    results.ref001 = refreshResult;
    results.try001 = treasuryPlayerResult;
    results.try002 = treasuryViewPlayerResult;
    results.itm007 = itemTransferResult;
    results.status = 'complete';
    publishResults();
    game.socket.emit(DIAGNOSTIC_SOCKET, {
      type: 'pb008-result',
      par002: partyMutationResult,
      par004: partyStoreResult,
      par009: partyDraftResult,
      mar002: marchingResult,
      mar003: marchingReportResult,
      sup001: supplyResult,
      not001: noteResult,
      ref001: refreshResult,
      try001: treasuryPlayerResult,
      try002: treasuryViewPlayerResult,
      itm007: itemTransferResult,
      result: playerResult,
    });
    console.info(`${DIAGNOSTIC_ID} | Player SocketLib result`, playerResult);
  }
  catch (error) {
    results.pb008 = { error: serializeError(error) };
    results.status = 'failed';
    publishResults();
    console.error(`${DIAGNOSTIC_ID} | Player SocketLib diagnostic failed`, error);
  }
}

Hooks.once('socketlib.ready', () => {
  diagnosticSocket = socketlib.registerModule(DIAGNOSTIC_ID);
  diagnosticSocket.register('inspectCaller', function inspectCaller(
    claimedUserId,
  ) {
    return {
      claimedUserId,
      senderUserId: this.socketdata.userId,
      executingUserId: game.user.id,
      executingUserIsGM: game.user.isGM,
    };
  });
});

Hooks.once('ready', async () => {
  results.environment = {
    foundryVersion: game.version,
    foundryGeneration: game.release.generation,
    systemId: game.system.id,
    systemVersion: game.system.version,
    worldId: game.world.id,
    userId: game.user.id,
    userIsGm: game.user.isGM,
    activeGmUserId: game.users.activeGM?.id ?? null,
    socketlibVersion: game.modules.get('socketlib')?.version ?? null,
  };
  results.pb003 = {
    modulePresent: game.modules.has(MODULE_ID),
    moduleActive: game.modules.get(MODULE_ID)?.active === true,
    diagnosticModuleActive:
      game.modules.get(DIAGNOSTIC_ID)?.active === true,
  };
  registerProductionPartyDiagnostic();

  game.socket.on(DIAGNOSTIC_SOCKET, async (message, senderId) => {
    if (!game.user.isGM || message?.type !== 'pb008-result') return;
    results.pb008 = {
      ...message.result,
      foundrySocketSenderId: senderId,
      foundrySenderMatchesPlayer:
        senderId === message.result.actualPlayerUserId,
    };
    results.par002 = {
      ...message.par002,
      foundrySocketSenderId: senderId,
      foundrySenderMatchesPlayer:
        senderId === message.result.actualPlayerUserId,
    };
    results.par004 = {
      ...message.par004,
      foundrySocketSenderId: senderId,
      foundrySenderMatchesPlayer:
        senderId === message.result.actualPlayerUserId,
      gmState: game.modules.get(MODULE_ID).api.partyStore.getState(),
    };
    results.par009 = message.par009;
    results.mar002 = {
      ...results.mar002,
      foundrySocketSenderId: senderId,
      foundrySenderMatchesPlayer:
        senderId === message.result.actualPlayerUserId,
      player: message.mar002,
      waitingForPlayer: false,
    };
    results.mar003 = {
      ...results.mar003,
      foundrySocketSenderId: senderId,
      foundrySenderMatchesPlayer:
        senderId === message.result.actualPlayerUserId,
      player: message.mar003,
      waitingForPlayer: false,
    };
    results.sup001 = {
      ...results.sup001,
      foundrySocketSenderId: senderId,
      foundrySenderMatchesPlayer:
        senderId === message.result.actualPlayerUserId,
      player: message.sup001,
      waitingForPlayer: false,
    };
    results.not001 = {
      ...results.not001,
      foundrySocketSenderId: senderId,
      foundrySenderMatchesPlayer:
        senderId === message.result.actualPlayerUserId,
      player: message.not001,
      waitingForPlayer: false,
    };
    results.ref001 = {
      ...results.ref001,
      foundrySocketSenderId: senderId,
      foundrySenderMatchesPlayer:
        senderId === message.result.actualPlayerUserId,
      player: message.ref001,
      waitingForPlayer: false,
    };
    results.try001 = {
      ...results.try001,
      foundrySocketSenderId: senderId,
      foundrySenderMatchesPlayer:
        senderId === message.result.actualPlayerUserId,
      player: message.try001,
      waitingForPlayer: false,
    };
    results.try002 = {
      ...results.try002,
      foundrySocketSenderId: senderId,
      foundrySenderMatchesPlayer:
        senderId === message.result.actualPlayerUserId,
      player: message.try002,
      waitingForPlayer: false,
    };
    results.itm007 = {
      ...results.itm007,
      foundrySocketSenderId: senderId,
      foundrySenderMatchesPlayer:
        senderId === message.result.actualPlayerUserId,
      player: message.itm007,
      waitingForPlayer: false,
    };
    await itemTransferCleanup();
    itemTransferCleanup = async () => {};
    await treasuryViewCleanup();
    treasuryViewCleanup = async () => {};
    publishResults();
  });

  if (game.user.isGM) await runGmDiagnostics();
  else await runPlayerSocketDiagnostic();
});
