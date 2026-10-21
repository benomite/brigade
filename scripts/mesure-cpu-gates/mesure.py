#!/usr/bin/env python3
"""Mesure le temps processeur (utilisateur + système) d'une commande et de tous
ses descendants attendus, et l'horloge. Une ligne sur stdout :
    cpu_s=<n> utilisateur_s=<n> systeme_s=<n> horloge_s=<n> code=<n>
La sortie de la commande va sur stderr ; sa sortie standard est jetée si
--silencieux. Usage : mesure.py [--silencieux] [--sortie <fichier>] -- <cmd...>"""
import os, resource, subprocess, sys, time

args = sys.argv[1:]
silencieux, sortie = False, None
while args and args[0] != "--":
    if args[0] == "--silencieux":
        silencieux = True; args = args[1:]
    elif args[0] == "--sortie":
        sortie = args[1]; args = args[2:]
    else:
        sys.exit(f"option inconnue : {args[0]}")
cmd = args[1:]
if not cmd:
    sys.exit(__doc__)

avant = resource.getrusage(resource.RUSAGE_CHILDREN)
t0 = time.monotonic()
if sortie:
    with open(sortie, "wb") as f:
        code = subprocess.run(cmd, stdin=subprocess.DEVNULL, stdout=f, stderr=subprocess.STDOUT).returncode
else:
    code = subprocess.run(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL if silencieux else sys.stderr,
                          stderr=sys.stderr).returncode
horloge = time.monotonic() - t0
apres = resource.getrusage(resource.RUSAGE_CHILDREN)
u = apres.ru_utime - avant.ru_utime
s = apres.ru_stime - avant.ru_stime
print(f"cpu_s={u + s:.1f} utilisateur_s={u:.1f} systeme_s={s:.1f} horloge_s={horloge:.1f} code={code}")
sys.exit(0)
