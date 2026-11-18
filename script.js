const root = document.documentElement;
const themeButton = document.querySelector('.theme-toggle');
const filters = [...document.querySelectorAll('[data-filter]')];
const grid = document.querySelector('#project-grid');
const dialog = document.querySelector('#project-dialog');
const categories = { pessoal: 'Pessoal', faculdade: 'Faculdade' };

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
}

function webUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function link(label, url) {
  const anchor = element('a', 'button secondary', label);
  anchor.href = url;
  return anchor;
}

function updateThemeButton() {
  const label = root.dataset.theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro';
  themeButton.setAttribute('aria-label', label);
  themeButton.title = label;
}

updateThemeButton();
themeButton.addEventListener('click', () => {
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  updateThemeButton();
  try {
    localStorage.setItem('portfolio-theme', root.dataset.theme);
  } catch { /* A preferência ainda vale nesta página. */ }
});

function updateNavigation() {
  const hash = location.hash || '#inicio';
  for (const item of document.querySelectorAll('.main-nav a')) {
    if (item.hash === hash) item.setAttribute('aria-current', 'location');
    else item.removeAttribute('aria-current');
  }
}

window.addEventListener('hashchange', updateNavigation);
updateNavigation();

for (const brand of document.querySelectorAll('[data-brand]')) {
  if (portfolio.nome.trim()) brand.textContent = portfolio.nome;
}
if (portfolio.nome.trim()) document.title = `${portfolio.nome} · Portfólio`;
document.querySelector('#intro').textContent = portfolio.introducao;
document.querySelector('#about-lead').textContent = portfolio.sobre.titulo;
document.querySelector('#about-description').textContent = portfolio.sobre.descricao;
if (!portfolio.projetos.some((project) => project.demonstracao)) {
  document.querySelector('#project-intro').textContent = 'Projetos pessoais e trabalhos da faculdade.';
}

for (const [name, value] of [['LinkedIn', portfolio.redes.linkedin], ['GitHub', portfolio.redes.github]]) {
  const item = element('li');
  const url = webUrl(value);
  item.append(url ? link(name, url) : element('span', 'button secondary', `${name} · a adicionar`));
  document.querySelector('#social-links').append(item);
}

const skillList = document.querySelector('#skill-list');
for (const skill of portfolio.tecnologias ?? []) {
  const item = element('li', 'skill');
  const icon = element('span', 'skill-icon');
  icon.setAttribute('aria-hidden', 'true');
  if (skill.imagem) {
    const image = element('img');
    image.alt = '';
    image.src = skill.imagem;
    icon.append(image);
  } else {
    const mark = element('span', 'skill-mark', '</>');
    mark.dataset.icon = skill.icone ?? '';
    icon.append(mark);
  }
  const label = element('div');
  label.append(element('strong', '', skill.nome), element('p', 'skill-category', skill.categoria));
  if (skill.experiencia) label.append(element('p', 'skill-note', skill.experiencia));
  item.append(icon, label);
  skillList.append(item);
}
document.querySelector('#tecnologias').hidden = !skillList.children.length;

function gallery(project, lazy = true) {
  const { imagens: images = [], titulo: title } = project;
  if (!images.length) return null;

  const figure = element('figure', 'gallery');
  const frame = element('div', 'gallery-frame');
  const image = element('img');
  image.loading = lazy ? 'lazy' : 'eager';
  image.decoding = 'async';
  frame.append(image);
  figure.append(frame);

  let current = 0;
  const count = element('span', 'gallery-count');
  count.setAttribute('aria-hidden', 'true');
  const status = element('span', 'visually-hidden');
  status.setAttribute('role', 'status');

  function showImage(announce = false) {
    const { src, alt } = images[current];
    image.alt = alt;
    image.src = src;
    count.textContent = `${current + 1}/${images.length}`;
    if (announce) status.textContent = `Imagem ${current + 1} de ${images.length}. ${alt}`;
  }

  function move(step) {
    current = (current + step + images.length) % images.length;
    showImage(true);
  }

  showImage();
  if (images.length === 1) return figure;

  const controls = element('div', 'gallery-controls');
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', `Galeria de ${title}`);
  const previous = element('button', 'icon-button', '‹');
  const next = element('button', 'icon-button', '›');
  previous.type = next.type = 'button';
  previous.setAttribute('aria-label', `Imagem anterior de ${title}`);
  next.setAttribute('aria-label', `Próxima imagem de ${title}`);
  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  controls.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    move(event.key === 'ArrowLeft' ? -1 : 1);
  });
  controls.append(previous, count, next);
  frame.append(controls);
  figure.append(status);
  return figure;
}

function technologyItems(project) {
  return (project.tecnologias ?? []).map((name) => element('li', '', name));
}

function openProject(project) {
  document.querySelector('#dialog-category').textContent = project.demonstracao
    ? `${categories[project.categoria]} · Exemplo`
    : categories[project.categoria];
  document.querySelector('#dialog-title').textContent = project.titulo;
  document.querySelector('#dialog-description').textContent = project.descricao || project.resumo;

  const projectGallery = gallery(project, false);
  document.querySelector('#dialog-gallery').replaceChildren(...(projectGallery ? [projectGallery] : []));
  const tags = technologyItems(project);
  const tagList = document.querySelector('#dialog-tags');
  tagList.replaceChildren(...tags);
  tagList.hidden = !tags.length;

  const links = [];
  for (const [label, value] of [['Ver repositório', project.repositorio], ['Abrir demonstração', project.demo]]) {
    const url = webUrl(value);
    if (url) links.push(link(label, url));
  }
  document.querySelector('#dialog-links').replaceChildren(...links);
  dialog.showModal();
}

function projectCard(project) {
  const card = element('article', 'project-card');
  const projectGallery = gallery(project);
  if (projectGallery) card.append(projectGallery);

  const content = element('div', 'card-content');
  const meta = element('div', 'card-meta');
  meta.append(element('p', 'category', categories[project.categoria]));
  if (project.demonstracao) meta.append(element('p', 'sample', 'Exemplo'));
  content.append(meta, element('h3', '', project.titulo), element('p', 'card-summary', project.resumo));

  const technologies = technologyItems(project);
  if (technologies.length) {
    const tags = element('ul', 'tags');
    tags.setAttribute('aria-label', 'Tecnologias');
    tags.append(...technologies);
    content.append(tags);
  }

  const details = element('button', 'details', 'Ver detalhes');
  details.type = 'button';
  details.setAttribute('aria-label', `Ver detalhes de ${project.titulo}`);
  const plus = element('span', '', '+');
  plus.setAttribute('aria-hidden', 'true');
  details.append(plus);
  details.addEventListener('click', () => openProject(project));
  content.append(details);
  card.append(content);
  return card;
}

const cards = portfolio.projetos.map((project) => {
  const card = projectCard(project);
  grid.append(card);
  return { category: project.categoria, card };
});

function selectFilter(selected, announce = true) {
  const category = selected.dataset.filter;
  filters.forEach((filter) => filter.setAttribute('aria-pressed', String(filter === selected)));
  let count = 0;
  for (const entry of cards) {
    const visible = category === 'todos' || entry.category === category;
    entry.card.hidden = !visible;
    if (visible) count += 1;
  }
  document.querySelector('#no-projects').hidden = count > 0;
  if (announce) {
    document.querySelector('#filter-status').textContent = count === 1 ? '1 projeto exibido.' : `${count} projetos exibidos.`;
  }
}

for (const filter of filters) filter.addEventListener('click', () => selectFilter(filter));
selectFilter(filters[0], false);
