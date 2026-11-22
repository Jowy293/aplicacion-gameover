"""Tarea de cada 5 minutos: todos los avisos y recordatorios.
- Notificaciones que manda el admin desde la app
- Hora del partido publicada / cambiada
- Fantasy abierto a mano
- Fotos nuevas
- Recordatorios a quien no ha votado / no ha hecho el Fantasy"""
import push_queue
import reminders
from common import get_config, init
from sync_liga import notify_fantasy, notify_pending, notify_photos

db = init()
cfg = get_config(db)
for name, fn in [("envíos del admin", lambda: push_queue.process(db)), ("partido publicado", lambda: notify_pending(db, cfg)),
                 ("Fantasy abierto", lambda: notify_fantasy(db)), ("fotos nuevas", lambda: notify_photos(db)),
                 ("recordatorios", lambda: reminders.run(db))]:
    try:
        fn()
    except Exception as e:  # que un fallo no pare el resto de avisos
        print(f"ERROR en {name}: {e}")
