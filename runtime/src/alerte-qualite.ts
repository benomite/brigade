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

export const MARQUE_QUALITE = "<!-- brigade:qualite -->";
export const LABELS_QUALITE = [LABEL, "prio:0", "model:opus", "effort:medium"];
// Combien de motifs de renvoi, ou de checks, le corps nomme.
export const CAUSES_NOMMEES = 5;
// Jusqu'où, sur GitHub, on cherche un ticket de qualité encore ouvert.
export const FENETRE_MS = 30 * 24 * 60 * 60 * 1000;

// Ce que la règle lit et écrit de GitHub — la forme de celui de la correction
// du temps. `state` absent : l'issue compte comme ouverte.
export type GitHubDeLaQualite = {
  issuesDepuis(instant: string): Promise<(Pick<IssueOuverte, "number" | "body" | "association"> & Partial<Pick<IssueOuverte, "state">>)[]>;
  creerIssue(issue: { titre: string; corps: string; labels: string[] }): Promise<number>;
  fermerIssue(numero: number): Promise<void>;
};

// Pourquoi la qualité passe avant le temps : le premier coup sous le seuil,
// la base trop souvent cassée, ou les deux. Vide : la qualité tient.
export type CauseDeQualite = "premier-coup" | "base-cassee";

// Les PR mergées par réparation que la base tolère : dix.
export const MERGES_PAR_REPARATION = Math.round(1 / REPARATIONS_PAR_MERGE_MAX);

// La base casse trop souvent dès une réparation par dizaine entière de PR
// mergées : 7 pour 74 en est une (le cas de l'épique, #2673), 6 pour 74 non.
// Le ratio brut de `mesure-qualite.ts` met 7 pour 74 juste sous la limite
// (0,095) ; c'est le cas que l'épique veut voir, il compte ici.
export function baseTropCassee(q: Pick<Qualite, "reparations" | "mesures" | "tropDeReparations">): boolean {
  return q.tropDeReparations === true || (q.reparations > 0 && q.reparations >= Math.floor(q.mesures / MERGES_PAR_REPARATION));
}

export function causesDeQualite(q: Qualite): CauseDeQualite[] {
  return [...(q.sousLeSeuil === true ? ["premier-coup" as const] : []), ...(baseTropCassee(q) ? ["base-cassee" as const] : [])];
}

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

export type DecisionDeQualite = { issue: "ouverte" | "deja-ouverte"; numero: number; causes: CauseDeQualite[] };

// La porte, liée au GitHub du projet. Elle rend null quand la qualité tient :
// les alertes de temps décident comme avant. Sinon elle trouve le ticket de
// qualité ouvert ou en ouvre un, et les alertes de temps n'ouvrent rien.
// `ouvertes` : les issues ouvertes que l'appelant vient de lire, s'il en a.
export function porteDeQualite({ github, maintenant = () => new Date() }: { github: GitHubDeLaQualite; maintenant?: () => Date }) {
  let connue: number | null = null;

  const ouverts = async (): Promise<number[]> => {
    const debut = new Date(maintenant().getTime() - FENETRE_MS);
    debut.setUTCHours(0, 0, 0, 0);
    return (await github.issuesDepuis(debut.toISOString()))
      .filter((issue) => DE_CONFIANCE.includes(issue.association) && issue.body.includes(MARQUE_QUALITE) && issue.state !== "closed")
      .map((issue) => issue.number)
      .sort((x, y) => x - y);
  };

  return async (qualite: Qualite, ouvertes?: readonly number[]): Promise<DecisionDeQualite | null> => {
    const ticket = ticketDeQualite(qualite);
    if (ticket === null) return null;
    const { causes } = ticket;
    if (connue !== null && ouvertes?.includes(connue)) return { issue: "deja-ouverte", numero: connue, causes };
    const [deja] = await ouverts();
    if (deja !== undefined) {
      connue = deja;
      return { issue: "deja-ouverte", numero: deja, causes };
    }
    const creee = await github.creerIssue({ titre: ticket.titre, corps: ticket.corps, labels: LABELS_QUALITE });
    // Deux stations qui l'ont ouvert ensemble : le plus ancien reste, l'autre se ferme.
    const [premier = creee] = await ouverts();
    if (premier < creee) await github.fermerIssue(creee);
    connue = Math.min(premier, creee);
    return { issue: premier < creee ? "deja-ouverte" : "ouverte", numero: connue, causes };
  };
}
