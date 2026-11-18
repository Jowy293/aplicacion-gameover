// Configuración de Firebase del proyecto game-over-fc (datos públicos, no son secretos).
// La usan la app y el service worker (notificaciones).
self.FIREBASE_CONFIG = {
  apiKey: "AIzaSyC0_TMFeeSpxhvSMhCATE_e2RjmG8EjG5I",
  authDomain: "game-over-fc.firebaseapp.com",
  projectId: "game-over-fc",
  storageBucket: "game-over-fc.firebasestorage.app",
  messagingSenderId: "228228664028",
  appId: "1:228228664028:web:a6806ad2bb87f75bf90219",
};

// Clave pública de notificaciones web (Cloud Messaging > Certificados push web)
self.VAPID_KEY = "BJCwOwrZKSNv4RTZcBYFrtWHOvFq95v6aYu8v4r5j9HvIRiA7VPYv0PfAa4pdprz5A97n_KHAnKLqsNYHJroVN0";
