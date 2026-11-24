// Acesso ao Firebase pelas APIs REST, entrando com a conta dona do portfólio.
// As regras do Firestore continuam valendo: nada aqui usa conta de serviço ou o Admin SDK.
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const documentPath = 'publico/portfolio';

async function siteConfig() {
  try {
    const source = await readFile(new URL('../firebase-config.js', import.meta.url), 'utf8');
    const context = vm.createContext({});
    vm.runInContext(source, context, { filename: 'firebase-config.js' });
    return context.portfolioCloud ?? null;
  } catch {
    return null;
  }
}

export async function loadSettings(env = process.env) {
  const site = await siteConfig();
  const apiKey = env.PORTFOLIO_API_KEY || site?.firebase?.apiKey;
  const projectId = env.PORTFOLIO_PROJECT_ID || site?.firebase?.projectId;
  if (!apiKey || !projectId) {
    throw new Error('Configure PORTFOLIO_API_KEY e PORTFOLIO_PROJECT_ID (ou preencha firebase-config.js).');
  }
  const authHost = env.FIREBASE_AUTH_EMULATOR_HOST;
  const firestoreHost = env.FIRESTORE_EMULATOR_HOST;
  return {
    apiKey,
    projectId,
    ownerUid: env.PORTFOLIO_OWNER_UID || site?.ownerUid || '',
    email: env.PORTFOLIO_EMAIL || '',
    password: env.PORTFOLIO_PASSWORD || '',
    authBase: authHost ? `http://${authHost}/identitytoolkit.googleapis.com/v1` : 'https://identitytoolkit.googleapis.com/v1',
    firestoreBase: firestoreHost ? `http://${firestoreHost}/v1` : 'https://firestore.googleapis.com/v1',
    emulator: Boolean(authHost || firestoreHost),
  };
}

// Conversão entre valores do Firestore REST e JSON comum.
function encode(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: value.length ? { values: value.map(encode) } : {} };
  return { mapValue: { fields: encodeFields(value) } };
}

function encodeFields(object) {
  return Object.fromEntries(Object.entries(object).filter(([, item]) => item !== undefined).map(([key, item]) => [key, encode(item)]));
}

function decode(value) {
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('stringValue' in value) return value.stringValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decode);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields ?? {});
  return null;
}

function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, item]) => [key, decode(item)]));
}

export class PortfolioStore {
  constructor(settings) {
    this.settings = settings;
    this.session = null;
    this.queue = Promise.resolve();
  }

  get documentName() {
    return `projects/${this.settings.projectId}/databases/(default)/documents/${documentPath}`;
  }

  async request(url, options = {}) {
    let response;
    try {
      response = await fetch(url, { ...options, signal: AbortSignal.timeout(20_000) });
    } catch {
      throw new Error('Sem conexão com o Firebase. Confira a rede e, no teste local, se os emuladores estão ativos.');
    }
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { /* resposta sem JSON */ }
    return { ok: response.ok, status: response.status, body };
  }

  async token() {
    if (this.session && this.session.expires > Date.now() + 60_000) return this.session.idToken;
    const { email, password, apiKey, authBase, ownerUid } = this.settings;
    if (!email || !password) throw new Error('Configure PORTFOLIO_EMAIL e PORTFOLIO_PASSWORD para publicar alterações.');
    const result = await this.request(`${authBase}/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    if (!result.ok) {
      const code = String(result.body?.error?.message ?? '').split(' ')[0];
      const known = /^(INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND|USER_DISABLED|TOO_MANY_ATTEMPTS_TRY_LATER|INVALID_EMAIL|OPERATION_NOT_ALLOWED|API_KEY_INVALID)$/.test(code);
      throw new Error(`Não foi possível entrar na conta do portfólio${known ? ` (${code})` : ''}. Confira PORTFOLIO_EMAIL, PORTFOLIO_PASSWORD e a configuração do Firebase.`);
    }
    if (ownerUid && result.body.localId !== ownerUid) {
      this.session = null;
      throw new Error('A conta configurada não é a dona do portfólio (UID diferente de ownerUid).');
    }
    this.session = { idToken: result.body.idToken, expires: Date.now() + Number(result.body.expiresIn ?? 3600) * 1000 };
    return this.session.idToken;
  }

  async headers(authenticated) {
    const headers = { 'Content-Type': 'application/json' };
    if (authenticated) headers.Authorization = `Bearer ${await this.token()}`;
    return headers;
  }

  firestoreError(result, action) {
    const status = result.body?.error?.status ?? result.status;
    if (status === 'PERMISSION_DENIED' || result.status === 403) {
      return new Error(`O Firestore recusou ${action}. Confira se a conta é a dona do portfólio e se o conteúdo respeita firestore.rules.`);
    }
    if (status === 'ABORTED' || status === 'FAILED_PRECONDITION' || result.status === 409) return new Error('O portfólio foi alterado ao mesmo tempo por outro lugar. Leia de novo e tente outra vez.');
    if (status === 'UNAUTHENTICATED' || result.status === 401) {
      this.session = null;
      return new Error('A sessão do Firebase expirou ou é inválida. Tente novamente.');
    }
    return new Error(`O Firestore respondeu com erro ao ${action} (${status}).`);
  }

  async read({ authenticated = false } = {}) {
    const result = await this.request(`${this.settings.firestoreBase}/${this.documentName}`, { headers: await this.headers(authenticated) });
    if (result.status === 404) return { revision: 0, content: null, updateTime: null };
    if (!result.ok) throw this.firestoreError(result, 'ler o portfólio');
    const data = decodeFields(result.body.fields ?? {});
    return { revision: data.revision ?? 0, content: data.content ?? null, updateTime: result.body.updateTime };
  }

  // Mesmo contrato de publishPortfolio em cloud.mjs. Como o runTransaction do SDK Web, a escrita é
  // otimista: só vale se o documento não mudou desde a leitura (pré-condição updateTime/exists).
  // A nova revisão é sempre a lida + 1, e firestore.rules confere isso de novo no servidor.
  publish(change) {
    const run = this.queue.then(() => this.transaction(change));
    this.queue = run.catch(() => {});
    return run;
  }

  async transaction(change) {
    const headers = await this.headers(true);
    const current = await this.read({ authenticated: true });
    const outcome = await change(current);
    if (!outcome.content) return { ...outcome, revision: current.revision };
    const revision = current.revision + 1;
    const writes = [{
      update: { name: this.documentName, fields: encodeFields({ content: outcome.content, revision }) },
      currentDocument: current.updateTime ? { updateTime: current.updateTime } : { exists: false },
    }];
    const base = `${this.settings.firestoreBase}/projects/${this.settings.projectId}/databases/(default)/documents`;
    const result = await this.request(`${base}:commit`, { method: 'POST', headers, body: JSON.stringify({ writes }) });
    if (!result.ok) {
      // As regras avaliam a revisão antes da pré-condição: se outra escrita entrou no meio, o erro vem como
      // PERMISSION_DENIED. Relê para dar a mensagem certa.
      const latest = await this.read().catch(() => current);
      if (latest.revision !== current.revision) throw this.firestoreError({ status: 409, body: {} }, 'publicar');
      throw this.firestoreError(result, 'publicar');
    }
    return { ...outcome, revision, published: true };
  }
}
