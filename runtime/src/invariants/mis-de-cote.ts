// Invariant 3 (#4026) : un ticket mis de côté (`set-aside:failures`), parqué
// (`served-elsewhere`) ou en WAITING a une raison nommée et une date pour le
// revoir : rien n'attend « que quelqu'un s'en souvienne ». La raison et la date
// se lisent de la marque de WAITING (`<!-- brigade:waiting … -->`), la seule
// fiche du rail qui les porte. Sans elle, le superviseur la pose, du geste
// `waiting` : ce que le ticket attend, de qui, jusqu'à quand. Sa date passée,
// il le réveille : un ticket en WAITING rentre seul sur le rail
// (`ramenerALaRelance`), un ticket mis de côté par le geste `back-on-rail`.
import { RELANCE_PAR_DEFAUT_MS } from "../attente.ts";
import { attenteDeLIssue, corpsDeLAttente, direRelance } from "../attente-github/attente-github.ts";
import { LABEL_WAITING } from "../github-etat/etats.ts";
import { MIS_DE_COTE } from "../github.ts";
import { MARQUE_D_ECHEC, MARQUE_DE_RENVOI } from "../qualite-github.ts";
import { remettreSurLeRail } from "../superviseur/gestes.ts";
import type { Invariant } from "./invariants.ts";

// Ce que la cuisine a dit en dernier en le retenant : la première ligne qui suit sa marque.
const raisonDite = (corps: string | undefined) => corps?.split("\n").slice(1).find((ligne) => ligne.trim() !== "")?.trim() ?? null;

export const misDeCoteSansDate: Invariant = async (tour) => {
  for (const ticket of tour.tickets) {
    const retenu = [...MIS_DE_COTE, LABEL_WAITING].filter((label) => ticket.labels.includes(label));
    if (retenu.length === 0) continue;
    const commentaires = await tour.github.commentaires(ticket.number);
    // Mis de côté, seule une marque posée depuis sa mise de côté compte : celle d'une attente d'avant ne dit pas pourquoi il l'est.
    const cuisine = commentaires.findLastIndex(({ body }) => body.startsWith(MARQUE_D_ECHEC) || body.startsWith(MARQUE_DE_RENVOI));
    const depuis = ticket.labels.includes(LABEL_WAITING) ? commentaires : commentaires.slice(cuisine + 1);
    const attente = attenteDeLIssue(depuis);
    const etiquettes = retenu.map((label) => `\`${label}\``).join(", ");
    if (attente === null) {
      const what = raisonDite(commentaires[cuisine]?.body) ?? `no reason was written when it got ${etiquettes}`;
      const followUp = new Date(tour.maintenant.getTime() + RELANCE_PAR_DEFAUT_MS).toISOString();
      const entete = corpsDeLAttente({ what, who: "the supervisor", followUp, backOnFollowUp: true });
      await tour.reparer({
        invariant: 3,
        ticket: ticket.number,
        // Une fois par mise de côté : celle qui suit un réveil se date de nouveau.
        cle: `undated since=${commentaires[cuisine]?.createdAt ?? "start"}`,
        entete,
        casse: `#${ticket.number} carries ${etiquettes} with no named reason and no date to look at it again.`,
        geste: async () => `added a named reason — “${what}” — and a date to look at it again: ${direRelance(followUp)}. On that date it goes back on the rail on its own.`,
      });
      continue;
    }
    // En WAITING, sa relance passée le ramène sur le rail (`ramenerALaRelance`) ; posée par le chef, elle reste à lui.
    if (ticket.labels.includes(LABEL_WAITING) || attente.backOnFollowUp !== true || Date.parse(attente.followUp) > tour.maintenant.getTime()) continue;
    const { github } = tour;
    if (github.issue === undefined) continue;
    await tour.reparer({
      invariant: 3,
      ticket: ticket.number,
      cle: `wake=${attente.followUp}`,
      casse: `#${ticket.number} carries ${etiquettes} past its date to look at it again (${direRelance(attente.followUp)}).`,
      geste: async () => `woke it: ${(await remettreSurLeRail({ github: { issue: github.issue!.bind(github), labelliser: github.labelliser.bind(github), delabelliser: github.delabelliser.bind(github) } }, ticket.number, `set aside for “${attente.what}” until ${direRelance(attente.followUp)}`)).fait}.`,
    });
  }
};
