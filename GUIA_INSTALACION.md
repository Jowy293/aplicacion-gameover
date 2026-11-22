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
| **Cuando el admin pone la hora del partido** | Se abre la **votación de asistencia** y llega una **notificación a todos** (en menos de 1 hora; los miércoles, 15 min). Si cambia la hora, llega otro aviso. |
| **Votación del partido** | **Voy / No voy** hasta el **miércoles a las 20:00** de esa semana (si el partido es antes, hasta que empieza). |
| **Martes 10:00** | Se abre la **encuesta del entreno del miércoles** (entreno a las 20:00), con aviso. Cierra el **miércoles a las 20:00**. |
| **Fantasy** | Se abre solo para el próximo partido y se cierra al empezar. El admin puede abrirlo, cerrarlo o desactivarlo cuando quiera. |
| **Después del partido** | El admin pone el resultado, quién fue, el quinteto inicial y los goleadores. Los puntos Fantasy, los goleadores y quién puede valorar se actualizan solos. |

> La web de la liga **bloquea las visitas automáticas**, así que los partidos, las horas y la clasificación los pone el admin desde la app.

---

## PARTE C2 · Manual del admin (todo se hace desde la app, pestaña 🛠️ Admin)

### Antes del partido
1. **Poner fecha y hora**: en la tarjeta del próximo partido → **📅 Cambiar fecha y hora** (o Admin → Partidos → 📅). Al guardar la hora se abre la votación y se avisa a todos.
2. **Partido nuevo** (otra competición, amistoso, temporada que viene): Admin → Partidos → **➕ Añadir partido**. Elige el escudo de la lista o pega un **enlace a la imagen del escudo**.
3. **Fantasy**: se abre solo. Si quieres controlarlo, ve a **Admin → Fantasy → ⚙️** en el partido:
   - 🤖 **Automático**: abierto hasta que empiece el partido.
   - 🟢 **Abierto ahora**: lo abres tú, con hora de cierre o sin ella (hasta que lo cierres). Se avisa a todos.
   - 🔒 **Cerrado**: nadie puede predecir.
   - ⛔ **Desactivado**: el partido no cuenta para la clasificación Fantasy.
   - Desde ahí también puedes **ver las predicciones**, borrar la de alguien o **borrar todas**.

### Durante / después del partido
4. **Tarjetas**: abre el partido → **🟨🟥** y pon amarillas y rojas. Se ve al momento en todos los móviles.
5. **Resultado**: abre el partido → **📝 Resultado**. En el mismo formulario:
   - Marcador.
   - **¿Quién fue al partido?**: solo esos pueden valorar y ser valorados.
   - **Quinteto inicial** en la pista (portero, cierre, alas y pívot): para los puntos Fantasy.
   - **¿Quién ha marcado?**: para los goleadores y los puntos Fantasy.

### Otras cosas
- **Puntos del Fantasy**: Admin → Fantasy → *Puntos* (goleador, titular, portero, máximo de goleadores). La clasificación se recalcula sola.
- **Clasificación de la liga**: Admin → Clasificación. Abre la web de la liga, *Seleccionar todo* → *Copiar*, pégalo y pulsa **Actualizar**.
- **Entrenos**: se crean solos los martes. Puedes crear, editar o borrar encuestas en Admin → Entrenos, y cambiar la hora o el lugar en Ajustes.
- **Jugadores**: Admin → Jugadores y permisos. Editar nombre, dorsal y nombre completo; **goles y tarjetas anteriores** (de antes de usar la app); añadir o borrar jugadores; **Liberar** un móvil; **Hacer admin / Quitar admin**. Siempre queda al menos un admin.
- **Fotos** (pestaña 📷): el fotógrafo (**GAIZKA**) o un admin entra en el partido → **📤 Subir fotos** (puede elegir muchas a la vez). Se reducen a 2048 px para que quepan gratis, y en menos de una hora llega un aviso a todos. Los jugadores ven las miniaturas, tocan la que quieran y pulsan **⬇️ Descargar** (en iPhone se abre el menú de compartir → *Guardar imagen*). El fotógrafo o un admin pueden borrar fotos (🗑️).
  - Para que otra persona pueda subir fotos: Admin → Jugadores → Editar → Posición **Fotógrafo**.
- **Multas** (Más → 💸 Multas): **➕ Poner multa** (jugador, motivo, precio, fecha y nota), **✓ Pagada** / **↩︎ Pendiente**, **Editar** o **🗑️ Quitar**. En **⚙️ Tipos y precios** cambias el precio o el nombre de cada tipo, añades o quitas tipos, y puedes aplicar los precios nuevos a las multas sin pagar. Cada jugador ve sus multas en su perfil.
- **Notificaciones** (Admin → 🔔 Avisos): ves quién tiene los avisos activados (✅/❌ y si es iPhone o Android) y quién no ha entrado aún en la app. Con **📣 Enviar** mandas una notificación de prueba (o cualquier aviso) a todos. Llega en unos 5–15 minutos, y después ves a quién le llegó (✅), a quién le falló (⚠️) y quién la abrió (👀). A quien no las tenga activadas le sale una ventana al abrir la app explicándole cómo hacerlo.
- **Hucha de la cena** (Más → 🐷 Multas): todo el dinero de las multas se suma en la hucha. El oro macizo es lo cobrado y las rayas lo que falta por cobrar. El objetivo (200 € al principio) se cambia en **⚙️ Precios y hucha**.
- **Crear partido**: botón **➕ Crear partido** en la pestaña Partidos (también en Admin → Partidos).
- **Valoraciones**: son **anónimas**. Ni el admin ve quién puso cada nota desde la app.

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

**Cambiar el escudo por uno de más calidad.** El escudo está recortado de una foto de la camiseta. Si tienes el archivo original del diseño, sustituye `docs/icons/logo.png` (y `icon-96/180/192/512.png`, cuadrados con fondo verde) y sube los cambios.

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
