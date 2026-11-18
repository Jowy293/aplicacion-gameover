"""Cambios puntuales en los datos (se lanza con la tarea "migrar").
18/11/2026: goleadores de la temporada según la web de la liga (sin partido asignado) y nombres completos."""
from common import init

GOLEADORES = {
    "victor-5": ("Víctor González Fernández", 3),
    "enrique-10": ("Enrique Beltrán Abad", 3),
    "yoshi-9": ("Israel Romero Martín", 1),
    "mofe-20": ("Juan Manuel Valero López", 1),
}

db = init()
for pid, (full, goals) in GOLEADORES.items():
    ref = db.collection("players").document(pid)
    if not ref.get().exists:
        print(f"  ✗ no existe {pid}")
        continue
    ref.update({"fullName": full, "goalsBase": goals})
    print(f"  ✔ {pid}: {full} · {goals} goles")
