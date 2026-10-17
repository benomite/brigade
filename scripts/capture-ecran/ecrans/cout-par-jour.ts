// L'onglet Cost de « parade » quand la box communique aussi ses jours (#909) : la même `station` que
// l'écran `cout`, dont le bloc `consommé` porte en plus une ligne par jour — « 2026-10-13 : … tokens ».
// Le runtime ne les écrit pas encore : c'est la forme que la courbe lit (app/src/vue/cost/courbe.js).
// `cantine` ne dit pas le 2026-10-09 : sa ligne y a un trou, pas un zéro.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { lu, STATIONS } from "./cout.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const n = (chiffres: string) => chiffres.replaceAll(" ", " ");
const JOURS: Record<string, [string, string][]> = {
  parade: [
    ["2026-10-07", "1 284 006"],
    ["2026-10-08", "2 906 412"],
    ["2026-10-09", "2 210 880"],
    ["2026-10-10", "rien"],
    ["2026-10-11", "3 702 118"],
    ["2026-10-12", "5 118 940"],
    ["2026-10-13", "4 912 044"],
  ],
  cantine: [
    ["2026-10-07", "602 310"],
    ["2026-10-08", "1 120 400"],
    ["2026-10-10", "418 002"],
    ["2026-10-11", "rien"],
    ["2026-10-12", "1 940 551"],
    ["2026-10-13", "1 506 118"],
  ],
};
const parJour = (projet: string) => (JOURS[projet] ?? []).map(([jour, tokens]) => `                      ${jour} : ${tokens === "rien" ? "rien" : `${n(tokens)} tokens`}`);
// Les lignes des jours, dans le bloc `consommé`, après celle des 24 h.
const STATIONS_PAR_JOUR = Object.fromEntries(
  Object.entries(STATIONS).map(([projet, texte]) => {
    const lignes = texte.split("\n");
    const apres = lignes.findIndex((ligne) => ligne.trimStart().startsWith("24 h : ")) + 1;
    return [projet, [...lignes.slice(0, apres), ...parJour(projet), ...lignes.slice(apres)].join("\n")];
  }),
);

export const ecran: Ecran = {
  dit: "L'onglet Cost de « parade », la box communiquant ses jours : sous les trois chiffres, la courbe des tokens par jour, une ligne par projet",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets > button:first-child" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: { ...cuisine(RENDUS), onglet: { "parade/cooks": PROJETS.map(({ nom }) => lu(nom, STATIONS_PAR_JOUR)) } },
  }),
};
