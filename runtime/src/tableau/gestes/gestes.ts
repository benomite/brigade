// Les gestes du chef postés en commentaires sur le tableau de la cuisine :
// merger, renvoyer en cuisine, mettre de côté, répondre à une carte, faire
// repartir un ticket de WAITING (« c'est arrivé ») — sans
// lien direct avec la box. À chaque passage (au tick, après le
// rafraîchissement du tableau), la box lit les commentaires nouveaux du
// tableau. Celui dont la première ligne est un geste (grammaire.ts) et dont
// l'auteur est le compte du chef est joué par la même action que son geste
// local (`rail merge`, `rail send-back`, `rail remove`, `rail answer`,
// `rail choose` : geste-ticket.ts, reponse-carte.ts ; « c'est arrivé », qui
// n'a pas d'autre geste que celui-ci et le téléphone : `renvoyerEnCuisine`,
// attente.ts ; les gestes de box —
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
// pour que les apps disent au chef que le sien est pris en compte.
import { renvoyerEnCuisine } from "../../attente.ts";
import { mergerLaLivraison, renvoyerLaLivraison, retirerDuRail, type Resultat } from "../../geste-ticket.ts";
import type { GitHub } from "../../github.ts";
import type { Journal } from "../../journal.ts";
import { repondreALaCarte } from "../../reponse-carte.ts";
import type { GesteDuTableau } from "../rendu/bloc.ts";
import { enMarkdown } from "../rendu/rendre.ts";
import type { ClientDesGestes, CommentaireDuTableau } from "./client.ts";
import { GRAMMAIRE, lireLeGeste, type Geste } from "./grammaire.ts";
import { GRAMMAIRE_DE_BOITE, lireUnGesteDeBoite, type GesteDeBoite } from "../gestes-boite/grammaire.ts";
import { jouerUnGesteDeBoite, type ResultatDeBoite } from "../gestes-boite/jouer.ts";

// Les gestes que le bloc machine porte, les plus récents ; et ceux dont la
// réponse se retente.
export const GESTES_AU_TABLEAU = 20;

const AUTEUR = "chef";
const RIEN_TOUCHE = "none: nothing was changed";

export type OptionsDesGestes = {
  client: ClientDesGestes;
  journal: Journal;
  projet: string;
  // Le GitHub sous lequel les actions se jouent : celui qui merge et commente les tickets.
  github: GitHub;
  // Le répertoire d'état de la box : les gestes qui n'existaient que sur elle
  // (tableau/gestes-boite/) jouent ses commandes locales sur son journal. Sans
  // lui, ils sont refusés.
  repertoireEtat?: string;
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

// Ce que le geste demande, en deux mots : `merge #12`.
const nommer = (geste: Geste | GesteDeBoite) => ("verbe" in geste ? `${geste.verbe} #${geste.ticket}` : geste.nom);

// Une ligne : ce qui en dirait plusieurs est resserré.
const uneLigne = (texte: string) => texte.replace(/\s+/g, " ").trim();

// Le geste, lié à son commentaire.
const lien = (texte: string, url: string) => (url === "" ? texte : `[${texte}](${url})`);

// La ligne que la box répond sous le geste. Elle ne commence jamais par
// `/brigade` : sous le même compte que le chef, elle n'est pas un geste.
export function direLaReponse(commentaire: Pick<CommentaireDuTableau, "url">, lecture: Geste | GesteDeBoite | { incompris: string }, resultat: Resultat | ResultatDeBoite | null): string {
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
  return `**Done** — ${nom} — cost: ${enMarkdown(uneLigne("price" in resultat ? resultat.price : ""))}`;
}

// Le geste, joué par l'action de son geste local. Ce qui lève — GitHub
// injoignable, un refus de son API — est un refus, dit.
async function jouer({ journal, github, projet }: OptionsDesGestes, geste: Geste): Promise<Resultat> {
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

  // Poste la réponse au geste `commentaire` sous le tableau, et le note. Rend
  // faux si GitHub la refuse : elle repart au passage suivant.
  const poster = async (numero: number, commentaire: number, reponse: string): Promise<boolean> => {
    try {
      await client.repondre(numero, reponse);
    } catch (erreur) {
      const motif = erreur instanceof Error ? erreur.message : String(erreur);
      if (motif !== dernierRefus) avertir(`brigade : réponse au geste ${commentaire} du Kitchen board #${numero} non postée, reprise au passage suivant — ${motif}`);
      dernierRefus = motif;
      return false;
    }
    dernierRefus = null;
    journal.ajouter({ project: projet, ticket: null, author: "runtime", type: "board.replied", payload: { comment: commentaire, board: numero }, dedupKey: `board.replied:${commentaire}` });
    return true;
  };

  // Les réponses que GitHub a refusées, reprises sous le tableau d'aujourd'hui
  // — chacune nomme son geste par son lien.
  const reposter = async (numero: number) => {
    const repondus = new Set(journal.duType("board.replied", GESTES_AU_TABLEAU * 2).map((fait) => fait.payload.comment));
    for (const fait of derniers()) {
      if (repondus.has(fait.payload.comment)) continue;
      if (!(await poster(numero, fait.payload.comment, fait.payload.reply))) return;
    }
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
          ticket: "incompris" in lecture || "commande" in lecture ? null : lecture.ticket,
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
          },
          dedupKey: `board.gesture:${commentaire.id}`,
        });
        if (ecrit === null) continue;
        lu = true;
        await poster(numero, commentaire.id, reponse);
      }
      return lu;
    },
    lus() {
      return derniers().map(({ ticket, at, payload }) => ({
        commentaire: payload.comment,
        url: payload.url,
        le: payload.writtenAt,
        geste: payload.gesture,
        ticket,
        etat: payload.done ? "pris" : "refuse",
        traiteLe: at,
        reponse: payload.reply,
      }));
    },
  };
}
