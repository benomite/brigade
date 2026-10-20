// L'espace d'un projet qui cuit sur cet ordinateur (#1122) : « parade », sans `hote` dans le
// fichier des projets, servi par la station de ce Mac — lu ici, sans `ssh`, il a son rail, sa
// file et ses cartes comme un projet servi par une box. « cantine » reste sur sa box.
import type { Terminal } from "../../../app/src/terminaux.ts";
import type { VuDesStations } from "../../../app/src/stations/stations.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "fil repris : la session d'hier", arrete: false };
const ECRAN_DU_SECOND = ["\x1b[1msecond · parade\x1b[0m", "", "  /brigade:second — rail lu à 10:04", "", "\x1b[2m> \x1b[0m"].join("\r\n");

// « parade » est écrit à la main, sans `hote` : c'est la station de ce Mac qui le sert.
const ICI = PROJETS.map((projet) => {
  if (projet.nom !== "parade") return projet;
  const { box: _, ...sansBox } = projet;
  return sansBox;
});
const STATIONS: VuDesStations = {
  a: MAINTENANT,
  stations: [
    { id: "macbook", nom: "macbook", machine: "macOS 15 · 10 cores", etat: "en-ligne", ligne: "online · 1 project: parade", pannes: [], dit: "online", version: "", projets: ["parade"], max: null },
    { id: "box", nom: "box", machine: "Debian 12 · 8 cores", etat: "en-ligne", ligne: "online · 1 project: cantine", pannes: [], dit: "online", version: "", projets: ["cantine"], max: null },
  ],
};

export const ecran: Ecran = {
  dit: "L'espace de « parade », qui cuit sur ce Mac sans `hote` (#1122) : son rail, sa file et ses cartes, lus sans `ssh`",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade"]' }],
  donnees: () => {
    const envois = cuisine(RENDUS);
    return {
      maintenant: MAINTENANT,
      reponses: { demarrage: { ...demarrage(configuration(ICI), (nom) => nom === "parade"), stations: STATIONS }, espace: [SECOND] },
      envois: { ...envois, regarder: { ...envois.regarder, parade: [...(envois.regarder.parade ?? []), { sur: "surSortie", args: [SECOND.id, ECRAN_DU_SECOND] }] } },
    };
  },
};
