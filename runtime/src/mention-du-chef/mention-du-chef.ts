// La mention du chef sur GitHub (#2746) : chaque carte de TODO — toute entrée
// du bloc `awaiting` de `status` qui porte un ticket (attend.ts) — reçoit, sur
// l'issue de son ticket, un commentaire qui @-mentionne le chef et dit la
// question de la carte en une ligne. GitHub Mobile notifie un compte mentionné :
// c'est le premier pas des notifications, sans rien d'autre à installer.
//
// Le compte du chef est celui que les réglages du projet nomment (`chef`, dans
// `.claude/brigade/projet.json`), relu à chaque passe : jamais écrit en dur.
// Sans lui, rien n'est mentionné, et la cuisine le dit une fois.
//
// Seule la file du chef mentionne : la prise, les renvois, les verdicts et les
// merges n'y entrent pas, et rien d'autre n'appelle ce module.
//
// Une carte n'est mentionnée qu'une fois. Le commentaire porte une marque, en
// commentaire HTML que GitHub n'affiche pas, qui nomme la carte par sa sorte et
// sa ligne : la même carte, revue de tour en tour, après un redémarrage, ou par
// une autre station du projet, trouve sa marque sur l'issue et n'écrit rien.
// Une carte qui change de sorte ou de question est une autre carte, mentionnée
// à son tour.
//
// Les commentaires d'une issue ne sont lus qu'une fois par carte et par
// process : une carte vue mentionnée n'est plus relue. Un échec se dit une
// fois, et se rejoue au tick suivant.
import { createHash } from "node:crypto";
import { DE_CONFIANCE } from "../alimenter.ts";
import { attentesDuChef, direAttenteEn, type AttenteDeTicket } from "../attend.ts";
import type { Base } from "../base.ts";
import { aiguiller, humainsDuProjet, type Humain } from "../aiguillage-humains/aiguillage.ts";
import { attenteDeLaCarte, carteDeLAttente } from "../carte-todo/cartes.ts";
import type { GitHub } from "../github.ts";
import { lireRail } from "../projections/rail.ts";
import type { CauseReveil, Runtime } from "../runtime.ts";

// Une carte à mentionner : son ticket, sa sorte, ce qui la nomme, et sa ligne.
export type CarteAMentionner = { ticket: number; sorte: string; cle: string; ligne: string };

const surUneLigne = (texte: string) => texte.replace(/\s+/g, " ").trim();

// Ce que la carte demande au chef, sur une ligne : sa question, ou — une carte
// à un seul geste n'en pose pas — ce qu'elle dit. Une carte que sa forme
// refuse se dit par sa ligne du bloc `awaiting`.
function ligneDeLaCarte(attente: AttenteDeTicket): { sorte: string; ligne: string } {
  try {
    const carte = carteDeLAttente(attente);
    return { sorte: carte.type, ligne: surUneLigne(carte.question ?? carte.resume) };
  } catch {
    return { sorte: attente.quoi, ligne: surUneLigne(direAttenteEn(attente)) };
  }
}

// La clé d'une carte : sa sorte et sa ligne, sur l'issue de son ticket.
export const cleDeLaCarte = (sorte: string, ligne: string) => createHash("sha256").update(`${sorte}\n${ligne}`).digest("hex").slice(0, 16);

// Les cartes de la file du chef, une par ticket — celle que le ticket montre
// dans TODO (`attenteDeLaCarte`).
export function cartesAMentionner(base: Base, maintenant = new Date()): CarteAMentionner[] {
  const attentes = attentesDuChef(base, lireRail(base), maintenant);
  const tickets = [...new Set(attentes.flatMap(({ ticket }) => (ticket === null ? [] : [ticket])))];
  return tickets.flatMap((ticket) => {
    const attente = attenteDeLaCarte(attentes, ticket);
    if (attente === undefined) return [];
    const { sorte, ligne } = ligneDeLaCarte(attente);
    return [{ ticket, sorte, cle: cleDeLaCarte(sorte, ligne), ligne }];
  });
}

export const marque = (cle: string) => `<!-- brigade:chef-mention card=${cle} -->`;

// Le commentaire : la marque, puis le chef mentionné et la question, sur une ligne.
export const corpsDeLaMention = (chef: string, { cle, ligne }: CarteAMentionner) => `${marque(cle)}\n@${chef} ${ligne}`;

// Une marque fait foi posée par le dépôt : son propriétaire, ses membres, ses
// collaborateurs, ou l'un des comptes d'application de ses rôles.
const deLaCuisine = ({ association, author }: { association: string; author: string }) => DE_CONFIANCE.includes(association) || author.endsWith("[bot]");

export type GitHubDeLaMention = Pick<GitHub, "commentaires" | "commenter" | "assigner">;

// Mentionne le chef sur l'issue de la carte, sauf si elle porte déjà sa
// marque. Rend vrai si le commentaire est posté. Avec les humains du projet
// (aiguillage-humains/), la carte va à celui dont le rôle répond à sa
// question : il est assigné à l'issue, puis mentionné à la place du chef.
export async function mentionner(github: GitHubDeLaMention, chef: string, carte: CarteAMentionner, humains: readonly Humain[] = []): Promise<boolean> {
  const deja = (await github.commentaires(carte.ticket)).some((commentaire) => deLaCuisine(commentaire) && commentaire.body.split(/\r?\n/).some((ligne) => ligne.trim() === marque(carte.cle)));
  if (deja) return false;
  const aiguillage = aiguiller(humains, carte.sorte);
  const destinataire = aiguillage.vers === "humain" ? aiguillage.login : chef;
  // Assignée avant le commentaire, qui fait foi : un arrêt entre les deux rejoue l'assignation, sans doubler.
  if (aiguillage.vers === "humain" || aiguillage.assigner) await github.assigner?.(carte.ticket, [destinataire]);
  await github.commenter(carte.ticket, corpsDeLaMention(destinataire, carte));
  return true;
}

export type OptionsDeLaMention = {
  github: GitHubDeLaMention;
  // Le compte GitHub du chef, relu des réglages du projet ; nul s'ils n'en nomment aucun.
  chef: () => string | null;
  // La configuration du projet, relue à chaque passe : ses humains (`humans`) reçoivent les cartes de leur rôle (#2760).
  projet?: () => unknown;
  avertir?: (ligne: string) => void;
  maintenant?: () => Date;
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Le mentionneur d'une cuisine : `passer` mentionne les cartes de la file que
// ce process n'a pas encore vues mentionnées. Une passe à la fois : un réveil
// pendant l'une n'en lance pas d'autre, le tick suivant reprend.
export function mentionneurDuChef(base: Base, options: OptionsDeLaMention) {
  const avertir = options.avertir ?? ((ligne: string) => console.error(ligne));
  const vues = new Set<string>();
  const dits = new Set<string>();
  const direUneFois = (ligne: string) => {
    if (dits.has(ligne)) return;
    dits.add(ligne);
    avertir(ligne);
  };
  let enVol: Promise<void> | null = null;
  const passer = (): Promise<void> => {
    if (enVol !== null) return enVol;
    const cartes = cartesAMentionner(base, options.maintenant?.() ?? new Date()).filter(({ ticket, cle }) => !vues.has(`${ticket}:${cle}`));
    if (cartes.length === 0) return Promise.resolve();
    let chef: string | null;
    try {
      chef = options.chef()?.trim() || null;
    } catch (erreur) {
      direUneFois(`brigade : chef not mentioned on GitHub — the project settings do not read: ${message(erreur)}`);
      return Promise.resolve();
    }
    if (chef === null) {
      direUneFois("brigade : chef not mentioned on GitHub — the project settings name no chef: set `chef` to the chef's GitHub login in `.claude/brigade/projet.json`");
      return Promise.resolve();
    }
    const login = chef;
    let humains: Humain[] = [];
    try {
      humains = humainsDuProjet(options.projet?.());
    } catch (erreur) {
      direUneFois(`brigade : TODO cards go to the chef — the project's humans do not read: ${message(erreur)}`);
    }
    const courante = (async () => {
      for (const carte of cartes) {
        try {
          await mentionner(options.github, login, carte, humains);
          vues.add(`${carte.ticket}:${carte.cle}`);
        } catch (erreur) {
          direUneFois(`brigade : chef not mentioned on #${carte.ticket} — ${message(erreur)}`);
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

// Branche la mention au runtime : une passe d'emblée, puis à chaque tick.
export function brancherMentionDuChef<R extends Runtime>(runtime: R, options: OptionsDeLaMention): R {
  const mentionneur = mentionneurDuChef(runtime.journal.base, options);
  const passer = (cause: CauseReveil) => {
    if (cause !== "tick") return;
    try {
      void mentionneur.passer();
    } catch (erreur) {
      (options.avertir ?? ((ligne: string) => console.error(ligne)))(`brigade : chef not mentioned on GitHub — the queue does not read: ${message(erreur)}`);
    }
  };
  passer("tick");
  runtime.surReveil(passer);
  return runtime;
}
