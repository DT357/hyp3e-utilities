import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

async function inventory(root, entries) {
  entries ??= await fs.readdir(root);
  const contents = {};
  async function walk(relative) {
    const filename = path.join(root, relative);
    const stat = await fs.lstat(filename);
    assert(!stat.isSymbolicLink(), `Linked package entry: ${filename}`);
    const key = relative.replaceAll('\\', '/');
    if (stat.isDirectory()) {
      contents[`${key}/`] = 'directory';
      for (const child of await fs.readdir(filename)) await walk(path.join(relative, child));
    } else {
      assert(stat.isFile(), `Special package entry: ${filename}`);
      contents[key] = createHash('sha256').update(await fs.readFile(filename)).digest('hex');
    }
  }
  for (const entry of entries) await walk(entry);
  return Object.fromEntries(Object.entries(contents).sort(([a], [b]) => a.localeCompare(b)));
}

export async function stageModule(repositoryRoot, {checkOnly = false} = {}) {
  const root = await fs.realpath(repositoryRoot);
  const readJson = async (name) => JSON.parse(await fs.readFile(path.join(root, name), 'utf8'));
  const manifest = await readJson('module.json');
  const metadata = await readJson('package.json');
  assert.equal(manifest.id, 'hyp3e-utilities', 'Unexpected module ID');
  assert.equal(manifest.version, metadata.version, 'Package version drift');
  const allowlist = (await fs.readFile(path.join(root, 'scripts/release-files.txt'), 'utf8'))
    .trim().split(/\r?\n/);
  for (const entry of allowlist) {
    assert(entry && !path.isAbsolute(entry) && !entry.includes(':')
      && !entry.split(/[\\/]/).some((segment) => ['.', '..', ''].includes(segment))
      && !/^(?:\.git|\.foundry-test|node_modules|foundry_module|tests|References)(?:[\\/]|$)/i.test(entry),
    `Invalid release allowlist entry: ${entry}`);
  }
  // Include parent directories of individual allowlisted files in the inventory.
  const expected = await inventory(root, allowlist);
  for (const entry of allowlist) {
    for (let parent = path.dirname(entry); parent !== '.'; parent = path.dirname(parent)) {
      assert(!(await fs.lstat(path.join(root, parent))).isSymbolicLink(), `Linked input parent: ${parent}`);
      expected[`${parent.replaceAll('\\', '/')}/`] = 'directory';
    }
  }
  const stagingRoot = path.join(root, 'foundry_module');
  const destination = path.join(stagingRoot, manifest.id);
  await fs.mkdir(stagingRoot, {recursive: true});
  assert(!(await fs.lstat(stagingRoot)).isSymbolicLink(), 'Linked staging root');
  assert.equal(await fs.realpath(stagingRoot), stagingRoot);
  const existing = await fs.lstat(destination).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (existing) {
    assert(existing.isDirectory() && !existing.isSymbolicLink(), 'Invalid staging destination');
    await inventory(destination); // Reject unsafe entries before replacing a generated tree.
  }
  if (!checkOnly) {
    const prepared = path.join(stagingRoot, `.prepared-${randomUUID()}`);
    const previous = path.join(stagingRoot, `.previous-${randomUUID()}`);
    await fs.mkdir(prepared);
    try {
      for (const entry of allowlist) {
        await fs.mkdir(path.dirname(path.join(prepared, entry)), {recursive: true});
        await fs.cp(path.join(root, entry), path.join(prepared, entry), {recursive: true});
      }
      assert.deepEqual(await inventory(prepared), expected, 'Prepared staging differs from release sources');
      if (existing) await fs.rename(destination, previous);
      try {
        await fs.rename(prepared, destination);
      } catch (error) {
        if (existing) await fs.rename(previous, destination);
        throw error;
      }
      if (existing) {
        assert.equal(path.dirname(await fs.realpath(previous)), stagingRoot);
        await fs.rm(previous, {recursive: true});
      }
    } finally {
      assert.equal(path.dirname(prepared), stagingRoot);
      await fs.rm(prepared, {recursive: true, force: true});
    }
  }
  assert.deepEqual(await inventory(destination), expected, 'Installed staging differs from release sources');
  return {destination, version: manifest.version,
    fileCount: Object.keys(expected).filter((name) => !name.endsWith('/')).length};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await stageModule(fileURLToPath(new URL('../', import.meta.url)), {
    checkOnly: process.argv.includes('--check'),
  });
  console.log(`Validated ${report.fileCount} staged files for hyp3e-utilities ${report.version}.`);
}
