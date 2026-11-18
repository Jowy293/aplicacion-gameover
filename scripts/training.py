"""Martes a las 10:00 (hora de Madrid): abre la encuesta del entreno del miércoles (cierra el miércoles a las 20:00)."""
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
    open_hour = int(cfg.get("trainingOpenHour", 10))
    if not force and today.hour < open_hour:
        # GitHub programa en UTC: se lanza a las 8 y 9 UTC y solo se abre cuando en Madrid ya son las 10
        print(f"Aún no son las {open_hour}:00 en Madrid ({today:%H:%M}); se abrirá en la siguiente ejecución.")
        return
    day = (today + timedelta(days=(2 - today.weekday()) % 7 or 7)).date()  # próximo miércoles
    hh, mm = (cfg.get("trainingTime") or "20:00").split(":")[:2]
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
