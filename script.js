const root = document.documentElement;
const themeButton = document.querySelector('.theme-toggle');
const paletteButtons = [...document.querySelectorAll('[data-palette-option]')];
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

function updatePaletteButton() {
  for (const button of paletteButtons) {
    button.setAttribute('aria-pressed', String(root.dataset.palette === button.dataset.paletteOption));
  }
}

updatePaletteButton();
for (const button of paletteButtons) {
  button.addEventListener('click', () => {
    root.dataset.palette = button.dataset.paletteOption;
    updatePaletteButton();
    try {
      localStorage.setItem('portfolio-palette', root.dataset.palette);
    } catch { /* A preferência ainda vale nesta página. */ }
  });
}

function updateNavigation() {
  const hash = location.hash || '#inicio';
  for (const item of document.querySelectorAll('.main-nav a')) {
    if (item.hash === hash) item.setAttribute('aria-current', 'location');
    else item.removeAttribute('aria-current');
  }
}

window.addEventListener('hashchange', updateNavigation);
updateNavigation();

function skillCard(skill) {
  const item = element('li', 'skill');
  const icon = element('span', 'skill-icon');
  icon.setAttribute('aria-hidden', 'true');
  const customIcon = imageUrl(skill.imagem);
  if (customIcon) {
    const image = element('img');
    image.alt = '';
    image.src = customIcon;
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
  return item;
}

function gallery(project, lazy = true) {
  const { imagens = [], titulo: title } = project;
  const images = imagens.filter((image) => imageUrl(image.src));
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
    image.src = imageUrl(src);
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
  const repository = githubUrl(project.repositorio);
  const demo = webUrl(project.demo);
  if (repository) links.push(link('Abrir no GitHub', repository));
  if (demo) links.push(link('Abrir demonstração', demo));
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
  const actions = element('div', 'card-actions');
  actions.append(details);
  const repository = githubUrl(project.repositorio);
  if (repository) {
    const source = element('a', 'details', 'GitHub');
    source.href = repository;
    source.setAttribute('aria-label', `Abrir ${project.titulo} no GitHub`);
    actions.append(source);
  }
  content.append(actions);
  card.append(content);
  return card;
}

let cards = [];
let activeFilter = filters[0];

function selectFilter(selected, announce = true) {
  activeFilter = selected;
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

function renderPortfolio(content) {
  const name = content.nome.trim();
  for (const brand of document.querySelectorAll('[data-brand]')) brand.textContent = name || 'Portfólio';
  document.title = name ? `${name} · Portfólio` : 'Portfólio · Projetos e sobre mim';
  document.querySelector('#intro').textContent = content.introducao;
  document.querySelector('#about-lead').textContent = content.sobre.titulo;
  document.querySelector('#about-description').textContent = content.sobre.descricao;
  document.querySelector('#project-intro').textContent = content.projetos.some((project) => project.demonstracao)
    ? 'Uma seleção demonstrativa de projetos pessoais e acadêmicos.'
    : 'Projetos pessoais e trabalhos da faculdade.';

  const social = [['LinkedIn', content.redes.linkedin], ['GitHub', content.redes.github], ['Currículo', content.curriculo]];
  document.querySelector('#social-links').replaceChildren(...social.map(([label, value]) => {
    const item = element('li');
    const url = webUrl(value);
    item.append(url ? link(label, url) : element('span', 'button secondary', `${label} · a adicionar`));
    return item;
  }));

  const skillList = document.querySelector('#skill-list');
  skillList.replaceChildren(...(content.tecnologias ?? []).map(skillCard));
  document.querySelector('#tecnologias').hidden = !skillList.children.length;

  cards = content.projetos.map((project) => ({ category: project.categoria, card: projectCard(project) }));
  grid.replaceChildren(...cards.map(({ card }) => card));
  selectFilter(activeFilter, false);
}

for (const filter of filters) filter.addEventListener('click', () => selectFilter(filter));
renderPortfolio(portfolio);

if (globalThis.portfolioCloud) {
  import('./cloud.mjs')
    .then(({ readPortfolio }) => readPortfolio())
    .then(({ content }) => { if (content) renderPortfolio(content); })
    .catch((error) => console.error('Falha ao carregar o perfil publicado.', error));
}
