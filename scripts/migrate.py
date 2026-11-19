"""Cambios puntuales en los datos (se lanza con la tarea "migrar").
19/11/2026: valoraciones anónimas. Las valoraciones antiguas (guardadas con el id del jugador) pasan a un
código aleatorio, y ese código se apunta en el apartado privado del usuario (users/{uid}.ratingKeys)."""
import secrets

from common import init

db = init()
players = {d.id: d.to_dict() for d in db.collection("players").stream()}
moved = 0
for m in db.collection("matches").stream():
    for r in m.reference.collection("ratings").stream():
        if r.id not in players:
            continue  # ya es anónima
        data = r.to_dict()
        key = secrets.token_hex(10)
        m.reference.collection("ratings").document(key).set(
            {k: data.get(k, {}) for k in ("scores", "comments")} | {"updatedAt": data.get("updatedAt")})
        uid = players[r.id].get("uid")
        if uid:
            db.collection("users").document(uid).set({"ratingKeys": {m.id: key}}, merge=True)
        r.reference.delete()
        moved += 1
print(f"Valoraciones pasadas a anónimas: {moved}")

# 19/11/2026: tarjetas de la temporada antes de la app (sin partido asignado). "Juan" = MOFE (Juan Manuel Valero López)
TARJETAS = {"alex-14": 2, "llorens-19": 1, "mofe-20": 2, "quique-21": 2, "jowy-22": 2}
for pid, y in TARJETAS.items():
    ref = db.collection("players").document(pid)
    if ref.get().exists:
        ref.update({"cardsBase": {"y": y, "r": 0}})
        print(f"  ✔ {pid}: {y} amarillas")
    else:
        print(f"  ✗ no existe {pid}")
