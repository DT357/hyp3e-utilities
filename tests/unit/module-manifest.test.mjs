import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
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
  assert.equal(manifest.version, '1.0.0');
  assert.equal(packageMetadata.license, 'MIT');
  assert.equal(manifest.license, 'LICENSE');
  assert.equal(manifest.socket, true);
  assert.deepEqual(manifest.relationships?.systems, [
    {
      id: 'hyp3e',
      type: 'system',
      compatibility: { minimum: '4.0.3' },
    },
  ]);
  assert.deepEqual(manifest.relationships?.requires, [
    {
      id: 'socketlib',
      type: 'module',
      compatibility: { minimum: '1.1.4' },
    },
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

test('release archive uses the canonical payload list', async () => {
  const releaseFiles = (
    await readFile(projectFileUrl('scripts/release-files.txt'), 'utf8')
  )
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter(Boolean);

  assert.deepEqual(releaseFiles, [
    'module.json',
    'README.md',
    'CHANGELOG.md',
    'LICENSE',
    'THIRD_PARTY_NOTICES.md',
    'module',
    'styles',
    'lang',
    'templates',
    'docs/user-guide.md',
  ]);

  await Promise.all(
    releaseFiles.map((relativePath) => access(projectFileUrl(relativePath))),
  );
});

test('release workflow publishes only the validated artifact set', async () => {
  const workflow = await readFile(
    projectFileUrl('.github/workflows/validate-and-release.yml'),
    'utf8',
  );

  assert.match(workflow, /mapfile -t release_paths < scripts\/release-files\.txt/);
  assert.match(
    workflow,
    /zip -X -r hyp3e-utilities\.zip "\$\{release_paths\[@\]\}"/,
  );
  assert.match(
    workflow,
    /sha256sum module\.json hyp3e-utilities\.zip > SHA256SUMS\.txt/,
  );
  assert.match(workflow, /uses: actions\/upload-artifact@v7/);
  assert.match(workflow, /uses: actions\/download-artifact@v8/);
  assert.match(workflow, /sha256sum --check SHA256SUMS\.txt/);
  assert.match(workflow, /--repo "\$\{GITHUB_REPOSITORY\}"/);
  for (const releaseAsset of [
    'hyp3e-utilities.zip',
    'module.json',
    'SHA256SUMS.txt',
  ]) {
    assert.match(workflow, new RegExp(`release-artifacts/${releaseAsset.replace('.', '\\.')}`));
  }
});

test('Foundry compatibility diagnostics declare their test dependencies', async () => {
  const diagnosticManifest = await readProjectJson(
    'tests/foundry/diagnostics/module.json',
  );

  assert.equal(diagnosticManifest.id, 'hyp3e-utilities-diagnostics');
  assert.equal(diagnosticManifest.compatibility.minimum, '13');
  assert.equal(diagnosticManifest.compatibility.maximum, '14');
  assert.equal(diagnosticManifest.socket, true);
  assert.deepEqual(
    diagnosticManifest.relationships.requires.map(({ id }) => id),
    ['hyp3e-utilities', 'socketlib'],
  );
});

test('README links a complete operator guide for every core workflow', async () => {
  const [manifest, readme, userGuide] = await Promise.all([
    readProjectJson('module.json'),
    readFile(projectFileUrl('README.md'), 'utf8'),
    readFile(projectFileUrl('docs/user-guide.md'), 'utf8'),
  ]);

  assert.match(readme, /\[User Guide\]\(docs\/user-guide\.md\)/);
  assert.ok(userGuide.includes(manifest.manifest));
  for (const heading of [
    'Installation',
    'First-Time GM Setup',
    'Party Sheet Permissions',
    'NPC Action HUD',
    'Party Sheet Workflows',
    'Experience, Coins, and Wages',
    'Item Transfers',
    'Recovery and Troubleshooting',
    'Current Limitations',
  ]) {
    assert.match(userGuide, new RegExp(`^## ${heading}$`, 'm'));
  }
});
