import { MODULE_ID } from '../core/constants.mjs';
import { evaluateCheckRoll } from '../hud/npc-rolls.mjs';
import { getReactionOutcome } from '../hud/reaction-table.mjs';

const FEATURE_ID = 'npcActionHud';
const LEGACY_GM_ROLL_MODE = 'gmroll';
const GM_MESSAGE_MODE = 'gm';
const MARCHING_REPORT_RANKS = Object.freeze(['front', 'middle', 'rear']);

const ACTION_LABEL_KEYS = Object.freeze({
  reaction: `${MODULE_ID}.chat.actions.reaction`,
  save: `${MODULE_ID}.chat.actions.save`,
  morale: `${MODULE_ID}.chat.actions.morale`,
});

const REACTION_LABEL_KEYS = Object.freeze({
  violent: `${MODULE_ID}.chat.reactions.violent`,
  hostile: `${MODULE_ID}.chat.reactions.hostile`,
  unfriendly: `${MODULE_ID}.chat.reactions.unfriendly`,
  neutral: `${MODULE_ID}.chat.reactions.neutral`,
  friendly: `${MODULE_ID}.chat.reactions.friendly`,
  agreeable: `${MODULE_ID}.chat.reactions.agreeable`,
  affable: `${MODULE_ID}.chat.reactions.affable`,
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function renderRow(label, value) {
  return [
    '<div class="hyp3e-utilities-chat-card__row">',
    `<dt>${escapeHtml(label)}</dt>`,
    `<dd>${escapeHtml(value)}</dd>`,
    '</div>',
  ].join('');
}

function validateMarchingOrderReport(report) {
  if (!Number.isInteger(report?.revision) || report.revision < 0) {
    throw new TypeError('A non-negative Party State revision is required.');
  }
  if (
    !Array.isArray(report.groups)
    || report.groups.length !== MARCHING_REPORT_RANKS.length
  ) {
    throw new TypeError('Front, middle, and rear marching groups are required.');
  }
  for (const [index, group] of report.groups.entries()) {
    if (
      group?.id !== MARCHING_REPORT_RANKS[index]
      || typeof group.notes !== 'string'
      || !Array.isArray(group.rows)
    ) {
      throw new TypeError('Marching groups must be complete and ordered.');
    }
    for (const row of group.rows) {
      if (
        typeof row?.actorUuid !== 'string'
        || typeof row?.name !== 'string'
      ) {
        throw new TypeError('Marching rows require an Actor UUID and name.');
      }
    }
  }
}

function renderMarchingOrderCard(report, localize) {
  const groups = report.groups.map((group) => {
    const rows = group.rows.length
      ? group.rows.map((row) => (
        `<li data-actor-uuid="${escapeHtml(row.actorUuid)}">${escapeHtml(row.name)}</li>`
      )).join('')
      : `<li class="${MODULE_ID}-chat-card__empty">${escapeHtml(
        localize(`${MODULE_ID}.chat.marchingOrder.empty`),
      )}</li>`;
    const note = group.notes
      ? [
        `<p class="${MODULE_ID}-chat-card__note">`,
        `<strong>${escapeHtml(localize(`${MODULE_ID}.chat.marchingOrder.note`))}:</strong> `,
        escapeHtml(group.notes),
        '</p>',
      ].join('')
      : '';
    return [
      `<section class="${MODULE_ID}-chat-card__marching-rank" data-rank="${group.id}">`,
      `<h4>${escapeHtml(localize(`${MODULE_ID}.chat.marchingOrder.ranks.${group.id}`))}</h4>`,
      `<ol>${rows}</ol>`,
      note,
      '</section>',
    ].join('');
  });
  return [
    `<section class="${MODULE_ID} ${MODULE_ID}-chat-card" data-action="marchingOrderReport">`,
    `<h3 class="${MODULE_ID}-chat-card__title">${escapeHtml(
      localize(`${MODULE_ID}.chat.marchingOrder.title`),
    )}</h3>`,
    groups.join(''),
    '</section>',
  ].join('');
}

function validateItemTransferReport(report) {
  for (const key of [
    'destinationActorUuid',
    'destinationName',
    'itemName',
    'requesterName',
    'requesterUserId',
    'sourceActorUuid',
    'sourceItemUuid',
    'sourceName',
  ]) {
    if (typeof report?.[key] !== 'string') {
      throw new TypeError(`Item transfer ${key} must be a string.`);
    }
  }
  if (!Number.isInteger(report.quantity) || report.quantity <= 0) {
    throw new TypeError('Item transfer quantity must be a positive integer.');
  }
  if (typeof report.merged !== 'boolean') {
    throw new TypeError('Item transfer merge state must be boolean.');
  }
}

function renderItemTransferCard(report, localize) {
  const key = `${MODULE_ID}.chat.itemTransfer`;
  const rows = [
    renderRow(localize(`${key}.item`), report.itemName),
    renderRow(localize(`${key}.quantity`), report.quantity),
    renderRow(localize(`${key}.source`), report.sourceName),
    renderRow(localize(`${key}.destination`), report.destinationName),
    renderRow(localize(`${key}.requester`), report.requesterName),
    renderRow(
      localize(`${key}.mode`),
      localize(`${key}.${report.merged ? 'merged' : 'created'}`),
    ),
  ];
  return [
    `<section class="${MODULE_ID} ${MODULE_ID}-chat-card" data-action="itemTransfer">`,
    `<h3 class="${MODULE_ID}-chat-card__title">${escapeHtml(
      localize(`${key}.title`),
    )}</h3>`,
    `<dl class="${MODULE_ID}-chat-card__details">${rows.join('')}</dl>`,
    '</section>',
  ].join('');
}

function renderNpcRollCard(instruction, evaluation, localize) {
  const actionLabel = localize(ACTION_LABEL_KEYS[instruction.kind]);
  let note = '';
  const rows = [
    renderRow(localize(`${MODULE_ID}.chat.actor`), instruction.target.name),
    renderRow(localize(`${MODULE_ID}.chat.total`), evaluation.total),
  ];

  if (instruction.kind === 'reaction') {
    rows.push(renderRow(
      localize(`${MODULE_ID}.chat.outcome`),
      localize(REACTION_LABEL_KEYS[evaluation.outcome.id]),
    ));
    if (evaluation.outcome.reroll) {
      note = `<p class="hyp3e-utilities-chat-card__note">${escapeHtml(
        localize(`${MODULE_ID}.chat.reroll`),
      )}</p>`;
    }
  }
  else {
    if (instruction.kind === 'save') {
      rows.push(renderRow(
        localize(`${MODULE_ID}.chat.category`),
        localize(`${MODULE_ID}.chat.saves.${instruction.saveKey}`),
      ));
    }
    const comparison = instruction.comparison === 'lessThanOrEqual'
      ? '≤'
      : '≥';
    rows.push(
      renderRow(
        localize(`${MODULE_ID}.chat.target`),
        `${comparison} ${instruction.targetValue}`,
      ),
      renderRow(
        localize(`${MODULE_ID}.chat.result`),
        localize(
          `${MODULE_ID}.chat.${evaluation.success ? 'success' : 'failure'}`,
        ),
      ),
    );
  }

  return [
    `<section class="${MODULE_ID} ${MODULE_ID}-chat-card" data-action="${escapeHtml(instruction.kind)}">`,
    `<h3 class="${MODULE_ID}-chat-card__title">${escapeHtml(actionLabel)}</h3>`,
    `<dl class="${MODULE_ID}-chat-card__details">${rows.join('')}</dl>`,
    note,
    '</section>',
  ].join('');
}

function evaluateInstruction(instruction, total) {
  if (instruction.kind === 'reaction') {
    return Object.freeze({
      ...instruction,
      total,
      outcome: getReactionOutcome(total),
    });
  }
  return evaluateCheckRoll(instruction, total);
}

function getFoundryGeneration(game) {
  const releaseGeneration = Number(game?.release?.generation);
  if (Number.isFinite(releaseGeneration)) return releaseGeneration;
  return Number.parseInt(String(game?.version ?? ''), 10);
}

export function getRollMessageModeOptions(generation) {
  return Number(generation) >= 14
    ? { messageMode: GM_MESSAGE_MODE }
    : { rollMode: LEGACY_GM_ROLL_MODE };
}

function getRecipientIds(ChatMessageClass) {
  const recipients = ChatMessageClass.getWhisperRecipients('GM') ?? [];
  return Array.from(recipients)
    .map((recipient) => recipient?.id ?? recipient)
    .filter((recipientId) => typeof recipientId === 'string' && recipientId);
}

async function resolveSpeaker(target, ChatMessageClass, fromUuid) {
  if (target.tokenUuid) {
    const token = await fromUuid(target.tokenUuid);
    if (!token?.actor) {
      throw new Error(`Could not resolve token target "${target.tokenUuid}".`);
    }
    return ChatMessageClass.getSpeaker({ actor: token.actor, token });
  }

  const actor = target.actorUuid ? await fromUuid(target.actorUuid) : null;
  if (!actor) {
    throw new Error(`Could not resolve Actor target "${target.actorUuid}".`);
  }
  return ChatMessageClass.getSpeaker({ actor });
}

function createBatchId(randomId) {
  if (typeof randomId === 'function') return randomId();
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  throw new Error('A chat batch ID generator is unavailable.');
}

function validateBatch(batch) {
  if (!ACTION_LABEL_KEYS[batch?.kind] || !Array.isArray(batch.rolls)) {
    throw new TypeError('A reaction, save, or morale roll batch is required.');
  }
}

export function createChatCardService({
  ChatMessageClass = globalThis.ChatMessage,
  RollClass = globalThis.Roll,
  config = globalThis.CONFIG,
  fromUuid = globalThis.fromUuid,
  game = globalThis.game,
  logger = console,
  randomId = globalThis.foundry?.utils?.randomID,
} = {}) {
  async function createItemTransferReport(report) {
    validateItemTransferReport(report);
    if (typeof ChatMessageClass?.create !== 'function') {
      throw new Error('Foundry chat APIs are unavailable.');
    }
    const message = await ChatMessageClass.create({
      author: game?.user?.id,
      content: renderItemTransferCard(
        report,
        (key) => game.i18n.localize(key),
      ),
      flags: {
        [MODULE_ID]: {
          action: 'itemTransfer',
          destinationActorUuid: report.destinationActorUuid,
          feature: 'partySheet',
          merged: report.merged,
          quantity: report.quantity,
          requesterUserId: report.requesterUserId,
          sourceActorUuid: report.sourceActorUuid,
          sourceItemUuid: report.sourceItemUuid,
        },
      },
    });
    return Object.freeze({ message });
  }

  async function createMarchingOrderReport(report) {
    validateMarchingOrderReport(report);
    if (typeof ChatMessageClass?.create !== 'function') {
      throw new Error('Foundry chat APIs are unavailable.');
    }
    const message = await ChatMessageClass.create({
      author: game?.user?.id,
      content: renderMarchingOrderCard(
        report,
        (key) => game.i18n.localize(key),
      ),
      flags: {
        [MODULE_ID]: {
          action: 'marchingOrderReport',
          feature: 'partySheet',
          revision: report.revision,
        },
      },
    });
    return Object.freeze({ message, revision: report.revision });
  }

  async function createNpcRollBatch(batch, { batchId } = {}) {
    validateBatch(batch);
    if (!game?.user?.isGM) {
      throw new Error('Only a GM can create NPC roll chat cards.');
    }
    if (
      typeof RollClass !== 'function'
      || typeof ChatMessageClass?.create !== 'function'
      || typeof ChatMessageClass?.getSpeaker !== 'function'
      || typeof fromUuid !== 'function'
    ) {
      throw new Error('Foundry roll and chat APIs are unavailable.');
    }

    const whisper = getRecipientIds(ChatMessageClass);
    if (whisper.length === 0) {
      throw new Error('Foundry did not provide any GM recipients.');
    }

    const sharedBatchId = batchId ?? createBatchId(randomId);
    const created = [];
    const failures = [];
    const localize = (key) => game.i18n.localize(key);
    const createOptions = getRollMessageModeOptions(
      getFoundryGeneration(game),
    );

    for (const instruction of batch.rolls) {
      try {
        const speaker = await resolveSpeaker(
          instruction.target,
          ChatMessageClass,
          fromUuid,
        );
        const roll = await new RollClass(instruction.formula).evaluate();
        const total = Number(roll.total);
        if (!Number.isFinite(total)) {
          throw new TypeError('Roll total must be a finite number.');
        }
        const evaluation = evaluateInstruction(instruction, total);
        const content = renderNpcRollCard(
          instruction,
          evaluation,
          localize,
        );
        const message = await ChatMessageClass.create({
          author: game.user.id,
          speaker,
          content,
          rolls: [roll],
          sound: config?.sounds?.dice,
          whisper,
          flags: {
            [MODULE_ID]: {
              feature: FEATURE_ID,
              action: instruction.kind,
              category: instruction.saveKey ?? null,
              tokenUuid: instruction.target.tokenUuid,
              actorUuid: instruction.target.actorUuid,
              batchId: sharedBatchId,
            },
          },
        }, createOptions);
        created.push(Object.freeze({ evaluation, instruction, message, roll }));
      }
      catch (error) {
        failures.push(Object.freeze({
          target: instruction.target,
          message: error?.message ?? String(error),
        }));
      }
    }

    const skipped = batch.skipped ?? [];
    if (skipped.length || failures.length) {
      logger.warn?.(
        `NPC roll batch completed with ${skipped.length} skipped target(s) and ${failures.length} failed target(s).`,
        { batchId: sharedBatchId, failures, skipped },
      );
    }

    return Object.freeze({
      batchId: sharedBatchId,
      kind: batch.kind,
      created: Object.freeze(created),
      skipped,
      failures: Object.freeze(failures),
    });
  }

  return Object.freeze({
    createItemTransferReport,
    createMarchingOrderReport,
    createNpcRollBatch,
  });
}
