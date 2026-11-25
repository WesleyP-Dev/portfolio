const root = document.documentElement;
const themeButton = document.querySelector('.theme-toggle');
const paletteButtons = [...document.querySelectorAll('[data-palette-option]')];
const filters = [...document.querySelectorAll('[data-filter]')];
const grid = document.querySelector('#project-grid');
const dialog = document.querySelector('#project-dialog');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const languageButtons = [...document.querySelectorAll('[data-language-option]')];
let lang = root.lang === 'en' ? 'en' : 'pt';
let currentContent = null;
const t = () => uiText[lang];

// Conteúdo no idioma escolhido: em inglês usa o campo "en" do item, se preenchido; senão, o português.
function tr(item, path) {
  const read = (object) => path.split('.').reduce((value, key) => value?.[key], object);
  const english = lang === 'en' ? read(item?.en) : '';
  return typeof english === 'string' && english.trim() ? english : read(item) ?? '';
}
const stageInfo = (status) => (lang === 'en' ? uiText.en.stages[status] : projectStages[status]);
const skillTypeLabel = (type) => (lang === 'en' ? uiText.en.skillTypes[type] : skillTypes[type]);
const visibilityLabel = (value) => (lang === 'en' ? uiText.en.visibility[value] : projectVisibility[value]);

function applyStaticTexts() {
  const texts = t();
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = texts[node.dataset.i18n];
  for (const node of document.querySelectorAll('[data-i18n-html]')) node.innerHTML = texts[node.dataset.i18nHtml];
  for (const node of document.querySelectorAll('[data-i18n-aria]')) node.setAttribute('aria-label', texts[node.dataset.i18nAria]);
  document.querySelector('meta[name="description"]').content = texts.description;
  for (const button of languageButtons) button.setAttribute('aria-pressed', String(button.dataset.languageOption === lang));
  updateThemeButton();
}

function setLanguage(next) {
  if (next === lang || !languages.includes(next)) return;
  lang = next;
  root.lang = lang === 'en' ? 'en' : 'pt-BR';
  try { localStorage.setItem('portfolio-lang', lang); } catch { /* A escolha ainda vale nesta página. */ }
  const address = new URL(location.href);
  if (address.searchParams.has('lang')) {
    address.searchParams.set('lang', lang);
    history.replaceState(history.state, '', address);
  }
  if (dialog.open) dialog.close();
  applyStaticTexts();
  if (currentContent) renderPortfolio(currentContent);
}

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
  const label = root.dataset.theme === 'dark' ? t().themeToLight : t().themeToDark;
  themeButton.setAttribute('aria-label', label);
  themeButton.title = label;
}

applyStaticTexts();
for (const button of languageButtons) button.addEventListener('click', () => setLanguage(button.dataset.languageOption));
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
  if (customIcon && skill.imagemOriginal) {
    const image = element('img');
    image.alt = '';
    showImage(image, customIcon);
    icon.append(image);
  } else {
    icon.append(skillMark(customIcon ? null : skill.icone || skill.nome, customIcon));
  }
  const label = element('div');
  // Permite quebrar linha depois de / ) , em textos longos sem espaço, como "RaspOS(Debian)/Ubuntu".
  const breakable = (text) => String(text ?? '').replace(/([/),])(?=\S)/g, '$1\u200b');
  label.append(element('strong', '', breakable(skill.nome)), element('p', 'skill-category', breakable(tr(skill, 'categoria') || skillTypeLabel(skillType(skill)))));
  const experience = tr(skill, 'experiencia');
  if (experience) {
    // O texto de "como eu uso" fica recolhido: o cartão continua compacto e só cresce quando o visitante abre.
    const noteId = `skill-note-${++skillNoteCount}`;
    const toggle = element('button', 'skill-more', t().howIUse);
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', noteId);
    const chevron = element('span', 'skill-more-icon');
    chevron.setAttribute('aria-hidden', 'true');
    toggle.append(chevron);
    const note = element('div', 'skill-note-wrap');
    note.id = noteId;
    note.append(element('p', 'skill-note', experience));
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      item.classList.toggle('is-open', open);
    });
    label.append(toggle, note);
    item.classList.add('has-note');
  }
  item.append(icon, label);
  return item;
}

let skillNoteCount = 0;

// Vídeos da galeria funcionam como GIF: sem som, em repetição e só tocando enquanto estão na tela.
const videoUrl = (src) => /\.(mp4|webm)(?:[?#]|$)/i.test(src);
const videoObserver = 'IntersectionObserver' in window ? new IntersectionObserver((items) => {
  for (const { target, isIntersecting } of items) {
    if (!target.isConnected) videoObserver.unobserve(target);
    else if (isIntersecting && !reduceMotion.matches) target.play().catch(() => {});
    else target.pause();
  }
}) : null;

function whenVisible(target, callback) {
  if (!('IntersectionObserver' in window)) return callback();
  const observer = new IntersectionObserver((items) => {
    if (!items.some((item) => item.isIntersecting)) return;
    observer.disconnect();
    callback();
  }, { rootMargin: '300px' });
  observer.observe(target);
}

async function loadMedia(src, alt) {
  const url = await resolveImage(src);
  const isVideo = storedImageId(src) ? (await import('./cloud.mjs')).imageType(url).startsWith('video/') : videoUrl(src);
  if (!isVideo) {
    const img = element('img');
    img.alt = alt;
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  }
  const video = element('video');
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.disablePictureInPicture = true;
  video.preload = 'auto';
  video.setAttribute('aria-label', alt);
  video.src = url;
  await new Promise((resolve, reject) => {
    video.addEventListener('loadeddata', resolve, { once: true });
    video.addEventListener('error', reject, { once: true });
  });
  if (videoObserver) videoObserver.observe(video);
  else if (!reduceMotion.matches) video.play().catch(() => {});
  return video;
}

function gallery(project, lazy = true) {
  const title = tr(project, 'titulo');
  const images = (project.imagens ?? []).filter((image) => imageUrl(image.src)).map((image) => ({ src: image.src, alt: tr(image, 'alt') }));
  if (!images.length) return null;

  const figure = element('figure', 'gallery');
  const frame = element('div', 'gallery-frame');
  const media = element('div', 'gallery-media');
  let image;
  const first = imageUrl(images[0].src);
  if (storedImageId(first) || videoUrl(first)) {
    // Arquivos enviados pelo painel e vídeos só são baixados quando o cartão chega perto da tela.
    const placeholder = element('span');
    image = placeholder;
    const load = () => loadMedia(first, images[0].alt).then((loaded) => {
      placeholder.replaceWith(loaded);
      if (image === placeholder) image = loaded;
    }).catch(() => figure.classList.add('image-missing'));
    if (lazy) whenVisible(frame, load); else load();
  } else {
    image = element('img');
    image.loading = lazy ? 'lazy' : 'eager';
    image.decoding = 'async';
    image.src = first;
    image.alt = images[0].alt;
    image.addEventListener('error', () => figure.classList.add('image-missing'), { once: true });
  }
  media.append(image);
  frame.append(media);
  figure.append(frame);
  if (images.length === 1) return figure;

  let current = 0;
  let requested = 0;
  let requestId = 0;
  const count = element('span', 'gallery-count', `1/${images.length}`);
  count.setAttribute('aria-hidden', 'true');
  const status = element('span', 'visually-hidden');
  status.setAttribute('role', 'status');

  async function move(step) {
    requested = (requested + step + images.length) % images.length;
    const index = requested;
    const request = ++requestId;
    if (index === current) return;

    let incoming;
    try {
      incoming = await loadMedia(imageUrl(images[index].src), images[index].alt);
    } catch {
      if (request === requestId) {
        requested = current;
        status.textContent = t().imageFailed(index + 1);
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
      const removePrevious = () => { previousImage.pause?.(); previousImage.remove(); };
      transition.finished.then(removePrevious, removePrevious);
    }

    image = incoming;
    current = index;
    count.textContent = `${current + 1}/${images.length}`;
    status.textContent = t().imageOf(current + 1, images.length, images[index].alt);
  }

  const controls = element('div', 'gallery-controls');
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', t().galleryOf(title));
  const previous = element('button', 'icon-button', '‹');
  const next = element('button', 'icon-button', '›');
  previous.type = next.type = 'button';
  previous.setAttribute('aria-label', t().previousImage(title));
  next.setAttribute('aria-label', t().nextImage(title));
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

// No card as tecnologias ocupam uma linha só, para todos os cards terem a mesma altura. O que não couber
// vira um "+N" (com os nomes no title); a lista completa fica nos detalhes do projeto.
const tagRows = new ResizeObserver((entries) => {
  for (const { target, contentRect } of entries) {
    if (target.isConnected && contentRect.width !== target.fittedWidth) fitTags(target);
  }
});

function fitTags(list) {
  list.fittedWidth = list.getBoundingClientRect().width;
  const items = [...list.children].filter((item) => !item.classList.contains('tag-more'));
  const more = list.querySelector('.tag-more');
  for (const item of items) item.hidden = false;
  more.hidden = true;
  const firstRow = items[0].offsetTop;
  if (items.at(-1).offsetTop === firstRow) return;
  more.hidden = false;
  let shown = items.length;
  const update = () => {
    const names = items.slice(shown).map((item) => item.textContent);
    more.textContent = `+${names.length}`;
    more.title = names.join(', ');
    more.setAttribute('aria-label', t().moreTechnologies(names));
  };
  do {
    items[--shown].hidden = true;
    update();
  } while (shown > 1 && more.offsetTop !== firstRow);
}

function technologyItems(project) {
  return (project.tecnologias ?? []).map((name) => element('li', '', name));
}

function projectBadges(project) {
  const badges = [element('p', 'category', t().categories[project.categoria])];
  if (project.demonstracao) badges.push(element('span', 'project-badge', t().example));
  if (Object.hasOwn(projectVisibility, project.visibilidade)) {
    badges.push(element('span', 'project-badge', visibilityLabel(project.visibilidade)));
  }
  return badges;
}

function projectRepository(project) {
  return project.visibilidade === 'privado' ? null : githubUrl(project.repositorio);
}

function projectStage(project) {
  if (!Object.hasOwn(projectStages, project.status)) return null;
  const { label, description } = stageInfo(project.status);
  const badge = element('span', 'project-stage');
  badge.dataset.stage = project.status;
  badge.title = description;
  const marker = element('span', 'project-stage-icon');
  marker.setAttribute('aria-hidden', 'true');
  badge.append(marker, element('span', '', label));
  return badge;
}

function openProject(project) {
  const badges = projectBadges(project);
  const stage = projectStage(project);
  if (stage) badges.push(stage);
  document.querySelector('#dialog-category').replaceChildren(...badges);
  document.querySelector('#dialog-title').textContent = tr(project, 'titulo');
  document.querySelector('#dialog-description').textContent = tr(project, 'descricao') || tr(project, 'resumo');

  const projectGallery = gallery(project, false);
  document.querySelector('#dialog-gallery').replaceChildren(...(projectGallery ? [projectGallery] : []));
  const tags = technologyItems(project);
  const tagList = document.querySelector('#dialog-tags');
  tagList.replaceChildren(...tags);
  tagList.hidden = !tags.length;

  const links = [];
  const repository = projectRepository(project);
  const demo = webUrl(project.demo);
  if (repository) links.push(link(t().openGithub, repository));
  if (demo) links.push(link(t().openDemo, demo));
  document.querySelector('#dialog-links').replaceChildren(...links);
  dialog.showModal();
}

function projectCard(project) {
  const card = element('article', 'project-card');
  const projectGallery = gallery(project);
  const stage = projectStage(project);
  if (stage) (projectGallery?.firstElementChild ?? card).append(stage);
  if (projectGallery) card.append(projectGallery);

  const content = element('div', 'card-content');
  const meta = element('div', 'card-meta');
  meta.append(...projectBadges(project));
  const title = tr(project, 'titulo');
  content.append(meta, element('h3', '', title), element('p', 'card-summary', tr(project, 'resumo')));

  const technologies = technologyItems(project);
  if (technologies.length) {
    const tags = element('ul', 'tags');
    tags.setAttribute('aria-label', t().technologies);
    const more = element('li', 'tag-more');
    more.hidden = true;
    tags.append(...technologies, more);
    content.append(tags);
    tagRows.observe(tags);
  }

  const details = element('button', 'details', t().details);
  details.type = 'button';
  details.setAttribute('aria-label', t().detailsOf(title));
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
    source.setAttribute('aria-label', t().openOnGithub(title));
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
const projectResults = document.querySelector('#project-results');
const skillFilter = document.querySelector('#skill-filter');
const skillResults = document.querySelector('#skill-results');
const skillList = document.querySelector('#skill-list');
const skillStatus = document.querySelector('#skill-status');
const noSkills = document.querySelector('#no-skills');
let entries = [];
let skillEntries = [];
let activeFilter = filters[0];
let currentPage = 1;

function animateFilter(container, update) {
  const before = container.getBoundingClientRect().height;
  for (const animation of container.getAnimations()) animation.cancel();
  update();
  if (reduceMotion.matches) return;

  const after = container.getBoundingClientRect().height;
  container.animate([
    { height: `${before}px`, opacity: .6, transform: 'translateY(4px)', overflow: 'clip' },
    { height: `${after}px`, opacity: 1, transform: 'translateY(0)', overflow: 'clip' },
  ], { duration: 260, easing: 'cubic-bezier(.2, .75, .25, 1)' });
}

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
  pageLabel.textContent = t().page(currentPage, pageCount);
  revealNew();
  if (announce) {
    projectStatus.textContent = pageCount > 1
      ? t().projectRange(pageLabel.textContent, start + 1, end, count)
      : t().projectCount(count);
  }
}

function selectFilter(selected) {
  if (selected === activeFilter) return;
  activeFilter = selected;
  currentPage = 1;
  filters.forEach((filter) => filter.setAttribute('aria-pressed', String(filter === selected)));
  animateFilter(projectResults, renderProjectPage);
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
  if (announce) skillStatus.textContent = t().skillCount(count);
}


function certificateCard(certificate) {
  const card = element('article', 'certificate-card');
  const title = tr(certificate, 'titulo');
  const imagePath = imageUrl(certificate.imagem);
  if (imagePath) {
    const preview = element('a', 'certificate-preview');
    resolveImage(imagePath).then((url) => { preview.href = url; }).catch(() => {});
    preview.target = '_blank';
    preview.rel = 'noopener';
    preview.setAttribute('aria-label', t().certificateImage(title));
    const image = element('img');
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    showImage(image, imagePath);
    preview.append(image);
    card.append(preview);
  }

  const content = element('div', 'certificate-content');
  const emblem = element('span', 'certificate-emblem');
  emblem.setAttribute('aria-hidden', 'true');
  content.append(emblem, element('h3', '', title), element('p', 'certificate-issuer', certificate.instituicao));

  if (/^\d{4}-\d{2}-\d{2}$/.test(certificate.data)) {
    const date = new Date(`${certificate.data}T00:00:00Z`);
    if (Number.isFinite(date.valueOf())) {
      const issued = element('time', 'certificate-issued', new Intl.DateTimeFormat(t().locale, { dateStyle: 'long', timeZone: 'UTC' }).format(date));
      issued.dateTime = certificate.data;
      content.append(issued);
    }
  }

  const credential = webUrl(certificate.credencial);
  if (credential) {
    const credentialLink = link(t().credential, credential);
    credentialLink.setAttribute('aria-label', t().credentialOf(title));
    content.append(credentialLink);
  }
  card.append(content);
  return card;
}

skillFilter.addEventListener('change', () => animateFilter(skillResults, filterSkills));

function renderPortfolio(content) {
  currentContent = content;
  const texts = t();
  const name = content.nome.trim();
  for (const brand of document.querySelectorAll('[data-brand]')) brand.textContent = name || texts.brand;
  document.title = name ? texts.titleWithName(name) : texts.title;
  document.querySelector('#intro').textContent = tr(content, 'introducao');
  document.querySelector('#about-lead').textContent = tr(content, 'sobre.titulo');
  document.querySelector('#about-description').textContent = tr(content, 'sobre.descricao');
  document.querySelector('#project-intro').textContent = content.projetos.some((project) => project.demonstracao) ? texts.projectsDemo : texts.projectsReal;

  document.querySelector('#hero-eyebrow').textContent = name ? texts.eyebrowName(name) : texts.eyebrow;

  // Links vazios ficam ocultos para quem visita.
  const social = [['LinkedIn', webUrl(content.redes.linkedin)], ['GitHub', webUrl(content.redes.github)], [texts.resume, webUrl(content.curriculo)]];
  document.querySelector('#social-links').replaceChildren(...social.filter(([, url]) => url).map(([label, url]) => {
    const item = element('li');
    item.append(link(label, url));
    return item;
  }));
  renderContact(content);

  skillEntries = (content.tecnologias ?? []).map((skill, index) => ({ type: skillType(skill), card: skillCard(skill), index }));
  skillList.replaceChildren(...skillEntries.map(({ card }) => card));
  document.querySelector('#tecnologias').hidden = !skillEntries.length;
  const usedTypes = new Set(skillEntries.map(({ type }) => type));
  const selectedType = usedTypes.has(skillFilter.value) ? skillFilter.value : 'todos';
  skillFilter.replaceChildren(new Option(texts.skillAll, 'todos'), ...Object.keys(skillTypes)
    .filter((type) => usedTypes.has(type)).map((type) => new Option(skillTypeLabel(type), type)));
  skillFilter.value = selectedType;
  filterSkills(false);

  const certificates = content.certificados ?? [];
  document.querySelector('#certificate-grid').replaceChildren(...certificates.map(certificateCard));
  document.querySelector('#certificados').hidden = !certificates.length;
  document.querySelector('[data-nav-certificates]').hidden = !certificates.length;

  entries = content.projetos.map((project) => ({ project, card: null }));
  renderProjectPage(false);
  revealNew();
}

const contactStatus = document.querySelector('#contact-status');

function renderContact(content) {
  const email = emailAddress(content.redes.email);
  const linkedin = webUrl(content.redes.linkedin);
  const actions = [];
  if (email) {
    const mail = link(t().sendEmail, `mailto:${email}`);
    mail.className = 'button primary';
    const copy = element('button', 'button secondary', t().copyEmail);
    copy.type = 'button';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(email);
        contactStatus.textContent = t().emailCopied;
      } catch {
        contactStatus.textContent = email;
      }
    });
    actions.push(mail, copy);
  }
  if (linkedin) actions.push(link('LinkedIn', linkedin));
  document.querySelector('#contact-actions').replaceChildren(...actions);
  document.querySelector('#contato').hidden = !actions.length;
  document.querySelector('[data-nav-contact]').hidden = !actions.length;
}

for (const filter of filters) filter.addEventListener('click', () => selectFilter(filter));
previousPage.addEventListener('click', () => moveProjectPage(-1));
nextPage.addEventListener('click', () => moveProjectPage(1));
// Animações de entrada, destaque que segue o cursor e menu que acompanha a rolagem.
const revealObserver = 'IntersectionObserver' in window ? new IntersectionObserver((items) => {
  for (const item of items) {
    if (!item.isIntersecting) continue;
    item.target.classList.add('is-visible');
    revealObserver.unobserve(item.target);
    setTimeout(() => item.target.style.removeProperty('--delay'), 1200);
  }
}, { rootMargin: '0px 0px -8% 0px', threshold: .08 }) : null;

if (revealObserver) root.classList.add('reveal-ready');

function revealNew() {
  const targets = document.querySelectorAll('[data-reveal]:not(.is-visible), .project-card:not(.is-visible), .skill:not(.is-visible), .certificate-card:not(.is-visible)');
  targets.forEach((target, index) => {
    if (!target.hasAttribute('data-reveal')) {
      target.setAttribute('data-reveal', '');
      target.style.setProperty('--delay', `${Math.min(index % 6, 5) * 70}ms`);
    }
    if (revealObserver && !reduceMotion.matches) revealObserver.observe(target);
    else target.classList.add('is-visible');
  });
}

document.addEventListener('pointermove', (event) => {
  const card = event.target.closest?.('.project-card, .skill, .certificate-card, .contact-card');
  if (!card) return;
  const box = card.getBoundingClientRect();
  card.style.setProperty('--mx', `${event.clientX - box.left}px`);
  card.style.setProperty('--my', `${event.clientY - box.top}px`);
}, { passive: true });

const heroArt = document.querySelector('.hero-art');
if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
  heroArt.addEventListener('pointermove', (event) => {
    if (reduceMotion.matches) return;
    const box = heroArt.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - .5;
    const y = (event.clientY - box.top) / box.height - .5;
    heroArt.style.setProperty('--tilt-x', `${(-y * 6).toFixed(2)}deg`);
    heroArt.style.setProperty('--tilt-y', `${(x * 8).toFixed(2)}deg`);
  });
  heroArt.addEventListener('pointerleave', () => {
    heroArt.style.removeProperty('--tilt-x');
    heroArt.style.removeProperty('--tilt-y');
  });
}

if (revealObserver) {
  const sections = [...document.querySelectorAll('main > section[id]')];
  const spy = new IntersectionObserver((items) => {
    const visible = items.filter((item) => item.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    for (const item of document.querySelectorAll('.main-nav a')) {
      if (item.hash === `#${visible.target.id}`) item.setAttribute('aria-current', 'location');
      else item.removeAttribute('aria-current');
    }
  }, { rootMargin: '-35% 0px -55% 0px' });
  sections.forEach((section) => spy.observe(section));
}

// Com o Firebase ativo, mostra a última versão vista (ou um esqueleto) em vez dos exemplos de conteudo.js.
const cacheKey = 'portfolio-cache';
function cachedPortfolio() {
  try {
    return JSON.parse(localStorage.getItem(cacheKey))?.content ?? null;
  } catch {
    return null;
  }
}

if (globalThis.portfolioCloud) {
  const cached = cachedPortfolio();
  if (cached) renderPortfolio(cached);
  else {
    root.classList.add('is-loading');
    grid.replaceChildren(...Array.from({ length: 3 }, () => element('div', 'project-card skeleton')));
  }
  import('./cloud.mjs')
    .then(({ readPortfolio }) => readPortfolio())
    .then(({ content }) => {
      renderPortfolio(content ?? portfolio);
      try { localStorage.setItem(cacheKey, JSON.stringify({ content })); } catch { /* Sem cache. */ }
    })
    .catch((error) => {
      console.error('Falha ao carregar o perfil publicado.', error);
      if (!cached) renderPortfolio(portfolio);
    })
    .finally(() => root.classList.remove('is-loading'));
} else {
  renderPortfolio(portfolio);
}
