const editor = document.querySelector('#editor');
const editorFields = document.querySelector('#editor-fields');
const loginForm = document.querySelector('#login-form');
const loginButton = document.querySelector('#login-button');
const signOutButton = document.querySelector('#sign-out');
const projectEditor = document.querySelector('#project-editor');
const skillEditor = document.querySelector('#skill-editor');
const certificateEditor = document.querySelector('#certificate-editor');

const statusMessage = document.querySelector('#admin-status');
const errorMessage = document.querySelector('#admin-error');
const publishFeedback = document.querySelector('#publish-feedback');
let cloud;
let revision;
let sessionVersion = 0;

function node(tag, className, text) {
  const value = document.createElement(tag);
  if (className) value.className = className;
  if (text) value.textContent = text;
  return value;
}

function button(label, action) {
  const control = node('button', 'button secondary', label);
  control.type = 'button';
  control.addEventListener('click', action);
  return control;
}

function field(name, label, value = '', options = {}) {
  const wrapper = node('label', options.full ? 'full-field' : '', label);
  const input = node(options.choices ? 'select' : options.rows ? 'textarea' : 'input');
  input.name = name;
  if (options.choices) {
    for (const [key, caption] of options.choices) input.add(new Option(caption, key));
  } else if (options.rows) {
    input.rows = options.rows;
  } else {
    input.type = options.type ?? 'text';
  }
  if (input.type === 'checkbox') input.checked = Boolean(value);
  else input.value = value;
  if (options.limit) input.maxLength = options.limit;
  if (options.placeholder) input.placeholder = options.placeholder;
  input.required = Boolean(options.required);
  wrapper.append(input);
  return wrapper;
}

// Envio de imagens do PC: reduz no navegador, converte para WebP e guarda no Firestore (grátis, sem Storage).
const uploadLimit = 900_000;
const gifLimit = 8 * 1024 * 1024;
const sizeText = (bytes) => bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;

async function compressImage(file, maxSide) {
  const bitmap = await createImageBitmap(file);
  let scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  let quality = .86;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    if (blob && blob.size <= uploadLimit && ['image/webp', 'image/png', 'image/jpeg'].includes(blob.type)) return blob;
    if (quality > .6) quality -= .12; else { scale *= .75; quality = .82; }
  }
  throw new Error('A imagem continua grande demais mesmo depois de reduzida. Tente outra.');
}

// keepGif: GIFs animados vão como vieram (até 8 MB) em vez de virar uma imagem parada.
function withUpload(wrapper, maxSide, { keepGif = false } = {}) {
  const input = wrapper.querySelector('input');
  const tools = node('span', 'upload-tools');
  const picker = node('input');
  picker.type = 'file';
  picker.accept = 'image/png,image/jpeg,image/webp,image/gif,image/avif';
  picker.hidden = true;
  const trigger = node('button', 'button secondary upload-button', 'Enviar do PC');
  trigger.type = 'button';
  const status = node('span', 'upload-status');
  status.setAttribute('role', 'status');
  trigger.addEventListener('click', () => picker.click());
  picker.addEventListener('change', async () => {
    const [file] = picker.files;
    picker.value = '';
    if (!file || !cloud) return;
    trigger.disabled = true;
    const gif = keepGif && file.type === 'image/gif';
    status.textContent = gif ? 'Preparando o GIF…' : 'Reduzindo a imagem…';
    try {
      if (gif && file.size > gifLimit) throw new Error(`Este GIF tem ${sizeText(file.size)} e o limite é 8 MB. Diminua o tamanho, a duração ou as cores (por exemplo, em ezgif.com/optimize) e envie de novo.`);
      const blob = gif ? file : await compressImage(file, maxSide);
      status.textContent = `Enviando (${sizeText(blob.size)})…`;
      input.value = await cloud.uploadImage(blob);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      status.textContent = `${gif ? 'GIF enviado' : 'Imagem enviada'} (${sizeText(blob.size)}). Publique para aparecer no site.`;
    } catch (error) {
      status.textContent = error.code ? 'Não foi possível enviar. Confira a conexão e entre novamente.' : error.message;
    } finally {
      trigger.disabled = false;
    }
  });
  tools.append(trigger, picker, status);
  wrapper.append(tools);
  return wrapper;
}

function entry(title, emptyTitle) {
  const root = node('details', 'editor-entry');
  const summary = node('summary', '', title || emptyTitle);
  const body = node('div', 'entry-body');
  const fields = node('div', 'field-grid');
  const actions = node('div', 'admin-actions');
  root.append(summary, body);
  body.append(fields, actions);
  const label = node('span', 'entry-title', title || emptyTitle);
  // Alça para arrastar com o mouse; com o foco nela, as setas ↑ e ↓ também mudam a ordem.
  const handle = node('button', 'drag-handle');
  handle.type = 'button';
  handle.setAttribute('aria-label', 'Arrastar para mudar a ordem (ou use as setas para cima e para baixo)');
  handle.title = 'Arraste para mudar a ordem';
  handle.addEventListener('click', (event) => event.preventDefault());
  handle.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    moveEntry(root, event.key === 'ArrowUp' ? -1 : 1);
  });
  handle.addEventListener('pointerdown', () => { root.draggable = true; });
  root.addEventListener('dragstart', (event) => {
    if (!root.draggable) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', '');
    requestAnimationFrame(() => root.classList.add('is-dragging'));
  });
  root.addEventListener('dragend', () => {
    root.draggable = false;
    root.classList.remove('is-dragging');
    if (root.dataset.startIndex !== String([...root.parentElement.children].indexOf(root))) markDirty();
    delete root.dataset.startIndex;
  });
  handle.addEventListener('pointerup', () => { if (!root.classList.contains('is-dragging')) root.draggable = false; });
  root.addEventListener('dragstart', () => { root.dataset.startIndex = String([...root.parentElement.children].indexOf(root)); });
  summary.replaceChildren(handle, label);
  function bindTitle(input) {
    input.addEventListener('input', () => { label.textContent = input.value.trim() || emptyTitle; });
  }
  return { root, summary, body, fields, actions, bindTitle };
}

function moveEntry(root, step) {
  const target = step < 0 ? root.previousElementSibling : root.nextElementSibling;
  if (!target) return;
  if (step < 0) target.before(root); else target.after(root);
  markDirty();
  root.querySelector('.drag-handle').focus();
}

// Cada lista aceita só os próprios itens: o item arrastado vai para antes do primeiro cujo meio fica abaixo do cursor.
function enableSorting(list) {
  list.addEventListener('dragover', (event) => {
    const dragging = list.querySelector(':scope > .is-dragging');
    if (!dragging) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const next = [...list.children].find((item) => item !== dragging
      && event.clientY < item.getBoundingClientRect().top + item.offsetHeight / 2);
    if (next) { if (dragging.nextElementSibling !== next) list.insertBefore(dragging, next); }
    else if (list.lastElementChild !== dragging) list.append(dragging);
  });
  list.addEventListener('drop', (event) => event.preventDefault());
}

function removeEntry(root, fallback) {
  const other = root.nextElementSibling ?? root.previousElementSibling;
  root.remove();
  (other?.querySelector('summary') ?? fallback).focus();
}

const projectAdd = document.querySelector('#add-project');
const skillAdd = document.querySelector('#add-skill');
const certificateAdd = document.querySelector('#add-certificate');
const categories = [['pessoal', 'Pessoal'], ['faculdade', 'Faculdade']];
const visibilities = [['', 'Sem selo'], ...Object.entries(projectVisibility)];
const stages = [['', 'Sem status'], ...Object.entries(projectStages).map(([value, { label }]) => [value, label])];
const iconList = node('datalist');
iconList.id = 'icon-suggestions';
for (const [slug, label] of Object.entries({ ...builtInIcons, ...iconSuggestions })) iconList.append(new Option(label, slug));
document.body.append(iconList);

function projectEntry(project = {}, open = false) {
  const { root, body, fields, actions, bindTitle } = entry(project.titulo, 'Novo projeto');
  root.open = open;
  const visibility = field('visibilidade', 'Visibilidade do repositório', project.visibilidade, { choices: visibilities });
  const repository = field('repositorio', 'Repositório no GitHub', project.repositorio, { type: 'url', limit: 500, placeholder: 'https://github.com/usuario/repositorio' });
  const visibilitySelect = visibility.querySelector('select');
  const repositoryInput = repository.querySelector('input');
  function updateRepositoryField() {
    repositoryInput.disabled = visibilitySelect.value === 'privado';
    repository.hidden = repositoryInput.disabled;
  }
  visibilitySelect.addEventListener('change', updateRepositoryField);
  updateRepositoryField();
  fields.append(
    field('titulo', 'Título do projeto', project.titulo, { required: true, limit: 120 }),
    field('categoria', 'Categoria', project.categoria ?? 'pessoal', { choices: categories }),
    field('status', 'Status do projeto', project.status, { choices: stages, full: true }),
    field('resumo', 'Resumo do cartão', project.resumo, { required: true, full: true, limit: 320 }),
    field('descricao', 'Descrição completa', project.descricao, { rows: 4, full: true, limit: 6000 }),
    field('tecnologias', 'Tecnologias separadas por vírgula', project.tecnologias?.join(', '), { full: true, limit: 500 }),
    visibility,
    field('demonstracao', 'Marcar como projeto de exemplo', project.demonstracao, { type: 'checkbox' }),
    node('p', 'field-hint full-field', 'O selo indica se o repositório é público ou privado. A descrição, as imagens e o link da demonstração ficam visíveis no portfólio.'),
    repository,
    field('demo', 'Link da demonstração', project.demo, { type: 'url', limit: 500 }),
  );
  bindTitle(fields.querySelector('input'));

  const gallery = node('fieldset', 'gallery-fields');
  const images = node('div', 'gallery-rows');
  const addImage = button('Adicionar imagem', () => {
    if (images.children.length >= 16) {
      showError('Adicione até 16 imagens por projeto.');
      return;
    }
    const row = imageEntry({});
    images.append(row);
    row.querySelector('input').focus();
  });
  function imageEntry(image) {
    const row = node('div', 'image-row field-grid');
    row.append(
      withUpload(field('src', 'Imagem (endereço ou enviada do PC)', image.src, { required: true, limit: 500, placeholder: 'https://… ou use Enviar do PC' }), 1600, { keepGif: true }),
      field('alt', 'Descrição da imagem para acessibilidade', image.alt, { required: true, limit: 320 }),
      button('Remover imagem', () => { row.remove(); addImage.focus(); }),
    );
    return row;
  }
  images.append(...(project.imagens ?? []).map(imageEntry));
  gallery.append(node('legend', '', 'Galeria'), node('p', 'field-hint', 'Use endereços públicos que abram diretamente a imagem, ou envie do PC. GIFs animados (até 8 MB) continuam animados; a primeira imagem é a prévia do cartão.'), images, addImage);
  body.insertBefore(gallery, actions);
  actions.append(button('Remover projeto', () => removeEntry(root, projectAdd)));
  return root;
}

function skillEntry(skill = {}, open = false) {
  const { root, fields, actions, bindTitle } = entry(skill.nome, 'Nova tecnologia');
  root.open = open;
  fields.append(
    field('nome', 'Nome da tecnologia', skill.nome, { required: true, limit: 120 }),
    field('tipo', 'Tipo de tecnologia', skillType(skill), { choices: Object.entries(skillTypes) }),
    field('categoria', 'Área ou especialidade (opcional)', skill.categoria, { limit: 100, placeholder: 'Ex.: Containers' }),
    field('experiencia', 'Como você usa', skill.experiencia, { rows: 3, full: true, limit: 700 }),
    field('icone', 'Ícone (opcional, sai do nome)', skill.icone, { limit: 60, placeholder: 'Ex.: python, cplusplus, proxmox' }),
    withUpload(field('imagem', 'Ícone personalizado (endereço ou do PC)', skill.imagem, { limit: 500, placeholder: 'https://…' }), 256),
    field('imagemOriginal', 'Manter as cores originais da imagem personalizada', skill.imagemOriginal, { type: 'checkbox', full: true }),
    node('p', 'field-hint full-field', 'O ícone é escolhido pelo nome da tecnologia e pinta com a cor do tema. Se não aparecer, procure o nome em simpleicons.org e digite-o em “Ícone”.'),
  );
  const iconInput = fields.querySelector('[name="icone"]');
  iconInput.setAttribute('list', 'icon-suggestions');
  const nameInput = fields.querySelector('input');
  const imageInput = fields.querySelector('[name="imagem"]');
  const keepColors = fields.querySelector('[name="imagemOriginal"]');
  const preview = node('span', 'skill-icon entry-icon');
  preview.setAttribute('aria-hidden', 'true');
  root.querySelector('.drag-handle').after(preview);
  function updatePreview() {
    const custom = imageUrl(imageInput.value.trim());
    if (custom && keepColors.checked) {
      const image = node('img');
      image.alt = '';
      showImage(image, custom);
      preview.replaceChildren(image);
    } else {
      preview.replaceChildren(skillMark(custom ? null : iconInput.value || nameInput.value, custom));
    }
  }
  for (const input of [iconInput, nameInput, imageInput, keepColors]) input.addEventListener('change', updatePreview);
  updatePreview();
  bindTitle(nameInput);
  actions.append(button('Remover tecnologia', () => removeEntry(root, skillAdd)));
  return root;
}

function certificateEntry(certificate = {}, open = false) {
  const { root, fields, actions, bindTitle } = entry(certificate.titulo, 'Novo certificado');
  root.open = open;
  fields.append(
    field('titulo', 'Nome do certificado', certificate.titulo, { required: true, limit: 180 }),
    field('instituicao', 'Instituição emissora', certificate.instituicao, { required: true, limit: 160 }),
    field('data', 'Data de emissão', certificate.data, { type: 'date' }),
    field('credencial', 'Link da credencial', certificate.credencial, { type: 'url', limit: 500, placeholder: 'https://…' }),
    withUpload(field('imagem', 'Imagem do certificado (endereço ou do PC)', certificate.imagem, { full: true, limit: 500, placeholder: 'https://…' }), 1600),
  );
  bindTitle(fields.querySelector('input'));
  actions.append(button('Remover certificado', () => removeEntry(root, certificateAdd)));
  return root;
}

function addEntry(container, create, label) {
  if (container.children.length >= 80) {
    showError(`Adicione até 80 ${label}.`);
    return;
  }
  const item = create({}, true);
  container.append(item);
  item.querySelector('input').focus();
}

projectAdd.addEventListener('click', () => addEntry(projectEditor, projectEntry, 'projetos'));
skillAdd.addEventListener('click', () => addEntry(skillEditor, skillEntry, 'tecnologias'));
certificateAdd.addEventListener('click', () => addEntry(certificateEditor, certificateEntry, 'certificados'));

function fieldValue(scope, name, urlValidator) {
  const input = scope.querySelector(`[name="${name}"]`);
  const value = input.value.trim();
  if ((input.required && !value) || (value && urlValidator && !urlValidator(value))) {
    const label = input.parentElement.firstChild.textContent.trim();
    const message = value ? `Confira o endereço em “${label}”.` : `Preencha “${label}”.`;
    input.setCustomValidity(message);
    input.reportValidity();
    throw new Error(message);
  }
  return value;
}

editor.addEventListener('invalid', (event) => {
  const details = event.target.closest('details');
  if (details) details.open = true;
}, true);
editor.addEventListener('input', (event) => event.target.setCustomValidity?.(''));

function collectContent() {
  const profile = editor.querySelector('.field-grid');
  const value = (name, validator) => fieldValue(profile, name, validator);
  const projects = [...projectEditor.children].map((item) => {
    const get = (name, validator) => fieldValue(item, name, validator);
    const visibility = get('visibilidade');
    return {
      titulo: get('titulo'), categoria: get('categoria'), resumo: get('resumo'), descricao: get('descricao'),
      status: get('status'),
      tecnologias: get('tecnologias').split(',').map((text) => text.trim()).filter(Boolean),
      visibilidade: visibility, repositorio: visibility === 'privado' ? '' : get('repositorio', githubUrl), demo: get('demo', webUrl),
      demonstracao: item.querySelector('[name="demonstracao"]').checked,
      imagens: [...item.querySelectorAll('.image-row')].map((row) => ({
        src: fieldValue(row, 'src', imageUrl), alt: fieldValue(row, 'alt'),
      })),
    };
  });
  const skills = [...skillEditor.children].map((item) => ({
    nome: fieldValue(item, 'nome'), tipo: fieldValue(item, 'tipo'), categoria: fieldValue(item, 'categoria'),
    experiencia: fieldValue(item, 'experiencia'), icone: fieldValue(item, 'icone'),
    imagem: fieldValue(item, 'imagem', imageUrl),
    ...(item.querySelector('[name="imagemOriginal"]').checked ? { imagemOriginal: true } : {}),
  }));
  const certificates = [...certificateEditor.children].map((item) => ({
    titulo: fieldValue(item, 'titulo'), instituicao: fieldValue(item, 'instituicao'),
    data: fieldValue(item, 'data'), credencial: fieldValue(item, 'credencial', webUrl),
    imagem: fieldValue(item, 'imagem', imageUrl),
  }));
  return {
    nome: value('nome'), introducao: value('introducao'), curriculo: value('curriculo', webUrl),
    sobre: { titulo: value('titulo'), descricao: value('descricao') },
    redes: { linkedin: value('linkedin', webUrl), github: value('github', webUrl), email: value('email', emailAddress) },
    tecnologias: skills, projetos: projects,
    ...(certificates.length ? { certificados: certificates } : {}),
  };
}

function renderEditor(content) {
  const profile = editor.querySelector('.field-grid');
  const values = {
    nome: content.nome, introducao: content.introducao, titulo: content.sobre.titulo,
    descricao: content.sobre.descricao, linkedin: content.redes.linkedin, github: content.redes.github,
    email: content.redes.email ?? '', curriculo: content.curriculo ?? '',
  };
  for (const [name, value] of Object.entries(values)) profile.querySelector(`[name="${name}"]`).value = value;
  projectEditor.replaceChildren(...content.projetos.map((project) => projectEntry(project)));
  skillEditor.replaceChildren(...content.tecnologias.map((skill) => skillEntry(skill)));
  certificateEditor.replaceChildren(...(content.certificados ?? []).map((certificate) => certificateEntry(certificate)));
  dirty = false;
}

function showStatus(message) {
  statusMessage.textContent = message;
  errorMessage.textContent = '';
}

function showError(message) {
  statusMessage.textContent = '';
  errorMessage.textContent = message;
}

function publishStatus(message, failed = false) {
  publishFeedback.classList.toggle('admin-error', failed);
  publishFeedback.textContent = message;
}

async function displaySession(user) {
  const version = ++sessionVersion;
  publishStatus('');
  revision = undefined;
  editor.hidden = true;
  loginForm.hidden = Boolean(user);
  signOutButton.hidden = !user;
  showStatus(user ? 'Carregando o conteúdo publicado…' : 'Entre com sua conta de administração.');
  if (!user) return;

  try {
    const result = await cloud.readPortfolio();
    if (sessionVersion !== version) return;
    renderEditor(result.content ?? portfolio);
    revision = result.revision;
    showStatus('Edite o conteúdo e publique quando estiver pronto.');
    editor.hidden = false;
  } catch {
    if (sessionVersion === version) showError('O conteúdo não pôde ser carregado. Recarregue a página para tentar novamente.');
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!cloud) return;
  const email = document.querySelector('#email');
  const password = document.querySelector('#password');
  loginButton.disabled = true;
  showStatus('Entrando…');
  try {
    await cloud.signIn(email.value.trim(), password.value);
    password.value = '';
  } catch (error) {
    password.value = '';
    const message = error.code === 'auth/too-many-requests'
      ? 'Muitas tentativas. Aguarde antes de entrar novamente.'
      : 'Não foi possível entrar. Confira o e-mail, a senha e o acesso da conta.';
    showError(message);
  } finally {
    loginButton.disabled = false;
  }
});

signOutButton.addEventListener('click', async () => {
  try {
    await cloud.signOut();
    document.querySelector('#email').focus();
  } catch {
    showError('O painel não conseguiu encerrar a sessão. Tente novamente.');
  }
});

editor.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (revision === undefined || editorFields.disabled) return;
  const version = sessionVersion;
  try {
    const content = collectContent();
    if (new TextEncoder().encode(JSON.stringify(content)).length > 750_000) {
      throw new Error('O conteúdo está longo demais para publicar. Reduza as descrições ou a quantidade de imagens.');
    }
    editorFields.disabled = true;
    publishStatus('Publicando alterações…');
    const next = await cloud.publishPortfolio(content, revision);
    if (sessionVersion !== version) return;
    revision = next;
    dirty = false;
    publishStatus('Alterações publicadas. Abra o site para conferir.');
  } catch (error) {
    if (sessionVersion === version) publishStatus(error.code
      ? 'O conteúdo não pôde ser publicado. Confira sua conexão e as permissões da sua conta.'
      : error.message, true);
  } finally {
    editorFields.disabled = false;
  }
});

if (!globalThis.portfolioCloud) {
  showStatus('O painel será habilitado depois de conectar o projeto ao Firebase e criar a conta de administração.');
} else {
  const testingLocally = globalThis.portfolioCloud.emulator === true && ['localhost', '127.0.0.1'].includes(location.hostname);
  document.querySelector('#demo-notice').hidden = !testingLocally;
  import('./cloud.mjs').then(async (module) => {
    cloud = module;
    await cloud.observeSession(displaySession);
    loginButton.disabled = false;
  }).catch(() => showError('Não foi possível conectar ao Firebase. Confira a configuração do projeto e a conexão.'));
}


// Alterações não publicadas: avisa antes de sair da página.
let dirty = false;
function markDirty() {
  dirty = true;
  publishFeedback.classList.remove('admin-error');
  publishFeedback.textContent = 'Há alterações não publicadas.';
}
editor.addEventListener('input', markDirty);
editor.addEventListener('change', markDirty);
window.addEventListener('beforeunload', (event) => {
  if (dirty && !editor.hidden) event.preventDefault();
});

// Importação de repositórios públicos do GitHub como rascunhos de projeto.
const githubDialog = document.querySelector('#github-dialog');
const githubForm = document.querySelector('#github-form');
const githubList = document.querySelector('#github-list');
const githubStatus = document.querySelector('#github-status');
let githubRepos = [];

document.querySelector('#import-github').addEventListener('click', () => {
  const profile = webUrl(editor.querySelector('[name="github"]').value.trim());
  const user = profile && new URL(profile).hostname === 'github.com' ? new URL(profile).pathname.split('/').filter(Boolean)[0] ?? '' : '';
  githubForm.elements.user.value ||= user;
  githubDialog.showModal();
});

githubForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const user = githubForm.elements.user.value.trim();
  if (!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(user)) {
    githubStatus.textContent = 'Digite um nome de usuário do GitHub válido.';
    return;
  }
  githubStatus.textContent = 'Buscando repositórios…';
  githubList.replaceChildren();
  try {
    const response = await fetch(`https://api.github.com/users/${encodeURIComponent(user)}/repos?per_page=100&sort=updated`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok) throw new Error(response.status === 404 ? 'Usuário não encontrado.' : `O GitHub respondeu com erro ${response.status}.`);
    const existing = new Set([...projectEditor.querySelectorAll('[name="repositorio"]')].map((input) => input.value.trim().toLowerCase().replace(/\/+$/, '')));
    githubRepos = (await response.json()).filter((repo) => !repo.fork);
    githubList.replaceChildren(...githubRepos.map((repo, index) => {
      const label = node('label', 'github-repo');
      const check = node('input');
      check.type = 'checkbox';
      check.value = index;
      const already = existing.has(repo.html_url.toLowerCase());
      check.disabled = already;
      const text = node('span');
      text.append(node('strong', '', repo.name), node('small', '', already ? 'Já está no portfólio' : repo.description || 'Sem descrição'));
      label.append(check, text);
      return label;
    }));
    githubStatus.textContent = githubRepos.length ? `${githubRepos.length} repositórios públicos encontrados. Marque os que quer adicionar.` : 'Nenhum repositório público encontrado.';
  } catch (error) {
    githubStatus.textContent = error.message.startsWith('O GitHub') || error.message.startsWith('Usuário') ? error.message : 'Não foi possível consultar o GitHub agora.';
  }
});

document.querySelector('#github-add').addEventListener('click', () => {
  const chosen = [...githubList.querySelectorAll('input:checked')].map((input) => githubRepos[Number(input.value)]);
  for (const repo of chosen) {
    if (projectEditor.children.length >= 80) break;
    const title = repo.name.replace(/[-_]+/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
    projectEditor.append(projectEntry({
      titulo: title,
      categoria: 'pessoal',
      resumo: (repo.description || `Repositório ${repo.name}.`).slice(0, 320),
      descricao: repo.description || '',
      tecnologias: [repo.language, ...(repo.topics ?? [])].filter(Boolean).slice(0, 8),
      visibilidade: 'publico',
      repositorio: repo.html_url,
      demo: webUrl(repo.homepage) ?? '',
    }, true));
  }
  if (chosen.length) {
    markDirty();
    showStatus(`${chosen.length} projeto(s) adicionados como rascunho. Revise o texto e publique.`);
  }
  githubDialog.close();
});

// Cópia de segurança do conteúdo em JSON.
document.querySelector('#export-json').addEventListener('click', () => {
  try {
    const blob = new Blob([JSON.stringify(collectContent(), null, 2)], { type: 'application/json' });
    const anchor = node('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `portfolio-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  } catch (error) {
    showError(error.message);
  }
});

const importInput = document.querySelector('#import-json');
importInput.addEventListener('change', async () => {
  const [file] = importInput.files;
  importInput.value = '';
  if (!file) return;
  try {
    const content = JSON.parse(await file.text());
    if (typeof content?.sobre !== 'object' || !Array.isArray(content.projetos) || !Array.isArray(content.tecnologias)) throw new Error();
    content.redes ??= { linkedin: '', github: '', email: '' };
    renderEditor(content);
    markDirty();
    showStatus('Cópia carregada no editor. Confira e publique para aplicar no site.');
  } catch {
    showError('O arquivo não é uma cópia válida do portfólio.');
  }
});

for (const list of [projectEditor, skillEditor, certificateEditor]) enableSorting(list);
