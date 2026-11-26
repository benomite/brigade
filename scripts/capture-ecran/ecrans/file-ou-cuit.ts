// La file de « parade » quand la box sature et que le Mac a pris un ticket ordinaire (#853) : deux
// tickets en cours dans Taken, #14 sur la box, #15 sur le Mac. Ce que la box rend de plus que la
// cuisine figée : le cook de #15 sur `mac/claude`, sa ligne sous `rail`, et les stations du projet —
// `facts` dit laquelle est distante, d'où la carte tire « cooks on ».
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;
const TITRE = "La carte des desserts";
export const FACTS: Faits = {
  ...PARADE.facts,
  compteurs: { ...PARADE.facts.compteurs, auTravail: 2 },
  rail: [
    ...PARADE.facts.rail.slice(0, 1),
    { ticket: 15, etat: "pris", titre: TITRE, url: "https://github.com/chef/parade/issues/15", activite: null, attente: null },
    ...PARADE.facts.rail.slice(1),
  ],
  cooks: [...(PARADE.facts.cooks ?? []), { ticket: 15, titre: TITRE, station: "mac/claude" }],
  stations: [
    { station: "box/claude", distante: false, plafond: 1, ordinaires: false, bacASable: null, prendOrdinaires: true },
    { station: "mac/claude", distante: true, plafond: 2, ordinaires: true, bacASable: { disponible: true, raison: null, version: "2.1.250", depuis: "2026-10-13T09:30:00.000Z" }, prendOrdinaires: true },
  ],
};
export const STATUS = PARADE.status
  .replace("rail       1 taken · 2 in pass · 2 queued", "rail       2 taken · 2 in pass · 2 queued")
  .replace(/(  #14  taken .*\n)/, `$1  #15  taken  -  by mac/claude since 6 min, lease 24 min left  ${TITRE}\n`)
  .replace("cooks      1 running", "cooks      2 running");

export const ecran: Ecran = {
  dit: "La file de « parade », la box saturée : dans Taken, #14 cuit sur la box et #15 sur le Mac",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS, status: STATUS } }),
  }),
};
