// Un ticket que la station a mis de côté (`blocked-on-human`) sans PR à merger (#3369) :
// #22 sur « parade », projet GitHub seul. Le commentaire de la station dit pourquoi ; la mise de côté en est tirée par l'app (app/src/tableau/mise-de-cote-github.ts,
// `miseDeCoteDe`), et l'entrée de TODO posée comme la lecture de ce qui attend le chef la pose
// (app/src/tableau/attente-du-chef.ts). Ce fichier n'est pas un écran.
import { avecLAttenteDuChef, type AttenteDuChef } from "../../../app/src/tableau/attente-du-chef.ts";
import { BLOCKED_ON_HUMAN, miseDeCoteDe } from "../../../app/src/tableau/mise-de-cote-github.ts";
import { avecLeRail } from "../../../app/src/vue/rail/github.ts";
import { configuration, cuisine, demarrage, type Donnees, MAINTENANT } from "./commun.ts";
import { MANAGER_ALLUME, PROJETS, RENDUS } from "./cuisine-figee.ts";
import { renduDeParade, SIGNES, SUR_GITHUB, TABLEAU_FIGE, ticket } from "./github-seul-commun.ts";
import { SECOND } from "./rail-waiting-commun.ts";

const DEPOT = "chef/parade";
const DEPUIS = "2026-10-13T09:40:00.000Z";
const COMMENTAIRES = [
  {
    body: "Station `box/claude`: blocked-on-human — the copy of the invoice page needs the chef's call.",
    author_association: "OWNER",
    created_at: DEPUIS,
  },
];
const miseDeCote = miseDeCoteDe(DEPOT, BLOCKED_ON_HUMAN, COMMENTAIRES);

export const CARTE: AttenteDuChef = {
  ticket: 22,
  titre: "Un ticket libre",
  url: `https://github.com/${DEPOT}/issues/22`,
  depuis: DEPUIS,
  quoi: "mise-de-cote",
  ligne: miseDeCote.raison ?? "",
  miseDeCote,
  ...(miseDeCote.chef === undefined ? {} : { chef: miseDeCote.chef }),
};

// Le rail de GitHub, #22 mis de côté par la station.
const RAIL = { ...SUR_GITHUB, tickets: SUR_GITHUB.tickets.map((un) => (un.ticket === 22 ? ticket(22, "86", { creeLe: un.creeLe, miseDeCote }) : un)) };

export const OUVRIR_PARADE = { cliquer: '#projets > button[title^="parade — "]' };

export const donnees = (): Donnees => {
  const lu = avecLAttenteDuChef(avecLeRail(TABLEAU_FIGE, RAIL, SIGNES), { attentes: [CARTE], illisibles: [] });
  return {
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [SECOND] },
    envois: cuisine({ ...RENDUS, parade: { ...renduDeParade(lu), manager: MANAGER_ALLUME } }),
  };
};
