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
