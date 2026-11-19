import { cp, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const root = new URL('./', import.meta.url);
const files = [
  'index.html', 'admin.html', 'styles.css', 'admin.css', 'conteudo.js', 'script.js', 'links.js',
  'admin.js', 'firebase-config.js', 'cloud.mjs', 'catalogo.js', 'assets',
];

export async function prepareHosting(output = new URL('public/', root)) {
  await mkdir(output, { recursive: true });
  for (const file of files) {
    await cp(new URL(file, root), new URL(file, output), { recursive: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await prepareHosting();
  console.log('Arquivos de publicação preparados em public/.');
}
