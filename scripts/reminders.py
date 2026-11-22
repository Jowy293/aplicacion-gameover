"""Recordatorios SOLO para quien aún no ha respondido, cuando se acaba el plazo:
- Votación de asistencia al partido (¿vas o no?)
- Encuesta del entreno
- Predicción del Fantasy
Se avisa 24 h y 2 h antes del cierre. Cada recordatorio se manda una sola vez
(queda apuntado en el documento: reminders.<tipo>_<horas>)."""
from datetime import timedelta

from common import human, init, now, send_push

# (horas antes del cierre, hasta cuándo se puede mandar ese recordatorio)
# Ventanas amplias porque GitHub a veces se salta ejecuciones programadas:
# el de 24 h vale mientras queden más de 12 h (así no coincide con el aviso de publicación
# cuando el plazo es corto); el de 2 h, hasta el cierre.
STEPS = [(24, timedelta(hours=12)), (2, timedelta(hours=2))]
STAFF = {"Entrenador", "Fotógrafo"}


def due(deadline, done, kind):
    """Devuelve las horas del recordatorio que toca ahora (o None) y marca como hechos los que ya pasaron."""
    left = deadline - now()
    if left <= timedelta(0):
        return None, {}
    send, mark = None, {}
    for hours, window in STEPS:
        key = f"{kind}_{hours}h"
        if done.get(key):
            continue
        t = timedelta(hours=hours)
        if left <= t - window:
            mark[key] = "saltado"  # la ventana ya pasó (p. ej. se publicó tarde): no mandar dos seguidos
        elif left <= t:
            send = hours
            mark[key] = True
    return send, mark


def players(db):
    """Jugadores con la app (tienen uid). Devuelve {id: datos}."""
    return {d.id: d.to_dict() for d in db.collection("players").stream() if d.to_dict().get("uid")}


def run(db):
    ps = players(db)
    voters = {pid for pid, p in ps.items() if p.get("position") != "Fotógrafo"}       # votan asistencia
    fantasy = {pid for pid, p in ps.items() if p.get("position") not in STAFF}         # juegan al Fantasy

    for snap in db.collection("matches").stream():
        m = snap.to_dict()
        done = dict(m.get("reminders") or {})
        updates = {}
        rival = m.get("rival", "el rival")
        played = m.get("golesGO") is not None

        # 1) asistencia al partido
        dl = m.get("pollDeadline")
        if dl and not played:
            hours, mark = due(dl, done, "voto")
            updates.update(mark)
            if hours:
                missing = voters - set((m.get("votes") or {}).keys())
                if missing:
                    print(f"Recordatorio voto ({hours} h) vs {rival}: {len(missing)} sin votar")
                    send_push(db, "⏰ ¿Vas al partido?",
                              f"Aún no has dicho si vas contra {rival}. La votación se cierra el {human(dl)}.", only=missing)

        # 2) Fantasy
        f = m.get("fantasy") or {}
        status = f.get("status", "auto")
        close = None
        if status == "open":
            close = f.get("closesAt")
        elif status == "auto" and not played and m.get("timeKnown") and m.get("date"):
            close = m.get("date")
        if close:
            hours, mark = due(close, done, "fantasy")
            updates.update(mark)
            if hours:
                have = {d.id for d in snap.reference.collection("predictions").stream()}
                missing = fantasy - have
                if missing:
                    print(f"Recordatorio Fantasy ({hours} h) vs {rival}: {len(missing)} sin predicción")
                    send_push(db, "🎯 Te falta tu Fantasy",
                              f"Aún no has hecho tu predicción contra {rival}. Se cierra el {human(close)}.", only=missing)

        if updates:
            snap.reference.update({f"reminders.{k}": v for k, v in updates.items()})

    # 3) encuesta del entreno
    for snap in db.collection("trainings").stream():
        t = snap.to_dict()
        dl = t.get("pollDeadline")
        if not dl:
            continue
        done = dict(t.get("reminders") or {})
        hours, mark = due(dl, done, "voto")
        if hours:
            missing = voters - set((t.get("votes") or {}).keys())
            if missing:
                print(f"Recordatorio entreno ({hours} h): {len(missing)} sin votar")
                send_push(db, "⏰ ¿Vienes al entreno?",
                          f"Aún no has dicho si vienes al entreno del {human(t.get('date'))}. Se cierra el {human(dl)}.", only=missing)
        if mark:
            snap.reference.update({f"reminders.{k}": v for k, v in mark.items()})


if __name__ == "__main__":
    run(init())
