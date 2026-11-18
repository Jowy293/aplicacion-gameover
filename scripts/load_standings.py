"""Carga la clasificación a partir del texto copiado de la web de la liga (scripts/clasificacion.txt).
El mismo formato se puede pegar desde la app: Admin → Clasificación."""
import re
from pathlib import Path

from common import init, now

ROW = re.compile(
    r"(?:^|\s)(\d{1,2})\s+(.+?)\s+(\d{1,3})\s+PTS\s+PJ\s*(\d+)\s+G\s*(\d+)\s+E\s*(\d+)\s+P\s*(\d+)\s+DG\s*([+\-−]?\d+)((?:\s+[GEP](?=\s|$))*)"
)


def parse(text):
    teams = []
    for m in ROW.finditer(text):
        pos, name, pts, pj, g, e, p, dg, form = m.groups()
        teams.append({
            "pos": int(pos), "name": " ".join(name.split()), "pts": int(pts), "pj": int(pj), "g": int(g),
            "e": int(e), "p": int(p), "dg": int(dg.replace("−", "-")), "form": "".join(form.split()),
        })
    return teams


def main():
    text = (Path(__file__).parent / "clasificacion.txt").read_text(encoding="utf-8")
    teams = parse(text)
    if not teams:
        raise SystemExit("No se ha encontrado ninguna fila de clasificación en clasificacion.txt")
    init().collection("config").document("clasificacion").set({"teams": teams, "updatedAt": now(), "source": "texto"})
    for t in teams:
        print(f"  {t['pos']:>2}. {t['name']:<26} {t['pts']:>3} pts  PJ {t['pj']}  DG {t['dg']:+d}  {t['form']}")


if __name__ == "__main__":
    main()
