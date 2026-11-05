// Le TODO du chef lu de GitHub, pour un projet GitHub seul (#2221, épique #2209) : une carte par issue ouverte au label
// `chef-todo`, sa sorte et son texte tirés du commentaire que le runtime y a posé — `<!-- brigade:todo kind=<sorte> -->`
// puis le texte, en clair (la convention est celle du runtime, #2217 ; l'app la lit telle quelle). Retirer le label, ou
// fermer l'issue, retire la carte à la lecture suivante : rien n'est gardé.
//
// Un projet GitHub seul est celui dont `.claude/brigade/projet.json` porte `githubOnlyState: true` (docs/reglages.md). Un projet
// du vieux chemin garde son TODO, celui du tableau de la cuisine : ce module ne lui ajoute rien.
//
// Les cartes entrent dans `faits.attend` comme celles du tableau, avec leur `chef` — la sorte et le texte —, que l'app pose
// dans la forme de toute carte de TODO (#2434, carte-todo.ts, `carteDuChefDeTodo`) : la question, un bouton par choix, un
// champ libre. Le commentaire marqué porte ses choix, un par ligne après la question : `- [<geste>] <libellé>`, le geste
// parmi ceux de la forme unique (runtime/src/carte-todo/forme.ts) — `formeDuChef`. Un commentaire sans choix se lit comme
// avant ; sa réponse libre joue `resume`. La réponse part du `gh` du chef (tableau-gestes/reponse-github.ts).
// Les lectures sont conditionnelles (`If-None-Match`, rail-github.ts) : un 304 ne coûte rien au quota.
import type { AppelGitHub } from "./client.ts";
import { lectureConditionnelle, type MemoireDesLectures } from "./rail-github.ts";
import type { TableauLu } from "./lecture.ts";

export const LABEL_DU_CHEF = "chef-todo";
const FICHIER_DU_PROJET = ".claude/brigade/projet.json";
const PAR_PAGE = 100;
const PAGES_AU_PLUS = 5;
const MARQUE = /^\s*<!--\s*brigade:todo\s+kind=([A-Za-z0-9_-]+)\s*-->\s*([\s\S]*)$/;
// Une issue au label dont aucun commentaire ne porte la marque : la carte reste — le label la fait —, et le dit.
export const SORTE_SANS_MARQUE = "todo";
export const TEXTE_SANS_MARQUE = "No readable card on this issue: its marked comment is missing. Open the issue.";

// Ce que la vue pose sur une carte du chef : la sorte (`blocked`, `merge-by-hand`, `product-question`, `abandoned`, ou
// ce que le runtime ajoute un jour) et le texte du commentaire.
export type CarteDuChef = { sorte: string; texte: string };

// Les gestes qu'un choix de la carte joue : ceux de la forme unique (runtime/src/carte-todo/forme.ts, `GESTES`).
export const GESTES_DU_CHEF = ["resume", "merge", "drop", "close"] as const;
export type GesteDuChef = (typeof GESTES_DU_CHEF)[number];
export type ChoixDuChef = { texte: string; suite: GesteDuChef };
// Ce que le texte d'une carte du chef pose : sa question — sa première ligne écrite, nulle sur un texte vide —, ses choix,
// et le reste, qui la précise.
export type FormeDuChef = { question: string | null; choix: ChoixDuChef[]; contexte: string };
export type CarteDuChefLue = CarteDuChef & { ticket: number; titre: string; url: string };

type Brut = Record<string, unknown>;
const objet = (valeur: unknown): Brut | null => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Brut) : null);
const liste = (valeur: unknown): Brut[] => (Array.isArray(valeur) ? valeur.flatMap((un: unknown) => { const o = objet(un); return o === null ? [] : [o]; }) : []);

// La carte qu'un commentaire porte : sa sorte et son texte — ou rien, s'il ne commence pas par la marque.
export function carteDuCommentaire(corps: string): CarteDuChef | null {
  const lu = MARQUE.exec(corps);
  return lu === null ? null : { sorte: (lu[1] as string).toLowerCase(), texte: (lu[2] as string).trim() };
}

// Un choix : `- [<geste>] <libellé>`, sur sa ligne. Une case à cocher de GitHub (`- [ ]`, `- [x]`) n'en est pas un.
const CHOIX = new RegExp(`^\\s*[-*]\\s*\\[(${GESTES_DU_CHEF.join("|")})\\]\\s+(\\S.*)$`, "i");
// La question dite en clair : sans titre, citation ni gras autour.
const enClair = (ligne: string) => ligne.replace(/^\s*(?:#+|>)\s*/, "").replace(/\*\*|__/g, "").trim();

// La forme d'une carte du chef, lue de son texte : la question est sa première ligne écrite ; chaque ligne
// `- [<geste>] <libellé>` qui la suit est un choix, dans l'ordre ; le reste, sans ses lignes vides en trop, la précise.
export function formeDuChef(texte: string): FormeDuChef {
  const lignes = texte.split(/\r?\n/);
  const tete = lignes.findIndex((ligne) => ligne.trim() !== "");
  if (tete === -1) return { question: null, choix: [], contexte: "" };
  const choix: ChoixDuChef[] = [];
  const reste: string[] = [];
  for (const ligne of lignes.slice(tete + 1)) {
    const lu = CHOIX.exec(ligne);
    const libelle = lu?.[2]?.trim();
    if (lu !== null && libelle !== undefined && !choix.some(({ texte: deja }) => deja === libelle)) choix.push({ texte: libelle, suite: (lu[1] as string).toLowerCase() as GesteDuChef });
    else if (lu === null) reste.push(ligne);
  }
  return { question: enClair(lignes[tete] as string), choix, contexte: reste.join("\n").replace(/\n{3,}/g, "\n\n").trim() };
}

// Le projet est-il GitHub seul ? Son fichier de réglages, lu sur la branche par défaut, le dit. Un fichier absent ou
// illisible : non — le projet garde le TODO du tableau.
export async function projetGithubSeul(options: { depot: string; appeler: AppelGitHub; memoire?: MemoireDesLectures }): Promise<boolean> {
  const appeler = options.memoire === undefined ? options.appeler : lectureConditionnelle(options.appeler, options.memoire);
  try {
    const reponse = await appeler(`/repos/${options.depot}/contents/${FICHIER_DU_PROJET}`);
    const contenu = objet(reponse.data)?.content;
    if (reponse.status !== 200 || typeof contenu !== "string") return false;
    return objet(JSON.parse(Buffer.from(contenu, "base64").toString("utf8")))?.githubOnlyState === true;
  } catch {
    return false;
  }
}

// Les commentaires d'une issue, du plus ancien au plus récent, jusqu'à `PAGES_AU_PLUS` pages.
async function commentairesDe(depot: string, ticket: number, appeler: AppelGitHub): Promise<string[] | null> {
  const corps: string[] = [];
  for (let page = 1; page <= PAGES_AU_PLUS; page++) {
    const reponse = await appeler(`/repos/${depot}/issues/${ticket}/comments?per_page=${PAR_PAGE}&page=${page}`);
    if (reponse.status !== 200) return null;
    const lus = liste(reponse.data);
    corps.push(...lus.flatMap(({ body }) => (typeof body === "string" ? [body] : [])));
    if (lus.length < PAR_PAGE) break;
  }
  return corps;
}

// Les cartes du chef : une par issue ouverte au label, la plus ancienne d'abord. La carte est celle du dernier commentaire
// marqué. Rien ne se lit (GitHub refuse, ne répond pas) : `null`, jamais « aucune carte ».
export async function lesCartesDuChef(options: { depot: string; appeler: AppelGitHub; memoire?: MemoireDesLectures }): Promise<CarteDuChefLue[] | null> {
  const { depot } = options;
  const appeler = options.memoire === undefined ? options.appeler : lectureConditionnelle(options.appeler, options.memoire);
  try {
    const issues = await appeler(`/repos/${depot}/issues?state=open&labels=${LABEL_DU_CHEF}&per_page=${PAR_PAGE}&sort=created&direction=asc`);
    if (issues.status !== 200) return null;
    const cartes: CarteDuChefLue[] = [];
    for (const issue of liste(issues.data)) {
      if (issue.pull_request !== undefined || typeof issue.number !== "number") continue;
      // L'issue du tableau de la cuisine n'est jamais une carte (#2422).
      if (liste(issue.labels).some(({ name }) => name === "kitchen-board")) continue;
      const commentaires = await commentairesDe(depot, issue.number, appeler);
      if (commentaires === null) return null;
      const carte = commentaires.map(carteDuCommentaire).reverse().find((lue) => lue !== null) ?? { sorte: SORTE_SANS_MARQUE, texte: TEXTE_SANS_MARQUE };
      const url = typeof issue.html_url === "string" ? issue.html_url : `https://github.com/${depot}/issues/${issue.number}`;
      cartes.push({ ticket: issue.number, titre: typeof issue.title === "string" ? issue.title : "", url, ...carte });
    }
    return cartes;
  } catch {
    return null;
  }
}

// Le tableau lu, avec dans sa file `faits.attend` les cartes du chef que GitHub porte — pour un projet GitHub seul, et lui
// seul. Un ticket que le tableau fait déjà attendre garde son entrée. GitHub qui ne répond pas : le tableau tel quel.
export async function avecLeTodoGithub(lu: TableauLu, appeler: AppelGitHub, memoire?: MemoireDesLectures): Promise<TableauLu> {
  const options = { depot: lu.depot, appeler, ...(memoire === undefined ? {} : { memoire }) };
  if (lu.faits === undefined || !(await projetGithubSeul(options))) return lu;
  const cartes = await lesCartesDuChef(options);
  if (cartes === null) return lu;
  const attend = Array.isArray(lu.faits.attend) ? (lu.faits.attend as unknown[]) : [];
  const deja = new Set(attend.map((entree) => objet(entree)?.ticket));
  const ajoutees = cartes.filter(({ ticket }) => !deja.has(ticket)).map(({ ticket, titre, url, sorte, texte }) => ({ ticket, titre, url, chef: { sorte, texte } }));
  return { ...lu, faits: { ...lu.faits, attend: [...attend, ...ajoutees] } };
}
