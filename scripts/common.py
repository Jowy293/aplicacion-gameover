"""Utilidades compartidas: conexión a Firebase, fechas en hora de Madrid y envío de notificaciones."""
import json
import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import firebase_admin
from firebase_admin import credentials, firestore, messaging

TZ = ZoneInfo("Europe/Madrid")
APP_URL = os.environ.get("APP_URL", "").strip() or None

DEFAULT_CONFIG = {
    "pollWeekday": 3,            # 1=lunes ... 3=miércoles
    "pollHour": 20,              # la votación del partido cierra a las 20:00
    "trainingAuto": True,
    "trainingTime": "20:00",            # el entreno es el miércoles a las 20:00
    "trainingOpenHour": 10,            # la encuesta se abre el martes a las 10:00
    "trainingDeadlineHour": 20,
    "trainingPlace": "",
    "leagueUrl": "https://ligacomarcal.com/competicion/lc-cuarta-division-26-27-mtizb4nd/clasificacion",
}


def init():
    if not firebase_admin._apps:
        raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
        if raw:
            cred = credentials.Certificate(json.loads(raw))
        else:
            cred = credentials.Certificate(os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "service-account.json"))
        firebase_admin.initialize_app(cred)
    return firestore.client()


def get_config(db):
    snap = db.collection("config").document("app").get()
    cfg = dict(DEFAULT_CONFIG)
    if snap.exists:
        cfg.update({k: v for k, v in snap.to_dict().items() if v is not None})
    return cfg


def now():
    return datetime.now(TZ)


def compute_deadline(match_dt, cfg):
    """Día/hora de cierre configurados dentro de la semana del partido (por defecto miércoles 20:00).
    Si el partido es antes de ese momento, la votación cierra al empezar el partido."""
    match_dt = match_dt.astimezone(TZ)
    monday = (match_dt - timedelta(days=match_dt.weekday())).date()
    day = monday + timedelta(days=int(cfg["pollWeekday"]) - 1)
    dl = datetime(day.year, day.month, day.day, int(cfg["pollHour"]), 0, tzinfo=TZ)
    return match_dt if dl > match_dt else dl


def send_push(db, title, body):
    """Envía una notificación a todos los móviles registrados. Devuelve cuántas se entregaron."""
    docs = list(db.collection("tokens").stream())
    tokens = [(d.id, d.to_dict().get("token")) for d in docs if d.to_dict().get("token")]
    if not tokens:
        print("  (no hay móviles con notificaciones activadas)")
        return 0
    sent = 0
    for i in range(0, len(tokens), 500):
        chunk = tokens[i:i + 500]
        msg = messaging.MulticastMessage(
            tokens=[t for _, t in chunk],
            webpush=messaging.WebpushConfig(
                notification=messaging.WebpushNotification(
                    title=title, body=body, icon="icons/icon-192.png", badge="icons/icon-96.png",
                ),
                fcm_options=messaging.WebpushFCMOptions(link=APP_URL) if APP_URL else None,
            ),
        )
        resp = messaging.send_each_for_multicast(msg)
        sent += resp.success_count
        for (uid, _), r in zip(chunk, resp.responses):
            if not r.success and isinstance(r.exception, (messaging.UnregisteredError, messaging.SenderIdMismatchError)):
                db.collection("tokens").document(uid).delete()  # token caducado
    print(f"  notificación enviada a {sent}/{len(tokens)} móviles")
    return sent


DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre"]


def human(dt, with_time=True):
    dt = dt.astimezone(TZ)
    s = f"{DIAS[dt.weekday()]} {dt.day} de {MESES[dt.month - 1]}"
    return s + (f" a las {dt:%H:%M}" if with_time else "")
