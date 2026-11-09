// La qualité avant le temps (#2680, épique #2673). Quand la part des tickets
// récents livrés du premier coup tombe sous le seuil du projet
// (`premierCoupMinPourcent`, 70 % par défaut) ou que la base casse plus d'une
// fois par dix PR mergées, les alertes de temps n'ouvrent rien : courir après
// la médiane pousserait à livrer plus vite ce qui revient déjà. Un seul ticket
// de qualité s'ouvre à leur place, qui nomme la cause — les motifs de renvoi
// les plus fréquents, ou les checks qui ont cassé la base — et porte la règle
// des gardes (`garde-correction.ts`, #2679) : sa correction n'en abaisse aucune.
//
// Un seul ouvert à la fois, comme la correction du temps : avant d'ouvrir, la
// station cherche sur GitHub une issue ouverte, d'un auteur de confiance, qui
// porte la marque cachée du ticket. La mesure vient de `mesure-qualite.ts`
// (#2678) ; l'appel, de la correction du temps (`temps-max/correction.ts`),
// devant elle.
import { DE_CONFIANCE } from "./alimenter.ts";
import { GARDES, REGLE_GARDE_CORRECTION, TITRE_SECTION } from "./garde-correction.ts";
import { LABEL, type IssueOuverte } from "./github.ts";
import { REPARATIONS_PAR_MERGE_MAX, type Compte, type Qualite } from "./mesure-qualite.ts";
import { avecLaPreuve, type Preuve } from "./preuve-mesure.ts";

export const MARQUE_QUALITE = "<!-- brigade:qualite -->";
// Les tickets que ce ticket de qualité a comptés (#2804) : tant que la fenêtre
// n'en contient pas d'autre, le corriger ne bouge pas le taux, et le détecteur
// n'en ouvre pas un second.
const MARQUE_COMPTES = /<!-- brigade:qualite-comptes ([\d,]*) -->/;
export const marqueDesComptes = (tickets: readonly number[]) => `<!-- brigade:qualite-comptes ${tickets.join(",")} -->`;
export const comptesDe = (corps: string): number[] => (MARQUE_COMPTES.exec(corps)?.[1] ?? "").split(",").filter(Boolean).map(Number);
export const LABELS_QUALITE = [LABEL, "prio:0", "model:opus", "effort:medium"];
// Combien de motifs de renvoi, ou de checks, le corps nomme.
export const CAUSES_NOMMEES = 5;
// Jusqu'où, sur GitHub, on cherche un ticket de qualité encore ouvert.
export const FENETRE_MS = 30 * 24 * 60 * 60 * 1000;
// Combien de tickets pris et mergés après le merge du dernier ticket servi la
// mesure attend avant de rouvrir (#2868) : la fenêtre glissante en garde des
// dizaines que le précédent a déjà comptés, et le corriger n'y change rien
// tant qu'elle ne s'est pas renouvelée.
export const TICKETS_A_ATTENDRE = 20;

// Ce que la règle lit et écrit de GitHub — la forme de celui de la correction
// du temps. `state` absent : l'issue compte comme ouverte.
export type GitHubDeLaQualite = {
  issuesDepuis(instant: string): Promise<(Pick<IssueOuverte, "number" | "body" | "association"> & Partial<Pick<IssueOuverte, "state" | "createdAt">> & { servieLe?: string | null })[]>;
  creerIssue(issue: { titre: string; corps: string; labels: string[] }): Promise<number>;
  fermerIssue(numero: number): Promise<void>;
};

// Pourquoi la qualité passe avant le temps : le premier coup sous le seuil,
// la base trop souvent cassée, ou les deux. Vide : la qualité tient.
export type CauseDeQualite = "premier-coup" | "base-cassee";

// Les PR mergées par réparation que la base tolère : dix.
export const MERGES_PAR_REPARATION = Math.round(1 / REPARATIONS_PAR_MERGE_MAX);

// La base casse trop souvent au-delà du ratio de `mesure-qualite.ts` (plus
// d'une réparation par dix merges), ou dès une réparation par dizaine entière
// de PR mergées : 7 pour 74 en est une (le cas de l'épique, #2673), 6 pour 74
// non. Le ratio brut met 7 pour 74 juste sous la limite (0,095) ; c'est le cas
// que l'épique veut voir, il compte ici. Sous dix PR mesurées, pas de dizaine
// entière : seul le ratio décide, et une réparation sur neuf le dépasse déjà.
export function baseTropCassee(q: Pick<Qualite, "reparations" | "mesures" | "tropDeReparations">): boolean {
  const dizaines = Math.floor(q.mesures / MERGES_PAR_REPARATION);
  return q.tropDeReparations === true || (dizaines > 0 && q.reparations >= dizaines);
}

export function causesDeQualite(q: Qualite): CauseDeQualite[] {
  return [...(q.sousLeSeuil === true ? ["premier-coup" as const] : []), ...(baseTropCassee(q) ? ["base-cassee" as const] : [])];
}

// La qualité en défaut : les alertes de temps n'ouvrent rien.
export const qualiteEnDefaut = (q: Qualite): boolean => causesDeQualite(q).length > 0;

const pourcent = (part: number) => `${Math.round(part * 100)}%`;
const liste = (comptes: readonly Compte[], vide: string) =>
  comptes.length === 0 ? [vide] : comptes.slice(0, CAUSES_NOMMEES).map(({ nom, fois }) => `- ${nom}: ${fois} ${fois === 1 ? "time" : "times"}`);

// Le ticket de qualité, ou null quand la qualité tient (ou n'est pas mesurée).
export function ticketDeQualite(q: Qualite): { titre: string; corps: string; causes: CauseDeQualite[] } | null {
  const causes = causesDeQualite(q);
  if (causes.length === 0) return null;
  const premierCoup = causes.includes("premier-coup");
  const baseCassee = causes.includes("base-cassee");
  const [motif] = q.motifsDeRenvoi;
  const [check] = q.checksCasses;
  const constats = [
    ...(premierCoup ? [`first-try rate ${pourcent(q.premierCoup ?? 0)} under the ${q.seuilPremierCoup}% threshold${motif ? ` — top send-back reason: ${motif.nom}` : ""}`] : []),
    ...(baseCassee ? [`main broke ${q.reparations} times for ${q.mesures} merged PRs${check ? ` — top broken check: ${check.nom}` : ""}`] : []),
  ];
  const titre = `Quality before time: ${constats.join("; ")}`;
  const corps = [
    MARQUE_QUALITE,
    marqueDesComptes(q.fautifs),
    "",
    "## Context",
    "",
    `Over the project's ${q.mesures} recent merged tickets whose quality is known${q.inconnus > 0 ? ` (${q.inconnus} more not measured)` : ""}:`,
    "",
    `- first-try rate: **${q.premierCoup === null ? "unknown" : pourcent(q.premierCoup)}**, against a threshold of ${q.seuilPremierCoup}% (\`premierCoupMinPourcent\` in \`.claude/brigade/projet.json\`)`,
    `- repairs of main: **${q.reparations}** for ${q.mesures} merged PRs, against a limit of under one per ${MERGES_PAR_REPARATION}`,
    "",
    "While the quality is under these limits, the time alerts open no ticket: going faster would only send back more. This ticket opens instead.",
    "",
    ...(premierCoup ? ["## Most frequent send-back reasons", "", ...liste(q.motifsDeRenvoi, "- no reason recorded: the misses are cooks that delivered nothing"), ""] : []),
    ...(baseCassee ? ["## Checks that broke main", "", ...liste(q.checksCasses, "- no check recorded"), ""] : []),
    REGLE_GARDE_CORRECTION,
    "",
    "## Acceptance criteria",
    "",
    `- The cause named above is found in these tickets, and corrected at its cause.`,
    `- No guard is lowered: the PR body has a "${TITRE_SECTION}" section that names ${GARDES.map((g) => g.nom).join(", ")}, and the PR changes none of their paths.`,
    "",
    "---",
    "",
    "_Opened by a station, with no gesture from the chef: `prio:0`, it goes before the whole rail. No other one opens while this one is open._",
  ].join("\n");
  return { titre, corps, causes };
}

// `deja-servie` : le dernier ticket de qualité est mergé et la fenêtre ne porte
// aucun renvoi plus récent que ceux qu'il a comptés — numero est ce ticket.
// `en-attente` (#2868) : le dernier ticket de qualité mergé (`numero`) n'a pas
// encore `manque` tickets pris et mergés après lui — rien ne s'ouvre, et la
// mesure n'a pas à dire plus.
export type DecisionDeQualite =
  | { issue: "ouverte" | "deja-ouverte" | "deja-servie"; numero: number; causes: CauseDeQualite[] }
  | { issue: "en-attente"; numero: number; manque: number; causes: CauseDeQualite[] };

// Un ticket mesuré, tel que le journal des temps le garde.
type TempsDuTicket = { ticket: number; claimedAt?: string; mergedAt?: string };

// Les tickets pris après `instant` (ms), et mergés : ceux que le ticket servi à
// cet instant n'a pas pu compter. Une prise sans date lisible ne compte pas.
export function prisApres<T extends TempsDuTicket>(temps: readonly T[], instant: number): T[] {
  return temps.filter((t) => Date.parse(t.claimedAt ?? t.mergedAt ?? "") > instant && Date.parse(t.mergedAt ?? "") > instant);
}

// La porte, liée au GitHub du projet. Elle rend null quand la qualité tient :
// les alertes de temps décident comme avant. Sinon elle trouve le ticket de
// qualité ouvert ou en ouvre un, et les alertes de temps n'ouvrent rien.
// `ouvertes` : les issues ouvertes que l'appelant vient de lire, s'il en a.
// `preuve` : la section « Evidence » ajoutée au corps du ticket qui s'ouvre (#2839).
// `suite` (#2868) : les temps du projet et la mesure qui les prend. Sans elle, pas d'attente.
export function porteDeQualite({ github, echantillonMin = TICKETS_A_ATTENDRE, maintenant = () => new Date() }: { github: GitHubDeLaQualite; echantillonMin?: number; maintenant?: () => Date }) {
  let connue: number | null = null;

  // Les tickets de qualité de confiance, du plus ancien au plus récent.
  const lues = async () => {
    const debut = new Date(maintenant().getTime() - FENETRE_MS);
    debut.setUTCHours(0, 0, 0, 0);
    return (await github.issuesDepuis(debut.toISOString()))
      .filter((issue) => DE_CONFIANCE.includes(issue.association) && issue.body.includes(MARQUE_QUALITE))
      .sort((x, y) => x.number - y.number);
  };
  const ouverts = async (): Promise<number[]> => (await lues()).filter((issue) => issue.state !== "closed").map((issue) => issue.number);

  return async (qualite: Qualite, ouvertes?: readonly number[], preuve?: Preuve, suite?: { temps: readonly TempsDuTicket[]; mesurer: (temps: readonly TempsDuTicket[]) => Qualite }): Promise<DecisionDeQualite | null> => {
    let ticket = ticketDeQualite(qualite);
    if (ticket === null) return null;
    let { causes } = ticket;
    if (connue !== null && ouvertes?.includes(connue)) return { issue: "deja-ouverte", numero: connue, causes };
    const toutes = await lues();
    const deja = toutes.find((issue) => issue.state !== "closed")?.number;
    if (deja !== undefined) {
      connue = deja;
      return { issue: "deja-ouverte", numero: deja, causes };
    }
    // Le dernier ticket de qualité servi, daté par son merge dans les temps du projet (ou par sa
    // fermeture, pour un ticket servi ailleurs) : un ticket fermé sans date lue n'attend rien.
    const servies = suite === undefined ? [] : toutes.flatMap((issue) => {
      const instant = Date.parse(suite.temps.find((t) => t.ticket === issue.number)?.mergedAt ?? issue.servieLe ?? "");
      return issue.state === "closed" && !Number.isNaN(instant) ? [{ numero: issue.number, instant }] : [];
    });
    const servie = servies.reduce<{ numero: number; instant: number } | null>((derniere, s) => (derniere === null || s.instant > derniere.instant ? s : derniere), null);
    if (suite !== undefined && servie !== null) {
      // Il compte les tickets pris après ce merge, et eux seuls : les autres, le précédent les a comptés.
      const nouveaux = prisApres(suite.temps, servie.instant);
      if (nouveaux.length < TICKETS_A_ATTENDRE) return { issue: "en-attente", numero: servie.numero, manque: TICKETS_A_ATTENDRE - nouveaux.length, causes };
      qualite = suite.mesurer(nouveaux);
      const mesure = ticketDeQualite(qualite);
      if (mesure === null) return null;
      ticket = mesure;
      causes = mesure.causes;
    }
    // Une mesure sur moins de 20 tickets mergés ne dit rien (#3012) : rien ne s'ouvre.
    if ((suite?.temps.length ?? qualite.tickets.length) < echantillonMin) return null;
    // Les tickets de qualité mergés ont compté ces tickets : sans renvoi plus récent, rien à ouvrir.
    const comptes = new Set(toutes.flatMap((issue) => comptesDe(issue.body)));
    // Un ticket ouvert avant la marque (#2813) a compté les fautifs déjà mergés à son
    // ouverture : sans lui, #2805 servi rouvrait #2813 sur les mêmes 13 renvois.
    const ouvertureSansMarque = Math.max(...toutes.filter((issue) => !MARQUE_COMPTES.test(issue.body)).map((issue) => Date.parse(issue.createdAt ?? "")).filter((instant) => !Number.isNaN(instant)));
    const compte = (ticket: number) => comptes.has(ticket) || Date.parse(qualite.mergesDesFautifs.get(ticket) ?? "") <= ouvertureSansMarque;
    const derniere = toutes.at(-1);
    if (derniere !== undefined && qualite.fautifs.every(compte)) return { issue: "deja-servie", numero: derniere.number, causes };
    const creee = await github.creerIssue({ titre: ticket.titre, corps: await avecLaPreuve(ticket.corps, preuve), labels: LABELS_QUALITE });
    // Deux stations qui l'ont ouvert ensemble : le plus ancien reste, l'autre se ferme.
    const [premier = creee] = await ouverts();
    if (premier < creee) await github.fermerIssue(creee);
    connue = Math.min(premier, creee);
    return { issue: premier < creee ? "deja-ouverte" : "ouverte", numero: connue, causes };
  };
}
