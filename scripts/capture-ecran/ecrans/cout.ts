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
// Un cook fini de « derniers cooks », mot pour mot (runtime/src/montrer-station.ts) ; sans tokens, un cook qui n'a rien déclaré.
const fini = (quand: string, ticket: number, run: string, tours: number, tokens: string | null, pr: number) =>
  `  2026-10-${quand}Z  #${ticket}  r-${run}  sonnet / medium  fini  ${tokens === null ? "" : `${tours} tours · ${n(tokens)} tokens · 9,2 min  `}https://github.com/chef/parade/pull/${pr}`;
// Un cook qui n'a pas fini proprement : `fin` est ce que `station` écrit (« échoué », « interrompu (runtime arrêté) »…).
const perdu = (quand: string, ticket: number, run: string, fin: string, tours: number, tokens: string | null) =>
  fini(quand, ticket, run, tours, tokens, 0).replace("  fini  ", `  ${fin}  `).replace(/  https:.*$/, "");
export const STATIONS: Record<string, string> = {
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
    fini("13T09:48:02.000", 30, "91c0", 31, "412 806", 31),
    perdu("13T08:50:12.000", 7, "0b7d", "échoué", 38, "641 207"),
    fini("13T08:12:40.000", 7, "5a3e", 44, "1 204 311", 8),
    perdu("12T20:15:48.000", 14, "3c9e", "interrompu (runtime arrêté)", 11, "88 530"),
    fini("12T17:30:05.000", 12, "c7d2", 22, "268 090", 29),
    fini("12T15:02:11.000", 12, "b1f4", 36, "533 974", 29),
    fini("12T11:44:50.000", 9, "e08a", 18, "96 420", 26),
    fini("11T16:20:09.000", 21, "2d6b", 27, "782 115", 22),
    fini("11T10:05:33.000", 22, "7f19", 0, null, 21),
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
    "derniers cooks        ",
    fini("13T08:20:00.000", 3, "a4c1", 29, "318 772", 4).replaceAll("chef/parade", "chef/cantine"),
    perdu("13T07:02:30.000", 3, "91ab", "échoué", 15, "142 096"),
    fini("12T18:41:27.000", 5, "d93e", 12, "74 208", 6).replaceAll("chef/parade", "chef/cantine"),
    ...consomme("rien", `2 lancements · 61 tours · ${n("318 772")} tokens`, `7 lancements, dont 2 relectures · 240 tours · ${n("1 506 118")} tokens`),
    "décisions du chef     `station -- <geste> <valeur>` pour en poser une, `station -- help` pour les gestes",
    "",
  ].join("\n"),
};

// Ce que la lecture de l'onglet envoie à la vue : `station` de chaque projet, une lecture chacun.
export const lu = (projet: string, stations = STATIONS): Envoi => {
  const lecture: Lecture = { projet, demande: 0, a: MAINTENANT, sorties: [{ commande: "station", texte: stations[projet] ?? "" }] };
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
