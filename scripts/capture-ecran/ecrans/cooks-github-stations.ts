// L'onglet Cooks de « parade » sur GitHub seul, ses stations dans leurs trois états (#2358) : box/claude tient #14 et
// #30 — elle cuit, ses cartes dessous ; le MacBook Pro du chef a donné signe de vie il y a une minute sans tenir de
// ticket — atteint, il attend ; le PC du salon s'est tu il y a trois jours — pas atteint, son dernier signe de vie à
// l'écran. La même ligne pour la box et les ordinateurs ; rien des stations que l'ancien journal déclarait.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { renduDeParade, signe, SUR_GITHUB, TABLEAU_FIGE, ticket } from "./github-seul-commun.ts";
import { avecLeRail } from "../../../app/src/vue/rail/github.ts";

const RAIL = { ...SUR_GITHUB, tickets: SUR_GITHUB.tickets.map((lu) => (lu.ticket === 16 ? ticket(16, "en attente", { priorite: 2 }) : lu)) };
const SIGNES = { lus: [signe("box", "2026-10-13T10:03:10.000Z"), signe("MacBook Pro", "2026-10-13T10:03:20.000Z"), signe("PC du salon", "2026-10-10T18:40:00.000Z")] };

export const ecran: Ecran = {
  dit: "L'onglet Cooks de « parade » sur GitHub seul : une station qui cuit, une qui attend, une qui s'est tue, d'après leurs prises et leurs signes de vie (#2358)",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets-du-projet button:nth-child(2)" }],
  donnees: () => ({ maintenant: MAINTENANT, reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] }, envois: cuisine({ ...RENDUS, parade: renduDeParade(avecLeRail(TABLEAU_FIGE, RAIL, SIGNES)) }) }),
};
