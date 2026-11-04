#!/usr/bin/env python3
"""Mesure les appels à GitHub sur une fenêtre de 24 h et rend le verdict de l'épique #2301.
Imprime : appels au total, appels par heure, minutes limitées, base de référence,
réduction en pour cent, puis une dernière ligne PASS ou FAIL
(PASS = réduction >= 80 % et aucune minute limitée). Sans réseau.

Usage : mesure.py --debut <ISO 8601, UTC> --appels <fichier>... (--base <n> | --base-fichier <f>)
                  [--limites <fichier.jsonl>]
  --appels   une ou plusieurs sources (concaténées) : compteur.db du runtime
             (table `appels`) ou fichier .jsonl (une ligne par appel :
             {"instant": <ms epoch ou ISO>, ...}). Le runtime ne garde qu'une heure
             d'appels dans compteur.db : pour un jour, donner les exports horaires.
             Si les instants lus ne couvrent pas la fenêtre (à une heure près à
             chaque bord), le script refuse (code 2) sans verdict.
  --limites  .jsonl des réponses vues : {"instant": ..., "status": 403, "headers": {...}}.
             Par défaut, les lignes de --appels qui portent un `status`.
  --base     total d'appels du 2026-11-04 (ou --base-fichier : un fichier dont la
             première ligne est ce nombre)."""
import argparse, json, re, sqlite3, sys
from datetime import datetime, timedelta, timezone

SEUIL = 80.0


def en_ms(v):
    if isinstance(v, (int, float)):
        return int(v)
    return int(datetime.fromisoformat(str(v).replace("Z", "+00:00")).timestamp() * 1000)


def lire_jsonl(chemin):
    with open(chemin, encoding="utf-8") as f:
        return [json.loads(l) for l in f if l.strip()]


def lire_appels(chemin):
    if chemin.endswith(".db"):
        con = sqlite3.connect(f"file:{chemin}?mode=ro", uri=True)
        try:
            return [{"instant": r[0]} for r in con.execute("SELECT instant FROM appels")]
        finally:
            con.close()
    return lire_jsonl(chemin)


def limitee(e):
    # Une réponse de limite : 403 ou 429 qui porte des en-têtes de limite.
    if e.get("status") not in (403, 429):
        return False
    h = {k.lower(): str(v) for k, v in (e.get("headers") or {}).items()}
    return "retry-after" in h or "x-ratelimit-remaining" in h or "x-ratelimit-reset" in h


p = argparse.ArgumentParser(usage=__doc__)
p.add_argument("--debut", required=True)
p.add_argument("--appels", required=True, nargs="+")
p.add_argument("--limites")
g = p.add_mutually_exclusive_group(required=True)
g.add_argument("--base", type=float)
g.add_argument("--base-fichier")
a = p.parse_args()

debut = en_ms(a.debut) if re.search(r"(Z|[+-]\d\d:?\d\d)$", a.debut) else en_ms(a.debut + "+00:00")
fin = debut + 24 * 3600 * 1000
base = a.base if a.base is not None else float(open(a.base_fichier).readline().strip())
if base <= 0:
    sys.exit("la base de référence doit être positive")

appels = [e for c in a.appels for e in lire_appels(c)]
instants = [en_ms(e["instant"]) for e in appels]
TOLERANCE = 3600 * 1000
if not instants or min(instants) > debut + TOLERANCE or max(instants) < fin - TOLERANCE:
    lus = (f"de {datetime.fromtimestamp(min(instants)/1000, timezone.utc).isoformat()} "
           f"à {datetime.fromtimestamp(max(instants)/1000, timezone.utc).isoformat()}") if instants else "aucun appel"
    print(f"source insuffisante : les appels lus couvrent {lus}, pas la fenetre "
             f"[{datetime.fromtimestamp(debut/1000, timezone.utc).isoformat()}, +24 h) a une heure pres. "
             "compteur.db ne garde qu'une heure : donner des exports horaires (voir le README). Pas de verdict.", file=sys.stderr)
    sys.exit(2)
reponses = lire_jsonl(a.limites) if a.limites else appels
dans = lambda e: debut <= en_ms(e["instant"]) < fin
total = sum(1 for e in appels if dans(e))
minutes = {en_ms(e["instant"]) // 60000 for e in reponses if dans(e) and limitee(e)}
reduction = (base - total) / base * 100
ok = reduction >= SEUIL and not minutes

print(f"fenetre : {datetime.fromtimestamp(debut/1000, timezone.utc).isoformat()} + 24 h")
print(f"appels au total : {total}")
print(f"appels par heure : {total / 24:.1f}")
print(f"minutes limitees : {len(minutes)}")
print(f"base de reference : {base:g}")
print(f"reduction : {reduction:.1f} %")
if not a.limites and not any("status" in e for e in appels):
    print("AVERTISSEMENT : reponses non enregistrees (ni --limites ni status dans --appels), minutes limitees = 0 sans preuve")
print("PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)
