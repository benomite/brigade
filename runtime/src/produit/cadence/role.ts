// One run of the product role, as the kitchen wakes it (`cadence.ts`): a
// judgement of the quota, launched like the manager's — under the guardrails,
// with the manager's calibration, with no tool and outside any repository —,
// which answers with the issues it proposes. The code files them, never more
// than what the day's cap leaves, each with `filed-by:product` and its `prio:`:
// the cap holds whatever the role answers.
//
// What the role reads is given to it in its brief (`contexte`): the open
// issues, so that it files no duplicate, the outside issues waiting for an
// answer, and the usage the kitchen measures. The role's definition, and the
// usage digest, belong to the role (#1952, #1953): `consigne` and `usage` are
// where they plug in.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Calibrage } from "../../calibrage.ts";
import { direRefus, environnementCook, lireFlux, verdict, type Lecture } from "../../claude.ts";
import { envelopper, type Cloison } from "../../cloison.ts";
import { LancementRefuse, type GardeFous } from "../../garde-fous.ts";
import type { GitHub, IssueOuverte } from "../../github.ts";
import { environnementClaude } from "../../jeton-claude.ts";
import { argumentsJuge, objet, phrase } from "../../juger.ts";
import type { IssueDuRole, RaisonDuReveil } from "./evenements.ts";

// The label every issue the role files carries: the chef tells them at a
// glance, and the cap counts them.
export const DEPOSE_PAR = "filed-by:product";
// The name under which the role's runs show in the log, in place of a station.
export const STATION = "product";

export type DemandeAuRole = { raison: RaisonDuReveil; enRetard: number[]; restant: number; jour: string };

// What a run did. Null: nothing ran — the chef's "stop" or the breaker came
// first; the next tick tries again.
export type RunDuRole = { run: string | null; outcome: IssueDuRole; filed: number[]; detail: string | null };
export type LancerLeRole = (demande: DemandeAuRole) => Promise<RunDuRole | null>;

export type Proposition = { titre: string; corps: string; prio: number };

// The proposals in the role's answer, or why it does not read. A proposal
// with no title, no body or a priority outside 1-4 is dropped, not filed.
export function lirePropositions(message: string | null): { propositions: Proposition[] } | { illisible: string } {
  if (message === null || message.trim() === "") return { illisible: "no answer" };
  const lu = objet(message);
  if (!lu) return { illisible: "no JSON object in the answer" };
  if (!Array.isArray(lu.issues)) return { illisible: "no `issues` list in the answer" };
  const propositions = lu.issues.flatMap((brute: unknown): Proposition[] => {
    if (brute === null || typeof brute !== "object") return [];
    const { title, body, prio } = brute as Record<string, unknown>;
    const titre = phrase(title);
    const corps = phrase(body);
    if (titre === null || corps === null || !Number.isInteger(prio) || (prio as number) < 1 || (prio as number) > 4) return [];
    return [{ titre, corps, prio: prio as number }];
  });
  return { propositions };
}

const RAISONS: Record<RaisonDuReveil, string> = {
  "rail-empty": "the rail is empty",
  "outside-issue-overdue": "an issue opened by someone other than the chef has waited more than a day for an answer",
};

// The line every filed issue ends with: who filed it, and why it was woken.
export const signature = (raison: RaisonDuReveil) => `_Filed by the second, woken by the kitchen while the chef was away: ${RAISONS[raison]}._`;

export type ContexteDuRole = { depot: string; demande: DemandeAuRole; ouvertes: IssueOuverte[]; usage: string };

// The brief by default: the second's limits, what it reads, and the form of
// its answer. The role's own definition replaces it (#1952).
export function consigneDuRole({ depot, demande, ouvertes, usage }: ContexteDuRole): string {
  const dehors = ouvertes.filter((issue) => demande.enRetard.includes(issue.number));
  return [
    `You are the second of the project ${depot}, woken by the kitchen while the chef is away, because ${RAISONS[demande.raison]}.`,
    "You turn usage into prioritized product issues: the product *what* — context, observable acceptance criteria —, never code. Anything that changes the product's direction, or needs the chef, is not yours to file.",
    `File at most ${demande.restant} issue${demande.restant > 1 ? "s" : ""}, none that duplicates an open issue. Each body gives the usage that justifies it, with a link to the evidence. Filing nothing is a valid answer.`,
    "",
    "## Open issues",
    ...(ouvertes.length === 0 ? ["(none)"] : ouvertes.map((issue) => `- #${issue.number} ${issue.title}${issue.labels.length === 0 ? "" : ` [${issue.labels.join(", ")}]`}`)),
    ...(dehors.length === 0 ? [] : ["", "## Outside issues waiting for an answer", ...dehors.map((issue) => `### #${issue.number} ${issue.title}\n${issue.body}`)]),
    "",
    "## Usage",
    usage.trim() === "" ? "(no usage digest)" : usage,
    "",
    'Answer with one JSON object, and nothing else: {"issues": [{"title": "…", "body": "…", "prio": 1}]} — `prio` from 1 (first) to 4.',
  ].join("\n");
}

export type OptionsDuRole = {
  github: Pick<GitHub, "creerIssue">;
  // `<owner>/<repo>`.
  depotGitHub: string;
  repertoireEtat: string;
  // The `claude` binary.
  bin: string;
  // Read at every run: the chef may change it without a restart.
  calibrage: () => Calibrage;
  // What the role reads, besides its wake: the open issues, and the usage digest.
  ouvertes: () => Promise<IssueOuverte[]>;
  usage?: () => string;
  consigne?: (contexte: ContexteDuRole) => string;
  env?: NodeJS.ProcessEnv;
  cloison?: Cloison | null;
  avertir?: (message: string) => void;
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

export function lanceurDuRole(runtime: Pick<GardeFous, "lancer">, options: OptionsDuRole): LancerLeRole {
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  return async (demande) => {
    const ouvertes = await options.ouvertes();
    const consigne = (options.consigne ?? consigneDuRole)({ depot: options.depotGitHub, demande, ouvertes, usage: options.usage?.() ?? "" });
    const run = `product-${demande.jour}-${randomUUID().slice(0, 8)}`;
    const calibrage = options.calibrage();
    const env = options.env ?? process.env;
    let lance;
    try {
      lance = runtime.lancer({
        ticket: null,
        run,
        contexte: { station: STATION, ...calibrage },
        // Outside any repository: the role reads only its brief.
        ...envelopper(options.cloison ?? null, { commande: options.bin, args: argumentsJuge(consigne, calibrage) }, { cwd: tmpdir(), depot: null }),
        cwd: tmpdir(),
        env: environnementClaude(environnementCook(env), env),
        juger: (fin) => (fin.code === 0 && fin.arret === null ? "neutral" : "failed"),
      });
    } catch (erreur) {
      if (erreur instanceof LancementRefuse) return null;
      throw erreur;
    }
    const fin = await lance.fin;
    if (fin.outcome === "stop" || fin.outcome === "interrupted") return null;
    let lecture: Lecture;
    try {
      lecture = lireFlux(readFileSync(join(options.repertoireEtat, "runs", `${run}.jsonl`), "utf8"));
    } catch {
      return { run, outcome: "failed", filed: [], detail: "no stream" };
    }
    const comment = fin.arret ? "failed" : verdict(lecture, fin.code);
    if (comment !== "done") return { run, outcome: "failed", filed: [], detail: comment === "refused" ? direRefus(lecture) : fin.arret ? `guard:${fin.arret.reason}` : comment };
    const lues = lirePropositions(lecture.message);
    if ("illisible" in lues) return { run, outcome: "unreadable", filed: [], detail: lues.illisible };
    const filed: number[] = [];
    for (const { titre, corps, prio } of lues.propositions.slice(0, demande.restant)) {
      try {
        filed.push(await options.github.creerIssue({ titre, corps: `${corps}\n\n${signature(demande.raison)}`, labels: [DEPOSE_PAR, `prio:${prio}`] }));
      } catch (erreur) {
        avertir(`brigade : the product role's issue « ${titre} » was not filed — ${message(erreur)}`);
      }
    }
    const ecartees = lues.propositions.length - Math.min(lues.propositions.length, demande.restant);
    return { run, outcome: "done", filed, detail: ecartees === 0 ? null : `${ecartees} proposal${ecartees > 1 ? "s" : ""} beyond the cap, not filed` };
  };
}
