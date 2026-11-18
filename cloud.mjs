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
