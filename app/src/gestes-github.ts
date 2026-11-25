// Les gestes du chef depuis la vue du rail, écrits sur GitHub même (#2061) : aucune box ne lit plus de tableau de la
// cuisine, et les stations ne lisent que les issues, leurs labels et leurs commentaires. Ce qui a un fait sur GitHub s'y
// écrit, par l'accès GitHub de l'app — le jeton du `gh` de ce poste, celui du chef :
//   - « remove from the rail » (`retirer`, sur la fiche) : le label `fire` retiré de l'issue — plus aucune station ne
//     prend le ticket ;
//   - « back to the kitchen » (`cuisine`, sur la fiche) et « it arrived » (sur une carte de WAITING) : le label `parked`
//     retiré, et tout label d'attente d'avant parked — le ticket reprend où il était (#4129) ;
//   - le commentaire du chef, sur la fiche : posté sur l'issue du ticket, à son nom — le cook qui le prend le lit.
// Le reste n'a aucun fait sur GitHub qu'une station lise : rien ne part, et la phrase dit où le faire (`SANS_FAIT`).
//
// Rien ne part pour un ticket que la dernière lecture du rail ne porte pas — ni sur son rail, ni dans TODO —, ni sans
// lecture : chaque fois une phrase, et rien n'est écrit.
import { LABEL_PARKED } from "../../runtime/src/attente-github/marque.ts";
import { LABELS_D_AVANT_PARKED } from "../../runtime/src/github-etat/etats.ts";
import { refusDe } from "./tableau/client.ts";
import type { TableauLu } from "./tableau/lecture.ts";
import type { ClientDeLaPriorite } from "./priorite.ts";

// Ce que la fiche reçoit (vue.js, `jouerGesteDeFiche`) : le geste fait, son adresse au survol — ou pourquoi rien n'est
// parti, son détail au survol.
export type Ecrit = { fait: string; detail: string } | { refus: string; detail: string };

// Les gestes de la fiche qui s'écrivent sur GitHub, et le label que chacun retire de l'issue.
// `cuisine` : le ticket parqué reprend où il était (#4129, d'abord `waiting`).
export const LABELS_DES_GESTES = { retirer: "fire", cuisine: LABEL_PARKED } as const;
export type GesteSurGithub = keyof typeof LABELS_DES_GESTES;
export const surGithub = (id: unknown): id is GesteSurGithub => typeof id === "string" && Object.hasOwn(LABELS_DES_GESTES, id);

// Ce que la vue demande et qui n'a aucun fait sur GitHub qu'une station lise.
export const SANS_FAIT = {
  carte: "nothing was posted: a card of TODO is answered on its issue on GitHub — the station reads the issue, not the app",
} as const;

const PAS_LU = "nothing was written: the rail of this project has not been read yet — read it again";

// Les tickets que la dernière lecture porte : ceux de son rail (`faits.rail`) et de TODO (`faits.attend`, et `faits.attendAutres` : l'assignation ne retient personne, #3071).
export function ticketsLus(lu: Pick<TableauLu, "faits">): Set<number> {
  const tickets = (liste: unknown): number[] =>
    Array.isArray(liste) ? liste.flatMap((entree: unknown) => (typeof entree === "object" && entree !== null && typeof (entree as { ticket?: unknown }).ticket === "number" ? [(entree as { ticket: number }).ticket] : [])) : [];
  return new Set([...tickets(lu.faits.rail), ...tickets(lu.faits.attend), ...tickets(lu.faits.attendAutres)]);
}

const numero = (ticket: unknown): ticket is number => typeof ticket === "number" && Number.isSafeInteger(ticket) && ticket >= 1;
const raison = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Retire de l'issue du ticket le label du geste : `fire` pour le retirer du rail, `parked` pour le déparquer — et, pour le
// déparquer, chaque label d'attente d'avant parked (runtime/src/github-etat/etats.ts) : un ticket que l'un d'eux parque
// reprend aussi. Une issue qui ne le porte déjà plus : c'est fait.
export async function retirerLeLabel(lu: TableauLu | undefined, id: GesteSurGithub, ticket: unknown, client: ClientDeLaPriorite): Promise<Ecrit> {
  if (!numero(ticket)) return { refus: "nothing was written: the action names no ticket", detail: "" };
  if (lu === undefined) return { refus: PAS_LU, detail: "" };
  if (!ticketsLus(lu).has(ticket)) return { refus: `nothing was written: #${ticket} is not on the latest rail read — read it again`, detail: "" };
  const label = LABELS_DES_GESTES[id];
  const issue = `https://github.com/${lu.depot}/issues/${ticket}`;
  for (const retire of id === "cuisine" ? [label, ...LABELS_D_AVANT_PARKED] : [label]) {
    try {
      const reponse = await client.ecrire("DELETE", `/repos/${lu.depot}/issues/${ticket}/labels/${encodeURIComponent(retire)}`);
      if (reponse.status !== 200 && reponse.status !== 404) throw refusDe(`the removal of \`${retire}\``, reponse);
    } catch (erreur) {
      // Un label d'avant que GitHub ne retire pas : `parked` l'est déjà, le ticket reste parqué par celui-là.
      const deja = retire === label ? "nothing was changed:" : `\`${label}\` is removed, but`;
      return { refus: `${deja} GitHub did not remove \`${retire}\` from #${ticket}`, detail: raison(erreur) };
    }
  }
  const fait = id === "retirer" ? `taken off the rail on GitHub: #${ticket} no longer carries \`fire\` — no station takes it` : `back to the kitchen on GitHub: #${ticket} no longer carries \`${label}\` — it resumes exactly where it was`;
  return { fait, detail: issue };
}

// Poste le commentaire du chef sur l'issue du ticket, tel qu'il est écrit. Rend son adresse, ou pourquoi il n'est pas parti.
export async function commenterLIssue(depot: string, ticket: number, texte: string, client: ClientDeLaPriorite): Promise<{ url: string | null } | { raison: string }> {
  try {
    const reponse = await client.ecrire("POST", `/repos/${depot}/issues/${ticket}/comments`, { body: texte });
    if (reponse.status !== 201) throw refusDe("the comment", reponse);
    const { html_url: url } = (typeof reponse.data === "object" && reponse.data !== null ? reponse.data : {}) as Record<string, unknown>;
    return { url: typeof url === "string" ? url : null };
  } catch (erreur) {
    return { raison: `The comment could not be posted on #${ticket} of ${depot}: ${raison(erreur).replace(/[.\s]+$/, "")}.` };
  }
}
