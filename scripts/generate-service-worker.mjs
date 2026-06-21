import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const projectRoot = new URL('../', import.meta.url);
const distDirectory = new URL('../dist/', import.meta.url);
const templatePath = new URL('./service-worker-template.js', import.meta.url);
const outputPath = new URL('../dist/sw.js', import.meta.url);

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path)));
    } else {
      files.push(path);
    }
  }

  return files;
}

const distPath = distDirectory.pathname;
const sourceFiles = (await listFiles(distPath))
  .filter((path) => !path.endsWith(`${sep}sw.js`))
  .sort();
const files = sourceFiles.map((path) => `/${relative(distPath, path).split(sep).join('/')}`);

const template = await readFile(templatePath, 'utf8');
let hash = 2166136261;

for (const [index, path] of sourceFiles.entries()) {
  const content = await readFile(path);
  const versionInput = Buffer.concat([Buffer.from(files[index] ?? ''), content]);

  for (const byte of versionInput) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
}

const serviceWorker = template
  .replace('__CACHE_VERSION__', `emberbench-shell-${(hash >>> 0).toString(16)}`)
  .replace('__PRECACHE_ASSETS__', JSON.stringify(files, null, 2));

await writeFile(outputPath, serviceWorker);

console.log(
  `Generated ${relative(projectRoot.pathname, outputPath.pathname)} with ${files.length} assets.`,
);
