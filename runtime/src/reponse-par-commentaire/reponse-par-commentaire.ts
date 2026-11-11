// La réponse du chef par un commentaire sur GitHub (#3253) : la question d'une
// carte vit aussi en commentaire sur l'issue (mention-du-chef/) ; y répondre —
// sur github.com, dans GitHub Mobile, ou par le mail de la notification — vaut
// la réponse de l'app, sans l'app.
//
// La cuisine lit les commentaires de l'issue (`commentaires`) à chaque tick de
// la minuterie du runtime (60 s par défaut, `intervalleTickMs`) : c'est son
// sondage, le seul canal de commentaires qu'elle ait pour une issue. Seuls les
// tickets dont la file du chef porte une carte sont lus.
//
// - Une question est le commentaire de la cuisine qui porte la marque d'une
//   carte encore dans la file du chef ; elle est ouverte tant que sa carte y est.
// - Un commentaire répond si ce n'est ni celui d'un bot, ni un commentaire de la
//   cuisine (une ligne de marque `<!-- brigade:` qui n'est pas citée), et s'il vient après la question. Il répond
//   à la question que sa citation (lignes `>`) reproduit ; sans citation, à
//   l'unique question ouverte, ou à la plus ancienne s'il y en a plusieurs.
//   Une citation qui ne reproduit aucune question ouverte n'est pas une réponse.
// - Le texte, citation ôtée, est un des choix (espaces et casse ignorés) : ce
//   choix est la réponse, comme cliqué dans l'app ; sinon il est la réponse
//   libre. Vide, il ne répond à rien.
// - L'auteur passe le contrôle de rôle de la carte : le chef, ou l'humain du
//   projet dont le rôle répond à sa question (aiguillage-humains/). Un autre
//   est ignoré : la carte reste dans TODO.
// - Une question répondue — un `todo.answered` qui porte la clé de son
//   commentaire — ne se rouvre pas : un second commentaire n'y change rien.
//
// Une lecture qui échoue se dit une fois et se rejoue au tick suivant ; la
// réponse part par repondreALaCarte, qui refuse avant d'écrire ce qui ne
// peut pas se faire, et le refus se dit une fois.
import { attentesDuChef, type AttenteDeTicket } from "../attend.ts";
import type { Base } from "../base.ts";
import { humainsDuProjet, roleDeLaQuestion, type Humain } from "../aiguillage-humains/aiguillage.ts";
import type { Commentaire, GitHub } from "../github.ts";
import { cleDeLaCarte, deLaCuisine, ligneDeLaCarte, marque } from "../mention-du-chef/mention-du-chef.ts";
import { lireRail } from "../projections/rail.ts";
import { ENTETE_REPONSE, repondreALaCarte } from "../reponse-carte.ts";
import type { CauseReveil, Runtime } from "../runtime.ts";

type Question = { attente: AttenteDeTicket; cle: string; sorte: string; ligne: string; choix: string[]; rang: number };

const normaliser = (texte: string) => texte.replace(/\s+/g, " ").trim().toLowerCase();
const meme = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const estQuote = (ligne: string) => ligne.trimStart().startsWith(">");
// Ce que la cuisine écrit : un bot, une de ses marques, ou la réponse qu'elle vient d'écrire sur l'issue.
const duBot = (commentaire: Commentaire) => commentaire.author.endsWith("[bot]") || commentaire.body.startsWith(ENTETE_REPONSE) || commentaire.body.split(/\r?\n/).some((ligne) => ligne.trim().startsWith("<!-- brigade:"));

// Le bloc de citation qui ouvre le commentaire, et ce qui le suit.
export function separerLaCitation(corps: string): { citation: string | null; reponse: string } {
  const lignes = corps.trim().split(/\r?\n/);
  let fin = 0;
  for (const [i, ligne] of lignes.entries()) {
    if (estQuote(ligne)) fin = i + 1;
    else if (ligne.trim() !== "") break;
  }
  if (fin === 0) return { citation: null, reponse: corps.trim() };
  return { citation: lignes.slice(0, fin).map((ligne) => ligne.trimStart().replace(/^>\s?/, "")).join("\n"), reponse: lignes.slice(fin).join("\n").trim() };
}

// Les questions ouvertes d'un ticket, de la plus ancienne à la plus récente :
// les cartes de sa file dont le commentaire de la cuisine est sur l'issue.
export function questionsOuvertes(attentes: readonly AttenteDeTicket[], commentaires: readonly Commentaire[]): Question[] {
  const questions: Question[] = [];
  for (const attente of attentes) {
    const { sorte, ligne, choix } = ligneDeLaCarte(attente);
    const cle = cleDeLaCarte(sorte, ligne);
    const rang = commentaires.findIndex((commentaire) => deLaCuisine(commentaire) && commentaire.body.split(/\r?\n/).some((l) => l.trim() === marque(cle)));
    if (rang < 0 || questions.some((autre) => autre.rang === rang)) continue;
    questions.push({ attente, cle, sorte, ligne, choix, rang });
  }
  return questions.sort((a, b) => a.rang - b.rang);
}

// À quelle question ce commentaire répond, s'il en vise une.
export function questionVisee(questions: readonly Question[], rang: number, citation: string | null): Question | null {
  const apres = questions.filter((question) => question.rang < rang);
  if (citation === null) return apres[0] ?? null;
  const cite = normaliser(citation);
  return apres.find((question) => cite.includes(normaliser(question.ligne))) ?? null;
}

// Le contrôle de rôle de l'app : le chef, ou l'humain dont le rôle répond à la question.
export function peutRepondre(login: string, chef: string | null, humains: readonly Humain[], sorte: string): boolean {
  if (chef !== null && meme(login, chef)) return true;
  const role = roleDeLaQuestion(sorte);
  return role !== null && humains.some((humain) => meme(humain.login, login) && humain.roles.includes(role));
}

// Ce que le commentaire répond : un des choix de la carte, ou son texte libre.
export function reponseDuCommentaire(choix: readonly string[], texte: string): { choix: number } | { texte: string } | null {
  if (texte.trim() === "") return null;
  const rang = choix.findIndex((offert) => normaliser(offert) === normaliser(texte));
  return rang >= 0 ? { choix: rang + 1 } : { texte };
}

export type OptionsDeLaReponse = {
  github: GitHub;
  projet: string;
  // Le compte GitHub du chef, résolu à chaque passe (chef/chef.ts) ; nul sans chef.
  chef: () => string | null | Promise<string | null>;
  // Les réglages du projet, relus à chaque passe : leurs humains (`humans`).
  reglages?: () => unknown;
  avertir?: (ligne: string) => void;
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Cette question a-t-elle déjà reçu sa réponse d'un commentaire ?
const repondue = (base: Base, ticket: number, cle: string) =>
  base.lire<{ n: number }>("SELECT COUNT(*) AS n FROM events WHERE ticket = ? AND type = 'todo.answered' AND json_extract(payload, '$.question') = ?", ticket, cle)[0]?.n! > 0;

export function repondeurParCommentaire(runtime: Pick<Runtime, "journal">, options: OptionsDeLaReponse) {
  const { journal } = runtime;
  const avertir = options.avertir ?? ((ligne: string) => console.error(ligne));
  const dits = new Set<string>();
  const direUneFois = (ligne: string) => {
    if (dits.has(ligne)) return;
    dits.add(ligne);
    avertir(ligne);
  };
  let enVol: Promise<void> | null = null;

  async function traiter(ticket: number, attentes: AttenteDeTicket[], chef: string | null, humains: Humain[]) {
    const commentaires = await options.github.commentaires(ticket);
    const questions = questionsOuvertes(attentes, commentaires);
    for (const [rang, commentaire] of commentaires.entries()) {
      if (duBot(commentaire)) continue;
      const { citation, reponse } = separerLaCitation(commentaire.body);
      const question = questionVisee(questions, rang, citation);
      if (question === null) continue;
      // Une question répondue ne se rouvre pas, et un commentaire d'un autre rôle n'y compte pas.
      if (repondue(journal.base, ticket, question.cle)) continue;
      if (!peutRepondre(commentaire.author, chef, humains, question.sorte)) continue;
      const lue = reponseDuCommentaire(question.choix, reponse);
      if (lue === null) continue;
      const resultat = await repondreALaCarte(journal, options.github, options.projet, ticket, lue, { attente: question.attente, cle: question.cle });
      if (!resultat.done) direUneFois(`brigade : the reply of ${commentaire.author} on #${ticket} was not recorded — ${resultat.reason}`);
    }
  }

  const passer = (): Promise<void> => {
    if (enVol !== null) return enVol;
    const attentes = attentesDuChef(journal.base, lireRail(journal.base)).filter((attente): attente is AttenteDeTicket => attente.ticket !== null && attente.ticket > 0);
    if (attentes.length === 0) return Promise.resolve();
    const courante = (async () => {
      let chef: string | null;
      try {
        chef = (await options.chef())?.trim() || null;
      } catch (erreur) {
        direUneFois(`brigade : replies on GitHub are not read — the chef does not resolve: ${message(erreur)}`);
        return;
      }
      let humains: Humain[] = [];
      try {
        humains = humainsDuProjet(options.reglages?.());
      } catch (erreur) {
        direUneFois(`brigade : only the chef may reply on GitHub — the project's humans do not read: ${message(erreur)}`);
      }
      const parTicket = Map.groupBy(attentes, (attente) => attente.ticket as number);
      for (const [ticket, siennes] of parTicket) {
        try {
          await traiter(ticket, siennes, chef, humains);
        } catch (erreur) {
          direUneFois(`brigade : replies on #${ticket} are not read — ${message(erreur)}`);
        }
      }
    })().finally(() => {
      enVol = null;
    });
    enVol = courante;
    return courante;
  };
  return { passer };
}

// Branche la lecture des réponses au runtime : à chaque tick.
export function brancherReponseParCommentaire<R extends Runtime>(runtime: R, options: OptionsDeLaReponse): R {
  const repondeur = repondeurParCommentaire(runtime, options);
  runtime.surReveil((cause: CauseReveil) => {
    if (cause === "tick") void repondeur.passer();
  });
  return runtime;
}
