// Le résumé hebdomadaire de la cuisine, dans l'app (ticket 3263, épique 3251) : ce que le process principal lit et fait pour
// la page des résumés (resume-weekly.js).
//   - Le jour du résumé : `weeklySummaryDay` de `.claude/brigade/projet.json`, lu sur la branche d'intégration du dépôt,
//     et changé par une pull request vers elle — comme un plafond de durée (caps-duration.ts), dont ce module reprend la
//     lecture et la proposition. Absent du fichier, c'est lundi (runtime/src/resume-hebdomadaire/jour.ts).
//   - Les résumés : chacun s'écrit dans l'état du projet, là où sa cuisine tourne, et l'app le lit par la commande du
//     runtime qui le rend, `report --week <weekStart>` (runtime/src/rapport-cli.ts, ticket 3261). Le résumé d'un jour couvre
//     les sept jours d'avant : sa semaine commence le même jour de la semaine. Les semaines lues sont les `SEMAINES`
//     dernières qui commencent au jour réglé — un résumé écrit à un autre jour, avant un changement du réglage, n'y est
//     pas.
//   - La publication : `release-notes <tag> <summary.json>` (runtime/src/release-notes-cli.ts, ticket 3262), là où la cuisine
//     tourne, sur l'enregistrement du résumé écrit dans un fichier provisoire de cet ordinateur. Un runtime qui n'a pas la
//     commande le dit, et la page demande sa mise à jour.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JOUR_PAR_DEFAUT, JOURS_DU_RESUME, jourDe, jourDuResume, type JourDuResume } from "../../../../runtime/src/resume-hebdomadaire/jour.ts";
import { cite, type Read, type Rendered } from "../../box.ts";
import { FILE, readTheFile, proposeTheFile, textOfFile, type FileRead } from "../../caps-duration.ts";
import type { ClientOfThePriority } from "../../priority.ts";
import { detailOf, withoutTheCommand } from "../../settings-of-project.ts";

export { JOURS_DU_RESUME, JOUR_PAR_DEFAUT, type JourDuResume };

// Le nombre de semaines dont l'app cherche le résumé, la plus récente d'abord.
export const WEEKS = 6;
const DAY_MS = 24 * 3600 * 1000;

export type LineOfResume = { text: string; ticketNumber: number; ticketUrl: string };
export type Autonomy = { tickets: number; servedWithoutHuman: number; shareWithoutHuman: number | null; medianLeadTimeMs: number | null; sentBack: number; shareSentBack: number | null };
// L'enregistrement d'un résumé, tel que le runtime l'écrit (runtime/src/resume-hebdomadaire/resume.ts).
export type ResumeWeekly = {
  project: string;
  weekStart: string;
  weekEnd: string;
  themes: { title: string; lines: LineOfResume[] }[];
  autonomy?: Autonomy;
  waiting: LineOfResume[];
  markdown: string;
};

// Le jour réglé : sa valeur, et s'il est écrit dans le fichier — ou pourquoi il ne se lit pas.
export type ReadOfDay = { jour: JourDuResume; pose: boolean } | { sans: string; detail?: string };
// Les résumés trouvés, le plus récent d'abord, et les semaines dont le résumé ne se lit pas — ou pourquoi aucun ne se lit.
export type ReadOfResumes = { resumes: ResumeWeekly[]; illisibles: { weekStart: string; detail: string }[] } | { sans: string; detail?: string };
// Ce que la page reçoit d'un projet.
export type ResumesOfProject = { projet: string; jour: ReadOfDay; resumes: ReadOfResumes };
// Ce que le changement du jour a rendu : la PR qui le propose, le jour déjà là, ou pourquoi rien n'a changé.
export type RenderedOfDay = { pr: string; numero: number; jour: JourDuResume } | { fait: string } | { refus: string; detail?: string };
// Ce que la publication a rendu : la release publiée, celle qui l'était déjà, ou pourquoi rien n'est publié.
export type RenderedOfThePublication = { publiee: string; url: string } | { dejaPubliee: string; url: string } | { refus: string; detail?: string };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const date = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Les semaines dont le résumé a pu s'écrire à `maintenant` : celles qui commencent au jour réglé, et dont le jour du
// résumé — sept jours après leur début — est passé ou est aujourd'hui (UTC, comme le runtime). La plus récente d'abord.
export function weeksARead(day: JourDuResume, now: Date, count = WEEKS): string[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let last = today;
  while (jourDe(new Date(last)) !== day) last -= DAY_MS;
  return Array.from({ length: count }, (_, rank) => date(last - (rank + 1) * 7 * DAY_MS));
}

// Le jour du résumé, sur la branche d'intégration du dépôt (null : celle par défaut de GitHub). Un fichier absent, ou
// qui ne le dit pas : lundi. Un réglage qui n'est pas un jour ne se lit pas — il ne vaut pas lundi à la place du chef.
export async function readTheDay({ depot: repository, branche: branch, client }: { depot: string; branche: string | null; client: ClientOfThePriority }): Promise<ReadOfDay> {
  let content: Record<string, unknown> | null;
  try {
    ({ contenu: content } = await readTheFile(client, repository, branch));
  } catch (error) {
    return { sans: "summary day unavailable", detail: message(error) };
  }
  try {
    return { jour: jourDuResume(content), pose: content !== null && content.weeklySummaryDay !== undefined };
  } catch (error) {
    return { sans: "summary day unavailable", detail: `${FILE}: ${message(error)}` };
  }
}

// Change le jour dans le dépôt : le fichier relu, la seule clé `weeklySummaryDay` posée, le reste gardé tel quel, puis
// proposé par une pull request vers la branche d'intégration. Sans fichier, il est créé avec ce que le runtime exige
// d'un fichier — seulement quand la branche est connue.
export async function changeTheDay({ depot: repository, branche: branch, jour: day, client }: { depot: string; branche: string | null; jour: unknown; client: ClientOfThePriority }): Promise<RenderedOfDay> {
  if (typeof day !== "string" || !(JOURS_DU_RESUME as readonly string[]).includes(day)) return { refus: `nothing was changed: the summary day is one of ${JOURS_DU_RESUME.join(", ")}` };
  const wanted = day as JourDuResume;
  let readOne: FileRead;
  try {
    readOne = await readTheFile(client, repository, branch);
  } catch (error) {
    return { refus: `nothing was changed: ${FILE} was not read on GitHub`, detail: message(error) };
  }
  if (readOne.contenu === null && branch === null) return { refus: `nothing was changed: ${repository} has no ${FILE} and its integration branch is not known` };
  const content: Record<string, unknown> = readOne.contenu ?? { version: 1, integrationBranch: branch };
  if (content.weeklySummaryDay === wanted) return { fait: "unchanged: the repository already says so" };
  content.weeklySummaryDay = wanted;
  try {
    const openOne = await proposeTheFile(client, repository, branch, { texte: textOfFile(content), sha: readOne.sha, dit: `set weeklySummaryDay to ${wanted}`, ou: "Weekly summary" });
    return { ...openOne, jour: wanted };
  } catch (error) {
    return { refus: `nothing was proposed: GitHub did not open the pull request of ${FILE}`, detail: message(error) };
  }
}

const isLine = (line: unknown): line is LineOfResume =>
  isObject(line) && typeof line.text === "string" && Number.isSafeInteger(line.ticketNumber) && typeof line.ticketUrl === "string" && URL.parse(line.ticketUrl)?.protocol === "https:";
const numberOrNone = (value: unknown) => value === null || typeof value === "number";
const isAutonomy = (value: unknown): value is Autonomy =>
  isObject(value) &&
  typeof value.tickets === "number" &&
  typeof value.servedWithoutHuman === "number" &&
  typeof value.sentBack === "number" &&
  numberOrNone(value.shareWithoutHuman) &&
  numberOrNone(value.medianLeadTimeMs) &&
  numberOrNone(value.shareSentBack);

// L'enregistrement d'un résumé, s'il en a la forme ; null sinon. Rien n'y est complété.
export function resumeRead(value: unknown): ResumeWeekly | null {
  if (!isObject(value)) return null;
  const { project, weekStart, weekEnd, themes, autonomy, waiting, markdown } = value;
  if (typeof project !== "string" || typeof weekStart !== "string" || !DATE.test(weekStart) || typeof weekEnd !== "string" || typeof markdown !== "string") return null;
  if (!Array.isArray(themes) || !themes.every((theme) => isObject(theme) && typeof theme.title === "string" && Array.isArray(theme.lines) && theme.lines.every(isLine))) return null;
  if (!Array.isArray(waiting) || !waiting.every(isLine)) return null;
  if (autonomy !== undefined && !isAutonomy(autonomy)) return null;
  return { project, weekStart, weekEnd, themes: themes as ResumeWeekly["themes"], ...(autonomy === undefined ? {} : { autonomy }), waiting: waiting as LineOfResume[], markdown };
}

// Ce que `report` écrit pour la semaine qui n'a pas de résumé (runtime/src/rapport-cli.ts).
const WITHOUT_RESUME = /no weekly summary of /;
// Un runtime d'avant le ticket 3261 ne connaît pas `--week` : il refuse l'appel en code 2, son usage sans lui.
const withoutTheWeek = (rendered: Rendered) => withoutTheCommand(rendered) || (rendered.erreur?.code === 2 && !rendered.erreurs.includes("--week"));

// Les résumés d'un projet, là où sa cuisine tourne : une lecture par semaine, la plus récente d'abord. Une semaine sans
// résumé n'est pas une erreur ; une semaine dont le résumé ne se lit pas est nommée, avec ce que le runtime a dit.
export async function readTheResumes({ projet: project, lu: readOne, jour: day, lancer: launch, maintenant: now }: { projet: string; lu: Read | undefined; jour: JourDuResume; lancer: (readOne: Read, command: string) => Promise<Rendered>; maintenant: Date }): Promise<ReadOfResumes> {
  if (readOne === undefined) return { sans: `${project} does not cook on this computer: its weekly summaries are read where its kitchen runs` };
  const resumes: ResumeWeekly[] = [];
  const unreadable: { weekStart: string; detail: string }[] = [];
  for (const weekStart of weeksARead(day, now)) {
    const rendered = await launch(readOne, `report --week ${weekStart}`);
    if (withoutTheWeek(rendered)) return { sans: "weekly summaries unavailable: this station's runtime does not give them yet — update it", detail: detailOf(rendered) };
    if (rendered.erreur !== null) {
      if (!WITHOUT_RESUME.test(rendered.erreurs)) unreadable.push({ weekStart, detail: detailOf(rendered) });
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(rendered.sortie);
    } catch {
      raw = null;
    }
    const resume = resumeRead(raw);
    if (resume === null) unreadable.push({ weekStart, detail: detailOf(rendered) });
    else resumes.push(resume);
  }
  return { resumes, illisibles: unreadable };
}

// Un tag de version : des lettres, des chiffres et . _ / + -, sans blanc ni apostrophe — ce qu'un tag git accepte et
// qu'une commande porte en un mot. Le runtime juge le reste : un tag absent du dépôt n'est pas publié.
const TAG = /^[A-Za-z0-9][A-Za-z0-9._/+-]{0,99}$/;
// La ligne d'erreur du runtime, sans son préfixe.
const lineOfRuntime = (text: string) => (text.trim().split("\n").at(-1) ?? "").replace(/^brigade ?: /, "").replaceAll("`", "");

// Publie le résumé comme les notes de la version `tag`, par la commande du runtime, là où la cuisine du projet tourne.
// L'enregistrement s'écrit dans un fichier provisoire, retiré après l'appel. Un seul appel, quoi qu'il rende.
export async function publishTheResume({
  projet: project,
  lu: readOne,
  resume,
  tag,
  lancer: launch,
  dossier: folder = () => mkdtemp(join(tmpdir(), "brigade-resume-")),
}: {
  projet: string;
  lu: Read | undefined;
  resume: ResumeWeekly;
  tag: unknown;
  lancer: (readOne: Read, command: string) => Promise<Rendered>;
  dossier?: () => Promise<string>;
}): Promise<RenderedOfThePublication> {
  const wanted = typeof tag === "string" ? tag.trim() : "";
  if (!TAG.test(wanted)) return { refus: "nothing was published: a version tag is made of letters, digits and . _ / + -" };
  if (readOne === undefined) return { refus: `nothing was published: ${project} does not cook on this computer — there is no runtime to publish it` };
  let or: string;
  try {
    or = await folder();
  } catch (error) {
    return { refus: "nothing was published: the summary could not be handed to the runtime", detail: message(error) };
  }
  const file = join(or, `${resume.weekStart}.json`);
  let rendered: Rendered;
  try {
    await writeFile(file, `${JSON.stringify(resume, null, 2)}\n`);
    rendered = await launch(readOne, `release-notes ${cite(wanted)} ${cite(file)}`);
  } catch (error) {
    return { refus: "nothing was published: the summary could not be handed to the runtime", detail: message(error) };
  } finally {
    await rm(or, { recursive: true, force: true }).catch(() => undefined);
  }
  if (withoutTheCommand(rendered)) return { refus: "nothing was published: this station's runtime cannot publish release notes yet — update it", detail: detailOf(rendered) };
  if (rendered.erreur !== null) {
    const line = lineOfRuntime(rendered.erreurs);
    return { refus: line === "" ? "nothing was published: the runtime did not say why" : line, detail: detailOf(rendered) };
  }
  const last = rendered.sortie.trim().split("\n").at(-1) ?? "";
  const already = /^release .+ already published: (https:\/\/\S+)/.exec(last);
  if (already !== null) return { dejaPubliee: `${wanted} already has its release notes — nothing was changed`, url: already[1] as string };
  const published = /^release .+ published: (https:\/\/\S+)/.exec(last);
  if (published !== null) return { publiee: `published as the release notes of ${wanted}`, url: published[1] as string };
  return { refus: "the runtime's answer could not be read: open the repository's releases to see if it was published", detail: detailOf(rendered) };
}
