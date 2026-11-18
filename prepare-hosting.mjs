import { cp, mkdir } from 'node:fs/promises';

const root = new URL('./', import.meta.url);
const output = new URL('public/', root);
await mkdir(output, { recursive: true });
const files = [
  'index.html', 'admin.html', 'styles.css', 'admin.css', 'conteudo.js', 'script.js', 'links.js',
  'admin.js', 'firebase-config.js', 'cloud.mjs', 'assets',
];
for (const file of files) {
  await cp(new URL(file, root), new URL(file, output), { recursive: true });
}
console.log('Arquivos de publicação preparados em public/.');
