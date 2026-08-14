import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import test from 'node:test';

import {
  projectFileUrl,
  readProjectJson,
} from '../helpers/project-files.mjs';

test('module and package metadata describe Hyp3e Utilities', async () => {
  const [manifest, packageMetadata] = await Promise.all([
    readProjectJson('module.json'),
    readProjectJson('package.json'),
  ]);

  assert.equal(manifest.id, 'hyp3e-utilities');
  assert.equal(manifest.title, 'Hyp3e Utilities');
  assert.equal(packageMetadata.name, manifest.id);
  assert.equal(packageMetadata.version, manifest.version);
  assert.equal(packageMetadata.license, 'MIT');
  assert.equal(manifest.license, 'LICENSE');
  assert.deepEqual(manifest.relationships?.systems, [
    { id: 'hyp3e', type: 'system' },
  ]);
});

test('every module-relative manifest path exists', async () => {
  const manifest = await readProjectJson('module.json');
  const modulePaths = [
    ...manifest.esmodules,
    ...manifest.styles,
    ...manifest.languages.map(({ path }) => path),
    manifest.license,
  ];

  await Promise.all(
    modulePaths.map((relativePath) => access(projectFileUrl(relativePath))),
  );
});

test('release URLs use the current repository and artifact names', async () => {
  const manifest = await readProjectJson('module.json');
  const repositoryUrl = 'https://github.com/DT357/hyp3e-utilities';

  assert.equal(manifest.url, repositoryUrl);
  assert.equal(manifest.bugs, `${repositoryUrl}/issues`);
  assert.equal(
    manifest.manifest,
    `${repositoryUrl}/releases/latest/download/module.json`,
  );
  assert.equal(
    manifest.download,
    `${repositoryUrl}/releases/latest/download/hyp3e-utilities.zip`,
  );
});
