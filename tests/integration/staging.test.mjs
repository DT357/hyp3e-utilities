import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import { stageModule } from '../../scripts/stage-module.mjs';

async function fixture(t) {
  const temporaryRoot = fileURLToPath(new URL('../../.foundry-test/', import.meta.url));
  await fs.mkdir(temporaryRoot, {recursive: true});
  const root = await fs.mkdtemp(path.join(temporaryRoot, 'staging-'));
  t.after(async () => {
    assert.equal(path.dirname(await fs.realpath(root)), path.resolve(temporaryRoot));
    await fs.rm(root, {recursive: true, force: true});
  });
  await fs.mkdir(path.join(root, 'scripts'));
  await fs.mkdir(path.join(root, 'module'));
  await fs.writeFile(path.join(root, 'module.json'), JSON.stringify({id: 'hyp3e-utilities', version: '1.0.1'}));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({version: '1.0.1'}));
  await fs.writeFile(path.join(root, 'module/main.mjs'), 'export const current = true;');
  await fs.writeFile(path.join(root, 'scripts/release-files.txt'), 'module.json\nmodule\n');
  return {root, staged: path.join(root, 'foundry_module/hyp3e-utilities')};
}

test('staging removes obsolete installed files and copies only the release allowlist', async (t) => {
  const {root, staged} = await fixture(t);
  await stageModule(root);
  await fs.writeFile(path.join(staged, 'module/obsolete.mjs'), 'obsolete');
  await fs.writeFile(path.join(root, 'private-development.txt'), 'excluded');
  await fs.writeFile(path.join(root, 'module/main.mjs'), 'export const current = 2;');
  await stageModule(root);
  assert.equal(await fs.readFile(path.join(staged, 'module/main.mjs'), 'utf8'), 'export const current = 2;');
  await assert.rejects(fs.access(path.join(staged, 'module/obsolete.mjs')));
  await assert.rejects(fs.access(path.join(staged, 'private-development.txt')));
  assert.equal((await stageModule(root, {checkOnly: true})).fileCount, 2);
});

test('staging validation rejects changed bytes, missing files, and unexpected files', async (t) => {
  const {root, staged} = await fixture(t);
  await stageModule(root);
  await fs.writeFile(path.join(staged, 'module/main.mjs'), 'tampered');
  await assert.rejects(stageModule(root, {checkOnly: true}));
  await stageModule(root);
  await fs.unlink(path.join(staged, 'module/main.mjs'));
  await assert.rejects(stageModule(root, {checkOnly: true}));
  await stageModule(root);
  await fs.writeFile(path.join(staged, 'extra.txt'), 'extra');
  await assert.rejects(stageModule(root, {checkOnly: true}));
});

test('staging rejects version drift and an allowlist outside the package', async (t) => {
  const {root} = await fixture(t);
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({version: '9.0.0'}));
  await assert.rejects(stageModule(root), /version/i);
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({version: '1.0.1'}));
  await fs.writeFile(path.join(root, 'scripts/release-files.txt'), '../private.txt\n');
  await assert.rejects(stageModule(root), /allowlist/i);
});
