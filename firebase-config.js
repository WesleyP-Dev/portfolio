// Configuração pública do app Web (pode ficar no repositório: quem protege os dados são as regras do Firestore).
// Troque ownerUid pelo UID da sua conta em Authentication → Users e use o mesmo valor em firestore.rules.
globalThis.portfolioCloud = {
  firebase: {
    apiKey: 'AIzaSyC1j1jwn_DY3pTrVXl7-y4kj3tclJ31sAo',
    authDomain: 'wesley-pietro-portfolio.firebaseapp.com',
    projectId: 'wesley-pietro-portfolio',
    storageBucket: 'wesley-pietro-portfolio.firebasestorage.app',
    messagingSenderId: '468778738700',
    appId: '1:468778738700:web:8fe6e4fffbf9f247403a29',
  },
  ownerUid: 'CONFIGURE_OWNER_UID',
};
