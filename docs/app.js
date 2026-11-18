// =====================================================================
//  GAME OVER FC · App del equipo (PWA para Android e iOS)
// =====================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, collectionGroup, onSnapshot, runTransaction, updateDoc, setDoc,
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
  clas: null, ratings: new Map(), tab: "partidos", adminTab: "partidos", unsub: [], swReg: null,
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
const sortedPlayers = () => [...S.players.values()].sort((a, b) =>
  (a.position === "Entrenador") - (b.position === "Entrenador") || (parseInt(a.number) || 999) - (parseInt(b.number) || 999));

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
  const coach = p.position === "Entrenador";
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
  ${coach ? `<text x="100" y="192" text-anchor="middle" font-family="Bebas Neue, sans-serif" font-size="16" fill="#d4af37">ENTRENADOR</text>` : ""}
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
    render();
  }));
  S.unsub.push(onSnapshot(collection(db, "trainings"), (s) => {
    S.trainings = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (toDate(b.date) ?? 0) - (toDate(a.date) ?? 0));
    render();
  }));
  S.unsub.push(onSnapshot(doc(db, "config", "app"), (s) => { if (s.exists()) Object.assign(S.cfg, s.data()); render(); }));
  S.unsub.push(onSnapshot(doc(db, "config", "clasificacion"), (s) => { S.clas = s.exists() ? s.data() : null; render(); }));
  // Valoraciones de todos los partidos: matches/{partido}/ratings/{quién valora}
  S.unsub.push(onSnapshot(collectionGroup(db, "ratings"), (snap) => {
    const map = new Map();
    for (const d of snap.docs) {
      const mid = d.ref.parent.parent.id;
      if (!map.has(mid)) map.set(mid, []);
      map.get(mid).push({ rater: d.id, ...d.data() });
    }
    S.ratings = map;
    if (!$modal.open) render(); else refreshMatchModal();
  }, (e) => console.warn("valoraciones:", e.message)));
  setupForegroundPush();
  clearInterval(S._tick); S._tick = setInterval(() => { if (!$modal.open && !["admin"].includes(S.tab)) render(); }, 30000);
}

function renderTabs() {
  const tabs = [["partidos", "⚽", "Partidos"], ["entrenos", "🏃", "Entrenos"], ["clasif", "🏆", "Clasificación"], ["perfil", "👕", "Perfil"]];
  if (isAdmin()) tabs.push(["admin", "🛠️", "Admin"]);
  $tabs.classList.remove("hidden");
  $tabs.innerHTML = tabs.map(([k, ic, l]) => `<button class="${S.tab === k ? "on" : ""}" data-act="tab" data-tab="${k}"><span class="ic">${ic}</span>${l}</button>`).join("");
}

function render() {
  if (!S.me) return;
  if (S.tab === "admin" && !isAdmin()) S.tab = "partidos";
  renderTabs();
  const scroll = window.scrollY;
  const views = { partidos: viewMatches, entrenos: viewTrainings, clasif: viewClas, perfil: viewProfile, admin: viewAdmin };
  $app.innerHTML = views[S.tab]();
  window.scrollTo(0, scroll);
}

function notifBanner() {
  if (!("Notification" in window)) {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    return ios ? `<div class="banner">📲 Para recibir avisos en iPhone, añade la app a la pantalla de inicio (Compartir → “Añadir a pantalla de inicio”) y ábrela desde allí.</div>` : "";
  }
  if (Notification.permission === "granted") return "";
  if (Notification.permission === "denied") return `<div class="banner">🔕 Has bloqueado las notificaciones. Actívalas en los ajustes del navegador para enterarte de los partidos.</div>`;
  return `<div class="banner">🔔 Activa los avisos para saber cuándo se publica la hora del partido.<button class="btn sm primary" data-act="notif">Activar</button></div>`;
}

// ----- votación (común a partidos y entrenos) -----
function pollBlock(kind, item) {
  const dl = toDate(item.pollDeadline);
  const votes = item.votes || {};
  const open = dl && dl > new Date();
  const mine = votes[S.me];
  const players = sortedPlayers();
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
const GO_CREST = "crests/game-over-fc.png";
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
  const list = sortedPlayers().filter((p) => p.position !== "Entrenador")
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
    ${scorersInputs(m)}
    <div class="acts"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
  </form>`);
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
    goals: readGoals(form), updatedAt: serverTimestamp(),
  });
  toast("Resultado y goleadores guardados ⚽");
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
  const lpRated = lp && (S.ratings.get(lp.id) || []).some((x) => x.rater === S.me);
  return `${notifBanner()}
    ${lp && !lpRated ? `<div class="banner">⭐ ¿Qué tal fue contra ${esc(lp.rival)}? Valora a tus compañeros.<button class="btn sm primary" data-act="rate" data-id="${lp.id}">Valorar</button></div>` : ""}
    ${nx ? matchCard(nx, true) : `<div class="card empty">No hay partidos pendientes ahora mismo.</div>`}
    <div class="section-title"><h2>Temporada 26/27</h2><span class="muted small">${W}V · ${D}E · ${L}D</span></div>
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
    ${current.length ? current.map(card).join("") : `<div class="card empty">La encuesta del entreno se abre el martes a las ${S.cfg.trainingOpenHour ?? 10}:00 y se cierra el miércoles a las ${S.cfg.trainingDeadlineHour ?? 20}:00. 💪</div>`}
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
  const toggle = `<div class="subtabs" style="margin-top:4px"><button class="btn sm ${S.clasTab !== "goles" ? "on" : ""}" data-act="ctab" data-tab="liga">🏆 Liga</button><button class="btn sm ${S.clasTab === "goles" ? "on" : ""}" data-act="ctab" data-tab="goles">⚽ Goleadores</button></div>`;
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

// ----- valoraciones -----
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
      (out[pid] ||= { sum: 0, n: 0, comments: [] }); out[pid].comments.push({ by: r.rater, text: t, score: r.scores?.[pid] });
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
function ratablePlayers(m, all = false) {
  const list = sortedPlayers().filter((p) => p.position !== "Entrenador" && p.id !== S.me);
  const yes = list.filter((p) => m.votes?.[p.id] === "si");
  return all || !yes.length ? list : yes;
}
const pname = (id) => S.players.get(id)?.name || "Ex-jugador";

function ratingsBlock(m) {
  if (!matchStarted(m)) return "";
  const r = matchRatings(m.id);
  const mine = (S.ratings.get(m.id) || []).find((x) => x.rater === S.me);
  const rated = Object.entries(r).filter(([, v]) => v.n || v.comments.length)
    .sort((a, b) => (b[1].avg ?? 0) - (a[1].avg ?? 0));
  const raters = (S.ratings.get(m.id) || []).length;
  return `<div class="ratings">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <div class="bebas" style="font-size:22px">⭐ Valoraciones</div>
      <button class="btn sm ${mine ? "" : "primary"}" data-act="rate" data-id="${m.id}">${mine ? "✏️ Editar mis notas" : "⭐ Valorar"}</button>
    </div>
    <p class="muted small" style="margin:4px 0 8px">${raters ? `${raters} ${raters === 1 ? "persona ha" : "personas han"} valorado` : "Nadie ha valorado todavía. ¡Sé el primero!"}</p>
    ${rated.map(([pid, v], i) => `<details class="rate-row">
      <summary><span class="rk">${i === 0 && v.avg ? "🏅" : i + 1}</span><span class="nm">${esc(pname(pid))}${pid === S.me ? " (tú)" : ""}</span>
        <span class="muted small">${v.n} ${v.n === 1 ? "nota" : "notas"}${v.comments.length ? ` · 💬 ${v.comments.length}` : ""}</span>
        <span class="avg ${v.avg >= 7 ? "hi" : v.avg && v.avg < 5 ? "lo" : ""}">${fmtAvg(v.avg)}</span></summary>
      ${v.comments.length ? v.comments.map((c) => `<div class="cmt"><b>${esc(pname(c.by))}</b>${c.score ? ` <span class="muted">(${c.score})</span>` : ""}: ${esc(c.text)}</div>`).join("") : `<div class="cmt muted">Sin comentarios</div>`}
    </details>`).join("")}
  </div>`;
}

function rateForm(mid, all = false) {
  const m = S.matches.find((x) => x.id === mid);
  const mine = (S.ratings.get(mid) || []).find((x) => x.rater === S.me) || {};
  const list = ratablePlayers(m, all);
  openModal(`<form data-form="rate" data-id="${mid}">
    <h3>⭐ Valorar · ${m.isHome !== false ? "vs" : "@"} ${esc(m.rival)}</h3>
    <p class="muted small">Pon nota del 1 al 10 a cada compañero (deja “–” si no quieres valorarlo) y, si quieres, un comentario. Puedes cambiarlo cuando quieras.</p>
    ${list.map((p) => {
      const v = mine.scores?.[p.id] ?? "";
      return `<div class="rate-edit">
        <div class="re-head"><b>${esc(p.name)}</b> <span class="muted small">#${esc(p.number)}</span>
          <select name="s_${p.id}">${["", 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<option value="${n}" ${String(v) === String(n) ? "selected" : ""}>${n === "" ? "–" : n}</option>`).join("")}</select></div>
        <input name="c_${p.id}" maxlength="200" placeholder="Comentario (opcional)" value="${esc(mine.comments?.[p.id] || "")}">
      </div>`;
    }).join("")}
    ${!all && ratablePlayers(m).length < ratablePlayers(m, true).length ? `<button type="button" class="btn sm ghost" data-act="rate-all" data-id="${mid}">Mostrar toda la plantilla</button>` : ""}
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
  const prev = (S.ratings.get(form.dataset.id) || []).find((x) => x.rater === S.me) || {};
  const shown = new Set([...f.keys()].map((k) => k.slice(2)));
  for (const [pid, v] of Object.entries(prev.scores || {})) if (!shown.has(pid)) scores[pid] = v;
  for (const [pid, v] of Object.entries(prev.comments || {})) if (!shown.has(pid)) comments[pid] = v;
  await setDoc(doc(db, "matches", form.dataset.id, "ratings", S.me), { scores, comments, updatedAt: serverTimestamp() });
  toast("¡Notas guardadas! ⭐");
}

function openMatchModal(id) {
  const m = S.matches.find((x) => x.id === id);
  if (!m) return;
  S.openMatch = id;
  openModal(`${matchCard(m, false).replace('class="card ', 'class="card-plain ')}
    ${ratingsBlock(m)}
    <div class="acts"><button class="btn" data-act="close">Cerrar</button>${isAdmin() ? `${matchStarted(m) ? `<button class="btn wine" data-act="goals" data-id="${id}">📝 Resultado y goleadores</button>` : ""}<button class="btn primary" data-act="match-edit" data-id="${id}">Editar</button>` : ""}</div>`);
}
function refreshMatchModal() {
  if ($modal.open && S.openMatch && $modal.querySelector(".ratings")) {
    const open = [...$modal.querySelectorAll("details[open] .nm")].map((x) => x.textContent);
    openMatchModal(S.openMatch);
    $modal.querySelectorAll("details").forEach((d) => { if (open.includes(d.querySelector(".nm")?.textContent)) d.open = true; });
  }
}
// Último partido jugado (para animar a valorar)
function lastPlayed() {
  const past = S.matches.filter((m) => matchStarted(m) && toDate(m.date) && Date.now() - toDate(m.date) < 10 * 864e5);
  return past[past.length - 1];
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
    <div class="muted">${p.position === "Entrenador" ? "Entrenador" : "Dorsal " + esc(p.number)} · GAME OVER FC</div>
    ${p.position !== "Entrenador" ? `<div class="stats">
      <div class="stat"><div class="v">⚽ ${g.total}</div><div class="l">Goles</div></div>
      <div class="stat"><div class="v">⭐ ${fmtAvg(r?.avg)}</div><div class="l">Valoración</div></div>
      <div class="stat"><div class="v">${went}/${att.length}</div><div class="l">Partidos</div></div>
    </div>` : ""}</div>
    ${p.position !== "Entrenador" ? `<h3 style="margin-top:16px">⚽ Goles</h3>${goalsListHtml(pid)}` : ""}
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
  const am = attendance(S.matches), at = attendance(S.trainings);
  const season = seasonRatings();
  const my = season[S.me];
  const ranking = Object.entries(season).filter(([pid]) => S.players.has(pid)).sort((a, b) => b[1].avg - a[1].avg);
  const myComments = S.matches.filter((m) => S.ratings.has(m.id)).reverse().flatMap((m) =>
    (S.ratings.get(m.id) || []).filter((r) => r.comments?.[S.me]).map((r) => ({ m, by: r.rater, text: r.comments[S.me], score: r.scores?.[S.me] }))).slice(0, 15);
  return `${notifBanner()}
    <div class="card profile hero">
      ${jersey(p)}
      <h2 style="margin-top:8px">${esc(p.fullName || p.name)}</h2>
      <div class="muted">${p.position === "Entrenador" ? "Entrenador" : "Dorsal " + esc(p.number)} · GAME OVER FC ${p.role === "admin" ? ` · <span class="tag gold">ADMIN</span>` : ""}</div>
      <div class="stats">
        <div class="stat"><div class="v">${am.yes}/${am.total}</div><div class="l">Partidos</div></div>
        <div class="stat"><div class="v">${at.yes}/${at.total}</div><div class="l">Entrenos</div></div>
        <div class="stat"><div class="v">${Math.round((am.pct + at.pct) / ((am.total ? 1 : 0) + (at.total ? 1 : 0) || 1))}%</div><div class="l">Asistencia</div></div>
      </div>
      ${p.position !== "Entrenador" ? (() => { const g = scorersTable().find(([pid]) => pid === S.me); return `<div class="stat" style="margin-top:10px"><div class="v">⚽ ${g ? g[1].goals : 0}</div><div class="l">Goles esta temporada${g ? ` · en ${g[1].matches} ${g[1].matches === 1 ? "partido" : "partidos"}` : ""}</div></div>`; })() : ""}
      ${p.position !== "Entrenador" ? `<div class="stat" style="margin-top:10px"><div class="v">⭐ ${fmtAvg(my?.avg)}</div><div class="l">Media de valoraciones${my ? ` · ${my.n} notas en ${my.matches.size} ${my.matches.size === 1 ? "partido" : "partidos"}` : ""}</div></div>` : ""}
    </div>
    ${p.position !== "Entrenador" ? `<div class="card"><h3>⚽ Mis goles</h3>${goalsListHtml(S.me)}</div>` : ""}
    ${myComments.length ? `<div class="card"><h3>💬 Lo que dicen de ti</h3>${myComments.map((c) => `<div class="cmt"><b>${esc(pname(c.by))}</b>${c.score ? ` <span class="muted">(${c.score})</span>` : ""} · <span class="muted small">${c.m.isHome !== false ? "vs" : "@"} ${esc(c.m.rival)}</span><br>${esc(c.text)}</div>`).join("")}</div>` : ""}
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
async function enableNotifications() {
  if (!(await isSupported().catch(() => false)) || !("Notification" in window)) {
    return toast(/iphone|ipad/i.test(navigator.userAgent) ? "En iPhone: instala la app en la pantalla de inicio y ábrela desde allí" : "Este navegador no admite notificaciones");
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return toast("Permiso de notificaciones denegado");
  try {
    if (!S.swReg) S.swReg = await navigator.serviceWorker.register("./sw.js");
    await navigator.serviceWorker.ready;
    const token = await getToken(getMessaging(fb), { vapidKey: self.VAPID_KEY, serviceWorkerRegistration: S.swReg });
    await setDoc(doc(db, "tokens", S.uid), { token, playerId: S.me, updatedAt: serverTimestamp(), ua: navigator.userAgent.slice(0, 200) });
    toast("🔔 Notificaciones activadas");
    render();
  } catch (e) { toast("Error activando avisos: " + e.message); }
}
async function setupForegroundPush() {
  if (!(await isSupported().catch(() => false))) return;
  onMessage(getMessaging(fb), (payload) => toast(`${payload.notification?.title || ""} — ${payload.notification?.body || ""}`));
  // Refresca el token en silencio si ya hay permiso
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      const reg = S.swReg || await navigator.serviceWorker.register("./sw.js");
      await navigator.serviceWorker.ready;
      const token = await getToken(getMessaging(fb), { vapidKey: self.VAPID_KEY, serviceWorkerRegistration: reg });
      await setDoc(doc(db, "tokens", S.uid), { token, playerId: S.me, updatedAt: serverTimestamp(), ua: navigator.userAgent.slice(0, 200) });
    } catch (e) { console.warn(e); }
  }
}

// =====================================================================
//  PANEL DE ADMINISTRACIÓN (solo role == "admin")
// =====================================================================
function viewAdmin() {
  const sub = [["partidos", "Partidos"], ["entrenos", "Entrenos"], ["clasif", "Clasificación"], ["jugadores", "Jugadores y permisos"], ["ajustes", "Ajustes"]];
  const body = { partidos: adminMatches, entrenos: adminTrainings, clasif: adminStandings, jugadores: adminPlayers, ajustes: adminSettings }[S.adminTab]();
  return `<div class="section-title"><h2>Administración</h2></div>
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
    <p class="muted small">Cada martes a las 10:00 se abre automáticamente la encuesta del entreno del miércoles, que cierra el miércoles a las 20:00 (puedes desactivarlo en Ajustes).</p>
    <div class="card" style="padding:4px 12px">${S.trainings.map((t) => `<div class="admin-item"><div><b>${cap(fmtDay(toDate(t.date)))}</b><br>
      <span class="muted small">${esc(t.time || "")} ${t.place ? "· " + esc(t.place) : ""} · ${Object.values(t.votes || {}).filter((v) => v === "si").length} van</span></div>
      <div class="acts"><button class="btn sm" data-act="train-edit" data-id="${t.id}">Editar</button></div></div>`).join("") || `<div class="empty">Sin entrenos</div>`}</div>`;
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
      <div><label>Cierre votación entreno (hora)</label><input type="number" name="trainingDeadlineHour" min="0" max="23" value="${esc(c.trainingDeadlineHour ?? 20)}"></div>
    </div>
    <label>Lugar del entreno</label><input name="trainingPlace" value="${esc(c.trainingPlace || "")}" placeholder="Pabellón…">
    <h3 style="margin-top:16px">Liga</h3>
    <label>URL de la clasificación en ligacomarcal.com</label><input name="leagueUrl" value="${esc(c.leagueUrl || "")}">
    <div class="acts"><button class="btn primary" type="submit">Guardar ajustes</button></div>
  </form>`;
}

// ----- formularios del admin (modal) -----
function openModal(html) { $modal.innerHTML = html; $modal.showModal(); }
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
    <label>Posición</label><select name="position">${["Jugador", "Portero", "Entrenador"].map((x) => `<option ${p.position === x ? "selected" : ""}>${x}</option>`).join("")}</select>
    <label>Goles anteriores sin partido asignado</label><input type="number" min="0" name="goalsBase" value="${esc(p.goalsBase || 0)}">
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
    date: date ? Timestamp.fromDate(date) : null, timeKnown, venue: f.venue.trim(), crest: f.crest || null,
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
  const data = { name: f.name.trim().toUpperCase(), number: f.number.trim(), fullName: f.fullName.trim(), position: f.position, goalsBase: Math.max(0, +f.goalsBase || 0) };
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
      case "tab": S.tab = b.dataset.tab; window.scrollTo(0, 0); return render();
      case "atab": S.adminTab = b.dataset.tab; return render();
      case "ctab": S.clasTab = b.dataset.tab; return render();
      case "vote": return vote(b.dataset.kind, id, b.dataset.v);
      case "notif": return enableNotifications();
      case "match": {
        return openMatchModal(id);
      }
      case "close": S.openMatch = null; return $modal.close();
      case "rate": return rateForm(id);
      case "goals": return goalsForm(id);
      case "player": return playerModal(id);
      case "g-plus": case "g-minus": {
        const inp = b.parentElement.querySelector("input");
        inp.value = Math.max(0, Math.min(30, (+inp.value || 0) + (act === "g-plus" ? 1 : -1)));
        return updateGoalSum();
      }
      case "rate-all": return rateForm(id, true);
      case "match-edit": matchForm(S.matches.find((x) => x.id === id)); return updateGoalSum();
      case "date-edit": return dateForm(S.matches.find((x) => x.id === id));
      case "train-edit": {
        const t = S.trainings.find((x) => x.id === id);
        if (t) return trainingForm(t);
        const wed = new Date(); wed.setDate(wed.getDate() + ((3 - wed.getDay() + 7) % 7 || 7));
        const dl = new Date(wed); dl.setHours(S.cfg.trainingDeadlineHour ?? 20, 0, 0, 0);
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

document.addEventListener("input", (e) => { if (e.target.name?.startsWith("g_") || e.target.name === "golesGO") updateGoalSum(); });
