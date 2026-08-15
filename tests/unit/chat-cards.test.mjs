import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createChatCardService,
  getRollMessageModeOptions,
} from '../../module/chat/chat-cards.mjs';
import {
  planMoraleBatch,
  planReactionBatch,
  planSaveBatch,
} from '../../module/hud/npc-rolls.mjs';
import {
  characterActor,
  npcActor,
} from '../fixtures/hyp3e-documents.mjs';

const TRANSLATIONS = {
  'hyp3e-utilities.chat.actor': 'NPC',
  'hyp3e-utilities.chat.total': 'Total',
  'hyp3e-utilities.chat.outcome': 'Outcome',
  'hyp3e-utilities.chat.category': 'Category',
  'hyp3e-utilities.chat.target': 'Target',
  'hyp3e-utilities.chat.result': 'Result',
  'hyp3e-utilities.chat.success': 'Success',
  'hyp3e-utilities.chat.failure': 'Failure',
  'hyp3e-utilities.chat.reroll': 'Reroll once.',
  'hyp3e-utilities.chat.actions.reaction': 'Reaction Roll',
  'hyp3e-utilities.chat.actions.save': 'Saving Throw',
  'hyp3e-utilities.chat.actions.morale': 'Morale Check',
  'hyp3e-utilities.chat.saves.death': 'Death',
  'hyp3e-utilities.chat.reactions.neutral':
    'Neutral: disinterested or uncertain',
  'hyp3e-utilities.chat.reactions.affable':
    'Affable: extremely accommodating',
  'hyp3e-utilities.chat.marchingOrder.title': 'Party Marching Order',
  'hyp3e-utilities.chat.marchingOrder.empty': 'Empty',
  'hyp3e-utilities.chat.marchingOrder.note': 'Note',
  'hyp3e-utilities.chat.marchingOrder.ranks.front': 'Front',
  'hyp3e-utilities.chat.marchingOrder.ranks.middle': 'Middle',
  'hyp3e-utilities.chat.marchingOrder.ranks.rear': 'Rear',
  'hyp3e-utilities.chat.itemTransfer.title': 'Party Item Transfer',
  'hyp3e-utilities.chat.itemTransfer.item': 'Item',
  'hyp3e-utilities.chat.itemTransfer.quantity': 'Quantity',
  'hyp3e-utilities.chat.itemTransfer.source': 'Source',
  'hyp3e-utilities.chat.itemTransfer.destination': 'Destination',
  'hyp3e-utilities.chat.itemTransfer.requester': 'Requested By',
  'hyp3e-utilities.chat.itemTransfer.mode': 'Destination',
  'hyp3e-utilities.chat.itemTransfer.created': 'New Item',
  'hyp3e-utilities.chat.itemTransfer.merged': 'Merged Stack',
  'hyp3e-utilities.chat.xpDistribution.title': 'Party XP Distribution',
  'hyp3e-utilities.chat.xpDistribution.total': 'XP Pool',
  'hyp3e-utilities.chat.xpDistribution.shares': 'Selected Shares',
  'hyp3e-utilities.chat.xpDistribution.remainder': 'Undistributed Base XP',
  'hyp3e-utilities.chat.xpDistribution.requester': 'Distributed By',
  'hyp3e-utilities.chat.xpDistribution.base': 'Base',
  'hyp3e-utilities.chat.xpDistribution.adjustment': 'Adjustment',
  'hyp3e-utilities.chat.xpDistribution.final': 'Final',
  'hyp3e-utilities.chat.xpDistribution.character': 'Added to character sheet',
  'hyp3e-utilities.chat.xpDistribution.npc': 'NPC allocation consumed; no writeback',
};

function createHarness({
  generation = 14,
  gmRecipients = [{ id: 'gm-one' }, { id: 'gm-two' }],
  targets = new Map(),
  totals = [],
  userIsGm = true,
} = {}) {
  const events = [];
  const messages = [];
  const messageOptions = [];
  const warnings = [];
  let rollIndex = 0;

  class FakeRoll {
    constructor(formula) {
      this.formula = formula;
      this.index = rollIndex;
      rollIndex += 1;
    }

    async evaluate() {
      this.total = totals[this.index];
      events.push(`evaluate:${this.index}`);
      return this;
    }
  }

  class FakeChatMessage {
    static getWhisperRecipients(recipient) {
      assert.equal(recipient, 'GM');
      return gmRecipients;
    }

    static getSpeaker({ actor, token }) {
      return {
        actor: actor.id,
        token: token?.id ?? null,
      };
    }

    static async create(messageData, createOptions) {
      events.push(messageData.speaker
        ? `create:${messageData.speaker.token ?? messageData.speaker.actor}`
        : 'create:public');
      messages.push(messageData);
      messageOptions.push(createOptions);
      return { id: `message-${messages.length}`, ...messageData };
    }
  }

  const service = createChatCardService({
    ChatMessageClass: FakeChatMessage,
    RollClass: FakeRoll,
    config: { sounds: { dice: 'dice.wav' } },
    fromUuid: async (uuid) => targets.get(uuid) ?? null,
    game: {
      release: { generation },
      user: { id: 'current-user', isGM: userIsGm },
      i18n: {
        localize: (key) => TRANSLATIONS[key] ?? key,
      },
    },
    logger: { warn: (...args) => warnings.push(args) },
    randomId: () => 'shared-batch-id',
  });

  return { events, messageOptions, messages, service, warnings };
}

test('reaction batches create escaped, attributed GM whispers in stable order', async () => {
  const unsafeNpc = {
    ...npcActor,
    name: '<img src=x onerror="alert(1)">',
  };
  const firstUuid = 'Scene.scene.Token.first';
  const secondUuid = 'Scene.scene.Token.second';
  const firstActor = { id: 'synthetic-first' };
  const secondActor = { id: 'synthetic-second' };
  const targets = new Map([
    [firstUuid, { id: 'first', actor: firstActor }],
    [secondUuid, { id: 'second', actor: secondActor }],
  ]);
  const batch = planReactionBatch([
    { tokenUuid: firstUuid, actor: unsafeNpc },
    { tokenUuid: secondUuid, actor: unsafeNpc },
  ]);
  const harness = createHarness({ targets, totals: [6, 12] });

  const report = await harness.service.createNpcRollBatch(batch);

  assert.deepEqual(harness.events, [
    'evaluate:0',
    'create:first',
    'evaluate:1',
    'create:second',
  ]);
  assert.equal(report.created.length, 2);
  assert.equal(report.failures.length, 0);
  assert.equal(report.batchId, 'shared-batch-id');
  assert.deepEqual(
    report.created.map(({ evaluation }) => evaluation.outcome.id),
    ['neutral', 'affable'],
  );

  for (const [index, message] of harness.messages.entries()) {
    assert.deepEqual(message.whisper, ['gm-one', 'gm-two']);
    assert.deepEqual(harness.messageOptions[index], { messageMode: 'gm' });
    assert.equal(message.rolls.length, 1);
    assert.equal(message.rolls[0].total, [6, 12][index]);
    assert.equal(message.sound, 'dice.wav');
    assert.deepEqual(message.flags['hyp3e-utilities'], {
      feature: 'npcActionHud',
      action: 'reaction',
      category: null,
      tokenUuid: [firstUuid, secondUuid][index],
      actorUuid: 'Actor.npc-id',
      batchId: 'shared-batch-id',
    });
    assert.equal(message.content.includes('<img src=x'), false);
    assert.match(message.content, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  }
  assert.match(harness.messages[0].content, /Neutral: disinterested/);
  assert.match(harness.messages[0].content, /Reroll once\./);
  assert.match(harness.messages[1].content, /Affable: extremely accommodating/);
});

test('save and morale cards use Foundry 13 roll mode and evaluated targets', async () => {
  const targets = new Map([
    [npcActor.uuid, npcActor],
  ]);
  const harness = createHarness({
    generation: 13,
    targets,
    totals: [npcActor.system.saves.death.curr, npcActor.system.morale + 1],
  });

  const saveReport = await harness.service.createNpcRollBatch(
    planSaveBatch([npcActor], 'death'),
    { batchId: 'save-batch' },
  );
  const moraleReport = await harness.service.createNpcRollBatch(
    planMoraleBatch([npcActor]),
    { batchId: 'morale-batch' },
  );

  assert.equal(saveReport.created[0].evaluation.success, true);
  assert.equal(moraleReport.created[0].evaluation.success, false);
  assert.deepEqual(harness.messageOptions, [
    { rollMode: 'gmroll' },
    { rollMode: 'gmroll' },
  ]);
  assert.equal(harness.messages[0].speaker.actor, npcActor.id);
  assert.equal(harness.messages[0].speaker.token, null);
  assert.equal(
    harness.messages[0].flags['hyp3e-utilities'].category,
    'death',
  );
  assert.match(harness.messages[0].content, /Death/);
  assert.match(harness.messages[0].content, /Success/);
  assert.match(harness.messages[1].content, /Failure/);
});

test('partial skips and failures are collected and reported once', async () => {
  const validUuid = 'Scene.scene.Token.valid';
  const missingUuid = 'Scene.scene.Token.missing';
  const targets = new Map([
    [validUuid, { id: 'valid', actor: { id: 'valid-actor' } }],
  ]);
  const harness = createHarness({ targets, totals: [9] });
  const batch = planReactionBatch([
    { tokenUuid: validUuid, actor: npcActor },
    { tokenUuid: missingUuid, actor: npcActor },
    characterActor,
  ]);

  const report = await harness.service.createNpcRollBatch(batch);

  assert.equal(report.created.length, 1);
  assert.equal(report.failures.length, 1);
  assert.equal(report.failures[0].target.tokenUuid, missingUuid);
  assert.match(report.failures[0].message, /resolve/i);
  assert.equal(report.skipped.length, 1);
  assert.equal(report.skipped[0].reason, 'unsupportedActor');
  assert.equal(harness.messages.length, 1);
  assert.equal(harness.warnings.length, 1);
  assert.match(harness.warnings[0][0], /1 skipped target.*1 failed target/i);
});

test('chat service fails closed for players or an empty GM recipient list', async () => {
  const targets = new Map([[npcActor.uuid, npcActor]]);
  const playerHarness = createHarness({
    targets,
    totals: [8],
    userIsGm: false,
  });
  const noRecipientHarness = createHarness({
    gmRecipients: [],
    targets,
    totals: [8],
  });
  const batch = planMoraleBatch([npcActor]);

  await assert.rejects(
    playerHarness.service.createNpcRollBatch(batch),
    /only a gm/i,
  );
  await assert.rejects(
    noRecipientHarness.service.createNpcRollBatch(batch),
    /gm recipients/i,
  );
  assert.equal(playerHarness.messages.length, 0);
  assert.equal(noRecipientHarness.messages.length, 0);
});

test('roll-message mode options follow the Foundry generation', () => {
  assert.deepEqual(getRollMessageModeOptions(13), { rollMode: 'gmroll' });
  assert.deepEqual(getRollMessageModeOptions(14), { messageMode: 'gm' });
});

test('marching-order reports are public, ordered, escaped, and retain empty ranks', async () => {
  const harness = createHarness({ userIsGm: false });
  const report = await harness.service.createMarchingOrderReport({
    groups: [
      {
        id: 'front',
        notes: 'Watch <script>alert("note")</script>',
        rows: [
          { actorUuid: 'Actor.first', name: '<b>First</b>' },
          { actorUuid: 'Actor.second', name: 'Second' },
        ],
      },
      { id: 'middle', notes: '', rows: [] },
      {
        id: 'rear',
        notes: 'Guard the mule.',
        rows: [{ actorUuid: 'Actor.missing', name: 'Actor.missing' }],
      },
    ],
    revision: 7,
  });

  assert.equal(harness.messages.length, 1);
  assert.equal(report.message.id, 'message-1');
  assert.equal(report.revision, 7);
  assert.equal(Object.hasOwn(harness.messages[0], 'whisper'), false);
  assert.deepEqual(harness.messageOptions, [undefined]);
  assert.deepEqual(harness.messages[0].flags['hyp3e-utilities'], {
    action: 'marchingOrderReport',
    feature: 'partySheet',
    revision: 7,
  });
  const { content } = harness.messages[0];
  assert.ok(content.indexOf('Front') < content.indexOf('Middle'));
  assert.ok(content.indexOf('Middle') < content.indexOf('Rear'));
  assert.ok(content.indexOf('&lt;b&gt;First&lt;/b&gt;') < content.indexOf('Second'));
  assert.match(content, /Watch &lt;script&gt;alert\(&quot;note&quot;\)&lt;\/script&gt;/);
  assert.match(content, /<li[^>]*>Empty<\/li>/);
  assert.equal(content.includes('<b>First</b>'), false);
  assert.equal(content.includes('<script>'), false);
});

test('item transfer audit is public, escaped, and carries stable document flags', async () => {
  const harness = createHarness();
  const report = await harness.service.createItemTransferReport({
    destinationActorUuid: 'Actor.treasury',
    destinationName: 'Party <Treasury>',
    itemName: '<script>Rope</script>',
    merged: true,
    quantity: 3,
    requesterName: 'Player & Friend',
    requesterUserId: 'player-id',
    sourceActorUuid: 'Actor.character',
    sourceItemUuid: 'Actor.character.Item.rope',
    sourceName: 'Astra',
  });

  assert.equal(report.message.id, 'message-1');
  assert.equal(Object.hasOwn(harness.messages[0], 'whisper'), false);
  assert.deepEqual(harness.messages[0].flags['hyp3e-utilities'], {
    action: 'itemTransfer',
    destinationActorUuid: 'Actor.treasury',
    feature: 'partySheet',
    merged: true,
    quantity: 3,
    requesterUserId: 'player-id',
    sourceActorUuid: 'Actor.character',
    sourceItemUuid: 'Actor.character.Item.rope',
  });
  assert.match(harness.messages[0].content, /Party Item Transfer/);
  assert.match(harness.messages[0].content, /&lt;script&gt;Rope&lt;\/script&gt;/);
  assert.match(harness.messages[0].content, /Party &lt;Treasury&gt;/);
  assert.match(harness.messages[0].content, /Player &amp; Friend/);
  assert.match(harness.messages[0].content, /Merged Stack/);
  assert.equal(harness.messages[0].content.includes('<script>'), false);
});

test('XP distribution audit is public, escaped, and distinguishes character and NPC awards', async () => {
  const harness = createHarness();
  const report = await harness.service.createXpDistributionReport({
    baseRemainderXp: 1,
    recipients: [
      {
        actorType: 'character',
        actorUuid: 'Actor.hero',
        adjustmentXp: 40,
        baseXp: 400,
        finalAwardXp: 440,
        name: '<Hero>',
        writeback: true,
      },
      {
        actorType: 'npc',
        actorUuid: 'Actor.npc',
        adjustmentXp: 0,
        baseXp: 100,
        finalAwardXp: 100,
        name: 'Hireling & Mule',
        writeback: false,
      },
    ],
    requestId: 'xp-request-id',
    requesterName: 'GM <One>',
    requesterUserId: 'gm-one',
    revision: 7,
    totalShares: 1.25,
    totalXp: 501,
  });

  assert.equal(report.message.id, 'message-1');
  assert.equal(Object.hasOwn(harness.messages[0], 'whisper'), false);
  assert.deepEqual(harness.messages[0].flags['hyp3e-utilities'], {
    action: 'xpDistribution',
    feature: 'partySheet',
    requestId: 'xp-request-id',
    requesterUserId: 'gm-one',
    revision: 7,
    totalXp: 501,
  });
  const { content } = harness.messages[0];
  assert.match(content, /Party XP Distribution/);
  assert.match(content, /&lt;Hero&gt;/);
  assert.match(content, /Hireling &amp; Mule/);
  assert.match(content, /GM &lt;One&gt;/);
  assert.match(content, /Added to character sheet/);
  assert.match(content, /NPC allocation consumed; no writeback/);
  assert.equal(content.includes('<Hero>'), false);
});
