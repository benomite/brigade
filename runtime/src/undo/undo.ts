// Annuler un ticket servi d'un clic, depuis sa carte (#3274, épique #3267).
// Le filet de l'autonomie : un ticket servi s'annule sans que le chef ait
// regardé la pass merger.
//
// L'annulation ne prend aucun chemin à part : elle livre un ticket comme un
// cook le livre, et la pass le juge et le merge comme toute livraison.
//
// 1. Le ticket servi est fermé par une PR mergée (`prQuiFerme`) ; son merge,
//    `merge_commit_sha`, a pour premier parent la base d'avant.
// 2. Le revert se construit chez GitHub, sans clone : un commit qui remet
//    l'arbre de la base d'avant, fils du merge — il défait le merge, et rien
//    d'autre —, fusionné dans une branche partie de la tête de la base
//    (`undo/<ticket>`). GitHub fait la fusion à trois : ce qui a été servi
//    depuis est gardé ; s'il s'appuie sur ce que le ticket a apporté, la
//    fusion est en conflit.
// 3. Propre : un ticket « Undo #N » est ouvert, sa branche de cook
//    (`cook/<n>-github`) posée sur la fusion, sa PR ouverte (`Closes #n`), puis
//    `in-pass` et `fire` posés — ce qu'une station fait d'une livraison. La
//    pass le prend au tour suivant. Le ticket d'origine est rouvert, hors du
//    rail (sans `fire` : il ne repart pas à un cook pendant qu'on le défait),
//    avec un commentaire qui dit qu'il a été annulé, et par qui.
// 4. En conflit : aucune PR n'est ouverte, la branche d'essai est supprimée.
//    Un ticket est déposé pour que la cuisine annule l'original à la main ;
//    le ticket d'origine le nomme dans un commentaire, et reste servi.
//
// Un ticket « Undo #N » porte `<!-- brigade:undo ticket=N … -->` : tant qu'il
// est ouvert, un second clic ne dépose rien de plus et le nomme.
import { DE_CONFIANCE } from "../alimenter.ts";
import { LABEL_IN_PASS } from "../github-etat/etats.ts";
import { LABEL, type GitHub } from "../github.ts";
import { GesteRefuse } from "../rail.ts";
import { numeroDeLaPR } from "../validation-design/brief.ts";

// Ce que l'annulation lit et écrit de GitHub.
export type GitHubDeLAnnulation = Pick<GitHub, "issue" | "ouvertes" | "prQuiFerme" | "commenter" | "labelliser" | "delabelliser" | "creerIssue" | "ouvrirPR" | "fermerIssue"> &
  Required<Pick<GitHub, "teteDeLaBase" | "rouvrirIssue" | "commitGit" | "creerCommit" | "creerBranche" | "fusionnerDansLaBranche" | "supprimerBranche">> & {
    // Le compte qui annule : celui du `gh` qui joue la commande, le chef qui a cliqué.
    droits(): Promise<{ login: string }>;
  };

// Le calibrage du ticket dont la livraison est le revert : renvoyé à un cook,
// il remet le revert à jour de la base. Celui qu'on annule à la main demande
// de démêler ce qui s'appuie sur l'original.
export const CALIBRAGE_DU_REVERT = ["model:sonnet", "effort:medium"];
export const CALIBRAGE_A_LA_MAIN = ["model:opus", "effort:medium"];

const MARQUE = /^<!-- brigade:undo ticket=([1-9][0-9]*) /;
const marque = (ticket: number, pr: number) => `<!-- brigade:undo ticket=${ticket} pr=${pr} -->`;

// La branche d'essai du revert : elle ne vit que le temps de l'annulation.
export const brancheDEssai = (ticket: number) => `undo/${ticket}`;

// `ouverte` : la PR du revert est ouverte, son ticket `undo` en pass, l'original
// rouvert. `conflit` : le revert ne s'applique pas proprement, `undo` est le
// ticket déposé pour l'annuler à la main. `deja` : `undo` l'annule déjà.
export type Annulation = { issue: "ouverte"; undo: number; pr: number | null; url: string } | { issue: "conflit"; undo: number } | { issue: "deja"; undo: number };

const court = (sha: string) => sha.slice(0, 7);

// Le ticket « Undo #N » encore ouvert, déposé par un compte de confiance ; null s'il n'y en a pas.
async function dejaEnCours(github: GitHubDeLAnnulation, ticket: number): Promise<number | null> {
  const sondage = await github.ouvertes();
  if (sondage.inchange) throw new Error("GitHub said the open issues did not change, but none were read");
  const trouvee = sondage.issues.find(({ body, association }) => DE_CONFIANCE.includes(association) && Number(MARQUE.exec(body)?.[1]) === ticket);
  return trouvee?.number ?? null;
}

// Annule le ticket servi `ticket` : `base`, la branche d'intégration du projet,
// sur laquelle le revert part ; `brancheDuTicket`, celle d'un cook.
export async function annuler(github: GitHubDeLAnnulation, ticket: number, brancheDuTicket: (ticket: number) => string): Promise<Annulation> {
  const issue = await github.issue(ticket);
  if (issue === null) throw new GesteRefuse(`#${ticket} is not a ticket of this project`);
  if (issue.state !== "closed") throw new GesteRefuse(`#${ticket} is not served: it is open`);
  const deja = await dejaEnCours(github, ticket);
  if (deja !== null) return { issue: "deja", undo: deja };
  const pr = await github.prQuiFerme(ticket);
  if (pr === null || pr.commitDeMerge === undefined) throw new GesteRefuse(`#${ticket} was not closed by a merged pull request: there is no merge to undo`);
  const merge = await github.commitGit(pr.commitDeMerge);
  const [avant] = merge?.parents ?? [];
  if (avant === undefined) throw new GesteRefuse(`the merge of PR #${pr.number} (${court(pr.commitDeMerge)}) is not known to GitHub: there is nothing to revert`);
  const base = await github.commitGit(avant);
  if (base === null) throw new GesteRefuse(`the commit before the merge of PR #${pr.number} (${court(avant)}) is not known to GitHub`);
  const { login } = await github.droits();
  const titre = issue.title;

  // Le revert, fils du merge, puis fusionné sur la tête de la base.
  const revert = await github.creerCommit({ message: `Revert "#${ticket} — ${titre}"\n\nThis reverts the merge of PR #${pr.number} (${pr.commitDeMerge}), undoing #${ticket}.`, arbre: base.arbre, parents: [pr.commitDeMerge] });
  const essai = brancheDEssai(ticket);
  // Une branche d'essai qu'une annulation interrompue aurait laissée.
  await github.supprimerBranche(essai);
  await github.creerBranche(essai, await github.teteDeLaBase(pr.base));
  try {
    const fusion = await github.fusionnerDansLaBranche(essai, revert, `Undo #${ticket}: revert the merge of PR #${pr.number}`);
    if ("conflit" in fusion) {
      const undo = await github.creerIssue({
        titre: `Undo #${ticket} by hand — ${titre}`,
        corps: [
          marque(ticket, pr.number),
          `Undo #${ticket} by hand: revert what its merge brought (PR #${pr.number}, commit \`${court(pr.commitDeMerge)}\`).`,
          "",
          `@${login} asked to undo #${ticket} from its card, but its revert does not apply cleanly: later work served since builds on it. Remove what #${ticket} brought, keep the later work that still holds without it, and run the gates.`,
        ].join("\n"),
        labels: [LABEL, ...CALIBRAGE_A_LA_MAIN],
      });
      await github.commenter(ticket, `@${login} asked to undo #${ticket}, but its revert does not apply cleanly: later work builds on it. No pull request was opened; #${undo} asks the kitchen to undo it by hand.`);
      return { issue: "conflit", undo };
    }
    const undo = await github.creerIssue({
      titre: `Undo #${ticket} — ${titre}`,
      corps: [
        marque(ticket, pr.number),
        `Undo #${ticket}: revert its merge (PR #${pr.number}, commit \`${court(pr.commitDeMerge)}\`). @${login} asked for it from its card.`,
        "",
        `The delivery of this ticket is that revert, and nothing else: the pass judges it and merges it like any other delivery.`,
      ].join("\n"),
      labels: [],
    });
    const branche = brancheDuTicket(undo);
    let url: string;
    try {
      await github.creerBranche(branche, fusion.sha);
      url = await github.ouvrirPR({ branche, base: pr.base, titre: `#${undo} — Undo #${ticket} — ${titre}`, corps: `Closes #${undo}\n\nReverts the merge of #${ticket} (PR #${pr.number}), asked by @${login} from its card.` });
    } catch (erreur) {
      // Sans sa PR, le ticket du revert n'a rien à juger : il est fermé, pas laissé au rail.
      await Promise.allSettled([github.fermerIssue(undo), github.supprimerBranche(branche)]);
      throw erreur;
    }
    // `in-pass` avec `fire`, comme une station après la livraison d'un cook : la pass le prend.
    await github.labelliser(undo, [LABEL_IN_PASS, LABEL, ...CALIBRAGE_DU_REVERT]);
    await github.rouvrirIssue(ticket);
    if (issue.labels.includes(LABEL)) await github.delabelliser(ticket, LABEL);
    const numero = numeroDeLaPR(url);
    const laPR = numero === null ? url : `PR #${numero}`;
    await github.commenter(ticket, `Undone by @${login} from its card: ${laPR} reverts its merge (PR #${pr.number}), and goes through the pass like any delivery as #${undo}. #${ticket} is reopened off the rail: put \`${LABEL}\` back on it to have it cooked again.`);
    return { issue: "ouverte", undo, pr: numero, url };
  } finally {
    // Une branche d'essai que GitHub n'a pas supprimée ne retient rien : aucune
    // PR ne la porte, et l'annulation suivante la supprime avant de repartir.
    await github.supprimerBranche(essai).catch(() => undefined);
  }
}
