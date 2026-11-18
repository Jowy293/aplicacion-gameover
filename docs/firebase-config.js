// ============================================================
//  CONFIGURACIÓN DE FIREBASE  (rellenar siguiendo GUIA_INSTALACION.md, paso 2)
//  Este archivo lo usan la app y el service worker (notificaciones).
// ============================================================
self.FIREBASE_CONFIG = {
  apiKey: "PEGA_AQUI_TU_API_KEY",
  authDomain: "TU-PROYECTO.firebaseapp.com",
  projectId: "TU-PROYECTO",
  storageBucket: "TU-PROYECTO.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxxxxxx",
};

// Clave pública de notificaciones web (Firebase > Configuración del proyecto >
// Cloud Messaging > Certificados push web > "Par de claves")
self.VAPID_KEY = "PEGA_AQUI_TU_CLAVE_VAPID";
