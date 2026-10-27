// La forme unique d'une carte de TODO (épique #1764) : celle que la carte de
// question produit de #1281 a déjà, étendue à toutes les cartes qui entrent
// dans TODO — rouge remonté par le manager, merge à la main, question de
// découpage… Une carte dit :
// - `resume` : ce qui se passe, en deux phrases simples au plus ;
// - `question` : la question posée au chef, une seule, sur une ligne — absente
//   d'une carte à un seul geste, qui n'a rien à demander ;
// - `choix` : ses choix, au moins un, chacun un bouton qui joue son geste
//   (`suite`, les gestes de la porte : carte-todo.ts) ;
// - `reponseLibre` : le chef peut répondre en texte libre — la réponse reprend
//   le ticket (reponse-carte.ts) ;
// - `secondaire` : « ask the second », l'action secondaire de toute carte,
//   jamais comptée parmi ses choix ;
// - `captures` : les écrans avant et après, quand le ticket en a livré.
//
// `validerCarte` est la règle, sans E/S : un producteur qui pose une carte la
// fait passer ici, et une carte incomplète est refusée avec sa raison en clair
// — en anglais, comme les sorties du chef. Rien n'est repris d'un producteur
// sans être vérifié : un choix sans geste est refusé, pas complété.
//
// La porte de TODO (carte-todo.ts) juge par cette règle : ce module n'en
// importe que des types, pour qu'elle puisse l'importer sans cycle.
import { capturesManquantes, type Captures } from "../captures.ts";
import type { CarteDeTodo, Choix, ChoixPropose } from "../carte-todo.ts";

// Les gestes qu'un choix peut jouer : ceux que la réponse du chef sait faire
// (reponse-carte.ts). `resume` : la cuisine reprend le ticket avec la réponse.
// `merge` : la livraison verte qui attend est mergée. `drop` : le ticket sort
// du rail — son label `fire` est retiré, il ne repart pas. `wait` : le ticket revenu de
// WAITING y retourne, pour la même attente et une nouvelle relance.
export const GESTES = ["resume", "merge", "drop", "wait"] as const;
export type Geste = (typeof GESTES)[number];

// Une seule question : elle finit par son « ? », et n'en porte pas d'autre.
export const uneQuestion = (texte: string) => texte.endsWith("?") && texte.indexOf("?") === texte.length - 1;

// L'action secondaire de toute carte : demander au second, quand le chef ne
// comprend pas la carte. Le mot est celui de l'app (« ask the second »).
export const DEMANDER_AU_SECOND = Object.freeze({ action: "ask-second", texte: "ask the second" } as const);
export type ActionSecondaire = typeof DEMANDER_AU_SECOND;

// Le plus de phrases qu'un résumé peut dire.
export const PHRASES_MAX = 2;

// Une carte qui a passé la règle.
export type CarteTodo = { resume: string; question: string | null; choix: Choix[]; reponseLibre: boolean; secondaire: ActionSecondaire; captures: Captures | null };

// Ce qu'un producteur propose, tel quel : rien n'y est encore vérifié.
// `reponseLibre` absente : la carte l'offre, comme toute carte de TODO.
export type CarteProposee = {
  resume?: string | null;
  question?: string | null;
  choix?: readonly ChoixPropose[] | null;
  reponseLibre?: boolean | null;
  captures?: Captures | null;
};

export type Validation = { valide: true; carte: CarteTodo } | { valide: false; raison: string };

const refus = (raison: string): Validation => ({ valide: false, raison });
const surPlusieursLignes = (texte: string) => /[\r\n]/.test(texte);
const estGeste = (mot: string): mot is Geste => (GESTES as readonly string[]).includes(mot);
const estLeSecond = (mot: string) => mot === DEMANDER_AU_SECOND.action || mot === DEMANDER_AU_SECOND.texte;

// Du Markdown dans un texte qui se veut simple : du code, du gras, un lien, un
// titre, une citation ou une puce.
const MARKDOWN = /`|\*\*|__|\]\(|^\s*(#+|>|[-*+])\s/;

// Les phrases d'un texte : chacune finit par son point (`.`, `!`, `?`, `…`)
// suivi d'un blanc, ou par la fin du texte. Un point sans blanc derrière —
// `v2.1`, `forme.ts` — ne coupe rien.
export const phrases = (texte: string): number => texte.split(/(?<=[.!?…])\s+/).filter((phrase) => phrase.trim() !== "").length;

const listeDesGestes = () => GESTES.join(" or ");

// La règle : valide, la carte est rendue nettoyée (textes sans blancs autour,
// gestes en minuscules, question nulle sur une carte à un seul geste, l'action
// secondaire posée) ; refusée, la raison en une ligne.
export function validerCarte({ resume, question, choix, reponseLibre, captures }: CarteProposee): Validation {
  const dit = resume?.trim() ?? "";
  if (dit === "") return refus("no summary: a TODO card says what happens in at most two plain sentences");
  if (surPlusieursLignes(dit)) return refus("summary on several lines: a TODO card says what happens in at most two plain sentences, on one line");
  if (MARKDOWN.test(dit)) return refus("summary with formatting (code, bold, link, heading, quote or bullet): a TODO card says what happens in plain sentences");
  const compte = phrases(dit);
  if (compte > PHRASES_MAX) return refus(`summary of ${compte} sentences: a TODO card says what happens in at most ${PHRASES_MAX} plain sentences`);

  if (!choix || choix.length === 0) return refus("no choice: a TODO card offers at least one choice, a button that plays its gesture");
  const lus: Choix[] = [];
  for (const [rang, propose] of choix.entries()) {
    const numero = rang + 1;
    const texte = propose.texte?.trim() ?? "";
    if (texte === "" || surPlusieursLignes(texte)) return refus(`choice ${numero} is empty or on several lines: each choice is one line`);
    const geste = propose.suite?.trim().toLowerCase() ?? "";
    if (estLeSecond(geste) || estLeSecond(texte.toLowerCase())) return refus(`choice ${numero} asks the second: “${DEMANDER_AU_SECOND.texte}” is the secondary action of every card, never one of its choices`);
    if (geste === "") return refus(`choice ${numero} (“${texte}”) names no gesture: each choice is a button that plays its gesture — ${listeDesGestes()}`);
    if (!estGeste(geste)) return refus(`choice ${numero} (“${texte}”) plays an unknown gesture “${propose.suite?.trim()}”: ${listeDesGestes()}`);
    if (lus.some((lu) => lu.texte === texte)) return refus(`choice ${numero} repeats another: each choice is a different way`);
    lus.push({ texte, suite: geste });
  }

  const demande = question?.trim() ?? "";
  if (lus.length === 1 && demande !== "") return refus("a single gesture with a question: a card with one choice shows its button and asks nothing");
  if (lus.length > 1) {
    if (demande === "") return refus(`${lus.length} choices but no question: a card with several choices asks the chef one question`);
    if (surPlusieursLignes(demande)) return refus("question on several lines: a TODO card asks one question, on one line");
    if (!uneQuestion(demande)) return refus("not exactly one question: a TODO card asks one question, ending with its only “?”");
  }

  if (reponseLibre !== undefined && reponseLibre !== null && typeof reponseLibre !== "boolean") return refus("free answer neither offered nor withheld: it is true or false");

  const montrees = captures != null && captures.screens.length > 0 ? captures : null;
  if (montrees !== null) {
    const manquantes = capturesManquantes(montrees.screens);
    if (manquantes !== null) return refus(`captures incomplete (missing: ${manquantes}): a card shows each screen before and after`);
  }

  return { valide: true, carte: { resume: dit, question: lus.length > 1 ? demande : null, choix: lus, reponseLibre: reponseLibre ?? true, secondaire: DEMANDER_AU_SECOND, captures: montrees } };
}

// Une carte que la porte de TODO a admise (carte-todo.ts, `jugerCarte`) dans
// la forme unique : son résumé, sa question, ses choix et ses captures.
export const carteDeLaPorte = ({ resume, question, choix, captures }: CarteDeTodo): Validation => validerCarte({ resume, question, choix, captures });

// Une carte qu'un producteur pose sans qu'elle tienne la règle : elle n'entre
// pas, et l'erreur dit pourquoi.
export class CarteRefusee extends Error {
  constructor(raison: string) {
    super(`TODO card refused: ${raison}`);
    this.name = "CarteRefusee";
  }
}

// La carte, validée — ou l'erreur qui la refuse : le chemin d'un producteur qui
// compose sa carte lui-même, et n'a rien à faire d'un refus que le corriger.
export function carteValide(proposition: CarteProposee): CarteTodo {
  const validation = validerCarte(proposition);
  if (!validation.valide) throw new CarteRefusee(validation.raison);
  return validation.carte;
}
