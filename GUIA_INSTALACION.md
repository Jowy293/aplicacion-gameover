# ⚽ Game Over FC · Guía de instalación

App del equipo para **Android e iPhone**: elegir tu jugador (bloqueado para el resto), votar asistencia a partidos y entrenos, ver partidos, resultados y clasificación, recibir avisos y panel de administración.

> **Cómo funciona:** es una *app web instalable* (PWA). Se instala desde el navegador en Android y en iPhone, aparece con el escudo en la pantalla de inicio, se abre a pantalla completa y recibe notificaciones. No hace falta pasar por Google Play ni por la App Store, porque publicar allí requiere cuentas de pago (Apple: 99 €/año y un Mac). Todo lo que se usa es **gratis**.

| Pieza | Para qué | Coste |
|---|---|---|
| **GitHub Pages** | Aloja la app (la web que se instala) | Gratis |
| **GitHub Actions** | Tareas automáticas: leer la web de la liga, encuesta de los martes, notificaciones | Gratis |
| **Firebase** (Google) | Base de datos de jugadores y votos, notificaciones push | Gratis (plan Spark) |

---

## PARTE A · Montaje ✅ (ya hecho)

- Código en <https://github.com/Jowy293/aplicacion-gameover> y app publicada en **<https://jowy293.github.io/aplicacion-gameover/>**.
- Proyecto Firebase `game-over-fc`: acceso anónimo, base de datos Firestore con las reglas de [`firestore.rules`](firestore.rules) y notificaciones web.
- Configuración de la app en [`docs/firebase-config.js`](docs/firebase-config.js).
- Secreto `FIREBASE_SERVICE_ACCOUNT` y variable `APP_URL` en GitHub. Tareas automáticas en [`.github/workflows/tareas.yml`](.github/workflows/tareas.yml).
- Plantilla cargada con **JOWY #22 (Joan Brotons Vidal) como administrador**.

**Probar las notificaciones:** activa los avisos en tu móvil (pestaña Perfil) y en GitHub ve a **Actions → Tareas automáticas → Run workflow → `prueba-notificacion`**.

> Si algún día cambias de proyecto de Firebase: rellena `docs/firebase-config.js`, pega las reglas de `firestore.rules`, cambia el secreto `FIREBASE_SERVICE_ACCOUNT` y lanza la tarea **`inicializar`**.

---

## PARTE B · Instalar la app en el móvil (para todos los jugadores)

Enlace: **https://jowy293.github.io/aplicacion-gameover/**

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
- Comprueba que el secreto `FIREBASE_SERVICE_ACCOUNT` está bien puesto.
- En Perfil pulsa *Volver a registrar este móvil* y lanza `prueba-notificacion`.

**Las tareas automáticas dejan de ejecutarse.** GitHub pausa las tareas programadas si el repositorio pasa **60 días sin cambios**. Entra en *Actions → Tareas automáticas* y pulsa **Enable workflow**, o haz cualquier pequeño cambio en el repositorio de vez en cuando.

**Cambiar el escudo por uno de más calidad.** El escudo actual está recortado de la imagen de la plantilla y se ve algo pixelado. Si tienes el original, sustituye `docs/icons/logo.png` (y `icon-96/180/192/512.png`, cuadrados con fondo verde) y sube los cambios.

---

## Estructura del proyecto
```
game-over-fc/
├── docs/                   ← la app (lo que se instala en el móvil)
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
└── .github/workflows/      ← horarios automáticos
```
