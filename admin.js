const editor = document.querySelector('#editor');
const editorFields = document.querySelector('#editor-fields');
const loginForm = document.querySelector('#login-form');
const loginButton = document.querySelector('#login-button');
const signOutButton = document.querySelector('#sign-out');
const projectEditor = document.querySelector('#project-editor');
const skillEditor = document.querySelector('#skill-editor');
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

function entry(title, emptyTitle) {
  const root = node('details', 'editor-entry');
  const summary = node('summary', '', title || emptyTitle);
  const body = node('div', 'entry-body');
  const fields = node('div', 'field-grid');
  const actions = node('div', 'admin-actions');
  root.append(summary, body);
  body.append(fields, actions);
  function bindTitle(input) {
    input.addEventListener('input', () => { summary.textContent = input.value.trim() || emptyTitle; });
  }
  return { root, summary, body, fields, actions, bindTitle };
}

function removeEntry(root, fallback) {
  const other = root.nextElementSibling ?? root.previousElementSibling;
  root.remove();
  (other?.querySelector('summary') ?? fallback).focus();
}

const projectAdd = document.querySelector('#add-project');
const skillAdd = document.querySelector('#add-skill');
const categories = [['pessoal', 'Pessoal'], ['faculdade', 'Faculdade']];
const visibilities = [['', 'Sem selo'], ...Object.entries(projectVisibility)];
const icons = [['', 'Genérico'], ['windows', 'Windows'], ['raspberry', 'Raspberry Pi OS'], ['docker', 'Docker']];

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
      field('src', 'Endereço da imagem', image.src, { required: true, limit: 500, placeholder: 'https://…' }),
      field('alt', 'Descrição da imagem para acessibilidade', image.alt, { required: true, limit: 320 }),
      button('Remover imagem', () => { row.remove(); addImage.focus(); }),
    );
    return row;
  }
  images.append(...(project.imagens ?? []).map(imageEntry));
  gallery.append(node('legend', '', 'Galeria'), node('p', 'field-hint', 'Use endereços públicos que abram diretamente a imagem.'), images, addImage);
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
    field('icone', 'Ícone', skill.icone, { choices: icons }),
    field('imagem', 'Endereço de um ícone personalizado', skill.imagem, { limit: 500, placeholder: 'https://…' }),
  );
  bindTitle(fields.querySelector('input'));
  actions.append(button('Remover tecnologia', () => removeEntry(root, skillAdd)));
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
  }));
  return {
    nome: value('nome'), introducao: value('introducao'), curriculo: value('curriculo', webUrl),
    sobre: { titulo: value('titulo'), descricao: value('descricao') },
    redes: { linkedin: value('linkedin', webUrl), github: value('github', webUrl) },
    tecnologias: skills, projetos: projects,
  };
}

function renderEditor(content) {
  const profile = editor.querySelector('.field-grid');
  const values = {
    nome: content.nome, introducao: content.introducao, titulo: content.sobre.titulo,
    descricao: content.sobre.descricao, linkedin: content.redes.linkedin, github: content.redes.github,
    curriculo: content.curriculo ?? '',
  };
  for (const [name, value] of Object.entries(values)) profile.querySelector(`[name="${name}"]`).value = value;
  projectEditor.replaceChildren(...content.projetos.map((project) => projectEntry(project)));
  skillEditor.replaceChildren(...content.tecnologias.map((skill) => skillEntry(skill)));
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
