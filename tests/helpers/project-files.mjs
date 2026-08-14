import { readFile } from 'node:fs/promises';

export const repositoryRoot = new URL('../../', import.meta.url);

export function projectFileUrl(relativePath) {
  return new URL(relativePath, repositoryRoot);
}

export async function readProjectJson(relativePath) {
  return JSON.parse(await readFile(projectFileUrl(relativePath), 'utf8'));
}
