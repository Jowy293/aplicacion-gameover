"""Envía una notificación de prueba a todos los móviles registrados."""
from common import init, send_push

if __name__ == "__main__":
    send_push(init(), "⚽ Game Over FC", "¡Notificación de prueba! Si ves esto, los avisos funcionan.")
