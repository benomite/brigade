#!/usr/bin/env python3
"""Compare le temps de la file au service (queued -> served) des tickets servis
avant et après une date, pour l'épique #3739 : ce temps ne doit pas croître de
plus de 10 %. Imprime, pour chaque ensemble, le nombre de tickets, la médiane et
la moyenne en minutes, puis la variation relative de chacune, et une dernière
ligne `over 10 %` ou `within 10 %` (codes de sortie 1 / 0). Sans réseau.

Usage : mesure.py --coupure <ISO 8601, UTC> --temps <temps-tickets.json>...
  --coupure  un ticket mergé avant cet instant est « before », à partir de lui « after ».
  --temps    un ou plusieurs `.claude/brigade/temps-tickets.json` de station
             (tableau, ou objet { tickets }), concaténés ; un ticket présent
             dans plusieurs fichiers ne compte qu'une fois (le dernier lu).

Un ticket entre dans la file à `depuis` + `attenteQualification` secondes, la
règle de `rattraperLaPrise` (runtime/src/temps-ticket/mesure.ts), et est servi
à `mergedAt`. Un enregistrement sans ces champs lisibles est écarté, et compté
sur stderr. Un fichier illisible, ou un ensemble vide, refuse la mesure (code 2)."""
import argparse, json, re, statistics, sys
from datetime import datetime

SEUIL = 10.0


def en_ms(v):
    return int(datetime.fromisoformat(str(v).replace("Z", "+00:00")).timestamp() * 1000)


def refuser(motif):
    print(f"{motif} Pas de verdict.", file=sys.stderr)
    sys.exit(2)


def lire(chemin):
    try:
        with open(chemin, encoding="utf-8") as f:
            brut = json.load(f)
    except (OSError, ValueError) as e:
        refuser(f"{chemin} illisible : {e}.")
    tickets = brut.get("tickets") if isinstance(brut, dict) else brut
    if not isinstance(tickets, list):
        refuser(f"{chemin} ne porte ni un tableau JSON ni {{ tickets }}.")
    return tickets


def file_au_service(t):
    """(mergedAt en ms, minutes de la file au service), ou None si illisible."""
    if not isinstance(t, dict) or not isinstance(t.get("ticket"), int):
        return None
    attente = t.get("attenteQualification", 0)
    if not isinstance(attente, (int, float)) or attente < 0:
        return None
    try:
        servi = en_ms(t["mergedAt"])
        en_file = en_ms(t["depuis"]) + attente * 1000
    except (KeyError, TypeError, ValueError):
        return None
    if servi < en_file:
        return None
    return servi, (servi - en_file) / 60000


def variation(avant, apres):
    return (apres - avant) / avant * 100 if avant > 0 else float("inf") if apres > 0 else 0.0


p = argparse.ArgumentParser(usage=__doc__)
p.add_argument("--coupure", required=True)
p.add_argument("--temps", required=True, nargs="+")
a = p.parse_args()

try:
    coupure = en_ms(a.coupure if re.search(r"(Z|[+-]\d\d:?\d\d)$", a.coupure) else a.coupure + "+00:00")
except ValueError:
    refuser(f"--coupure illisible : {a.coupure}.")

par_ticket = {}
ecartes = 0
for chemin in a.temps:
    for t in lire(chemin):
        mesure = file_au_service(t)
        if mesure is None:
            ecartes += 1
        else:
            par_ticket[t["ticket"]] = mesure
if ecartes:
    print(f"{ecartes} enregistrement(s) ecarte(s) : sans `depuis`, `mergedAt` ou `attenteQualification` lisibles.", file=sys.stderr)

ensembles = {"before": [], "after": []}
for servi, minutes in par_ticket.values():
    ensembles["before" if servi < coupure else "after"].append(minutes)
for nom, m in ensembles.items():
    if not m:
        refuser(f"aucun ticket servi dans l'ensemble {nom}.")

stats = {nom: (len(m), statistics.median(m), statistics.fmean(m)) for nom, m in ensembles.items()}
for nom, (n, med, moy) in stats.items():
    print(f"{nom:<6}  {n:>4} tickets  median {med:.1f} min  mean {moy:.1f} min")
depasse = False
for rang, cle in ((1, "median"), (2, "mean")):
    v = variation(stats["before"][rang], stats["after"][rang])
    depasse |= v > SEUIL
    print(f"change {cle:<6} {v:+.1f} %  {'over' if v > SEUIL else 'within'} 10 %")
print("over 10 %" if depasse else "within 10 %")
sys.exit(1 if depasse else 0)
