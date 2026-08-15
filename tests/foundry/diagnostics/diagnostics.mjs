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

const results = {
  status: 'initializing',
  environment: {},
  pb003: {},
  pb004: {},
  pb005: {},
  pb006: {},
  pb007: {},
  pb008: {},
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
    partyPermissionsPublished: Boolean(api?.partyPermissions),
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
          '.hyp3e-utilities-npc-action-hud__hp-fill',
        ).style.width);
        return Number.isFinite(width) && width >= 0 && width <= 100;
      }),
      statsRendered: rowElements.every((row) => (
        row.querySelectorAll('.hyp3e-utilities-npc-action-hud__stats dt').length
          === 4
      )),
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
    results.status = 'complete';
  }
  catch (error) {
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
    results.pb008 = playerResult;
    results.status = 'complete';
    publishResults();
    game.socket.emit(DIAGNOSTIC_SOCKET, {
      type: 'pb008-result',
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

  game.socket.on(DIAGNOSTIC_SOCKET, (message, senderId) => {
    if (!game.user.isGM || message?.type !== 'pb008-result') return;
    results.pb008 = {
      ...message.result,
      foundrySocketSenderId: senderId,
      foundrySenderMatchesPlayer:
        senderId === message.result.actualPlayerUserId,
    };
    publishResults();
  });

  if (game.user.isGM) await runGmDiagnostics();
  else await runPlayerSocketDiagnostic();
});
