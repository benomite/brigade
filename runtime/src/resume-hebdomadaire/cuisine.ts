// Le résumé hebdomadaire dans la cuisine d'un projet (#3261) : branché sur le
// tick du runtime, comme les tickets récurrents (`recurrents/planificateur.ts`).
// Au jour réglé (`weeklySummaryDay`, lundi par défaut, `jour.ts`), une fois par
// semaine :
//   1. les tickets servis de la semaine se lisent sur GitHub — les issues
//      fermées dans la semaine que ferme une PR mergée (`prQuiFerme`), leur
//      épique, et pour les chiffres d'autonomie (#3222) leurs événements et
//      leurs commentaires — ; ce qui attend le chef, dans la file que le
//      journal tient (`cartesAMentionner`, celle de la mention du chef) ;
//   2. le résumé (`resume.ts`) s'écrit dans l'état du projet,
//      `<BRIGADE_STATE_DIR>/resume-hebdomadaire/<weekStart>.json`, d'où
//      `lireLeResume` le rend par projet et par semaine ;
//   3. le chef en est notifié par le canal des cartes de TODO (#2746) : une
//      mention sur GitHub, que GitHub Mobile notifie. Le résumé n'a pas de
//      ticket où la poser : une issue la porte, avec le résumé pour corps,
//      fermée aussitôt — la mention part, la cuisine ne la prend pas pour un
//      ticket. Le chef est celui que résout `chef/chef.ts`.
//
// Une lecture de GitHub qui échoue n'écrit rien : le passage suivant réessaie,
// dix minutes plus tard, le même jour. Un résumé écrit et pas encore notifié
// (pas de chef résolu, une écriture refusée) n'est que renotifié. Un fichier de
// résumé illisible n'est pas réécrit. Un `weeklySummaryDay` qui n'est pas un
// jour ne produit rien. Chaque cas se dit sur le journal de service.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chiffresDAutonomie, type ChiffresDAutonomie, type DonneesDuDepot } from "../autonomie/chiffres/chiffres.ts";
import type { Base } from "../base.ts";
import { epiqueDe } from "../epique.ts";
import type { GitHub } from "../github.ts";
import { cartesAMentionner } from "../mention-du-chef/mention-du-chef.ts";
import type { Runtime } from "../runtime.ts";
import { jourDuResume, semaineAResumer } from "./jour.ts";
import { resumeDeLaSemaine, type Attente, type ResumeHebdomadaire, type TicketServi } from "./resume.ts";

export const DOSSIER_DES_RESUMES = "resume-hebdomadaire";
// Après un passage raté, le suivant attend ce délai : un tick par minute ne
// relit pas toute la semaine sur GitHub à chaque fois.
const RELANCE_MS = 10 * 60_000;

// Ce qui est gardé d'une semaine : le résumé, et s'il a été notifié au chef.
type Garde = { record: ResumeHebdomadaire; notified: boolean };

export const fichierDuResume = (repertoireEtat: string, weekStart: string) => join(repertoireEtat, DOSSIER_DES_RESUMES, `${weekStart}.json`);

// Ce qui est gardé de la semaine, null s'il n'y a rien. Un fichier illisible lève.
function lireLaGarde(repertoireEtat: string, weekStart: string): Garde | null {
  let brut: string;
  try {
    brut = readFileSync(fichierDuResume(repertoireEtat, weekStart), "utf8");
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw erreur;
  }
  const lu = JSON.parse(brut) as Partial<Garde> | null;
  const record = lu?.record;
  if (typeof record !== "object" || record === null || typeof record.project !== "string" || typeof record.markdown !== "string" || !Array.isArray(record.themes) || !Array.isArray(record.waiting)) {
    throw new Error(`${fichierDuResume(repertoireEtat, weekStart)} is not a weekly summary`);
  }
  return { record, notified: lu?.notified === true };
}

function ecrireLaGarde(repertoireEtat: string, garde: Garde): void {
  const fichier = fichierDuResume(repertoireEtat, garde.record.weekStart);
  mkdirSync(join(repertoireEtat, DOSSIER_DES_RESUMES), { recursive: true });
  const provisoire = `${fichier}.${process.pid}.tmp`;
  writeFileSync(provisoire, `${JSON.stringify(garde, null, 2)}\n`);
  renameSync(provisoire, fichier);
}

// Le résumé d'un projet pour la semaine qui commence à `weekStart`
// (AAAA-MM-JJ), null s'il n'a pas été produit. Un fichier illisible lève.
export function lireLeResume(repertoireEtat: string, projet: string, weekStart: string): ResumeHebdomadaire | null {
  const garde = lireLaGarde(repertoireEtat, weekStart);
  return garde !== null && garde.record.project === projet ? garde.record : null;
}

export type GitHubDuResume = Pick<GitHub, "issuesDepuis" | "prQuiFerme" | "issue" | "commentaires" | "evenements" | "creerIssue" | "fermerIssue">;

const adresseDuTicket = (depot: string, ticket: number) => `https://github.com/${depot}/issues/${ticket}`;

// Les tickets servis entre `debut` (inclus) et `fin` (exclue), et les chiffres
// d'autonomie de la même semaine — nuls si le client ne lit pas les
// événements d'une issue.
async function lireLaSemaine(github: GitHubDuResume, depot: string, debut: Date, fin: Date): Promise<{ servis: TicketServi[]; autonomie: ChiffresDAutonomie | null }> {
  const dans = (instant: string | undefined) => {
    const le = instant === undefined ? Number.NaN : Date.parse(instant);
    return le >= debut.getTime() && le < fin.getTime();
  };
  const fermees = (await github.issuesDepuis(debut.toISOString())).filter((issue) => issue.pr !== true && issue.state === "closed" && dans(issue.closedAt));
  const epiques = new Map<number, string | null>();
  const servis: (TicketServi & { livre: string })[] = [];
  for (const issue of fermees) {
    const pr = await github.prQuiFerme(issue.number);
    if (pr?.merged !== true) continue;
    const numero = epiqueDe(issue.body);
    if (numero !== null && !epiques.has(numero)) epiques.set(numero, (await github.issue(numero))?.title ?? null);
    const titre = numero === null ? null : (epiques.get(numero) ?? null);
    servis.push({ number: issue.number, title: issue.title, url: issue.url || adresseDuTicket(depot, issue.number), labels: issue.labels, epic: numero === null || titre === null ? null : { number: numero, title: titre }, livre: issue.closedAt ?? "" });
  }
  if (github.evenements === undefined) return { servis, autonomie: null };
  const issues: Record<number, { evenements: unknown[]; commentaires: unknown[] }> = {};
  for (const servi of servis) {
    const commentaires = (await github.commentaires(servi.number)).map(({ body, association, createdAt }) => ({ body, author_association: association, created_at: createdAt }));
    issues[servi.number] = { evenements: await github.evenements(servi.number), commentaires };
  }
  const donnees: DonneesDuDepot = { depot, servis: servis.map(({ number, title, url, livre }) => ({ ticket: number, titre: title, url, livre })), issues };
  return { servis: servis.map(({ livre: _livre, ...servi }) => servi), autonomie: chiffresDAutonomie([donnees], 7, fin) };
}

// Ce qui attend le chef : une carte par ticket de sa file.
function attentesDuChef(base: Base, depot: string, maintenant: Date): Attente[] {
  return cartesAMentionner(base, maintenant).map(({ ticket, ligne }) => ({ ticket, ligne, url: adresseDuTicket(depot, ticket) }));
}

// Ce qui porte le résumé jusqu'au téléphone du chef.
export type Notifieur = { notifier(resume: ResumeHebdomadaire): Promise<void> };

const marqueDuResume = ({ project, weekStart }: Pick<ResumeHebdomadaire, "project" | "weekStart">) => `<!-- brigade:weekly-summary project=${project} week=${weekStart} -->`;

// La mention du chef sur GitHub, que GitHub Mobile notifie (#2746) : une issue
// fermée aussitôt, le résumé pour corps. Sans chef résolu, lève.
export function notifieurParMention(github: Pick<GitHub, "creerIssue" | "fermerIssue">, chef: () => string | null | Promise<string | null>): Notifieur {
  return {
    async notifier(resume) {
      const login = (await chef())?.trim();
      if (!login) throw new Error("no chef resolved (`status` says why): set `chef` to the chef's GitHub login in `.claude/brigade/projet.json`");
      const numero = await github.creerIssue({
        titre: `Weekly kitchen summary — ${resume.project}, ${resume.weekStart} to ${resume.weekEnd}`,
        corps: `${marqueDuResume(resume)}\n@${login} here is what the kitchen served this week.\n\n${resume.markdown}`,
        labels: [],
      });
      await github.fermerIssue(numero);
    },
  };
}

export type OptionsDuResume = {
  projet: string;
  // `owner/name` : l'adresse des tickets de la file du chef.
  depot: string;
  repertoireEtat: string;
  github: GitHubDuResume;
  base: Base;
  // La configuration du projet, relue à chaque passage : son `weeklySummaryDay`.
  reglages: () => unknown;
  notifieur: Notifieur;
  avertir: (ligne: string) => void;
  maintenant?: () => Date;
};

export type Passage = "pas-le-jour" | "deja-notifie" | "notifie" | "echec";

const uneLigne = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur)).split("\n")[0] ?? "";

// Un passage : rien hors du jour réglé ; ce jour-là, le résumé de la semaine
// écrit s'il ne l'est pas, puis notifié s'il ne l'est pas.
export async function passerLeResume({ projet, depot, repertoireEtat, github, base, reglages, notifieur, avertir, maintenant = () => new Date() }: OptionsDuResume): Promise<Passage> {
  const instant = maintenant();
  let semaine;
  try {
    semaine = semaineAResumer(instant, jourDuResume(reglages()));
  } catch (erreur) {
    avertir(`weekly summary — not produced: ${uneLigne(erreur)}`);
    return "echec";
  }
  if (semaine === null) return "pas-le-jour";
  const { weekStart, weekEnd, debut, fin } = semaine;
  let garde: Garde | null;
  try {
    garde = lireLaGarde(repertoireEtat, weekStart);
  } catch (erreur) {
    avertir(`weekly summary of ${weekStart} — its file does not read, left as is: ${uneLigne(erreur)}`);
    return "echec";
  }
  if (garde?.notified === true) return "deja-notifie";
  if (garde === null) {
    try {
      const { servis, autonomie } = await lireLaSemaine(github, depot, debut, fin);
      garde = { record: resumeDeLaSemaine({ project: projet, weekStart, weekEnd, servis, autonomie, attentes: attentesDuChef(base, depot, instant) }), notified: false };
      ecrireLaGarde(repertoireEtat, garde);
    } catch (erreur) {
      avertir(`weekly summary of ${weekStart} — not produced, retried later today: ${uneLigne(erreur)}`);
      return "echec";
    }
  }
  try {
    await notifieur.notifier(garde.record);
  } catch (erreur) {
    avertir(`weekly summary of ${weekStart} — written, the chef not notified, retried later today: ${uneLigne(erreur)}`);
    return "echec";
  }
  try {
    ecrireLaGarde(repertoireEtat, { ...garde, notified: true });
  } catch (erreur) {
    avertir(`weekly summary of ${weekStart} — the chef notified, not recorded as such: ${uneLigne(erreur)}`);
    return "echec";
  }
  avertir(`weekly summary of ${weekStart} — written and sent to the chef`);
  return "notifie";
}

export type OptionsDuBranchement = Omit<OptionsDuResume, "base" | "notifieur"> & {
  // Le compte du chef, résolu à chaque notification (`chef/chef.ts`).
  chef: () => string | null | Promise<string | null>;
  notifieur?: Notifieur;
};

// Le résumé, à chaque tick du runtime : un passage à la fois, et après un
// passage raté, pas d'autre avant `RELANCE_MS`.
export function brancherResumeHebdomadaire<R extends Runtime>(runtime: R, { chef, notifieur, ...options }: OptionsDuBranchement): R {
  const maintenant = options.maintenant ?? (() => new Date());
  const complet: OptionsDuResume = { ...options, base: runtime.journal.base, notifieur: notifieur ?? notifieurParMention(options.github, chef), maintenant };
  let enCours = false;
  let pasAvant = 0;
  runtime.surReveil((cause) => {
    if (cause !== "tick" || enCours || maintenant().getTime() < pasAvant) return;
    enCours = true;
    void passerLeResume(complet)
      .then((passage) => {
        if (passage === "echec") pasAvant = maintenant().getTime() + RELANCE_MS;
      })
      .finally(() => {
        enCours = false;
      });
  });
  return runtime;
}
