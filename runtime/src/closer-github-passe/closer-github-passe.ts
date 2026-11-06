// The closer on the GitHub-only path (#2361), the only one since the old path
// went (#2061): project by project, at the closer's cadence, it reads and
// writes only GitHub — and the project's clone, as the observation always did.
//
// A ticket lives entirely in its issue, so a closing pass does too: when the
// closer is set and `MERGES_PER_PASS` merges reached the integration branch
// since the last pass, never twice within `ONE_PASS_A_DAY_MS` and never while
// one is still open, the pass observes the base (the duplicates and dead code
// to prune, and the drift of the latest merges) and opens one closing issue —
// `fire`, the closer's calibration, its candidates, their files as its zone,
// and the removal cap as an acceptance criterion. The GitHub-only stations
// take, cook, review and merge it like any ticket: its zone keeps the other
// tickets off its files, and the pass judges what it removed. Nothing here
// launches `claude`, reads the log or writes it.
//
// The last pass is read back from GitHub, by the mark in its body: a restart,
// or another station serving the same project, sees it. Two stations that open
// one at the same instant keep the oldest, and close the other.
//
// The drift is read at the same cadence, whether the closer is set or not, as
// the old path read it at each merge (`derive.ts`): the merges since the last
// pass and what the GitHub-only cooks spent on them, against the chef's
// thresholds (`derive-github.ts`). Its result goes where `status` reads its
// `drift` line, and a threshold newly crossed is said once.
//
// The tickets' times are read at the same pass (#2364): the times the station recorded at each
// merge, since the previous pass, go to `readDrift` (`closer-github-durees`); a finding goes to
// `writeCorrection` (`closer-github-correction`), which opens the project's correction ticket
// or completes the open one. The closing issue's body says what was found and done, or that
// the times are stable.
//
// What the old closer kept in the log has no GitHub-only counterpart yet, and
// is not carried: the memory of what a pass left (a candidate left may be
// proposed again), its run condition on the cooks in flight, and a drift
// threshold as a trigger.
import { promisify } from "node:util";
import { writeCorrection, type CorrectionResult, type GithubClient } from "../closer-github-correction/correction.ts";
import { readDrift, type ProjectReading, type TicketTime } from "../closer-github-durees/derive.ts";
import { DE_CONFIANCE } from "../alimenter.ts";
import { decompteMarque, defautDesBlocagesSansQuestion, type StatutDeCloture } from "../cloture-blocages.ts";
import { candidats, proposer, type Candidat } from "../closing/candidates.ts";
import { direRatio, mesurerRatio } from "../closing/ratio.ts";
import { lireDepot, type Depot } from "../closing/reading.ts";
import type { Depot as DepotDeStation } from "../depot.ts";
import type { ReglagesDeFermeture } from "../events/closing.ts";
import type { Seuils } from "../events/drift.ts";
import { LABEL, type IssueOuverte } from "../github.ts";
import type { Runtime } from "../runtime.ts";
import { direJaugeEn } from "../mesures.ts";
import { execFile } from "../sans-invite.ts";
import type { TempsTicket } from "../temps-ticket/ligne-status.ts";
import { releverDerive, ticketDuMerge, type CoutsDesCooks, type DeriveGithub, type MergeDuClone } from "./derive-github.ts";

// The merges since the last pass beyond which a pass is opened.
export const MERGES_PER_PASS = 20;
// The shortest gap between two passes of a project: a day.
export const ONE_PASS_A_DAY_MS = 24 * 60 * 60 * 1000;

// What the pass reads and writes of GitHub.
export type GitHubDuCloser = {
  // The issues changed since `instant`, open or closed, with their body.
  issuesDepuis(instant: string): Promise<Pick<IssueOuverte, "number" | "title" | "labels" | "body" | "association" | "state" | "createdAt">[]>;
  creerIssue(issue: { titre: string; corps: string; labels: string[] }): Promise<number>;
  fermerIssue(numero: number): Promise<void>;
  // Replaces an issue's body: the correction ticket completed with a finding.
  ecrireCorps(numero: number, corps: string): Promise<void>;
};

// What the pass reads of the project's clone, the base fetched from the origin.
export type LectureDuClone = {
  // The latest merges of the integration branch, the most recent first: its
  // first-parent commits, whatever the merge method.
  merges(): Promise<MergeDuClone[]>;
  // The observation: the latest merges and the files of the base.
  observer(): Promise<Pick<Depot, "sha" | "merges" | "textes">>;
};

export type OptionsCloserGithub = {
  // The closer's settings, read at each pass: without a calibration, no pass.
  reglages: () => Pick<ReglagesDeFermeture, "calibration" | "removedLines">;
  github: GitHubDuCloser;
  clone: LectureDuClone;
  base: string;
  // The shortest gap between two passes: GitHub and the origin are read at
  // most this often. By default `ECART_MS`.
  ecartMs?: number;
  maintenant?: () => Date;
  avertir?: (message: string) => void;
  // The drift: the chef's thresholds, read at each pass, what the cooks of a
  // ticket spent, and where the reading goes. Absent, the drift is not read.
  // The tickets' times the station recorded at each merge (`temps-ticket/mesure.ts`), read at each
  // pass. Absent, the times are not read.
  temps?: () => TempsTicket[];
  // The status the closer reads: a `blockedWithoutQuestion` above zero is a defect to fix, not a clean close.
  // Absent, or `null`, nothing is read.
  statut?: () => StatutDeCloture | null | Promise<StatutDeCloture | null>;
  derive?: { seuils: () => Seuils; couts: CoutsDesCooks; noter: (derive: DeriveGithub) => void };
};

// The shortest gap between two passes, ten ticks: a pass is due at most once
// a day, there is no use reading GitHub every minute to know it.
export const ECART_MS = 10 * 60_000;
// How far back GitHub is asked for the last pass: further, it is as if there
// had been none, and every merge read counts.
const FENETRE_MS = 7 * ONE_PASS_A_DAY_MS;

const MARQUE = /^\s*<!--\s*brigade:fermeture(?:\s+sha=[0-9a-f]*)?\s*-->\s*$/m;
export const marqueDeFermeture = (sha: string) => `<!-- brigade:fermeture sha=${sha} -->`;
export const estUneFermeture = (corps: string): boolean => MARQUE.test(corps);

type Passe = { number: number; createdAt: string; state: "open" | "closed" };

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

const depuisLaPasse = (derniere: Passe | null) => (derniere === null ? Number.NEGATIVE_INFINITY : Date.parse(derniere.createdAt));

// Why a pass is due now, or null: `MERGES_PER_PASS` merges since the last pass,
// at most one a day, never while one is open — on what GitHub and the clone say.
export function aOuvrir(derniere: Passe | null, merges: MergeDuClone[], maintenant: Date): { merges: number } | null {
  if (derniere !== null && (derniere.state === "open" || maintenant.getTime() - Date.parse(derniere.createdAt) < ONE_PASS_A_DAY_MS)) return null;
  const nouveaux = merges.filter(({ at }) => Date.parse(at) > depuisLaPasse(derniere)).length;
  return nouveaux >= MERGES_PER_PASS ? { merges: nouveaux } : null;
}

export function titreDeLaFermeture(base: string): string {
  return `Closing pass on \`${base}\`: prune dead code and duplicates`;
}

const signe = (n: number, s: string) => `${s}${n.toLocaleString("en-US")}`;

// The times of the merged tickets as `readDrift` reads them: the cook's own work is what the cook
// spent but for the tests, which are a part of it; the whole is the sum of the phases.
export function tempsLus(project: string, enregistrements: TempsTicket[]): TicketTime[] {
  return enregistrements
    .filter(({ mergedAt }) => mergedAt !== undefined)
    .map((t) => ({
      project,
      ticket: t.ticket,
      at: t.mergedAt as string,
      seconds: t.cuisson + t.attentePasse + t.revue + t.ci + t.merge,
      split: { cook: Math.max(0, t.cuisson - t.cuissonTests), tests: t.cuissonTests, ci: t.ci },
    }));
}

const EPOCH = new Date(0).toISOString();

// What `writeCorrection` needs of GitHub, from the client the pass already has.
export function clientDeCorrection(github: GitHubDuCloser): GithubClient {
  return {
    listIssues: async ({ label }) =>
      (await github.issuesDepuis(EPOCH))
        .filter((issue) => issue.labels.includes(label) && DE_CONFIANCE.includes(issue.association))
        .map(({ number, title, body, state }) => ({ number, title, body, state })),
    createIssue: async ({ title, body, labels }) => ({ number: await github.creerIssue({ titre: title, corps: body, labels }) }),
    updateIssueBody: (numero, corps) => github.ecrireCorps(numero, corps),
  };
}

// What the times say since the pass: the lines of the closing issue's section, and what was done.
export async function releverLesTemps(project: string, enregistrements: TempsTicket[], depuis: string | null, github: GitHubDuCloser): Promise<string[]> {
  const lectures: ProjectReading[] = readDrift(tempsLus(project, enregistrements), depuis);
  const trouvaille = lectures.find((lecture) => lecture.project === project)?.finding ?? null;
  if (trouvaille === null) {
    const tickets = lectures.find((lecture) => lecture.project === project)?.tickets ?? 0;
    return [`Times stable: ${tickets === 0 ? "no ticket" : `${tickets} ticket${tickets > 1 ? "s" : ""}`} measured since the last pass, and no drift. No correction ticket is opened or changed.`];
  }
  const fait: CorrectionResult = await writeCorrection(project, trouvaille, clientDeCorrection(github));
  const quoi = { opened: "opened", completed: "completed with this finding", unchanged: "already carries this finding" }[fait.action];
  return [trouvaille.sentence, "", `Correction ticket #${fait.number} ${quoi}.`];
}

export function corpsDeLaFermeture(pour: { base: string; sha: string; merges: number; pente: ReturnType<typeof mesurerRatio>; proposes: Candidat[]; ecartes: number; zone: string[]; retraits: number; temps?: string[] }): string {
  const { base, sha, merges, pente, proposes, ecartes, zone, retraits, temps } = pour;
  return [
    marqueDeFermeture(sha),
    "",
    "## Context",
    "",
    `The closer's pass over \`${base}\`, opened by a station on the GitHub-only path after ${merges} merges since the last one. Its goal is to remove as much as it safely can: delete the dead code, factor the duplicated passages into one shared place — and add nothing else, no feature, no file. A cook that errs adds bad code and the pass catches it; a closer that errs removes good code, and the gates still say green, since what is gone was tested by nothing. When in doubt, leave it and say why.`,
    "",
    "## Drift",
    "",
    `Lines added and removed by the latest merges of \`${base}\` (added:removed):`,
    "",
    ...pente.filter(({ merges: n }) => n > 0).map(({ fenetre, merges: n, ajoute, retire }) => `- last ${Math.min(fenetre, n)} merges: ${signe(ajoute, "+")} / ${signe(retire, "−")} (${direRatio({ ajoute, retire })})`),
    "",
    ...(temps === undefined ? [] : ["## Times", "", ...temps, ""]),
    "## Candidates",
    "",
    `What the observation spots on \`${sha}\`. Candidates, not verdicts: text compared with text. An export a framework reads by convention is named by nobody and lives anyway; two identical passages are not always to be joined.`,
    "",
    ...proposes.map(({ id, quoi }) => `- ${id} — ${quoi}`),
    ...(ecartes === 0 ? [] : ["", `${ecartes} more are left for a next pass.`]),
    "",
    "- A dead export (`M…`): delete it, and with it what existed only for it — the test that exercises only it, the doc sentence that describes it. Never remove or weaken a test of living code to make a removal pass.",
    "- A duplicate (`D…`): factor it. Keep one copy, in one of the files of the zone, under a name that says what it does, and have the other place call it. Two passages that look alike but must each evolve on their own are left, saying so.",
    "- Leave whatever a framework or a tool may read by convention: entry points, the exported API that `docs/` names, files loaded by name. Before each gesture, look for the candidate's uses in the whole repository, including those not written as an import.",
    "",
    "## Zone",
    "",
    ...zone.map((fichier) => `- \`${fichier}\``),
    "",
    "## Acceptance criteria",
    "",
    "- Each candidate is deleted, factored, or left with its reason: the report has one line per candidate left, `LEFT <candidate>: <why>`.",
    `- No more than ${retraits.toLocaleString("en-US")} lines removed in all, factorings included: a short and safe pass is better.`,
    "- Only the files of the zone are written, and no file is created.",
    "- The gates and the CI stay green after each gesture: a gesture that turns them red is undone, and its candidate left.",
    "",
    "---",
    "",
    "_Opened by the closer of a station, with no gesture from the chef._",
  ].join("\n");
}

// Runs the closer's pass at each tick, one at a time and at most every
// `ecartMs`, while the switch is on. Its `arreter` takes it along.
export function brancherCloserGithub<R extends Runtime>(runtime: R, options: OptionsCloserGithub): R {
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const maintenant = options.maintenant ?? (() => new Date());
  const ecartMs = options.ecartMs ?? ECART_MS;
  const { github, clone, base } = options;
  let arrete = false;
  let occupe = false;
  let derniereFois = Number.NEGATIVE_INFINITY;
  // The base on which the observation found nothing to propose: not observed
  // again until it moves.
  let rien: string | null = null;
  // The measures crossed at the last reading of the drift: a crossing is said once.
  let signales = new Set<string>();

  // The closing passes GitHub knows within the window, the oldest first. The
  // start of the window is a day's, so that the read stays conditional.
  const passes = async (): Promise<Passe[]> => {
    const depuis = new Date(Math.floor((maintenant().getTime() - FENETRE_MS) / ONE_PASS_A_DAY_MS) * ONE_PASS_A_DAY_MS).toISOString();
    return (await github.issuesDepuis(depuis))
      .filter((issue) => DE_CONFIANCE.includes(issue.association) && estUneFermeture(issue.body))
      .map(({ number, createdAt, state }) => ({ number, createdAt, state }))
      .sort((x, y) => x.number - y.number);
  };

  const relever = (derive: NonNullable<OptionsCloserGithub["derive"]>, derniere: Passe | null, merges: MergeDuClone[]) => {
    try {
      const franchis = releverDerive(merges, depuisLaPasse(derniere), derive.couts, derive.seuils());
      derive.noter({ at: maintenant().toISOString(), franchis });
      for (const franchi of franchis) if (!signales.has(franchi.measure)) avertir(`brigade : drift — ${direJaugeEn(franchi)}`);
      signales = new Set(franchis.map(({ measure }) => measure));
    } catch (erreur) {
      // A reading that fails stops neither the closer nor the kitchen: the next pass reads again.
      avertir(`brigade : drift not read — ${message(erreur)}`);
    }
  };

  // A reading or a write that fails stops neither the pass nor the issue: the body says so.
  const lesTemps = async (lire: () => TempsTicket[], derniere: Passe | null): Promise<string[]> => {
    try {
      return await releverLesTemps(runtime.projet, lire(), derniere === null ? null : derniere.createdAt, github);
    } catch (erreur) {
      avertir(`brigade : times not read — ${message(erreur)}`);
      return [`Times not read: ${message(erreur)}.`];
    }
  };

  // A project with blocked-on-human tickets that ask no question is not closed clean: one defect names the
  // count, opened once per count, whether the last one is still open or already fixed. A status that cannot be read stops neither the pass nor the issue.
  const blocages = async (lire: NonNullable<OptionsCloserGithub["statut"]>, calibration: { model: string; effort: string }) => {
    try {
      const statut = await lire();
      const defaut = statut === null ? null : defautDesBlocagesSansQuestion(statut);
      if (statut === null || defaut === null) return;
      // The count never goes back to zero: a defect, open or closed, that names this count or a higher one is enough.
      const dejaNommes = (await github.issuesDepuis(EPOCH)).filter((issue) => DE_CONFIANCE.includes(issue.association)).map((issue) => decompteMarque(issue.body));
      if (dejaNommes.some((nomme) => nomme !== null && nomme >= statut.blockedWithoutQuestion) || arrete) return;
      const creee = await github.creerIssue({ titre: defaut.title, corps: defaut.body, labels: [LABEL, `model:${calibration.model}`, `effort:${calibration.effort}`] });
      avertir(`brigade : defect opened on GitHub — #${creee}, ${defaut.title}`);
    } catch (erreur) {
      avertir(`brigade : blocked-without-question count not handled — ${message(erreur)}`);
    }
  };

  const passer = async () => {
    const { calibration, removedLines } = options.reglages();
    if (calibration === null && options.derive === undefined) return;
    const derniere = (await passes()).at(-1) ?? null;
    const merges = await clone.merges();
    if (options.derive !== undefined && !arrete) relever(options.derive, derniere, merges);
    if (calibration === null) return;
    if (options.statut !== undefined && !arrete) await blocages(options.statut, calibration);
    const due = aOuvrir(derniere, merges, maintenant());
    if (due === null || arrete) return;
    const observation = await clone.observer();
    if (arrete || observation.sha === rien) return;
    const { proposes, ecartes, zone } = proposer(candidats(observation), []);
    if (proposes.length === 0) {
      rien = observation.sha;
      avertir(`brigade : closing pass not opened — the observation spots neither duplicate nor dead code on \`${base}\` (${observation.sha.slice(0, 7)})`);
      return;
    }
    // Read again before writing: another station may have opened it meanwhile.
    if (((await passes()).at(-1)?.number ?? null) !== (derniere?.number ?? null) || arrete) return;
    const temps = options.temps === undefined ? undefined : await lesTemps(options.temps, derniere);
    const corps = corpsDeLaFermeture({ base, sha: observation.sha, merges: due.merges, pente: mesurerRatio(observation.merges), proposes, ecartes: ecartes.length, zone, retraits: removedLines, ...(temps === undefined ? {} : { temps }) });
    const creee = await github.creerIssue({ titre: titreDeLaFermeture(base), corps, labels: [LABEL, `model:${calibration.model}`, `effort:${calibration.effort}`] });
    // Two stations that opened one together: the oldest stays.
    const premiere = (await passes()).find(({ number }) => number > (derniere?.number ?? 0))?.number ?? creee;
    if (premiere < creee) {
      await github.fermerIssue(creee);
      return;
    }
    avertir(`brigade : closing pass opened on GitHub — #${creee}, ${due.merges} merges since the last one, ${proposes.length} candidate${proposes.length > 1 ? "s" : ""}`);
  };

  const desabonner = runtime.surReveil((cause) => {
    if (cause !== "tick" || arrete || occupe) return;
    const instant = maintenant().getTime();
    if (instant - derniereFois < ecartMs) return;
    derniereFois = instant;
    occupe = true;
    void passer()
      .catch((erreur) => {
        if (!arrete) avertir(`brigade : closing pass not run — ${message(erreur)}`);
      })
      .finally(() => {
        occupe = false;
      });
  });
  return {
    ...runtime,
    arreter(signal: string) {
      arrete = true;
      desabonner();
      runtime.arreter(signal);
    },
  };
}

// The clone of the project, its base fetched from the origin before each read.
export function lectureDuClone(options: { depot: Pick<DepotDeStation, "rapatrier">; clone: string; base: string; env?: NodeJS.ProcessEnv }): LectureDuClone {
  const env = options.env ?? process.env;
  return {
    merges: async () => {
      await options.depot.rapatrier();
      // One delivery per commit of the branch's first parents: the GitHub-only stations merge with a merge commit
      // (`merge_method=merge`, `github.ts`), but a PR merged by squash or rebase by hand lands as plain commits, and
      // counts too. Only a merge commit names its ticket, by its `cook/<n>-` branch.
      const { stdout } = await promisify(execFile)("git", ["log", "--first-parent", "-n", "100", "--format=%cI%x09%s", `origin/${options.base}`], { cwd: options.clone, env: { ...env, GIT_OPTIONAL_LOCKS: "0" }, encoding: "utf8", timeout: 60_000 });
      return String(stdout)
        .split("\n")
        .filter((ligne) => ligne !== "")
        .map((ligne) => {
          const [at = "", ...sujet] = ligne.split("\t");
          return { at, ticket: ticketDuMerge(sujet.join("\t")) };
        });
    },
    observer: async () => {
      await options.depot.rapatrier();
      return lireDepot(options.clone, options.base, env);
    },
  };
}
