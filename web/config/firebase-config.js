/**
 * AUVRYN 1.11 — Firebase Authentication + AUVRYN Cloud.
 *
 * 1) Crie um projeto em https://console.firebase.google.com/
 * 2) Registre um App Web.
 * 3) Ative Authentication > Google e Authentication > E-mail/senha.
 * 4) Crie Cloud Firestore e aplique firestore.rules.
 * 5) Study Circles usam apenas Firestore. Cloud Storage é opcional e não é necessário para os grupos.
 * 6) Cole abaixo o objeto firebaseConfig fornecido pelo Firebase.
 * 7) Em produção, ative App Check com reCAPTCHA Enterprise e informe appCheckSiteKey.
 *
 * O firebaseConfig do app Web não é uma credencial administrativa.
 * Nunca coloque senhas, chaves privadas ou service-account JSON aqui.
 */
window.AUVRYN_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDmckjygJqlSzSEUhnvrP3L7ZliWJIXBfs",
  authDomain: "auryn-5de2f.firebaseapp.com",
  projectId: "auryn-5de2f",
  storageBucket: "auryn-5de2f.firebasestorage.app",
  messagingSenderId: "1035520748868",
  appId: "1:1035520748868:web:4b90291ebd77cb2d74fb11",
  appCheckSiteKey: "",
  aiModel: "gemini-3.8-flash",
  aiAppCheckDebug: false
};

// Compatibilidade com configurações antigas do projeto NEXO.
window.NEXO_FIREBASE_CONFIG = window.AUVRYN_FIREBASE_CONFIG;
