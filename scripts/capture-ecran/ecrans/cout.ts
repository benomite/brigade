// L'onglet Cost de « parade » (#908) : `station` lue sur la box de chaque projet, avec ce qu'elle dit
// de ce que le projet a lancé — `consommé`, en cours, sur 5 h et sur 24 h, mot pour mot comme
// runtime/src/montrer-station.ts l'écrit (nombres en fr-FR, séparés d'une espace fine insécable).
import type { Lecture } from "../../../app/src/box.ts";
import { configuration, cuisine, demarrage, type Ecran, type Envoi, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const n = (chiffres: string) => chiffres.replaceAll(" ", " ");
const consomme = (enCours: string, cinq: string, vingtQuatre: string) => [
  `consommé              en cours : ${enCours}`,
  `                      5 h : ${cinq}`,
  `                      24 h : ${vingtQuatre}`,
  "                      ce que ce projet a lancé, pas la consommation du compte : /usage la donne",
];
const STATIONS: Record<string, string> = {
  parade: [
    "station               box/claude — moteur claude, fournit : claude",
    "cooks simultanés      2 au plus (réglé par le chef) — `station -- cooks <N>` pour le changer, 0 pour aucune limite",
    "machine               tient",
    "connexion Max         tenue pour bonne",
    "quota                 disponible",
    "retenue               aucune — tout ticket servable part",
    "cooks en cours        1",
    "  #14  r-4f2a  opus / high  lancé le 2026-10-13T09:52:11.000Z  cook/14-4f2a",
    "serveurs              aucun",
    "derniers cooks        ",
    `  2026-10-13T09:48:02.000Z  #30  r-91c0  sonnet / medium  fini  31 tours · ${n("412 806")} tokens · 9,2 min  https://github.com/chef/parade/pull/31`,
    ...consomme(`1 lancement · 18 tours · ${n("96 420")} tokens`, `6 lancements, dont 2 relectures · 214 tours · ${n("1 284 530")} tokens`, `19 lancements, dont 5 relectures et 3 jugements · 802 tours · ${n("4 912 044")} tokens`),
    "décisions du chef     `station -- <geste> <valeur>` pour en poser une, `station -- help` pour les gestes",
    "",
  ].join("\n"),
  cantine: [
    "station               box/claude — moteur claude, fournit : claude",
    "cooks simultanés      1 au plus (réglé par le chef) — `station -- cooks <N>` pour le changer, 0 pour aucune limite",
    "machine               tient",
    "connexion Max         tenue pour bonne",
    "quota                 disponible",
    "retenue               aucune — tout ticket servable part",
    "cooks en cours        aucun",
    "serveurs              aucun",
    "derniers cooks        aucun",
    ...consomme("rien", `2 lancements · 61 tours · ${n("318 772")} tokens`, `7 lancements, dont 2 relectures · 240 tours · ${n("1 506 118")} tokens`),
    "décisions du chef     `station -- <geste> <valeur>` pour en poser une, `station -- help` pour les gestes",
    "",
  ].join("\n"),
};

// Ce que la lecture de l'onglet envoie à la vue : `station` de chaque projet, une lecture chacun.
const lu = (projet: string): Envoi => {
  const lecture: Lecture = { projet, demande: 0, a: MAINTENANT, sorties: [{ commande: "station", texte: STATIONS[projet] ?? "" }] };
  return { sur: "surContenu", args: [lecture, undefined, undefined], demande: "onglet" };
};

export const ecran: Ecran = {
  dit: "L'onglet Cost de « parade » : les tokens lancés sur 5 h, 24 h et 7 j, tous projets confondus, et la part de chacun",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets > button:first-child" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: { ...cuisine(RENDUS), onglet: { "parade/cooks": PROJETS.map(({ nom }) => lu(nom)) } },
  }),
};
