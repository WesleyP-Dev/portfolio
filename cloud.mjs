const sdk = 'https://www.gstatic.com/firebasejs/13.3.0/';
const settings = globalThis.portfolioCloud;
let databaseConnection;
let authConnection;

function database() {
  if (!databaseConnection) {
    databaseConnection = Promise.all([import(`${sdk}firebase-app.js`), import(`${sdk}firebase-firestore.js`)])
      .then(([appModule, store]) => {
        const app = appModule.initializeApp(settings.firebase);
        const db = store.getFirestore(app);
        const ref = store.doc(db, 'publico', 'portfolio');
        if (localEmulator()) store.connectFirestoreEmulator(db, location.hostname, 8080);
        return { app, db, ref, store };
      });
  }
  return databaseConnection;
}

function localEmulator() {
  return settings.emulator === true && ['localhost', '127.0.0.1'].includes(location.hostname);
}

function authentication() {
  if (!authConnection) {
    authConnection = Promise.all([database(), import(`${sdk}firebase-auth.js`)]).then(async ([{ app }, api]) => {
      const auth = api.getAuth(app);
      if (localEmulator()) api.connectAuthEmulator(auth, `http://${location.hostname}:9099`, { disableWarnings: true });
      await api.setPersistence(auth, api.browserSessionPersistence);
      return { api, auth };
    });
  }
  return authConnection;
}

export async function observeSession(callback) {
  const { auth, api } = await authentication();
  return api.onAuthStateChanged(auth, (user) => callback(user?.uid === settings.ownerUid ? user : null));
}

export async function signIn(email, password) {
  const { auth, api } = await authentication();
  const { user } = await api.signInWithEmailAndPassword(auth, email, password);
  if (user.uid !== settings.ownerUid) {
    await api.signOut(auth);
    throw new Error('Conta sem acesso de administração.');
  }
}

export async function signOut() {
  const { auth, api } = await authentication();
  await api.signOut(auth);
}

export async function readPortfolio() {
  const { ref, store } = await database();
  const snapshot = await store.getDocFromServer(ref);
  return snapshot.exists() ? snapshot.data() : { revision: 0, content: null };
}

export async function publishPortfolio(content, expectedRevision) {
  const { auth } = await authentication();
  if (auth.currentUser?.uid !== settings.ownerUid) throw new Error('Entre novamente para publicar.');
  const { db, ref, store } = await database();
  return store.runTransaction(db, async (transaction) => {
    const previous = await transaction.get(ref);
    const revision = previous.data()?.revision ?? 0;
    if (revision !== expectedRevision) {
      throw new Error('O site foi atualizado em outra aba. Copie suas alterações antes de recarregar o painel.');
    }
    transaction.set(ref, { content, revision: revision + 1 });
    return revision + 1;
  });
}

const blobTypes = new Map();

// Tipo do arquivo por trás de um endereço criado por readImage (por exemplo, video/mp4).
export function imageType(url) {
  return blobTypes.get(url) ?? '';
}

export async function readImage(id) {
  const { db, store } = await database();
  const snapshot = await store.getDoc(store.doc(db, 'imagens', id));
  if (!snapshot.exists()) throw new Error('Imagem não encontrada.');
  const { dados, tipo, partes } = snapshot.data();
  if (dados) return typedUrl(new Blob([dados.toUint8Array()], { type: tipo }));
  // Arquivos maiores (GIFs) ficam divididos em partes de até ~950 KB na subcoleção "partes".
  const pieces = await Promise.all(Array.from({ length: partes }, (_, index) => store.getDoc(store.doc(db, 'imagens', id, 'partes', String(index)))));
  return typedUrl(new Blob(pieces.map((piece) => piece.data().dados.toUint8Array()), { type: tipo }));
}

function typedUrl(blob) {
  const url = URL.createObjectURL(blob);
  blobTypes.set(url, blob.type);
  return url;
}

const pieceSize = 900_000;

export async function uploadImage(blob) {
  const { auth } = await authentication();
  if (auth.currentUser?.uid !== settings.ownerUid) throw new Error('Entre novamente para enviar imagens.');
  const { db, store } = await database();
  const ref = store.doc(store.collection(db, 'imagens'));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length <= pieceSize) {
    await store.setDoc(ref, { dados: store.Bytes.fromUint8Array(bytes), tipo: blob.type, tamanho: blob.size, criado: store.serverTimestamp() });
    return `fs:${ref.id}`;
  }
  // Um documento do Firestore guarda no máximo 1 MiB: o arquivo vai em partes, gravadas juntas.
  const total = Math.ceil(bytes.length / pieceSize);
  const batch = store.writeBatch(db);
  batch.set(ref, { tipo: blob.type, tamanho: blob.size, partes: total, criado: store.serverTimestamp() });
  for (let index = 0; index < total; index += 1) {
    const dados = store.Bytes.fromUint8Array(bytes.slice(index * pieceSize, (index + 1) * pieceSize));
    batch.set(store.doc(db, 'imagens', ref.id, 'partes', String(index)), { dados });
  }
  await batch.commit();
  return `fs:${ref.id}`;
}
