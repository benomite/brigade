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
// encore au-dessus du max en ouvre un autre — mais pas avant que les tickets
// récents soient tous pris après le merge de la dernière correction servie
// (#2577) : jusque-là, la médiane est celle des tickets d'avant elle, et elle
// n'en dit rien. Rouverte deux minutes après chaque merge, sur la même fenêtre
// de 24 h, la correction l'avait été douze fois en 9 h 30 (#2535 à #2577) :
// onze des 60 tickets récents, chacun `prio:0` devant tout le rail, à chercher
// une cause que la précédente venait de corriger.
//
// L'appel vient du tour de la station (`brigade-github.ts`), qui lit les temps
// dans le clone du projet.
import { DE_CONFIANCE } from "../alimenter.ts";
import { LABEL, type IssueOuverte } from "../github.ts";
import type { TempsTicket } from "../temps-ticket/ligne-status.ts";
import { dureeDuTicket, medianeDesRecents, phaseLaPlusLenteDesTickets, phaseLaPlusLenteDuTicket, ticketsLesPlusLents, ticketsRecents, totauxParPhase } from "./mesure.ts";

export const PRIO_CORRECTION = "prio:0";
// Son calibrage : `opus` / `medium`, comme la table du manager (#2575). En
// `high`, les dix corrections de #2535 à #2573 ont cuit 10,9 min en médiane :
// chacune ajoutait aux tickets récents un ticket au-dessus du max qu'elle
// devait ramener. Une correction qui ne passe pas monte au renvoi.
export const LABELS_CORRECTION = [LABEL, PRIO_CORRECTION, "model:opus", "effort:medium"];
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
  // La dernière correction servie (`numero`, mergée à `servie`) est encore à
  // l'essai : un ticket récent au moins a été pris avant son merge.
  | { issue: "a-l-essai"; numero: number; servie: string; mediane: number; maxMin: number }
  | { issue: "deja-ouverte"; numero: number; mediane: number; maxMin: number }
  | { issue: "ouverte"; numero: number; mediane: number; maxMin: number };

export type OptionsDeLaCorrection = {
  github: GitHubDeLaCorrection;
  // Les temps du projet et son max, lus à chaque appel.
  lire: () => { enregistrements: TempsTicket[]; tempsMaxTicketMin: number };
  maintenant?: () => Date;
};

// La prise la plus ancienne des tickets récents, en ms (le merge d'un ticket
// sans prise datée) ; l'infini quand aucun n'est daté.
export function premierePriseDesRecents(enregistrements: readonly TempsTicket[]): number {
  return Math.min(...ticketsRecents(enregistrements).map((t) => Date.parse(t.claimedAt ?? t.mergedAt ?? "")).filter((instant) => !Number.isNaN(instant)));
}

// La dernière correction servie : celle, fermée, dont le merge est le plus
// récent parmi les temps du projet. Une correction fermée sans merge n'a rien
// changé à attendre.
export function derniereCorrectionServie(fermees: readonly number[], enregistrements: readonly TempsTicket[]): { numero: number; servie: number } | null {
  let derniere: { numero: number; servie: number } | null = null;
  for (const t of enregistrements) {
    const servie = Date.parse(t.mergedAt ?? "");
    if (fermees.includes(t.ticket) && !Number.isNaN(servie) && (derniere === null || servie > derniere.servie)) derniere = { numero: t.ticket, servie };
  }
  return derniere;
}

// La règle, liée au GitHub du projet. Chaque appel lit les temps ; au-dessus
// du max, il trouve le ticket ouvert, attend que la dernière correction servie
// ait des tickets récents à elle, ou en ouvre un. `ouvertes` : les issues
// ouvertes que l'appelant vient de lire, s'il en a — le ticket déjà connu qui y
// est ne coûte aucune lecture de GitHub, ni la correction à l'essai déjà connue.
export function correctionDuTemps({ github, lire, maintenant = () => new Date() }: OptionsDeLaCorrection) {
  let connue: number | null = null;
  let aLEssai: { numero: number; servie: number } | null = null;

  // Les tickets de correction, ouverts et fermés, chacun du plus ancien au plus
  // récent. Le début de la fenêtre tombe à minuit (UTC) : la même requête toute la journée.
  const corrections = async (): Promise<{ ouverts: number[]; fermes: number[] }> => {
    const debut = new Date(maintenant().getTime() - FENETRE_MS);
    debut.setUTCHours(0, 0, 0, 0);
    const marquees = (await github.issuesDepuis(debut.toISOString())).filter((issue) => DE_CONFIANCE.includes(issue.association) && issue.body.includes(MARQUE_CORRECTION));
    const numeros = (fermee: boolean) => marquees.filter((issue) => (issue.state === "closed") === fermee).map((issue) => issue.number).sort((x, y) => x - y);
    return { ouverts: numeros(false), fermes: numeros(true) };
  };
  const ouverts = async () => (await corrections()).ouverts;

  return async (ouvertes?: readonly number[]): Promise<DecisionDeCorrection> => {
    const { enregistrements, tempsMaxTicketMin: maxMin } = lire();
    const ticket = ticketDeCorrection(enregistrements, maxMin);
    const mediane = medianeDesRecents(enregistrements);
    if (ticket === null || mediane === null) return { issue: "sous-le-max", mediane, maxMin };
    if (connue !== null && ouvertes?.includes(connue)) return { issue: "deja-ouverte", numero: connue, mediane, maxMin };
    const premiere = premierePriseDesRecents(enregistrements);
    const essai = (numero: number, servie: number) => ({ issue: "a-l-essai" as const, numero, servie: new Date(servie).toISOString(), mediane, maxMin });
    if (aLEssai !== null && premiere < aLEssai.servie) return essai(aLEssai.numero, aLEssai.servie);
    const lues = await corrections();
    const [deja] = lues.ouverts;
    if (deja !== undefined) {
      connue = deja;
      return { issue: "deja-ouverte", numero: deja, mediane, maxMin };
    }
    aLEssai = derniereCorrectionServie(lues.fermes, enregistrements);
    if (aLEssai !== null && premiere < aLEssai.servie) return essai(aLEssai.numero, aLEssai.servie);
    const creee = await github.creerIssue({ titre: ticket.titre, corps: ticket.corps, labels: LABELS_CORRECTION });
    // Deux stations qui l'ont ouvert ensemble : le plus ancien reste, l'autre se ferme.
    const [premier = creee] = await ouverts();
    if (premier < creee) await github.fermerIssue(creee);
    connue = Math.min(premier, creee);
    return { issue: premier < creee ? "deja-ouverte" : "ouverte", numero: connue, mediane, maxMin };
  };
}
