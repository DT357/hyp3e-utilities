import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { SAVE_KEYS } from '../../module/core/constants.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));

function flattenKeys(value, prefix = '') {
  const keys = [];
  for (const [key, child] of Object.entries(value)) {
    const childKey = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object') {
      keys.push(...flattenKeys(child, childKey));
    }
    else {
      keys.push(childKey);
    }
  }
  return keys;
}

async function readFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await readFiles(entryPath));
    else files.push(entryPath);
  }
  return files;
}

async function readRuntimeTextFiles() {
  const directories = ['lang', 'module', 'templates'];
  return (await Promise.all(directories.map((directory) => (
    readFiles(path.join(REPOSITORY_ROOT, directory))
  )))).flat();
}

test('every static template localization key exists in English', async () => {
  const translations = JSON.parse(await readFile(
    path.join(REPOSITORY_ROOT, 'lang', 'en.json'),
    'utf8',
  ));
  const availableKeys = new Set(flattenKeys(translations));
  const templateFiles = await readFiles(path.join(REPOSITORY_ROOT, 'templates'));
  const referencedKeys = new Set();
  for (const templateFile of templateFiles) {
    const source = await readFile(templateFile, 'utf8');
    for (const match of source.matchAll(/hyp3e-utilities(?:\.[\w-]+)+/g)) {
      referencedKeys.add(match[0]);
    }
  }

  const missingKeys = [...referencedKeys]
    .filter((key) => !availableKeys.has(key));
  assert.deepEqual(missingKeys, []);
});

test('every literal runtime localization key exists in English', async () => {
  const translations = JSON.parse(await readFile(
    path.join(REPOSITORY_ROOT, 'lang', 'en.json'),
    'utf8',
  ));
  const availableKeys = new Set(flattenKeys(translations));
  const referencedKeys = new Set();
  for (const filename of await readRuntimeTextFiles()) {
    const source = await readFile(filename, 'utf8');
    for (const match of source.matchAll(/hyp3e-utilities(?:\.[\w-]+)+/g)) {
      if (match[0].includes('${')) continue;
      referencedKeys.add(match[0]);
    }
  }

  const missingKeys = [...referencedKeys]
    .filter((key) => !availableKeys.has(key));
  assert.deepEqual(missingKeys, []);
});

test('runtime user-facing text contains no replacement or mojibake markers', async () => {
  const invalidText = [];
  for (const filename of await readRuntimeTextFiles()) {
    const source = await readFile(filename, 'utf8');
    if (/[ÂÃ�]/u.test(source)) invalidText.push(path.relative(REPOSITORY_ROOT, filename));
  }
  assert.deepEqual(invalidText, []);
});

test('dynamic HUD and chat localization families are complete', async () => {
  const translations = JSON.parse(await readFile(
    path.join(REPOSITORY_ROOT, 'lang', 'en.json'),
    'utf8',
  ));
  const availableKeys = new Set(flattenKeys(translations));
  const requiredKeys = [
    'hyp3e-utilities.settings.enableNpcActionHud.name',
    'hyp3e-utilities.settings.enableNpcActionHud.hint',
    'hyp3e-utilities.settings.displayDetailedNpcInformation.name',
    'hyp3e-utilities.settings.displayDetailedNpcInformation.hint',
    'hyp3e-utilities.settings.resetHudPosition.name',
    'hyp3e-utilities.settings.resetHudPosition.label',
    'hyp3e-utilities.settings.resetHudPosition.hint',
    'hyp3e-utilities.hud.dragHandle',
    'hyp3e-utilities.hud.openActorSheetFor',
    'hyp3e-utilities.hud.saveUnavailable',
    'hyp3e-utilities.hud.moraleUnavailable',
    'hyp3e-utilities.hud.positionSaveFailed',
    ...SAVE_KEYS.flatMap((key) => [
      `hyp3e-utilities.hud.saves.${key}`,
      `hyp3e-utilities.chat.saves.${key}`,
    ]),
    ...['reaction', 'save', 'morale'].map(
      (key) => `hyp3e-utilities.chat.actions.${key}`,
    ),
    ...[
      'violent',
      'hostile',
      'unfriendly',
      'neutral',
      'friendly',
      'agreeable',
      'affable',
    ].map((key) => `hyp3e-utilities.chat.reactions.${key}`),
  ];

  assert.deepEqual(requiredKeys.filter((key) => !availableKeys.has(key)), []);
});

test('HUD template exposes keyboard and assistive-technology semantics', async () => {
  const template = await readFile(
    path.join(REPOSITORY_ROOT, 'templates', 'npc-action-hud.hbs'),
    'utf8',
  );

  assert.match(template, /role="region"/);
  assert.match(template, /aria-live="polite"/);
  assert.match(template, /hyp3e-utilities\.hud\.dragHandle/);
  assert.match(template, /hyp3e-utilities\.hud\.openActorSheetFor/);
  assert.match(template, /hyp3e-utilities\.hud\.saveUnavailable/);
  assert.match(template, /hyp3e-utilities\.hud\.moraleUnavailable/);
  assert.match(template, /<option[^>]*disabled/s);
});

test('NPC Action HUD keeps controls and selected NPCs compact', async () => {
  const [template, styles, diagnostics] = await Promise.all([
    readFile(path.join(REPOSITORY_ROOT, 'templates', 'npc-action-hud.hbs'), 'utf8'),
    readFile(path.join(REPOSITORY_ROOT, 'styles', 'hyp3e-utilities.css'), 'utf8'),
    readFile(
      path.join(REPOSITORY_ROOT, 'tests', 'foundry', 'diagnostics', 'diagnostics.mjs'),
      'utf8',
    ),
  ]);

  const reactionIndex = template.indexOf('data-action="reaction"');
  const moraleIndex = template.indexOf('data-action="morale"');
  const saveCategoryIndex = template.indexOf('data-role="save-category"');
  const saveIndex = template.indexOf('data-action="save"');
  assert.ok(reactionIndex < moraleIndex);
  assert.ok(moraleIndex < saveCategoryIndex);
  assert.ok(saveCategoryIndex < saveIndex);
  assert.match(template, /hyp3e-utilities-npc-action-hud__save-label/);
  assert.match(template, /hyp3e-utilities-npc-action-hud__actor-health[\s\S]*style="width: \{\{row\.hp\.percent\}\}%"/);
  assert.doesNotMatch(template, /hyp3e-utilities-npc-action-hud__hp-track/);
  assert.doesNotMatch(template, /npcSubtype|npc-action-hud__subtype/);
  assert.match(template, /\{\{#if @root\.displayDetailedNpcInformation\}\}[\s\S]*__stats--vitals[\s\S]*__stats--movement[\s\S]*\{\{\/if\}\}/);
  const vitalStats = template.match(
    /__stats--vitals">([\s\S]*?)<\/dl>/,
  )?.[1] ?? '';
  assert.match(vitalStats, /hyp3e-utilities\.hud\.hp[\s\S]*\{\{row\.hp\.value\}\} \/ \{\{row\.hp\.max\}\}/);
  assert.ok(vitalStats.indexOf('hud.hp') < vitalStats.indexOf('hud.ac'));
  assert.ok(vitalStats.indexOf('hud.ac') < vitalStats.indexOf('hud.dr'));
  assert.doesNotMatch(vitalStats, /hud\.movement|hud\.moraleValue/);
  const movementStats = template.match(
    /__stats--movement">([\s\S]*?)<\/dl>/,
  )?.[1] ?? '';
  assert.ok(movementStats.indexOf('hud.movement') < movementStats.indexOf('hud.moraleValue'));
  assert.match(styles, /\.hyp3e-utilities-npc-action-hud__actions\s*\{[^}]*flex-wrap:\s*nowrap;/s);
  assert.match(styles, /\.hyp3e-utilities-npc-action-hud__save-action select\s*\{[^}]*width:\s*108px;/s);
  assert.match(styles, /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(160px,\s*100%\),\s*1fr\)\);/);
  const targetStyles = styles.match(
    /\.hyp3e-utilities-npc-action-hud__target\s*\{[^}]*\}/s,
  )?.[0] ?? '';
  assert.match(targetStyles, /margin:\s*0;/);
  assert.match(styles, /__stats--vitals\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s);
  assert.match(styles, /__stats--movement\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
  const actorHealthStyles = styles.match(
    /\.hyp3e-utilities-npc-action-hud__actor-health\s*\{[^}]*\}/s,
  )?.[0] ?? '';
  assert.match(actorHealthStyles, /position:\s*absolute;/);
  assert.match(actorHealthStyles, /background:\s*linear-gradient/);
  assert.match(diagnostics, /querySelector\(\s*'\.hyp3e-utilities-npc-action-hud__actor-health'/s);
  assert.doesNotMatch(diagnostics, /hyp3e-utilities-npc-action-hud__hp-fill/);
  assert.match(diagnostics, /__stats dt'\)\.length\s*=== 5/s);
  assert.match(diagnostics, /subtypeRemoved:/);
  assert.match(diagnostics, /statLinesRendered:/);
  assert.match(diagnostics, /compactCardMarginsReset/);
  assert.match(diagnostics, /compactCardHeightsUniform/);
  assert.match(diagnostics, /detailedSettingHidesStats/);
  assert.match(diagnostics, /detailedSettingRestoresStats/);
});

test('NPC action chat-card emphasis inherits the active theme without shadows', async () => {
  const styles = await readFile(
    path.join(REPOSITORY_ROOT, 'styles', 'hyp3e-utilities.css'),
    'utf8',
  );

  assert.match(styles, /\.hyp3e-utilities-chat-card\s*\{[^}]*color:\s*inherit;[^}]*text-shadow:\s*none;/s);
  assert.match(styles, /\.hyp3e-utilities-chat-card :is\(h3, h4, dt, strong\)\s*\{[^}]*color:\s*inherit !important;[^}]*font-weight:\s*700 !important;[^}]*text-shadow:\s*none !important;/s);
});

test('Party Sheet tabs, movement controls, editors, and focus styles are accessible', async () => {
  const [template, styles] = await Promise.all([
    readFile(path.join(REPOSITORY_ROOT, 'templates', 'party-sheet.hbs'), 'utf8'),
    readFile(path.join(REPOSITORY_ROOT, 'styles', 'hyp3e-utilities.css'), 'utf8'),
  ]);

  assert.match(template, /role="tablist"/);
  assert.match(template, /role="tab"/);
  assert.match(template, /aria-controls="hyp3e-utilities-party-tab-panel"/);
  assert.match(template, /tabindex="\{\{#if active\}\}0\{\{else\}\}-1\{\{\/if\}\}"/);
  assert.match(template, /role="tabpanel"/);
  assert.match(template, /aria-labelledby="hyp3e-utilities-party-tab-\{\{activeTab\.id\}\}"/);
  assert.match(template, /data-action="moveMarchingActor"/);
  assert.match(template, /data-party-note-editor[\s\S]*aria-label=/);
  assert.match(styles, /\.hyp3e-utilities :is\([^)]*\):focus-visible/);
});

test('Party Sheet member roster keeps portrait ping and save actions compact', async () => {
  const [template, styles] = await Promise.all([
    readFile(path.join(REPOSITORY_ROOT, 'templates', 'party-sheet.hbs'), 'utf8'),
    readFile(path.join(REPOSITORY_ROOT, 'styles', 'hyp3e-utilities.css'), 'utf8'),
  ]);
  const rosterStart = template.indexOf('{{#if hasMembers}}');
  const rosterEnd = template.indexOf('{{#if showFollowers}}');
  const memberRoster = template.slice(rosterStart, rosterEnd);

  assert.match(
    memberRoster,
    /party-member-portrait[\s\S]*data-action="pingActor"[\s\S]*<img/,
  );
  assert.doesNotMatch(
    memberRoster,
    /data-action="pingActor"[\s\S]*pingToken"\}\}<\/button>/,
  );
  assert.match(
    memberRoster,
    /party-row-actions--member[\s\S]*data-action="rollMemberSave"/,
  );
  assert.doesNotMatch(memberRoster, /data-field="party-save"/);
  assert.match(
    styles,
    /party-row-actions--member\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*grid-column:\s*auto;/s,
  );
  assert.doesNotMatch(styles, /party-row-actions--member select\s*\{/s);
  assert.ok(
    memberRoster.indexOf('party-row-actions--member')
      < memberRoster.indexOf('party-member-remove--icon'),
  );
  assert.match(
    memberRoster,
    /party-member-remove--icon[\s\S]*data-action="removeMember"[\s\S]*data-tooltip=[\s\S]*aria-label=[\s\S]*fa-xmark/,
  );
  assert.match(
    styles,
    /party-member-remove--icon\s*\{[^}]*color:\s*var\(--color-level-error,[^}]*width:\s*2rem;/s,
  );
  const hpIndex = memberRoster.indexOf('party-member-stat--hp');
  const acIndex = memberRoster.indexOf('party-member-stat--ac');
  const drIndex = memberRoster.indexOf('party-member-stat--dr');
  const movementIndex = memberRoster.indexOf('party-member-stat--movement');
  const shareIndex = memberRoster.indexOf('party-member-stat--share');
  assert.ok(hpIndex < acIndex && acIndex < drIndex);
  assert.ok(drIndex < movementIndex && movementIndex < shareIndex);
  assert.match(
    memberRoster,
    /party-member-stat--hp[\s\S]*\{\{summary\.hp\.value\}\}\/\{\{summary\.hp\.max\}\}/,
  );
  assert.match(
    styles,
    /party-member-stats--overview\s*\{[^}]*grid-template-areas:\s*"hp hp ac ac dr dr"\s*"movement movement movement share share share";/s,
  );
  assert.match(
    styles,
    /party-member-stats--overview div\s*\{[^}]*display:\s*flex;[^}]*white-space:\s*nowrap;/s,
  );
});

test('Party Sheet treasury rows place Take after clearly spaced quantity metrics', async () => {
  const [template, styles] = await Promise.all([
    readFile(path.join(REPOSITORY_ROOT, 'templates', 'party-sheet.hbs'), 'utf8'),
    readFile(path.join(REPOSITORY_ROOT, 'styles', 'hyp3e-utilities.css'), 'utf8'),
  ]);

  assert.match(
    template,
    /treasury-item-quantity[\s\S]*treasury-item-take[\s\S]*data-action="takeTreasuryItem"/,
  );
  assert.match(
    styles,
    /treasury-items\s*>\s*li\s*\{[^}]*grid-template-areas:\s*"image identity quantity take";[^}]*grid-template-columns:\s*3rem minmax\(8rem,\s*1fr\) auto auto;/s,
  );
  assert.match(
    styles,
    /treasury-item-quantity\s*\{[^}]*column-gap:\s*0\.85rem;[^}]*grid-area:\s*quantity;[^}]*grid-auto-flow:\s*column;/s,
  );
  assert.match(
    styles,
    /treasury-item-take\s*\{[^}]*grid-area:\s*take;/s,
  );
});

test('Party Sheet follower roster mirrors compact member controls', async () => {
  const [template, styles] = await Promise.all([
    readFile(path.join(REPOSITORY_ROOT, 'templates', 'party-sheet.hbs'), 'utf8'),
    readFile(path.join(REPOSITORY_ROOT, 'styles', 'hyp3e-utilities.css'), 'utf8'),
  ]);
  const rosterStart = template.indexOf('{{#if hasFollowers}}');
  const rosterEnd = template.indexOf('{{#if showMarchingOrder}}');
  const followerRoster = template.slice(rosterStart, rosterEnd);

  assert.match(
    followerRoster,
    /party-follower-portrait[\s\S]*data-action="pingActor"[\s\S]*<img/,
  );
  assert.doesNotMatch(
    followerRoster,
    /data-action="pingActor"[\s\S]*pingToken"\}\}<\/button>/,
  );
  assert.match(
    followerRoster,
    /party-member-stats--follower[\s\S]*party-member-stat--hp[\s\S]*party-member-stat--ac[\s\S]*party-member-stat--dr[\s\S]*party-member-stat--movement[\s\S]*party-member-stat--share/,
  );
  assert.match(
    followerRoster,
    /party-member-stat--share[\s\S]*data-field="follower-share"/,
  );
  assert.match(
    followerRoster,
    /party-employment--compact[\s\S]*wageGpShort[\s\S]*data-field="follower-wage"[\s\S]*saveFollowerShort/,
  );
  assert.match(
    followerRoster,
    /party-row-actions--follower[\s\S]*party-follower-save-action[\s\S]*rollFollowerSave[\s\S]*party-follower-morale-action[\s\S]*rollFollowerMorale/,
  );
  assert.doesNotMatch(
    followerRoster,
    /party-row-actions--follower[\s\S]*data-field="party-save"/,
  );
  assert.ok(
    followerRoster.indexOf('party-row-actions--follower')
      < followerRoster.indexOf('party-follower-remove--icon'),
  );
  assert.match(
    styles,
    /party-employment--compact\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*nowrap;/s,
  );
  assert.match(
    styles,
    /party-follower\s*\{[^}]*grid-template-areas:\s*"portrait identity hp movement rolls rolls rolls remove"\s*"portrait identity ac dr share employment employment employment";/s,
  );
  assert.match(
    styles,
    /party-member-stats--follower\s*\{[^}]*display:\s*contents;/s,
  );
  assert.match(
    styles,
    /party-member-stats--follower\s*>\s*div\s*\{[^}]*display:\s*flex;[^}]*white-space:\s*nowrap;/s,
  );
  assert.match(
    styles,
    /party-row-actions--follower\s*\{[^}]*display:\s*flex;[^}]*grid-area:\s*rolls;[^}]*justify-content:\s*flex-end;/s,
  );
  assert.match(
    styles,
    /party-employment--compact\s*\{[^}]*grid-area:\s*employment;/s,
  );
  assert.match(
    styles,
    /party-follower-remove--icon\s*\{[^}]*grid-area:\s*remove;/s,
  );
});

test('fixed HUD foreground colors meet WCAG AA contrast', () => {
  function rgb(hex) {
    return [1, 3, 5].map((offset) => Number.parseInt(
      hex.slice(offset, offset + 2),
      16,
    ));
  }
  function luminance(hex) {
    const channels = rgb(hex).map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0]
      + 0.7152 * channels[1]
      + 0.0722 * channels[2];
  }
  function contrast(left, right) {
    const [lighter, darker] = [luminance(left), luminance(right)]
      .sort((a, b) => b - a);
    return (lighter + 0.05) / (darker + 0.05);
  }

  assert.ok(contrast('#f4ecd7', '#181411') >= 4.5);
  assert.ok(contrast('#f1b562', '#181411') >= 4.5);
});
