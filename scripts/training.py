"""Se ejecuta los martes: crea la encuesta del entreno del día siguiente (miércoles) y avisa a todos."""
from datetime import datetime, timedelta

from common import TZ, get_config, human, init, now, send_push


def main(force=False):
    db = init()
    cfg = get_config(db)
    today = now()
    if not force and not cfg.get("trainingAuto", True):
        print("Encuesta automática de entreno desactivada en Ajustes.")
        return
    if not force and today.weekday() != 1:  # 1 = martes
        print("Hoy no es martes; no se crea encuesta.")
        return
    day = (today + timedelta(days=(2 - today.weekday()) % 7 or 7)).date()  # próximo miércoles
    hh, mm = (cfg.get("trainingTime") or "21:00").split(":")[:2]
    start = datetime(day.year, day.month, day.day, int(hh), int(mm), tzinfo=TZ)
    dl_hour = int(cfg.get("trainingDeadlineHour", 20))
    deadline = min(datetime(day.year, day.month, day.day, dl_hour, 0, tzinfo=TZ), start)

    ref = db.collection("trainings").document(f"t-{day.isoformat()}")
    if ref.get().exists:
        print("La encuesta de este entreno ya existe.")
        return
    ref.set({
        "date": start, "time": f"{int(hh):02d}:{int(mm):02d}", "place": cfg.get("trainingPlace", ""),
        "note": "", "pollDeadline": deadline, "votes": {}, "notified": True, "source": "auto",
    })
    print(f"Creada encuesta de entreno para {human(start)}")
    send_push(db, "🏃 Entreno de mañana",
              f"¿Vienes al entreno del {human(start)}? Vota antes de las {deadline:%H:%M} del {human(deadline, False)}.")


if __name__ == "__main__":
    import sys
    main(force="--force" in sys.argv)
