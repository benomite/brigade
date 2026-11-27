#!/usr/bin/env python3
"""Le savoir-faire reste trié (#4549) : dans chaque section, les entrées se suivent
dans l'ordre alphabétique de leur ligne (sans tenir compte de la casse), si bien que
deux leçons ajoutées en parallèle tombent presque toujours à deux endroits différents
et que git fusionne les deux PR sans conflit.

Usage : know-how-ordre.py <fichier> [<fichier de la base>]
Sans fichier de base, tout l'ordre du fichier est jugée ; avec lui, seules les entrées
ajoutées ou changées le sont (un reste plus ancien n'est pas le sien) : chacune doit
être à sa place entre ses voisines. Sort 0 si rien à dire, 2 avec une ligne FAIL par manquement.
"""
import sys

def cle(ligne):
    return ligne.lower()

def sections(lignes):
    """Les blocs d'entrées consécutives, un titre `## ` ou une ligne qui n'est pas une entrée les coupe."""
    bloc = []
    for n, ligne in enumerate(lignes):
        if ligne.startswith("- "):
            bloc.append((n, ligne))
        else:
            if bloc:
                yield bloc
            bloc = []
    if bloc:
        yield bloc

def main():
    fichier = sys.argv[1]
    lignes = open(fichier, encoding="utf-8").read().split("\n")
    base = set()
    if len(sys.argv) > 2:
        base = set(open(sys.argv[2], encoding="utf-8").read().split("\n"))
    echecs = 0
    for bloc in sections(lignes):
        for (n1, a), (n2, b) in zip(bloc, bloc[1:]):
            if base and a in base and b in base:
                continue
            if cle(a) > cle(b):
                print(f"FAIL  {fichier}:{n2 + 1} : une entrée du savoir-faire n'est pas à sa place alphabétique "
                      f"(elle passe avant la ligne {n1 + 1}) : une leçon s'insère à sa place, pas à la fin")
                echecs += 1
    return 2 if echecs else 0

sys.exit(main())
