// =====================================================================
//  GAME OVER FC · App del equipo (PWA para Android e iOS)
// =====================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, onSnapshot, runTransaction, updateDoc, setDoc,
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
  cfg: { pollWeekday: 3, pollHour: 20, trainingTime: "21:00", trainingPlace: "", trainingAuto: true },
  clas: null, tab: "partidos", adminTab: "partidos", unsub: [], swReg: null,
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
  if (S.me && S.players.get(S.me).uid !== S.uid) S.me = null; // el admin ha liberado el usuario
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
const score = (m) => resultOf(m) ? (m.isHome !== false ? `${m.golesGO} - ${m.golesRival}` : `${m.golesRival} - ${m.golesGO}`) : "vs";

function nextMatch() {
  const now = Date.now();
  return S.matches.find((m) => !resultOf(m) && (!toDate(m.date) || toDate(m.date).getTime() > now - 3 * 36e5));
}

function matchCard(m, hero) {
  const d = toDate(m.date);
  const [h, a] = teams(m);
  const r = resultOf(m);
  return `<div class="card ${hero ? "hero" : ""}">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span class="tag ${hero ? "gold" : ""}">${hero ? "PRÓXIMO PARTIDO" : "PARTIDO"}${m.jornada ? " · JORNADA " + m.jornada : ""}</span>
      <span class="tag">${m.isHome !== false ? "🏠 Local" : "🚌 Visitante"}</span>
    </div>
    <div class="vs">
      <div class="team ${m.isHome !== false ? "go" : ""}">${esc(h)}</div>
      <div class="score ${r ? "res " + r : ""}">${score(m)}</div>
      <div class="team ${m.isHome === false ? "go" : ""}">${esc(a)}</div>
    </div>
    <div class="when">
      ${d ? `<div class="big">${cap(fmtDay(d))}</div>${m.timeKnown ? `<div>🕘 ${fmtTime(d)} h</div>` : `<div class="muted">Hora pendiente de publicar</div>`}` : `<div class="muted">Fecha por confirmar</div>`}
      ${m.venue ? `<div class="muted small">📍 ${esc(m.venue)}</div>` : ""}
    </div>
    ${m.pollDeadline ? pollBlock("match", m) : (!r ? `<p class="countdown">La votación de asistencia se abrirá cuando se publique la hora del partido.</p>` : "")}
  </div>`;
}

function viewMatches() {
  const nx = nextMatch();
  const played = S.matches.filter(resultOf);
  const W = played.filter((m) => resultOf(m) === "W").length, D = played.filter((m) => resultOf(m) === "D").length, L = played.length - W - D;
  return `${notifBanner()}
    ${nx ? matchCard(nx, true) : `<div class="card empty">No hay partidos pendientes ahora mismo.</div>`}
    <div class="section-title"><h2>Temporada 26/27</h2><span class="muted small">${W}V · ${D}E · ${L}D</span></div>
    <div class="card" style="padding:4px 12px">
      ${S.matches.length ? S.matches.map((m) => {
        const d = toDate(m.date), r = resultOf(m);
        return `<div class="match-row" data-act="match" data-id="${m.id}">
          <div class="j">${m.jornada ? "J" + m.jornada : "–"}<small>${d ? fmtShort(d) : ""}</small></div>
          <div class="t">${m.isHome !== false ? "vs " : "@ "}${esc(m.rival)}<small>${d && m.timeKnown ? fmt(d, { weekday: "short" }) + " " + fmtTime(d) : d ? "Hora por publicar" : ""}${m.venue ? " · " + esc(m.venue) : ""}</small></div>
          <div class="res ${r || ""}">${r ? `${m.golesGO}-${m.golesRival}` : m.id === nx?.id ? "Próx." : "—"}</div>
        </div>`;
      }).join("") : `<div class="empty">Aún no hay partidos. Se cargarán automáticamente desde la web de la liga.</div>`}
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
    ${current.length ? current.map(card).join("") : `<div class="card empty">Cada martes se abre la encuesta del entreno del miércoles. 💪</div>`}
    ${past.length ? `<div class="section-title"><h3>Anteriores</h3></div><div class="card" style="padding:4px 12px">${past.map((t) => {
      const y = Object.values(t.votes || {}).filter((v) => v === "si").length;
      return `<div class="admin-item"><span>${cap(fmtDay(toDate(t.date)))}</span><span class="tag ok">${y} fueron</span></div>`;
    }).join("")}</div>` : ""}`;
}

// ----- clasificación -----
function viewClas() {
  const c = S.clas;
  if (!c || !c.rows?.length) return `<div class="section-title"><h2>Clasificación</h2></div><div class="card empty">La clasificación se cargará en la próxima sincronización con la web de la liga.</div>`;
  const headers = c.headers || [];
  return `<div class="section-title"><h2>Clasificación</h2><span class="muted small">Cuarta División</span></div>
    <div class="card tbl-wrap"><table class="clas">
      ${headers.length ? `<tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>` : ""}
      ${c.rows.map((r) => `<tr class="${r.join(" ").toUpperCase().includes("GAME OVER") ? "me" : ""}">${r.map((x) => `<td>${esc(x)}</td>`).join("")}</tr>`).join("")}
    </table></div>
    <p class="muted small" style="text-align:center"><a href="${esc(S.cfg.leagueUrl || "#")}" target="_blank" rel="noopener">Ver en ligacomarcal.com</a></p>`;
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
    </div>
    <div class="card">
      <h3>Notificaciones</h3>
      <p class="muted small">Te avisamos cuando se publique la hora del partido y cuando se abra la encuesta del entreno.</p>
      <button class="btn primary block" data-act="notif">🔔 ${("Notification" in window) && Notification.permission === "granted" ? "Volver a registrar este móvil" : "Activar notificaciones"}</button>
    </div>
    <div class="section-title"><h3>Plantilla</h3></div>
    <div class="pick-grid">${sortedPlayers().map((x) => `<div class="pick" style="cursor:default">${jersey(x)}<div class="lbl">${esc(x.name)}</div></div>`).join("")}</div>`;
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
  const sub = [["partidos", "Partidos"], ["entrenos", "Entrenos"], ["jugadores", "Jugadores y permisos"], ["ajustes", "Ajustes"]];
  const body = { partidos: adminMatches, entrenos: adminTrainings, jugadores: adminPlayers, ajustes: adminSettings }[S.adminTab]();
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
        <div class="acts"><button class="btn sm" data-act="match-edit" data-id="${m.id}">Editar</button></div></div>`;
    }).join("") || `<div class="empty">Sin partidos</div>`}</div>`;
}

function adminTrainings() {
  return `<button class="btn primary block" data-act="train-edit">➕ Crear encuesta de entreno</button>
    <p class="muted small">Cada martes se crea automáticamente la encuesta del entreno del miércoles (puedes desactivarlo en Ajustes).</p>
    <div class="card" style="padding:4px 12px">${S.trainings.map((t) => `<div class="admin-item"><div><b>${cap(fmtDay(toDate(t.date)))}</b><br>
      <span class="muted small">${esc(t.time || "")} ${t.place ? "· " + esc(t.place) : ""} · ${Object.values(t.votes || {}).filter((v) => v === "si").length} van</span></div>
      <div class="acts"><button class="btn sm" data-act="train-edit" data-id="${t.id}">Editar</button></div></div>`).join("") || `<div class="empty">Sin entrenos</div>`}</div>`;
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
    <label class="check"><input type="checkbox" name="trainingAuto" ${c.trainingAuto !== false ? "checked" : ""}> Crear encuesta automática cada martes</label>
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
    <div class="row2"><div><label>Fecha</label><input type="date" name="date" value="${toDateInput(d)}"></div>
      <div><label>Hora (vacío = sin publicar)</label><input type="time" name="time" value="${m.timeKnown ? toTimeInput(d) : ""}"></div></div>
    <label>Pabellón</label><input name="venue" value="${esc(m.venue || "")}">
    <div class="row2"><div><label>Goles Game Over</label><input type="number" min="0" name="golesGO" value="${esc(m.golesGO ?? "")}"></div>
      <div><label>Goles rival</label><input type="number" min="0" name="golesRival" value="${esc(m.golesRival ?? "")}"></div></div>
    <label>Cierre de la votación (vacío = automático: ${DAYS[S.cfg.pollWeekday]} ${S.cfg.pollHour}:00)</label>
    <input type="datetime-local" name="pollDeadline" value="${toLocalInput(toDate(m.pollDeadline))}">
    <label class="check"><input type="checkbox" name="manual" ${m.manual || !m.id ? "checked" : ""}> No sobrescribir con la web de la liga</label>
    <div class="acts">${m.id ? `<button type="button" class="btn" data-act="match-del" data-id="${m.id}">🗑️ Borrar</button>` : ""}
      <button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
  </form>`);
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
    <div class="acts">${p.id ? `<button type="button" class="btn" data-act="player-del" data-id="${p.id}">🗑️ Borrar</button>` : ""}
      <button type="button" class="btn" data-act="close">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
  </form>`);
}

async function saveMatch(form) {
  const f = Object.fromEntries(new FormData(form));
  const id = form.dataset.id || `m-${f.date || "sin-fecha"}-${slug(f.rival)}`;
  let date = null, timeKnown = false;
  if (f.date) { date = new Date(`${f.date}T${f.time || "00:00"}`); timeKnown = !!f.time; }
  let dl = f.pollDeadline ? new Date(f.pollDeadline) : (timeKnown ? computeDeadline(date) : null);
  const data = {
    jornada: f.jornada ? +f.jornada : null, rival: f.rival.trim(), isHome: f.isHome === "1",
    date: date ? Timestamp.fromDate(date) : null, timeKnown, venue: f.venue.trim(),
    golesGO: f.golesGO === "" ? null : +f.golesGO, golesRival: f.golesRival === "" ? null : +f.golesRival,
    pollDeadline: dl ? Timestamp.fromDate(dl) : null, manual: !!f.manual, updatedAt: serverTimestamp(),
  };
  const old = S.matches.find((m) => m.id === id);
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
  const data = { name: f.name.trim().toUpperCase(), number: f.number.trim(), fullName: f.fullName.trim(), position: f.position };
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
      case "vote": return vote(b.dataset.kind, id, b.dataset.v);
      case "notif": return enableNotifications();
      case "match": {
        const m = S.matches.find((x) => x.id === id);
        openModal(`${matchCard(m, false).replace('class="card ', 'class="card-plain ')}<div class="acts"><button class="btn" data-act="close">Cerrar</button>${isAdmin() ? `<button class="btn primary" data-act="match-edit" data-id="${id}">Editar</button>` : ""}</div>`);
        return;
      }
      case "close": return $modal.close();
      case "match-edit": return matchForm(S.matches.find((x) => x.id === id));
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
