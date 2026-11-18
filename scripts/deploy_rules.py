"""Publica firestore.rules en el proyecto de Firebase (usa la cuenta de servicio del secreto)."""
import json
import os
from pathlib import Path

import requests
from google.auth.transport.requests import Request
from google.oauth2 import service_account

info = json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT"])
cred = service_account.Credentials.from_service_account_info(
    info, scopes=["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/firebase"])
cred.refresh(Request())
pid = info["project_id"]
H = {"Authorization": f"Bearer {cred.token}"}
API = "https://firebaserules.googleapis.com/v1"
src = (Path(__file__).parent.parent / "firestore.rules").read_text(encoding="utf-8")

r = requests.post(f"{API}/projects/{pid}/rulesets", headers=H,
                  json={"source": {"files": [{"name": "firestore.rules", "content": src}]}}, timeout=30)
if not r.ok:
    raise SystemExit(f"Error creando las reglas: {r.status_code} {r.text}")
ruleset = r.json()["name"]
rel = f"projects/{pid}/releases/cloud.firestore"
r = requests.patch(f"{API}/{rel}", headers=H, json={"release": {"name": rel, "rulesetName": ruleset}}, timeout=30)
if r.status_code == 404:
    r = requests.post(f"{API}/projects/{pid}/releases", headers=H, json={"name": rel, "rulesetName": ruleset}, timeout=30)
if not r.ok:
    raise SystemExit(f"Error publicando las reglas: {r.status_code} {r.text}")
print(f"Reglas publicadas: {ruleset}")
