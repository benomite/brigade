// Le résumé hebdomadaire de la cuisine, dans l'app (ticket 3263, épique 3251) : ce que le process principal lit et fait pour
// la page des résumés (resume-hebdomadaire.js).
//   - Le jour du résumé : `weeklySummaryDay` de `.claude/brigade/projet.json`, lu sur la branche d'intégration du dépôt,
//     et changé par une pull request vers elle — comme un plafond de durée (plafonds-duree.ts), dont ce module reprend la
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
import { FICHIER, lireLeFichier, proposerLeFichier, texteDuFichier, type FichierLu } from "../../plafonds-duree.ts";
import type { ClientDeLaPriorite } from "../../priorite.ts";
import { detailDe, sansLaCommande } from "../../reglages-du-projet.ts";

export { JOURS_DU_RESUME, JOUR_PAR_DEFAUT, type JourDuResume };

// Le nombre de semaines dont l'app cherche le résumé, la plus récente d'abord.
export const SEMAINES = 6;
const JOUR_MS = 24 * 3600 * 1000;

export type LigneDuResume = { text: string; ticketNumber: number; ticketUrl: string };
export type Autonomie = { tickets: number; servedWithoutHuman: number; shareWithoutHuman: number | null; medianLeadTimeMs: number | null; sentBack: number; shareSentBack: number | null };
// L'enregistrement d'un résumé, tel que le runtime l'écrit (runtime/src/resume-hebdomadaire/resume.ts).
export type ResumeHebdomadaire = {
  project: string;
  weekStart: string;
  weekEnd: string;
  themes: { title: string; lines: LigneDuResume[] }[];
  autonomy?: Autonomie;
  waiting: LigneDuResume[];
  markdown: string;
};

// Le jour réglé : sa valeur, et s'il est écrit dans le fichier — ou pourquoi il ne se lit pas.
export type LectureDuJour = { jour: JourDuResume; pose: boolean } | { sans: string; detail?: string };
// Les résumés trouvés, le plus récent d'abord, et les semaines dont le résumé ne se lit pas — ou pourquoi aucun ne se lit.
export type LectureDesResumes = { resumes: ResumeHebdomadaire[]; illisibles: { weekStart: string; detail: string }[] } | { sans: string; detail?: string };
// Ce que la page reçoit d'un projet.
export type ResumesDuProjet = { projet: string; jour: LectureDuJour; resumes: LectureDesResumes };
// Ce que le changement du jour a rendu : la PR qui le propose, le jour déjà là, ou pourquoi rien n'a changé.
export type RenduDuJour = { pr: string; numero: number; jour: JourDuResume } | { fait: string } | { refus: string; detail?: string };
// Ce que la publication a rendu : la release publiée, celle qui l'était déjà, ou pourquoi rien n'est publié.
export type RenduDeLaPublication = { publiee: string; url: string } | { dejaPubliee: string; url: string } | { refus: string; detail?: string };

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const date = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Les semaines dont le résumé a pu s'écrire à `maintenant` : celles qui commencent au jour réglé, et dont le jour du
// résumé — sept jours après leur début — est passé ou est aujourd'hui (UTC, comme le runtime). La plus récente d'abord.
export function semainesALire(jour: JourDuResume, maintenant: Date, nombre = SEMAINES): string[] {
  const aujourdhui = Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate());
  let dernier = aujourdhui;
  while (jourDe(new Date(dernier)) !== jour) dernier -= JOUR_MS;
  return Array.from({ length: nombre }, (_, rang) => date(dernier - (rang + 1) * 7 * JOUR_MS));
}

// Le jour du résumé, sur la branche d'intégration du dépôt (null : celle par défaut de GitHub). Un fichier absent, ou
// qui ne le dit pas : lundi. Un réglage qui n'est pas un jour ne se lit pas — il ne vaut pas lundi à la place du chef.
export async function lireLeJour({ depot, branche, client }: { depot: string; branche: string | null; client: ClientDeLaPriorite }): Promise<LectureDuJour> {
  let contenu: Record<string, unknown> | null;
  try {
    ({ contenu } = await lireLeFichier(client, depot, branche));
  } catch (erreur) {
    return { sans: "summary day unavailable", detail: message(erreur) };
  }
  try {
    return { jour: jourDuResume(contenu), pose: contenu !== null && contenu.weeklySummaryDay !== undefined };
  } catch (erreur) {
    return { sans: "summary day unavailable", detail: `${FICHIER}: ${message(erreur)}` };
  }
}

// Change le jour dans le dépôt : le fichier relu, la seule clé `weeklySummaryDay` posée, le reste gardé tel quel, puis
// proposé par une pull request vers la branche d'intégration. Sans fichier, il est créé avec ce que le runtime exige
// d'un fichier — seulement quand la branche est connue.
export async function changerLeJour({ depot, branche, jour, client }: { depot: string; branche: string | null; jour: unknown; client: ClientDeLaPriorite }): Promise<RenduDuJour> {
  if (typeof jour !== "string" || !(JOURS_DU_RESUME as readonly string[]).includes(jour)) return { refus: `nothing was changed: the summary day is one of ${JOURS_DU_RESUME.join(", ")}` };
  const voulu = jour as JourDuResume;
  let lu: FichierLu;
  try {
    lu = await lireLeFichier(client, depot, branche);
  } catch (erreur) {
    return { refus: `nothing was changed: ${FICHIER} was not read on GitHub`, detail: message(erreur) };
  }
  if (lu.contenu === null && branche === null) return { refus: `nothing was changed: ${depot} has no ${FICHIER} and its integration branch is not known` };
  const contenu: Record<string, unknown> = lu.contenu ?? { version: 1, integrationBranch: branche };
  if (contenu.weeklySummaryDay === voulu) return { fait: "unchanged: the repository already says so" };
  contenu.weeklySummaryDay = voulu;
  try {
    const ouverte = await proposerLeFichier(client, depot, branche, { texte: texteDuFichier(contenu), sha: lu.sha, dit: `set weeklySummaryDay to ${voulu}`, ou: "Weekly summary" });
    return { ...ouverte, jour: voulu };
  } catch (erreur) {
    return { refus: `nothing was proposed: GitHub did not open the pull request of ${FICHIER}`, detail: message(erreur) };
  }
}

const estLigne = (ligne: unknown): ligne is LigneDuResume =>
  estObjet(ligne) && typeof ligne.text === "string" && Number.isSafeInteger(ligne.ticketNumber) && typeof ligne.ticketUrl === "string" && URL.parse(ligne.ticketUrl)?.protocol === "https:";
const nombreOuNul = (valeur: unknown) => valeur === null || typeof valeur === "number";
const estAutonomie = (valeur: unknown): valeur is Autonomie =>
  estObjet(valeur) &&
  typeof valeur.tickets === "number" &&
  typeof valeur.servedWithoutHuman === "number" &&
  typeof valeur.sentBack === "number" &&
  nombreOuNul(valeur.shareWithoutHuman) &&
  nombreOuNul(valeur.medianLeadTimeMs) &&
  nombreOuNul(valeur.shareSentBack);

// L'enregistrement d'un résumé, s'il en a la forme ; null sinon. Rien n'y est complété.
export function resumeLu(valeur: unknown): ResumeHebdomadaire | null {
  if (!estObjet(valeur)) return null;
  const { project, weekStart, weekEnd, themes, autonomy, waiting, markdown } = valeur;
  if (typeof project !== "string" || typeof weekStart !== "string" || !DATE.test(weekStart) || typeof weekEnd !== "string" || typeof markdown !== "string") return null;
  if (!Array.isArray(themes) || !themes.every((theme) => estObjet(theme) && typeof theme.title === "string" && Array.isArray(theme.lines) && theme.lines.every(estLigne))) return null;
  if (!Array.isArray(waiting) || !waiting.every(estLigne)) return null;
  if (autonomy !== undefined && !estAutonomie(autonomy)) return null;
  return { project, weekStart, weekEnd, themes: themes as ResumeHebdomadaire["themes"], ...(autonomy === undefined ? {} : { autonomy }), waiting: waiting as LigneDuResume[], markdown };
}

// Ce que `report` écrit pour la semaine qui n'a pas de résumé (runtime/src/rapport-cli.ts).
const SANS_RESUME = /no weekly summary of /;
// Un runtime d'avant le ticket 3261 ne connaît pas `--week` : il refuse l'appel en code 2, son usage sans lui.
const sansLaSemaine = (rendu: Rendu) => sansLaCommande(rendu) || (rendu.erreur?.code === 2 && !rendu.erreurs.includes("--week"));

// Les résumés d'un projet, là où sa cuisine tourne : une lecture par semaine, la plus récente d'abord. Une semaine sans
// résumé n'est pas une erreur ; une semaine dont le résumé ne se lit pas est nommée, avec ce que le runtime a dit.
export async function lireLesResumes({ projet, lu, jour, lancer, maintenant }: { projet: string; lu: Lu | undefined; jour: JourDuResume; lancer: (lu: Lu, commande: string) => Promise<Rendu>; maintenant: Date }): Promise<LectureDesResumes> {
  if (lu === undefined) return { sans: `${projet} does not cook on this computer: its weekly summaries are read where its kitchen runs` };
  const resumes: ResumeHebdomadaire[] = [];
  const illisibles: { weekStart: string; detail: string }[] = [];
  for (const weekStart of semainesALire(jour, maintenant)) {
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
const ligneDuRuntime = (texte: string) => (texte.trim().split("\n").at(-1) ?? "").replace(/^brigade ?: /, "").replaceAll("`", "");

// Publie le résumé comme les notes de la version `tag`, par la commande du runtime, là où la cuisine du projet tourne.
// L'enregistrement s'écrit dans un fichier provisoire, retiré après l'appel. Un seul appel, quoi qu'il rende.
export async function publierLeResume({
  projet,
  lu,
  resume,
  tag,
  lancer,
  dossier = () => mkdtemp(join(tmpdir(), "brigade-resume-")),
}: {
  projet: string;
  lu: Lu | undefined;
  resume: ResumeHebdomadaire;
  tag: unknown;
  lancer: (lu: Lu, commande: string) => Promise<Rendu>;
  dossier?: () => Promise<string>;
}): Promise<RenduDeLaPublication> {
  const voulu = typeof tag === "string" ? tag.trim() : "";
  if (!TAG.test(voulu)) return { refus: "nothing was published: a version tag is made of letters, digits and . _ / + -" };
  if (lu === undefined) return { refus: `nothing was published: ${projet} does not cook on this computer — there is no runtime to publish it` };
  let ou: string;
  try {
    ou = await dossier();
  } catch (erreur) {
    return { refus: "nothing was published: the summary could not be handed to the runtime", detail: message(erreur) };
  }
  const fichier = join(ou, `${resume.weekStart}.json`);
  let rendu: Rendu;
  try {
    await writeFile(fichier, `${JSON.stringify(resume, null, 2)}\n`);
    rendu = await lancer(lu, `release-notes ${cite(voulu)} ${cite(fichier)}`);
  } catch (erreur) {
    return { refus: "nothing was published: the summary could not be handed to the runtime", detail: message(erreur) };
  } finally {
    await rm(ou, { recursive: true, force: true }).catch(() => undefined);
  }
  if (sansLaCommande(rendu)) return { refus: "nothing was published: this station's runtime cannot publish release notes yet — update it", detail: detailDe(rendu) };
  if (rendu.erreur !== null) {
    const ligne = ligneDuRuntime(rendu.erreurs);
    return { refus: ligne === "" ? "nothing was published: the runtime did not say why" : ligne, detail: detailDe(rendu) };
  }
  const derniere = rendu.sortie.trim().split("\n").at(-1) ?? "";
  const deja = /^release .+ already published: (https:\/\/\S+)/.exec(derniere);
  if (deja !== null) return { dejaPubliee: `${voulu} already has its release notes — nothing was changed`, url: deja[1] as string };
  const publiee = /^release .+ published: (https:\/\/\S+)/.exec(derniere);
  if (publiee !== null) return { publiee: `published as the release notes of ${voulu}`, url: publiee[1] as string };
  return { refus: "the runtime's answer could not be read: open the repository's releases to see if it was published", detail: detailDe(rendu) };
}
