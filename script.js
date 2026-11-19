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
  label.append(element('strong', '', skill.nome), element('p', 'skill-category', skill.categoria || skillTypes[skillType(skill)]));
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
  const media = element('div', 'gallery-media');
  let image = element('img');
  image.loading = lazy ? 'lazy' : 'eager';
  image.decoding = 'async';
  image.src = imageUrl(images[0].src);
  image.alt = images[0].alt;
  media.append(image);
  frame.append(media);
  figure.append(frame);
  if (images.length === 1) return figure;

  let current = 0;
  let requested = 0;
  let requestId = 0;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const count = element('span', 'gallery-count', `1/${images.length}`);
  count.setAttribute('aria-hidden', 'true');
  const status = element('span', 'visually-hidden');
  status.setAttribute('role', 'status');

  async function move(step) {
    requested = (requested + step + images.length) % images.length;
    const index = requested;
    const request = ++requestId;
    if (index === current) return;

    const incoming = element('img');
    incoming.alt = images[index].alt;
    incoming.src = imageUrl(images[index].src);
    try {
      await incoming.decode();
    } catch {
      if (request === requestId) {
        requested = current;
        status.textContent = `Não foi possível carregar a imagem ${index + 1}.`;
      }
      return;
    }
    if (request !== requestId) return;

    const previousImage = image;
    if (reduceMotion.matches) {
      media.replaceChildren(incoming);
    } else {
      for (const animation of previousImage.getAnimations()) animation.finish();
      previousImage.previousElementSibling?.remove();
      previousImage.setAttribute('aria-hidden', 'true');
      media.append(incoming);
      const transition = incoming.animate([
        { opacity: 0, transform: `translateX(${step * 3}%)` },
        { opacity: 1, transform: 'translateX(0)' },
      ], { duration: 240, easing: 'ease-out' });
      const removePrevious = () => previousImage.remove();
      transition.finished.then(removePrevious, removePrevious);
    }

    image = incoming;
    current = index;
    count.textContent = `${current + 1}/${images.length}`;
    status.textContent = `Imagem ${current + 1} de ${images.length}. ${incoming.alt}`;
  }

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

function projectBadges(project) {
  const badges = [element('p', 'category', categories[project.categoria])];
  if (project.demonstracao) badges.push(element('span', 'project-badge', 'Exemplo'));
  if (Object.hasOwn(projectVisibility, project.visibilidade)) {
    badges.push(element('span', 'project-badge', projectVisibility[project.visibilidade]));
  }
  return badges;
}

function projectRepository(project) {
  return project.visibilidade === 'privado' ? null : githubUrl(project.repositorio);
}

function openProject(project) {
  document.querySelector('#dialog-category').replaceChildren(...projectBadges(project));
  document.querySelector('#dialog-title').textContent = project.titulo;
  document.querySelector('#dialog-description').textContent = project.descricao || project.resumo;

  const projectGallery = gallery(project, false);
  document.querySelector('#dialog-gallery').replaceChildren(...(projectGallery ? [projectGallery] : []));
  const tags = technologyItems(project);
  const tagList = document.querySelector('#dialog-tags');
  tagList.replaceChildren(...tags);
  tagList.hidden = !tags.length;

  const links = [];
  const repository = projectRepository(project);
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
  meta.append(...projectBadges(project));
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
  const repository = projectRepository(project);
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

const projectsPerPage = 6;
const pagination = document.querySelector('#project-pagination');
const previousPage = document.querySelector('#previous-project-page');
const nextPage = document.querySelector('#next-project-page');
const pageLabel = document.querySelector('#project-page-label');
const projectStatus = document.querySelector('#project-status');
const projectTitle = document.querySelector('#project-title');
const skillFilter = document.querySelector('#skill-filter');
const skillList = document.querySelector('#skill-list');
const skillStatus = document.querySelector('#skill-status');
const noSkills = document.querySelector('#no-skills');
let entries = [];
let skillEntries = [];
let activeFilter = filters[0];
let currentPage = 1;

function renderProjectPage(announce = true) {
  const category = activeFilter.dataset.filter;
  const matching = category === 'todos' ? entries : entries.filter(({ project }) => project.categoria === category);
  const count = matching.length;
  const pageCount = Math.max(1, Math.ceil(count / projectsPerPage));
  currentPage = Math.max(1, Math.min(currentPage, pageCount));

  const start = (currentPage - 1) * projectsPerPage;
  const end = Math.min(start + projectsPerPage, count);
  const visible = matching.slice(start, end).map((entry) => (entry.card ??= projectCard(entry.project)));
  grid.replaceChildren(...visible);
  document.querySelector('#no-projects').hidden = count > 0;

  pagination.hidden = pageCount === 1;
  previousPage.disabled = currentPage === 1;
  nextPage.disabled = currentPage === pageCount;
  pageLabel.textContent = `Página ${currentPage} de ${pageCount}`;
  if (announce) {
    projectStatus.textContent = pageCount > 1
      ? `${pageLabel.textContent}. Projetos ${start + 1} a ${end} de ${count}.`
      : count === 1 ? '1 projeto exibido.' : `${count} projetos exibidos.`;
  }
}

function selectFilter(selected) {
  if (selected === activeFilter) return;
  activeFilter = selected;
  currentPage = 1;
  filters.forEach((filter) => filter.setAttribute('aria-pressed', String(filter === selected)));
  renderProjectPage();
}

function moveProjectPage(step) {
  currentPage += step;
  renderProjectPage();
  projectTitle.focus({ preventScroll: true });
  projectTitle.scrollIntoView({ block: 'start' });
}

function filterSkills(announce = true) {
  let count = 0;
  for (const { type, card } of skillEntries) {
    const visible = skillFilter.value === 'todos' || skillFilter.value === type;
    card.hidden = !visible;
    if (visible) count += 1;
  }
  noSkills.hidden = count > 0;
  if (announce) skillStatus.textContent = count === 1 ? '1 tecnologia exibida.' : `${count} tecnologias exibidas.`;
}

skillFilter.add(new Option('Todas', 'todos'));
for (const [type, label] of Object.entries(skillTypes)) skillFilter.add(new Option(label, type));
skillFilter.addEventListener('change', () => filterSkills());

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

  skillEntries = (content.tecnologias ?? []).map((skill) => ({ type: skillType(skill), card: skillCard(skill) }));
  skillList.replaceChildren(...skillEntries.map(({ card }) => card));
  document.querySelector('#tecnologias').hidden = !skillEntries.length;
  filterSkills(false);

  entries = content.projetos.map((project) => ({ project, card: null }));
  renderProjectPage(false);
}

for (const filter of filters) filter.addEventListener('click', () => selectFilter(filter));
previousPage.addEventListener('click', () => moveProjectPage(-1));
nextPage.addEventListener('click', () => moveProjectPage(1));
renderPortfolio(portfolio);

if (globalThis.portfolioCloud) {
  import('./cloud.mjs')
    .then(({ readPortfolio }) => readPortfolio())
    .then(({ content }) => { if (content) renderPortfolio(content); })
    .catch((error) => console.error('Falha ao carregar o perfil publicado.', error));
}
