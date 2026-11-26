// Le ticket sensible sur « parade », projet GitHub seul (ticket 3224, épique 3214) : #30, au label `sensitive`, est en
// pass — sa carte du rail porte la marque « sensitive », celles des autres tickets non. Sa livraison verte (PR #41), la
// pass la retient pour le chef (runtime/src/sensible/, ticket 3223) : l'issue #62 au label `chef-todo`, « review before
// merge » — le commentaire de sa sorte (`review-before-merge`) porte la question et le lien de la PR, le corps de l'issue son
// marqueur, comme le runtime les écrit. La vue reçoit ce que l'app en tire (app/src/tableau/attente-du-chef.ts,
// `avecLAttenteDuChef`), la carte lue du corps par `revueDuCorps`.
import { avecLAttenteDuChef, type AttenteDuChef } from "../../../app/src/tableau/attente-du-chef.ts";
import { revueDuCorps } from "../../../app/src/vue/carte-sensible/carte-sensible-github.ts";
import { avecLeRail } from "../../../app/src/vue/rail/github.ts";
import { configuration, cuisine, demarrage, type Donnees, MAINTENANT } from "./commun.ts";
import { MANAGER_ALLUME, PROJETS, RENDUS } from "./cuisine-figee.ts";
import { renduDeParade, SIGNES, SUR_GITHUB, TABLEAU_FIGE } from "./github-seul-commun.ts";
import { SECOND } from "./rail-waiting-commun.ts";

const DEPOT = "chef/parade";
const SHA = "5b1d0e7c9a2f4e6081a3b5c7d9e1f20314253647";
export const QUESTION = "#30 is sensitive: review PR #41 before it is merged. Merge it and the kitchen merges PR #41; send it back with a note and a cook takes #30 up again with your note.";
export const TEXTE = `${QUESTION}\n\nPull request: https://github.com/${DEPOT}/pull/41`;
// Le corps de l'issue, tel que runtime/src/validation-design/validation-design.ts (`corpsDeLaCarte`) l'écrit pour la sorte
// `SENSIBLE` de runtime/src/sensible/sensible.ts.
export const CORPS = [`<!-- brigade:sensitive-review pr=41 ticket=30 sha=${SHA} -->`, `**${QUESTION}**`, "", "Ticket: #30 — Delete a user's data on request", `Pull request: https://github.com/${DEPOT}/pull/41`].join("\n");

export const CARTE: AttenteDuChef = {
  ticket: 62,
  titre: "review before merge",
  url: `https://github.com/${DEPOT}/issues/62`,
  depuis: "2026-10-13T09:58:00.000Z",
  quoi: "carte",
  ligne: `${QUESTION} — on its Todo card: Merge, or Send back with a note`,
  chef: { sorte: "review-before-merge", texte: TEXTE, sensible: revueDuCorps(DEPOT, CORPS) ?? undefined } as AttenteDuChef["chef"],
};

// Le rail de GitHub, #30 au label `sensitive`.
const RAIL = { ...SUR_GITHUB, tickets: SUR_GITHUB.tickets.map((ticket) => (ticket.ticket === 30 ? { ...ticket, sensible: true as const } : ticket)) };

export const OUVRIR_PARADE = { cliquer: '#projets > button[title^="parade — "]' };
export const NOTE = "textarea[data-champ=\"note-sensible\"]";

export const donnees = (): Donnees => {
  const lu = avecLAttenteDuChef(avecLeRail(TABLEAU_FIGE, RAIL, SIGNES), { attentes: [CARTE], illisibles: [] });
  return {
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [SECOND] },
    envois: cuisine({ ...RENDUS, parade: { ...renduDeParade(lu), manager: MANAGER_ALLUME } }),
  };
};
