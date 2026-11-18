import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { prepareHosting } from './prepare-hosting.mjs';

const host = '127.0.0.1';
const ports = { hosting: 4175, auth: 9099, firestore: 8080 };
const project = 'demo-portfolio-local';
const account = { localId: 'portfolio-demo-owner', email: 'teste@example.test', rawPassword: 'PortfolioTeste123!' };
const site = `http://${host}:${ports.hosting}`;

async function verifyPorts() {
  for (const port of Object.values(ports)) {
    const server = createServer();
    await new Promise((resolve, reject) => {
      server.once('error', () => reject(new Error(`A porta ${port} está ocupada. Encerre a sessão local que está usando essa porta.`)));
      server.listen(port, host, () => server.close(resolve));
    });
  }
}

async function environment() {
  const env = { ...process.env, NO_UPDATE_NOTIFIER: '1' };
  if (process.platform !== 'win32' || spawnSync('where.exe', ['java.exe']).status === 0) return env;

  let java = env.JAVA_HOME;
  if (!java) {
    const extensions = join(homedir(), '.vscode', 'extensions');
    const names = await readdir(extensions).catch(() => []);
    for (const name of names.filter((value) => value.startsWith('redhat.java-')).sort().reverse()) {
      const directory = join(extensions, name, 'jre');
      const [runtime] = await readdir(directory).catch(() => []);
      if (runtime) { java = join(directory, runtime); break; }
    }
  }
  if (!java) return env;
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
  env.JAVA_HOME = java;
  env[pathKey] = `${join(java, 'bin')}${delimiter}${env[pathKey] ?? ''}`;
  return env;
}

async function preparePreview() {
  const directory = await mkdtemp(join(tmpdir(), 'portfolio-admin-'));
  const output = pathToFileURL(`${join(directory, 'public')}${sep}`);
  await prepareHosting(output);

  const config = JSON.parse(await readFile(new URL('./firebase.json', import.meta.url), 'utf8'));
  config.emulators.hosting = { host, port: ports.hosting };
  const rules = await readFile(new URL('./firestore.rules', import.meta.url), 'utf8');
  const localRules = rules.replace(/request\.auth\.uid == '[^']+'/, `request.auth.uid == '${account.localId}'`);
  if (rules === localRules) throw new Error('Não foi possível preparar o UID fictício nas regras locais.');

  const settings = {
    firebase: { apiKey: 'local-emulator-only', projectId: project, appId: '1:000000000000:web:000000' },
    ownerUid: account.localId,
    emulator: true,
  };
  await Promise.all([
    writeFile(join(directory, 'firebase.json'), JSON.stringify(config)),
    writeFile(join(directory, 'firestore.rules'), localRules),
    writeFile(new URL('firebase-config.js', output), `globalThis.portfolioCloud = ${JSON.stringify(settings)};\n`),
  ]);
  return directory;
}

async function seedAccount() {
  const auth = `http://${host}:${ports.auth}/identitytoolkit.googleapis.com/v1/projects/${project}/accounts:batchCreate`;
  const response = await fetch(auth, {
    method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ users: [account] }), signal: AbortSignal.timeout(1000),
  });
  if (!response.ok) throw new Error(`Falha ao criar a conta de teste (HTTP ${response.status}).`);
  const result = await response.json();
  if (result.error?.length) throw new Error('O emulador recusou a criação da conta fictícia.');
}

let emulator;
try {
  await verifyPorts();
  const cwd = await preparePreview();
  const args = ['emulators:start', '--only', 'hosting,auth,firestore', '--project', project, '--non-interactive'];
  const command = process.platform === 'win32' ? process.env.ComSpec ?? 'cmd.exe' : 'firebase';
  const commandArgs = process.platform === 'win32' ? ['/d', '/c', 'firebase', ...args] : args;
  emulator = spawn(command, commandArgs, { cwd, env: await environment(), stdio: 'inherit' });
  let stopped = false;
  const finished = new Promise((resolve) => {
    emulator.once('exit', (code) => resolve(code ?? 0));
    emulator.once('error', () => resolve(1));
  }).then((code) => { stopped = true; return code; });

  const ready = async () => {
    const deadline = Date.now() + 300_000;
    while (!stopped && Date.now() < deadline) {
      const response = await fetch(`${site}/admin.html`, { signal: AbortSignal.timeout(1000) }).catch(() => null);
      const auth = await fetch(`http://${host}:${ports.auth}/`, { signal: AbortSignal.timeout(1000) }).catch(() => null);
      if (response?.ok && auth) { await seedAccount(); return true; }
      await delay(500);
    }
    return false;
  };
  const started = await Promise.race([ready(), finished.then(() => false)]);
  if (!started) throw new Error('Os emuladores não iniciaram. Confira a Firebase CLI, o Java e as mensagens acima.');
  console.log(`\nPainel local: ${site}/admin.html\nE-mail: ${account.email}\nSenha de teste: ${account.rawPassword}\nUse Ctrl+C para encerrar.\n`);
  process.exitCode = await finished;
} catch (error) {
  emulator?.kill();
  console.error(error.message);
  process.exitCode = 1;
}
