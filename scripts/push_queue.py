"""Envía las notificaciones que el admin pide desde la app (Admin → 🔔 Avisos).
Cada envío guarda a quién le ha llegado (results) y la app apunta quién la abre (acks)."""
from firebase_admin import firestore

from common import APP_URL, init, now, send_push_detailed


def process(db):
    pending = list(db.collection("pushRequests").where("status", "==", "pending").stream())
    for snap in pending:
        ref = snap.reference

        @firestore.transactional
        def claim(tx):
            cur = ref.get(transaction=tx)
            if cur.to_dict().get("status") != "pending":
                return False
            tx.update(ref, {"status": "sending"})
            return True

        if not claim(db.transaction()):
            continue  # otra ejecución ya la está enviando
        r = snap.to_dict()
        link = f"{APP_URL.rstrip('/')}/?ack={snap.id}" if APP_URL else None
        print(f"Enviando: {r.get('title')}")
        results = send_push_detailed(db, r.get("title", "Game Over FC"), r.get("body", ""), link)
        ref.update({"status": "sent", "sentAt": now(), "results": results, "total": len(results),
                    "okCount": sum(1 for v in results.values() if v == "ok")})
    if not pending:
        print("No hay notificaciones en cola.")


if __name__ == "__main__":
    process(init())
