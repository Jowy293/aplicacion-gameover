# ⚽ Game Over FC · Guía de instalación

App del equipo para **Android e iPhone**: elegir tu jugador (bloqueado para el resto), votar asistencia a partidos y entrenos, ver partidos, resultados y clasificación, recibir avisos y panel de administración.

> **Cómo funciona:** es una *app web instalable* (PWA). Se instala desde el navegador en Android y en iPhone, aparece con el escudo en la pantalla de inicio, se abre a pantalla completa y recibe notificaciones. No hace falta pasar por Google Play ni por la App Store, porque publicar allí requiere cuentas de pago (Apple: 99 €/año y un Mac). Todo lo que se usa es **gratis**.

| Pieza | Para qué | Coste |
|---|---|---|
| **GitHub Pages** | Aloja la app (la web que se instala) | Gratis |
| **GitHub Actions** | Tareas automáticas: leer la web de la liga, encuesta de los martes, notificaciones | Gratis |
| **Firebase** (Google) | Base de datos de jugadores y votos, notificaciones push | Gratis (plan Spark) |

---

## PARTE A · Montarlo (solo una vez, lo hace el admin) ⏱️ ~30 min

### 1. Crear el proyecto de Firebase
1. Entra en <https://console.firebase.google.com> con una cuenta de Google → **Crear un proyecto** → nombre `game-over-fc` (Google Analytics: desactivado).
2. **Añadir app web**: en la pantalla del proyecto pulsa el icono **`</>`** → apodo `Game Over FC` → **Registrar app**. Te mostrará un bloque `firebaseConfig = { apiKey: ..., ... }`. **Déjalo abierto**, lo necesitas en el paso 2.
3. **Authentication** (menú izquierdo › Compilación) → **Comenzar** → pestaña *Método de inicio de sesión* → **Anónimo** → Habilitar → Guardar.
4. **Firestore Database** → **Crear base de datos** → ubicación `eur3 (europe-west)` → *modo de producción* → Crear.
   - Pestaña **Reglas** → borra todo lo que hay, pega el contenido del archivo [`firestore.rules`](firestore.rules) → **Publicar**.
5. **Clave de notificaciones**: ⚙️ *Configuración del proyecto* → pestaña **Cloud Messaging** → abajo, *Configuración web* → *Certificados push web* → **Generar par de claves**. Copia la clave (empieza por `B...`).
6. **Clave del servidor** (para las tareas automáticas): ⚙️ *Configuración del proyecto* → pestaña **Cuentas de servicio** → **Generar nueva clave privada** → se descarga un archivo `.json`. **Guárdalo bien y no lo compartas con nadie**.

### 2. Rellenar la configuración de la app
Abre [`public/firebase-config.js`](public/firebase-config.js) y sustituye los valores por los del paso 1.2, y `VAPID_KEY` por la clave del paso 1.5:

```js
self.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "game-over-fc.firebaseapp.com",
  projectId: "game-over-fc",
  storageBucket: "game-over-fc.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcd...",
};
self.VAPID_KEY = "BExxxxxxxx...";
```
(Estos datos no son secretos, pueden ir en la web. El `.json` del paso 1.6 sí lo es: **ese nunca se sube**.)

### 3. Subir el proyecto a GitHub
1. Crea una cuenta en <https://github.com> si no tienes.
2. **New repository** → nombre `game-over-fc` → **Public** (GitHub Pages gratis lo necesita; los datos de los jugadores están en Firebase, no en el repositorio) → Create.
3. Desde una terminal en la carpeta del proyecto:
   ```bash
   cd ~/game-over-fc
   git init -b main
   git add .
   git commit -m "App Game Over FC"
   git remote add origin https://github.com/TU_USUARIO/game-over-fc.git
   git push -u origin main
   ```

### 4. Configurar GitHub
En tu repositorio, **Settings**:
1. **Pages** → *Build and deployment* → Source: **GitHub Actions**.
2. **Secrets and variables › Actions**:
   - Pestaña *Secrets* → **New repository secret** → nombre `FIREBASE_SERVICE_ACCOUNT` → pega **todo el contenido** del `.json` del paso 1.6.
   - Pestaña *Variables* → **New repository variable** → nombre `APP_URL` → valor `https://TU_USUARIO.github.io/game-over-fc/`
3. Pestaña **Actions** del repositorio → si lo pide, pulsa *I understand… enable workflows*.
4. Vuelve a lanzar la publicación: **Actions → Publicar app → Run workflow**. Cuando salga ✅, la app estará en `https://TU_USUARIO.github.io/game-over-fc/`.
5. En Firebase → **Authentication → Configuración → Dominios autorizados** → **Agregar dominio** → `TU_USUARIO.github.io`.

### 5. Cargar la plantilla y los partidos
**Actions → Tareas automáticas → Run workflow** → tarea: **`inicializar`** → Run.
Esto crea los 17 jugadores + el entrenador (Toni, DT), deja a **JOWY #22 (Joan Brotons Vidal) como administrador** y hace la primera lectura de la web de la liga.

### 6. Entrar como admin
Abre la app en tu móvil, elige la camiseta **JOWY 22** y te aparecerá la pestaña **🛠️ Admin**. Envía el enlace al grupo del equipo.

### 7. Probar las notificaciones
Activa los avisos en tu móvil (pestaña Perfil) y lanza **Actions → Tareas automáticas → Run workflow → `prueba-notificacion`**.

---

## PARTE B · Instalar la app en el móvil (para todos los jugadores)

Enlace: `https://TU_USUARIO.github.io/game-over-fc/`

### 🤖 Android
1. Abre el enlace con **Chrome**.
2. Pulsa **⋮** (arriba a la derecha) → **Instalar aplicación** (o *Añadir a pantalla de inicio*) → Instalar.
3. Abre **Game Over FC** desde el icono del escudo.
4. Elige tu camiseta → confirma.
5. Pulsa **🔔 Activar** → **Permitir**.

### 🍎 iPhone (iOS 16.4 o superior)
1. Abre el enlace con **Safari** (tiene que ser Safari).
2. Pulsa el botón **Compartir** (cuadrado con flecha ↑) → baja y pulsa **Añadir a pantalla de inicio** → **Añadir**.
3. **Cierra Safari y abre la app desde el icono** de la pantalla de inicio (si no, iPhone no deja recibir notificaciones).
4. Elige tu camiseta → confirma.
5. Pestaña **Perfil → 🔔 Activar notificaciones** → **Permitir**.

> ⚠️ **Elegir camiseta es definitivo**: cuando eliges tu jugador nadie más puede elegirlo. Si te equivocas o cambias de móvil, pide al admin que te **libere** el usuario.

---

## PARTE C · Cómo funciona día a día

| Cuándo | Qué pasa |
|---|---|
| **Cada hora** (los miércoles, cada 15 min) | Se leen de ligacomarcal.com los partidos, resultados y clasificación del GAME OVER FC. |
| **En cuanto se publica la hora del partido** | Se abre la **votación de asistencia** dentro del partido y llega una **notificación a todos**: “⚽ ¡Partido publicado! …”. Si cambian la hora, llega otro aviso. |
| **Votación del partido** | Se puede votar **Voy / No voy** (y cambiar el voto) **hasta el miércoles a las 20:00**. Después queda cerrada. Si el partido fuera antes, cierra al empezar el partido. |
| **Martes ~10:00** | Se crea la **encuesta del entreno del miércoles** y llega un aviso. |

Todos ven quién va, quién no y quién no ha votado aún.

### Panel de administración (🛠️ Admin)
- **Partidos**: añadir, editar o borrar partidos; poner hora, pabellón y resultado; cambiar el cierre de la votación. Si editas uno a mano deja marcado *“No sobrescribir con la web”*. Al poner la hora, la notificación sale sola en la siguiente pasada (como mucho 1 hora, 15 min los miércoles).
- **Entrenos**: crear, editar o borrar encuestas de entreno (fecha, hora, lugar, nota, cierre).
- **Jugadores y permisos**:
  - Editar nombre, dorsal y nombre completo, y añadir o borrar jugadores.
  - **Hacer admin / Quitar admin**: si Joan deja el equipo, que haga admin a otro y después se quite el permiso. Siempre tiene que quedar al menos un admin.
  - **Liberar**: desvincula el móvil de un jugador para que pueda volver a elegirlo.
- **Ajustes**: día y hora de cierre de la votación de partidos (por defecto miércoles 20:00), encuesta automática de los martes (sí/no), hora, lugar y cierre del entreno, y URL de la liga (para la temporada que viene).

---

## PARTE D · Si algo falla

**No aparecen los partidos de la liga.** Desde aquí no se pudo abrir ligacomarcal.com (su certificado de seguridad da error), así que el lector se ha hecho para que se adapte solo, pero no se ha probado con la web real. Mira **Actions → Tareas automáticas → (última ejecución) → run**. Ahí pone cuántos partidos ha encontrado. Si son 0:
1. Mientras tanto, mete los partidos a mano desde **Admin → Partidos** (las notificaciones y las votaciones funcionan igual).
2. Descarga el archivo **`html-liga`** de esa ejecución (abajo, en *Artifacts*) y pásaselo a quien mantenga la app para ajustar el lector `scripts/sync_liga.py`.

**No llegan notificaciones.**
- iPhone: la app tiene que estar añadida a la pantalla de inicio y abierta desde allí, con iOS 16.4 o superior.
- Comprueba que el secreto `FIREBASE_SERVICE_ACCOUNT` y la variable `APP_URL` están bien puestos.
- En Perfil pulsa *Volver a registrar este móvil* y lanza `prueba-notificacion`.

**Las tareas automáticas dejan de ejecutarse.** GitHub pausa las tareas programadas si el repositorio pasa **60 días sin cambios**. Entra en *Actions → Tareas automáticas* y pulsa **Enable workflow**, o haz cualquier pequeño cambio en el repositorio de vez en cuando.

**Cambiar el escudo por uno de más calidad.** El escudo actual está recortado de la imagen de la plantilla y se ve algo pixelado. Si tienes el original, sustituye `public/icons/logo.png` (y `icon-96/180/192/512.png`, cuadrados con fondo verde) y sube los cambios.

---

## Estructura del proyecto
```
game-over-fc/
├── public/                 ← la app (lo que se instala en el móvil)
│   ├── index.html, app.js, styles.css
│   ├── firebase-config.js  ← tu configuración de Firebase (paso 2)
│   ├── sw.js               ← funcionamiento sin conexión + notificaciones
│   ├── manifest.json       ← nombre "Game Over FC" e icono
│   └── icons/              ← escudo
├── scripts/                ← tareas automáticas (Python)
│   ├── seed.py             ← carga la plantilla (admin: Jowy #22)
│   ├── sync_liga.py        ← lee ligacomarcal.com y avisa de la hora del partido
│   ├── training.py         ← encuesta del entreno de los martes
│   └── test_push.py        ← notificación de prueba
├── firestore.rules         ← seguridad: usuarios bloqueados, solo tu voto, solo admins editan
└── .github/workflows/      ← publicación y horarios automáticos
```
