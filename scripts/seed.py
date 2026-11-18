"""Carga inicial: crea la plantilla 26/27 y la configuración. Se puede ejecutar varias veces sin
borrar nada (no toca jugadores que ya existen ni móviles ya vinculados)."""
from common import DEFAULT_CONFIG, init

# Plantilla temporada 26/27 (de la imagen del equipo). Se puede editar desde el panel de admin.
PLAYERS = [
    ("SAMUEL", "4", ""), ("VÍCTOR", "5", ""), ("VALERO", "7", ""), ("MAURO", "8", ""),
    ("YOSHI", "9", ""), ("ENRIQUE", "10", ""), ("SINUHE", "11", ""), ("GANDÍA", "12", ""),
    ("ALEX", "14", ""), ("DAVID", "17", ""), ("LLORENS", "19", ""), ("MOFE", "20", ""),
    ("QUIQUE", "21", ""), ("JOWY", "22", "Joan Brotons Vidal"), ("MAURO EL MOO", "28", ""),
    ("MARC", "30", ""), ("MARIO", "51", ""),
]
COACH = ("TONI", "DT", "")
ADMIN_NUMBER = "22"  # Joan Brotons Vidal


def slug(s):
    import re
    import unicodedata
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def main():
    db = init()
    col = db.collection("players")
    created = 0
    for name, num, full in PLAYERS + [COACH]:
        pid = f"{slug(name)}-{slug(num)}"
        ref = col.document(pid)
        if ref.get().exists:
            continue
        ref.set({
            "name": name, "number": num, "fullName": full,
            "position": "Entrenador" if num == "DT" else "Jugador",
            "role": "admin" if num == ADMIN_NUMBER else "player",
            "uid": None, "active": True,
        })
        created += 1
    cfg_ref = db.collection("config").document("app")
    if not cfg_ref.get().exists:
        cfg_ref.set(DEFAULT_CONFIG)
    print(f"Plantilla lista ({created} jugadores nuevos). Admin: JOWY #22 (Joan Brotons Vidal).")


if __name__ == "__main__":
    main()
