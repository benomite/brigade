// Le résumé hebdomadaire de la cuisine, dans l'app (ticket 3263, épique 3251) : ce que le process principal lit et fait pour
// la page des résumés (resume-weekly.js).
//   - Le jour du résumé : `weeklySummaryDay` de `.claude/brigade/projet.json`, lu sur la branche d'intégration du dépôt,
//     et changé par une pull request vers elle — comme un plafond de durée (caps-duree.ts), dont ce module reprend la
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
import { cite, type Lu, type Rendu } from "../../box.ts";
import { FICHIER, lireLeFichier, proposerLeFichier, texteDuFichier, type FichierLu } from "../../caps-duree.ts";
import type { ClientDeLaPriority } from "../../priority.ts";
import { detailDe, sansLaCommand } from "../../settings-du-project.ts";

export { JOURS_DU_RESUME, JOUR_PAR_DEFAUT, type JourDuResume };

// Le nombre de semaines dont l'app cherche le résumé, la plus récente d'abord.
export const SEMAINES = 6;
const DAY_MS = 24 * 3600 * 1000;

export type LineDuResume = { text: string; ticketNumber: number; ticketUrl: string };
export type Autonomy = { tickets: number; servedWithoutHuman: number; shareWithoutHuman: number | null; medianLeadTimeMs: number | null; sentBack: number; shareSentBack: number | null };
// L'enregistrement d'un résumé, tel que le runtime l'écrit (runtime/src/resume-hebdomadaire/resume.ts).
export type ResumeWeekly = {
  project: string;
  weekStart: string;
  weekEnd: string;
  themes: { title: string; lines: LineDuResume[] }[];
  autonomy?: Autonomy;
  waiting: LineDuResume[];
  markdown: string;
};

// Le jour réglé : sa valeur, et s'il est écrit dans le fichier — ou pourquoi il ne se lit pas.
export type ReadDuDay = { jour: JourDuResume; pose: boolean } | { sans: string; detail?: string };
// Les résumés trouvés, le plus récent d'abord, et les semaines dont le résumé ne se lit pas — ou pourquoi aucun ne se lit.
export type ReadDesResumes = { resumes: ResumeWeekly[]; illisibles: { weekStart: string; detail: string }[] } | { sans: string; detail?: string };
// Ce que la page reçoit d'un projet.
export type ResumesDuProject = { projet: string; jour: ReadDuDay; resumes: ReadDesResumes };
// Ce que le changement du jour a rendu : la PR qui le propose, le jour déjà là, ou pourquoi rien n'a changé.
export type RenduDuDay = { pr: string; numero: number; jour: JourDuResume } | { fait: string } | { refus: string; detail?: string };
// Ce que la publication a rendu : la release publiée, celle qui l'était déjà, ou pourquoi rien n'est publié.
export type RenduDeLaPublication = { publiee: string; url: string } | { dejaPubliee: string; url: string } | { refus: string; detail?: string };

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const date = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Les semaines dont le résumé a pu s'écrire à `maintenant` : celles qui commencent au jour réglé, et dont le jour du
// résumé — sept jours après leur début — est passé ou est aujourd'hui (UTC, comme le runtime). La plus récente d'abord.
export function semainesALire(day: JourDuResume, maintenant: Date, nombre = SEMAINES): string[] {
  const aujourdhui = Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate());
  let dernier = aujourdhui;
  while (jourDe(new Date(dernier)) !== day) dernier -= DAY_MS;
  return Array.from({ length: nombre }, (_, rang) => date(dernier - (rang + 1) * 7 * DAY_MS));
}

// Le jour du résumé, sur la branche d'intégration du dépôt (null : celle par défaut de GitHub). Un fichier absent, ou
// qui ne le dit pas : lundi. Un réglage qui n'est pas un jour ne se lit pas — il ne vaut pas lundi à la place du chef.
export async function lireLeDay({ depot: repository, branche: branch, client }: { depot: string; branche: string | null; client: ClientDeLaPriority }): Promise<ReadDuDay> {
  let contenu: Record<string, unknown> | null;
  try {
    ({ contenu } = await lireLeFichier(client, repository, branch));
  } catch (error) {
    return { sans: "summary day unavailable", detail: message(error) };
  }
  try {
    return { jour: jourDuResume(contenu), pose: contenu !== null && contenu.weeklySummaryDay !== undefined };
  } catch (error) {
    return { sans: "summary day unavailable", detail: `${FICHIER}: ${message(error)}` };
  }
}

// Change le jour dans le dépôt : le fichier relu, la seule clé `weeklySummaryDay` posée, le reste gardé tel quel, puis
// proposé par une pull request vers la branche d'intégration. Sans fichier, il est créé avec ce que le runtime exige
// d'un fichier — seulement quand la branche est connue.
export async function changerLeDay({ depot: repository, branche: branch, jour: day, client }: { depot: string; branche: string | null; jour: unknown; client: ClientDeLaPriority }): Promise<RenduDuDay> {
  if (typeof day !== "string" || !(JOURS_DU_RESUME as readonly string[]).includes(day)) return { refus: `nothing was changed: the summary day is one of ${JOURS_DU_RESUME.join(", ")}` };
  const voulu = day as JourDuResume;
  let lu: FichierLu;
  try {
    lu = await lireLeFichier(client, repository, branch);
  } catch (error) {
    return { refus: `nothing was changed: ${FICHIER} was not read on GitHub`, detail: message(error) };
  }
  if (lu.contenu === null && branch === null) return { refus: `nothing was changed: ${repository} has no ${FICHIER} and its integration branch is not known` };
  const contenu: Record<string, unknown> = lu.contenu ?? { version: 1, integrationBranch: branch };
  if (contenu.weeklySummaryDay === voulu) return { fait: "unchanged: the repository already says so" };
  contenu.weeklySummaryDay = voulu;
  try {
    const ouverte = await proposerLeFichier(client, repository, branch, { texte: texteDuFichier(contenu), sha: lu.sha, dit: `set weeklySummaryDay to ${voulu}`, ou: "Weekly summary" });
    return { ...ouverte, jour: voulu };
  } catch (error) {
    return { refus: `nothing was proposed: GitHub did not open the pull request of ${FICHIER}`, detail: message(error) };
  }
}

const estLine = (line: unknown): line is LineDuResume =>
  estObjet(line) && typeof line.text === "string" && Number.isSafeInteger(line.ticketNumber) && typeof line.ticketUrl === "string" && URL.parse(line.ticketUrl)?.protocol === "https:";
const nombreOuNul = (valeur: unknown) => valeur === null || typeof valeur === "number";
const estAutonomy = (valeur: unknown): valeur is Autonomy =>
  estObjet(valeur) &&
  typeof valeur.tickets === "number" &&
  typeof valeur.servedWithoutHuman === "number" &&
  typeof valeur.sentBack === "number" &&
  nombreOuNul(valeur.shareWithoutHuman) &&
  nombreOuNul(valeur.medianLeadTimeMs) &&
  nombreOuNul(valeur.shareSentBack);

// L'enregistrement d'un résumé, s'il en a la forme ; null sinon. Rien n'y est complété.
export function resumeLu(valeur: unknown): ResumeWeekly | null {
  if (!estObjet(valeur)) return null;
  const { project, weekStart, weekEnd, themes, autonomy, waiting, markdown } = valeur;
  if (typeof project !== "string" || typeof weekStart !== "string" || !DATE.test(weekStart) || typeof weekEnd !== "string" || typeof markdown !== "string") return null;
  if (!Array.isArray(themes) || !themes.every((theme) => estObjet(theme) && typeof theme.title === "string" && Array.isArray(theme.lines) && theme.lines.every(estLine))) return null;
  if (!Array.isArray(waiting) || !waiting.every(estLine)) return null;
  if (autonomy !== undefined && !estAutonomy(autonomy)) return null;
  return { project, weekStart, weekEnd, themes: themes as ResumeWeekly["themes"], ...(autonomy === undefined ? {} : { autonomy }), waiting: waiting as LineDuResume[], markdown };
}

// Ce que `report` écrit pour la semaine qui n'a pas de résumé (runtime/src/rapport-cli.ts).
const SANS_RESUME = /no weekly summary of /;
// Un runtime d'avant le ticket 3261 ne connaît pas `--week` : il refuse l'appel en code 2, son usage sans lui.
const sansLaSemaine = (rendu: Rendu) => sansLaCommand(rendu) || (rendu.erreur?.code === 2 && !rendu.erreurs.includes("--week"));

// Les résumés d'un projet, là où sa cuisine tourne : une lecture par semaine, la plus récente d'abord. Une semaine sans
// résumé n'est pas une erreur ; une semaine dont le résumé ne se lit pas est nommée, avec ce que le runtime a dit.
export async function lireLesResumes({ projet: project, lu, jour: day, lancer, maintenant }: { projet: string; lu: Lu | undefined; jour: JourDuResume; lancer: (lu: Lu, command: string) => Promise<Rendu>; maintenant: Date }): Promise<ReadDesResumes> {
  if (lu === undefined) return { sans: `${project} does not cook on this computer: its weekly summaries are read where its kitchen runs` };
  const resumes: ResumeWeekly[] = [];
  const illisibles: { weekStart: string; detail: string }[] = [];
  for (const weekStart of semainesALire(day, maintenant)) {
    const rendu = await lancer(lu, `report --week ${weekStart}`);
    if (sansLaSemaine(rendu)) return { sans: "weekly summaries unavailable: this station's runtime does not give them yet — update it", detail: detailDe(rendu) };
    if (rendu.erreur !== null) {
      if (!SANS_RESUME.test(rendu.erreurs)) illisibles.push({ weekStart, detail: detailDe(rendu) });
      continue;
    }
    let brut: unknown;
    try {
      brut = JSON.parse(rendu.sortie);
    } catch {
      brut = null;
    }
    const resume = resumeLu(brut);
    if (resume === null) illisibles.push({ weekStart, detail: detailDe(rendu) });
    else resumes.push(resume);
  }
  return { resumes, illisibles };
}

// Un tag de version : des lettres, des chiffres et . _ / + -, sans blanc ni apostrophe — ce qu'un tag git accepte et
// qu'une commande porte en un mot. Le runtime juge le reste : un tag absent du dépôt n'est pas publié.
const TAG = /^[A-Za-z0-9][A-Za-z0-9._/+-]{0,99}$/;
// La ligne d'erreur du runtime, sans son préfixe.
const lineDuRuntime = (texte: string) => (texte.trim().split("\n").at(-1) ?? "").replace(/^brigade ?: /, "").replaceAll("`", "");

// Publie le résumé comme les notes de la version `tag`, par la commande du runtime, là où la cuisine du projet tourne.
// L'enregistrement s'écrit dans un fichier provisoire, retiré après l'appel. Un seul appel, quoi qu'il rende.
export async function publierLeResume({
  projet: project,
  lu,
  resume,
  tag,
  lancer,
  dossier = () => mkdtemp(join(tmpdir(), "brigade-resume-")),
}: {
  projet: string;
  lu: Lu | undefined;
  resume: ResumeWeekly;
  tag: unknown;
  lancer: (lu: Lu, command: string) => Promise<Rendu>;
  dossier?: () => Promise<string>;
}): Promise<RenduDeLaPublication> {
  const voulu = typeof tag === "string" ? tag.trim() : "";
  if (!TAG.test(voulu)) return { refus: "nothing was published: a version tag is made of letters, digits and . _ / + -" };
  if (lu === undefined) return { refus: `nothing was published: ${project} does not cook on this computer — there is no runtime to publish it` };
  let ou: string;
  try {
    ou = await dossier();
  } catch (error) {
    return { refus: "nothing was published: the summary could not be handed to the runtime", detail: message(error) };
  }
  const fichier = join(ou, `${resume.weekStart}.json`);
  let rendu: Rendu;
  try {
    await writeFile(fichier, `${JSON.stringify(resume, null, 2)}\n`);
    rendu = await lancer(lu, `release-notes ${cite(voulu)} ${cite(fichier)}`);
  } catch (error) {
    return { refus: "nothing was published: the summary could not be handed to the runtime", detail: message(error) };
  } finally {
    await rm(ou, { recursive: true, force: true }).catch(() => undefined);
  }
  if (sansLaCommand(rendu)) return { refus: "nothing was published: this station's runtime cannot publish release notes yet — update it", detail: detailDe(rendu) };
  if (rendu.erreur !== null) {
    const line = lineDuRuntime(rendu.erreurs);
    return { refus: line === "" ? "nothing was published: the runtime did not say why" : line, detail: detailDe(rendu) };
  }
  const derniere = rendu.sortie.trim().split("\n").at(-1) ?? "";
  const deja = /^release .+ already published: (https:\/\/\S+)/.exec(derniere);
  if (deja !== null) return { dejaPubliee: `${voulu} already has its release notes — nothing was changed`, url: deja[1] as string };
  const publiee = /^release .+ published: (https:\/\/\S+)/.exec(derniere);
  if (publiee !== null) return { publiee: `published as the release notes of ${voulu}`, url: publiee[1] as string };
  return { refus: "the runtime's answer could not be read: open the repository's releases to see if it was published", detail: detailDe(rendu) };
}
