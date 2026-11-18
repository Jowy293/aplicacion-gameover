"""Sincroniza partidos, resultados y clasificación del GAME OVER FC desde ligacomarcal.com
y envía la notificación cuando se publica (o cambia) la hora del partido.

El lector es "tolerante": busca en las páginas de la competición cualquier bloque que contenga
"GAME OVER" y extrae fecha, hora, rival, resultado y jornada. Guarda el HTML descargado en
scripts/debug/ para poder ajustar el lector si la web cambia.
"""
import os
import re
import sys
import unicodedata
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urljoin

import requests
import urllib3
from bs4 import BeautifulSoup

from common import TZ, compute_deadline, get_config, human, init, now, send_push

TEAM_RE = re.compile(r"game\s*over", re.I)
DATE_RE = re.compile(r"\b(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?\b")
DATE_TXT_RE = re.compile(r"\b(\d{1,2})\s+(?:de\s+)?(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z]*\.?(?:\s+(?:de\s+)?(\d{4}))?", re.I)
TIME_RE = re.compile(r"\b([01]?\d|2[0-3])[:h.]([0-5]\d)\s*(?:h|hrs?)?\b", re.I)
SCORE_RE = re.compile(r"(?<![\d/:.])(\d{1,2})\s*[-–:]\s*(\d{1,2})(?![\d/:.])")
JORNADA_RE = re.compile(r"jornada\s*(\d{1,2})", re.I)
MESES = {m: i + 1 for i, m in enumerate(["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"])}
NOISE = re.compile(r"^(vs\.?|v|-|–|:|jornada.*|j\d+|\d+|local|visitante|resultado|fecha|hora|pista|pabell[oó]n.*|ver.*|acta.*|detalles?)$", re.I)

DEBUG_DIR = Path(__file__).parent / "debug"
S = requests.Session()
S.headers["User-Agent"] = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36"


def fetch(url):
    try:
        r = S.get(url, timeout=30)
    except requests.exceptions.SSLError:
        # ligacomarcal.com sirve una cadena de certificados incompleta; es una página pública de solo lectura.
        urllib3.disable_warnings()
        r = S.get(url, timeout=30, verify=False)
    r.raise_for_status()
    DEBUG_DIR.mkdir(exist_ok=True)
    name = re.sub(r"[^a-z0-9]+", "_", url.lower())[-80:] + ".html"
    (DEBUG_DIR / name).write_text(r.text, encoding="utf-8")
    return r.text


def norm(s):
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def season_year(month):
    """Temporada 26/27: de agosto a diciembre -> 2026, de enero a julio -> 2027."""
    return 2026 if month >= 8 else 2027


# ---------------------------------------------------------------- clasificación
def parse_standings(soup):
    for table in soup.find_all("table"):
        if not TEAM_RE.search(table.get_text(" ")):
            continue
        headers, rows = [], []
        for tr in table.find_all("tr"):
            cells = [c.get_text(" ", strip=True) for c in tr.find_all(["th", "td"])]
            if not any(cells):
                continue
            if tr.find("th") and not headers and not rows:
                headers = cells
            else:
                rows.append(cells)
        if rows:
            return headers, rows
    # Plan B: listas tipo div (sin <table>)
    return [], []


# ---------------------------------------------------------------- partidos
def parse_block(node):
    text = node.get_text(" ", strip=True)
    frags = [f.strip() for f in node.stripped_strings if f.strip()]
    clean = DATE_RE.sub(" ", DATE_TXT_RE.sub(" ", TIME_RE.sub(" ", text)))

    date = None
    m = DATE_RE.search(text)
    if m:
        d, mo = int(m.group(1)), int(m.group(2))
        y = m.group(3)
        y = (2000 + int(y) if len(y) == 2 else int(y)) if y else season_year(mo)
        try:
            date = datetime(y, mo, d, tzinfo=TZ)
        except ValueError:
            date = None
    if not date:
        m = DATE_TXT_RE.search(text)
        if m:
            mo = MESES[m.group(2).lower()[:3]]
            y = int(m.group(3)) if m.group(3) else season_year(mo)
            date = datetime(y, mo, int(m.group(1)), tzinfo=TZ)

    time_known = False
    tm = TIME_RE.search(text)
    if date and tm and not (tm.group(1) == "00" and tm.group(2) == "00"):
        date = date.replace(hour=int(tm.group(1)), minute=int(tm.group(2)))
        time_known = True

    # equipos: fragmentos de texto que no son fecha/hora/números/ruido
    names = []
    for f in frags:
        f2 = DATE_TXT_RE.sub(" ", DATE_RE.sub(" ", TIME_RE.sub(" ", f)))
        f2 = re.sub(r"\s+", " ", f2).strip(" ·|,-–:")
        if SCORE_RE.fullmatch(f2) or NOISE.match(f2) or len(f2) < 3:
            continue
        if f2 not in names:
            names.append(f2)
    go_idx = next((i for i, n in enumerate(names) if TEAM_RE.search(n)), None)
    if go_idx is None:
        return None
    others = [n for n in names if not TEAM_RE.search(n) and not JORNADA_RE.search(n)]
    if not others:
        return None
    # rival = el nombre más cercano al de GAME OVER
    rival = min(others, key=lambda n: abs(names.index(n) - go_idx))
    is_home = go_idx < names.index(rival)

    goals = None
    sm = SCORE_RE.search(clean)
    if sm:
        goals = (int(sm.group(1)), int(sm.group(2)))
    else:
        nums = [f for f in frags if re.fullmatch(r"\d{1,2}", f)]
        if len(nums) == 2 and not JORNADA_RE.search(text):
            goals = (int(nums[0]), int(nums[1]))

    jornada = None
    jm = JORNADA_RE.search(text)
    if not jm:
        prev = node.find_previous(string=JORNADA_RE)
        jm = JORNADA_RE.search(prev) if prev else None
    if jm:
        jornada = int(jm.group(1))

    venue = ""
    vm = re.search(r"(pabell[oó]n|polideportivo|pista|pav\.)\s*[^|\n]{0,60}", text, re.I)
    if vm:
        venue = TIME_RE.sub("", DATE_RE.sub("", vm.group(0))).strip(" -·|,")

    res = {"rival": rival[:60], "isHome": is_home, "date": date, "timeKnown": time_known, "jornada": jornada, "venue": venue}
    if goals and (not date or date < now() + timedelta(hours=2)):
        g_home, g_away = goals
        res["golesGO"], res["golesRival"] = (g_home, g_away) if is_home else (g_away, g_home)
    return res


def parse_matches(html):
    soup = BeautifulSoup(html, "html.parser")
    found, seen = [], set()
    for s in soup.find_all(string=TEAM_RE):
        node = s.parent
        for _ in range(7):
            t = node.get_text(" ", strip=True)
            if len(t) > 600:
                break
            if (DATE_RE.search(t) or DATE_TXT_RE.search(t)) and len([x for x in node.stripped_strings]) >= 3:
                break
            if node.parent is None:
                break
            node = node.parent
        if id(node) in seen or len(node.get_text(" ", strip=True)) > 600:
            continue
        seen.add(id(node))
        m = parse_block(node)
        if m:
            found.append(m)
    return found


def match_id(m):
    if m.get("jornada"):
        return f"j{m['jornada']:02d}"
    d = m["date"].strftime("%Y-%m-%d") if m.get("date") else "sin-fecha"
    return f"m-{d}-{norm(m['rival'])}"


# ---------------------------------------------------------------- guardar + notificar
def upsert(db, matches, cfg):
    changed = 0
    for m in matches:
        ref = db.collection("matches").document(match_id(m))
        snap = ref.get()
        old = snap.to_dict() if snap.exists else None
        if old and old.get("manual"):
            continue  # editado a mano por el admin
        data = {k: v for k, v in m.items() if v is not None and v != ""}
        data["source"] = "liga"
        date_changed = old is not None and old.get("date") != m.get("date")
        if m.get("date") and m.get("timeKnown") and (date_changed or not (old and old.get("pollDeadline"))):
            data["pollDeadline"] = compute_deadline(m["date"], cfg)
        if not old:
            data.update({"votes": {}, "notified": False})
            ref.set(data)
            changed += 1
        else:
            diff = {k: v for k, v in data.items() if old.get(k) != v}
            if diff:
                ref.update(diff)
                changed += 1
    return changed


def notify_pending(db, cfg):
    """Avisa de los partidos con hora publicada que aún no se han notificado (o cuya hora ha cambiado)."""
    limit = now() - timedelta(hours=3)
    for snap in db.collection("matches").where("timeKnown", "==", True).stream():
        m = snap.to_dict()
        d = m.get("date")
        if not d or d < limit:
            continue
        d = d.astimezone(TZ)
        updates = {}
        dl = m.get("pollDeadline")
        if not dl:
            dl = compute_deadline(d, cfg)
            updates["pollDeadline"] = dl
        dl = dl.astimezone(TZ)
        stamp = d.isoformat()
        if m.get("notifiedFor") != stamp:
            changed = bool(m.get("notifiedFor"))
            lugar = "en casa 🏠" if m.get("isHome", True) else "fuera 🚌"
            title = "🕘 Cambio de hora del partido" if changed else "⚽ ¡Partido publicado!"
            body = (f"GAME OVER vs {m.get('rival')} ({lugar}) el {human(d)}. "
                    f"Vota tu asistencia antes del {human(dl)}.")
            print(f"Notificando: {body}")
            send_push(db, title, body)
            updates.update({"notified": True, "notifiedFor": stamp})
        if updates:
            snap.reference.update(updates)


def main():
    db = init()
    cfg = get_config(db)
    url = cfg.get("leagueUrl") or os.environ.get("LEAGUE_URL")
    if not cfg.get("leagueSync", False):
        # ligacomarcal.com bloquea las visitas automáticas (403): los partidos los gestiona el admin.
        print("Lectura de la web de la liga desactivada (config/app.leagueSync = false).")
        notify_pending(db, cfg)
        return
    try:
        html = fetch(url)
        soup = BeautifulSoup(html, "html.parser")
        headers, rows = parse_standings(soup)
        if rows:
            db.collection("config").document("clasificacion").set(
                {"headers": headers, "rows": rows, "url": url, "updatedAt": now()})
            print(f"Clasificación: {len(rows)} equipos")
        else:
            print("AVISO: no encontré la tabla de clasificación (revisa scripts/debug/)")

        # Páginas candidatas con el calendario/resultados del equipo
        base = url.rsplit("/clasificacion", 1)[0]
        pages = []
        for a in soup.find_all("a", href=True):
            if TEAM_RE.search(a.get_text(" ")):
                pages.append(urljoin(url, a["href"]))
        pages += [f"{base}/{p}" for p in ("calendario", "resultados", "jornadas", "partidos")]
        all_matches = {}
        for p in dict.fromkeys(pages):
            try:
                found = parse_matches(fetch(p))
            except Exception as e:  # la página puede no existir
                print(f"  {p}: {e}")
                continue
            print(f"  {p}: {len(found)} partidos")
            for m in found:
                key = match_id(m)
                prev = all_matches.get(key)
                # quedarse con la versión más completa
                score = lambda x: sum(1 for k in ("date", "timeKnown", "golesGO", "venue", "jornada") if x.get(k))
                if not prev or score(m) > score(prev):
                    all_matches[key] = m
        n = upsert(db, list(all_matches.values()), cfg)
        print(f"Partidos encontrados: {len(all_matches)} · actualizados: {n}")
    except Exception as e:
        print(f"ERROR leyendo la web de la liga: {e}", file=sys.stderr)
    # Las notificaciones se envían siempre (también para partidos metidos a mano por el admin)
    notify_pending(db, cfg)


if __name__ == "__main__":
    main()
