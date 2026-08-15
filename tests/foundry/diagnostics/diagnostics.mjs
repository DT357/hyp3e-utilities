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
