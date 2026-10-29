// Les gestes du chef postés en commentaires sur le tableau de la cuisine :
// merger, renvoyer en cuisine, mettre de côté, répondre à une carte, faire
// repartir un ticket de WAITING (« c'est arrivé »), commenter l'issue d'une
// carte, demander au second, trancher une correction ou un profil proposés —
// sans lien direct avec la box. À chaque passage (au tick, après le
// rafraîchissement du tableau), la box lit les commentaires nouveaux du
// tableau. Celui dont la première ligne est un geste (grammaire.ts) et dont
// l'auteur est le compte du chef est joué par la même action que son geste
// local (`rail merge`, `rail send-back`, `rail remove`, `rail answer`,
// `rail choose` : geste-ticket.ts, reponse-carte.ts ; « c'est arrivé », qui
// n'a pas d'autre geste que celui-ci et le téléphone : `renvoyerEnCuisine`,
// attente.ts ; le commentaire sur une issue et la demande au second, ceux de
// la fiche d'une carte dans l'app : `pass -- <ticket> comment | ask`,
// issue-ticket.ts ; le « oui » ou le « non » à une correction ou à un profil
// proposés, qui n'ont pas d'autre geste : `trancherLaCorrection`,
// correctif/decision.ts, et `trancherLeProfil`, profils/decision.ts ; les gestes de box —
// plafond de cooks, stop, resume, rejeu de la base, grant, station — jouent
// leur commande locale : tableau/gestes-boite/), puis la box répond sous
// lui en une ligne : fait, ou pourquoi pas. Un geste incompris reçoit la
// grammaire. Ce qu'écrit un autre compte n'est ni joué ni répondu : la box se
// tait.
//
// Un commentaire n'est joué qu'une fois : chaque geste lu s'écrit au journal
// (`board.gesture`, tableau/gestes/evenements.ts) sous une clé d'unicité, et
// le plus grand id lu est le curseur de la box — un commentaire plus ancien
// n'est plus lu. L'action se joue avant que le fait ne s'écrive : un runtime
// arrêté entre les deux la rejoue au démarrage, et l'action la refuse alors
// d'elle-même (déjà mergée, plus rien n'attend le chef). La réponse part
// après le fait : refusée par GitHub, elle repart au passage suivant
// (`board.replied`).
//
// Le bloc machine du tableau porte les derniers gestes et leur état (`lus`),
// pour que les apps disent au chef que le sien est pris en compte. La demande
// au second y est entière (`demande`). Quand la box tient le second du projet
// (second.ts, `BRIGADE_SECOND_DIR`), la demande y part, et sa réponse est
// postée sous le geste dès qu'il l'a donnée (`board.second`) — le bloc la porte
// (`second`). Sinon, c'est l'app qui l'écrit dans le second qu'elle tient.
import { renvoyerEnCuisine } from "../../attente.ts";
import { trancherLaCorrection } from "../../correctif/decision.ts";
import { mergerLaLivraison, renvoyerLaLivraison, retirerDuRail, type Resultat } from "../../geste-ticket.ts";
import { commenterIssue, demanderAuSecond, type Demande } from "../../issue-ticket.ts";
import type { GitHub } from "../../github.ts";
import type { Journal } from "../../journal.ts";
import { trancherLeProfil } from "../../profils/decision.ts";
import { repondreALaCarte } from "../../reponse-carte.ts";
import type { GesteDuTableau } from "../rendu/bloc.ts";
import { enMarkdown } from "../rendu/rendre.ts";
import type { ClientDesGestes, CommentaireDuTableau } from "./client.ts";
import { GRAMMAIRE, lireLeGeste, type Geste } from "./grammaire.ts";
import { GRAMMAIRE_DE_BOITE, lireUnGesteDeBoite, type GesteDeBoite } from "../gestes-boite/grammaire.ts";
import { REPONSE_DU_SECOND_AU_BLOC, type SecondDuGeste } from "../rendu/bloc.ts";
import type { SecondDuTableau } from "./second.ts";
import { jouerUnGesteDeBoite, type ResultatDeBoite } from "../gestes-boite/jouer.ts";

// Les gestes que le bloc machine porte, les plus récents ; et ceux dont la
// réponse se retente.
export const GESTES_AU_TABLEAU = 20;

const AUTEUR = "chef";
const RIEN_TOUCHE = "none: nothing was changed";
const AU_SECOND = "one turn of the project's second, in its own conversation, on the Claude account where it runs — its answer is posted under this gesture as soon as it gives it";

// Ce qu'un commentaire de GitHub porte au plus, et une marge.
const COMMENTAIRE_MAX = 60_000;

// Le corps posté sous le geste pour la réponse du second : elle ne commence
// pas par `/brigade`, et ne mentionne personne (rendre.ts, le gluon).
function direLeSecond(commentaire: Pick<CommentaireDuTableau, "url">, nom: string, reponse: { repondu: true; texte: string } | { repondu: false; raison: string }): string {
  if (!reponse.repondu) return `**The second did not answer** — ${lien(nom, commentaire.url)}: ${enMarkdown(uneLigne(reponse.raison))}`;
  const texte = reponse.texte.replaceAll("@", "@\u2060");
  const coupe = texte.length > COMMENTAIRE_MAX ? `${texte.slice(0, COMMENTAIRE_MAX)}\n\n_… cut: the whole answer is in the second's conversation._` : texte;
  return `**The second's answer** — ${lien(nom, commentaire.url)}:\n\n${coupe}`;
}

export type OptionsDesGestes = {
  client: ClientDesGestes;
  journal: Journal;
  projet: string;
  // Le GitHub sous lequel les actions se jouent : celui qui merge et commente les tickets.
  github: GitHub;
  // Le GitHub du compte de la box — celui du chef —, sous lequel part son
  // commentaire sur une issue, comme `pass -- <ticket> comment` : ce sont ses
  // mots, jamais ceux de l'App d'un rôle. Sans lui, celui des actions.
  githubDuChef?: GitHub;
  // Le répertoire d'état de la box : les gestes qui n'existaient que sur elle
  // (tableau/gestes-boite/) jouent ses commandes locales sur son journal. Sans
  // lui, ils sont refusés.
  repertoireEtat?: string;
  // Le clone du projet : le « oui » à un profil proposé y écrit sa définition.
  // Sans lui, ce « oui » est refusé.
  repoDir?: string;
  // Le second du projet, quand cette box le tient (second.ts) : la demande
  // d'un `ask` y part. Sans lui, elle n'est que publiée.
  second?: SecondDuTableau | null;
  // Ce qui n'a pas pu se faire sans empêcher le reste : une réponse refusée.
  avertir?: (ligne: string) => void;
};

export type GestesDuTableau = {
  // Lit les commentaires nouveaux du tableau `numero`, joue ceux du chef et y
  // répond. Rend vrai si un geste a été lu : le tableau a changé.
  traiter(numero: number): Promise<boolean>;
  // Les derniers gestes lus, le plus ancien d'abord, pour le bloc machine.
  lus(): GesteDuTableau[];
};

// Ce que le geste demande, en deux mots : `merge #12`, `profile yes 377`.
const nommer = (geste: Geste | GesteDeBoite) => ("verbe" in geste ? ("ticket" in geste ? `${geste.verbe} #${geste.ticket}` : `${geste.verbe} ${geste.reponse} ${geste.proposition}`) : geste.nom);

// Une ligne : ce qui en dirait plusieurs est resserré.
const uneLigne = (texte: string) => texte.replace(/\s+/g, " ").trim();

// Le geste, lié à son commentaire.
const lien = (texte: string, url: string) => (url === "" ? texte : `[${texte}](${url})`);

// La ligne que la box répond sous le geste. Elle ne commence jamais par
// `/brigade` : sous le même compte que le chef, elle n'est pas un geste.
export function direLaReponse(commentaire: Pick<CommentaireDuTableau, "url">, lecture: Geste | GesteDeBoite | { incompris: string }, resultat: Resultat | Demande | ResultatDeBoite | null): string {
  if ("incompris" in lecture) {
    const grammaire = [...GRAMMAIRE, ...GRAMMAIRE_DE_BOITE].map((forme) => `\`${forme}\``).join(" · ");
    return `**Not understood** — ${lien("your gesture", commentaire.url)}: ${enMarkdown(uneLigne(lecture.incompris))}. Accepted, on the first line: ${grammaire}`;
  }
  const nom = lien(nommer(lecture), commentaire.url);
  if ("commande" in lecture) {
    if (resultat !== null && "dit" in resultat) return `**Done** — ${nom}: ${enMarkdown(uneLigne(resultat.dit))} — cost: none: only the log is written`;
    return `**Not done** — ${nom}: ${enMarkdown(uneLigne(resultat !== null && "reason" in resultat ? resultat.reason : "nothing was played"))}`;
  }
  if (resultat === null || !resultat.done) return `**Not done** — ${nom}: ${enMarkdown(uneLigne(resultat?.done === false && "reason" in resultat ? resultat.reason : "nothing was played"))}`;
  // La demande au second, telle que l'app l'écrira : une seule ligne déjà.
  const demande = "request" in resultat && typeof resultat.request === "string" ? `: the request for the second is “${enMarkdown(uneLigne(resultat.request))}”` : "";
  return `**Done** — ${nom}${demande} — cost: ${enMarkdown(uneLigne("price" in resultat ? resultat.price : ""))}`;
}

// Le geste, joué par l'action de son geste local. Ce qui lève — GitHub
// injoignable, un refus de son API — est un refus, dit.
async function jouer({ journal, github, githubDuChef, projet, repoDir, second }: OptionsDesGestes, geste: Geste): Promise<Resultat | Demande> {
  try {
    switch (geste.verbe) {
      case "merge":
        return await mergerLaLivraison(journal, github, geste.ticket);
      case "send-back":
        return renvoyerLaLivraison(journal, projet, geste.ticket, geste.raison);
      case "set-aside":
        return await retirerDuRail(journal, github, projet, geste.ticket);
      case "answer":
        return await repondreALaCarte(journal, github, projet, geste.ticket, { texte: geste.reponse });
      case "choose":
        return await repondreALaCarte(journal, github, projet, geste.ticket, { choix: geste.choix });
      case "arrived":
        return renvoyerEnCuisine(journal, projet, geste.ticket);
      case "comment":
        return await commenterIssue(githubDuChef ?? github, geste.ticket, geste.texte);
      case "ask": {
        const demande = await demanderAuSecond(github, geste.ticket, geste.contexte);
        if (!demande.done || !second) return demande;
        return { ...demande, price: AU_SECOND };
      }
      case "correction":
        return trancherLaCorrection(journal, projet, geste.proposition, geste.reponse);
      case "profile":
        if (repoDir === undefined && geste.reponse === "yes") return { done: false, reason: "this box does not know the project's repository: the profile's definition has nowhere to be written", price: RIEN_TOUCHE };
        return trancherLeProfil({ journal, projet, repoDir: repoDir ?? "" }, geste.proposition, geste.reponse);
    }
  } catch (erreur) {
    return { done: false, reason: `it did not go through on GitHub (${erreur instanceof Error ? erreur.message : String(erreur)}) — post it again`, price: RIEN_TOUCHE };
  }
}

// Le geste de box, joué par la commande locale sur le journal de la box.
async function jouerDeBoite({ repertoireEtat }: OptionsDesGestes, geste: GesteDeBoite): Promise<ResultatDeBoite> {
  if (repertoireEtat === undefined) return { done: false, reason: "this box does not play its own commands from the board" };
  return await jouerUnGesteDeBoite(geste, repertoireEtat);
}

export function gestesDuTableau(options: OptionsDesGestes): GestesDuTableau {
  const { client, journal, projet } = options;
  const avertir = options.avertir ?? ((ligne: string) => console.error(ligne));
  // La dernière réponse refusée, dite une fois jusqu'à ce qu'une passe.
  let dernierRefus: string | null = null;

  const derniers = () => journal.duType("board.gesture", GESTES_AU_TABLEAU);
  // Les réponses du second, par geste.
  const duSecond = () => new Map(journal.duType("board.second", GESTES_AU_TABLEAU * 2).map((fait) => [fait.payload.comment, fait.payload]));
  // Les demandes au second dont ce process attend la réponse.
  const attendues = new Set<number>();

  // Poste sous le tableau la réponse au geste `commentaire` — ou, `du second`,
  // ce que le second en a dit —, et le note. Rend faux si GitHub la refuse :
  // elle repart au passage suivant.
  const poster = async (numero: number, commentaire: number, reponse: string, quoi: "board.replied" | "board.second-replied" = "board.replied"): Promise<boolean> => {
    try {
      await client.repondre(numero, reponse);
    } catch (erreur) {
      const motif = erreur instanceof Error ? erreur.message : String(erreur);
      if (motif !== dernierRefus) avertir(`brigade : réponse ${quoi === "board.replied" ? "au geste" : "du second au geste"} ${commentaire} du Kitchen board #${numero} non postée, reprise au passage suivant — ${motif}`);
      dernierRefus = motif;
      return false;
    }
    dernierRefus = null;
    journal.ajouter({ project: projet, ticket: null, author: "runtime", type: quoi, payload: { comment: commentaire, board: numero }, dedupKey: `${quoi}:${commentaire}` });
    return true;
  };

  // Les réponses que GitHub a refusées, reprises sous le tableau d'aujourd'hui
  // — chacune nomme son geste par son lien. Celle du second vient après celle
  // de la box à son geste.
  const reposter = async (numero: number) => {
    const repondus = new Set(journal.duType("board.replied", GESTES_AU_TABLEAU * 2).map((fait) => fait.payload.comment));
    const secondsRepondus = new Set(journal.duType("board.second-replied", GESTES_AU_TABLEAU * 2).map((fait) => fait.payload.comment));
    const seconds = duSecond();
    for (const fait of derniers()) {
      if (!repondus.has(fait.payload.comment) && !(await poster(numero, fait.payload.comment, fait.payload.reply))) return;
      // Celle qu'`attendreLeSecond` poste encore n'est pas reprise : elle partirait deux fois.
      const sien = attendues.has(fait.payload.comment) ? undefined : seconds.get(fait.payload.comment);
      if (sien !== undefined && !secondsRepondus.has(fait.payload.comment) && !(await poster(numero, fait.payload.comment, sien.reply, "board.second-replied"))) return;
    }
  };

  // La demande d'un `ask`, partie dans le second : sa réponse, quand il la
  // donne, s'écrit au journal et se poste sous le geste. Le tableau la porte au
  // rafraîchissement suivant.
  const attendreLeSecond = async (numero: number, commentaire: CommentaireDuTableau, nom: string, demande: string) => {
    if (!options.second) return;
    attendues.add(commentaire.id);
    try {
      const reponse = await options.second.demander(demande);
      const reply = direLeSecond(commentaire, nom, reponse);
      const ecrit = journal.ajouter({
        project: projet,
        ticket: null,
        author: "runtime",
        type: "board.second",
        payload: { comment: commentaire.id, board: numero, answered: reponse.repondu, answer: reponse.repondu ? reponse.texte : null, reason: reponse.repondu ? null : reponse.raison, reply },
        dedupKey: `board.second:${commentaire.id}`,
      });
      if (ecrit !== null) await poster(numero, commentaire.id, reply, "board.second-replied");
    } catch (erreur) {
      // Le runtime s'est arrêté pendant que le second répondait : le tableau le dira.
      avertir(`brigade : réponse du second au geste ${commentaire.id} du Kitchen board #${numero} non notée — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    } finally {
      attendues.delete(commentaire.id);
    }
  };

  // Ce qu'il en est de la demande d'un `ask` partie dans le second.
  const etatDuSecond = (comment: number, seconds: ReturnType<typeof duSecond>): SecondDuGeste => {
    const sien = seconds.get(comment);
    if (sien === undefined) return attendues.has(comment) ? { etat: "attendu" } : { etat: "echec", raison: "the box stopped before the second answered: post the gesture again" };
    if (!sien.answered || sien.answer === null) return { etat: "echec", raison: sien.reason ?? "the second did not answer" };
    const coupee = sien.answer.length > REPONSE_DU_SECOND_AU_BLOC;
    return { etat: "repondu", reponse: coupee ? `${sien.answer.slice(0, REPONSE_DU_SECOND_AU_BLOC)}…` : sien.answer, coupee };
  };

  return {
    async traiter(numero) {
      await reposter(numero);
      const curseur = derniers().at(-1)?.payload ?? null;
      const nouveaux = (await client.commentaires(numero, curseur?.writtenAt || null)).filter((commentaire) => commentaire.id > (curseur?.comment ?? 0)).sort((a, b) => a.id - b.id);
      const gestes = nouveaux.flatMap((commentaire) => {
        const lecture = lireUnGesteDeBoite(commentaire.corps) ?? lireLeGeste(commentaire.corps);
        return lecture === null ? [] : [{ commentaire, lecture }];
      });
      if (gestes.length === 0) return false;
      // Le compte du chef ne se demande que devant un geste.
      const chef = (await client.compteDuChef()).toLowerCase();
      let lu = false;
      for (const { commentaire, lecture } of gestes) {
        if (commentaire.auteur.toLowerCase() !== chef) continue;
        const resultat = "incompris" in lecture ? null : "commande" in lecture ? await jouerDeBoite(options, lecture) : await jouer(options, lecture);
        const reponse = direLaReponse(commentaire, lecture, resultat);
        const ecrit = journal.ajouter({
          project: projet,
          ticket: "incompris" in lecture || "commande" in lecture || !("ticket" in lecture) ? null : lecture.ticket,
          author: AUTEUR,
          type: "board.gesture",
          payload: {
            comment: commentaire.id,
            board: numero,
            url: commentaire.url,
            author: commentaire.auteur,
            writtenAt: commentaire.le,
            gesture: "incompris" in lecture ? null : "commande" in lecture ? (lecture.nom.split(" ")[0] ?? null) : lecture.verbe,
            done: resultat?.done === true,
            reply: reponse,
            ...(resultat !== null && "request" in resultat && typeof resultat.request === "string" ? { request: resultat.request, ...(options.second ? { toSecond: true } : {}) } : {}),
          },
          dedupKey: `board.gesture:${commentaire.id}`,
        });
        if (ecrit === null) continue;
        lu = true;
        const auSecond = options.second && resultat !== null && "request" in resultat && typeof resultat.request === "string" && "verbe" in lecture ? { nom: nommer(lecture), demande: resultat.request } : null;
        // Attendue dès qu'elle est au journal : le tableau ne la dit pas perdue.
        if (auSecond !== null) attendues.add(commentaire.id);
        await poster(numero, commentaire.id, reponse);
        // La réponse du second peut prendre des minutes : le tableau n'attend pas.
        if (auSecond !== null) void attendreLeSecond(numero, commentaire, auSecond.nom, auSecond.demande);
      }
      return lu;
    },
    lus() {
      const seconds = duSecond();
      return derniers().map(({ ticket, at, payload }) => ({
        commentaire: payload.comment,
        url: payload.url,
        le: payload.writtenAt,
        geste: payload.gesture,
        ticket,
        etat: payload.done ? "pris" : "refuse",
        traiteLe: at,
        reponse: payload.reply,
        ...(payload.request === undefined ? {} : { demande: payload.request }),
        ...(payload.toSecond === true ? { second: etatDuSecond(payload.comment, seconds) } : {}),
      }));
    },
  };
}
