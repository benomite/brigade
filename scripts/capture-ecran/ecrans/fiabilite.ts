// La fiabilité des cooks de « parade » (#987), section de son onglet Cooks sous ses tickets depuis #1699 — elle était
// Settings → Reliability : trois chiffres face à leurs seuils, les causes d'échec qui reviennent le plus. Aucune
// correction de ses consignes n'a été acceptée : `facts` ne porte pas `reculs`, et la section n'en dit rien (#1001).
// La lecture de l'onglet est `station`, `measures` puis `closing --json` (lecture-de-cooks.ts).
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { COOKS, luDeCooks } from "./lecture-de-cooks.ts";

export const ecran: Ecran = {
  dit: "L'onglet Cooks de « parade » : sous ses tickets, la fiabilité de ses cooks — trois chiffres, les causes d'échec —, sans correction acceptée de ses consignes ; sous ses gates, son closer",
  largeur: 1440,
  hauteur: 1400,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets-du-projet button:nth-child(2)" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: { ...cuisine(RENDUS), onglet: { [COOKS]: [luDeCooks()] } },
  }),
};
