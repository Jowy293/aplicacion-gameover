// =====================================================================
//  GAME OVER FC · App del equipo (PWA para Android e iOS)
// =====================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, getDocs, query, where, increment, collection, collectionGroup, onSnapshot, runTransaction, updateDoc, setDoc,
  deleteDoc, writeBatch, serverTimestamp, Timestamp, deleteField,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getMessaging, getToken, onMessage, isSupported } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

const TZ = "Europe/Madrid";
const $app = document.getElementById("app");
const $tabs = document.getElementById("tabs");
const $modal = document.getElementById("modal");

if (!self.FIREBASE_CONFIG || String(self.FIREBASE_CONFIG.apiKey).startsWith("PEGA_")) {
  $app.innerHTML = `<div class="card"><h2>Falta configurar</h2><p>Rellena <b>firebase-config.js</b> siguiendo la guía de instalación (paso 2).</p></div>`;
  throw new Error("Firebase sin configurar");
}

const fb = initializeApp(self.FIREBASE_CONFIG);
const auth = getAuth(fb);
const db = getFirestore(fb);

const S = {
  uid: null, me: null, players: new Map(), matches: [], trainings: [],
  cfg: { pollWeekday: 3, pollHour: 20, trainingTime: "20:00", trainingOpenHour: 10, trainingPlace: "", trainingAuto: true },
  loaded: {}, albums: {}, photos: new Map(), fullCache: new Map(), fines: [], fineTypes: null, clas: null, ratings: new Map(), myKeys: {}, preds: new Map(), tab: "partidos", adminTab: "partidos", unsub: [], swReg: null,
};

// ---------- utilidades ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const toDate = (t) => (t && t.toDate ? t.toDate() : t instanceof Date ? t : null);
const fmt = (d, o) => d ? new Intl.DateTimeFormat("es-ES", { timeZone: TZ, ...o }).format(d) : "";
const fmtDay = (d) => fmt(d, { weekday: "long", day: "numeric", month: "long" });
const fmtShort = (d) => fmt(d, { day: "2-digit", month: "2-digit" });
const fmtTime = (d) => fmt(d, { hour: "2-digit", minute: "2-digit" });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pad = (n) => String(n).padStart(2, "0");
const toLocalInput = (d) => d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` : "";
const toDateInput = (d) => d ? toLocalInput(d).slice(0, 10) : "";
const toTimeInput = (d) => d ? toLocalInput(d).slice(11) : "";
const slug = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2600);
}
const me = () => S.players.get(S.me);
const isAdmin = () => me()?.role === "admin";
// Staff = no juegan (entrenador y fotógrafo): no salen en valoraciones, Fantasy ni goleadores
const STAFF = ["Entrenador", "Fotógrafo"];
const isStaff = (p) => STAFF.includes(p?.position);
const isPhotographer = () => me()?.position === "Fotógrafo" || isAdmin();
const sortedPlayers = () => [...S.players.values()].sort((a, b) =>
  isStaff(a) - isStaff(b) || (a.position === "Fotógrafo") - (b.position === "Fotógrafo") || (parseInt(a.number) || 999) - (parseInt(b.number) || 999));

// Cierre de votación: día/hora configurados de la semana del partido (por defecto miércoles 20:00).
// Si el partido es antes de ese momento, la votación cierra al empezar el partido.
function computeDeadline(d) {
  if (!d) return null;
  const isoDow = (d.getDay() + 6) % 7; // lunes = 0
  const dl = new Date(d);
  dl.setDate(d.getDate() - isoDow + (Number(S.cfg.pollWeekday) - 1));
  dl.setHours(Number(S.cfg.pollHour), 0, 0, 0);
  return dl > d ? new Date(d) : dl;
}
function countdown(dl) {
  if (!dl) return "";
  const ms = dl - Date.now();
  if (ms <= 0) return "🔒 Votación cerrada";
  const h = Math.floor(ms / 36e5), d = Math.floor(h / 24), m = Math.floor((ms % 36e5) / 6e4);
  return `⏳ Cierra ${cap(fmtDay(dl))} a las ${fmtTime(dl)} · quedan ${d ? d + "d " : ""}${h % 24}h ${m}m`;
}

// ---------- camiseta SVG (la equipación del equipo) ----------
let jid = 0;
function jersey(p, { size = 200 } = {}) {
  const id = "j" + (++jid);
  const coach = isStaff(p);
  const name = String(p.name || "").toUpperCase();
  const num = String(p.number ?? "");
  const nameSize = Math.min(26, 170 / Math.max(4, name.length * 0.56));
  const numSize = num.length > 2 ? 64 : 92;
  const shirt = "M62 12 L38 20 L4 52 L24 88 L44 76 L44 214 L156 214 L156 76 L176 88 L196 52 L162 20 L138 12 Q100 34 62 12 Z";
  const ink = coach ? "#fff" : "#111";
  return `<svg class="jersey" viewBox="0 0 200 222" width="${size}" role="img" aria-label="Camiseta ${esc(name)} ${esc(num)}">
  <defs>
    <clipPath id="${id}c"><path d="${shirt}"/></clipPath>
    <pattern id="${id}p" width="16" height="16" patternUnits="userSpaceOnUse">
      <rect width="16" height="16" fill="#a3164f"/>
      <path d="M8 1 L15 8 L8 15 L1 8 Z" fill="none" stroke="#e0337a" stroke-width="1.6"/>
      <circle cx="8" cy="8" r="2" fill="#5e0b2e"/>
    </pattern>
  </defs>
  <g clip-path="url(#${id}c)">
    ${coach ? `
      <rect width="200" height="222" fill="#141414"/>
      <rect x="0" y="0" width="200" height="222" fill="url(#${id}p)" opacity=".18"/>
      <path d="M62 12 Q100 34 138 12" stroke="#d4af37" stroke-width="7" fill="none"/>
      <path d="M4 52 L24 88" stroke="#d4af37" stroke-width="7"/><path d="M196 52 L176 88" stroke="#d4af37" stroke-width="7"/>`
    : `
      <rect width="200" height="222" fill="#f7f5f2"/>
      <rect x="78" y="0" width="44" height="222" fill="url(#${id}p)"/>
      <rect x="44" y="0" width="12" height="222" fill="url(#${id}p)"/>
      <rect x="144" y="0" width="12" height="222" fill="url(#${id}p)"/>
      <path d="M0 0 L44 0 L44 80 L0 80 Z" fill="url(#${id}p)"/><path d="M156 0 L200 0 L200 80 L156 80 Z" fill="url(#${id}p)"/>
      <path d="M62 12 Q100 34 138 12" stroke="#6e0f36" stroke-width="6" fill="none"/>`}
  </g>
  <path d="${shirt}" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="2"/>
  <text x="100" y="72" text-anchor="middle" font-family="Bebas Neue, Impact, sans-serif" font-size="${nameSize}" fill="${ink}"
    stroke="${coach ? "none" : "#fff"}" stroke-width="3" paint-order="stroke">${esc(name)}</text>
  <text x="100" y="${coach ? 160 : 168}" text-anchor="middle" font-family="Bebas Neue, Impact, sans-serif" font-size="${numSize}" fill="${ink}"
    stroke="${coach ? "none" : "#fff"}" stroke-width="5" paint-order="stroke">${esc(num)}</text>
  ${coach ? `<text x="100" y="192" text-anchor="middle" font-family="Bebas Neue, sans-serif" font-size="16" fill="#d4af37">${p.position === "Fotógrafo" ? "FOTÓGRAFO" : "ENTRENADOR"}</text>` : ""}
</svg>`;
}

// ---------- arranque ----------
onAuthStateChanged(auth, async (user) => {
  if (!user) { signInAnonymously(auth).catch((e) => fatal("No se pudo conectar: " + e.message)); return; }
  S.uid = user.uid;
  registerSW();
  try {
    const u = await getDoc(doc(db, "users", S.uid));
    if (u.exists()) S.me = u.data().playerId;
  } catch (e) { return fatal(e.message); }
  S.unsub.push(onSnapshot(collection(db, "players"), (snap) => {
    S.players = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
    S.loaded.players = true;
    if (!S.players.size) $app.innerHTML = `<div class="card empty">Todavía no hay jugadores. El administrador debe ejecutar el paso “Inicializar” de la guía.</div>`;
    route();
  }, (e) => fatal(e.message)));
});

function fatal(msg) { $app.innerHTML = `<div class="card"><h3>Error</h3><p class="muted">${esc(msg)}</p></div>`; }

let started = false;
function route() {
  if (!S.players.size) return;
  if (S.me && !S.players.get(S.me)) S.me = null; // el admin ha borrado el jugador
  const mine = S.me && S.players.get(S.me);
  if (mine && mine.uid === S.uid) S.justClaimed = null; // el servidor ya confirma la elección
  // el admin ha liberado el usuario (se ignora el instante en que la elección aún no ha llegado del servidor)
  if (mine && mine.uid !== S.uid && !(S.justClaimed === S.me && !mine.uid)) S.me = null;
  if (!S.me) { started = false; $tabs.classList.add("hidden"); renderPick(); return; }
  if (!started) { started = true; startMain(); }
  render();
}

async function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  try { S.swReg = await navigator.serviceWorker.register("./sw.js"); } catch (e) { console.warn(e); }
  // Actualización automática: al volver a la app se busca versión nueva y, si la hay, se recarga sola
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading || $modal.open || S.uploading) return; // no cortar si se está rellenando algo o subiendo fotos
    reloading = true; location.reload();
  });
  const check = () => S.swReg?.update().catch(() => {});
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
  setInterval(check, 30 * 60 * 1000);
}

// ---------- selección de usuario ----------
function renderPick() {
  const list = sortedPlayers();
  $app.innerHTML = `
    <div class="section-title"><h2>¿Quién eres?</h2></div>
    <p class="muted small">Elige tu camiseta. <b>Solo se puede elegir una vez</b>: después nadie más podrá usar tu usuario.</p>
    <div class="pick-grid">
      ${list.map((p) => `
        <div class="pick ${p.uid ? "taken" : ""}" data-act="pick" data-id="${p.id}">
          ${p.uid ? `<span class="lock">🔒 Ocupado</span>` : ""}
          ${jersey(p)}
          <div class="lbl">${esc(p.fullName || p.name)}</div>
        </div>`).join("")}
    </div>`;
}

async function claim(pid) {
  const p = S.players.get(pid);
  if (!p || p.uid) return toast("Ese jugador ya está elegido");
  const ok = await confirmBox(`¿Eres <b>${esc(p.name)}</b> (#${esc(p.number)})?`, "Esta elección es definitiva en este móvil. Solo un administrador puede cambiarla.");
  if (!ok) return;
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, "players", pid);
      const snap = await tx.get(ref);
      if (!snap.exists() || snap.data().uid) throw new Error("taken");
      tx.update(ref, { uid: S.uid, claimedAt: serverTimestamp() });
      tx.set(doc(db, "users", S.uid), { playerId: pid, createdAt: serverTimestamp() });
    });
    S.me = pid;
    S.justClaimed = pid;
    const local = S.players.get(pid);
    if (local) local.uid = S.uid; // actualizar ya la copia local, sin esperar al servidor
    S.tab = "partidos";
    window.scrollTo(0, 0);
    toast(`¡Bienvenido, ${p.name}! ⚽`);
    route();
  } catch (e) {
    toast(e.message === "taken" ? "Alguien ya ha elegido ese jugador" : "No se pudo guardar: " + e.message);
  }
}

// ---------- pantalla principal ----------
function startMain() {
  S.unsub.push(onSnapshot(collection(db, "matches"), (s) => {
    S.matches = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) =>
      ((toDate(a.date)?.getTime() ?? 9e15) - (toDate(b.date)?.getTime() ?? 9e15)) || ((a.jornada ?? 999) - (b.jornada ?? 999)));
    S.loaded.matches = true;
    if ($modal.open) refreshMatchModal();
    render();
  }));
  S.unsub.push(onSnapshot(collection(db, "trainings"), (s) => {
    S.trainings = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (toDate(b.date) ?? 0) - (toDate(a.date) ?? 0));
    render();
  }));
  S.unsub.push(onSnapshot(doc(db, "config", "app"), (s) => { if (s.exists()) Object.assign(S.cfg, s.data()); render(); }));
  S.unsub.push(onSnapshot(doc(db, "config", "clasificacion"), (s) => { S.clas = s.exists() ? s.data() : null; render(); }));
  // Valoraciones ANÓNIMAS: matches/{partido}/ratings/{código aleatorio}. Solo mi móvil sabe cuál es mi código
  // (users/{uid}.ratingKeys, que solo puede leer el propio usuario).
  S.unsub.push(onSnapshot(doc(db, "users", S.uid), (s) => { S.myKeys = s.data()?.ratingKeys || {}; render(); refreshMatchModal(); }));
  S.unsub.push(onSnapshot(collectionGroup(db, "ratings"), (snap) => {
    const map = new Map();
    for (const d of snap.docs) {
      const mid = d.ref.parent.parent.id;
      if (!map.has(mid)) map.set(mid, []);
      map.get(mid).push({ key: d.id, ...d.data() });
    }
    S.ratings = map;
    render(); refreshMatchModal();
  }, (e) => console.warn("valoraciones:", e.message)));
  // Fotos: albums/{partido} = { count, cover, updatedAt } (las fotos se cargan al abrir el álbum)
  S.unsub.push(onSnapshot(collection(db, "albums"), (snap) => {
    S.albums = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
    for (const id of S.photos.keys()) if ((S.albums[id]?.count || 0) !== S.photos.get(id).length) S.photos.delete(id); // recargar si cambió
    if (S.tab === "fotos" && S.albumOpen && !S.photos.has(S.albumOpen)) loadAlbum(S.albumOpen);
    render();
  }, (e) => console.warn("fotos:", e.message)));
  // Multas
  S.unsub.push(onSnapshot(collection(db, "fines"), (snap) => {
    S.fines = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (toDate(b.date) ?? 0) - (toDate(a.date) ?? 0));
    render();
  }, (e) => console.warn("multas:", e.message)));
  S.unsub.push(onSnapshot(doc(db, "config", "fines"), (d) => { S.fineTypes = d.exists() ? d.data().types || [] : null; S.fineGoal = d.exists() ? d.data().goal : null; render(); }));
  // Fantasy: matches/{partido}/predictions/{jugador}
  S.unsub.push(onSnapshot(collectionGroup(db, "predictions"), (snap) => {
    const map = new Map();
    for (const d of snap.docs) {
      const mid = d.ref.parent.parent.id;
      if (!map.has(mid)) map.set(mid, new Map());
      map.get(mid).set(d.id, d.data());
    }
    S.preds = map;
    render();
  }, (e) => console.warn("fantasy:", e.message)));
  setupForegroundPush();
  setTimeout(() => notifPrompt(), 1500);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") setTimeout(() => notifPrompt(), 800); });
  const ack = new URLSearchParams(location.search).get("ack");
  if (ack) {
    updateDoc(doc(db, "pushRequests", ack), { [`acks.${S.me}`]: serverTimestamp() }).catch(() => {});
    history.replaceState(null, "", location.pathname);
  }
  if (isAdmin()) {
    S.unsub.push(onSnapshot(collection(db, "tokens"), (snap) => { S.tokens = Object.fromEntries(snap.docs.map((d) => [d.data().playerId, d.data()])); render(); }, () => {}));
    S.unsub.push(onSnapshot(collection(db, "pushRequests"), (snap) => {
      S.pushReqs = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (toDate(b.createdAt) ?? new Date()) - (toDate(a.createdAt) ?? new Date()));
      render();
    }, () => {}));
  }
  clearInterval(S._tick); S._tick = setInterval(() => { if (!["admin"].includes(S.tab)) render(); }, 30000);
}

function renderTabs() {
  const tabs = [["partidos", "⚽", "Partidos"], ["entrenos", "🏃", "Entrenos"], ["fantasy", "🎯", "Fantasy"], ["fotos", "📷", "Fotos"], ["clasif", "🏆", "Clasif."], ["mas", "☰", "Más"]];
  const inMore = ["mas", "perfil", "multas", "admin"].includes(S.tab);
  $tabs.classList.remove("hidden");
  morph($tabs, tabs.map(([k, ic, l]) => `<button class="${S.tab === k || (k === "mas" && inMore) ? "on" : ""}" data-act="tab" data-tab="${k}"><span class="ic">${ic}</span>${l}</button>`).join(""));
}

// ---------- pintado sin saltos ----------
// En vez de rehacer toda la pantalla, se compara con la anterior y solo se cambia lo que ha cambiado
// (así no parpadean las imágenes, no salta el scroll y no se cierran los desplegables).
function morph(el, html) {
  const tpl = document.createElement("div");
  tpl.innerHTML = html;
  patchChildren(el, tpl);
}
const nodeKey = (n) => n.nodeType === 1 ? (n.getAttribute("data-id") || "") + "|" + (n.getAttribute("data-act") || "") + "|" + (n.getAttribute("data-form") || "") : "";
function patchChildren(a, b) {
  const an = [...a.childNodes], bn = [...b.childNodes];
  bn.forEach((y, i) => {
    const x = an[i];
    if (!x) a.appendChild(y);
    else if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName || nodeKey(x) !== nodeKey(y)) a.replaceChild(y, x);
    else if (x.nodeType !== 1) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; }
    else {
      for (const { name, value } of [...y.attributes]) if (x.getAttribute(name) !== value) x.setAttribute(name, value);
      for (const { name } of [...x.attributes]) if (!y.hasAttribute(name) && !(name === "open" && x.nodeName === "DETAILS")) x.removeAttribute(name);
      if (x === document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(x.nodeName)) return; // no tocar lo que se está escribiendo
      patchChildren(x, y);
    }
  });
  for (let i = bn.length; i < an.length; i++) a.removeChild(an[i]);
}
let renderQueued = false;
function render() {
  if (renderQueued) return;
  renderQueued = true;
  setTimeout(() => { renderQueued = false; paint(); }, 25); // agrupa varias actualizaciones seguidas en un solo pintado
}
function paint() {
  if (!S.me) return;
  if (S.tab === "admin" && !isAdmin()) S.tab = "partidos";
  renderTabs();
  const views = { partidos: viewMatches, entrenos: viewTrainings, fantasy: viewFantasy, fotos: viewPhotos, clasif: viewClas, mas: viewMore, perfil: viewProfile, multas: viewFines, admin: viewAdmin };
  const ready = S.loaded.matches && S.loaded.players;
  morph($app, ready ? views[S.tab]() : `<div class="loading"><div class="ball"></div>Cargando…</div>`);
}

function notifBanner() {
  const st = notifState();
  if (st === "on" || st === "unsupported") return "";
  return `<div class="banner">${st === "denied" ? "🔕 Tienes las notificaciones bloqueadas." : st === "ios-install" ? "📲 Instala la app para recibir avisos." : "🔔 Activa los avisos para no perderte nada."}<button class="btn sm primary" data-act="${st === "off" ? "notif" : "notif-help"}">${st === "off" ? "Activar" : "Cómo"}</button></div>`;
}

// ----- votación (común a partidos y entrenos) -----
function pollBlock(kind, item) {
  const dl = toDate(item.pollDeadline);
  const votes = item.votes || {};
  const open = dl && dl > new Date();
  const mine = votes[S.me];
  const players = sortedPlayers().filter((p) => p.position !== "Fotógrafo");
  const yes = players.filter((p) => votes[p.id] === "si");
  const no = players.filter((p) => votes[p.id] === "no");
  const none = players.filter((p) => !votes[p.id]);
  const total = yes.length + no.length || 1;
  const names = (arr) => arr.map((p) => `<span>${p.id === S.me ? "<b>" : ""}${esc(p.name)}${p.id === S.me ? "</b>" : ""}</span>`).join("") || `<span class="muted">—</span>`;
  return `<div class="poll">
    <div class="bebas" style="font-size:20px">${kind === "match" ? "¿Vas al partido?" : "¿Vienes al entreno?"}</div>
    <div class="btns">
      <button class="btn yes ${mine === "si" ? "sel" : ""}" data-act="vote" data-kind="${kind}" data-id="${item.id}" data-v="si" ${open ? "" : "disabled"}>✅ Voy</button>
      <button class="btn no ${mine === "no" ? "sel" : ""}" data-act="vote" data-kind="${kind}" data-id="${item.id}" data-v="no" ${open ? "" : "disabled"}>❌ No voy</button>
    </div>
    <div class="bar"><div class="y" style="width:${(yes.length / total) * 100}%"></div><div class="n" style="width:${(no.length / total) * 100}%"></div></div>
    <div class="who">
      <div class="col"><b style="color:var(--ok)">Van (${yes.length})</b>${names(yes)}</div>
      <div class="col"><b style="color:var(--ko)">No van (${no.length})</b>${names(no)}</div>
      <div class="col"><b class="muted">Sin votar (${none.length})</b>${names(none)}</div>
    </div>
    <p class="countdown">${countdown(dl)}</p>
  </div>`;
}

async function vote(kind, id, v) {
  const col = kind === "match" ? "matches" : "trainings";
  const item = (kind === "match" ? S.matches : S.trainings).find((x) => x.id === id);
  if (!item || !(toDate(item.pollDeadline) > new Date())) return toast("La votación está cerrada");
  try {
    await updateDoc(doc(db, col, id), { [`votes.${S.me}`]: v });
    toast(v === "si" ? "¡Apuntado! 💪" : "Anotado, ¡otra vez será!");
  } catch (e) { toast("No se pudo votar: " + e.message); }
}

// ----- partidos -----
const resultOf = (m) => {
  if (m.golesGO == null || m.golesRival == null || m.golesGO === "" || m.golesRival === "") return null;
  const a = +m.golesGO, b = +m.golesRival;
  return a > b ? "W" : a < b ? "L" : "D";
};
const teams = (m) => m.isHome !== false ? ["GAME OVER FC", m.rival] : [m.rival, "GAME OVER FC"];
const GO_CREST = "crests/game-over-fc.png?v=4";
const CRESTS = {
  "atletico-salesiano": "Atlético Salesiano", "bar-ferrocarril-fs": "Bar Ferrocarril FS", "birrarreal-fs": "Birrarreal FS",
  "buena-onda-fs-b": 'Buena Onda FS "B"', "cd-santa-rosa-copisan": "C.D. Santa Rosa Copisan", "colpet-fs": "Colpet FS",
  "dkv-brownsea-fs": "DKV-Brownsea FS", "fc-racing-alcoy": "FC Racing Alcoy", "la-cuina-de-jairo": "La Cuina de Jairo",
  "pd-juan-xxiii-b": "PD Juan XXIII B", "sercomac-fc": "Sercomac FC", "tex-textiles-fs": "Tex-Textiles FS",
};
const crestImg = (src, cls = "") => src
  ? `<img class="crest-img ${cls}" src="${esc(src)}" alt="" loading="lazy">`
  : `<span class="crest-img ph ${cls}">⚽</span>`;
const crests = (m) => m.isHome !== false ? [GO_CREST, m.crest] : [m.crest, GO_CREST];
const score = (m) => resultOf(m) ? (m.isHome !== false ? `${m.golesGO} - ${m.golesRival}` : `${m.golesRival} - ${m.golesGO}`) : "vs";

// ----- goleadores -----
const goalsOf = (m) => Object.entries(m.goals || {}).filter(([, n]) => n > 0);
function scorersLine(m) {
  const g = goalsOf(m).sort((a, b) => b[1] - a[1]);
  if (!g.length) return "";
  return `<div class="scorers">⚽ ${g.map(([pid, n]) => `${esc(pname(pid))}${n > 1 ? ` <b>×${n}</b>` : ""}`).join(" · ")}</div>`;
}
// Clasificación de goleadores de la temporada
function scorersTable() {
  const out = {};
  for (const m of S.matches) for (const [pid, n] of goalsOf(m)) {
    (out[pid] ||= { goals: 0, matches: 0, base: 0 }); out[pid].goals += n; out[pid].matches++;
  }
  for (const p of S.players.values()) if (+p.goalsBase > 0) {
    (out[p.id] ||= { goals: 0, matches: 0, base: 0 }); out[p.id].goals += +p.goalsBase; out[p.id].base = +p.goalsBase;
  }
  return Object.entries(out).filter(([pid]) => S.players.has(pid))
    .sort((a, b) => b[1].goals - a[1].goals || a[1].matches - b[1].matches);
}
function viewScorers() {
  const t = scorersTable();
  const total = S.matches.reduce((a, m) => a + (+m.golesGO || 0), 0);
  const assigned = t.reduce((a, [, v]) => a + v.goals, 0);
  if (!t.length) return `<div class="card empty">⚽ Todavía no hay goles apuntados.${isAdmin() ? "<br>Apúntalos al poner el resultado de cada partido (📝 Resultado y goleadores)." : ""}</div>`;
  const podium = t.slice(0, 3);
  return `<div class="card podium">${[1, 0, 2].filter((i) => podium[i]).map((i) => {
      const [pid, v] = podium[i]; const p = S.players.get(pid);
      return `<div class="pod p${i + 1}" data-act="player" data-id="${pid}">${jersey(p)}<div class="medal">${["🥇", "🥈", "🥉"][i]}</div><div class="pg">${v.goals}</div><div class="small muted">${v.goals === 1 ? "gol" : "goles"}</div></div>`;
    }).join("")}</div>
    <div class="card" style="padding:4px 12px">
      ${t.map(([pid, v], i) => `<div class="rate-row flat ${pid === S.me ? "meRow" : ""}" data-act="player" data-id="${pid}"><span class="rk">${["🥇", "🥈", "🥉"][i] || i + 1}</span>
        <span class="nm">${esc(pname(pid))} <span class="muted small">#${esc(S.players.get(pid)?.number ?? "")}</span></span>
        <span class="muted small">${v.matches ? `${v.matches} ${v.matches === 1 ? "partido" : "partidos"}` : ""}</span><span class="avg hi">${v.goals}</span></div>`).join("")}
    </div>
    <p class="muted small" style="text-align:center">${assigned} de ${total} goles del equipo apuntados</p>`;
}
function scorersInputs(m) {
  const list = sortedPlayers().filter((p) => !isStaff(p))
    .sort((a, b) => (m.votes?.[b.id] === "si") - (m.votes?.[a.id] === "si"));
  return `<div class="bebas" style="font-size:20px;margin-top:14px">⚽ ¿Quién ha marcado?</div>
    ${list.map((p) => `<div class="goal-edit"><span><b>${esc(p.name)}</b> <span class="muted small">#${esc(p.number)}</span>${m.votes?.[p.id] === "si" ? ` <span class="tag ok">fue</span>` : ""}</span>
      <span class="stepper"><button type="button" class="btn sm" data-act="g-minus">−</button><input type="number" name="g_${p.id}" min="0" max="30" value="${m.goals?.[p.id] || 0}"><button type="button" class="btn sm" data-act="g-plus">+</button></span></div>`).join("")}
    <p class="muted small" id="gsum"></p>`;
}
function goalsForm(mid) {
  const m = S.matches.find((x) => x.id === mid);
  openModal(`<form data-form="goals" data-id="${mid}">
    <h3>📝 Resultado · ${m.isHome !== false ? "vs" : "@"} ${esc(m.rival)}</h3>
    <div class="row2"><div><label>Goles Game Over</label><input type="number" min="0" name="golesGO" value="${esc(m.golesGO ?? "")}"></div>
      <div><label>Goles ${esc(m.rival)}</label><input type="number" min="0" name="golesRival" value="${esc(m.golesRival ?? "")}"></div></div>
    ${lineupInputs(m)}
    ${scorersInputs(m)}
    <div class="acts"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
  </form>`);
  drawCourt();
  updateGoalSum();
}
function updateGoalSum() {
  const f = $modal.querySelector("form"); const el = f?.querySelector("#gsum"); if (!el) return;
  const sum = [...f.querySelectorAll('input[name^="g_"]')].reduce((a, i) => a + (+i.value || 0), 0);
  const go = f.querySelector('input[name="golesGO"]');
  const exp = go && go.value !== "" ? +go.value : null;
  el.textContent = `Goles apuntados: ${sum}${exp != null ? ` de ${exp}` : ""}${exp != null && sum > exp ? " ⚠️ hay más goles que en el marcador" : ""}`;
}
const readGoals = (form) => {
  const goals = {};
  for (const [k, v] of new FormData(form).entries()) if (k.startsWith("g_") && +v > 0) goals[k.slice(2)] = Math.min(30, Math.floor(+v));
  return goals;
};
async function saveGoals(form) {
  const f = Object.fromEntries(new FormData(form));
  await updateDoc(doc(db, "matches", form.dataset.id), {
    golesGO: f.golesGO === "" ? null : +f.golesGO, golesRival: f.golesRival === "" ? null : +f.golesRival,
    goals: readGoals(form), lineup: readLineup(), votes: readAttendance(form, S.matches.find((x) => x.id === form.dataset.id)), updatedAt: serverTimestamp(),
  });
  toast("Resultado, asistentes, alineación y goleadores guardados ⚽");
}

function nextMatch() {
  const now = Date.now();
  return S.matches.find((m) => !resultOf(m) && (!toDate(m.date) || toDate(m.date).getTime() > now - 3 * 36e5));
}

function matchCard(m, hero) {
  const d = toDate(m.date);
  const [h, a] = teams(m);
  const [ch, ca] = crests(m);
  const r = resultOf(m);
  return `<div class="card ${hero ? "hero" : ""}">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span class="tag ${hero ? "gold" : ""}">${hero ? "PRÓXIMO PARTIDO" : "PARTIDO"}${m.jornada ? " · JORNADA " + m.jornada : ""}</span>
      <span class="tag">${m.isHome !== false ? "🏠 Local" : "🚌 Visitante"}</span>
    </div>
    <div class="vs">
      <div class="team ${m.isHome !== false ? "go" : ""}">${crestImg(ch, "lg")}${esc(h)}</div>
      <div class="score ${r ? "res " + r : ""}">${score(m)}</div>
      <div class="team ${m.isHome === false ? "go" : ""}">${crestImg(ca, "lg")}${esc(a)}</div>
    </div>
    ${scorersLine(m)}
    ${cardsLine(m)}
    <div class="when">
      ${d ? `<div class="big">${cap(fmtDay(d))}</div>${m.timeKnown ? `<div>🕘 ${fmtTime(d)} h</div>` : `<div class="muted">Hora pendiente de publicar</div>`}` : `<div class="muted">Fecha por confirmar</div>`}
      ${m.venue ? `<div class="muted small">📍 ${esc(m.venue)}</div>` : ""}
      ${isAdmin() ? `<button class="btn sm" style="margin-top:10px" data-act="date-edit" data-id="${m.id}">📅 Cambiar fecha y hora</button>${matchStarted(m) ? ` <button class="btn sm wine" style="margin-top:10px" data-act="goals" data-id="${m.id}">📝 Resultado</button>` : ""}` : ""}
    </div>
    ${m.pollDeadline ? pollBlock("match", m) : (!r ? `<p class="countdown">La votación de asistencia se abrirá cuando se publique la hora del partido.</p>` : "")}
  </div>`;
}

function viewMatches() {
  const nx = nextMatch();
  const played = S.matches.filter(resultOf);
  const W = played.filter((m) => resultOf(m) === "W").length, D = played.filter((m) => resultOf(m) === "D").length, L = played.length - W - D;
  const lp = lastPlayed();
  const lpRated = lp && !!myRating(lp.id);
  return `${notifBanner()}
    ${lp && !lpRated && wentTo(lp, S.me) ? `<div class="banner">⭐ ¿Qué tal fue contra ${esc(lp.rival)}? Valora a tus compañeros.<button class="btn sm primary" data-act="rate" data-id="${lp.id}">Valorar</button></div>` : ""}
    ${nx ? matchCard(nx, true) : `<div class="card empty">No hay partidos pendientes ahora mismo.</div>`}
    <div class="section-title"><h2>Temporada 26/27</h2><span class="muted small">${W}V · ${D}E · ${L}D</span></div>
    ${isAdmin() ? `<button class="btn primary block" style="margin-bottom:10px" data-act="match-edit">➕ Crear partido</button>` : ""}
    <div class="card" style="padding:4px 12px">
      ${S.matches.length ? S.matches.map((m) => {
        const d = toDate(m.date), r = resultOf(m);
        return `<div class="match-row" data-act="match" data-id="${m.id}">
          <div class="j">${d ? fmtShort(d) : "–"}<small>${m.jornada ? "J" + m.jornada : d ? fmt(d, { weekday: "short" }) : ""}</small></div>
          <div class="t"><span class="rowteam">${crestImg(m.crest)}<span>${m.isHome !== false ? "vs " : "@ "}${esc(m.rival)}</span></span><small>${d && m.timeKnown ? fmtTime(d) + " h" : d ? (resultOf(m) ? "" : "Hora por publicar") : ""}${m.venue ? " · " + esc(m.venue) : ""}</small></div>
          <div class="res ${r || ""}">${r ? `${m.golesGO}-${m.golesRival}` : m.id === nx?.id ? "Próx." : "—"}${(S.ratings.get(m.id) || []).length ? `<small class="star">⭐ ${(S.ratings.get(m.id) || []).length}</small>` : ""}</div>
        </div>`;
      }).join("") : `<div class="empty">Aún no hay partidos.</div>`}
    </div>
    <p class="muted small" style="text-align:center">Datos de <a href="${esc(S.cfg.leagueUrl || "https://ligacomarcal.com")}" target="_blank" rel="noopener">ligacomarcal.com</a>${S.clas?.updatedAt ? " · actualizado " + fmt(toDate(S.clas.updatedAt), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}</p>`;
}

// ----- entrenos -----
function viewTrainings() {
  const now = new Date();
  const current = S.trainings.filter((t) => toDate(t.pollDeadline) > now || toDate(t.date) > new Date(now - 36e5 * 6));
  const past = S.trainings.filter((t) => !current.includes(t)).slice(0, 10);
  const card = (t) => {
    const d = toDate(t.date);
    return `<div class="card ${toDate(t.pollDeadline) > now ? "hero" : ""}">
      <span class="tag wine">ENTRENO</span>
      <div class="when" style="margin-top:10px"><div class="big">${d ? cap(fmtDay(d)) : ""}</div>
      ${t.time ? `<div>🕘 ${esc(t.time)} h</div>` : ""}${t.place ? `<div class="muted small">📍 ${esc(t.place)}</div>` : ""}
      ${t.note ? `<div class="small" style="margin-top:6px">${esc(t.note)}</div>` : ""}</div>
      ${pollBlock("training", t)}
    </div>`;
  };
  return `${notifBanner()}
    <div class="section-title"><h2>Entrenos</h2></div>
    ${current.length ? current.map(card).join("") : `<div class="card empty">La encuesta del entreno se abre el martes a las ${S.cfg.trainingOpenHour ?? 10}:00 y se cierra el miércoles a las ${S.cfg.trainingDeadlineHour ?? 14}:00. 💪</div>`}
    ${past.length ? `<div class="section-title"><h3>Anteriores</h3></div><div class="card" style="padding:4px 12px">${past.map((t) => {
      const y = Object.values(t.votes || {}).filter((v) => v === "si").length;
      return `<div class="admin-item"><span>${cap(fmtDay(toDate(t.date)))}</span><span class="tag ok">${y} fueron</span></div>`;
    }).join("")}</div>` : ""}`;
}

// ----- clasificación -----
const LEAGUE_URL = "https://ligacomarcal.com/competicion/lc-cuarta-division-26-27-mtizb4nd/clasificacion";
const leagueUrl = () => S.cfg.leagueUrl || LEAGUE_URL;
const teamCrest = (name) => {
  const k = slug(String(name).replace(/\./g, ""));
  return k === "game-over-fc" ? GO_CREST : CRESTS[k] ? `crests/${k}.png` : null;
};
// Lee el texto copiado de la clasificación de ligacomarcal.com
function parseStandings(text) {
  const re = /(?:^|\s)(\d{1,2})\s+(.+?)\s+(\d{1,3})\s+PTS\s+PJ\s*(\d+)\s+G\s*(\d+)\s+E\s*(\d+)\s+P\s*(\d+)\s+DG\s*([+\-−]?\d+)((?:\s+[GEP](?=\s|$))*)/g;
  const out = [];
  for (const m of text.matchAll(re)) {
    out.push({ pos: +m[1], name: m[2].replace(/\s+/g, " ").trim(), pts: +m[3], pj: +m[4], g: +m[5], e: +m[6], p: +m[7],
      dg: +m[8].replace("−", "-"), form: m[9].replace(/\s+/g, "") });
  }
  return out;
}
function viewClas() {
  const ct = S.clasTab || "liga";
  const toggle = `<div class="subtabs" style="margin-top:4px">${[["liga", "🏆 Liga"], ["goles", "⚽ Goleadores"], ["tarjetas", "🟨 Tarjetas"]].map(([k, l]) => `<button class="btn sm ${ct === k ? "on" : ""}" data-act="ctab" data-tab="${k}">${l}</button>`).join("")}</div>`;
  if (ct === "tarjetas") return `<div class="section-title"><h2>Tarjetas</h2><span class="muted small">Game Over FC 26/27</span></div>${toggle}${viewCards()}`;
  if (S.clasTab === "goles") return `<div class="section-title"><h2>Goleadores</h2><span class="muted small">Game Over FC 26/27</span></div>${toggle}${viewScorers()}`;
  return toggle.replace('style="margin-top:4px"', 'style="margin-top:16px"') + viewClasLiga();
}
function viewClasLiga() {
  const c = S.clas;
  const link = `<a class="btn block" style="display:block;text-align:center;text-decoration:none;margin-top:4px" href="${esc(leagueUrl())}" target="_blank" rel="noopener">🌐 Ver en ligacomarcal.com</a>`;
  if (!c || !(c.teams?.length || c.rows?.length)) return `<div class="section-title"><h2>Clasificación</h2></div><div class="card empty">Todavía no hay clasificación cargada.</div>${link}`;
  if (!c.teams) { // formato antiguo
    return `<div class="section-title"><h2>Clasificación</h2></div><div class="card tbl-wrap"><table class="clas">
      ${(c.headers || []).length ? `<tr>${c.headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>` : ""}
      ${c.rows.map((r) => `<tr class="${r.join(" ").toUpperCase().includes("GAME OVER") ? "me" : ""}">${r.map((x) => `<td>${esc(x)}</td>`).join("")}</tr>`).join("")}
    </table></div>${link}`;
  }
  const upd = toDate(c.updatedAt);
  return `<div class="section-title"><h2>Clasificación</h2><span class="muted small">Cuarta División 26/27</span></div>
    <div class="card" style="padding:6px 8px"><table class="clas">
      <tr><th>#</th><th>Equipo</th><th class="n">PJ</th><th class="n">DG</th><th class="n">PTS</th></tr>
      ${c.teams.map((t) => `<tr class="${/game\s*over/i.test(t.name) ? "me" : ""}">
        <td class="pos">${t.pos}</td>
        <td><div class="rowteam">${crestImg(teamCrest(t.name))}<div><div class="tname">${esc(t.name)}</div>
          <div class="form">${[...(t.form || "")].map((x) => `<i class="f${x}">${x}</i>`).join("")}<span class="muted"> ${t.g}G ${t.e}E ${t.p}P</span></div></div></div></td>
        <td class="n">${t.pj}</td><td class="n">${t.dg > 0 ? "+" : ""}${t.dg}</td><td class="n pts">${t.pts}</td></tr>`).join("")}
    </table></div>
    ${upd ? `<p class="muted small" style="text-align:center">Actualizada ${fmt(upd, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>` : ""}
    ${link}`;
}

// ----- valoraciones (anónimas) -----
const myRating = (mid) => S.myKeys[mid] && (S.ratings.get(mid) || []).find((x) => x.key === S.myKeys[mid]);
const fmtAvg = (x) => x == null ? "–" : x.toFixed(1).replace(".", ",");
const matchStarted = (m) => !!resultOf(m) || (toDate(m.date) && toDate(m.date).getTime() <= Date.now());
// Medias de un partido: { playerId: { avg, n, comments: [{ by, text }] } }
function matchRatings(mid) {
  const out = {};
  for (const r of S.ratings.get(mid) || []) {
    for (const [pid, v] of Object.entries(r.scores || {})) {
      if (!(v >= 1 && v <= 10)) continue;
      (out[pid] ||= { sum: 0, n: 0, comments: [] }); out[pid].sum += v; out[pid].n++;
    }
    for (const [pid, t] of Object.entries(r.comments || {})) {
      if (!String(t).trim()) continue;
      (out[pid] ||= { sum: 0, n: 0, comments: [] }); out[pid].comments.push({ text: t, score: r.scores?.[pid] });
    }
  }
  for (const k in out) out[k].avg = out[k].n ? out[k].sum / out[k].n : null;
  return out;
}
// Media de temporada de cada jugador (media de todas sus notas en todos los partidos)
function seasonRatings() {
  const ids = new Set(S.matches.map((m) => m.id));
  const out = {};
  for (const [mid, list] of S.ratings) {
    if (!ids.has(mid)) continue;
    for (const r of list) for (const [pid, v] of Object.entries(r.scores || {})) {
      if (!(v >= 1 && v <= 10)) continue;
      (out[pid] ||= { sum: 0, n: 0, matches: new Set() }); out[pid].sum += v; out[pid].n++; out[pid].matches.add(mid);
    }
  }
  for (const k in out) out[k].avg = out[k].sum / out[k].n;
  return out;
}
// Jugadores a valorar: los que dijeron "Voy" (si nadie votó, toda la plantilla)
// Solo valoran los que fueron al partido y solo se valora a los que jugaron (fueron)
const wentTo = (m, pid) => m.votes?.[pid] === "si";
function ratablePlayers(m) {
  return sortedPlayers().filter((p) => !isStaff(p) && p.id !== S.me && wentTo(m, p.id));
}
const pname = (id) => S.players.get(id)?.name || "Ex-jugador";

function ratingsBlock(m) {
  if (!matchStarted(m)) return "";
  const r = matchRatings(m.id);
  const mine = myRating(m.id);
  const rated = Object.entries(r).filter(([, v]) => v.n || v.comments.length)
    .sort((a, b) => (b[1].avg ?? 0) - (a[1].avg ?? 0));
  const raters = (S.ratings.get(m.id) || []).length;
  return `<div class="ratings">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <div class="bebas" style="font-size:22px">⭐ Valoraciones</div>
      ${wentTo(m, S.me) ? `<button class="btn sm ${mine ? "" : "primary"}" data-act="rate" data-id="${m.id}">${mine ? "✏️ Editar mis notas" : "⭐ Valorar"}</button>` : `<span class="muted small">Solo valoran los que fueron</span>`}
    </div>
    <p class="muted small" style="margin:4px 0 8px">${raters ? `${raters} ${raters === 1 ? "persona ha" : "personas han"} valorado` : "Nadie ha valorado todavía. ¡Sé el primero!"}</p>
    ${rated.map(([pid, v], i) => `<details class="rate-row">
      <summary><span class="rk">${i === 0 && v.avg ? "🏅" : i + 1}</span><span class="nm">${esc(pname(pid))}${pid === S.me ? " (tú)" : ""}</span>
        <span class="muted small">${v.n} ${v.n === 1 ? "nota" : "notas"}${v.comments.length ? ` · 💬 ${v.comments.length}` : ""}</span>
        <span class="avg ${v.avg >= 7 ? "hi" : v.avg && v.avg < 5 ? "lo" : ""}">${fmtAvg(v.avg)}</span></summary>
      ${v.comments.length ? v.comments.map((c) => `<div class="cmt"><b>🕶️ Anónimo</b>${c.score ? ` <span class="muted">(${c.score})</span>` : ""}: ${esc(c.text)}</div>`).join("") : `<div class="cmt muted">Sin comentarios</div>`}
    </details>`).join("")}
  </div>`;
}

function rateForm(mid, all = false) {
  const m = S.matches.find((x) => x.id === mid);
  const mine = myRating(mid) || {};
  if (!wentTo(m, S.me)) return toast("Solo pueden valorar los que fueron al partido");
  const list = ratablePlayers(m);
  openModal(`<form data-form="rate" data-id="${mid}">
    <h3>⭐ Valorar · ${m.isHome !== false ? "vs" : "@"} ${esc(m.rival)}</h3>
    <p class="muted small">Pon nota del 1 al 10 a cada compañero (deja “–” si no quieres valorarlo) y, si quieres, un comentario. <b>🕶️ Es anónimo:</b> nadie verá quién ha puesto cada nota. Puedes cambiarlo cuando quieras.</p>
    ${list.map((p) => {
      const v = mine.scores?.[p.id] ?? "";
      return `<div class="rate-edit">
        <div class="re-head"><b>${esc(p.name)}</b> <span class="muted small">#${esc(p.number)}</span>
          <select name="s_${p.id}">${["", 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<option value="${n}" ${String(v) === String(n) ? "selected" : ""}>${n === "" ? "–" : n}</option>`).join("")}</select></div>
        <input name="c_${p.id}" maxlength="200" placeholder="Comentario (opcional)" value="${esc(mine.comments?.[p.id] || "")}">
      </div>`;
    }).join("")}
    ${list.length ? "" : `<p class="muted">No hay más compañeros marcados como asistentes en este partido.</p>`}
    <div class="acts"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit">Guardar notas</button></div>
  </form>`);
}

async function saveRatings(form) {
  const f = new FormData(form);
  const scores = {}, comments = {};
  for (const [k, v] of f.entries()) {
    if (k.startsWith("s_") && v) scores[k.slice(2)] = +v;
    if (k.startsWith("c_") && v.trim()) comments[k.slice(2)] = v.trim().slice(0, 200);
  }
  // conservar notas de jugadores que no aparecían en el formulario
  const mid = form.dataset.id;
  const prev = myRating(mid) || {};
  const shown = new Set([...f.keys()].map((k) => k.slice(2)));
  for (const [pid, v] of Object.entries(prev.scores || {})) if (!shown.has(pid)) scores[pid] = v;
  for (const [pid, v] of Object.entries(prev.comments || {})) if (!shown.has(pid)) comments[pid] = v;
  const data = { scores, comments, updatedAt: serverTimestamp() };
  const key = S.myKeys[mid];
  if (key) {
    await setDoc(doc(db, "matches", mid, "ratings", key), data);
  } else {
    // primera vez: código aleatorio + guardarlo en mi apartado privado, en la misma operación
    const ref = doc(collection(db, "matches", mid, "ratings"));
    const b = writeBatch(db);
    b.set(ref, data);
    b.set(doc(db, "users", S.uid), { ratingKeys: { [mid]: ref.id } }, { merge: true });
    await b.commit();
    S.myKeys = { ...S.myKeys, [mid]: ref.id };
  }
  toast("¡Notas guardadas! Son anónimas 🕶️");
}

function openMatchModal(id, refresh = false) {
  const m = S.matches.find((x) => x.id === id);
  if (!m) return;
  S.openMatch = id;
  (refresh ? updateModal : openModal)(`${matchCard(m, false).replace('class="card ', 'class="card-plain ')}
    ${ratingsBlock(m)}
    <div class="acts"><button class="btn" data-act="close">Cerrar</button>${isAdmin() ? `${matchStarted(m) ? `<button class="btn wine" data-act="goals" data-id="${id}">📝 Resultado</button><button class="btn" data-act="cards" data-id="${id}">🟨🟥</button>` : ""}<button class="btn primary" data-act="match-edit" data-id="${id}">Editar</button>` : ""}</div>`);
}
function refreshMatchModal() {
  // solo si lo que está abierto es la ficha del partido (no un formulario)
  if ($modal.open && S.openMatch && !$modal.querySelector("form") && $modal.querySelector(".card-plain")) openMatchModal(S.openMatch, true);
}
// Último partido jugado (para animar a valorar)
function lastPlayed() {
  const past = S.matches.filter((m) => matchStarted(m) && toDate(m.date) && Date.now() - toDate(m.date) < 10 * 864e5);
  return past[past.length - 1];
}

// =====================================================================
//  FANTASY: predicciones de portero, cuarteto inicial y goleadores
// =====================================================================
// Puntos configurables por el admin (Admin → Fantasy). Valores por defecto:
const PTS_DEF = { scorer: 3, starter: 1, gk: 1, maxScorers: 6 };
const PTS = new Proxy({}, { get: (_, k) => +(S.cfg.fantasyPts?.[k] ?? PTS_DEF[k]) });
const fieldPlayers = () => sortedPlayers().filter((p) => !isStaff(p));
// Abierto hasta que empieza el partido (si no hay hora, hasta el final del día del partido)
const fxStatus = (m) => m.fantasy?.status || "auto";
function autoOpen(m) {
  if (resultOf(m)) return false;
  const d = toDate(m.date);
  if (!d) return true;
  return Date.now() < (m.timeKnown ? d.getTime() : d.getTime() + 864e5);
}
function predOpen(m) {
  const st = fxStatus(m);
  if (st === "open") { const c = toDate(m.fantasy.closesAt); return !c || Date.now() < c.getTime(); }
  if (st === "auto") return autoOpen(m);
  return false; // closed u off
}
const FX_LABEL = { auto: "Automático", open: "Abierto (manual)", closed: "Cerrado", off: "Desactivado" };
function fxState(m) {
  const st = fxStatus(m);
  if (st === "off") return ["off", "Desactivado"];
  if (predOpen(m)) return ["open", "Abierto"];
  if (resultOf(m)) return ["done", "Terminado"];
  return ["closed", "Cerrado"];
}
function predDeadlineText(m) {
  if (fxStatus(m) === "open") {
    const c = toDate(m.fantasy.closesAt);
    return c ? `Se cierra el ${fmtDay(c)} a las ${fmtTime(c)}` : "Abierto hasta que el admin lo cierre";
  }
  const d = toDate(m.date);
  if (!d) return "Se cierra al empezar el partido";
  return m.timeKnown ? `Se cierra al empezar: ${fmtDay(d)} a las ${fmtTime(d)}` : `Se cierra al empezar el partido (${fmtDay(d)})`;
}
// Puntos de una predicción en un partido ya terminado
function predPoints(m, pr) {
  if (!pr || !resultOf(m)) return null;
  const scored = new Set(goalsOf(m).map(([pid]) => pid));
  const lu = m.lineup || {};
  const st = new Set(lu.starters || []);
  const hitsScorers = (pr.scorers || []).filter((x) => scored.has(x));
  const hitsStarters = lu.starters?.length ? (pr.starters || []).filter((x) => st.has(x)) : [];
  const hitGk = !!(lu.gk && pr.gk && pr.gk === lu.gk);
  return {
    total: hitsScorers.length * PTS.scorer + hitsStarters.length * PTS.starter + (hitGk ? PTS.gk : 0),
    hitsScorers, hitsStarters, hitGk, lineupSet: !!lu.starters?.length,
  };
}
function fantasyTable() {
  const out = {};
  for (const m of S.matches) {
    if (!resultOf(m) || fxStatus(m) === "off") continue;
    for (const [pid, pr] of S.preds.get(m.id) || []) {
      const r = predPoints(m, pr); if (!r) continue;
      (out[pid] ||= { pts: 0, n: 0, sc: 0 }); out[pid].pts += r.total; out[pid].n++; out[pid].sc += r.hitsScorers.length;
    }
  }
  return Object.entries(out).filter(([pid]) => S.players.has(pid)).sort((a, b) => b[1].pts - a[1].pts || b[1].sc - a[1].sc);
}
const chipNames = (ids, hits) => (ids || []).map((id) => `<span class="chip-s ${hits ? (hits.includes(id) ? "ok" : "ko") : ""}">${esc(pname(id))}</span>`).join("") || `<span class="muted small">—</span>`;

function fantasyOpenCard(nx) {
  {
    const mine = S.preds.get(nx.id)?.get(S.me);
    const n = S.preds.get(nx.id)?.size || 0;
    const [ch, ca] = crests(nx); const [h, a] = teams(nx);
    return `<div class="card hero">
      <span class="tag gold">🎯 FANTASY ABIERTO</span>
      <div class="vs"><div class="team ${nx.isHome !== false ? "go" : ""}">${crestImg(ch, "lg")}${esc(h)}</div><div class="score">vs</div><div class="team ${nx.isHome === false ? "go" : ""}">${crestImg(ca, "lg")}${esc(a)}</div></div>
      <p class="countdown">⏳ ${predDeadlineText(nx)} · ${n} ${n === 1 ? "predicción" : "predicciones"}</p>
      ${mine ? `<div class="pred-sum">
          <div><b>🧤 Portero</b>${chipNames([mine.gk].filter(Boolean))}</div>
          <div><b>👟 Cuarteto inicial</b>${chipNames(mine.starters)}</div>
          <div><b>⚽ Goleadores</b>${chipNames(mine.scorers)}</div>
        </div>` : `<p class="muted small" style="text-align:center">Aún no has hecho tu predicción.</p>`}
      <button class="btn ${mine ? "" : "primary"} block" data-act="predict" data-id="${nx.id}">${mine ? "✏️ Cambiar mi predicción" : "🎯 Hacer mi predicción"}</button>
      ${isAdmin() ? `<button class="btn sm ghost block" style="margin-top:6px" data-act="fxadmin" data-id="${nx.id}">⚙️ Gestionar este Fantasy</button>` : ""}
    </div>`;
  }
}
function viewFantasy() {
  // abiertos a mano + el siguiente partido en automático
  const manual = S.matches.filter((m) => fxStatus(m) === "open" && predOpen(m));
  const auto = S.matches.find((m) => fxStatus(m) === "auto" && autoOpen(m) && toDate(m.date));
  const open = [...manual, ...(auto && !manual.includes(auto) ? [auto] : [])].sort((a, b) => (toDate(a.date)?.getTime() ?? 9e15) - (toDate(b.date)?.getTime() ?? 9e15));
  const t = fantasyTable();
  const played = S.matches.filter((m) => resultOf(m) && fxStatus(m) !== "off" && S.preds.get(m.id)?.size).reverse();
  const next = open.length ? open.map(fantasyOpenCard).join("")
    : `<div class="card empty">No hay ningún Fantasy abierto ahora mismo.${isAdmin() ? `<br><button class="btn sm primary" style="margin-top:10px" data-act="atab-fx">⚙️ Abrir uno (Admin → Fantasy)</button>` : ""}</div>`;
  return `<div class="section-title"><h2>🎯 Fantasy</h2></div>
    ${next}
    <details class="card rules"><summary><b>📋 Cómo se puntúa</b></summary>
      <p class="small">Antes de cada partido predice el <b>portero</b>, el <b>cuarteto inicial</b> (los 4 de campo) y <b>quién marcará</b>. Al terminar, el admin pone la alineación y los goleadores reales:</p>
      <ul class="small"><li>⚽ <b>+${PTS.scorer}</b> por cada goleador acertado (con que marque uno, cuenta)</li><li>👟 <b>+${PTS.starter}</b> por cada jugador del cuarteto inicial acertado</li><li>🧤 <b>+${PTS.gk}</b> si aciertas el portero</li></ul>
      <p class="small muted">Las predicciones de los demás se ven cuando empieza el partido.</p>
    </details>
    <div class="section-title"><h3>🏆 Clasificación Fantasy</h3></div>
    <div class="card" style="padding:4px 12px">${t.length ? t.map(([pid, v], i) => `<div class="rate-row flat ${pid === S.me ? "meRow" : ""}" data-act="player" data-id="${pid}">
        <span class="rk">${["🥇", "🥈", "🥉"][i] || i + 1}</span><span class="nm">${esc(pname(pid))}</span>
        <span class="muted small">${v.n} ${v.n === 1 ? "partido" : "partidos"}</span><span class="avg hi">${v.pts}</span></div>`).join("")
      : `<div class="empty">Todavía no hay puntos. ¡Haz tu predicción para el próximo partido!</div>`}</div>
    ${played.length ? `<div class="section-title"><h3>Jornadas</h3></div>${played.map((m) => {
      const r = predPoints(m, S.preds.get(m.id).get(S.me));
      return `<div class="card match-row" style="grid-template-columns:36px 1fr auto" data-act="fx" data-id="${m.id}">
        ${crestImg(m.crest)}<div class="t">${m.isHome !== false ? "vs" : "@"} ${esc(m.rival)}<small>${m.golesGO}-${m.golesRival} · ${S.preds.get(m.id).size} predicciones${m.lineup?.starters?.length ? "" : " · falta la alineación"}</small></div>
        <div class="res ${r ? "W" : ""}">${r ? `+${r.total}` : "—"}</div></div>`;
    }).join("")}` : ""}`;
}

// Detalle de un partido: alineación real y puntos de cada uno
function fantasyMatchModal(mid) {
  const m = S.matches.find((x) => x.id === mid);
  const lu = m.lineup || {};
  const scorers = goalsOf(m).map(([pid]) => pid);
  const rows = [...(S.preds.get(mid) || [])].filter(([pid]) => !predOpen(m) || isAdmin() || pid === S.me).map(([pid, pr]) => [pid, pr, predPoints(m, pr)])
    .sort((a, b) => (b[2]?.total ?? -1) - (a[2]?.total ?? -1));
  openModal(`<h3>🎯 ${m.isHome !== false ? "vs" : "@"} ${esc(m.rival)} · ${m.golesGO ?? "?"}-${m.golesRival ?? "?"}</h3>
    <div class="pred-sum">
      <div><b>🧤 Portero real</b>${chipNames([lu.gk].filter(Boolean))}</div>
      <div><b>👟 Cuarteto real</b>${chipNames(lu.starters)}</div>
      <div><b>⚽ Goleadores</b>${chipNames(scorers)}</div>
    </div>
    ${rows.map(([pid, pr, r]) => `<details class="rate-row"><summary><span class="rk">${pid === S.me ? "⭐" : ""}</span><span class="nm">${esc(pname(pid))}</span><span></span><span class="avg hi">${r ? `+${r.total}` : "—"}</span></summary>
      <div class="pred-sum small">
        <div><b>🧤</b>${chipNames([pr.gk].filter(Boolean), r ? (r.hitGk ? [pr.gk] : []) : null)}</div>
        <div><b>👟</b>${chipNames(pr.starters, r ? r.hitsStarters : null)}</div>
        <div><b>⚽</b>${chipNames(pr.scorers, r ? r.hitsScorers : null)}</div>
        ${isAdmin() ? `<div><button class="btn sm" data-act="fxdel" data-id="${mid}" data-pid="${pid}">🗑️ Borrar la predicción de ${esc(pname(pid))}</button></div>` : ""}
      </div></details>`).join("") || `<p class="muted">Nadie hizo predicción.</p>`}
    <div class="acts">${isAdmin() ? `<button class="btn" data-act="fxadmin" data-id="${mid}">⚙️ Gestionar</button><button class="btn wine" data-act="goals" data-id="${mid}">📝 Resultado</button>` : ""}<button class="btn primary" data-act="close">Cerrar</button></div>`);
}

// ----- Pista de fútbol sala: portero + rombo (cierre, alas, pívot) -----
const POS = [
  ["pivot", "Pívot", 50, 13], ["alaI", "Ala izq.", 17, 37], ["alaD", "Ala der.", 83, 37],
  ["cierre", "Cierre", 50, 59], ["gk", "Portero", 50, 85],
];
function courtHtml() {
  const c = S.court;
  return `<div class="pitch">
    <span class="pl-mid"></span><span class="pl-circle"></span><span class="pl-area top"></span><span class="pl-area bot"></span>
    ${POS.map(([k, label, x, y]) => {
      const p = S.players.get(c.pos[k]);
      return `<button type="button" class="slot ${p ? "full" : ""}" style="left:${x}%;top:${y}%" data-act="slot" data-pos="${k}">
        ${p ? jersey(p) : `<span class="slot-empty">+</span>`}<span class="slot-l">${p ? esc(p.name) : label}</span></button>`;
    }).join("")}
  </div>`;
}
function pickerHtml(pos) {
  const label = POS.find((x) => x[0] === pos)[1];
  return `<div class="picker"><div class="bebas" style="font-size:20px">Elige ${label.toLowerCase()}</div>
    <div class="pick-grid">${fieldPlayers().map((p) => {
      const where = Object.entries(S.court.pos).find(([, v]) => v === p.id)?.[0];
      return `<div class="pick ${where === pos ? "sel" : ""}" data-act="slotpick" data-id="${p.id}">${jersey(p)}<div class="lbl">${esc(p.name)}${where && where !== pos ? ` · ${POS.find((x) => x[0] === where)[1]}` : ""}</div></div>`;
    }).join("")}</div>
    <div class="acts"><button type="button" class="btn" data-act="slotclear">Quitar</button><button type="button" class="btn primary" data-act="slotcancel">Volver</button></div></div>`;
}
const drawCourt = () => { const box = $modal.querySelector("#courtBox"); if (box) box.innerHTML = S.court.picking ? pickerHtml(S.court.picking) : courtHtml(); };
function courtFrom(obj) {
  const pos = { ...(obj?.pos || {}) };
  if (obj?.gk) pos.gk = obj.gk;
  // datos antiguos sin posiciones: repartir el cuarteto en el rombo
  if (!obj?.pos && obj?.starters) ["cierre", "alaI", "alaD", "pivot"].forEach((k, i) => { if (obj.starters[i]) pos[k] = obj.starters[i]; });
  return { pos, picking: null };
}
function courtValue() {
  const p = S.court.pos;
  const four = ["cierre", "alaI", "alaD", "pivot"];
  return { gk: p.gk || null, starters: four.map((k) => p[k]).filter(Boolean), pos: Object.fromEntries(four.filter((k) => p[k]).map((k) => [k, p[k]])) };
}

// Formulario de predicción
const chip = (name, id, checked, type = "checkbox") =>
  `<label class="chip"><input type="${type}" name="${name}" value="${id}" ${checked ? "checked" : ""}><span>${esc(pname(id))}</span></label>`;
function predictForm(mid) {
  const m = S.matches.find((x) => x.id === mid);
  if (!predOpen(m)) return toast("Las predicciones de este partido ya están cerradas");
  const pr = S.preds.get(mid)?.get(S.me) || {};
  S.court = courtFrom(pr);
  openModal(`<form data-form="predict" data-id="${mid}">
    <h3>🎯 Predicción · ${m.isHome !== false ? "vs" : "@"} ${esc(m.rival)}</h3>
    <p class="muted small">${predDeadlineText(m)}. Toca cada posición y elige la camiseta. Si aciertas un titular cuenta aunque juegue en otra posición.</p>
    <div id="courtBox"></div>
    <div class="bebas fx-h">⚽ ¿Quién marcará? <span class="muted small">(hasta ${PTS.maxScorers} · +${PTS.scorer} por acierto)</span></div>
    <div class="chips" data-max="${PTS.maxScorers}">${fieldPlayers().map((p) => chip("sc", p.id, pr.scorers?.includes(p.id))).join("")}</div>
    <div class="acts"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit">Guardar predicción</button></div>
  </form>`);
  drawCourt();
}
async function savePrediction(form) {
  const v = courtValue();
  if (!v.gk) throw new Error("Elige el portero");
  if (v.starters.length !== 4) throw new Error("Rellena las 4 posiciones del rombo (cierre, alas y pívot)");
  const scorers = new FormData(form).getAll("sc");
  await setDoc(doc(db, "matches", form.dataset.id, "predictions", S.me), { ...v, scorers, updatedAt: serverTimestamp() });
  toast("¡Predicción guardada! 🎯");
}
// Alineación real (admin, en el formulario de resultado): asistentes + pista
function lineupInputs(m) {
  S.court = courtFrom(m.lineup);
  return `<div class="bebas fx-h">✅ ¿Quién fue al partido? <span class="muted small">(pueden valorar y ser valorados)</span></div>
    <div class="chips">${fieldPlayers().map((p) => chip("att", p.id, wentTo(m, p.id))).join("")}</div>
    <div class="bebas fx-h">🏟️ Quinteto inicial</div>
    <div id="courtBox"></div>`;
}
function readLineup() { return courtValue(); }
function readAttendance(form, m) {
  const went = new Set(new FormData(form).getAll("att"));
  const votes = { ...(m.votes || {}) };
  for (const p of fieldPlayers()) {
    if (went.has(p.id)) votes[p.id] = "si";
    else if (votes[p.id] === "si") votes[p.id] = "no";
  }
  return votes;
}

// ----- tarjetas -----
const cardsOf = (m) => Object.entries(m.cards || {}).filter(([, c]) => (c.y || 0) + (c.r || 0) > 0);
function cardsLine(m) {
  const c = cardsOf(m);
  if (!c.length) return "";
  return `<div class="scorers">${c.map(([pid, v]) => `${"🟨".repeat(v.y || 0)}${"🟥".repeat(v.r || 0)} ${esc(pname(pid))}`).join(" · ")}</div>`;
}
function cardsTable() {
  const out = {};
  for (const m of S.matches) for (const [pid, c] of cardsOf(m)) {
    (out[pid] ||= { y: 0, r: 0 }); out[pid].y += c.y || 0; out[pid].r += c.r || 0;
  }
  for (const p of S.players.values()) {
    const b = p.cardsBase || {};
    if ((+b.y || 0) + (+b.r || 0) > 0) { (out[p.id] ||= { y: 0, r: 0 }); out[p.id].y += +b.y || 0; out[p.id].r += +b.r || 0; }
  }
  return Object.entries(out).filter(([pid]) => S.players.has(pid)).sort((a, b) => b[1].r - a[1].r || b[1].y - a[1].y);
}
function viewCards() {
  const t = cardsTable();
  if (!t.length) return `<div class="card empty">🟨 Ninguna tarjeta esta temporada. ¡Así da gusto!</div>`;
  return `<div class="card" style="padding:4px 12px">
    <div class="rate-row flat head"><span></span><span class="muted small">Jugador</span><span class="muted small">🟨</span><span class="muted small" style="text-align:center">🟥</span></div>
    ${t.map(([pid, v], i) => `<div class="rate-row flat ${pid === S.me ? "meRow" : ""}" data-act="player" data-id="${pid}">
      <span class="rk">${i + 1}</span><span class="nm">${esc(pname(pid))} <span class="muted small">#${esc(S.players.get(pid)?.number ?? "")}</span></span>
      <span class="cardn y">${v.y}</span><span class="cardn r">${v.r}</span></div>`).join("")}</div>`;
}
function cardsForm(mid) {
  const m = S.matches.find((x) => x.id === mid);
  const list = fieldPlayers().sort((a, b) => wentTo(m, b.id) - wentTo(m, a.id));
  const st = (name, v) => `<span class="stepper"><button type="button" class="btn sm" data-act="g-minus">−</button><input type="number" name="${name}" min="0" max="5" value="${v || 0}"><button type="button" class="btn sm" data-act="g-plus">+</button></span>`;
  openModal(`<form data-form="cards" data-id="${mid}">
    <h3>🟨🟥 Tarjetas · ${m.isHome !== false ? "vs" : "@"} ${esc(m.rival)}</h3>
    <p class="muted small">Se actualiza al momento en el móvil de todos.</p>
    ${list.map((p) => `<div class="goal-edit"><span><b>${esc(p.name)}</b> <span class="muted small">#${esc(p.number)}</span></span>
      <span style="display:flex;gap:10px;align-items:center">🟨${st("y_" + p.id, m.cards?.[p.id]?.y)} 🟥${st("r_" + p.id, m.cards?.[p.id]?.r)}</span></div>`).join("")}
    <div class="acts"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
  </form>`);
}
async function saveCards(form) {
  const cards = {};
  for (const [k, v] of new FormData(form).entries()) {
    const [t, ...rest] = k.split("_"); const pid = rest.join("_");
    if (!["y", "r"].includes(t) || !(+v > 0)) continue;
    (cards[pid] ||= { y: 0, r: 0 })[t] = Math.min(5, Math.floor(+v));
  }
  await updateDoc(doc(db, "matches", form.dataset.id), { cards, updatedAt: serverTimestamp() });
  toast("Tarjetas guardadas 🟨");
}

// =====================================================================
//  MÁS (perfil, multas, administración)
// =====================================================================
function viewMore() {
  const p = me();
  const pend = finesOf(S.me).filter((f) => !f.paid).reduce((a, f) => a + (+f.price || 0), 0);
  const item = (tab, ic, title, sub) => `<div class="card more-item" data-act="tab" data-tab="${tab}"><span class="mi-ic">${ic}</span><div><b>${title}</b><div class="muted small">${sub}</div></div><span class="mi-go">›</span></div>`;
  return `<div class="section-title"><h2>Más</h2></div>
    <div data-act="tab" data-tab="multas" class="piggy-link">${piggyBank()}</div>
    ${item("perfil", "👕", "Mi perfil", `${esc(p.fullName || p.name)} · ${isStaff(p) ? esc(p.position) : "Dorsal " + esc(p.number)}`)}
    ${item("multas", "🐷", "Multas y hucha de la cena", `Hucha: ${money(S.fines.reduce((a, f) => a + (+f.price || 0), 0))} · ${pend ? `debes ${money(pend)}` : "estás al día 👍"}`)}
    ${isAdmin() ? item("admin", "🛠️", "Administración", "Partidos, Fantasy, entrenos, jugadores, ajustes") : ""}`;
}
const backToMore = () => `<button class="btn sm ghost" style="margin-top:10px" data-act="tab" data-tab="mas">‹ Más</button>`;

// =====================================================================
//  FOTOS Y VÍDEOS: un álbum por partido. Los sube el fotógrafo (o un admin).
//  Se guardan en la base de datos (gratis, 1 GB en total): miniatura en photos/{id} y el archivo
//  (foto de 2048 px o vídeo comprimido) troceado en photos/{id}/chunks/{n}.
// =====================================================================
const CHUNK = 700000;               // caracteres por trozo (cabe de sobra en un documento)
const FREE_BYTES = 1024 * 1024 * 1024; // espacio gratis de la base de datos
const VIDEO_MAX_SECONDS = 120;
const VIDEO_MAX_BYTES = 30 * 1024 * 1024;
const photoEvents = () => S.matches.filter((m) => matchStarted(m) || S.albums[m.id]?.count).slice().reverse();
const mediaLabel = (a) => {
  const v = a?.videos || 0, f = (a?.count || 0) - v;
  const parts = [];
  if (f) parts.push(`${f} ${f === 1 ? "foto" : "fotos"}`);
  if (v) parts.push(`${v} ${v === 1 ? "vídeo" : "vídeos"}`);
  return parts.join(" · ") || "sin fotos";
};
const usedBytes = () => Object.values(S.albums).reduce((t, a) => t + (a.bytes || (a.count || 0) * 450000), 0);
const mb = (n) => `${Math.round(n / 1048576)} MB`;
const fmtDur = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
function viewPhotos() {
  if (S.albumOpen) return viewAlbum(S.albumOpen);
  const ev = photoEvents();
  const all = Object.values(S.albums);
  return `<div class="section-title"><h2>📷 Fotos y vídeos</h2><span class="muted small">${mediaLabel({ count: all.reduce((a, x) => a + (x.count || 0), 0), videos: all.reduce((a, x) => a + (x.videos || 0), 0) })}</span></div>
    ${isPhotographer() ? `<p class="muted small">Elige un partido para subir sus fotos y vídeos. Al subirlos se avisa a todo el equipo.</p>${storageBar()}` : ""}
    ${ev.length ? `<div class="albums">${ev.map((m) => {
      const a = S.albums[m.id]; const d = toDate(m.date);
      return `<div class="album" data-act="album" data-id="${m.id}">
        <div class="album-cover">${a?.cover ? `<img src="${a.cover}" alt="">` : crestImg(m.crest, "lg")}${a?.videos ? `<span class="vbadge">▶ ${a.videos}</span>` : ""}</div>
        <div class="album-info"><b>${m.isHome !== false ? "vs" : "@"} ${esc(m.rival)}</b>
        <span class="muted small">${d ? fmtShort(d) : ""}${resultOf(m) ? ` · ${m.golesGO}-${m.golesRival}` : ""} · ${mediaLabel(a)}</span></div>
      </div>`;
    }).join("")}</div>` : `<div class="card empty">Todavía no hay partidos jugados.</div>`}`;
}
function storageBar() {
  const used = usedBytes(), pct = Math.min(100, (used / FREE_BYTES) * 100);
  return `<div class="storage"><div class="small">💾 Espacio usado: <b>${mb(used)}</b> de ${mb(FREE_BYTES)} gratis</div>
    <div class="goal-bar"><div class="goal-paid" style="width:${pct}%;${pct > 85 ? "background:var(--ko)" : ""}"></div></div></div>`;
}
function viewAlbum(mid) {
  const m = S.matches.find((x) => x.id === mid);
  if (!m) { S.albumOpen = null; return viewPhotos(); }
  const list = S.photos.get(mid);
  if (!list) loadAlbum(mid);
  const up = S.uploading;
  return `<button class="btn sm ghost" style="margin-top:10px" data-act="album-back">‹ Eventos</button>
    <div class="section-title"><h2>${m.isHome !== false ? "vs" : "@"} ${esc(m.rival)}</h2><span class="muted small">${toDate(m.date) ? fmtShort(toDate(m.date)) : ""}</span></div>
    ${isPhotographer() ? `<label class="btn primary block upl ${up ? "busy" : ""}">${up ? `⏳ ${esc(up.label || `Subiendo ${up.done}/${up.total}…`)}` : "📤 Subir fotos y vídeos"}
      <input type="file" accept="image/*,video/*" multiple data-upload="${mid}" ${up ? "disabled" : ""} hidden></label>
      ${up ? `<p class="muted small" style="text-align:center">No cierres la app ni cambies de pantalla hasta que termine.</p>` : `<p class="muted small">Vídeos de hasta ${VIDEO_MAX_SECONDS / 60} minutos. Si son grandes se comprimen en el móvil (tarda lo que dura el vídeo).</p>`}` : ""}
    ${!list ? `<div class="loading"><div class="ball"></div>Cargando…</div>`
      : list.length ? `<p class="muted small">Toca una foto o un vídeo para verlo en grande y descargarlo.</p><div class="photo-grid">${list.map((ph, i) => `<button class="ph" data-act="photo" data-id="${mid}" data-i="${i}"><img src="${ph.thumb}" alt="${ph.type === "video" ? "Vídeo" : "Foto"} ${i + 1}" loading="lazy">${ph.type === "video" ? `<span class="play">▶</span><span class="dur">${fmtDur(ph.duration || 0)}</span>` : ""}</button>`).join("")}</div>`
      : `<div class="card empty">Aún no hay fotos ni vídeos de este partido.</div>`}`;
}
async function loadAlbum(mid) {
  if (S.loadingAlbum === mid) return;
  S.loadingAlbum = mid;
  try {
    const snap = await getDocs(query(collection(db, "photos"), where("matchId", "==", mid)));
    S.photos.set(mid, snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (toDate(a.createdAt) ?? 0) - (toDate(b.createdAt) ?? 0)));
  } catch (e) { toast("No se pudieron cargar las fotos: " + e.message); S.photos.set(mid, []); }
  S.loadingAlbum = null;
  render();
}
// Reducir la foto en el móvil antes de subirla
async function toJpeg(file, max, quality) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { src = await new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = ko; im.src = URL.createObjectURL(file); }); }
  const w0 = src.width, h0 = src.height, k = Math.min(1, max / Math.max(w0, h0));
  const c = document.createElement("canvas"); c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  return { url: c.toDataURL("image/jpeg", quality), w: c.width, h: c.height };
}
// ---- vídeo ----
function loadVideo(file) {
  return new Promise((ok, ko) => {
    const v = document.createElement("video");
    v.preload = "auto"; v.playsInline = true; v.setAttribute("playsinline", ""); v.src = URL.createObjectURL(file);
    v.onloadedmetadata = async () => {
      // algunos vídeos (WebM de Android) no traen la duración: saltar al final para que el navegador la calcule
      if (!isFinite(v.duration)) {
        await new Promise((r) => { v.ondurationchange = () => { if (isFinite(v.duration)) r(); }; v.currentTime = 1e7; setTimeout(r, 5000); });
        v.ondurationchange = null;
        v.currentTime = 0;
      }
      ok(v);
    };
    v.onerror = () => ko(new Error("este formato de vídeo no se puede leer en este móvil"));
  });
}
async function videoThumb(v) {
  await new Promise((ok) => { v.onseeked = ok; v.currentTime = Math.min(0.5, (v.duration || 1) / 2); setTimeout(ok, 3000); });
  const k = Math.min(1, 480 / Math.max(v.videoWidth, v.videoHeight));
  const c = document.createElement("canvas"); c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
  c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.7);
}
const canCompress = () => typeof MediaRecorder !== "undefined" && !!HTMLCanvasElement.prototype.captureStream;
// Comprime el vídeo reproduciéndolo dentro de la app y grabándolo a 720p (tarda lo que dura el vídeo)
async function compressVideo(v, onProgress) {
  const k = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
  const c = document.createElement("canvas");
  c.width = Math.max(2, Math.round((v.videoWidth * k) / 2) * 2); c.height = Math.max(2, Math.round((v.videoHeight * k) / 2) * 2);
  const ctx = c.getContext("2d");
  const stream = c.captureStream(30);
  let ac = null;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    await ac.resume();
    const dest = ac.createMediaStreamDestination();
    ac.createMediaElementSource(v).connect(dest); // el sonido va a la grabación, no a los altavoces
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  } catch { v.muted = true; }
  const mime = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp8,opus", "video/webm"].find((t) => MediaRecorder.isTypeSupported?.(t)) || "";
  const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 1800000, audioBitsPerSecond: 96000 });
  const parts = [];
  rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
  const stopped = new Promise((ok) => { rec.onstop = ok; });
  v.currentTime = 0;
  await new Promise((ok) => { v.onseeked = ok; setTimeout(ok, 1500); });
  rec.start(1000);
  try { await v.play(); } catch { v.muted = true; await v.play(); }
  const timer = setInterval(() => { ctx.drawImage(v, 0, 0, c.width, c.height); onProgress(v.currentTime / v.duration); }, 33);
  await new Promise((ok) => { v.onended = ok; });
  clearInterval(timer); rec.stop(); await stopped;
  ac?.close?.();
  return new Blob(parts, { type: (rec.mimeType || mime || "video/webm").split(";")[0] });
}
const blobToB64 = (blob) => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = ko; r.readAsDataURL(blob); });
// Guarda un archivo troceado: primero los trozos (en tandas) y al final la ficha, para que no aparezca a medias
async function saveMedia(mid, b64, meta, onProgress) {
  const parts = []; for (let i = 0; i < b64.length; i += CHUNK) parts.push(b64.slice(i, i + CHUNK));
  const ref = doc(collection(db, "photos"));
  try {
    for (let i = 0; i < parts.length; i += 10) {
      const bt = writeBatch(db);
      parts.slice(i, i + 10).forEach((d, j) => bt.set(doc(db, "photos", ref.id, "chunks", String(i + j)), { d }));
      await bt.commit();
      onProgress?.(Math.min(1, (i + 10) / parts.length));
    }
    const bt = writeBatch(db);
    bt.set(ref, { matchId: mid, ...meta, n: parts.length, bytes: b64.length, by: S.me, createdAt: serverTimestamp() });
    bt.set(doc(db, "albums", mid), { count: increment(1), bytes: increment(b64.length), updatedAt: serverTimestamp(),
      ...(meta.type === "video" ? { videos: increment(1) } : {}), ...(S.albums[mid]?.cover ? {} : { cover: meta.thumb }) }, { merge: true });
    await bt.commit();
  } catch (e) {
    // limpiar trozos sueltos si algo falló
    const bt = writeBatch(db); parts.forEach((_, k) => bt.delete(doc(db, "photos", ref.id, "chunks", String(k)))); bt.commit().catch(() => {});
    throw e;
  }
}
async function uploadPhotos(mid, files) {
  files = [...files].filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
  if (!files.length) return;
  S.uploading = { done: 0, total: files.length }; render();
  let okF = 0, okV = 0;
  const setLabel = (t) => { S.uploading.label = t; render(); };
  for (const f of files) {
    const n = `${S.uploading.done + 1}/${files.length}`;
    try {
      if (f.type.startsWith("image/")) {
        setLabel(`Subiendo ${n}…`);
        const big = await toJpeg(f, 2048, 0.85);
        const thumb = await toJpeg(f, 480, 0.7);
        await saveMedia(mid, big.url.split(",")[1], { type: "photo", mime: "image/jpeg", thumb: thumb.url, w: big.w, h: big.h });
        okF++;
      } else {
        setLabel(`Preparando vídeo ${n}…`);
        const v = await loadVideo(f);
        if (isFinite(v.duration) && v.duration > VIDEO_MAX_SECONDS + 1) throw new Error(`dura ${fmtDur(v.duration)}; el máximo son ${VIDEO_MAX_SECONDS / 60} minutos. Recórtalo en la galería del móvil.`);
        const thumb = await videoThumb(v);
        let blob = f;
        if (f.size > 8 * 1024 * 1024 && canCompress()) {
          blob = await compressVideo(v, (p) => setLabel(`Comprimiendo vídeo ${n}… ${Math.round(p * 100)}%`));
        }
        if (blob.size > VIDEO_MAX_BYTES) throw new Error(`es demasiado grande (${mb(blob.size)}). Recórtalo o grábalo en menos calidad.`);
        if (usedBytes() + blob.size * 1.37 > FREE_BYTES) throw new Error("no queda espacio gratis. Borra fotos o vídeos antiguos.");
        const b64 = await blobToB64(blob);
        await saveMedia(mid, b64, { type: "video", mime: blob.type || f.type || "video/mp4", thumb, w: v.videoWidth, h: v.videoHeight, duration: isFinite(v.duration) ? Math.round(v.duration) : 0 },
          (p) => setLabel(`Subiendo vídeo ${n}… ${Math.round(p * 100)}%`));
        okV++;
      }
    } catch (e) { toast(`No se pudo subir ${f.name}: ${e.message}`); }
    S.uploading.done++; render();
  }
  S.uploading = null; S.photos.delete(mid);
  const msg = [okF && `${okF} ${okF === 1 ? "foto" : "fotos"}`, okV && `${okV} ${okV === 1 ? "vídeo" : "vídeos"}`].filter(Boolean).join(" y ");
  if (msg) toast(`📷 Subido: ${msg}. Se avisará al equipo.`);
  loadAlbum(mid);
}
async function fullPhotoUrl(ph) {
  if (S.fullCache.has(ph.id)) return S.fullCache.get(ph.id);
  const snap = await getDocs(collection(db, "photos", ph.id, "chunks"));
  const b64 = snap.docs.sort((a, b) => +a.id - +b.id).map((d) => d.data().d).join("");
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: ph.mime || "image/jpeg" }));
  S.fullCache.set(ph.id, url);
  return url;
}
async function openPhoto(mid, i) {
  const list = S.photos.get(mid) || []; const ph = list[i]; if (!ph) return;
  S.viewer = { mid, i };
  const isV = ph.type === "video";
  openModal(`<div class="viewer">
    <div class="viewer-img">${isV ? `<video id="vvid" controls playsinline poster="${ph.thumb}"></video>` : `<img src="${ph.thumb}" alt="" id="vimg">`}
      <div class="viewer-load">${isV ? `Cargando vídeo (${mb(ph.bytes * 0.75 || 0)})…` : "Cargando foto…"}</div></div>
    <div class="viewer-bar">
      <button class="btn sm" data-act="photo" data-id="${mid}" data-i="${(i - 1 + list.length) % list.length}" ${list.length < 2 ? "disabled" : ""}>‹</button>
      <span class="muted small">${i + 1} / ${list.length}</span>
      <button class="btn sm" data-act="photo" data-id="${mid}" data-i="${(i + 1) % list.length}" ${list.length < 2 ? "disabled" : ""}>›</button>
    </div>
    <div class="acts">
      ${isPhotographer() ? `<button class="btn" data-act="photo-del" data-id="${mid}" data-i="${i}">🗑️</button>` : ""}
      <button class="btn" data-act="close">Cerrar</button>
      <button class="btn primary" data-act="photo-dl" data-id="${mid}" data-i="${i}">⬇️ Descargar</button>
    </div></div>`);
  try {
    const url = await fullPhotoUrl(ph);
    if (S.viewer?.mid === mid && S.viewer?.i === i) {
      const el = $modal.querySelector(isV ? "#vvid" : "#vimg"); if (el) el.src = url;
      $modal.querySelector(".viewer-load")?.remove();
    }
  } catch (e) { toast("No se pudo cargar: " + e.message); }
}
const extOf = (mime) => ({ "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" }[mime] || (String(mime).startsWith("video/") ? "mp4" : "jpg"));
async function downloadPhoto(mid, i) {
  const ph = (S.photos.get(mid) || [])[i]; const m = S.matches.find((x) => x.id === mid);
  toast("Preparando descarga…");
  const url = await fullPhotoUrl(ph);
  const blob = await (await fetch(url)).blob();
  const mime = ph.mime || "image/jpeg";
  const name = `GameOverFC_${slug(m?.rival || "partido")}_${i + 1}.${extOf(mime)}`;
  const file = new File([blob], name, { type: mime });
  // iPhone: menú de compartir → "Guardar imagen/vídeo". Android/ordenador: descarga directa.
  if (/iphone|ipad|ipod/i.test(navigator.userAgent) && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Game Over FC" }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  toast(ph.type === "video" ? "⬇️ Vídeo descargado" : "⬇️ Foto descargada");
}
async function deletePhoto(mid, i) {
  const list = S.photos.get(mid) || []; const ph = list[i]; if (!ph) return;
  const isV = ph.type === "video";
  if (!(await confirmBox(isV ? "¿Borrar este vídeo?" : "¿Borrar esta foto?", "Desaparecerá del álbum para todos."))) return;
  const keys = Array.from({ length: ph.n || 1 }, (_, k) => k);
  for (let i0 = 0; i0 < keys.length; i0 += 400) {
    const bt = writeBatch(db); keys.slice(i0, i0 + 400).forEach((k) => bt.delete(doc(db, "photos", ph.id, "chunks", String(k)))); await bt.commit();
  }
  const bt = writeBatch(db);
  bt.delete(doc(db, "photos", ph.id));
  const rest = list.filter((x) => x.id !== ph.id);
  if (!rest.length) bt.delete(doc(db, "albums", mid));
  else bt.set(doc(db, "albums", mid), { count: increment(-1), bytes: increment(-(ph.bytes || 0)), ...(isV ? { videos: increment(-1) } : {}),
    ...(S.albums[mid]?.cover === ph.thumb ? { cover: rest[0].thumb } : {}) }, { merge: true });
  await bt.commit();
  S.photos.set(mid, rest);
  toast(isV ? "Vídeo borrado" : "Foto borrada");
  render();
}

// =====================================================================
//  MULTAS
// =====================================================================
const DEFAULT_FINE_TYPES = [
  { id: "retraso-entreno", name: "Retraso sin avisar en el entreno", price: 3 },
  { id: "retraso-partido", name: "Retraso sin avisar en el partido", price: 5 },
  { id: "amarilla", name: "Tarjeta amarilla (mal comportamiento)", price: 8 },
  { id: "roja", name: "Tarjeta roja", price: 10 },
];
const fineTypes = () => S.fineTypes ?? DEFAULT_FINE_TYPES;
const dinnerGoal = () => +(S.fineGoal || 200);
// Hucha virtual para la cena del equipo: se llena con el dinero de las multas
function piggyBank() {
  const total = S.fines.reduce((a, f) => a + (+f.price || 0), 0);
  const paid = S.fines.filter((f) => f.paid).reduce((a, f) => a + (+f.price || 0), 0);
  const goal = dinnerGoal();
  const lvl = (x) => Math.max(0, Math.min(1, x / goal));
  const top = 43, h = 124, yPaid = top + h * (1 - lvl(paid)), yTotal = top + h * (1 - lvl(total));
  const pct = Math.round(lvl(total) * 100);
  return `<div class="card piggy">
    <div class="piggy-title">🐷 Hucha de la cena del equipo</div>
    <svg class="pig" viewBox="0 0 240 200" role="img" aria-label="Hucha con ${money(total)}">
      <defs>
        <linearGradient id="pigG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc1d9"/><stop offset="1" stop-color="#ec5f95"/></linearGradient>
        <linearGradient id="goldG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1a8"/><stop offset=".5" stop-color="#f2c544"/><stop offset="1" stop-color="#c8920e"/></linearGradient>
        <pattern id="pendP" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#f2c544" opacity=".25"/><rect width="4" height="8" fill="#f2c544" opacity=".55"/></pattern>
        <clipPath id="pigClip"><ellipse cx="125" cy="105" rx="85" ry="62"/></clipPath>
        <radialGradient id="shine" cx=".35" cy=".3" r=".6"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      </defs>
      <ellipse cx="125" cy="188" rx="80" ry="7" fill="rgba(0,0,0,.25)"/>
      <rect x="62" y="150" width="20" height="34" rx="8" fill="#e2508a"/><rect x="92" y="156" width="20" height="30" rx="8" fill="#d94680"/>
      <rect x="140" y="156" width="20" height="30" rx="8" fill="#d94680"/><rect x="168" y="150" width="20" height="34" rx="8" fill="#e2508a"/>
      <path d="M207 98 q18 -6 14 8 q-4 12 -14 4 q-6 -6 4 -10" fill="none" stroke="#e2508a" stroke-width="5" stroke-linecap="round"/>
      <ellipse cx="125" cy="105" rx="85" ry="62" fill="url(#pigG)"/>
      <g clip-path="url(#pigClip)">
        <rect x="30" y="${yTotal.toFixed(1)}" width="200" height="200" fill="url(#pendP)"/>
        <rect x="30" y="${yPaid.toFixed(1)}" width="200" height="200" fill="url(#goldG)"/>
        ${paid > 0 ? `<path d="M30 ${yPaid.toFixed(1)} q25 -6 50 0 t50 0 t50 0 t50 0 v6 h-200 z" fill="#fff6c4" opacity=".55"/>` : ""}
        ${[[70, 150], [105, 158], [150, 152], [180, 160], [125, 140], [88, 132], [162, 136]].filter(([, y]) => y > yPaid + 8).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="#ffd95a" stroke="#b8860b" stroke-width="2"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11" font-weight="800" fill="#8a6100">€</text>`).join("")}
      </g>
      <ellipse cx="125" cy="105" rx="85" ry="62" fill="url(#shine)"/>
      <ellipse cx="125" cy="105" rx="85" ry="62" fill="none" stroke="#c43c75" stroke-width="3"/>
      <path d="M78 52 l-8 -30 l30 18 z" fill="#ec5f95" stroke="#c43c75" stroke-width="3" stroke-linejoin="round"/>
      <path d="M150 48 l14 -26 l10 30 z" fill="#ec5f95" stroke="#c43c75" stroke-width="3" stroke-linejoin="round"/>
      <ellipse cx="44" cy="112" rx="20" ry="16" fill="#f47aa8" stroke="#c43c75" stroke-width="3"/>
      <ellipse cx="38" cy="112" rx="3.5" ry="5" fill="#a52a5c"/><ellipse cx="50" cy="112" rx="3.5" ry="5" fill="#a52a5c"/>
      <circle cx="74" cy="88" r="6" fill="#3b1027"/><circle cx="76" cy="86" r="2" fill="#fff"/>
      <rect x="108" y="46" width="40" height="8" rx="4" fill="#7a1f45"/>
      <g class="coin-drop"><circle cx="128" cy="30" r="12" fill="url(#goldG)" stroke="#b8860b" stroke-width="2"/><text x="128" y="35" text-anchor="middle" font-size="14" font-weight="900" fill="#8a6100">€</text></g>
    </svg>
    <div class="piggy-amount">${money(total)}</div>
    <div class="muted small">Cobrado <b class="txt-ok">${money(paid)}</b> · Por cobrar <b class="txt-ko">${money(total - paid)}</b></div>
    <div class="goal-bar"><div class="goal-paid" style="width:${lvl(paid) * 100}%"></div><div class="goal-pend" style="width:${(lvl(total) - lvl(paid)) * 100}%"></div></div>
    <div class="small">${total >= goal ? `🎉 ¡Objetivo conseguido! ${money(total)} de ${money(goal)}` : `${pct}% del objetivo · faltan <b>${money(goal - total)}</b> para los ${money(goal)}`}</div>
  </div>`;
}
const money = (n) => `${(+n || 0).toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
const finesOf = (pid) => S.fines.filter((f) => f.playerId === pid);
function fineRow(f, showName = true) {
  const d = toDate(f.date);
  return `<div class="fine ${f.paid ? "paid" : ""}">
    <div class="fine-main"><b>${showName ? esc(pname(f.playerId)) + " · " : ""}${esc(f.name)}</b>
      <span class="muted small">${d ? fmtShort(d) : ""}${f.note ? " · " + esc(f.note) : ""}</span></div>
    <div class="fine-side"><span class="fine-price">${money(f.price)}</span><span class="tag ${f.paid ? "ok" : "ko"}">${f.paid ? "Pagada" : "Pendiente"}</span></div>
    ${isAdmin() ? `<div class="fine-acts"><button class="btn sm" data-act="fine-paid" data-id="${f.id}">${f.paid ? "↩︎ Pendiente" : "✓ Pagada"}</button><button class="btn sm" data-act="fine-edit" data-id="${f.id}">Editar</button></div>` : ""}
  </div>`;
}
function finesSummaryHtml(pid) {
  const list = finesOf(pid);
  if (!list.length) return `<p class="muted small">Sin multas. ¡Ejemplar! 😇</p>`;
  const pend = list.filter((f) => !f.paid).reduce((a, f) => a + (+f.price || 0), 0);
  return `<p class="small">Pendiente: <b class="${pend ? "txt-ko" : "txt-ok"}">${money(pend)}</b> · Total: ${money(list.reduce((a, f) => a + (+f.price || 0), 0))}</p>${list.map((f) => fineRow(f, false)).join("")}`;
}
function viewFines() {
  const all = S.fines;
  const pend = all.filter((f) => !f.paid).reduce((a, f) => a + (+f.price || 0), 0);
  const paid = all.filter((f) => f.paid).reduce((a, f) => a + (+f.price || 0), 0);
  const debt = {};
  for (const f of all) if (!f.paid) { (debt[f.playerId] ||= { sum: 0, n: 0 }); debt[f.playerId].sum += +f.price || 0; debt[f.playerId].n++; }
  const ranking = Object.entries(debt).filter(([pid]) => S.players.has(pid)).sort((a, b) => b[1].sum - a[1].sum);
  return `${backToMore()}
    <div class="section-title"><h2>💸 Multas</h2><span class="muted small">${all.length} ${all.length === 1 ? "multa" : "multas"}</span></div>
    ${piggyBank()}
    ${isAdmin() ? `<div class="row2" style="margin-top:12px"><button class="btn primary" data-act="fine-edit">➕ Poner multa</button><button class="btn" data-act="fine-types">⚙️ Precios y hucha</button></div>` : ""}
    <div class="card" style="margin-top:12px"><h3>📋 Precios</h3>${fineTypes().map((t) => `<div class="admin-item"><span>${esc(t.name)}</span><b>${money(t.price)}</b></div>`).join("") || `<p class="muted small">No hay tipos de multa.</p>`}</div>
    <div class="card"><h3>🙋 Mis multas</h3>${finesSummaryHtml(S.me)}</div>
    ${ranking.length ? `<div class="card" style="padding:4px 12px"><h3 style="margin-top:10px">🧾 Quién debe</h3>${ranking.map(([pid, v], i) => `<div class="rate-row flat" data-act="player" data-id="${pid}"><span class="rk">${i + 1}</span><span class="nm">${esc(pname(pid))}</span><span class="muted small">${v.n} ${v.n === 1 ? "multa" : "multas"}</span><span class="avg lo" style="font-size:18px">${money(v.sum)}</span></div>`).join("")}</div>` : ""}
    <div class="section-title"><h3>Todas las multas</h3></div>
    ${all.length ? all.map((f) => fineRow(f)).join("") : `<div class="card empty">Ninguna multa todavía.</div>`}`;
}
function fineForm(fid) {
  const f = S.fines.find((x) => x.id === fid) || {};
  const types = fineTypes();
  const t0 = types.find((t) => t.id === f.typeId) || types[0] || {};
  openModal(`<form data-form="fine" data-id="${fid || ""}">
    <h3>${fid ? "Editar multa" : "➕ Poner multa"}</h3>
    <label>Jugador</label><select name="playerId" required>${sortedPlayers().map((p) => `<option value="${p.id}" ${f.playerId === p.id ? "selected" : ""}>${esc(p.name)}${isStaff(p) ? "" : " #" + esc(p.number)}</option>`).join("")}</select>
    <label>Motivo</label><select name="typeId" data-fine-type>${types.map((t) => `<option value="${t.id}" data-price="${t.price}" ${(f.typeId || t0.id) === t.id ? "selected" : ""}>${esc(t.name)} (${money(t.price)})</option>`).join("")}<option value="otra" ${f.typeId === "otra" ? "selected" : ""}>Otra…</option></select>
    <label>Descripción (si es “Otra”)</label><input name="custom" value="${f.typeId === "otra" ? esc(f.name) : ""}" placeholder="Ej: no traer la equipación">
    <div class="row2"><div><label>Precio (€)</label><input type="number" step="0.5" min="0" name="price" required value="${esc(f.price ?? t0.price ?? 0)}"></div>
      <div><label>Fecha</label><input type="date" name="date" required value="${toDateInput(toDate(f.date) || new Date())}"></div></div>
    <label>Nota (opcional)</label><input name="note" maxlength="120" value="${esc(f.note || "")}">
    <label class="check"><input type="checkbox" name="paid" ${f.paid ? "checked" : ""}> Ya está pagada</label>
    <div class="acts">${fid ? `<button type="button" class="btn" data-act="fine-del" data-id="${fid}">🗑️ Quitar</button>` : ""}<button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
  </form>`);
}
async function saveFine(form) {
  const f = Object.fromEntries(new FormData(form));
  const t = fineTypes().find((x) => x.id === f.typeId);
  const name = f.typeId === "otra" ? (f.custom.trim() || "Otra multa") : t?.name || "Multa";
  const data = { playerId: f.playerId, typeId: f.typeId, name, price: Math.max(0, +f.price || 0), date: Timestamp.fromDate(new Date(f.date + "T12:00")), note: f.note.trim(), paid: !!f.paid };
  if (form.dataset.id) await updateDoc(doc(db, "fines", form.dataset.id), data);
  else await setDoc(doc(collection(db, "fines")), { ...data, createdAt: serverTimestamp() });
  toast("Multa guardada 💸");
}
function fineTypesForm() {
  const row = (t = {}) => `<div class="ft-row"><input name="tn" placeholder="Motivo" value="${esc(t.name || "")}"><input name="tp" type="number" step="0.5" min="0" placeholder="€" value="${esc(t.price ?? "")}"><input type="hidden" name="ti" value="${esc(t.id || "")}"><button type="button" class="btn sm" data-act="ft-del">✕</button></div>`;
  openModal(`<form data-form="finetypes">
    <h3>⚙️ Tipos de multa, precios y hucha</h3>
    <p class="muted small">Cambia el motivo o el precio, quita (✕) o añade tipos nuevos.</p>
    <div id="ftRows">${fineTypes().map(row).join("")}</div>
    <button type="button" class="btn sm" data-act="ft-add">➕ Añadir tipo</button>
    <label class="check"><input type="checkbox" name="applyUnpaid"> Aplicar los precios nuevos también a las multas que aún no se han pagado</label>
    <label>🍽️ Objetivo de la hucha para la cena (€)</label><input type="number" min="1" step="5" name="goal" value="${dinnerGoal()}">
    <template id="ftTpl">${row()}</template>
    <div class="acts"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
  </form>`);
}
async function saveFineTypes(form) {
  const fd = new FormData(form);
  const names = fd.getAll("tn"), prices = fd.getAll("tp"), ids = fd.getAll("ti");
  const types = names.map((n, i) => ({ id: ids[i] || slug(n) || "tipo-" + i, name: n.trim(), price: Math.max(0, +prices[i] || 0) })).filter((t) => t.name);
  await setDoc(doc(db, "config", "fines"), { types, goal: Math.max(1, +fd.get("goal") || 200) });
  if (fd.get("applyUnpaid")) {
    const bt = writeBatch(db); let n = 0;
    for (const f of S.fines) {
      const t = types.find((x) => x.id === f.typeId);
      if (!f.paid && t && (+f.price !== t.price || f.name !== t.name)) { bt.update(doc(db, "fines", f.id), { price: t.price, name: t.name }); n++; }
    }
    if (n) await bt.commit();
    toast(`Precios guardados · ${n} multas sin pagar actualizadas`);
  } else toast("Precios guardados");
}

// ----- perfil de un jugador (cualquiera) -----
function playerGoals(pid) {
  const list = S.matches.filter((m) => m.goals?.[pid] > 0).map((m) => ({ m, n: m.goals[pid] }));
  const base = +S.players.get(pid)?.goalsBase || 0;
  return { list, base, total: base + list.reduce((a, x) => a + x.n, 0) };
}
function goalsListHtml(pid) {
  const g = playerGoals(pid);
  if (!g.total) return `<p class="muted small">Todavía sin goles esta temporada.</p>`;
  return `${g.list.map(({ m, n }) => `<div class="rate-row flat" data-act="match" data-id="${m.id}"><span class="rk">${crestImg(m.crest)}</span>
      <span class="nm">${m.isHome !== false ? "vs" : "@"} ${esc(m.rival)} <span class="muted small">${toDate(m.date) ? fmtShort(toDate(m.date)) : ""}${resultOf(m) ? ` · ${m.golesGO}-${m.golesRival}` : ""}</span></span>
      <span></span><span class="avg hi">${n}</span></div>`).join("")}
    ${g.base ? `<div class="rate-row flat"><span class="rk">⚽</span><span class="nm">Goles anteriores <span class="muted small">(sin partido asignado)</span></span><span></span><span class="avg hi">${g.base}</span></div>` : ""}`;
}
function playerModal(pid) {
  const p = S.players.get(pid); if (!p) return;
  const g = playerGoals(pid);
  const r = seasonRatings()[pid];
  const att = S.matches.filter((m) => toDate(m.pollDeadline) && toDate(m.pollDeadline) < new Date());
  const went = att.filter((m) => m.votes?.[pid] === "si").length;
  openModal(`<div class="profile">${jersey(p)}
    <h2 style="margin-top:6px">${esc(p.fullName || p.name)}</h2>
    <div class="muted">${isStaff(p) ? esc(p.position) : "Dorsal " + esc(p.number)} · GAME OVER FC</div>
    ${(() => { const c = cardsTable().find(([x]) => x === pid)?.[1]; return c ? `<div style="margin-top:6px">🟨 ${c.y} · 🟥 ${c.r}</div>` : ""; })()}
    ${!isStaff(p) ? `<div class="stats">
      <div class="stat"><div class="v">⚽ ${g.total}</div><div class="l">Goles</div></div>
      <div class="stat"><div class="v">⭐ ${fmtAvg(r?.avg)}</div><div class="l">Valoración</div></div>
      <div class="stat"><div class="v">${went}/${att.length}</div><div class="l">Partidos</div></div>
    </div>` : ""}</div>
    ${!isStaff(p) ? `<h3 style="margin-top:16px">⚽ Goles</h3>${goalsListHtml(pid)}` : ""}
    <h3 style="margin-top:16px">💸 Multas</h3>${finesSummaryHtml(pid)}
    <div class="acts">${isAdmin() ? `<button class="btn" data-act="player-edit" data-id="${pid}">Editar</button>` : ""}<button class="btn primary" data-act="close">Cerrar</button></div>`);
}

// ----- perfil -----
function attendance(list) {
  const closed = list.filter((x) => toDate(x.pollDeadline) && toDate(x.pollDeadline) < new Date());
  const yes = closed.filter((x) => x.votes?.[S.me] === "si").length;
  return { yes, total: closed.length, pct: closed.length ? Math.round((yes / closed.length) * 100) : 0 };
}
function viewProfile() {
  const p = me();
  const back = backToMore();
  const am = attendance(S.matches), at = attendance(S.trainings);
  const season = seasonRatings();
  const my = season[S.me];
  const ranking = Object.entries(season).filter(([pid]) => S.players.has(pid)).sort((a, b) => b[1].avg - a[1].avg);
  const myComments = S.matches.filter((m) => S.ratings.has(m.id)).reverse().flatMap((m) =>
    (S.ratings.get(m.id) || []).filter((r) => r.comments?.[S.me]).map((r) => ({ m, text: r.comments[S.me], score: r.scores?.[S.me] }))).slice(0, 15);
  return `${back}${notifBanner()}
    <div class="card profile hero">
      ${jersey(p)}
      <h2 style="margin-top:8px">${esc(p.fullName || p.name)}</h2>
      <div class="muted">${isStaff(p) ? esc(p.position) : "Dorsal " + esc(p.number)} · GAME OVER FC ${p.role === "admin" ? ` · <span class="tag gold">ADMIN</span>` : ""}</div>
      <div class="stats">
        <div class="stat"><div class="v">${am.yes}/${am.total}</div><div class="l">Partidos</div></div>
        <div class="stat"><div class="v">${at.yes}/${at.total}</div><div class="l">Entrenos</div></div>
        <div class="stat"><div class="v">${Math.round((am.pct + at.pct) / ((am.total ? 1 : 0) + (at.total ? 1 : 0) || 1))}%</div><div class="l">Asistencia</div></div>
      </div>
      ${!isStaff(p) ? (() => { const g = scorersTable().find(([pid]) => pid === S.me); return `<div class="stat" style="margin-top:10px"><div class="v">⚽ ${g ? g[1].goals : 0}</div><div class="l">Goles esta temporada${g ? ` · en ${g[1].matches} ${g[1].matches === 1 ? "partido" : "partidos"}` : ""}</div></div>`; })() : ""}
      ${!isStaff(p) ? `<div class="stat" style="margin-top:10px"><div class="v">⭐ ${fmtAvg(my?.avg)}</div><div class="l">Media de valoraciones${my ? ` · ${my.n} notas en ${my.matches.size} ${my.matches.size === 1 ? "partido" : "partidos"}` : ""}</div></div>` : ""}
    </div>
    ${!isStaff(p) ? `<div class="card"><h3>⚽ Mis goles</h3>${goalsListHtml(S.me)}</div>` : ""}
    <div class="card"><h3>💸 Mis multas</h3>${finesSummaryHtml(S.me)}</div>
    ${myComments.length ? `<div class="card"><h3>💬 Lo que dicen de ti</h3>${myComments.map((c) => `<div class="cmt"><b>🕶️ Anónimo</b>${c.score ? ` <span class="muted">(${c.score})</span>` : ""} · <span class="muted small">${c.m.isHome !== false ? "vs" : "@"} ${esc(c.m.rival)}</span><br>${esc(c.text)}</div>`).join("")}</div>` : ""}
    <div class="card"><h3>🏆 Ranking de valoraciones</h3>
      ${ranking.length ? ranking.map(([pid, v], i) => `<div class="rate-row flat ${pid === S.me ? "meRow" : ""}" data-act="player" data-id="${pid}"><span class="rk">${["🥇", "🥈", "🥉"][i] || i + 1}</span><span class="nm">${esc(pname(pid))}</span><span class="muted small">${v.matches.size} ${v.matches.size === 1 ? "partido" : "partidos"}</span><span class="avg ${v.avg >= 7 ? "hi" : v.avg < 5 ? "lo" : ""}">${fmtAvg(v.avg)}</span></div>`).join("")
        : `<p class="muted small">Aún no hay valoraciones. Después de cada partido, valorad a los compañeros desde el partido.</p>`}
    </div>
    <div class="card">
      <h3>Notificaciones</h3>
      <p class="muted small">Te avisamos cuando se publique la hora del partido y cuando se abra la encuesta del entreno.</p>
      <button class="btn primary block" data-act="notif">🔔 ${("Notification" in window) && Notification.permission === "granted" ? "Volver a registrar este móvil" : "Activar notificaciones"}</button>
    </div>
    <div class="section-title"><h3>Plantilla</h3></div>
    <p class="muted small">Toca una camiseta para ver el perfil del jugador.</p>
    <div class="pick-grid">${sortedPlayers().map((x) => `<div class="pick" data-act="player" data-id="${x.id}">${jersey(x)}<div class="lbl">${esc(x.name)}${playerGoals(x.id).total ? ` · ⚽ ${playerGoals(x.id).total}` : ""}</div></div>`).join("")}</div>`;
}

// ---------- notificaciones push ----------
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
const platform = () => isIOS() ? "iPhone" : /android/i.test(navigator.userAgent) ? "Android" : "Ordenador";
// on | off | denied | ios-install | unsupported
function notifState() {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return isIOS() && !isStandalone() ? "ios-install" : "unsupported";
  if (Notification.permission === "granted") return "on";
  if (Notification.permission === "denied") return "denied";
  return "off";
}
async function saveToken(reg) {
  const token = await getToken(getMessaging(fb), { vapidKey: self.VAPID_KEY, serviceWorkerRegistration: reg });
  await setDoc(doc(db, "tokens", S.uid), { token, playerId: S.me, updatedAt: serverTimestamp(), platform: platform(), ua: navigator.userAgent.slice(0, 200) });
}
// Ventana que aparece al abrir la app si no tiene las notificaciones activadas
function notifPrompt(force = false) {
  const st = notifState();
  if (st === "on" || st === "unsupported") return;
  // Sale cada vez que se entra en la app (al abrirla o al volver tras un rato fuera); se puede cerrar
  if (!force && Date.now() - (S.notifAskedAt || 0) < 10 * 60 * 1000) return;
  if ($modal.open) return;
  S.notifAskedAt = Date.now();
  const why = `<p class="muted small">Te avisaremos cuando se publique la <b>hora del partido</b>, se abra la <b>encuesta del entreno</b> o el <b>Fantasy</b>, y cuando haya <b>fotos nuevas</b>.</p>`;
  const body = {
    off: `<h3>🔔 Activa las notificaciones</h3>${why}<p class="small">Pulsa <b>Activar</b> y luego <b>Permitir</b>.</p>
      <div class="acts"><button class="btn" data-act="close">Ahora no</button><button class="btn primary" data-act="notif">🔔 Activar</button></div>`,
    "ios-install": `<h3>🔔 Activa las notificaciones</h3>${why}
      <p class="small">En iPhone primero hay que <b>instalar la app</b>:</p>
      <ol class="small steps"><li>Abre esta página en <b>Safari</b>.</li><li>Pulsa <b>Compartir</b> (el cuadrado con la flecha ⬆️).</li><li>Elige <b>“Añadir a pantalla de inicio”</b> → Añadir.</li><li><b>Abre la app desde el icono</b> del escudo y pulsa <b>Activar</b>.</li></ol>
      <div class="acts"><button class="btn primary" data-act="close">Entendido</button></div>`,
    denied: `<h3>🔕 Tienes las notificaciones bloqueadas</h3>${why}
      <ol class="small steps">${isIOS() ? `<li>Abre <b>Ajustes</b> del iPhone → <b>Notificaciones</b>.</li><li>Busca <b>Game Over FC</b> y activa <b>Permitir notificaciones</b>.</li>`
        : `<li>Mantén pulsado el icono de la app → <b>Información de la aplicación</b> (o en Chrome: el candado 🔒 junto a la dirección).</li><li><b>Notificaciones</b> → <b>Permitir</b>.</li>`}<li>Vuelve a abrir la app.</li></ol>
      <div class="acts"><button class="btn primary" data-act="close">Entendido</button></div>`,
  }[st];
  openModal(`<button class="modal-x" data-act="close" aria-label="Cerrar">✕</button>${body}`);
}
async function enableNotifications() {
  if (!(await isSupported().catch(() => false)) || !("Notification" in window)) {
    return toast(/iphone|ipad/i.test(navigator.userAgent) ? "En iPhone: instala la app en la pantalla de inicio y ábrela desde allí" : "Este navegador no admite notificaciones");
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") { if ($modal.open) $modal.close(); toast("No has permitido las notificaciones"); return notifPrompt(true); }
  try {
    if (!S.swReg) S.swReg = await navigator.serviceWorker.register("./sw.js");
    await navigator.serviceWorker.ready;
    await saveToken(S.swReg);
    if ($modal.open) $modal.close();
    toast("🔔 Notificaciones activadas");
    render();
  } catch (e) { toast("Error activando avisos: " + e.message); }
}
async function setupForegroundPush() {
  if (!(await isSupported().catch(() => false))) { deleteDoc(doc(db, "tokens", S.uid)).catch(() => {}); return; }
  onMessage(getMessaging(fb), (payload) => toast(`${payload.notification?.title || ""} — ${payload.notification?.body || ""}`));
  // Refresca el token en silencio si ya hay permiso; si se quitó el permiso, se borra (así el admin ve la lista real)
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      const reg = S.swReg || await navigator.serviceWorker.register("./sw.js");
      await navigator.serviceWorker.ready;
      await saveToken(reg);
    } catch (e) { console.warn(e); }
  } else {
    deleteDoc(doc(db, "tokens", S.uid)).catch(() => {});
  }
}

// =====================================================================
//  PANEL DE ADMINISTRACIÓN (solo role == "admin")
// =====================================================================
function viewAdmin() {
  const sub = [["partidos", "Partidos"], ["avisos", "🔔 Avisos"], ["fantasy", "Fantasy"], ["entrenos", "Entrenos"], ["clasif", "Clasificación"], ["jugadores", "Jugadores y permisos"], ["ajustes", "Ajustes"]];
  const body = { partidos: adminMatches, avisos: adminPush, fantasy: adminFantasy, entrenos: adminTrainings, clasif: adminStandings, jugadores: adminPlayers, ajustes: adminSettings }[S.adminTab]();
  return `${backToMore()}<div class="section-title"><h2>Administración</h2></div>
    <div class="subtabs">${sub.map(([k, l]) => `<button class="btn sm ${S.adminTab === k ? "on" : ""}" data-act="atab" data-tab="${k}">${l}</button>`).join("")}</div>
    ${body}`;
}

function adminMatches() {
  return `<button class="btn primary block" data-act="match-edit">➕ Añadir partido</button>
    <p class="muted small">Los partidos se sincronizan solos con la web de la liga. Si editas uno a mano, marca “No sobrescribir con la web” para que la sincronización no lo cambie. Al poner la hora se abre la votación y se envía la notificación a todos (en unos minutos).</p>
    <div class="card" style="padding:4px 12px">${S.matches.map((m) => {
      const d = toDate(m.date);
      return `<div class="admin-item"><div><b>${m.jornada ? "J" + m.jornada + " · " : ""}${m.isHome !== false ? "vs" : "@"} ${esc(m.rival)}</b><br>
        <span class="muted small">${d ? fmtShort(d) + (m.timeKnown ? " " + fmtTime(d) : " (sin hora)") : "sin fecha"} ${resultOf(m) ? "· " + m.golesGO + "-" + m.golesRival : ""} ${m.manual ? "· ✋ manual" : ""}</span></div>
        <div class="acts"><button class="btn sm" data-act="date-edit" data-id="${m.id}">📅</button><button class="btn sm" data-act="match-edit" data-id="${m.id}">Editar</button></div></div>`;
    }).join("") || `<div class="empty">Sin partidos</div>`}</div>`;
}

function adminTrainings() {
  return `<button class="btn primary block" data-act="train-edit">➕ Crear encuesta de entreno</button>
    <p class="muted small">Cada martes a las 10:00 se abre automáticamente la encuesta del entreno del miércoles, que cierra el miércoles a las ${S.cfg.trainingDeadlineHour ?? 14}:00 (puedes desactivarlo en Ajustes).</p>
    <div class="card" style="padding:4px 12px">${S.trainings.map((t) => `<div class="admin-item"><div><b>${cap(fmtDay(toDate(t.date)))}</b><br>
      <span class="muted small">${esc(t.time || "")} ${t.place ? "· " + esc(t.place) : ""} · ${Object.values(t.votes || {}).filter((v) => v === "si").length} van</span></div>
      <div class="acts"><button class="btn sm" data-act="train-edit" data-id="${t.id}">Editar</button></div></div>`).join("") || `<div class="empty">Sin entrenos</div>`}</div>`;
}

function adminPush() {
  const tk = S.tokens || {};
  const list = sortedPlayers().filter((p) => p.uid);
  const on = list.filter((p) => tk[p.id]);
  const last = (S.pushReqs || [])[0];
  const res = (pid) => {
    if (!last) return "";
    if (last.acks?.[pid]) return `<span class="tag ok">👀 Abierta</span>`;
    if (last.status !== "sent") return `<span class="tag">⏳</span>`;
    const r = last.results?.[pid];
    return r === "ok" ? `<span class="tag ok">✅ Le llegó</span>` : r ? `<span class="tag ko">⚠️ Falló</span>` : `<span class="tag">—</span>`;
  };
  return `<div class="stats" style="margin-top:0">
      <div class="stat"><div class="v">${on.length}/${list.length}</div><div class="l">Con avisos</div></div>
      <div class="stat"><div class="v">${list.length - on.length}</div><div class="l">Sin avisos</div></div>
      <div class="stat"><div class="v">${sortedPlayers().length - list.length}</div><div class="l">Sin entrar</div></div>
    </div>
    <form class="card" data-form="push" style="margin-top:12px">
      <h3>📣 Enviar notificación</h3>
      <label>Título</label><input name="title" maxlength="60" required value="🔔 Prueba de notificaciones">
      <label>Mensaje</label><input name="body" maxlength="160" required value="Si te llega este aviso, ¡las notificaciones funcionan! Tócalo para confirmarlo.">
      <p class="muted small">Se envía a todos los que tienen los avisos activados. Llega en unos minutos (lo manda la tarea automática). Después verás aquí a quién le llegó y quién la abrió.</p>
      <div class="acts"><button class="btn primary" type="submit">📣 Enviar</button></div>
    </form>
    <div class="card" style="padding:4px 12px"><h3 style="margin-top:10px">👥 Jugadores</h3>
      ${list.map((p) => { const t = tk[p.id]; return `<div class="admin-item"><div><b>${t ? "✅" : "❌"} ${esc(p.name)}</b><br><span class="muted small">${t ? `${esc(t.platform || "Móvil")} · actualizado ${toDate(t.updatedAt) ? fmtShort(toDate(t.updatedAt)) : "—"}` : "Sin notificaciones activadas"}</span></div><div class="acts">${res(p.id)}</div></div>`; }).join("")}
      ${sortedPlayers().filter((p) => !p.uid).length ? `<p class="muted small">Aún no han entrado en la app: ${sortedPlayers().filter((p) => !p.uid).map((p) => esc(p.name)).join(", ")}</p>` : ""}
    </div>
    ${(S.pushReqs || []).length ? `<div class="card" style="padding:4px 12px"><h3 style="margin-top:10px">🕑 Últimos envíos</h3>${S.pushReqs.slice(0, 8).map((r) => `<div class="admin-item"><div><b>${esc(r.title)}</b><br><span class="muted small">${toDate(r.createdAt) ? fmt(toDate(r.createdAt), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "ahora"} · ${r.status === "sent" ? `llegó a ${r.okCount ?? 0} de ${r.total ?? 0}` : "⏳ en cola"} · 👀 ${Object.keys(r.acks || {}).length} abiertas</span></div></div>`).join("")}</div>` : ""}`;
}

function adminFantasy() {
  const p = { ...PTS_DEF, ...(S.cfg.fantasyPts || {}) };
  return `<div class="card">
    <h3>🎯 Cómo funciona</h3>
    <p class="small muted">Cada partido tiene su Fantasy. En <b>Automático</b> se abre solo y se cierra al empezar el partido. Puedes <b>abrirlo a mano</b> cuando quieras (con o sin hora de cierre), <b>cerrarlo</b>, o <b>desactivarlo</b> para que no cuente. Al acabar, pon el resultado, quién fue, el quinteto inicial y los goleadores en <b>📝 Resultado</b> y los puntos se calculan solos.</p>
  </div>
  <div class="card" style="padding:4px 12px">${S.matches.map((m) => {
    const [cls, label] = fxState(m); const n = S.preds.get(m.id)?.size || 0; const d = toDate(m.date);
    return `<div class="admin-item"><div style="display:flex;gap:8px;align-items:center">${crestImg(m.crest)}<div><b>${m.isHome !== false ? "vs" : "@"} ${esc(m.rival)}</b><br>
      <span class="muted small">${d ? fmtShort(d) : "sin fecha"} · ${n} ${n === 1 ? "predicción" : "predicciones"} · ${FX_LABEL[fxStatus(m)]}</span></div></div>
      <div class="acts"><span class="fxb ${cls}">${label}</span><button class="btn sm" data-act="fxadmin" data-id="${m.id}">⚙️</button></div></div>`;
  }).join("") || `<div class="empty">No hay partidos. Créalos en Admin → Partidos.</div>`}</div>
  <form class="card" data-form="fxpts">
    <h3>🏅 Puntos</h3>
    <div class="row2"><div><label>⚽ Por goleador acertado</label><input type="number" min="0" max="20" name="scorer" value="${p.scorer}"></div>
      <div><label>👟 Por titular acertado</label><input type="number" min="0" max="20" name="starter" value="${p.starter}"></div></div>
    <div class="row2"><div><label>🧤 Por acertar el portero</label><input type="number" min="0" max="20" name="gk" value="${p.gk}"></div>
      <div><label>Máx. goleadores a elegir</label><input type="number" min="1" max="12" name="maxScorers" value="${p.maxScorers}"></div></div>
    <p class="muted small">Si cambias los puntos, la clasificación se recalcula entera con los nuevos valores.</p>
    <div class="acts"><button class="btn primary" type="submit">Guardar puntos</button></div>
  </form>`;
}
function fxAdminForm(mid) {
  const m = S.matches.find((x) => x.id === mid);
  const st = fxStatus(m); const n = S.preds.get(mid)?.size || 0;
  openModal(`<form data-form="fxadmin" data-id="${mid}">
    <h3>⚙️ Fantasy · ${m.isHome !== false ? "vs" : "@"} ${esc(m.rival)}</h3>
    <p class="muted small">Estado actual: <b>${fxState(m)[1]}</b> · ${n} ${n === 1 ? "predicción" : "predicciones"}</p>
    <label>Modo</label>
    <select name="status">
      <option value="auto" ${st === "auto" ? "selected" : ""}>🤖 Automático (abierto hasta que empiece el partido)</option>
      <option value="open" ${st === "open" ? "selected" : ""}>🟢 Abierto ahora (lo abro yo)</option>
      <option value="closed" ${st === "closed" ? "selected" : ""}>🔒 Cerrado (no se puede predecir)</option>
      <option value="off" ${st === "off" ? "selected" : ""}>⛔ Desactivado (no cuenta para la clasificación)</option>
    </select>
    <label>Cierre (solo para “Abierto ahora”; vacío = hasta que lo cierre yo)</label>
    <input type="datetime-local" name="closesAt" value="${toLocalInput(toDate(m.fantasy?.closesAt)) || (m.timeKnown ? toLocalInput(toDate(m.date)) : "")}">
    <p class="muted small">Al abrirlo a mano se avisa a todos con una notificación (en menos de 1 hora).</p>
    <div class="acts"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
    <div class="acts">
      <button type="button" class="btn sm" data-act="fx" data-id="${mid}">👀 Ver predicciones</button>
      <button type="button" class="btn sm wine" data-act="goals" data-id="${mid}">📝 Resultado</button>
      ${n ? `<button type="button" class="btn sm" data-act="fxreset" data-id="${mid}">🗑️ Borrar todas</button>` : ""}
    </div>
  </form>`);
}
async function saveFxAdmin(form) {
  const f = Object.fromEntries(new FormData(form));
  const m = S.matches.find((x) => x.id === form.dataset.id);
  const fantasy = { status: f.status, closesAt: f.status === "open" && f.closesAt ? Timestamp.fromDate(new Date(f.closesAt)) : null };
  // avisar de nuevo solo si se pasa a "abierto" desde otro estado
  fantasy.notified = f.status === "open" ? (fxStatus(m) === "open" ? !!m.fantasy?.notified : false) : !!m.fantasy?.notified;
  await updateDoc(doc(db, "matches", m.id), { fantasy });
  toast(`Fantasy: ${FX_LABEL[f.status]}`);
}

function adminStandings() {
  return `<form class="card" data-form="standings">
    <h3>Actualizar clasificación</h3>
    <ol class="small muted" style="padding-left:18px;line-height:1.6">
      <li>Abre la clasificación en la web: <a href="${esc(leagueUrl())}" target="_blank" rel="noopener">ligacomarcal.com</a></li>
      <li>Mantén pulsado sobre la página → <b>Seleccionar todo</b> → <b>Copiar</b>.</li>
      <li>Vuelve aquí, pégalo abajo y pulsa <b>Actualizar</b>.</li>
    </ol>
    <textarea name="text" rows="7" placeholder="Pega aquí el texto de la clasificación…" required></textarea>
    <div class="acts"><button class="btn primary" type="submit">Actualizar</button></div>
  </form>`;
}

function adminPlayers() {
  return `<button class="btn primary block" data-act="player-edit">➕ Añadir jugador</button>
    <p class="muted small">“Liberar” desvincula el móvil de ese jugador (por si cambia de teléfono o alguien eligió mal). Puedes nombrar a otros administradores o quitar permisos; siempre debe quedar al menos uno.</p>
    <div class="card" style="padding:4px 12px">${sortedPlayers().map((p) => `<div class="admin-item">
      <div><b>#${esc(p.number)} ${esc(p.name)}</b> ${p.role === "admin" ? `<span class="tag gold">ADMIN</span>` : ""}<br>
        <span class="muted small">${esc(p.fullName || "")} ${p.uid ? "· 📱 vinculado" : "· libre"}</span></div>
      <div class="acts">
        <button class="btn sm" data-act="player-edit" data-id="${p.id}">Editar</button>
        <button class="btn sm ${p.role === "admin" ? "" : "wine"}" data-act="toggle-admin" data-id="${p.id}">${p.role === "admin" ? "Quitar admin" : "Hacer admin"}</button>
        ${p.uid ? `<button class="btn sm" data-act="release" data-id="${p.id}">Liberar</button>` : ""}
      </div></div>`).join("")}</div>`;
}

const DAYS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
function adminSettings() {
  const c = S.cfg;
  return `<form class="card" data-form="settings">
    <h3>Votación de partidos</h3>
    <div class="row2">
      <div><label>Cierra el día</label><select name="pollWeekday">${DAYS.slice(1).map((d, i) => `<option value="${i + 1}" ${+c.pollWeekday === i + 1 ? "selected" : ""}>${d}</option>`).join("")}</select></div>
      <div><label>A las (hora)</label><input type="number" name="pollHour" min="0" max="23" value="${esc(c.pollHour)}"></div>
    </div>
    <h3 style="margin-top:16px">Entrenos</h3>
    <label class="check"><input type="checkbox" name="trainingAuto" ${c.trainingAuto !== false ? "checked" : ""}> Abrir encuesta automática cada martes a las 10:00</label>
    <div class="row2">
      <div><label>Hora del entreno</label><input type="time" name="trainingTime" value="${esc(c.trainingTime || "")}"></div>
      <div><label>Cierre votación entreno (hora)</label><input type="number" name="trainingDeadlineHour" min="0" max="23" value="${esc(c.trainingDeadlineHour ?? 14)}"></div>
    </div>
    <label>Lugar del entreno</label><input name="trainingPlace" value="${esc(c.trainingPlace || "")}" placeholder="Pabellón…">
    <h3 style="margin-top:16px">Liga</h3>
    <label>URL de la clasificación en ligacomarcal.com</label><input name="leagueUrl" value="${esc(c.leagueUrl || "")}">
    <div class="acts"><button class="btn primary" type="submit">Guardar ajustes</button></div>
  </form>`;
}

// ----- formularios del admin (modal) -----
function openModal(html) {
  if ($modal.open) $modal.scrollTop = 0;
  $modal.innerHTML = html;
  if (!$modal.open) $modal.showModal();
}
function updateModal(html) { if ($modal.open) morph($modal, html); }
function confirmBox(title, text) {
  return new Promise((res) => {
    openModal(`<h3>${title}</h3><p class="muted">${text}</p><div class="acts"><button class="btn" data-r="0">Cancelar</button><button class="btn primary" data-r="1">Confirmar</button></div>`);
    $modal.onclick = (e) => { const b = e.target.closest("[data-r]"); if (b) { $modal.onclick = null; $modal.close(); res(b.dataset.r === "1"); } };
  });
}

function matchForm(m = {}) {
  const d = toDate(m.date);
  openModal(`<form data-form="match" data-id="${m.id || ""}">
    <h3>${m.id ? "Editar partido" : "Nuevo partido"}</h3>
    <div class="row2"><div><label>Jornada</label><input type="number" name="jornada" value="${esc(m.jornada ?? "")}"></div>
      <div><label>Condición</label><select name="isHome"><option value="1" ${m.isHome !== false ? "selected" : ""}>Local</option><option value="0" ${m.isHome === false ? "selected" : ""}>Visitante</option></select></div></div>
    <label>Rival</label><input name="rival" required value="${esc(m.rival || "")}">
    <label>Escudo del rival</label><select name="crest"><option value="">(sin escudo)</option>${Object.entries(CRESTS).map(([k, n]) =>
      `<option value="crests/${k}.png" ${m.crest === `crests/${k}.png` ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>
    <label>…o enlace a la imagen del escudo (para equipos nuevos)</label><input name="crestUrl" type="url" placeholder="https://…" value="${m.crest && /^https?:/.test(m.crest) ? esc(m.crest) : ""}">
    <div class="row2"><div><label>Fecha</label><input type="date" name="date" value="${toDateInput(d)}"></div>
      <div><label>Hora (vacío = sin publicar)</label><input type="time" name="time" value="${m.timeKnown ? toTimeInput(d) : ""}"></div></div>
    <label>Pabellón</label><input name="venue" value="${esc(m.venue || "")}">
    <div class="row2"><div><label>Goles Game Over</label><input type="number" min="0" name="golesGO" value="${esc(m.golesGO ?? "")}"></div>
      <div><label>Goles rival</label><input type="number" min="0" name="golesRival" value="${esc(m.golesRival ?? "")}"></div></div>
    ${m.id ? scorersInputs(m) : ""}
    <label>Cierre de la votación (vacío = automático: ${DAYS[S.cfg.pollWeekday]} ${S.cfg.pollHour}:00)</label>
    <input type="datetime-local" name="pollDeadline" value="${toLocalInput(toDate(m.pollDeadline))}">
    <label class="check"><input type="checkbox" name="manual" ${m.manual || !m.id ? "checked" : ""}> No sobrescribir con la web de la liga</label>
    <div class="acts">${m.id ? `<button type="button" class="btn" data-act="match-del" data-id="${m.id}">🗑️ Borrar</button>` : ""}
      <button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
  </form>`);
}

function dateForm(m) {
  const d = toDate(m.date);
  openModal(`<form data-form="date" data-id="${m.id}">
    <h3>📅 Fecha y hora</h3>
    <p class="muted small">${m.isHome !== false ? "GAME OVER FC vs " : ""}${esc(m.rival)}${m.isHome === false ? " vs GAME OVER FC" : ""}</p>
    <div class="row2"><div><label>Día</label><input type="date" name="date" required value="${toDateInput(d)}"></div>
      <div><label>Hora</label><input type="time" name="time" value="${m.timeKnown ? toTimeInput(d) : ""}"></div></div>
    <label>Pabellón</label><input name="venue" value="${esc(m.venue || "")}">
    <p class="muted small">Al guardar la hora se abre la votación (cierra el ${DAYS[S.cfg.pollWeekday].toLowerCase()} a las ${S.cfg.pollHour}:00 de esa semana) y se avisa a todos con una notificación.</p>
    <div class="acts"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
  </form>`);
}

async function saveDate(form) {
  const f = Object.fromEntries(new FormData(form));
  const m = S.matches.find((x) => x.id === form.dataset.id);
  const date = new Date(`${f.date}T${f.time || "00:00"}`);
  const timeKnown = !!f.time;
  const dl = timeKnown ? computeDeadline(date) : null;
  await updateDoc(doc(db, "matches", m.id), {
    date: Timestamp.fromDate(date), timeKnown, venue: f.venue.trim(),
    pollDeadline: dl ? Timestamp.fromDate(dl) : null, manual: true, updatedAt: serverTimestamp(),
  });
  toast(timeKnown ? "Hora guardada · se avisará a todos 🔔" : "Fecha guardada");
}

function trainingForm(t = {}) {
  const d = toDate(t.date);
  openModal(`<form data-form="training" data-id="${t.id || ""}">
    <h3>${t.id ? "Editar entreno" : "Nuevo entreno"}</h3>
    <div class="row2"><div><label>Fecha</label><input type="date" name="date" required value="${toDateInput(d)}"></div>
      <div><label>Hora</label><input type="time" name="time" value="${esc(t.time ?? S.cfg.trainingTime ?? "")}"></div></div>
    <label>Lugar</label><input name="place" value="${esc(t.place ?? S.cfg.trainingPlace ?? "")}">
    <label>Nota</label><input name="note" value="${esc(t.note || "")}" placeholder="Ej: traer peto blanco">
    <label>Cierre de la votación</label><input type="datetime-local" name="pollDeadline" required value="${toLocalInput(toDate(t.pollDeadline))}">
    <div class="acts">${t.id ? `<button type="button" class="btn" data-act="train-del" data-id="${t.id}">🗑️ Borrar</button>` : ""}
      <button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
  </form>`);
}

function playerForm(p = {}) {
  openModal(`<form data-form="player" data-id="${p.id || ""}">
    <h3>${p.id ? "Editar jugador" : "Nuevo jugador"}</h3>
    <div class="row2"><div><label>Nombre camiseta</label><input name="name" required value="${esc(p.name || "")}"></div>
      <div><label>Dorsal</label><input name="number" required value="${esc(p.number ?? "")}"></div></div>
    <label>Nombre completo</label><input name="fullName" value="${esc(p.fullName || "")}">
    <label>Posición</label><select name="position">${["Jugador", "Portero", "Entrenador", "Fotógrafo"].map((x) => `<option ${p.position === x ? "selected" : ""}>${x}</option>`).join("")}</select>
    <label>Goles anteriores sin partido asignado</label><input type="number" min="0" name="goalsBase" value="${esc(p.goalsBase || 0)}">
    <div class="row2"><div><label>🟨 Amarillas anteriores</label><input type="number" min="0" name="cardsBaseY" value="${esc(p.cardsBase?.y || 0)}"></div>
      <div><label>🟥 Rojas anteriores</label><input type="number" min="0" name="cardsBaseR" value="${esc(p.cardsBase?.r || 0)}"></div></div>
    <div class="acts">${p.id ? `<button type="button" class="btn" data-act="player-del" data-id="${p.id}">🗑️ Borrar</button>` : ""}
      <button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
  </form>`);
}

async function saveMatch(form) {
  const f = Object.fromEntries(new FormData(form));
  const id = form.dataset.id || `m-${f.date || "sin-fecha"}-${slug(f.rival)}`;
  let date = null, timeKnown = false;
  if (f.date) { date = new Date(`${f.date}T${f.time || "00:00"}`); timeKnown = !!f.time; }
  const old = S.matches.find((m) => m.id === id);
  const dateChanged = !old || toDate(old.date)?.getTime() !== date?.getTime();
  const dlUntouched = old && f.pollDeadline === toLocalInput(toDate(old.pollDeadline));
  let dl = f.pollDeadline && !(dateChanged && dlUntouched) ? new Date(f.pollDeadline) : (timeKnown ? computeDeadline(date) : null);
  const data = {
    jornada: f.jornada ? +f.jornada : null, rival: f.rival.trim(), isHome: f.isHome === "1",
    date: date ? Timestamp.fromDate(date) : null, timeKnown, venue: f.venue.trim(), crest: (f.crestUrl || "").trim() || f.crest || null,
    golesGO: f.golesGO === "" ? null : +f.golesGO, golesRival: f.golesRival === "" ? null : +f.golesRival,
    pollDeadline: dl ? Timestamp.fromDate(dl) : null, manual: !!f.manual, updatedAt: serverTimestamp(),
  };
  if (form.querySelector('input[name^="g_"]')) data.goals = readGoals(form);
  if (!old) Object.assign(data, { votes: {}, notified: false, source: "admin" });
  await setDoc(doc(db, "matches", id), data, { merge: true });
  toast("Partido guardado");
}

async function saveTraining(form) {
  const f = Object.fromEntries(new FormData(form));
  const id = form.dataset.id || `t-${f.date}`;
  const data = {
    date: Timestamp.fromDate(new Date(`${f.date}T${f.time || "12:00"}`)), time: f.time, place: f.place.trim(), note: f.note.trim(),
    pollDeadline: Timestamp.fromDate(new Date(f.pollDeadline)), updatedAt: serverTimestamp(),
  };
  if (!S.trainings.find((t) => t.id === id)) Object.assign(data, { votes: {}, notified: false, source: "admin" });
  await setDoc(doc(db, "trainings", id), data, { merge: true });
  toast("Entreno guardado");
}

async function savePlayer(form) {
  const f = Object.fromEntries(new FormData(form));
  const data = { name: f.name.trim().toUpperCase(), number: f.number.trim(), fullName: f.fullName.trim(), position: f.position, goalsBase: Math.max(0, +f.goalsBase || 0),
    cardsBase: { y: Math.max(0, +f.cardsBaseY || 0), r: Math.max(0, +f.cardsBaseR || 0) } };
  if (form.dataset.id) await updateDoc(doc(db, "players", form.dataset.id), data);
  else await setDoc(doc(db, "players", `${slug(f.name)}-${slug(f.number)}`), { ...data, role: "player", uid: null, active: true });
  toast("Jugador guardado");
}

async function toggleAdmin(pid) {
  const p = S.players.get(pid);
  const admins = [...S.players.values()].filter((x) => x.role === "admin");
  if (p.role === "admin" && admins.length <= 1) return toast("Debe quedar al menos un administrador");
  const becoming = p.role !== "admin";
  const ok = await confirmBox(becoming ? `¿Hacer admin a ${esc(p.name)}?` : `¿Quitar admin a ${esc(p.name)}?`,
    becoming ? "Podrá modificar partidos, entrenos, jugadores y permisos." : pid === S.me ? "Perderás el acceso al panel de administración." : "Dejará de ver el panel de administración.");
  if (!ok) return;
  await updateDoc(doc(db, "players", pid), { role: becoming ? "admin" : "player" });
  toast("Permisos actualizados");
}

async function release(pid) {
  const p = S.players.get(pid);
  const ok = await confirmBox(`¿Liberar a ${esc(p.name)}?`, "Su móvil quedará desvinculado y el jugador podrá volver a elegirse.");
  if (!ok) return;
  const b = writeBatch(db);
  b.update(doc(db, "players", pid), { uid: null, claimedAt: deleteField() });
  if (p.uid) { b.delete(doc(db, "users", p.uid)); b.delete(doc(db, "tokens", p.uid)); }
  await b.commit();
  toast("Usuario liberado");
}

// ---------- eventos ----------
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const { act, id } = b.dataset;
  try {
    switch (act) {
      case "pick": return claim(id);
      case "tab": if (b.dataset.tab === "fotos" && S.tab === "fotos") S.albumOpen = null; S.tab = b.dataset.tab; window.scrollTo(0, 0); return render();
      case "atab": S.adminTab = b.dataset.tab; return render();
      case "ctab": S.clasTab = b.dataset.tab; return render();
      case "vote": return vote(b.dataset.kind, id, b.dataset.v);
      case "notif": return enableNotifications();
      case "notif-help": return notifPrompt(true);
      case "match": {
        return openMatchModal(id);
      }
      case "close": S.openMatch = null; return $modal.close();
      case "rate": return rateForm(id);
      case "goals": return goalsForm(id);
      case "predict": return predictForm(id);
      case "cards": return cardsForm(id);
      case "slot": S.court.picking = b.dataset.pos; return drawCourt();
      case "slotcancel": S.court.picking = null; return drawCourt();
      case "slotclear": delete S.court.pos[S.court.picking]; S.court.picking = null; return drawCourt();
      case "slotpick": {
        const c = S.court, prev = c.pos[c.picking];
        const other = Object.entries(c.pos).find(([k, v]) => v === id && k !== c.picking)?.[0];
        if (other) { if (prev) c.pos[other] = prev; else delete c.pos[other]; } // intercambiar posiciones
        c.pos[c.picking] = id; c.picking = null;
        return drawCourt();
      }
      case "fx": return fantasyMatchModal(id);
      case "album": S.albumOpen = id; window.scrollTo(0, 0); return render();
      case "album-back": S.albumOpen = null; return render();
      case "photo": return openPhoto(id, +b.dataset.i);
      case "photo-dl": return downloadPhoto(id, +b.dataset.i);
      case "photo-del": $modal.close(); return deletePhoto(id, +b.dataset.i);
      case "fine-edit": return fineForm(id);
      case "fine-types": return fineTypesForm();
      case "fine-paid": { const f = S.fines.find((x) => x.id === id); await updateDoc(doc(db, "fines", id), { paid: !f.paid }); return toast(f.paid ? "Marcada como pendiente" : "Multa pagada ✓"); }
      case "fine-del": if (await confirmBox("¿Quitar esta multa?", "Se borrará del todo.")) { await deleteDoc(doc(db, "fines", id)); toast("Multa quitada"); } return;
      case "ft-add": { const box = $modal.querySelector("#ftRows"); box.insertAdjacentHTML("beforeend", $modal.querySelector("#ftTpl").innerHTML); return; }
      case "ft-del": return b.closest(".ft-row").remove();
      case "fxadmin": return fxAdminForm(id);
      case "atab-fx": S.tab = "admin"; S.adminTab = "fantasy"; return render();
      case "fxdel": {
        if (!(await confirmBox("¿Borrar esta predicción?", `Se borrará la predicción de ${esc(pname(b.dataset.pid))}.`))) return;
        await deleteDoc(doc(db, "matches", id, "predictions", b.dataset.pid)); toast("Predicción borrada"); return fantasyMatchModal(id);
      }
      case "fxreset": {
        const list = [...(S.preds.get(id)?.keys() || [])];
        if (!(await confirmBox("¿Borrar TODAS las predicciones?", `Se borrarán ${list.length} predicciones de este partido.`))) return;
        const bt = writeBatch(db); list.forEach((pid) => bt.delete(doc(db, "matches", id, "predictions", pid))); await bt.commit();
        toast("Predicciones borradas"); return;
      }
      case "player": return playerModal(id);
      case "g-plus": case "g-minus": {
        const inp = b.parentElement.querySelector("input");
        inp.value = Math.max(0, Math.min(+inp.max || 30, (+inp.value || 0) + (act === "g-plus" ? 1 : -1)));
        return updateGoalSum();
      }
      case "match-edit": matchForm(S.matches.find((x) => x.id === id)); return updateGoalSum();
      case "date-edit": return dateForm(S.matches.find((x) => x.id === id));
      case "train-edit": {
        const t = S.trainings.find((x) => x.id === id);
        if (t) return trainingForm(t);
        const wed = new Date(); wed.setDate(wed.getDate() + ((3 - wed.getDay() + 7) % 7 || 7));
        const dl = new Date(wed); dl.setHours(S.cfg.trainingDeadlineHour ?? 14, 0, 0, 0);
        return trainingForm({ date: wed, pollDeadline: dl });
      }
      case "player-edit": return playerForm(S.players.get(id));
      case "toggle-admin": return toggleAdmin(id);
      case "release": return release(id);
      case "match-del": if (await confirmBox("¿Borrar partido?", "Se perderán sus votos.")) { await deleteDoc(doc(db, "matches", id)); toast("Borrado"); } return;
      case "train-del": if (await confirmBox("¿Borrar entreno?", "Se perderán sus votos.")) { await deleteDoc(doc(db, "trainings", id)); toast("Borrado"); } return;
      case "player-del": {
        const p = S.players.get(id);
        if (p.role === "admin" && [...S.players.values()].filter((x) => x.role === "admin").length <= 1) return toast("No puedes borrar al último admin");
        if (await confirmBox(`¿Borrar a ${esc(p.name)}?`, "Desaparecerá de la plantilla.")) {
          const bt = writeBatch(db);
          bt.delete(doc(db, "players", id));
          if (p.uid) { bt.delete(doc(db, "users", p.uid)); bt.delete(doc(db, "tokens", p.uid)); }
          await bt.commit(); toast("Jugador borrado");
        }
        return;
      }
    }
  } catch (err) { toast("Error: " + err.message); }
});

document.addEventListener("submit", async (e) => {
  const form = e.target.closest("[data-form]");
  if (!form) return;
  e.preventDefault();
  try {
    const kind = form.dataset.form;
    if (kind === "match") await saveMatch(form);
    if (kind === "date") await saveDate(form);
    if (kind === "predict") await savePrediction(form);
    if (kind === "push") {
      const f = Object.fromEntries(new FormData(form));
      await setDoc(doc(collection(db, "pushRequests")), { title: f.title.trim(), body: f.body.trim(), status: "pending", by: S.me, createdAt: serverTimestamp() });
      toast("📣 Notificación en cola: llegará en unos minutos");
    }
    if (kind === "fine") await saveFine(form);
    if (kind === "finetypes") await saveFineTypes(form);
    if (kind === "fxadmin") await saveFxAdmin(form);
    if (kind === "fxpts") {
      const f = Object.fromEntries(new FormData(form));
      await setDoc(doc(db, "config", "app"), { fantasyPts: { scorer: +f.scorer, starter: +f.starter, gk: +f.gk, maxScorers: Math.max(1, +f.maxScorers) } }, { merge: true });
      toast("Puntos guardados · clasificación recalculada");
    }
    if (kind === "cards") await saveCards(form);
    if (kind === "goals") { await saveGoals(form); openMatchModal(form.dataset.id); return; }
    if (kind === "rate") { await saveRatings(form); S.openMatch = form.dataset.id; openMatchModal(form.dataset.id); return; }
    if (kind === "standings") {
      const teams = parseStandings(new FormData(form).get("text"));
      if (!teams.length) return toast("No encuentro la clasificación en ese texto. Copia toda la página de la clasificación.");
      await setDoc(doc(db, "config", "clasificacion"), { teams, updatedAt: serverTimestamp(), source: "admin" });
      form.reset();
      toast(`Clasificación actualizada (${teams.length} equipos) ✅`);
      return;
    }
    if (kind === "training") await saveTraining(form);
    if (kind === "player") await savePlayer(form);
    if (kind === "settings") {
      const f = Object.fromEntries(new FormData(form));
      await setDoc(doc(db, "config", "app"), {
        pollWeekday: +f.pollWeekday, pollHour: +f.pollHour, trainingAuto: !!f.trainingAuto, trainingTime: f.trainingTime,
        trainingDeadlineHour: +f.trainingDeadlineHour, trainingPlace: f.trainingPlace.trim(), leagueUrl: f.leagueUrl.trim(),
      }, { merge: true });
      toast("Ajustes guardados");
    }
    if ($modal.open) $modal.close();
  } catch (err) { toast("Error: " + err.message); }
});

document.addEventListener("change", (e) => {
  if (e.target.dataset?.upload) { uploadPhotos(e.target.dataset.upload, e.target.files); e.target.value = ""; return; }
  if (e.target.matches?.("[data-fine-type]")) {
    const opt = e.target.selectedOptions[0]; const pr = e.target.form.querySelector('[name="price"]');
    if (opt?.dataset.price && pr) pr.value = opt.dataset.price;
    return;
  }
  const box = e.target.closest?.(".chips[data-max]");
  if (!box || e.target.type !== "checkbox" || !e.target.checked) return;
  const max = +box.dataset.max;
  if (box.querySelectorAll("input:checked").length > max) { e.target.checked = false; toast(`Máximo ${max}`); }
});
document.addEventListener("input", (e) => { if (e.target.name?.startsWith("g_") || e.target.name === "golesGO") updateGoalSum(); });

$modal.addEventListener("close", () => { S.openMatch = null; });
