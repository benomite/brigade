// Le digest d'usage du projet qui est brigade, élargi aux autres projets que
// sert la même box (#1972). Quand brigade se comporte mal sur un projet qu'il
// sert, la preuve reste au journal de ce projet : le second de brigade la lit
// là, par le même digest, sans que le chef la lui relaie. Aucun mécanisme neuf,
// seulement plus de sources.
//
// Quatre règles, tenues ici et non par celui qui appelle :
//
// - Seul le projet qui est brigade lit les autres : son dépôt, à sa branche
//   d'intégration, porte le runtime de brigade (`runtime/package.json`, nommé
//   `brigade-runtime`). Tout autre projet — ou un dépôt qui ne se lit pas, ou
//   un projet hors d'une station — reçoit son digest seul (`box: null`), et
//   aucun journal voisin n'est ouvert.
// - D'un autre projet ne vient que ce qui tient à brigade : ni ses gates
//   rouges (ses tests, son code), ni les constats de relecture sur son code, ni
//   ce qu'aucun signal ne tranche ; ses mises de côté que le runtime connaît,
//   hors WAITING et redécoupe ; ses garde-fous ; sa dérive, en nombres.
// - D'un autre projet ne sort que son nom, ses numéros de ticket et la
//   signature de l'échec : aucun texte libre (sortie d'outil, constat, corps
//   d'issue), aucun lien vers son dépôt — ses preuves sont ses lignes de
//   journal, nommées par le projet.
// - Un même échec vu sur plusieurs projets est un seul élément : les tickets se
//   comptent d'un projet à l'autre (`repeatedAcrossProjects`), et il quitte les
//   échecs du seul projet brigade qu'il recouvre.
import { lireALaBase } from "../../depot.ts";
import type { Cause } from "../../causes-des-ratages.ts";
import { projetsDeLInstallation } from "../../commun/installation.ts";
import { ATTEND_UN_TIERS, REDECOUPE } from "../../events/rail.ts";
import { ouvrirJournal } from "../../journal.ts";
import { avecLaBrancheDuDepot } from "../../reglages-projet/en-vigueur.ts";
import { environnementDuProjet } from "../../station/configuration.ts";
import { SEUIL_DE_RECURRENCE, usageDuJournal, type DigestDUsage, type EchecQuiRevient, type OccurrenceDEchec, type OptionsDuDigest, type Preuve } from "./digest.ts";

// Ce qui, dans le dépôt d'un projet, dit qu'il est brigade.
export const MANIFESTE_DE_BRIGADE = "runtime/package.json";
export const NOM_DU_RUNTIME = "brigade-runtime";

// Une ligne du journal d'un projet de la box, nommée par son projet : la seule
// preuve qu'un élément venu d'un autre projet porte.
export type PreuveDeLaBox = { kind: "log"; project: string; seq: number; at: string; type: string; ticket: number | null };

// Ce qu'un autre projet de la box donne au digest de brigade : chaque élément
// dit de quel projet il vient.
export type UsageDUnVoisin = {
  project: string;
  drift: {
    project: string;
    merged: number;
    firstTry: number;
    share: number | null;
    thresholdPercent: number;
    below: boolean;
    tickets: Array<{ project: string; ticket: number; attempts: number; evidence: PreuveDeLaBox[] }>;
    crossings: Array<{ project: string; measure: string; observed: number; limit: number; at: string; evidence: PreuveDeLaBox[] }>;
  };
  passRejections: Array<{ project: string; ticket: number; at: string; cause: Cause; title: string | null; evidence: PreuveDeLaBox[] }>;
  guardrailStops: Array<{ project: string; ticket: number | null; at: string; reason: string; limit: number | null; observed: number | null; evidence: PreuveDeLaBox[] }>;
  setAside: Array<{ project: string; ticket: number; reason: string; by: string; return: string; occurrences: number; first: string; last: string; evidence: PreuveDeLaBox[] }>;
};

// Un échec vu sur au moins `SEUIL_DE_RECURRENCE` tickets, comptés sur tous les
// projets de la box, dont au moins un autre que brigade. `evidence` : les
// issues et PR des tickets de brigade, et les lignes de journal de chacun.
export type EchecPartage = {
  signature: string;
  source: EchecQuiRevient["source"];
  title: string;
  projects: string[];
  tickets: Array<{ project: string; ticket: number }>;
  occurrences: number;
  evidence: Array<Preuve | PreuveDeLaBox>;
};

export type UsageDeLaBox = {
  siblings: UsageDUnVoisin[];
  // Les projets de la box dont le journal ne se lit pas (pas encore servi, un
  // fichier illisible) : ils ne comptent pour rien, et c'est dit.
  unreadable: Array<{ project: string; reason: string }>;
  repeatedAcrossProjects: EchecPartage[];
};

// Le digest du projet. `box` : nulle quand il n'est pas brigade, ou hors d'une station.
export type DigestDeLaBox = DigestDUsage & { box: UsageDeLaBox | null };

export type OptionsDeLaBox = OptionsDuDigest & {
  // Le répertoire de la station (`BRIGADE_STATION_DIR`) : absent hors d'une station.
  station: string | undefined;
  // L'environnement de la station, dont chaque projet hérite. Par défaut, celui du process.
  env?: Record<string, string | undefined>;
  // Ce qui dit qu'un dépôt est brigade. Par défaut, son manifeste à sa base.
  estBrigade?: (lieu: { clone: string; base: string }) => boolean;
};

// Les causes d'un refus de la pass qui tiennent à brigade, pas au code du
// projet : la fusion, le plafond, la station, le ticket que la cuisine a écrit.
const CAUSES_DE_BRIGADE: readonly Cause[] = ["conflit", "plafond", "panne", "criteres"];

// Les mises de côté qui ne disent pas un échec : un tiers attendu, un ticket redécoupé.
const MISES_DE_COTE_SANS_ECHEC: readonly string[] = [ATTEND_UN_TIERS, REDECOUPE];

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Vrai si le dépôt porte, à sa branche d'intégration, le runtime de brigade.
// Un dépôt qui ne se lit pas n'est pas brigade : ne rien lire des autres est
// le côté sûr.
export function depotEstBrigade(lieu: { clone: string; base: string }): boolean {
  try {
    const texte = lireALaBase(lieu, MANIFESTE_DE_BRIGADE);
    return texte !== null && (JSON.parse(texte) as { name?: unknown }).name === NOM_DU_RUNTIME;
  } catch {
    return false;
  }
}

function lireUsage(repertoireEtat: string, options: OptionsDuDigest) {
  const journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
  try {
    return usageDuJournal(journal.base, options);
  } finally {
    journal.fermer();
  }
}

// Les autres projets de la box, si le projet nommé est brigade ; null sinon.
function voisinsDeBrigade(station: string, nom: string, env: Record<string, string | undefined>, estBrigade: NonNullable<OptionsDeLaBox["estBrigade"]>) {
  const projets = projetsDeLInstallation(station);
  const soi = projets.find((projet) => projet.nom === nom);
  if (soi === undefined) return null;
  try {
    const { BRIGADE_REPO_DIR: clone, BRIGADE_BASE_BRANCH: base } = avecLaBrancheDuDepot(environnementDuProjet(station, soi, env));
    if (!clone || !base || !estBrigade({ clone, base })) return null;
  } catch {
    return null;
  }
  return projets.filter((projet) => projet.nom !== nom).map((projet) => ({ projet, etat: environnementDuProjet(station, projet, env).BRIGADE_STATE_DIR ?? "" }));
}

// Le digest du projet, et, s'il est brigade, l'usage des autres projets de sa box.
export function lireDigestDeLaBox(repertoireEtat: string, options: OptionsDeLaBox): DigestDeLaBox {
  const { station, env = process.env, estBrigade = depotEstBrigade, ...duDigest } = options;
  const propre = lireUsage(repertoireEtat, duDigest);
  const voisins = station ? voisinsDeBrigade(station, duDigest.project, env, estBrigade) : null;
  if (voisins === null) return { ...propre.digest, box: null };

  const siblings: UsageDUnVoisin[] = [];
  const unreadable: UsageDeLaBox["unreadable"] = [];
  const vues: Vue[] = propre.occurrences.filter(comparable).map((occurrence) => ({ project: duDigest.project, occurrence }));
  for (const { projet, etat } of voisins) {
    try {
      const { digest, occurrences } = lireUsage(etat, { project: projet.nom, repository: projet.depot, period: propre.digest.period });
      siblings.push(usageDUnVoisin(digest));
      vues.push(...occurrences.filter(comparable).map((occurrence) => ({ project: projet.nom, occurrence })));
    } catch (erreur) {
      unreadable.push({ project: projet.nom, reason: message(erreur) });
    }
  }
  const repeatedAcrossProjects = echecsPartages(duDigest.project, propre.digest.repository, vues);
  const partagees = new Set(repeatedAcrossProjects.map(({ signature }) => signature));
  return {
    ...propre.digest,
    repeatedFailures: propre.digest.repeatedFailures.filter(({ signature }) => !partagees.has(signature)),
    box: { siblings, unreadable, repeatedAcrossProjects },
  };
}

// Les lignes de journal d'une liste de preuves, nommées par leur projet. Les
// liens (issue, PR) d'un autre projet ne passent pas.
const lignesDe = (project: string, preuves: Preuve[]): PreuveDeLaBox[] => preuves.flatMap((preuve) => (preuve.kind === "log" ? [{ ...preuve, project }] : []));

// Ce qu'un autre projet donne : ce qui tient à brigade, sans aucun texte libre.
function usageDUnVoisin({ project, drift, passRejections, guardrailStops, setAside }: DigestDUsage): UsageDUnVoisin {
  return {
    project,
    drift: {
      project,
      merged: drift.merged,
      firstTry: drift.firstTry,
      share: drift.share,
      thresholdPercent: drift.thresholdPercent,
      below: drift.below,
      tickets: drift.tickets.map(({ ticket, attempts, evidence }) => ({ project, ticket, attempts, evidence: lignesDe(project, evidence) })),
      crossings: drift.crossings.map(({ measure, observed, limit, at, evidence }) => ({ project, measure, observed, limit, at, evidence: lignesDe(project, evidence) })),
    },
    passRejections: passRejections.flatMap(({ ticket, at, cause, title, evidence }) =>
      cause !== null && CAUSES_DE_BRIGADE.includes(cause) ? [{ project, ticket, at, cause, title, evidence: lignesDe(project, evidence) }] : [],
    ),
    guardrailStops: guardrailStops.map(({ ticket, at, reason, limit, observed, evidence }) => ({ project, ticket, at, reason, limit, observed, evidence: lignesDe(project, evidence) })),
    setAside: setAside.flatMap(({ ticket, reason, by, return: retour, occurrences, first, last, evidence }) =>
      by === null || retour === null || MISES_DE_COTE_SANS_ECHEC.includes(reason) ? [] : [{ project, ticket, reason, by, return: retour, occurrences, first, last, evidence: lignesDe(project, evidence) }],
    ),
  };
}

type Vue = { project: string; occurrence: OccurrenceDEchec };

// Un échec qui se compare d'un projet à l'autre : tout, sauf les lignes FAIL
// des gates, qui disent les tests d'un projet.
const comparable = ({ signature }: OccurrenceDEchec) => !signature.startsWith("gates: ");

function echecsPartages(brigade: string, depot: string, vues: Vue[]): EchecPartage[] {
  const issue = (ticket: number): Preuve => ({ kind: "issue", ticket, url: `https://github.com/${depot}/issues/${ticket}` });
  return [...Map.groupBy(vues, ({ occurrence }) => occurrence.signature).values()]
    .flatMap((siennes): EchecPartage[] => {
      const tickets = [...new Map(siennes.map(({ project, occurrence: { ticket } }) => [`${project}#${ticket}`, { project, ticket }])).values()];
      const projects = [...new Set(tickets.map(({ project }) => project))];
      if (tickets.length < SEUIL_DE_RECURRENCE || projects.every((project) => project === brigade)) return [];
      const [{ occurrence: premiere }] = siennes as [Vue];
      const preuves = [
        ...tickets.flatMap(({ project, ticket }) => (project === brigade ? [issue(ticket)] : [])),
        ...siennes.flatMap(({ project, occurrence: { evidence } }) => [...(project === brigade ? evidence.filter((preuve) => preuve.kind === "pr") : []), ...lignesDe(project, evidence)]),
      ];
      return [
        {
          signature: premiere.signature,
          source: premiere.source,
          title: premiere.title,
          projects,
          tickets,
          occurrences: siennes.length,
          evidence: preuves.filter((preuve, i) => preuves.findIndex((autre) => JSON.stringify(autre) === JSON.stringify(preuve)) === i),
        },
      ];
    })
    .sort((a, b) => b.tickets.length - a.tickets.length || (a.signature < b.signature ? -1 : 1));
}
