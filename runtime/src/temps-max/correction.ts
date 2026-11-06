// Le ticket de correction du temps des tickets (#2515, épique #2514) : quand la
// médiane des tickets récents du projet dépasse son max (`tempsMaxTicketMin`,
// 10 min par défaut), la station ouvre sur le rail un ticket `prio:0` qu'un
// cook prend tout de suite. Son corps donne la médiane, les tickets les plus
// lents et la phase la plus lente — cuisson, attente de la pass, relecture, CI
// ou merge — avec ses chiffres.
//
// Un seul ouvert à la fois, quels que soient les tours ou les stations : avant
// d'ouvrir, la station cherche sur GitHub une issue ouverte, d'un auteur de
// confiance, qui porte la marque cachée du ticket, et n'ouvre rien si elle en
// trouve une. Ce que la station garde en mémoire n'est qu'un cache : le numéro
// du ticket ouvert, qu'elle ne croit que tant qu'il est parmi les issues
// ouvertes que le tour vient de lire. Une fois le ticket fermé, la médiane
// encore au-dessus du max en ouvre un autre.
//
// L'appel vient du tour de la station (`brigade-github.ts`), qui lit les temps
// dans le clone du projet.
import { DE_CONFIANCE } from "../alimenter.ts";
import { LABEL, type IssueOuverte } from "../github.ts";
import type { TempsTicket } from "../temps-ticket/ligne-status.ts";
import { dureeDuTicket, medianeDesRecents, phaseLaPlusLenteDesTickets, phaseLaPlusLenteDuTicket, ticketsLesPlusLents, ticketsRecents, totauxParPhase } from "./mesure.ts";

export const PRIO_CORRECTION = "prio:0";
export const LABELS_CORRECTION = [LABEL, PRIO_CORRECTION, "model:opus", "effort:high"];
export const MARQUE_CORRECTION = "<!-- brigade:temps-max -->";
// Combien de tickets lents le corps nomme.
export const LENTS_NOMMES = 5;
// Jusqu'où, sur GitHub, on cherche un ticket de correction encore ouvert.
export const FENETRE_MS = 30 * 24 * 60 * 60 * 1000;

// Ce que la règle lit et écrit de GitHub. `state` absent : l'issue compte comme
// ouverte — au pire rien ne s'ouvre, jamais deux.
export type GitHubDeLaCorrection = {
  issuesDepuis(instant: string): Promise<(Pick<IssueOuverte, "number" | "body" | "association"> & Partial<Pick<IssueOuverte, "state">>)[]>;
  creerIssue(issue: { titre: string; corps: string; labels: string[] }): Promise<number>;
  fermerIssue(numero: number): Promise<void>;
};

const min = (secondes: number) => `${Math.round(secondes / 60)} min`;
const pourcent = (part: number) => `${Math.round(part * 100)}%`;

// Le ticket de correction des temps, ou null quand la médiane des tickets
// récents est au max ou en dessous (ou qu'aucun ticket n'est mesuré).
export function ticketDeCorrection(enregistrements: readonly TempsTicket[], maxMin: number): { titre: string; corps: string } | null {
  const med = medianeDesRecents(enregistrements);
  if (med === null || med <= maxMin * 60) return null;
  const recents = ticketsRecents(enregistrements);
  const lente = phaseLaPlusLenteDesTickets(recents);
  const total = recents.reduce((somme, t) => somme + dureeDuTicket(t), 0);
  const lents = ticketsLesPlusLents(recents, LENTS_NOMMES).map((t) => {
    const sienne = phaseLaPlusLenteDuTicket(t);
    return `- #${t.ticket}: ${min(dureeDuTicket(t))} — slowest phase: ${sienne.nom} ${min(sienne.secondes)}`;
  });
  const titre = `Tickets take too long: median ${min(med)} over the max of ${maxMin} min — ${lente.nom} is the slowest phase`;
  const corps = [
    MARQUE_CORRECTION,
    "",
    "## Context",
    "",
    `The median time of the project's ${recents.length} recent tickets, from claim to merge, is **${min(med)}**: over the project's max of ${maxMin} min (\`tempsMaxTicketMin\` in \`.claude/brigade/projet.json\`). These tickets took ${min(total)} in all.`,
    "",
    "## Slowest phase",
    "",
    `**${lente.nom}**: ${min(lente.secondes)} of these tickets' time (${pourcent(lente.part)}), a median of ${min(lente.mediane)} per ticket.`,
    "",
    "Every phase, over these tickets:",
    "",
    ...totauxParPhase(recents).map((p) => `- ${p.nom}: ${min(p.secondes)} (${pourcent(p.part)}), median ${min(p.mediane)} per ticket`),
    "",
    "## Slowest tickets",
    "",
    ...lents,
    "",
    "## Acceptance criteria",
    "",
    `- The cause that makes ${lente.nom} the slowest phase is found in these tickets, and corrected at its cause.`,
    `- The median of the recent tickets goes back to ${maxMin} min or under; no measure is removed or weakened to get there.`,
    "",
    "---",
    "",
    `_Opened by a station, with no gesture from the chef: \`${PRIO_CORRECTION}\`, it goes before the whole rail. No other one opens while this one is open._`,
  ].join("\n");
  return { titre, corps };
}

export type DecisionDeCorrection =
  | { issue: "sous-le-max"; mediane: number | null; maxMin: number }
  | { issue: "deja-ouverte"; numero: number; mediane: number; maxMin: number }
  | { issue: "ouverte"; numero: number; mediane: number; maxMin: number };

export type OptionsDeLaCorrection = {
  github: GitHubDeLaCorrection;
  // Les temps du projet et son max, lus à chaque appel.
  lire: () => { enregistrements: TempsTicket[]; tempsMaxTicketMin: number };
  maintenant?: () => Date;
};

// La règle, liée au GitHub du projet. Chaque appel lit les temps ; au-dessus
// du max, il trouve le ticket ouvert ou en ouvre un. `ouvertes` : les issues
// ouvertes que l'appelant vient de lire, s'il en a — le ticket déjà connu qui y
// est ne coûte aucune lecture de GitHub.
export function correctionDuTemps({ github, lire, maintenant = () => new Date() }: OptionsDeLaCorrection) {
  let connue: number | null = null;

  // Les tickets de correction ouverts, du plus ancien au plus récent. Le début
  // de la fenêtre tombe à minuit (UTC) : la même requête toute la journée.
  const ouverts = async (): Promise<number[]> => {
    const debut = new Date(maintenant().getTime() - FENETRE_MS);
    debut.setUTCHours(0, 0, 0, 0);
    return (await github.issuesDepuis(debut.toISOString()))
      .filter((issue) => issue.state !== "closed" && DE_CONFIANCE.includes(issue.association) && issue.body.includes(MARQUE_CORRECTION))
      .map((issue) => issue.number)
      .sort((x, y) => x - y);
  };

  return async (ouvertes?: readonly number[]): Promise<DecisionDeCorrection> => {
    const { enregistrements, tempsMaxTicketMin: maxMin } = lire();
    const ticket = ticketDeCorrection(enregistrements, maxMin);
    const mediane = medianeDesRecents(enregistrements);
    if (ticket === null || mediane === null) return { issue: "sous-le-max", mediane, maxMin };
    if (connue !== null && ouvertes?.includes(connue)) return { issue: "deja-ouverte", numero: connue, mediane, maxMin };
    const [deja] = await ouverts();
    if (deja !== undefined) {
      connue = deja;
      return { issue: "deja-ouverte", numero: deja, mediane, maxMin };
    }
    const creee = await github.creerIssue({ titre: ticket.titre, corps: ticket.corps, labels: LABELS_CORRECTION });
    // Deux stations qui l'ont ouvert ensemble : le plus ancien reste, l'autre se ferme.
    const [premier = creee] = await ouverts();
    if (premier < creee) await github.fermerIssue(creee);
    connue = Math.min(premier, creee);
    return { issue: premier < creee ? "deja-ouverte" : "ouverte", numero: connue, mediane, maxMin };
  };
}
