// Le résumé hebdomadaire de la cuisine d'un projet (#3261, épique #3251) : ce
// que la cuisine a servi dans la semaine, écrit pour un product owner. Chaque
// ticket servi (mergé) devient une ligne — ce qu'un utilisateur peut faire
// désormais, ou ce qui a été corrigé —, rangée sous un thème : l'épique dont
// le ticket se réclame, sinon « Improvements » ou « Fixes ». Puis, s'il y en
// a, les chiffres d'autonomie de la semaine (#3222, épique #3213), et pour
// finir ce qui attend le chef.
//
// La réécriture suit une règle, sans modèle : le titre du ticket, débarrassé
// de ce qu'un product owner n'a pas à lire — préfixe de commit (`feat(#12):`),
// chemins et noms de fichiers, empreintes de commit, mention d'une PR —,
// précédé de « Fixed: » pour une correction. Chaque ligne porte le numéro et
// l'adresse de son ticket.
//
// La forme du résumé est partagée avec l'app et les notes de version :
// { project, weekStart, weekEnd, themes: [{ title, lines: [{ text,
// ticketNumber, ticketUrl }] }], autonomy?, waiting: [{ text, ticketNumber,
// ticketUrl }], markdown }. Fonctions pures : rien n'est lu ni écrit ici.
import type { ChiffresDAutonomie } from "../autonomie/chiffres/chiffres.ts";

export type LigneDuResume = { text: string; ticketNumber: number; ticketUrl: string };
export type Theme = { title: string; lines: LigneDuResume[] };
// Les chiffres d'autonomie de la semaine, sous les noms du résumé.
export type Autonomie = { tickets: number; servedWithoutHuman: number; shareWithoutHuman: number | null; medianLeadTimeMs: number | null; sentBack: number; shareSentBack: number | null };
export type ResumeHebdomadaire = {
  project: string;
  weekStart: string;
  weekEnd: string;
  themes: Theme[];
  autonomy?: Autonomie;
  waiting: LigneDuResume[];
  markdown: string;
};

// Un ticket servi dans la semaine, tel que GitHub le dit.
export type TicketServi = { number: number; title: string; url: string; labels: readonly string[]; epic: { number: number; title: string } | null };
// Une carte qui attend le chef : son ticket, sa question sur une ligne.
export type Attente = { ticket: number; ligne: string; url: string };

export const THEME_AMELIORATIONS = "Improvements";
export const THEME_CORRECTIONS = "Fixes";
export const TITRE_AUTONOMIE = "Autonomy";
export const TITRE_ATTENTE = "Waiting for the chef";

// Ce qu'un product owner n'a pas à lire, retiré d'un texte :
// - le préfixe d'un message de commit (`feat(#12):`, `fix:`) ;
// - un chemin (`runtime/src/x.ts`, `app/src/`) ou un nom de fichier (`main.ts`,
//   mais pas `Node.js`) ;
// - une empreinte de commit (7 à 40 signes hexadécimaux, chiffres et lettres) ;
// - « PR » et « pull request », remplacés par « change ».
const PREFIXE_DE_COMMIT = /^\s*[a-z]+(?:\([^)]*\))?!?:\s*/i;
// Un mot à barres obliques est un chemin s'il en a deux, commence ou finit
// par une, finit par une extension, ou porte un chiffre (`cook/12-github`) :
// « and/or » reste.
const AVEC_BARRE = /[\w.@~-]*(?:\/[\w.@~-]*)+/g;
const estUnChemin = (mot: string) => mot.split("/").length >= 3 || mot.startsWith("/") || mot.endsWith("/") || /\.[a-z0-9]{1,5}$/i.test(mot) || /\d/.test(mot);
const FICHIER = /\b[\w.-]+\.(?:ts|tsx|js|mjs|cjs|jsx|json|md|sh|ps1|py|java|kt|css|html|vue|ya?ml|toml|lock|txt|png|svg)\b/gi;
const EMPREINTE = /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/gi;
const PULL_REQUEST = /\bpull[- ]requests?\b|\bPRs?\b/gi;
// Ce qui est retiré y laisse ce signe, puis part avec la préposition qui
// l'introduit et la liste qu'il forme : « in docs/a.md and app/src/ » part entier.
const RETIRE = "\u0000";
const AVEC_CE_QUI_L_INTRODUIT = /(?:\b(?:in|into|from|to|of|at|under|on|see)\s+)?\u0000(?:\s*(?:,|\band\b|\bor\b)?\s*\u0000)*/gi;

export function pourUnProductOwner(texte: string): string {
  return texte
    .replace(PREFIXE_DE_COMMIT, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(AVEC_BARRE, (mot) => (estUnChemin(mot) ? RETIRE : mot))
    .replace(FICHIER, (mot) => (/^[A-Z][a-z]+\.js$/.test(mot) ? mot : RETIRE))
    .replace(EMPREINTE, RETIRE)
    .replace(AVEC_CE_QUI_L_INTRODUIT, "")
    .replace(PULL_REQUEST, (mot) => (/s$/i.test(mot) ? "changes" : "change"))
    .replace(/\(\s*[,;:]?\s*\)|\[\s*\]/g, "")
    .replace(/\s+([,.;:)])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/([,;:])(?:\s*[,;:])+/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:—–-]+|[\s,;:—–-]+$/g, "")
    .trim();
}

const majuscule = (texte: string) => texte.charAt(0).toUpperCase() + texte.slice(1);
const minuscule = (texte: string) => (/^[A-Z][a-z]/.test(texte) ? texte.charAt(0).toLowerCase() + texte.slice(1) : texte);

// Une correction : un label `bug`, ou un titre qui commence par fix/fixed/bug.
function estUneCorrection({ title, labels }: Pick<TicketServi, "title" | "labels">): boolean {
  return labels.some((label) => label.toLowerCase() === "bug") || /^\s*(?:fix(?:es|ed)?|bug(?:fix)?)\b/i.test(title);
}

// La ligne d'un ticket servi : ce qui a été corrigé, ou ce qu'on peut faire désormais.
function ligneDuTicket(ticket: TicketServi): LigneDuResume {
  const nettoye = pourUnProductOwner(ticket.title).replace(/^(?:fix(?:es|ed)?|bug(?:fix)?)\b[\s:—–-]*/i, "");
  const texte = nettoye === "" ? `Ticket #${ticket.number}` : nettoye;
  return { text: estUneCorrection(ticket) ? `Fixed: ${minuscule(texte)}` : majuscule(texte), ticketNumber: ticket.number, ticketUrl: ticket.url };
}

// Les thèmes de la semaine : une épique par thème, dans l'ordre de leurs
// numéros, puis les améliorations et les corrections sans épique. Chaque ligne
// dans l'ordre des tickets.
function themesDeLaSemaine(servis: readonly TicketServi[]): Theme[] {
  const tries = [...servis].sort((a, b) => a.number - b.number);
  const epiques = new Map<number, Theme>();
  const ameliorations: LigneDuResume[] = [];
  const corrections: LigneDuResume[] = [];
  for (const ticket of tries) {
    const ligne = ligneDuTicket(ticket);
    if (ticket.epic !== null) {
      const theme = epiques.get(ticket.epic.number) ?? { title: majuscule(pourUnProductOwner(ticket.epic.title)) || `Epic #${ticket.epic.number}`, lines: [] };
      theme.lines.push(ligne);
      epiques.set(ticket.epic.number, theme);
    } else (estUneCorrection(ticket) ? corrections : ameliorations).push(ligne);
  }
  const themes = [...epiques].sort(([a], [b]) => a - b).map(([, theme]) => theme);
  if (ameliorations.length > 0) themes.push({ title: THEME_AMELIORATIONS, lines: ameliorations });
  if (corrections.length > 0) themes.push({ title: THEME_CORRECTIONS, lines: corrections });
  return themes;
}

// Les chiffres d'autonomie sous les noms du résumé ; absents sans ticket compté.
function autonomieDe(chiffres: ChiffresDAutonomie | null | undefined): Autonomie | undefined {
  if (chiffres === null || chiffres === undefined || chiffres.tickets === 0) return undefined;
  return { tickets: chiffres.tickets, servedWithoutHuman: chiffres.sansHumain, shareWithoutHuman: chiffres.partSansHumain, medianLeadTimeMs: chiffres.delaiMedianMs, sentBack: chiffres.renvoyes, shareSentBack: chiffres.partRenvoyee };
}

const pour100 = (part: number | null) => (part === null ? "unknown" : `${Math.round(part * 100)}%`);
function duree(ms: number | null): string {
  if (ms === null) return "unknown";
  const heures = ms / 3_600_000;
  return heures < 48 ? `${Math.max(1, Math.round(heures))} h` : `${Math.round(heures / 24)} days`;
}

const enLigne = ({ text, ticketNumber, ticketUrl }: LigneDuResume) => `- ${text} ([#${ticketNumber}](${ticketUrl}))`;

function markdownDuResume(resume: Omit<ResumeHebdomadaire, "markdown">): string {
  const lignes = [`# What the kitchen served — ${resume.project}`, "", `Week of ${resume.weekStart} to ${resume.weekEnd}.`];
  if (resume.themes.length === 0) lignes.push("", "Nothing was served this week.");
  for (const theme of resume.themes) lignes.push("", `## ${theme.title}`, "", ...theme.lines.map(enLigne));
  const a = resume.autonomy;
  if (a !== undefined) {
    lignes.push(
      "",
      `## ${TITRE_AUTONOMIE}`,
      "",
      `- Served without asking you anything: ${a.servedWithoutHuman} of ${a.tickets} (${pour100(a.shareWithoutHuman)})`,
      `- Median time from the ticket's start to served: ${duree(a.medianLeadTimeMs)}`,
      `- Sent back by review at least once: ${a.sentBack} of ${a.tickets} (${pour100(a.shareSentBack)})`,
    );
  }
  lignes.push("", `## ${TITRE_ATTENTE}`, "");
  if (resume.waiting.length === 0) lignes.push("Nothing is waiting for you.");
  else lignes.push(...resume.waiting.map(enLigne));
  return `${lignes.join("\n")}\n`;
}

export type EntreesDuResume = {
  project: string;
  weekStart: string;
  weekEnd: string;
  servis: readonly TicketServi[];
  autonomie?: ChiffresDAutonomie | null;
  attentes: readonly Attente[];
};

// Le résumé d'une semaine d'un projet.
export function resumeDeLaSemaine({ project, weekStart, weekEnd, servis, autonomie, attentes }: EntreesDuResume): ResumeHebdomadaire {
  const autonomy = autonomieDe(autonomie);
  const waiting = attentes.map(({ ticket, ligne, url }) => ({ text: pourUnProductOwner(ligne) || `Ticket #${ticket}`, ticketNumber: ticket, ticketUrl: url }));
  const sansTexte = { project, weekStart, weekEnd, themes: themesDeLaSemaine(servis), ...(autonomy === undefined ? {} : { autonomy }), waiting };
  return { ...sansTexte, markdown: markdownDuResume(sansTexte) };
}
