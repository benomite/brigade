// L'onglet Cooks de « parade » entier, sur un écran de portable 1366×768 (#1456, épique #1454) : tous ses blocs à la
// fois — ses quatre stations et leurs cooks (#14 coincé, `STUCK`), ses tickets de l'heure et du jour, ses gates, son
// plafond de calibrage, les rôles de sa cuisine, ce que ses cooks ont appris, la lecture de `station`. Ce qui doit se
// voir sans défiler : ce qui cuit, et ce qui est coincé et pourquoi.
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { FACTS as STATIONS } from "./cooks-stations.ts";
import { COUT_DES_GATES } from "./file-gates.ts";
import { ROLES } from "./cooks-roles.ts";
import { APPRENTISSAGE } from "./cooks-apprentissage.ts";

const PARADE = RENDUS.parade as Rendu;

export const FACTS: Faits = {
  ...STATIONS,
  activiteCuisine: { lastHour: { served: 1, sentBack: 2, escalated: 0 }, lastDay: { served: 2, sentBack: 4, escalated: 1 } },
  coutDesGates: COUT_DES_GATES,
  rolesCuisine: ROLES,
  apprentissage: APPRENTISSAGE,
  plafondDeCalibrage: { modele: "opus", effort: "high", parLeChef: { modele: false, effort: false } },
} as Faits;

// `status` dit #14 coincé : plus aucun progrès depuis 31 min.
export const STATUS = PARADE.status.replace("by box/claude since 12 min, no progress since 3 min, lease 27 min left", "by box/claude since 42 min, STUCK: no progress since 31 min, lease 3 min left");

export const ecran: Ecran = {
  dit: "L'onglet Cooks de « parade » sur un écran de portable 1366×768 : ses quatre stations et leurs cooks (#14 coincé), ses tickets de l'heure et du jour, ses gates, son plafond de calibrage, ses rôles, ce que ses cooks ont appris, la lecture de `station`",
  largeur: 1366,
  hauteur: 768,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets-du-projet button:nth-child(2)" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS, status: STATUS } }),
  }),
};
