// WAITING sur « parade », projet GitHub seul (#3075) : son rail tiré de GitHub (github-seul-commun.ts), son TODO — deux
// cartes `chef-todo`, #41 et #47 — et #40 en WAITING, ce qu'il attend lu du commentaire que le runtime a posé sur son
// issue. La vue reçoit ce que l'app en tire (app/src/tableau/attente-du-chef.ts, `avecLAttenteDuChef`) : chaque carte de
// TODO porte « waiting for… », la carte de WAITING dit quoi, de qui, sa relance, et porte « resume » et « it arrived ».
import type { Tiers } from "../../../app/src/faits.ts";
import { avecLAttenteDuChef } from "../../../app/src/tableau/attente-du-chef.ts";
import { avecLeRail } from "../../../app/src/vue/rail/github.ts";
import { configuration, cuisine, demarrage, type Donnees, MAINTENANT } from "./commun.ts";
import { MANAGER_ALLUME, PROJETS, RENDUS } from "./cuisine-figee.ts";
import { renduDeParade, SIGNES, SUR_GITHUB, TABLEAU_FIGE } from "./github-seul-commun.ts";
import { SECOND } from "./rail-waiting-commun.ts";

const issue = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const carte = (ticket: number, titre: string, depuis: string, sorte: string, texte: string, ligne: string) => ({ ticket, titre, url: issue(ticket), depuis, quoi: "carte" as const, ligne, chef: { sorte, texte } });
const ATTENTES = [
  carte(41, "Export the journal as CSV", "2026-10-13T08:30:00.000Z", "blocked", "Three cooks failed on the same test. The branch is kept; say whether to retry or reshape the ticket.", "Three cooks failed on the same test — answer on its Todo card, in your own words"),
  carte(47, "Which plan for the free tier?", "2026-10-13T09:10:00.000Z", "product-question", "The ticket does not say if the free tier keeps the export. Answer on the issue.", "The ticket does not say if the free tier keeps the export — answer on its Todo card, in your own words"),
];
// Ce que le commentaire du runtime sur #40 dit (runtime/src/attente.ts, `direMarque`), lu par l'app.
const TIERS_40: Tiers = { quoi: "the payment provider's sandbox keys", qui: "Stripe support", depuis: "2026-10-10T14:00:00.000Z", relance: "2026-10-17T00:00:00.000Z", aLArrivee: "it goes back to the kitchen, without going through TODO: it is put back on the rail, and a cook takes it in its turn" };

const LU = avecLAttenteDuChef(avecLeRail(TABLEAU_FIGE, SUR_GITHUB, SIGNES), { attentes: ATTENTES, illisibles: [], enWaiting: [{ ticket: 40, titre: "Le fournisseur de paiement", url: issue(40), tiers: TIERS_40 }] } as Parameters<typeof avecLAttenteDuChef>[1]);

export const OUVRIR_PARADE = { cliquer: '#projets > button[title^="parade — "]' };
export const TODO = "#rail section.colonne[data-attend]";

export const donnees = (): Donnees => ({
  maintenant: MAINTENANT,
  reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [SECOND] },
  envois: cuisine({ ...RENDUS, parade: { ...renduDeParade(LU), manager: MANAGER_ALLUME } }),
});
