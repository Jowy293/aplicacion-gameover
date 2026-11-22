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
    open_hour = int(cfg.get("trainingOpenHour", 10))
    dl_hour = int(cfg.get("trainingDeadlineHour", 20))
    # Se abre el martes a partir de las 10:00. Si GitHub se saltó esa ejecución, se recupera en la
    # siguiente que haya (hasta el miércoles antes del cierre).
    tuesday_open = today.weekday() == 1 and today.hour >= open_hour
    wednesday_catchup = today.weekday() == 2 and today.hour < dl_hour
    if not force and not (tuesday_open or wednesday_catchup):
        print("No toca abrir la encuesta del entreno ahora.")
        return
    if today.weekday() == 2:
        day = today.date()  # recuperación del miércoles: el entreno es hoy
    else:
        day = (today + timedelta(days=(2 - today.weekday()) % 7 or 7)).date()  # próximo miércoles
    hh, mm = (cfg.get("trainingTime") or "20:00").split(":")[:2]
    start = datetime(day.year, day.month, day.day, int(hh), int(mm), tzinfo=TZ)
    deadline = min(datetime(day.year, day.month, day.day, dl_hour, 0, tzinfo=TZ), start)

    ref = db.collection("trainings").document(f"t-{day.isoformat()}")
    if ref.get().exists:
        print("La encuesta de este entreno ya existe.")
        return
    if not force and cfg.get("lastAutoTraining") == day.isoformat():
        print("La encuesta de esta semana ya se creó (y el admin la borró): no se vuelve a crear.")
        return
    ref.set({
        "date": start, "time": f"{int(hh):02d}:{int(mm):02d}", "place": cfg.get("trainingPlace", ""),
        "note": "", "pollDeadline": deadline, "votes": {}, "notified": True, "source": "auto",
    })
    db.collection("config").document("app").set({"lastAutoTraining": day.isoformat()}, merge=True)
    print(f"Creada encuesta de entreno para {human(start)}")
    send_push(db, "🏃 Entreno de hoy" if day == today.date() else "🏃 Entreno de mañana",
              f"¿Vienes al entreno del {human(start)}? Vota antes de las {deadline:%H:%M} del {human(deadline, False)}.")


if __name__ == "__main__":
    import sys
    main(force="--force" in sys.argv)
