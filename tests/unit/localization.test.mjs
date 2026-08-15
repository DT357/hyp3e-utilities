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
