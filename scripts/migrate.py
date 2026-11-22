"""Cambios puntuales en los datos (se lanza con la tarea "migrar").
22/11/2026: usuario fotógrafo (Gaizka) y tipos de multa iniciales."""
from common import init

db = init()

ref = db.collection("players").document("gaizka-foto")
if not ref.get().exists:
    ref.set({"name": "GAIZKA", "number": "📷", "fullName": "Gaizka el fotógrafo", "position": "Fotógrafo",
             "role": "player", "uid": None, "active": True})
    print("  ✔ creado GAIZKA (fotógrafo)")
else:
    print("  · GAIZKA ya existía")

cfg = db.collection("config").document("fines")
if not cfg.get().exists:
    cfg.set({"types": [
        {"id": "retraso-entreno", "name": "Retraso sin avisar en el entreno", "price": 3},
        {"id": "retraso-partido", "name": "Retraso sin avisar en el partido", "price": 5},
        {"id": "amarilla", "name": "Tarjeta amarilla (mal comportamiento)", "price": 8},
        {"id": "roja", "name": "Tarjeta roja", "price": 10},
    ]})
    print("  ✔ tipos de multa creados")
else:
    print("  · los tipos de multa ya existían")
