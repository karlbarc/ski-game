import { cp, mkdir, rm } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const path of ['index.html', 'src', 'assets', 'vendor']) {
  await cp(new URL(path, root), new URL(path, output), { recursive: true });
}
console.log('Juego preparado en dist/');
