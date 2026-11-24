function webUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function githubUrl(value) {
  const href = webUrl(value);
  if (!href) return null;
  const url = new URL(href);
  return url.origin === 'https://github.com' && url.pathname.split('/').filter(Boolean).length >= 2 ? href : null;
}

// Imagens enviadas pelo painel ficam no Firestore e são referenciadas como "fs:<id>".
function storedImageId(value) {
  return /^fs:[A-Za-z0-9]{20}$/.test(value ?? '') ? value.slice(3) : null;
}

function imageUrl(value) {
  if (storedImageId(value)) return value;
  return /^\.\/assets\/[\w./-]+$/i.test(value) && !value.split('/').includes('..') ? value : webUrl(value);
}

function emailAddress(value) {
  const text = String(value ?? '').trim();
  return /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i.test(text) && text.length <= 254 ? text : null;
}
