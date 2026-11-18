"""Carga el calendario 26/27 del GAME OVER FC (Cuarta División, Liga Comarcal Alcoy).
Se puede ejecutar varias veces: actualiza los datos del partido pero nunca borra los votos.
Los partidos quedan marcados como "manual" para que la sincronización con la web no los toque.
Las fechas y horas se cambian después desde Admin."""
from datetime import datetime

from common import TZ, compute_deadline, get_config, init

# (fecha, hora o None, local?, rival, archivo escudo, goles GO, goles rival, pabellón)
CALENDARIO = [
    ("2026-10-04", None, True, "Sercomac FC", "sercomac-fc", 2, 4, "Polideportivo Francisco Laporta · Pabellón Miguel Sarasa"),
    ("2026-10-17", None, False, "Bar Ferrocarril FS", "bar-ferrocarril-fs", 3, 4, "Polideportivo de Cocentaina · Pabellón"),
    ("2026-11-08", None, True, "La Cuina de Jairo", "la-cuina-de-jairo", 2, 1, "Polideportivo de Cocentaina · Pabellón"),
    ("2026-11-14", None, False, "C.D. Santa Rosa Copisan", "cd-santa-rosa-copisan", 1, 3, "Polideportivo de Caramanchel · Pista 1"),
    ("2026-11-22", "11:00", True, "Atlético Salesiano", "atletico-salesiano", None, None, "Polideportivo de Caramanchel · Pista 1"),
    ("2026-11-28", None, False, "FC Racing Alcoy", "fc-racing-alcoy", None, None, ""),
    ("2026-12-12", None, True, "Tex-Textiles FS", "tex-textiles-fs", None, None, ""),
    ("2027-01-09", None, False, "DKV-Brownsea FS", "dkv-brownsea-fs", None, None, ""),
    ("2027-01-16", None, True, 'Buena Onda FS "B"', "buena-onda-fs-b", None, None, ""),
    ("2027-01-23", None, False, "PD Juan XXIII B", "pd-juan-xxiii-b", None, None, ""),
    ("2027-01-30", None, True, "Colpet FS", "colpet-fs", None, None, ""),
    ("2027-02-06", None, False, "Birrarreal FS", "birrarreal-fs", None, None, ""),
]


def main():
    db = init()
    cfg = get_config(db)
    for day, hour, home, rival, crest, gf, gc, venue in CALENDARIO:
        y, m, d = map(int, day.split("-"))
        hh, mm = map(int, (hour or "00:00").split(":"))
        date = datetime(y, m, d, hh, mm, tzinfo=TZ)
        ref = db.collection("matches").document(f"m-{day}-{crest}")
        data = {
            "rival": rival, "isHome": home, "date": date, "timeKnown": bool(hour), "venue": venue,
            "crest": f"crests/{crest}.png", "golesGO": gf, "golesRival": gc, "jornada": None,
            "manual": True, "source": "calendario",
        }
        if hour and gf is None:
            data["pollDeadline"] = compute_deadline(date, cfg)
        snap = ref.get()
        if snap.exists:
            ref.update(data)
        else:
            ref.set({**data, "votes": {}, "notified": False})
        print(f"  {'✔' if not snap.exists else '↻'} {day} {'vs' if home else '@'} {rival}")
    print("Calendario cargado.")


if __name__ == "__main__":
    main()
