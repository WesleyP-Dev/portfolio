#!/usr/bin/env node
// Servidor MCP (stdio) para ler e atualizar o conteúdo do portfólio no Firestore.
// Sem dependências: fala JSON-RPC por linhas no stdin/stdout. Mensagens de diagnóstico vão para o stderr.
import { createInterface } from 'node:readline';
import { PortfolioStore, loadSettings } from './firebase.mjs';
import {
  clone, diffContent, findIndex, loadSite, looksLikeUrl, moveTo, normalizeCertificate, normalizeContent,
  normalizeProject, normalizeSkill, onlyKeys, sameText, sameUrl,
} from './portfolio.mjs';

const serverInfo = { name: 'portfolio', title: 'Portfólio do Wesley', version: '1.0.0' };
const protocolVersions = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const site = await loadSite();
let store;

function getStore() {
  return (store ??= loadSettings().then((settings) => new PortfolioStore(settings)));
}

// ——— Esquemas de entrada ———
const commonWrite = {
  dry_run: { type: 'boolean', description: 'Se verdadeiro, só mostra as alterações (diff) sem publicar.' },
  revisao_esperada: { type: 'integer', description: 'Opcional. Publica só se o portfólio ainda estiver nesta revisão (a de get_portfolio).' },
};
const url = (description) => ({ type: 'string', description });
const projectFields = {
  titulo: { type: 'string', maxLength: 120, description: 'Título do projeto.' },
  categoria: { type: 'string', enum: site.categories },
  status: { type: 'string', enum: ['', ...site.stages], description: 'andamento, beta, parcial, pausado, concluido ou vazio (sem status).' },
  resumo: { type: 'string', maxLength: 320, description: 'Texto curto do cartão. Obrigatório ao criar.' },
  descricao: { type: 'string', maxLength: 6000, description: 'Descrição completa exibida nos detalhes.' },
  tecnologias: { type: 'array', items: { type: 'string' }, description: 'Nomes das tecnologias usadas (até 500 caracteres somados).' },
  visibilidade: { type: 'string', enum: ['', ...site.visibilities], description: 'Selo do repositório. privado omite o link do GitHub.' },
  repositorio: url('Endereço https://github.com/usuario/repositorio.'),
  demo: url('Link público da demonstração.'),
  demonstracao: { type: 'boolean', description: 'Marca como projeto de exemplo.' },
  imagens: {
    type: 'array', maxItems: 16, description: 'Galeria completa (substitui a atual).',
    items: { type: 'object', properties: { src: url('https://… ou ./assets/… (imagem, GIF ou vídeo .mp4/.webm; o primeiro item é a prévia do cartão)'), alt: { type: 'string', maxLength: 320 } }, required: ['src', 'alt'], additionalProperties: false },
  },
};
const skillFields = {
  nome: { type: 'string', maxLength: 120, description: 'Nome da tecnologia. O ícone do Simple Icons sai deste nome.' },
  tipo: { type: 'string', enum: site.skillKinds, description: 'Tipo para o filtro público. Se omitido, é deduzido da categoria.' },
  categoria: { type: 'string', maxLength: 100, description: 'Área ou especialidade (opcional), ex.: Containers.' },
  experiencia: { type: 'string', maxLength: 700, description: 'Como a tecnologia é usada.' },
  icone: { type: 'string', maxLength: 60, description: 'Identificador do Simple Icons, só quando o nome não bater (ex.: cplusplus). Vazio volta ao automático.' },
  imagem: url('Endereço de um ícone personalizado (opcional).'),
  imagemOriginal: { type: 'boolean', description: 'Mantém as cores originais do ícone personalizado.' },
};
const certificateFields = {
  titulo: { type: 'string', maxLength: 180, description: 'Nome do certificado.' },
  instituicao: { type: 'string', maxLength: 160, description: 'Instituição emissora. Obrigatória ao criar.' },
  data: { type: 'string', description: 'Data de emissão AAAA-MM-DD (opcional).' },
  credencial: url('Link público da credencial (opcional).'),
  imagem: url('Imagem do certificado (opcional).'),
};
const position = { posicao: { type: 'integer', minimum: 1, description: 'Posição na lista (1 = primeiro). Novos itens vão para o fim se omitido.' } };
const schema = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

// ——— Publicação ———
async function change(args, apply) {
  const dryRun = args.dry_run === true;
  if (args.revisao_esperada !== undefined && !Number.isInteger(args.revisao_esperada)) throw new Error('“revisao_esperada” precisa ser um número inteiro.');
  const portfolio = await getStore();
  const run = async (current) => {
    if (args.revisao_esperada !== undefined && current.revision !== args.revisao_esperada) {
      throw new Error(`O portfólio está na revisão ${current.revision}, não na ${args.revisao_esperada}. Leia de novo com get_portfolio antes de alterar.`);
    }
    const raw = current.content ? clone(current.content) : site.defaults();
    let before;
    try { before = normalizeContent(site, raw); } catch { before = raw; }
    const draft = clone(before);
    const info = (await apply(draft)) ?? {};
    const after = normalizeContent(site, draft);
    const changes = diffContent(before, after);
    if (!current.content) info.aviso = 'O portfólio ainda não tinha sido publicado: a base são os exemplos de conteudo.js (marcados como demonstração). Remova-os com remove_project se quiser.';
    return { info, changes, content: changes.length && !dryRun ? after : null };
  };
  const outcome = dryRun ? await run(await portfolio.read()) : await portfolio.publish(run);
  const status = dryRun
    ? { dry_run: true, revisao_atual: outcome.revision }
    : outcome.published ? { publicado: true, revisao: outcome.revision } : { publicado: false, revisao: outcome.revision, motivo: 'Nada mudou.' };
  return { ...status, ...outcome.info, alteracoes: outcome.changes };
}

function pick(args, keys) {
  return Object.fromEntries(keys.filter((key) => args[key] !== undefined).map((key) => [key, args[key]]));
}

function locate(items, reference, options) {
  const index = findIndex(items, reference, options);
  if (index < 0) throw new Error(`${options.label[0].toUpperCase()}${options.label.slice(1)} “${reference}” não encontrado.`);
  return index;
}

async function iconStatus(skill) {
  if (skill.imagem) return { icone: 'personalizado', endereco: skill.imagem };
  const value = skill.icone || skill.nome;
  const slug = site.iconSlug(value);
  if (Object.hasOwn(site.builtInIcons, slug)) return { icone: slug, endereco: null, encontrado: true, observacao: 'Ícone desenhado no CSS do site.' };
  const address = site.iconMaskUrl(value);
  if (!address) return { icone: '', encontrado: false };
  const response = await fetch(address, { method: 'HEAD', signal: AbortSignal.timeout(4000) }).catch(() => null);
  const found = response ? response.ok : null;
  return {
    icone: slug, endereco: address, encontrado: found,
    ...(found === false ? { observacao: 'O Simple Icons não tem esse ícone; o site mostra o símbolo genérico. Procure o identificador em simpleicons.org e informe em “icone”.' } : {}),
  };
}

// ——— Tradução para o inglês ———
// Lista cada texto traduzível com o original em português e a versão em inglês atual.
function translationReport(content, onlyMissing) {
  const pair = (item, path) => {
    const read = (object) => path.split('.').reduce((value, key) => value?.[key], object) ?? '';
    return { pt: read(item), en: read(item?.en) };
  };
  const needs = ({ pt, en }) => Boolean(pt) && !en;
  const fieldsOf = (item, kind) => Object.fromEntries(Object.keys(site.translatableFields[kind])
    .map((path) => [path, pair(item, path)])
    .filter(([, value]) => value.pt && (!onlyMissing || needs(value))));
  let missing = 0;
  const count = (fields) => { missing += Object.values(fields).filter(needs).length; return fields; };
  const perfil = count(fieldsOf(content, 'perfil'));
  const projetos = content.projetos.map((project) => {
    const campos = count(fieldsOf(project, 'projeto'));
    const imagens = (project.imagens ?? []).map((image, index) => ({ imagem: index + 1, ...pair(image, 'alt') }))
      .filter((image) => image.pt && (!onlyMissing || needs(image)));
    missing += imagens.filter(needs).length;
    return { projeto: project.titulo, campos, ...(imagens.length ? { imagens } : {}) };
  }).filter((project) => Object.keys(project.campos).length || project.imagens);
  const tecnologias = content.tecnologias.map((skill) => ({ tecnologia: skill.nome, campos: count(fieldsOf(skill, 'tecnologia')) }))
    .filter((skill) => Object.keys(skill.campos).length);
  const certificados = (content.certificados ?? []).map((certificate) => ({ certificado: certificate.titulo, campos: count(fieldsOf(certificate, 'certificado')) }))
    .filter((certificate) => Object.keys(certificate.campos).length);
  return { faltando: missing, perfil, projetos, tecnologias, certificados };
}

function mergeEnglish(item, values, kind, label) {
  const allowed = Object.keys(site.translatableFields[kind]);
  onlyKeys(values, allowed.filter((path) => !path.includes('.')).concat(kind === 'perfil' ? ['sobre'] : []), label);
  const en = clone(item.en ?? {});
  for (const path of allowed) {
    const keys = path.split('.');
    const value = keys.reduce((object, key) => object?.[key], values);
    if (value === undefined) continue;
    if (typeof value !== 'string') throw new Error(`“${label}: ${path}” precisa ser texto.`);
    let target = en;
    for (const key of keys.slice(0, -1)) target = (target[key] ??= {});
    target[keys.at(-1)] = value;
  }
  item.en = en;
}

const englishText = (limit, description) => ({ type: 'string', maxLength: limit, description });

// ——— Ferramentas ———
const tools = [
  {
    name: 'get_portfolio',
    title: 'Ler portfólio',
    description: 'Lê o conteúdo publicado do portfólio (perfil, projetos, tecnologias e certificados) e a revisão atual. Use antes de alterar.',
    inputSchema: schema({ secao: { type: 'string', enum: ['tudo', 'perfil', 'projetos', 'tecnologias', 'certificados'], description: 'Parte do conteúdo a devolver (padrão: tudo).' } }),
    annotations: { readOnlyHint: true, openWorldHint: true },
    async run(args) {
      onlyKeys(args, ['secao'], 'get_portfolio');
      const current = await (await getStore()).read();
      const content = current.content ?? site.defaults();
      const { tecnologias, projetos, certificados = [], ...perfil } = content;
      const sections = { perfil, projetos, tecnologias, certificados };
      const secao = args.secao ?? 'tudo';
      return {
        revisao: current.revision,
        ...(current.content ? {} : { aviso: 'Ainda não publicado: exibindo os exemplos de conteudo.js.' }),
        contagem: { projetos: projetos.length, tecnologias: tecnologias.length, certificados: certificados.length, limite_por_lista: 80 },
        catalogo: { categoria: site.categories, status: site.stages, visibilidade: site.visibilities, tipo_tecnologia: site.skillKinds },
        conteudo: secao === 'tudo' ? content : { [secao]: sections[secao] },
      };
    },
  },
  {
    name: 'update_profile',
    title: 'Atualizar perfil',
    description: 'Atualiza nome, apresentação, bio (sobre), redes (linkedin, github, email) e currículo. Só os campos enviados mudam; texto vazio limpa o campo.',
    inputSchema: schema({
      nome: { type: 'string', maxLength: 120 },
      introducao: { type: 'string', maxLength: 300, description: 'Apresentação no topo do site.' },
      sobre: schema({ titulo: { type: 'string', maxLength: 220 }, descricao: { type: 'string', maxLength: 6000 } }),
      redes: schema({ linkedin: url('Perfil do LinkedIn.'), github: url('Perfil do GitHub, ex.: https://github.com/usuario.'), email: { type: 'string', maxLength: 254, description: 'E-mail de contato.' } }),
      curriculo: url('Link público do currículo (PDF ou página).'),
      ...commonWrite,
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    run: (args) => change(args, (content) => {
      onlyKeys(args, ['nome', 'introducao', 'sobre', 'redes', 'curriculo', 'dry_run', 'revisao_esperada'], 'update_profile');
      onlyKeys(args.sobre, ['titulo', 'descricao'], 'sobre');
      onlyKeys(args.redes, ['linkedin', 'github', 'email'], 'redes');
      Object.assign(content, pick(args, ['nome', 'introducao', 'curriculo']));
      content.sobre = { ...content.sobre, ...args.sobre };
      content.redes = { ...content.redes, ...args.redes };
    }),
  },
  {
    name: 'upsert_project',
    title: 'Criar ou atualizar projeto',
    description: 'Cria um projeto ou atualiza um existente. Procura pelo campo "projeto" (título ou URL do repositório); sem ele, procura pelo repositório e depois pelo título enviados. Só os campos enviados mudam.',
    inputSchema: schema({
      projeto: { type: 'string', description: 'Título atual ou URL do repositório do projeto a atualizar (use para renomear).' },
      ...projectFields, ...position, ...commonWrite,
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    run: (args) => change(args, (content) => {
      const fields = Object.keys(projectFields);
      onlyKeys(args, ['projeto', ...fields, 'posicao', 'dry_run', 'revisao_esperada'], 'upsert_project');
      const options = { titleKey: 'titulo', urlKey: 'repositorio', label: 'projeto' };
      let index = -1;
      if (args.projeto) index = locate(content.projetos, args.projeto, options);
      else {
        if (args.repositorio) index = findIndex(content.projetos, args.repositorio, options);
        if (index < 0 && args.titulo) index = findIndex(content.projetos, args.titulo, { ...options, urlKey: null });
      }
      const values = pick(args, fields);
      const created = index < 0;
      if (created) {
        if (content.projetos.length >= 80) throw new Error('O portfólio já tem 80 projetos, o máximo permitido.');
        const project = normalizeProject(site, { categoria: 'pessoal', ...values }, 'Novo projeto');
        index = content.projetos.push(project) - 1;
      } else {
        content.projetos[index] = normalizeProject(site, { ...content.projetos[index], ...values });
      }
      index = moveTo(content.projetos, index, args.posicao, 'projetos');
      return { acao: created ? 'criado' : 'atualizado', projeto: content.projetos[index].titulo, posicao: index + 1 };
    }),
  },
  {
    name: 'remove_project',
    title: 'Remover projeto',
    description: 'Remove um projeto pelo título ou pela URL do repositório.',
    inputSchema: schema({ projeto: { type: 'string', description: 'Título ou URL do repositório.' }, ...commonWrite }, ['projeto']),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    run: (args) => change(args, (content) => {
      onlyKeys(args, ['projeto', 'dry_run', 'revisao_esperada'], 'remove_project');
      const index = locate(content.projetos, args.projeto, { titleKey: 'titulo', urlKey: 'repositorio', label: 'projeto' });
      const [removed] = content.projetos.splice(index, 1);
      return { removido: removed.titulo };
    }),
  },
  {
    name: 'reorder_projects',
    title: 'Reordenar projetos',
    description: 'Define a ordem dos projetos no site. Os projetos listados vão para o início, nessa ordem; os demais seguem depois, na ordem atual.',
    inputSchema: schema({ ordem: { type: 'array', minItems: 1, items: { type: 'string' }, description: 'Títulos ou URLs de repositório, do primeiro ao último.' }, ...commonWrite }, ['ordem']),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    run: (args) => change(args, (content) => {
      onlyKeys(args, ['ordem', 'dry_run', 'revisao_esperada'], 'reorder_projects');
      if (!Array.isArray(args.ordem) || !args.ordem.length) throw new Error('Informe “ordem” com pelo menos um projeto.');
      const options = { titleKey: 'titulo', urlKey: 'repositorio', label: 'projeto' };
      const chosen = args.ordem.map((reference) => content.projetos[locate(content.projetos, reference, options)]);
      if (new Set(chosen).size !== chosen.length) throw new Error('Um mesmo projeto aparece mais de uma vez em “ordem”.');
      content.projetos = [...chosen, ...content.projetos.filter((project) => !chosen.includes(project))];
      return { ordem: content.projetos.map((project) => project.titulo) };
    }),
  },
  {
    name: 'upsert_skill',
    title: 'Criar ou atualizar tecnologia',
    description: 'Cria ou atualiza uma tecnologia. O ícone sai do nome pelo Simple Icons (Python, C++, Node.js, Proxmox…); use "icone" só se o nome não bater. Procura por "tecnologia" ou pelo nome enviado.',
    inputSchema: schema({ tecnologia: { type: 'string', description: 'Nome atual da tecnologia a atualizar (use para renomear).' }, ...skillFields, ...position, ...commonWrite }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async run(args) {
      let saved;
      const result = await change(args, (content) => {
        const fields = Object.keys(skillFields);
        onlyKeys(args, ['tecnologia', ...fields, 'posicao', 'dry_run', 'revisao_esperada'], 'upsert_skill');
        const options = { titleKey: 'nome', label: 'tecnologia' };
        let index = args.tecnologia ? locate(content.tecnologias, args.tecnologia, options) : args.nome ? findIndex(content.tecnologias, args.nome, options) : -1;
        const values = pick(args, fields);
        if (index < 0 && !args.tecnologia && args.nome) {
          // Apelidos do catálogo (node → Node.js, cpp → C++) apontam para a tecnologia já cadastrada.
          const alias = (name) => Object.hasOwn(site.iconAliases, String(name).trim().toLowerCase());
          const slug = site.iconSlug(args.nome);
          index = content.tecnologias.findIndex((skill) => (alias(args.nome) || alias(skill.nome)) && site.iconSlug(skill.nome) === slug);
          if (index >= 0) delete values.nome;
        }
        if (values.imagemOriginal === false) delete values.imagemOriginal;
        const created = index < 0;
        if (created) {
          if (content.tecnologias.length >= 80) throw new Error('O portfólio já tem 80 tecnologias, o máximo permitido.');
          index = content.tecnologias.push(normalizeSkill(site, values, 'Nova tecnologia')) - 1;
        } else {
          const merged = { ...content.tecnologias[index], ...values };
          if (args.imagemOriginal === false) delete merged.imagemOriginal;
          content.tecnologias[index] = normalizeSkill(site, merged);
        }
        index = moveTo(content.tecnologias, index, args.posicao, 'tecnologias');
        saved = content.tecnologias[index];
        return { acao: created ? 'criada' : 'atualizada', tecnologia: saved.nome, tipo: saved.tipo, posicao: index + 1 };
      });
      return saved ? { ...result, icone: await iconStatus(saved) } : result;
    },
  },
  {
    name: 'remove_skill',
    title: 'Remover tecnologia',
    description: 'Remove uma tecnologia pelo nome.',
    inputSchema: schema({ tecnologia: { type: 'string' }, ...commonWrite }, ['tecnologia']),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    run: (args) => change(args, (content) => {
      onlyKeys(args, ['tecnologia', 'dry_run', 'revisao_esperada'], 'remove_skill');
      const [removed] = content.tecnologias.splice(locate(content.tecnologias, args.tecnologia, { titleKey: 'nome', label: 'tecnologia' }), 1);
      return { removida: removed.nome };
    }),
  },
  {
    name: 'upsert_certificate',
    title: 'Criar ou atualizar certificado',
    description: 'Cria ou atualiza um certificado. Procura por "certificado" (nome ou link da credencial); sem ele, pela credencial e depois pelo nome enviados.',
    inputSchema: schema({ certificado: { type: 'string', description: 'Nome atual ou link da credencial do certificado a atualizar.' }, ...certificateFields, ...position, ...commonWrite }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    run: (args) => change(args, (content) => {
      const fields = Object.keys(certificateFields);
      onlyKeys(args, ['certificado', ...fields, 'posicao', 'dry_run', 'revisao_esperada'], 'upsert_certificate');
      content.certificados ??= [];
      const options = { titleKey: 'titulo', urlKey: 'credencial', label: 'certificado' };
      let index = -1;
      if (args.certificado) index = locate(content.certificados, args.certificado, options);
      else {
        if (args.credencial) index = findIndex(content.certificados, args.credencial, options);
        if (index < 0 && args.titulo) index = findIndex(content.certificados, args.titulo, { ...options, urlKey: null });
      }
      const values = pick(args, fields);
      const created = index < 0;
      if (created) {
        if (content.certificados.length >= 80) throw new Error('O portfólio já tem 80 certificados, o máximo permitido.');
        index = content.certificados.push(normalizeCertificate(site, values, 'Novo certificado')) - 1;
      } else {
        content.certificados[index] = normalizeCertificate(site, { ...content.certificados[index], ...values });
      }
      index = moveTo(content.certificados, index, args.posicao, 'certificados');
      return { acao: created ? 'criado' : 'atualizado', certificado: content.certificados[index].titulo, posicao: index + 1 };
    }),
  },
  {
    name: 'remove_certificate',
    title: 'Remover certificado',
    description: 'Remove um certificado pelo nome ou pelo link da credencial.',
    inputSchema: schema({ certificado: { type: 'string' }, ...commonWrite }, ['certificado']),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    run: (args) => change(args, (content) => {
      onlyKeys(args, ['certificado', 'dry_run', 'revisao_esperada'], 'remove_certificate');
      content.certificados ??= [];
      const [removed] = content.certificados.splice(locate(content.certificados, args.certificado, { titleKey: 'titulo', urlKey: 'credencial', label: 'certificado' }), 1);
      return { removido: removed.titulo };
    }),
  },
  {
    name: 'get_translations',
    title: 'Ver traduções para o inglês',
    description: 'Lista os textos do portfólio com o original em português (pt) e a versão em inglês (en). O site em inglês mostra o português onde "en" estiver vazio. Use faltando: true para ver só o que ainda não foi traduzido e depois preencha com set_translations.',
    inputSchema: schema({ faltando: { type: 'boolean', description: 'Se verdadeiro, mostra só os textos sem tradução (padrão: verdadeiro).' } }),
    annotations: { readOnlyHint: true, openWorldHint: true },
    async run(args) {
      onlyKeys(args, ['faltando'], 'get_translations');
      const current = await (await getStore()).read();
      const content = current.content ?? site.defaults();
      return { revisao: current.revision, ...translationReport(content, args.faltando !== false) };
    },
  },
  {
    name: 'set_translations',
    title: 'Gravar traduções para o inglês',
    description: 'Grava a versão em inglês de vários textos numa só publicação. Envie só os campos traduzidos; texto vazio apaga a tradução (o site volta a mostrar o português). Traduza com naturalidade para um recrutador ou visitante de fora, mantendo nomes próprios, nomes de tecnologias e termos técnicos. Confira antes com dry_run.',
    inputSchema: schema({
      perfil: schema({
        introducao: englishText(300, 'Apresentação no topo do site.'),
        sobre: schema({ titulo: englishText(220, 'Título da bio.'), descricao: englishText(6000, 'Texto "Sobre mim".') }),
      }),
      projetos: {
        type: 'array',
        items: schema({
          projeto: { type: 'string', description: 'Título atual (em português) ou URL do repositório.' },
          titulo: englishText(120), resumo: englishText(320), descricao: englishText(6000),
          imagens: { type: 'array', items: { type: 'string', maxLength: 320 }, description: 'Descrições das imagens em inglês, na ordem da galeria; "" mantém a atual.' },
        }, ['projeto']),
      },
      tecnologias: {
        type: 'array',
        items: schema({ tecnologia: { type: 'string', description: 'Nome da tecnologia.' }, categoria: englishText(100, 'Área ou especialidade.'), experiencia: englishText(700, 'Como usa (texto "Como uso").') }, ['tecnologia']),
      },
      certificados: {
        type: 'array',
        items: schema({ certificado: { type: 'string', description: 'Nome atual ou link da credencial.' }, titulo: englishText(180, 'Nome do certificado em inglês.') }, ['certificado']),
      },
      ...commonWrite,
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async run(args) {
      const result = await change(args, (content) => {
        onlyKeys(args, ['perfil', 'projetos', 'tecnologias', 'certificados', 'dry_run', 'revisao_esperada'], 'set_translations');
        const touched = [];
        if (args.perfil !== undefined) {
          onlyKeys(args.perfil.sobre, ['titulo', 'descricao'], 'perfil.sobre');
          mergeEnglish(content, args.perfil, 'perfil', 'perfil');
          touched.push('perfil');
        }
        for (const entry of args.projetos ?? []) {
          onlyKeys(entry, ['projeto', 'titulo', 'resumo', 'descricao', 'imagens'], 'set_translations: projeto');
          const project = content.projetos[locate(content.projetos, entry.projeto, { titleKey: 'titulo', urlKey: 'repositorio', label: 'projeto' })];
          const { projeto, imagens, ...fields } = entry;
          mergeEnglish(project, fields, 'projeto', project.titulo);
          if (imagens !== undefined) {
            if (!Array.isArray(imagens)) throw new Error(`“${project.titulo}: imagens” precisa ser uma lista.`);
            if (imagens.length > (project.imagens ?? []).length) throw new Error(`“${project.titulo}” tem ${(project.imagens ?? []).length} imagens, mas vieram ${imagens.length} descrições.`);
            imagens.forEach((alt, index) => { if (alt !== '' && alt !== null) mergeEnglish(project.imagens[index], { alt }, 'imagem', `${project.titulo}: imagem ${index + 1}`); });
          }
          touched.push(project.titulo);
        }
        for (const entry of args.tecnologias ?? []) {
          onlyKeys(entry, ['tecnologia', 'categoria', 'experiencia'], 'set_translations: tecnologia');
          const skill = content.tecnologias[locate(content.tecnologias, entry.tecnologia, { titleKey: 'nome', label: 'tecnologia' })];
          const { tecnologia, ...fields } = entry;
          mergeEnglish(skill, fields, 'tecnologia', skill.nome);
          touched.push(skill.nome);
        }
        content.certificados ??= [];
        for (const entry of args.certificados ?? []) {
          onlyKeys(entry, ['certificado', 'titulo'], 'set_translations: certificado');
          const certificate = content.certificados[locate(content.certificados, entry.certificado, { titleKey: 'titulo', urlKey: 'credencial', label: 'certificado' })];
          mergeEnglish(certificate, { titulo: entry.titulo }, 'certificado', certificate.titulo);
          touched.push(certificate.titulo);
        }
        if (!touched.length) throw new Error('Envie ao menos um texto em perfil, projetos, tecnologias ou certificados.');
        return { itens: touched };
      });
      return result;
    },
  },
  {
    name: 'import_github_repos',
    title: 'Importar repositórios do GitHub',
    description: 'Busca os repositórios públicos (sem forks) de um usuário do GitHub e adiciona como projetos com os textos do GitHub, como a importação do painel. Repositórios já cadastrados são ignorados. Use dry_run para ver a lista antes e revise os textos depois com upsert_project.',
    inputSchema: schema({
      usuario: { type: 'string', description: 'Usuário do GitHub. Se omitido, usa o perfil em redes.github.' },
      repositorios: { type: 'array', items: { type: 'string' }, description: 'Nomes dos repositórios a importar. Se omitido, importa todos os novos.' },
      ...commonWrite,
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async run(args) {
      onlyKeys(args, ['usuario', 'repositorios', 'dry_run', 'revisao_esperada'], 'import_github_repos');
      if (args.repositorios !== undefined && (!Array.isArray(args.repositorios) || args.repositorios.some((name) => typeof name !== 'string'))) {
        throw new Error('“repositorios” precisa ser uma lista de nomes.');
      }
      let user = args.usuario?.trim();
      if (!user) {
        const { content } = await (await getStore()).read();
        const profile = site.webUrl(content?.redes?.github ?? '');
        user = profile && new URL(profile).hostname === 'github.com' ? new URL(profile).pathname.split('/').filter(Boolean)[0] ?? '' : '';
        if (!user) throw new Error('Informe “usuario” ou preencha o perfil do GitHub em redes.github.');
      }
      if (!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(user)) throw new Error('Nome de usuário do GitHub inválido.');
      const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'portfolio-mcp' };
      if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
      const response = await fetch(`https://api.github.com/users/${encodeURIComponent(user)}/repos?per_page=100&sort=updated`, { headers, signal: AbortSignal.timeout(15_000) })
        .catch(() => { throw new Error('Não foi possível consultar o GitHub agora.'); });
      if (!response.ok) throw new Error(response.status === 404 ? 'Usuário do GitHub não encontrado.' : `O GitHub respondeu com erro ${response.status}.`);
      let repos = (await response.json()).filter((repo) => !repo.fork);
      const missing = [];
      if (args.repositorios) {
        missing.push(...args.repositorios.filter((name) => !repos.some((repo) => sameText(repo.name, name))));
        repos = repos.filter((repo) => args.repositorios.some((name) => sameText(repo.name, name)));
      }
      return change(args, (content) => {
        const added = [];
        const skipped = [];
        for (const repo of repos) {
          if (content.projetos.some((project) => sameUrl(project.repositorio, repo.html_url))) { skipped.push({ repositorio: repo.name, motivo: 'já está no portfólio' }); continue; }
          if (content.projetos.length >= 80) { skipped.push({ repositorio: repo.name, motivo: 'limite de 80 projetos' }); continue; }
          const title = repo.name.replace(/[-_]+/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
          content.projetos.push(normalizeProject(site, {
            titulo: title.slice(0, 120),
            categoria: 'pessoal',
            resumo: (repo.description || `Repositório ${repo.name}.`).slice(0, 320),
            descricao: (repo.description || '').slice(0, 6000),
            tecnologias: [repo.language, ...(repo.topics ?? [])].filter(Boolean).slice(0, 8),
            visibilidade: 'publico',
            repositorio: repo.html_url,
            demo: site.webUrl(repo.homepage) ?? '',
          }, repo.name));
          added.push(title);
        }
        return { usuario: user, importados: added, ignorados: skipped, ...(missing.length ? { nao_encontrados: missing } : {}) };
      });
    },
  },
];

// ——— Protocolo MCP (JSON-RPC 2.0 por linhas) ———
const byName = new Map(tools.map((tool) => [tool.name, tool]));

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function handle(message) {
  const { id, method, params = {} } = message;
  switch (method) {
    case 'initialize': {
      const requested = params.protocolVersion;
      return {
        protocolVersion: protocolVersions.includes(requested) ? requested : protocolVersions[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo,
        instructions: 'Ferramentas para manter o portfólio do Wesley. Leia com get_portfolio antes de alterar, use dry_run para conferir o diff e só depois publique. Cada publicação incrementa a revisão em 1. O site tem versão em inglês: o conteúdo é escrito em português e a tradução fica no campo "en" de cada item; use get_translations para ver o que falta e set_translations para traduzir.',
      };
    }
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: tools.map(({ run, ...definition }) => definition) };
    case 'tools/call': {
      const tool = byName.get(params.name);
      if (!tool) throw Object.assign(new Error(`Ferramenta desconhecida: ${params.name}`), { code: -32602 });
      try {
        const result = await tool.run(params.arguments ?? {});
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: error.message }], isError: true };
      }
    }
    default:
      if (id === undefined) return undefined;
      throw Object.assign(new Error(`Método não suportado: ${method}`), { code: -32601 });
  }
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
const pending = new Set();
input.on('line', (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido.' } });
    return;
  }
  if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.method !== 'string') {
    if (message?.id !== undefined && !('result' in message) && !('error' in message)) send({ jsonrpc: '2.0', id: message.id, error: { code: -32600, message: 'Requisição inválida.' } });
    return;
  }
  const task = handle(message).then((result) => {
    if (message.id !== undefined && result !== undefined) send({ jsonrpc: '2.0', id: message.id, result });
  }, (error) => {
    if (message.id !== undefined) send({ jsonrpc: '2.0', id: message.id, error: { code: error.code ?? -32603, message: error.message } });
  });
  pending.add(task);
  task.finally(() => pending.delete(task));
});
input.on('close', async () => {
  await Promise.allSettled([...pending]);
  process.exit(0);
});
process.stderr.write('Servidor MCP do portfólio pronto (stdio).\n');
