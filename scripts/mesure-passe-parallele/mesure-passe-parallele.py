#!/usr/bin/env python3
"""Compare le temps de la pass en série et en parallèle, sur une rafale.

Usage : scripts/mesure-passe-parallele/mesure-passe-parallele.py
          [--livraisons N] [--jugement SECONDES] [--plafond P] [--zone-unique]
  --livraisons N      nombre de livraisons de la rafale (défaut 10)
  --jugement S        durée fixe du jugement d'une livraison, gates, relecture
                      et merge compris, en secondes (défaut 600)
  --plafond P         plafond du parallèle : livraisons jugées en même temps
                      (défaut 4)
  --zone-unique       variante : toutes les livraisons partagent une zone ;
                      sans, chacune a sa zone, disjointe des autres

Simulation, sans attente réelle ni appel à la pass : un modèle d'ordonnancement
qui suit la règle « zones disjointes en parallèle, zones qui se recoupent dans
l'ordre, le tout plafonné ». Les livraisons arrivent ensemble, dans l'ordre de
leur numéro ; une livraison démarre quand il reste de la place sous le plafond,
qu'aucune livraison en cours ne recoupe sa zone et qu'aucune livraison plus
ancienne encore en attente ne la recoupe. Elle est mergée à la fin de son
jugement. Imprime le temps jusqu'au merge de la dernière, en série (plafond 1)
puis en parallèle, et leur rapport.
"""
import argparse
import heapq


def ordonnancer(zones, jugement, plafond):
    """Temps du merge de la dernière livraison."""
    attente = list(range(len(zones)))
    en_cours = []  # tas de (fin, livraison)
    t = 0.0
    fin_derniere = 0.0
    while attente or en_cours:
        occupees = set().union(*(zones[i] for _, i in en_cours)) if en_cours else set()
        bloquees = set(occupees)
        demarrees = []
        for i in attente:
            if len(en_cours) + len(demarrees) < plafond and not (zones[i] & bloquees):
                demarrees.append(i)
            bloquees |= zones[i]  # une plus récente ne double pas une plus ancienne qui attend
        for i in demarrees:
            attente.remove(i)
            heapq.heappush(en_cours, (t + jugement, i))
        t, _ = heapq.heappop(en_cours)
        fin_derniere = max(fin_derniere, t)
        while en_cours and en_cours[0][0] == t:
            heapq.heappop(en_cours)
    return fin_derniere


def main():
    p = argparse.ArgumentParser(description="Temps de la pass, série contre parallèle, sur une rafale.")
    p.add_argument("--livraisons", type=int, default=10)
    p.add_argument("--jugement", type=float, default=600.0)
    p.add_argument("--plafond", type=int, default=4)
    p.add_argument("--zone-unique", action="store_true")
    a = p.parse_args()
    if a.livraisons < 1 or a.plafond < 1 or a.jugement <= 0:
        p.error("livraisons et plafond valent au moins 1, jugement est positif")
    zones = [{"zone"} if a.zone_unique else {f"zone-{i}"} for i in range(a.livraisons)]
    serie = ordonnancer(zones, a.jugement, 1)
    parallele = ordonnancer(zones, a.jugement, a.plafond)
    print(f"{a.livraisons} livraisons, zones {'communes' if a.zone_unique else 'disjointes'}, jugement {a.jugement:g} s, plafond {a.plafond}")
    print(f"série (plafond 1)      : {serie:g} s")
    print(f"parallèle (plafond {a.plafond}) : {parallele:g} s")
    print(f"rapport série/parallèle : {serie / parallele:.2f}")


if __name__ == "__main__":
    main()
