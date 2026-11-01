// Le digest d'usage d'un projet servi, sur une période : ce que le rôle produit
// lit de ce que la cuisine mesure et de ce que le journal montre aller mal
// (#1953). Cinq rubriques — la dérive (la part des tickets livrés du premier
// coup), les refus de la pass, les cooks arrêtés par un garde-fou, les tickets
// mis de côté (86) avec leur raison, les échecs qui reviennent sur plusieurs
// tickets —, et sur chaque élément de quoi le citer : son issue, sa PR, ses
// lignes du journal.
//
// Rien n'y est mesuré à neuf : les parcours et leurs renvois viennent de
// `parcours-des-tickets.ts` et `renvois.ts`, la cause d'un essai raté de
// `causes-des-ratages.ts`, ce qui met un ticket de côté et ce qui l'en sort de
// `mise-de-cote.ts`, le seuil du premier coup de `projections/measures.ts`.
// Tout se relit du journal, en lecture seule, et seuls comptent les faits du
// projet nommé. Aucun chemin n'est écrit ici : le projet, son dépôt sur GitHub
// et son répertoire d'état sont des paramètres.
import type { Base } from "../../base.ts";
import { CAUSES, classerEssai, essaisRates, SANS_SIGNAUX, type Cause, type Signaux } from "../../causes-des-ratages.ts";
import { ouvrirJournal } from "../../journal.ts";
import { CAUSES_DU_PROJET, miseDeCoteDu } from "../../mise-de-cote.ts";
import { parcoursDesTickets } from "../../parcours-des-tickets.ts";
import { seuilsEnVigueur } from "../../projections/measures.ts";
import { mesurerRenvois, SEUIL_PREMIER_COUP_PAR_DEFAUT, type Essai, type Parcours } from "../../renvois.ts";

// Le nombre de tickets distincts sur lesquels un même échec doit se voir pour
// être un échec qui revient. En deçà, il n'est pas dans le digest.
export const SEUIL_DE_RECURRENCE = 3;

// Ce qu'un texte libre (un constat de relecture, l'erreur d'un outil) garde au
// plus de caractères : le digest se lit dans un prompt.
export const LONGUEUR_D_UN_EXTRAIT = 300;

// La période, en instants ISO : de `from` compris à `to` exclu.
export type Periode = { from: string; to: string };

// Ce qu'un élément du digest cite : l'issue d'un ticket, une PR, une ligne du
// journal (son rang, son heure, son type).
export type Preuve =
  | { kind: "issue"; ticket: number; url: string }
  | { kind: "pr"; url: string }
  | { kind: "log"; seq: number; at: string; type: string; ticket: number | null };

// Un ticket mergé dans la période : combien d'essais il a demandé.
export type TicketMerge = { ticket: number; attempts: number; firstTry: boolean; mergedAt: string; evidence: Preuve[] };
// Une mesure qui a franchi le seuil que le chef lui donne (`drift.crossed`).
export type Franchissement = { measure: string; observed: number; limit: number; at: string; evidence: Preuve[] };
// La dérive : sur les tickets mergés dans la période, la part livrée du premier
// coup (`share`, entre 0 et 1, nulle sans merge), face au seuil du projet en %.
export type Derive = { merged: number; firstTry: number; share: number | null; thresholdPercent: number; below: boolean; tickets: TicketMerge[]; crossings: Franchissement[] };

// Une livraison que la pass a jugée rouge. `cause` : celle de l'essai, rangé
// comme les essais ratés le sont (`causes-des-ratages.ts`), nulle s'il n'est
// pas dans un parcours. `blocking` : les constats bloquants du reviewer.
export type RefusDeLaPass = {
  ticket: number;
  run: string;
  at: string;
  cause: Cause | null;
  title: string | null;
  gates: { outcome: string; failures: string[] };
  ci: string;
  blocking: Array<{ file: string | null; text: string }>;
  evidence: Preuve[];
};

// Un cook arrêté par un garde-fou (`guard.tripped`), dans son unité.
export type ArretParUnGardeFou = { ticket: number | null; run: string; at: string; reason: string; limit: number | null; observed: number | null; evidence: Preuve[] };

// Un ticket mis de côté pour une raison, dans la période : combien de fois, la
// première et la dernière. `by` et `return` : qui le met de côté pour cette
// raison et ce qui l'en sort, nuls pour une raison que le runtime ne connaît
// pas. `why` : ce qui l'a fait échouer, dans les mots de l'outil, la dernière fois.
export type TicketMisDeCote = { ticket: number; reason: string; by: string | null; return: string | null; why: string | null; occurrences: number; first: string; last: string; evidence: Preuve[] };

// Un échec vu sur au moins `SEUIL_DE_RECURRENCE` tickets. `signature` : ce qui
// le dit le même d'un ticket à l'autre. `source` : un essai raté, un worktree
// que le nettoyage n'a pas pu ranger, une mise de côté qui tient au projet.
// `example` : le dernier texte de l'outil qui le dit, s'il y en a un.
export type EchecQuiRevient = {
  signature: string;
  source: "attempt" | "cleanup" | "set-aside";
  title: string;
  tickets: number[];
  occurrences: number;
  example: string | null;
  evidence: Preuve[];
};

export type DigestDUsage = {
  project: string;
  repository: string;
  period: Periode;
  drift: Derive;
  passRejections: RefusDeLaPass[];
  guardrailStops: ArretParUnGardeFou[];
  setAside: TicketMisDeCote[];
  repeatedFailures: EchecQuiRevient[];
};

// `repository` : le dépôt du projet sur GitHub, `<propriétaire>/<nom>` — c'est
// là que pointent ses issues.
export type OptionsDuDigest = { project: string; repository: string; period: Periode };

type Ligne = { seq: number; at: string; ticket: number | null; type: string; payload: string };
type Lu = Ligne & { p: Record<string, unknown> };

const DEPOT = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const texte = (valeur: unknown): string | null => (typeof valeur === "string" && valeur !== "" ? valeur : null);
const nombre = (valeur: unknown): number | null => (typeof valeur === "number" && Number.isFinite(valeur) ? valeur : null);
const extrait = (valeur: string) => (valeur.length > LONGUEUR_D_UN_EXTRAIT ? `${valeur.slice(0, LONGUEUR_D_UN_EXTRAIT - 1)}…` : valeur);
const uneLigne = (valeur: string) => valeur.replace(/\s+/g, " ").trim();

function instant(valeur: string, nom: string): string {
  const ms = Date.parse(valeur);
  if (!Number.isFinite(ms)) throw new Error(`period: ${nom} is not a date: ${valeur}`);
  return new Date(ms).toISOString();
}

// Une fois qu'un échec s'est vu sur un ticket : de quoi le compter avec les
// autres, sur ce projet (`repeatedFailures`) ou d'un projet à l'autre de la box
// (`box.ts`). `evidence` : sa PR et sa ligne du journal, sans l'issue du
// ticket, que le regroupement ajoute.
export type OccurrenceDEchec = { signature: string; source: EchecQuiRevient["source"]; title: string; ticket: number; example: string | null; evidence: Preuve[] };

// Le digest, lu du journal du projet.
export function digestDUsage(base: Base, options: OptionsDuDigest): DigestDUsage {
  return usageDuJournal(base, options).digest;
}

// Le digest, et chaque échec vu dans la période, avant que le seuil ne garde
// ceux qui reviennent.
export function usageDuJournal(base: Base, { project, repository, period }: OptionsDuDigest): { digest: DigestDUsage; occurrences: OccurrenceDEchec[] } {
  if (project === "") throw new Error("project: empty");
  if (!DEPOT.test(repository)) throw new Error(`repository: expected <owner>/<name>, got ${repository}`);
  const periode = { from: instant(period.from, "from"), to: instant(period.to, "to") };
  if (periode.from > periode.to) throw new Error(`period: ${periode.from} is after ${periode.to}`);
  const dedans = (at: string) => at >= periode.from && at < periode.to;

  const issue = (ticket: number): Preuve => ({ kind: "issue", ticket, url: `https://github.com/${repository}/issues/${ticket}` });
  const pr = (url: string | null): Preuve[] => (url === null ? [] : [{ kind: "pr", url }]);
  const ligne = ({ seq, at, type, ticket }: Ligne): Preuve => ({ kind: "log", seq, at, type, ticket });

  const lire = (types: string[]): Lu[] =>
    base
      .lire<Ligne>(`SELECT seq, at, ticket, type, payload FROM events WHERE project = ? AND type IN (SELECT value FROM json_each(?)) ORDER BY seq`, project, JSON.stringify(types))
      .map((un) => ({ ...un, p: JSON.parse(un.payload) as Record<string, unknown> }));

  // Les parcours sont relus de tout le journal : seuls restent ceux des tickets
  // du projet.
  const siens = new Set(base.lire<{ ticket: number }>("SELECT DISTINCT ticket FROM events WHERE project = ? AND ticket IS NOT NULL", project).map(({ ticket }) => ticket));
  const parcours = parcoursDesTickets(base).filter(({ ticket }) => siens.has(ticket));
  const essais = new Map(parcours.flatMap(({ attempts }) => attempts.map((essai): [string, Essai] => [essai.run, essai])));

  // Par run, ce que le journal en dit : c'est là qu'un essai trouve sa preuve.
  const parRun = Map.groupBy(
    lire(["cook.launched", "cook.exited", "cook.reported", "cook.interrupted", "station.disconnected", "guard.tripped", "pass.judged"]).filter(({ p }) => typeof p.run === "string"),
    ({ p }) => p.run as string,
  );
  const prDuRun = (run: string) => texte(parRun.get(run)?.findLast(({ type }) => type === "pass.judged")?.p.pr);
  const occurrences = occurrencesDesEchecs(parcours, parRun, prDuRun, lire(["worktree.kept", "ticket.86"]), dedans, { pr, ligne });

  const digest: DigestDUsage = {
    project,
    repository,
    period: periode,
    drift: derive(base, parcours, lire(["merge.done", "drift.crossed"]), dedans, { issue, pr, ligne }),
    passRejections: lire(["pass.judged"]).flatMap((juge) => {
      if (juge.p.verdict !== "red" || juge.ticket === null || !dedans(juge.at)) return [];
      const run = String(juge.p.run);
      const essai = essais.get(run);
      const cause = essai === undefined ? null : classerEssai(essai.signaux ?? SANS_SIGNAUX);
      const gates = (juge.p.gates ?? {}) as { outcome?: unknown; failures?: unknown };
      const ci = (juge.p.ci ?? {}) as { outcome?: unknown };
      const review = (juge.p.review ?? {}) as { findings?: unknown };
      const findings = Array.isArray(review.findings) ? (review.findings as Array<{ severity?: unknown; file?: unknown; text?: unknown }>) : [];
      return [
        {
          ticket: juge.ticket,
          run,
          at: juge.at,
          cause,
          title: CAUSES.find(({ cle }) => cle === cause)?.titre ?? null,
          gates: { outcome: texte(gates.outcome) ?? "skipped", failures: Array.isArray(gates.failures) ? gates.failures.flatMap((l) => texte(l) ?? []) : [] },
          ci: texte(ci.outcome) ?? "skipped",
          blocking: findings.filter((f) => f.severity === "blocking").map((f) => ({ file: texte(f.file), text: extrait(texte(f.text) ?? "") })),
          evidence: [issue(juge.ticket), ...pr(texte(juge.p.pr)), ligne(juge)],
        },
      ];
    }),
    guardrailStops: lire(["guard.tripped"]).flatMap((arret) =>
      dedans(arret.at)
        ? [
            {
              ticket: arret.ticket,
              run: String(arret.p.run),
              at: arret.at,
              reason: texte(arret.p.reason) ?? "?",
              limit: nombre(arret.p.limit),
              observed: nombre(arret.p.observed),
              evidence: [...(arret.ticket === null ? [] : [issue(arret.ticket)]), ligne(arret)],
            },
          ]
        : [],
    ),
    setAside: misesDeCote(lire(["ticket.86"]), dedans, { issue, ligne }),
    repeatedFailures: echecsQuiReviennent(occurrences, issue),
  };
  return { digest, occurrences };
}

// Le même, lu du répertoire d'état du projet, en lecture seule.
export function lireDigestDUsage(repertoireEtat: string, options: OptionsDuDigest): DigestDUsage {
  const journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
  try {
    return digestDUsage(journal.base, options);
  } finally {
    journal.fermer();
  }
}

type Citer = { issue: (ticket: number) => Preuve; pr: (url: string | null) => Preuve[]; ligne: (ligne: Ligne) => Preuve };

function derive(base: Base, parcours: Parcours[], lus: Lu[], dedans: (at: string) => boolean, { issue, pr, ligne }: Citer): Derive {
  const merges = parcours.filter(({ end }) => end?.kind === "merged" && dedans(end.at));
  const { retenus, premierCoup } = mesurerRenvois(merges, merges.length);
  const thresholdPercent = seuilsEnVigueur(base)?.firstTryPercent ?? SEUIL_PREMIER_COUP_PAR_DEFAUT;
  const firstTry = premierCoup === null ? 0 : Math.round(premierCoup * retenus);
  return {
    merged: retenus,
    firstTry,
    share: premierCoup,
    thresholdPercent,
    below: premierCoup !== null && premierCoup * 100 < thresholdPercent,
    tickets: merges.map(({ ticket, attempts, end }) => {
      const at = end?.at ?? "";
      const merge = lus.find((lu) => lu.type === "merge.done" && lu.ticket === ticket && lu.at === at);
      return {
        ticket,
        attempts: attempts.length,
        firstTry: attempts.length === 1,
        mergedAt: at,
        evidence: [issue(ticket), ...(merge === undefined ? [] : [...pr(texte(merge.p.pr)), ligne(merge)])],
      };
    }),
    crossings: lus.flatMap((lu) =>
      lu.type === "drift.crossed" && dedans(lu.at)
        ? [{ measure: texte(lu.p.measure) ?? "?", observed: nombre(lu.p.observed) ?? 0, limit: nombre(lu.p.limit) ?? 0, at: lu.at, evidence: [ligne(lu)] }]
        : [],
    ),
  };
}

// Un ticket par raison : une mise de côté répétée — le quota, un worktree
// retenté toutes les dix minutes — reste une ligne, avec son compte.
function misesDeCote(lus: Lu[], dedans: (at: string) => boolean, { issue, ligne }: Omit<Citer, "pr">): TicketMisDeCote[] {
  const parTicket = Map.groupBy(
    lus.filter((lu) => lu.ticket !== null && dedans(lu.at)),
    (lu) => `${lu.ticket}\n${texte(lu.p.reason) ?? ""}`,
  );
  return [...parTicket.values()].map((siennes) => {
    const [premiere, derniere] = [siennes[0] as Lu, siennes.at(-1) as Lu];
    const reason = texte(premiere.p.reason) ?? "";
    const miseDeCote = miseDeCoteDu(reason);
    const why = siennes.findLast((lu) => texte(lu.p.why) !== null)?.p.why;
    return {
      ticket: premiere.ticket as number,
      reason,
      by: miseDeCote?.par ?? null,
      return: miseDeCote?.retour ?? null,
      why: typeof why === "string" ? extrait(why) : null,
      occurrences: siennes.length,
      first: premiere.at,
      last: derniere.at,
      evidence: [issue(premiere.ticket as number), ligne(premiere), ...(derniere === premiere ? [] : [ligne(derniere)])],
    };
  });
}

// Les causes d'essai raté qui disent assez d'elles-mêmes pour qu'on les dise
// la même d'un ticket à l'autre. Ni « autre », que rien ne tranche, ni la
// relecture : deux constats bloquants sur deux tickets ne sont pas le même
// échec — ils sont dans les refus de la pass. Les gates rouges se disent par
// leurs lignes FAIL, le plafond par le garde-fou qui a arrêté le cook.
const CAUSES_QUI_REVIENNENT: readonly Cause[] = ["conflit", "panne", "criteres"];

// Les signatures d'un essai raté : chaque ligne FAIL de ses gates rouges ; sinon
// le garde-fou qui l'a arrêté ; sinon sa cause, si elle dit assez.
function signaturesDeLEssai(signaux: Signaux): Array<{ signature: string; title: string }> {
  const { jugement } = signaux;
  if (jugement !== null && !jugement.noDiff && !jugement.conflit && (jugement.gates.outcome === "red" || jugement.gates.outcome === "timeout")) {
    const lignes = [...new Set(jugement.gates.failures.map(uneLigne).filter((l) => l !== ""))];
    if (lignes.length > 0) return lignes.map((l) => ({ signature: `gates: ${l}`, title: `red gates — ${l.replace(/^FAIL\s+/, "")}` }));
  }
  if (signaux.arret !== null) return [{ signature: `guardrail: ${signaux.arret}`, title: `cook stopped by the ${signaux.arret} guardrail` }];
  const cause = classerEssai(signaux);
  if (!CAUSES_QUI_REVIENNENT.includes(cause)) return [];
  return [{ signature: `cause: ${cause}`, title: CAUSES.find(({ cle }) => cle === cause)?.titre ?? cause }];
}

// Le fait du journal qui prouve l'échec d'un essai, par ordre de préférence.
const PREUVES_D_UN_ESSAI = ["pass.judged", "guard.tripped", "cook.interrupted", "station.disconnected", "cook.reported", "cook.exited", "cook.launched"];

// Les mises de côté qui ne tiennent pas au ticket : répétées, elles bloquent le projet.
const MISES_DE_COTE_DU_PROJET: Record<string, string> = {
  "setup-failed": "the project's setup fails",
  ...Object.fromEntries(Object.entries(CAUSES_DU_PROJET).map(([motif, { text }]) => [motif, text])),
};

function occurrencesDesEchecs(
  parcours: Parcours[],
  parRun: Map<string, Lu[]>,
  prDuRun: (run: string) => string | null,
  lus: Lu[],
  dedans: (at: string) => boolean,
  { pr, ligne }: Omit<Citer, "issue">,
): OccurrenceDEchec[] {
  const occurrences: OccurrenceDEchec[] = [];
  // Les essais ratés, chacun à l'heure du fait qui le prouve.
  for (const un of parcours) {
    essaisRates([un]).forEach((_, i) => {
      const essai = un.attempts[i];
      if (essai === undefined) return;
      const siens = parRun.get(essai.run) ?? [];
      const preuve = PREUVES_D_UN_ESSAI.map((type) => siens.findLast((lu) => lu.type === type)).find((lu) => lu !== undefined);
      if (!dedans(preuve?.at ?? essai.at)) return;
      for (const { signature, title } of signaturesDeLEssai(essai.signaux ?? SANS_SIGNAUX)) {
        occurrences.push({ signature, source: "attempt", title, ticket: un.ticket, example: null, evidence: [...pr(prDuRun(essai.run)), ...(preuve === undefined ? [] : [ligne(preuve)])] });
      }
    });
  }
  for (const lu of lus) {
    if (lu.ticket === null || !dedans(lu.at)) continue;
    const reason = texte(lu.p.reason) ?? "";
    if (lu.type === "worktree.kept" && reason === "failed") {
      occurrences.push({ signature: "cleanup: worktree kept", source: "cleanup", title: "the cleanup could not tidy the cook's worktree", ticket: lu.ticket, example: texte(lu.p.detail), evidence: [ligne(lu)] });
    }
    const titre = MISES_DE_COTE_DU_PROJET[reason];
    if (lu.type === "ticket.86" && titre !== undefined) {
      occurrences.push({ signature: `set-aside: ${reason}`, source: "set-aside", title: titre, ticket: lu.ticket, example: texte(lu.p.why), evidence: [ligne(lu)] });
    }
  }
  return occurrences;
}

// Les échecs vus sur au moins `SEUIL_DE_RECURRENCE` tickets, un élément par signature.
function echecsQuiReviennent(occurrences: OccurrenceDEchec[], issue: (ticket: number) => Preuve): EchecQuiRevient[] {
  return [...Map.groupBy(occurrences, ({ signature }) => signature).values()]
    .flatMap((siennes): EchecQuiRevient[] => {
      const tickets = [...new Set(siennes.map(({ ticket }) => ticket))];
      if (tickets.length < SEUIL_DE_RECURRENCE) return [];
      const [premiere] = siennes as [OccurrenceDEchec];
      const example = siennes.findLast((o) => o.example !== null)?.example ?? null;
      const preuves = [...tickets.map(issue), ...siennes.flatMap(({ evidence }) => evidence)];
      return [
        {
          signature: premiere.signature,
          source: premiere.source,
          title: premiere.title,
          tickets,
          occurrences: siennes.length,
          example: example === null ? null : extrait(example),
          evidence: preuves.filter((preuve, i) => preuves.findIndex((autre) => JSON.stringify(autre) === JSON.stringify(preuve)) === i),
        },
      ];
    })
    .sort((a, b) => b.tickets.length - a.tickets.length || (a.signature < b.signature ? -1 : 1));
}
