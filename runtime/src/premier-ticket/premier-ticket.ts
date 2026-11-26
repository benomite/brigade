// Le premier ticket d'un projet neuf, écrit dans l'app (#3306, épique #3301).
// Le projet prêt, l'app demande au chef, au nom du second, ce qu'il veut
// changer d'abord (`app/src/vue/premier-ticket/`). Ce module fait le reste,
// que l'app charge et joue sous le `gh` et le `claude` de son poste :
//
//   rediger(…)   le second écrit l'issue d'après la réponse du chef : sa
//                consigne (`consigne`) donnée à `claude -p`, comme le triage
//                du départ (`app/src/depart-du-projet.ts`, #3268), avec le
//                lanceur que l'app lui passe. Un « non » du chef, avec ce qu'il
//                veut changer, la fait réécrire : le brouillon d'avant et les
//                changements partent avec la réponse. Rien n'est créé ici.
//   creer(…)     sur le « oui » du chef, et sur lui seul : l'issue créée sur
//                GitHub avec les labels du premier ticket
//                (`LABELS_DU_PREMIER_TICKET`, `fire` compris) — elle est sur le
//                rail. Le chef ne tape ni ne voit aucun label : c'est ici
//                qu'ils sont posés.
//
// Rien n'est inventé quand une lecture échoue : une réponse du second qui ne
// se lit pas, ou une création que GitHub refuse, se dit avec sa cause ; aucun
// brouillon par défaut, aucune issue à moitié.
import type { ClientGitHub } from "../proteger-branche.ts";
import { LABELS_DU_PREMIER_TICKET, SECTIONS_DU_PREMIER_TICKET } from "../second-init/premier-ticket.ts";

// Le brouillon de l'issue : son titre, une ligne, et son corps, en Markdown.
export type Brouillon = { title: string; body: string };
// Ce que le chef a donné : sa réponse à la question ; pour une réécriture, le
// brouillon qu'il a vu et ce qu'il veut y changer.
export type Demande = { answer: string; draft?: Brouillon; changes?: string };
export type Redaction = { draft: Brouillon } | { refus: string; detail: string };
export type Creation = { ticket: number; url: string } | { refus: string; detail: string };

// Lance `claude` avec ce texte sur son entrée standard (celui de l'app :
// `lancerLeTriage`, `app/src/depart-du-projet.ts`).
export type Lancer = (commande: string, args: readonly string[], entree: string, dossier: string, delaiMs: number) => Promise<{ code: number | null; sortie: string; erreur: string }>;

// La question que le second pose au chef, le projet prêt.
export const QUESTION = "What do you want to change first?";
// Au-delà, la rédaction est abandonnée et le dit.
export const DELAI_DE_REDACTION_MS = 120_000;
const TITRE_MAX = 120;

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const texte = (valeur: unknown): valeur is string => typeof valeur === "string";
const objet = (valeur: unknown): Record<string, unknown> | undefined => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : undefined);

// Un brouillon tel qu'il est venu — du second, ou de l'écran —, vérifié : un
// titre d'une ligne, et un corps qui porte les deux sections d'une issue
// `product` du second. Lève, en une phrase, sur ce qui n'en a pas la forme.
export function brouillonLu(brut: unknown): Brouillon {
  const lu = objet(brut);
  if (lu === undefined || !texte(lu.title) || !texte(lu.body)) throw new Error("a draft has a title and a body");
  const title = lu.title.trim();
  const body = lu.body.trim();
  if (title === "") throw new Error("the draft's title is empty");
  if (/[\r\n]/.test(title)) throw new Error("the draft's title is not on one line");
  if (title.length > TITRE_MAX) throw new Error(`the draft's title is longer than ${TITRE_MAX} characters`);
  for (const section of SECTIONS_DU_PREMIER_TICKET) {
    if (!body.split(/\r?\n/).some((ligne) => ligne.trimEnd() === section)) throw new Error(`the draft's body has no \`${section}\` section`);
  }
  return { title, body };
}

// Ce que le chef a donné, vérifié : une réponse, et pour une réécriture le
// brouillon vu et des changements, tous deux ou aucun.
export function demandeLue(brute: unknown): Demande {
  const lue = objet(brute);
  if (lue === undefined || !texte(lue.answer) || lue.answer.trim() === "") throw new Error("the chef's answer is empty");
  if (lue.draft === undefined && lue.changes === undefined) return { answer: lue.answer.trim() };
  if (!texte(lue.changes) || lue.changes.trim() === "") throw new Error("the changes the chef asks for are empty");
  return { answer: lue.answer.trim(), draft: brouillonLu(lue.draft), changes: lue.changes.trim() };
}

// Ce que le second reçoit : comment écrire le premier ticket, la réponse du
// chef, et — pour une réécriture — le brouillon d'avant et ce qui y change.
export function consigne(depot: string, { answer, draft, changes }: Demande): string {
  const [contexte, criteres] = SECTIONS_DU_PREMIER_TICKET;
  const lignes = [
    `You are the second of the project ${depot}. It is ready for Brigade, and you asked the chef, in the app: "${QUESTION}"`,
    "From their answer, write the project's first ticket, in English, as a GitHub issue: a short title, and a body with two sections —",
    `\`${contexte}\` (what the chef wants, and why, in two or three sentences) and \`${criteres}\` (two to five observable criteria, one \`- \` line each, from the user's point of view: "when I do X, I see Y").`,
    "No model, no effort, no label: the manager calibrates it, and the app puts it on the rail once the chef agrees.",
    "Run no command, read nothing else, ask no question, create nothing: only write the draft.",
    'Answer with nothing but a JSON object: {"title": "<the title, one line>", "body": "<the body, in Markdown>"}.',
    "",
    "The chef's answer:",
    answer,
  ];
  if (draft !== undefined && changes !== undefined) {
    lignes.push("", "You already showed them this draft:", JSON.stringify(draft), "", "They asked for these changes — rewrite the draft with them, and keep the rest:", changes);
  }
  return lignes.join("\n");
}

// Le brouillon que le second a répondu : l'objet JSON de sa sortie. Lève sur
// une réponse qui ne se lit pas — jamais un brouillon inventé.
export function reponseLue(sortie: string): Brouillon {
  const debut = sortie.indexOf("{");
  const fin = sortie.lastIndexOf("}");
  let lu: unknown;
  try {
    if (debut < 0 || fin < debut) throw new Error("no JSON object in it");
    lu = JSON.parse(sortie.slice(debut, fin + 1));
  } catch (erreur) {
    throw new Error(`the second's answer is not a JSON object (${message(erreur)})`);
  }
  return brouillonLu(lu);
}

export type OptionsDeRedaction = { depot: string; dossier: string; demande: unknown; claude: string; lancer: Lancer; delaiMs?: number };

// Le second écrit le brouillon, ou dit pourquoi il ne l'a pas fait.
export async function rediger({ depot, dossier, demande, claude, lancer, delaiMs = DELAI_DE_REDACTION_MS }: OptionsDeRedaction): Promise<Redaction> {
  let lue: Demande;
  try {
    lue = demandeLue(demande);
  } catch (erreur) {
    return { refus: "nothing was sent to the second: the screen sent no answer it can read", detail: message(erreur) };
  }
  let rendu;
  try {
    rendu = await lancer(claude, ["-p"], consigne(depot, lue), dossier, delaiMs);
  } catch (erreur) {
    return { refus: "the second could not be started to write the ticket", detail: message(erreur) };
  }
  if (rendu.code !== 0) return { refus: "the second did not write the ticket", detail: rendu.erreur.trim() || `claude stopped with code ${String(rendu.code)}` };
  try {
    return { draft: reponseLue(rendu.sortie) };
  } catch (erreur) {
    return { refus: "the second answered something the app cannot read as a ticket", detail: message(erreur) };
  }
}

// Le « oui » du chef : l'issue créée, avec les labels du premier ticket. Une
// réponse de GitHub sans numéro ni adresse est un refus, pas un succès supposé.
export async function creer(client: ClientGitHub, depot: string, brut: unknown): Promise<Creation> {
  let brouillon: Brouillon;
  try {
    brouillon = brouillonLu(brut);
  } catch (erreur) {
    return { refus: "nothing was created: the screen sent no draft the app can read", detail: message(erreur) };
  }
  let reponse;
  try {
    reponse = await client({ methode: "POST", chemin: `repos/${depot}/issues`, corps: { ...brouillon, labels: [...LABELS_DU_PREMIER_TICKET] } });
  } catch (erreur) {
    return { refus: "nothing was created: GitHub could not be reached", detail: message(erreur) };
  }
  const corps = objet(reponse.corps);
  if (reponse.statut !== 201) return { refus: `nothing was created: GitHub refused the issue on ${depot}`, detail: `HTTP ${reponse.statut}${texte(corps?.message) ? ` — ${corps.message}` : ""}` };
  if (typeof corps?.number !== "number" || !texte(corps.html_url)) return { refus: `GitHub created the issue on ${depot} but did not say its number`, detail: JSON.stringify(reponse.corps) };
  return { ticket: corps.number, url: corps.html_url };
}
