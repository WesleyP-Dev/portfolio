// Regras de conteúdo do portfólio: mesmos limites do painel (admin.js/admin.html) e de firestore.rules.
// Os catálogos e validadores vêm dos próprios arquivos do site para nunca divergirem.
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const maxItems = 80;
const maxImages = 16;
const maxBytes = 750_000;

export async function loadSite() {
  const context = vm.createContext({ URL });
  for (const file of ['links.js', 'catalogo.js', 'textos.js', 'conteudo.js']) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    vm.runInContext(source, context, { filename: file });
  }
  const site = vm.runInContext(
    '({ webUrl, githubUrl, imageUrl, emailAddress, skillTypes, projectStages, projectVisibility, builtInIcons, iconAliases, iconSlug, iconMaskUrl, skillType, portfolio, translatableFields })',
    context,
  );
  return {
    ...site,
    categories: ['pessoal', 'faculdade'],
    stages: Object.keys(site.projectStages),
    visibilities: Object.keys(site.projectVisibility),
    skillKinds: Object.keys(site.skillTypes),
    defaults: () => clone(site.portfolio),
  };
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function onlyKeys(object, keys, label) {
  if (object === undefined) return;
  if (!object || typeof object !== 'object' || Array.isArray(object)) throw new Error(`“${label}” precisa ser um objeto.`);
  const unknown = Object.keys(object).filter((key) => !keys.includes(key));
  if (unknown.length) throw new Error(`Campo desconhecido em ${label}: ${unknown.join(', ')}. Aceitos: ${keys.join(', ')}.`);
}

function text(value, label, { limit, required = false } = {}) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw new Error(`“${label}” precisa ser texto.`);
  const result = value.trim();
  if (required && !result) throw new Error(`Preencha “${label}”.`);
  if (limit && result.length > limit) throw new Error(`“${label}” passa de ${limit} caracteres (${result.length}).`);
  return result;
}

function address(value, label, validator, limit = 500) {
  const result = text(value, label, { limit });
  if (result && !validator(result)) throw new Error(`Confira o endereço em “${label}”: ${result}`);
  return result;
}

function choice(value, label, options) {
  const result = value ?? '';
  if (!options.includes(result)) throw new Error(`“${label}” aceita: ${options.map((item) => item || '(vazio)').join(', ')}.`);
  return result;
}

function flag(value, label) {
  if (value === undefined || value === null) return false;
  if (typeof value !== 'boolean') throw new Error(`“${label}” precisa ser verdadeiro ou falso.`);
  return value;
}

function list(value, label, limit) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`“${label}” precisa ser uma lista.`);
  if (value.length > limit) throw new Error(`“${label}” aceita até ${limit} itens.`);
  return value;
}

function isoDate(value, label) {
  const result = text(value, label, { limit: 10 });
  if (!result) return '';
  const date = new Date(`${result}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== result) {
    throw new Error(`“${label}” precisa estar no formato AAAA-MM-DD.`);
  }
  return result;
}

// Versão em inglês de um item ("en"): só os textos traduzíveis, sem campos vazios. Some quando nada foi traduzido.
export function normalizeEnglish(site, value, kind, label) {
  if (value === undefined || value === null) return undefined;
  const fields = site.translatableFields[kind];
  const groups = {};
  for (const path of Object.keys(fields)) {
    const [head, tail] = path.split('.');
    if (tail) (groups[head] ??= []).push(tail);
  }
  onlyKeys(value, [...new Set(Object.keys(fields).map((path) => path.split('.')[0]))], `${label} (inglês)`);
  for (const [group, keys] of Object.entries(groups)) onlyKeys(value[group], keys, `${label} (inglês): ${group}`);
  const result = {};
  for (const [path, limit] of Object.entries(fields)) {
    const keys = path.split('.');
    const translated = text(keys.reduce((item, key) => item?.[key], value), `${label} (inglês): ${path}`, { limit });
    if (!translated) continue;
    let target = result;
    for (const key of keys.slice(0, -1)) target = (target[key] ??= {});
    target[keys.at(-1)] = translated;
  }
  return Object.keys(result).length ? result : undefined;
}

const withEnglish = (en) => (en ? { en } : {});

export function normalizeProject(site, project, where = 'Projeto') {
  onlyKeys(project, ['titulo', 'categoria', 'status', 'resumo', 'descricao', 'tecnologias', 'visibilidade', 'repositorio', 'demo', 'demonstracao', 'imagens', 'en'], where);
  const titulo = text(project.titulo, `${where}: título`, { required: true, limit: 120 });
  const label = (name) => `${titulo}: ${name}`;
  const visibilidade = choice(project.visibilidade, label('visibilidade'), ['', ...site.visibilities]);
  const tecnologias = list(project.tecnologias, label('tecnologias'), 200)
    .flatMap((item) => text(item, label('tecnologias')).split(','))
    .map((item) => item.trim())
    .filter(Boolean);
  if (tecnologias.join(', ').length > 500) throw new Error(`“${label('tecnologias')}” passa de 500 caracteres.`);
  const imagens = list(project.imagens, label('imagens'), maxImages).map((image, index) => {
    onlyKeys(image, ['src', 'alt', 'en'], label(`imagem ${index + 1}`));
    return {
      src: (() => {
        const src = address(image.src, label(`imagem ${index + 1}`), site.imageUrl);
        if (!src) throw new Error(`Preencha o endereço da ${label(`imagem ${index + 1}`)}.`);
        return src;
      })(),
      alt: text(image.alt, label(`descrição da imagem ${index + 1}`), { required: true, limit: 320 }),
      ...withEnglish(normalizeEnglish(site, image.en, 'imagem', label(`imagem ${index + 1}`))),
    };
  });
  return {
    titulo,
    categoria: choice(project.categoria ?? 'pessoal', label('categoria'), site.categories),
    resumo: text(project.resumo, label('resumo'), { required: true, limit: 320 }),
    descricao: text(project.descricao, label('descrição'), { limit: 6000 }),
    status: choice(project.status, label('status'), ['', ...site.stages]),
    tecnologias,
    visibilidade,
    repositorio: visibilidade === 'privado' ? '' : address(project.repositorio, label('repositório no GitHub'), site.githubUrl),
    demo: address(project.demo, label('demonstração'), site.webUrl),
    demonstracao: flag(project.demonstracao, label('demonstração de exemplo')),
    imagens,
    ...withEnglish(normalizeEnglish(site, project.en, 'projeto', titulo)),
  };
}

export function normalizeSkill(site, skill, where = 'Tecnologia') {
  onlyKeys(skill, ['nome', 'tipo', 'categoria', 'experiencia', 'icone', 'imagem', 'imagemOriginal', 'en'], where);
  const nome = text(skill.nome, `${where}: nome`, { required: true, limit: 120 });
  const label = (name) => `${nome}: ${name}`;
  const tipo = skill.tipo ? choice(skill.tipo, label('tipo'), site.skillKinds) : site.skillType(skill);
  return {
    nome,
    tipo,
    categoria: text(skill.categoria, label('área ou especialidade'), { limit: 100 }),
    experiencia: text(skill.experiencia, label('como você usa'), { limit: 700 }),
    icone: text(skill.icone, label('ícone'), { limit: 60 }),
    imagem: address(skill.imagem, label('ícone personalizado'), site.imageUrl),
    ...(flag(skill.imagemOriginal, label('manter cores originais')) ? { imagemOriginal: true } : {}),
    ...withEnglish(normalizeEnglish(site, skill.en, 'tecnologia', nome)),
  };
}

export function normalizeCertificate(site, certificate, where = 'Certificado') {
  onlyKeys(certificate, ['titulo', 'instituicao', 'data', 'credencial', 'imagem', 'en'], where);
  const titulo = text(certificate.titulo, `${where}: nome`, { required: true, limit: 180 });
  const label = (name) => `${titulo}: ${name}`;
  return {
    titulo,
    instituicao: text(certificate.instituicao, label('instituição emissora'), { required: true, limit: 160 }),
    data: isoDate(certificate.data, label('data de emissão')),
    credencial: address(certificate.credencial, label('link da credencial'), site.webUrl),
    imagem: address(certificate.imagem, label('imagem do certificado'), site.imageUrl),
    ...withEnglish(normalizeEnglish(site, certificate.en, 'certificado', titulo)),
  };
}

export function normalizeContent(site, content) {
  onlyKeys(content, ['nome', 'introducao', 'sobre', 'redes', 'curriculo', 'tecnologias', 'projetos', 'certificados', 'en'], 'conteúdo');
  const sobre = content.sobre ?? {};
  const redes = content.redes ?? {};
  onlyKeys(sobre, ['titulo', 'descricao'], 'sobre');
  onlyKeys(redes, ['linkedin', 'github', 'email'], 'redes');
  const email = text(redes.email, 'E-mail de contato', { limit: 254 });
  if (email && !site.emailAddress(email)) throw new Error(`Confira o e-mail de contato: ${email}`);
  const certificados = list(content.certificados, 'certificados', maxItems).map((item, index) => normalizeCertificate(site, item, `Certificado ${index + 1}`));
  const result = {
    nome: text(content.nome, 'Nome', { limit: 120 }),
    introducao: text(content.introducao, 'Apresentação', { required: true, limit: 300 }),
    curriculo: address(content.curriculo, 'Currículo', site.webUrl),
    sobre: { titulo: text(sobre.titulo, 'Título da bio', { required: true, limit: 220 }), descricao: text(sobre.descricao, 'Sobre mim', { required: true, limit: 6000 }) },
    redes: { linkedin: address(redes.linkedin, 'LinkedIn', site.webUrl), github: address(redes.github, 'Perfil no GitHub', site.webUrl), email },
    tecnologias: list(content.tecnologias, 'tecnologias', maxItems).map((item, index) => normalizeSkill(site, item, `Tecnologia ${index + 1}`)),
    projetos: list(content.projetos, 'projetos', maxItems).map((item, index) => normalizeProject(site, item, `Projeto ${index + 1}`)),
    ...(certificados.length ? { certificados } : {}),
    ...withEnglish(normalizeEnglish(site, content.en, 'perfil', 'Perfil')),
  };
  const size = new TextEncoder().encode(JSON.stringify(result)).length;
  if (size > maxBytes) throw new Error(`O conteúdo ficaria com ${size} bytes; o limite é ${maxBytes}. Reduza descrições ou imagens.`);
  return result;
}

// Identificação de itens por nome ou endereço, ignorando maiúsculas, acentos e barra final.
export function sameText(a, b) {
  const simple = (value) => String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();
  return simple(a) !== '' && simple(a) === simple(b);
}

export function sameUrl(a, b) {
  const simple = (value) => String(value ?? '').trim().toLowerCase().replace(/\/+$/, '').replace(/\.git$/, '');
  return simple(a) !== '' && simple(a) === simple(b);
}

export function looksLikeUrl(value) {
  return /^https?:\/\//i.test(String(value ?? '').trim());
}

export function findIndex(items, reference, { titleKey, urlKey, label }) {
  const matches = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => (looksLikeUrl(reference) && urlKey ? sameUrl(item[urlKey], reference) : sameText(item[titleKey], reference)));
  if (matches.length > 1) throw new Error(`Há mais de um ${label} chamado “${reference}”. Use o endereço ou renomeie um deles.`);
  return matches[0]?.index ?? -1;
}

export function moveTo(items, index, position, label) {
  if (position === undefined || position === null) return index;
  if (!Number.isInteger(position) || position < 1) throw new Error(`“posicao” precisa ser um número inteiro a partir de 1 (${label}).`);
  const [item] = items.splice(index, 1);
  const target = Math.min(position - 1, items.length);
  items.splice(target, 0, item);
  return target;
}

// Diferença legível entre duas versões do conteúdo.
const listIds = { projetos: (item) => item.titulo, tecnologias: (item) => item.nome, certificados: (item) => item.titulo };
const profilePaths = ['nome', 'introducao', 'curriculo', 'sobre.titulo', 'sobre.descricao', 'redes.linkedin', 'redes.github', 'redes.email', 'en.introducao', 'en.sobre.titulo', 'en.sobre.descricao'];

function at(object, path) {
  return path.split('.').reduce((value, key) => value?.[key], object);
}

function same(a, b) {
  return JSON.stringify(a ?? '') === JSON.stringify(b ?? '');
}

function labelled(items, id) {
  const seen = new Map();
  return (items ?? []).map((item) => {
    const base = String(id(item) ?? '');
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return { key: count > 1 ? `${base} (#${count})` : base, item };
  });
}

export function diffContent(before, after) {
  const changes = [];
  for (const path of profilePaths) {
    if (!same(at(before, path), at(after, path))) changes.push({ campo: path, antes: at(before, path) ?? '', depois: at(after, path) ?? '' });
  }
  for (const [name, id] of Object.entries(listIds)) {
    const old = labelled(before?.[name], id);
    const next = labelled(after?.[name], id);
    const oldKeys = new Map(old.map(({ key, item }) => [key, item]));
    const nextKeys = new Map(next.map(({ key, item }) => [key, item]));
    for (const { key } of old) if (!nextKeys.has(key)) changes.push({ lista: name, removido: key });
    for (const { key, item } of next) {
      if (!oldKeys.has(key)) {
        changes.push({ lista: name, adicionado: item });
        continue;
      }
      const previous = oldKeys.get(key);
      const fields = {};
      for (const field of new Set([...Object.keys(previous), ...Object.keys(item)])) {
        if (!same(previous[field], item[field])) fields[field] = { antes: previous[field] ?? '', depois: item[field] ?? '' };
      }
      if (Object.keys(fields).length) changes.push({ lista: name, alterado: key, campos: fields });
    }
    const common = (entries, other) => entries.map(({ key }) => key).filter((key) => other.has(key));
    const oldOrder = common(old, nextKeys);
    const nextOrder = common(next, oldKeys);
    if (!same(oldOrder, nextOrder)) changes.push({ lista: name, nova_ordem: next.map(({ key }) => key) });
  }
  return changes;
}
