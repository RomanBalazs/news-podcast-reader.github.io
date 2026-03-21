import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');

const filesToCopy = [
  'index.html',
  'admin.html',
  'app.js',
  'admin.js',
  'style.css'
];

const dirsToCopy = [
  'public'
];

async function rmSafe(target) {
  await fs.rm(target, { recursive: true, force: true });
}

async function copyRecursive(src, dest) {
  const stat = await fs.stat(src);
  if (stat.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    for (const entry of await fs.readdir(src)) {
      await copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }

  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

await rmSafe(distDir);
await fs.mkdir(distDir, { recursive: true });

for (const file of filesToCopy) {
  await copyRecursive(path.join(root, file), path.join(distDir, file));
}

for (const dir of dirsToCopy) {
  await copyRecursive(path.join(root, dir), path.join(distDir, dir));
}

await fs.writeFile(path.join(distDir, '.nojekyll'), '');
await fs.writeFile(
  path.join(distDir, '404.html'),
  `<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=./index.html"><title>Átirányítás</title></head><body><p>Átirányítás...</p></body></html>`
);

console.log('GitHub Pages csomag elkészült: dist/');
