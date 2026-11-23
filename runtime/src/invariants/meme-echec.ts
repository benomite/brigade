// Invariant 2 (#4026) : le même échec sur le même commit n'est ni jugé ni
// relancé deux fois. Le jugement, la relecture le tient déjà : une tête refusée
// ne se rejuge jamais (github-etat/fusion.ts, #3961). La relance, ce contrôle la
// tient : un cook relancé sur la tête d'une PR qui s'arrête sans livraison et la
// laisse telle quelle (son commentaire d'échec porte `sha=<tête>`) a rencontré
// l'échec de cette tête ; relancé de nouveau, il rejouerait le même échec sur le
// même commit (#4001). Le ticket s'arrête : il va au manager, ou il est mis de côté.
import { MARQUE_D_ECHEC, MARQUE_DE_RENVOI } from "../qualite-github.ts";
import { LABEL_IN_PASS, LABEL_TAKEN, LABEL_WAITING } from "../github-etat/etats.ts";
import { ECHECS_ATTEINTS, estMisDeCote } from "../github.ts";
import { A_LA_MAIN } from "../brigade-github.ts";
import type { Invariant } from "./invariants.ts";

// La tête sur laquelle un cook s'est arrêté sans livraison, dite dans sa marque.
export const avecLaTete = (sha: string | null) => (sha === null ? "" : ` sha=${sha}`);
const teteDeLEchec = (corps: string) => /^<!-- brigade:echec [^\n]*\bsha=([0-9a-f]{7,40})\b/.exec(corps)?.[1] ?? null;

export const memeEchecRelance: Invariant = async (tour) => {
  for (const ticket of tour.tickets) {
    if (tour.enCuisine(ticket.number) || estMisDeCote(ticket.labels) || [LABEL_TAKEN, LABEL_IN_PASS, LABEL_WAITING, A_LA_MAIN].some((label) => ticket.labels.includes(label))) continue;
    // Illisibles, il n'est pas jugé à ce tour : la prise relit ses commentaires, et ne prend rien qu'elle ne lit pas.
    const commentaires = await tour.github.commentaires(ticket.number).catch(() => null);
    if (commentaires === null) continue;
    // Le dernier mot de la cuisine sur le ticket : un échec, ou un renvoi qui relance sur une tête neuve.
    const dernier = commentaires.filter(({ body }) => body.startsWith(MARQUE_D_ECHEC) || body.startsWith(MARQUE_DE_RENVOI)).at(-1);
    const sha = dernier === undefined ? null : teteDeLEchec(dernier.body);
    if (dernier === undefined || sha === null) continue;
    const pr = await tour.github.prDuTicket(ticket.number);
    if (pr === null || pr.state !== "open" || pr.sha !== sha) continue;
    const motif = dernier.body.match(/ — ([^\n]*)/)?.[1] ?? "its cook stopped without a delivery";
    const reparee = await tour.reparer({
      invariant: 2,
      ticket: ticket.number,
      cle: `sha=${sha}`,
      casse: `the cook of #${ticket.number} was relaunched on commit \`${sha.slice(0, 7)}\` of PR #${pr.number} and stopped on that same commit (${motif}): another relaunch would replay the same failure on the same commit.`,
      geste: async () => `stopped it, not relaunched again on \`${sha.slice(0, 7)}\`: ${await tour.arreter(ticket, [motif])}`,
    });
    // Arrêté, il ne se prend pas à ce tour, même remis sur le rail par le manager : le tour suivant relit ses labels.
    if (reparee) ticket.labels = [...ticket.labels, ECHECS_ATTEINTS];
  }
};
