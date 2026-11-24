// Teste de ponta a ponta do servidor MCP contra os emuladores de `node preview-admin.mjs`.
// Uso: com os emuladores ativos em outro terminal, rode `node mcp/teste-local.mjs`.
// Altera somente o Firestore do emulador, que é descartado ao encerrar o preview.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const password = 'PortfolioTeste123!';
const env = {
  ...process.env,
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  PORTFOLIO_API_KEY: 'local-emulator-only',
  PORTFOLIO_PROJECT_ID: 'demo-portfolio-local',
  PORTFOLIO_OWNER_UID: 'portfolio-demo-owner',
  PORTFOLIO_EMAIL: 'teste@example.test',
  PORTFOLIO_PASSWORD: password,
};
const online = !process.argv.includes('--sem-github');
const transcript = [];

function start(extra = {}) {
  const child = spawn(process.execPath, [fileURLToPath(new URL('./server.mjs', import.meta.url))], { env: { ...env, ...extra }, stdio: ['pipe', 'pipe', 'pipe'] });
  const waiting = new Map();
  let next = 1;
  createInterface({ input: child.stdout }).on('line', (line) => {
    transcript.push(line);
    const message = JSON.parse(line);
    waiting.get(message.id)?.(message);
    waiting.delete(message.id);
  });
  child.stderr.on('data', (chunk) => transcript.push(String(chunk)));
  const rpc = (method, params) => new Promise((resolve) => {
    const id = next++;
    waiting.set(id, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  const call = async (name, args = {}) => {
    const { result, error } = await rpc('tools/call', { name, arguments: args });
    assert.equal(error, undefined, `erro JSON-RPC em ${name}`);
    const text = result.content[0].text;
    return result.isError ? { erro: text } : JSON.parse(text);
  };
  return { child, rpc, call, stop: () => child.stdin.end() };
}

async function readDocument() {
  const response = await fetch('http://127.0.0.1:8080/v1/projects/demo-portfolio-local/databases/(default)/documents/publico/portfolio');
  if (response.status === 404) return { revision: 0 };
  const body = await response.json();
  return { revision: Number(body.fields.revision.integerValue) };
}

const steps = [];
async function step(name, action) {
  await action();
  steps.push(name);
  console.log(`ok - ${name}`);
}

// Começa de um Firestore local vazio (endpoint exclusivo do emulador) para o teste poder repetir.
const reset = await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-portfolio-local/databases/(default)/documents', { method: 'DELETE' })
  .catch(() => { throw new Error('Emulador do Firestore inacessível. Rode `node preview-admin.mjs` em outro terminal.'); });
assert.ok(reset.ok, 'não foi possível limpar o Firestore do emulador');

const server = start();
const { rpc, call } = server;
let revision;

await step('initialize e tools/list', async () => {
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'teste', version: '0' } });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  server.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  const { result } = await rpc('tools/list', {});
  const names = result.tools.map((tool) => tool.name);
  for (const name of ['get_portfolio', 'update_profile', 'upsert_project', 'remove_project', 'reorder_projects', 'upsert_skill', 'remove_skill', 'upsert_certificate', 'import_github_repos', 'get_translations', 'set_translations']) {
    assert.ok(names.includes(name), name);
  }
  const unknown = await rpc('metodo/inexistente', {});
  assert.equal(unknown.error.code, -32601);
});

await step('get_portfolio lê a revisão atual', async () => {
  const result = await call('get_portfolio');
  revision = result.revisao;
  assert.equal(revision, (await readDocument()).revision);
  assert.ok(Array.isArray(result.conteudo.projetos));
});

await step('dry_run mostra o diff sem publicar', async () => {
  const result = await call('upsert_project', {
    titulo: 'Calisto', categoria: 'pessoal', status: 'andamento', visibilidade: 'privado',
    resumo: 'Assistente de IA pessoal rodando em um Raspberry Pi.', tecnologias: ['Python', 'Raspberry Pi'], dry_run: true,
  });
  assert.equal(result.dry_run, true);
  assert.equal(result.acao, 'criado');
  assert.ok(result.alteracoes.some((change) => change.adicionado?.titulo === 'Calisto'));
  assert.equal((await readDocument()).revision, revision);
});

await step('upsert_project cria Calisto, EyeBridge e printVal-3d (revisão +1 a cada escrita)', async () => {
  for (const project of [
    { titulo: 'Calisto', categoria: 'pessoal', status: 'andamento', visibilidade: 'privado', resumo: 'Assistente de IA pessoal rodando em um Raspberry Pi.', tecnologias: ['Python', 'Raspberry Pi'] },
    { titulo: 'EyeBridge', status: 'beta', resumo: 'Ponte entre visão computacional e acessibilidade.', repositorio: 'https://github.com/exemplo/eyebridge', visibilidade: 'publico' },
    { titulo: 'printVal-3d', status: 'parcial', resumo: 'Validação de peças para impressão 3D.', tecnologias: ['C++, Python'] },
  ]) {
    const result = await call('upsert_project', project);
    assert.equal(result.publicado, true, JSON.stringify(result));
    assert.equal(result.revisao, revision + 1);
    revision = result.revisao;
    assert.equal((await readDocument()).revision, revision);
  }
  const { conteudo } = await call('get_portfolio', { secao: 'projetos' });
  const calisto = conteudo.projetos.find((project) => project.titulo === 'Calisto');
  assert.equal(calisto.repositorio, '');
  assert.deepEqual(conteudo.projetos.find((project) => project.titulo === 'printVal-3d').tecnologias, ['C++', 'Python']);
});

await step('upsert_project atualiza pelo repositório e renomeia pelo campo projeto', async () => {
  let result = await call('upsert_project', { repositorio: 'https://github.com/exemplo/eyebridge/', demo: 'https://eyebridge.example.test' });
  assert.equal(result.acao, 'atualizado');
  result = await call('upsert_project', { projeto: 'printval-3D', titulo: 'printVal-3d', status: 'concluido', posicao: 1 });
  assert.equal(result.acao, 'atualizado');
  assert.equal(result.posicao, 1);
  revision = result.revisao;
  result = await call('upsert_project', { titulo: 'printVal-3d', status: 'concluido' });
  assert.equal(result.publicado, false, 'sem mudanças não publica');
  assert.equal(result.revisao, revision);
});

await step('validação recusa entradas fora das regras', async () => {
  const cases = [
    ['upsert_project', { titulo: 'Sem resumo' }, /resumo/],
    ['upsert_project', { titulo: 'X', resumo: 'y', repositorio: 'https://gitlab.com/a/b' }, /reposit/],
    ['upsert_project', { titulo: 'X', resumo: 'y', status: 'pronto' }, /status/],
    ['upsert_project', { titulo: 'X', resumo: 'y', demo: 'javascript:alert(1)' }, /demonstra/],
    ['upsert_project', { titulo: 'X', resumo: 'y'.repeat(321) }, /320/],
    ['upsert_project', { titulo: 'X', resumo: 'y', campoNovo: 1 }, /desconhecido/],
    ['update_profile', { redes: { email: 'nao-e-email' } }, /e-mail/],
    ['update_profile', { curriculo: 'ftp://exemplo.test/cv.pdf' }, /Currículo/],
    ['upsert_certificate', { titulo: 'Curso', instituicao: 'Escola', data: '2026-02-30' }, /AAAA-MM-DD/],
    ['upsert_skill', { nome: 'Go', tipo: 'idioma' }, /tipo/],
    ['remove_project', { projeto: 'Não existe' }, /não encontrado/],
  ];
  for (const [tool, args, pattern] of cases) {
    const result = await call(tool, args);
    assert.match(result.erro ?? '', pattern, `${tool} ${JSON.stringify(args)} → ${JSON.stringify(result)}`);
  }
  assert.equal((await readDocument()).revision, revision);
});

await step('revisao_esperada desatualizada é recusada', async () => {
  const result = await call('update_profile', { nome: 'Wesley', revisao_esperada: revision - 1 });
  assert.match(result.erro, /revisão/);
  const ok = await call('update_profile', { nome: 'Wesley', revisao_esperada: revision });
  assert.equal(ok.revisao, revision + 1);
  revision = ok.revisao;
});

await step('update_profile grava redes.email, github e currículo', async () => {
  const result = await call('update_profile', {
    introducao: 'Projetos pessoais, da faculdade e de IA.',
    redes: { email: 'wesley@example.test', github: 'https://github.com/octocat' },
    curriculo: 'https://example.test/cv.pdf',
  });
  assert.equal(result.revisao, revision + 1);
  revision = result.revisao;
  const { conteudo } = await call('get_portfolio', { secao: 'perfil' });
  assert.equal(conteudo.perfil.redes.email, 'wesley@example.test');
  assert.equal(conteudo.perfil.nome, 'Wesley');
});

await step('upsert_skill usa o ícone do nome e aceita icone/imagemOriginal', async () => {
  let result = await call('upsert_skill', { nome: 'node', experiencia: 'APIs e automações.' });
  assert.equal(result.acao, 'atualizada', 'encontra Node.js pelo ícone');
  assert.equal(result.tecnologia, 'Node.js');
  result = await call('upsert_skill', { nome: 'TypeScript', tipo: 'linguagem' });
  assert.equal(result.acao, 'criada');
  assert.equal(result.icone.icone, 'typescript');
  if (online) assert.equal(result.icone.encontrado, true);
  result = await call('upsert_skill', { nome: 'Hermes Agent', categoria: 'Ferramentas de IA', icone: 'nousresearch' });
  assert.equal(result.tipo, 'ferramenta');
  result = await call('upsert_skill', { tecnologia: 'Hermes Agent', imagem: './assets/favicon.svg', imagemOriginal: true });
  let { conteudo } = await call('get_portfolio', { secao: 'tecnologias' });
  assert.equal(conteudo.tecnologias.find((skill) => skill.nome === 'Hermes Agent').imagemOriginal, true);
  result = await call('upsert_skill', { tecnologia: 'Hermes Agent', imagemOriginal: false });
  ({ conteudo } = await call('get_portfolio', { secao: 'tecnologias' }));
  assert.equal('imagemOriginal' in conteudo.tecnologias.find((skill) => skill.nome === 'Hermes Agent'), false);
  result = await call('remove_skill', { tecnologia: 'typescript' });
  assert.equal(result.removida, 'TypeScript');
  revision = result.revisao;
});

await step('upsert_certificate cria e atualiza certificados', async () => {
  let result = await call('upsert_certificate', { titulo: 'Python Essentials', instituicao: 'Cisco', data: '2026-03-10', credencial: 'https://example.test/cred/1' });
  assert.equal(result.acao, 'criado');
  result = await call('upsert_certificate', { credencial: 'https://example.test/cred/1', titulo: 'Python Essentials 1' });
  assert.equal(result.acao, 'atualizado');
  result = await call('remove_certificate', { certificado: 'python essentials 1' });
  assert.equal(result.removido, 'Python Essentials 1');
  const { conteudo } = await call('get_portfolio');
  assert.equal('certificados' in conteudo, false, 'lista vazia sai do documento, como no painel');
  await call('upsert_certificate', { titulo: 'Python Essentials', instituicao: 'Cisco', data: '2026-03-10' });
  revision = (await readDocument()).revision;
});

await step('reorder_projects e remove_project', async () => {
  let result = await call('reorder_projects', { ordem: ['Calisto', 'https://github.com/exemplo/eyebridge'] });
  assert.deepEqual(result.ordem.slice(0, 3), ['Calisto', 'EyeBridge', 'printVal-3d']);
  assert.ok(result.alteracoes.some((change) => change.nova_ordem));
  result = await call('reorder_projects', { ordem: ['Calisto', 'calisto'] });
  assert.match(result.erro, /mais de uma vez/);
  for (const title of ['Rastreador de hábitos', 'Mapa do campus', 'Painel de dados']) {
    result = await call('remove_project', { projeto: title });
    if (!result.erro) assert.equal(result.removido, title);
  }
  revision = (await readDocument()).revision;
});

await step('get_translations e set_translations (versão em inglês)', async () => {
  let result = await call('get_translations', {});
  assert.ok(result.faltando > 0);
  assert.ok(result.projetos.some((project) => project.projeto === 'Calisto' && project.campos.resumo?.en === ''));
  result = await call('set_translations', {
    perfil: { sobre: { titulo: 'This is where I share what I build and learn.' } },
    projetos: [{ projeto: 'Calisto', resumo: 'Personal AI assistant running on a Raspberry Pi.' }],
    tecnologias: [{ tecnologia: 'Python', experiencia: 'Automation and scripts.' }],
    dry_run: true,
  });
  assert.equal(result.dry_run, true);
  assert.equal((await readDocument()).revision, revision);
  result = await call('set_translations', {
    perfil: { sobre: { titulo: 'This is where I share what I build and learn.' } },
    projetos: [{ projeto: 'Calisto', resumo: 'Personal AI assistant running on a Raspberry Pi.' }],
  });
  assert.equal(result.revisao, revision + 1);
  revision = result.revisao;
  const content = (await call('get_portfolio')).conteudo;
  assert.equal(content.en.sobre.titulo, 'This is where I share what I build and learn.');
  assert.equal(content.projetos.find((project) => project.titulo === 'Calisto').en.resumo, 'Personal AI assistant running on a Raspberry Pi.');
  // Editar o projeto em português mantém a tradução; texto vazio apaga.
  result = await call('upsert_project', { projeto: 'Calisto', descricao: 'Descrição nova.' });
  revision = result.revisao;
  assert.equal((await call('get_portfolio')).conteudo.projetos.find((project) => project.titulo === 'Calisto').en.resumo, 'Personal AI assistant running on a Raspberry Pi.');
  result = await call('set_translations', { projetos: [{ projeto: 'Calisto', resumo: '' }] });
  revision = result.revisao;
  assert.equal((await call('get_portfolio')).conteudo.projetos.find((project) => project.titulo === 'Calisto').en, undefined);
  result = await call('set_translations', { projetos: [{ projeto: 'Calisto', inventado: 'x' }] });
  assert.match(result.erro, /desconhecido/);
});

if (online) {
  await step('import_github_repos (dry_run e importação de um repositório)', async () => {
    let result = await call('import_github_repos', { dry_run: true });
    assert.equal(result.usuario, 'octocat', 'usa redes.github quando falta usuario');
    assert.ok(result.importados.length > 0);
    assert.equal((await readDocument()).revision, revision);
    result = await call('import_github_repos', { usuario: 'octocat', repositorios: ['Hello-World', 'nao-existe-123'] });
    assert.deepEqual(result.importados, ['Hello World']);
    assert.deepEqual(result.nao_encontrados, ['nao-existe-123']);
    assert.equal(result.revisao, revision + 1);
    const project = result.alteracoes.find((change) => change.adicionado)?.adicionado;
    assert.equal(project.repositorio, 'https://github.com/octocat/Hello-World');
    assert.equal(project.visibilidade, 'publico');
    result = await call('import_github_repos', { usuario: 'octocat', repositorios: ['Hello-World'] });
    assert.equal(result.publicado, false);
    assert.equal(result.ignorados[0].motivo, 'já está no portfólio');
    revision = (await readDocument()).revision;
  });
}

server.stop();

await step('senha errada não publica e não vaza credenciais', async () => {
  const wrong = start({ PORTFOLIO_PASSWORD: 'senha-errada' });
  await wrong.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'teste', version: '0' } });
  const result = await wrong.call('update_profile', { nome: 'Invasor' });
  assert.match(result.erro, /Não foi possível entrar/);
  const read = await wrong.call('get_portfolio', { secao: 'perfil' });
  assert.equal(read.conteudo.perfil.nome, 'Wesley', 'leitura pública continua funcionando');
  wrong.stop();
  assert.equal((await readDocument()).revision, revision);
});

await step('outra conta não passa pela verificação de dono', async () => {
  const other = start({ PORTFOLIO_OWNER_UID: 'outro-uid' });
  await other.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'teste', version: '0' } });
  const result = await other.call('update_profile', { nome: 'Outro' });
  assert.match(result.erro, /não é a dona/);
  other.stop();
});

await step('firestore.rules continuam valendo (revisão pulada é recusada)', async () => {
  const signIn = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-emulator-only', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.PORTFOLIO_EMAIL, password, returnSecureToken: true }),
  }).then((response) => response.json());
  const response = await fetch('http://127.0.0.1:8080/v1/projects/demo-portfolio-local/databases/(default)/documents/publico/portfolio?updateMask.fieldPaths=revision', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signIn.idToken}` },
    body: JSON.stringify({ fields: { revision: { integerValue: String(revision + 2) } } }),
  });
  assert.equal(response.status, 403);
  assert.equal((await readDocument()).revision, revision);
});

await step('escrita concorrente é recusada pela pré-condição', async () => {
  const { PortfolioStore, loadSettings } = await import('./firebase.mjs');
  const settings = await loadSettings(env);
  const first = new PortfolioStore(settings);
  const second = new PortfolioStore(settings);
  const attempt = first.publish(async (current) => {
    await second.publish(async (other) => ({ content: { ...other.content, nome: 'Wesley B' } }));
    return { content: { ...current.content, nome: 'Wesley A' } };
  });
  await assert.rejects(attempt, /alterado ao mesmo tempo/);
  revision += 1;
  assert.equal((await readDocument()).revision, revision);
  const server2 = start();
  const { conteudo } = await server2.call('get_portfolio', { secao: 'perfil' });
  assert.equal(conteudo.perfil.nome, 'Wesley B');
  await server2.call('update_profile', { nome: 'Wesley' });
  server2.stop();
  revision += 1;
});

const everything = transcript.join('\n');
assert.ok(!everything.includes(password), 'a senha apareceu na saída');
assert.ok(!/eyJ[\w-]{10,}\.[\w-]{10,}/.test(everything) && !everything.includes('idToken'), 'um token apareceu na saída');
console.log(`\n${steps.length + 1} verificações passaram. Revisão final: ${revision}.`);
