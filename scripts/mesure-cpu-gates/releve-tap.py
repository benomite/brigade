#!/usr/bin/env python3
"""Relève les tests d'une sortie TAP de `node --test` : une ligne par test
feuille, `<fichier>\t<nom complet>` suivi de `\tSKIP` s'il a été sauté.
Les suites (tests qui ont des sous-tests) ne sont pas listées.
Usage : releve-tap.py <fichier-de-test> <sortie.tap>   → stdout"""
import re, sys

fichier, tap = sys.argv[1], sys.argv[2]
pile = {}          # niveau -> nom du dernier `# Subtest:` à ce niveau
parents = set()    # (niveau, nom) ayant des sous-tests
tests = []         # (niveau, chemin, saute)
for ligne in open(tap, errors="replace"):
    ligne = ligne.rstrip("\n")
    m = re.match(r"^( *)# Subtest: (.*)$", ligne)
    if m:
        n = len(m.group(1)) // 4
        pile[n] = m.group(2)
        for k in [k for k in pile if k > n]:
            del pile[k]
        if n > 0:
            parents.add(tuple(pile[i] for i in range(n)))
        continue
    m = re.match(r"^( *)(?:not )?ok \d+ - (.*?)(?: # (SKIP|TODO)\b.*)?$", ligne)
    if m and len(m.group(1)) % 4 == 0:
        n = len(m.group(1)) // 4
        if n in pile:
            tests.append((tuple(pile[i] for i in range(n + 1)), m.group(3) == "SKIP"))
for chemin, saute in tests:
    if chemin in parents:
        continue
    print("\t".join([fichier, " > ".join(chemin)] + (["SKIP"] if saute else [])))
