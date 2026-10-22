// L'onglet Cooks de « parade » et ce que ses gates ont coûté la dernière heure et le dernier jour (#1318, épique
// #1313) : le nombre de passages, la moyenne d'un passage face au budget d'un passage et la tendance de l'heure, leur
// temps et leur processeur au total, tels que `coutDesGates` les donne. Le reste est `cooks-activite`.
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { FACTS as ACTIVITE } from "./cooks-activite.ts";
import { COUT_DES_GATES } from "./file-gates.ts";

const PARADE = RENDUS.parade as Rendu;
export const FACTS = { ...ACTIVITE, coutDesGates: COUT_DES_GATES } as Faits;

export const ecran: Ecran = {
  dit: "L'onglet Cooks de « parade » : sous ses tickets de la dernière heure et du dernier jour, ses gates de la dernière heure et des dernières 24 h — deux et sept passages, ce que coûte un passage en moyenne face au budget, la tendance de l'heure (durée stable, processeur en hausse), leur temps et leur processeur au total",
  largeur: 1440,
  hauteur: 1000,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets-du-projet button:nth-child(2)" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS } }),
  }),
};
