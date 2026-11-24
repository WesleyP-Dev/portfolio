const skillTypes = {
  linguagem: 'Linguagem',
  sistema: 'Sistema operacional',
  biblioteca: 'Biblioteca ou framework',
  ferramenta: 'Ferramenta ou programa',
  hardware: 'Hardware',
  outros: 'Outros',
};

const projectVisibility = { publico: 'Público', privado: 'Privado' };
const projectStages = {
  andamento: { label: 'Em andamento', description: 'O projeto está em desenvolvimento e ainda tem funcionalidades sendo implementadas.' },
  beta: { label: 'Em beta', description: 'O projeto está em fase de testes e pode receber ajustes antes da versão final.' },
  parcial: { label: 'Parcialmente concluído', description: 'Parte do escopo foi entregue e ainda há itens pendentes.' },
  concluido: { label: 'Concluído', description: 'O escopo previsto para o projeto foi entregue.' },
};

// Ícones desenhados no próprio CSS. Os demais vêm do Simple Icons (simpleicons.org) e são
// aplicados como máscara: o desenho original é descartado e só a silhueta recebe a cor do tema.
const builtInIcons = { windows: 'Windows' };
const iconSuggestions = {
  python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript', cplusplus: 'C++', c: 'C', openjdk: 'Java',
  nodedotjs: 'Node.js', html5: 'HTML', css3: 'CSS', react: 'React', git: 'Git', github: 'GitHub', linux: 'Linux',
  raspberrypi: 'Raspberry Pi', proxmox: 'Proxmox', linuxcontainers: 'LXC', firebase: 'Firebase', supabase: 'Supabase',
  sqlite: 'SQLite', docker: 'Docker', arduino: 'Arduino', figma: 'Figma',
};
const iconAliases = {
  raspberry: 'raspberrypi', 'c++': 'cplusplus', cpp: 'cplusplus', java: 'openjdk', node: 'nodedotjs', 'node.js': 'nodedotjs', nodejs: 'nodedotjs',
  js: 'javascript', ts: 'typescript', html: 'html5', css: 'css3', lxc: 'linuxcontainers', 'raspberry pi': 'raspberrypi', 'raspberry pi os': 'raspberrypi',
};

function iconSlug(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return '';
  if (Object.hasOwn(builtInIcons, text) || Object.hasOwn(iconAliases, text)) return iconAliases[text] ?? text;
  const slug = text.replace(/\+/g, 'plus').replace(/\./g, 'dot').replace(/&/g, 'and').normalize('NFD').replace(/[^a-z0-9]/g, '');
  return slug;
}

function iconMaskUrl(value) {
  const slug = iconSlug(value);
  return slug && !Object.hasOwn(builtInIcons, slug) ? `https://cdn.jsdelivr.net/npm/simple-icons@13/icons/${slug}.svg` : null;
}

function skillType(skill) {
  if (Object.hasOwn(skillTypes, skill.tipo)) return skill.tipo;
  const category = (skill.categoria ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
  if (/^(linguagem|linguagens)\b/.test(category)) return 'linguagem';
  if (/^sistemas?\b/.test(category)) return 'sistema';
  if (/^(bibliotecas?|frameworks?)\b/.test(category)) return 'biblioteca';
  if (/^(ferramentas?|programas?|software|containers?)\b/.test(category)) return 'ferramenta';
  if (/^hardware\b/.test(category)) return 'hardware';
  return 'outros';
}

// Toda marca usa a cor de destaque do tema. Se o ícone não carregar, aparece o símbolo genérico.
function skillMark(name, customUrl) {
  const mark = document.createElement('span');
  mark.className = 'skill-mark';
  mark.textContent = '</>';
  const slug = iconSlug(name);
  if (!customUrl && Object.hasOwn(builtInIcons, slug)) {
    mark.dataset.icon = slug;
    return mark;
  }
  const source = customUrl ?? iconMaskUrl(name);
  if (!source) return mark;
  resolveImage(source).then((url) => {
    const probe = new Image();
    probe.crossOrigin = 'anonymous';
    probe.onload = () => {
      mark.textContent = '';
      mark.classList.add('skill-mask');
      mark.style.setProperty('--icon', `url("${url}")`);
    };
    probe.src = url;
  }).catch(() => {});
  return mark;
}

// Converte "fs:<id>" no endereço local da imagem guardada no Firestore; outros endereços passam direto.
const storedImages = new Map();
function resolveImage(src) {
  const id = storedImageId(src);
  if (!id) return Promise.resolve(src);
  if (!storedImages.has(id)) {
    storedImages.set(id, import('./cloud.mjs').then((cloud) => cloud.readImage(id)).catch((error) => {
      storedImages.delete(id);
      throw error;
    }));
  }
  return storedImages.get(id);
}

function showImage(img, src) {
  resolveImage(src).then((url) => { img.src = url; }).catch(() => img.closest('figure, a, .skill-icon')?.classList.add('image-missing'));
}
