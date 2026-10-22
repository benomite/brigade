// L'onglet Cooks de « parade » et ce que ses gates ont coûté le dernier jour (#1318, épique #1313) : le nombre de
// passages, leur temps et leur processeur au total, tels que `coutDesGates.lastDay` les donne, à côté du budget
// d'un passage. Le reste est `cooks-activite`.
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { FACTS as ACTIVITE } from "./cooks-activite.ts";
import { COUT_DES_GATES } from "./file-gates.ts";

const PARADE = RENDUS.parade as Rendu;
export const FACTS = { ...ACTIVITE, coutDesGates: COUT_DES_GATES } as Faits;

export const ecran: Ecran = {
  dit: "L'onglet Cooks de « parade » : sous ses tickets de la dernière heure et du dernier jour, ses gates des dernières 24 h — sept passages, leur temps et leur processeur au total —, à côté du budget d'un passage",
  largeur: 1440,
  hauteur: 1000,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets-du-projet button:nth-child(2)" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS } }),
  }),
};
