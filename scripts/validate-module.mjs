import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const repositoryRoot = new URL('../', import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL('module.json', repositoryRoot), 'utf8'),
);
const packageMetadata = JSON.parse(
  await readFile(new URL('package.json', repositoryRoot), 'utf8'),
);

assert.equal(manifest.id, 'hyp3e-utilities');
assert.equal(manifest.title, 'Hyp3e Utilities');
assert.equal(manifest.version, packageMetadata.version);
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.deepEqual(manifest.relationships?.systems, [
  { id: 'hyp3e', type: 'system' },
]);

const referencedFiles = [
  ...manifest.esmodules,
  ...manifest.styles,
  ...manifest.languages.map(({ path }) => path),
];

await Promise.all(
  referencedFiles.map((filePath) => access(new URL(filePath, repositoryRoot))),
);

console.log(`Validated ${manifest.title} v${manifest.version}.`);
