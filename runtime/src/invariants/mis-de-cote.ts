// Invariant 3 (#4026) : un ticket parqué (`parked`, #4260) ou mis de côté
// (`served-elsewhere`) a une raison
// nommée et une date pour le revoir : rien n'attend « que quelqu'un s'en
// souvienne ». La raison et la date se lisent de la marque du parking
// (`<!-- brigade:parked … -->`), la seule fiche du rail qui les porte. Sans
// elle, il la pose, du geste du parking : qui il attend — le superviseur
// —, pour quoi, jusqu'à quand. Sa date passée, un ticket parqué reprend seul
// où il était (`ramenerALaRelance`), un ticket mis de côté par le geste
// `back-on-rail`.
import { RELANCE_PAR_DEFAUT_MS } from "../attente.ts";
import { attenteDeLIssue, corpsDuParking, direRelance, reprendALaDate } from "../attente-github/marque.ts";
import { CHEF_TODO, LABEL_PARKED } from "../github-etat/etats.ts";
import { MIS_DE_COTE } from "../github.ts";
import { MARQUE_D_ECHEC, MARQUE_DE_RENVOI } from "../qualite-github.ts";
import { remettreSurLeRail } from "./gestes-du-rail.ts";
import type { Invariant } from "./invariants.ts";

// Ce que la cuisine a dit en dernier en le retenant : la première ligne qui suit sa marque.
const raisonDite = (corps: string | undefined) => corps?.split("\n").slice(1).find((ligne) => ligne.trim() !== "")?.trim() ?? null;

// Qui attend un ticket que cet invariant date.
const QUI = "the supervisor";

export const misDeCoteSansDate: Invariant = async (tour) => {
  for (const ticket of tour.tickets) {
    const retenu = [...MIS_DE_COTE, LABEL_PARKED].filter((label) => ticket.labels.includes(label));
    // Parqué pour le chef, sa carte dit ce qu'il attend : sa réponse, et aucune date.
    if (retenu.length === 0 || ticket.labels.includes(CHEF_TODO)) continue;
    // Illisibles, il est relu au tour suivant : rien ne se pose sur une issue qu'on ne lit pas.
    const commentaires = await tour.github.commentaires(ticket.number).catch(() => null);
    if (commentaires === null) continue;
    // Mis de côté, seule une marque posée depuis sa mise de côté compte : celle d'une attente d'avant ne dit pas pourquoi il l'est.
    const cuisine = commentaires.findLastIndex(({ body }) => body.startsWith(MARQUE_D_ECHEC) || body.startsWith(MARQUE_DE_RENVOI));
    const depuis = ticket.labels.includes(LABEL_PARKED) ? commentaires : commentaires.slice(cuisine + 1);
    const attente = attenteDeLIssue(depuis);
    const etiquettes = retenu.map((label) => `\`${label}\``).join(", ");
    if (attente === null) {
      const what = raisonDite(commentaires[cuisine]?.body) ?? `no reason was written when it got ${etiquettes}`;
      const followUp = new Date(tour.maintenant.getTime() + RELANCE_PAR_DEFAUT_MS).toISOString();
      const entete = corpsDuParking({ what, who: QUI, followUp });
      await tour.reparer({
        invariant: 3,
        ticket: ticket.number,
        // Une fois par mise de côté : celle qui suit un réveil se date de nouveau.
        cle: `undated since=${commentaires[cuisine]?.createdAt ?? "start"}`,
        entete,
        casse: `#${ticket.number} carries ${etiquettes} with no named reason and no date to look at it again.`,
        geste: async () => `added a named reason — “${what}” — and a date to look at it again: ${direRelance(followUp)}. On that date it resumes where it was, on its own.`,
      });
      continue;
    }
    // Parqué, sa date passée le fait reprendre (`ramenerALaRelance`). Mis de côté, seule la date que cet invariant a posée
    // le réveille : une autre marque est celle de quelqu'un, qui garde la main.
    if (ticket.labels.includes(LABEL_PARKED) || attente.who !== QUI || !reprendALaDate(attente, tour.maintenant)) continue;
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
