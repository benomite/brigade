// Le manager réagit à un échec : la pass lui passe un ticket qu'elle a jugé
// rouge une seconde fois, et il en fait quelque chose plutôt que de le
// remonter tel quel. Au second rouge, le code monte le calibrage d'un cran,
// s'il le peut, avant le second renvoi. Passé les deux renvois, un jugement
// choisit : monter encore, redécouper le ticket, ou le remonter au chef — et
// le manager dit lequel et pourquoi, sur l'issue.
//
// Un ticket ne repart jamais à l'identique : avant de le rendre au rail, le
// manager attend que celui-ci ait lu le nouveau calibrage. Et le disjoncteur
// garde le dernier mot : ouvert, plus rien n'est relancé.
//
// Rien n'est gardé en mémoire : le choix est au journal avant tout appel à
// GitHub, chaque pas y est noté une fois fait, et ce qui échoue se reprend au
// réveil suivant sans rejuger.
import { DE_CONFIANCE } from "./alimenter.ts";
import { complet, type Calibrage } from "./calibrage.ts";
import type { Reponse } from "./decoupage.ts";
import type { ChoixDeReaction, FaitManager } from "./evenements/manager.ts";
import type { FaitPass } from "./evenements/pass.ts";
import { REDECOUPE } from "./evenements/rail.ts";
import type { GitHub, IssueOuverte } from "./github.ts";
import type { Journal } from "./journal.ts";
import { MARQUEUR_MANAGER } from "./juger.ts";
import { PASS_ROUGE, RENVOIS_MAX } from "./pass.ts";
import { decoupageDe, ticketDEpique } from "./projections/decoupages.ts";
import { etatDesGardeFous } from "./projections/garde-fous.ts";
import { issueDuManager } from "./projections/manager.ts";
import { lirePass, passDuTicket, type PassDeTicket } from "./projections/pass.ts";
import { ticketDuRail } from "./projections/rail.ts";
import { labelsMontes, reactionDe, type ReactionDeTicket } from "./projections/reactions.ts";
import type { Rail } from "./rail.ts";
import { consigneDeReaction, lireReaction, monter, obstacle, type Choix, type Libre, type Plafond, type Tentative } from "./reagir.ts";

// Le motif du 86 d'un ticket que le manager remonte au chef.
export const REMONTE = "manager:escalated";

export type AtelierDeReaction = {
  journal: Journal;
  rail: Rail;
  github: GitHub;
  // `<owner>/<repo>`, pour la consigne.
  depotGitHub: string;
  plafond: Plafond;
  // La station dont les cooks sont les tentatives d'un ticket.
  station: string;
  noter: (ticket: number | null, fait: FaitManager | FaitPass) => unknown;
  // Fait répondre le LLM à une consigne, sous les garde-fous.
  demander: <T>(sujet: { numero: number; prefixe: string; nom: string }, consigne: string, lire: (message: string | null) => { valeur: T } | { illisible: string }) => Promise<Reponse<T> | null>;
  peutJuger: () => boolean;
  // Redécoupe le ticket en sous-tickets : le découpage du manager.
  redecouper: (ticket: IssueOuverte, commentaires: string[], echec: string) => Promise<{ fait: true } | { impossible: string } | null>;
  arrete: () => boolean;
  eteint: () => boolean;
  avertir: (message: string) => void;
  signature: (run: string | null, verbe: string) => string;
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const dit = (calibrage: { model: string | null; effort: string | null }) => `\`${calibrage.model ?? "?"}\` / \`${calibrage.effort ?? "?"}\``;
const labels = (calibrage: Calibrage) => [`model:${calibrage.model}`, `effort:${calibrage.effort}`];
const egaux = (a: Calibrage, b: Calibrage) => a.model === b.model && a.effort === b.effort;

export function ouvrirReaction(atelier: AtelierDeReaction) {
  const { journal, rail, github, noter, avertir, arrete } = atelier;
  const { base } = journal;

  // Les livraisons que la pass a jugées rouges, chacune avec le calibrage de
  // son cook : ce qui a été tenté, tel que le journal le garde.
  const tentatives = (ticket: number): Tentative[] => {
    const faites: Tentative[] = [];
    let cook: { model: string | null; effort: string | null } = { model: null, effort: null };
    for (const evenement of journal.duTicket(ticket)) {
      if (evenement.type === "cook.launched" && evenement.payload.station === atelier.station) {
        cook = { model: evenement.payload.model ?? null, effort: evenement.payload.effort ?? null };
      } else if (evenement.type === "pass.judged" && evenement.payload.verdict === "red") {
        faites.push({ ...cook, findings: evenement.payload.findings });
      }
    }
    return faites;
  };

  // Les dimensions dont le label vient du manager : celui de sa qualification,
  // celui du découpage dont le ticket est né, ou celui d'une montée.
  const libres = (ticket: number, pose: Calibrage): Libre => {
    const poses = new Set([...(issueDuManager(base, ticket)?.posed ?? []), ...labelsMontes(base, ticket)]);
    const ne = ticketDEpique(base, ticket);
    const prevu = ne?.index == null ? undefined : decoupageDe(base, ne.epic)?.tickets[ne.index - 1];
    if (prevu) for (const label of labels(prevu)) poses.add(label);
    const [model = "", effort = ""] = labels(pose);
    return { model: poses.has(model), effort: poses.has(effort) };
  };

  // Un ticket né d'un redécoupage ne se redécoupe pas.
  const neDUneReaction = (ticket: number): boolean => {
    const ne = ticketDEpique(base, ticket);
    return ne !== null && journal.duTicket(ne.epic).some((evenement) => evenement.type === "manager.reacted" && evenement.payload.choice === "split");
  };

  const lister = (faites: Tentative[]) =>
    faites.flatMap((tentative, i) => [`${i + 1}. ${dit(tentative)} — pass rouge :`, "", ...tentative.findings.flatMap((finding) => [finding.replace(/^/gm, "   "), ""])]);

  const dire = (connu: PassDeTicket, reaction: ReactionDeTicket): string => {
    const livraison = connu.pr ? ` ${connu.pr}` : "";
    switch (reaction.choice) {
      case "retry":
        return [
          MARQUEUR_MANAGER,
          `**Manager — second renvoi au même calibrage (${dit(reaction.from)}).**${livraison}`,
          "",
          `Le second renvoi monte le calibrage d'un cran quand il le peut. Ici, non : ${reaction.reason}.`,
          "",
          `Le ticket repart en attente : la station relance un cook dessus. S'il revient rouge, le manager choisira la suite — et un ticket qui a échoué deux fois ne repart plus à l'identique.`,
        ].join("\n");
      case "raise": {
        const second = reaction.returns < RENVOIS_MAX;
        return [
          MARQUEUR_MANAGER,
          second
            ? `**Manager — second renvoi : calibrage monté de ${dit(reaction.from)} à ${dit(reaction.to ?? reaction.from)}.**${livraison}`
            : `**Manager — rouge après ${reaction.returns} renvois : il monte le calibrage, de ${dit(reaction.from)} à ${dit(reaction.to ?? reaction.from)}.**${livraison}`,
          "",
          second ? "Les deux renvois ne sont pas deux tentatives identiques : le second monte d'un cran, dans la limite du plafond du projet." : `**Pourquoi.** ${reaction.reason}`,
          "",
          "Le ticket repart en attente dès que le rail a lu son nouveau calibrage : la station relance un cook dessus, dans le même worktree et sur la même branche. C'est ton quota : remplace le label, le manager ne le touchera plus.",
          ...(reaction.run === null ? [] : ["", atelier.signature(reaction.run, "Réagi")]),
        ].join("\n");
      }
      case "split":
        return [
          MARQUEUR_MANAGER,
          `**Manager — rouge après ${reaction.returns} renvois : il redécoupe le ticket.**${livraison}`,
          "",
          `**Pourquoi.** ${reaction.reason}`,
          "",
          `Ce ticket devient l'épique de ses sous-tickets, listés en bas de son corps : ils repartent de la base, et sa zone est à eux. Lui est 86 (\`${REDECOUPE}\`) et aucun cook n'y est relancé. Sa PR reste ouverte, comme référence : ferme-la, et ferme ce ticket, quand ses sous-tickets sont servis.`,
          "",
          atelier.signature(reaction.run, "Réagi"),
        ].join("\n");
      case "escalate":
        return [
          MARQUEUR_MANAGER,
          `**Manager — rouge après ${reaction.returns} renvois : remontée au chef.**${livraison}`,
          "",
          "**Ce qui a été tenté.**",
          "",
          ...lister(tentatives(connu.ticket)),
          `**Pourquoi le manager remonte.** ${reaction.reason}`,
          ...(reaction.proposal === null ? [] : ["", `**Ce qu'il propose.** ${reaction.proposal}`]),
          "",
          `Rien n'est mergé, et aucun cook n'est relancé : le ticket est 86 (\`${REMONTE}\`). Mergée à la main, sa PR sert le ticket ; retirer \`fire\` le sort du rail.`,
          ...(reaction.run === null ? [] : ["", atelier.signature(reaction.run, "Réagi")]),
        ].join("\n");
    }
  };

  // Le ticket est toujours celui que la pass a passé : ni rejugé, ni sorti du
  // rail, ni repris par elle.
  const tenu = (connu: PassDeTicket): boolean => {
    const frais = passDuTicket(base, connu.ticket);
    return frais?.phase === "deferred" && frais.verdictSeq === connu.verdictSeq && ticketDuRail(base, connu.ticket)?.state === "pass";
  };

  // Choisit ce que devient le ticket, et l'écrit. Rend faux s'il n'y a pas
  // encore de quoi choisir : le réveil suivant y revient.
  const choisir = async (connu: PassDeTicket, verdict: number): Promise<boolean> => {
    const { ticket } = connu;
    const sur = ticketDuRail(base, ticket);
    // Un calibrage incomplet : le chef est en train d'y toucher.
    if (!sur || !complet(sur)) return false;
    const pose: Calibrage = { model: sur.model, effort: sur.effort };
    const libre = libres(ticket, pose);
    const cible = monter(pose, atelier.plafond, libre);
    const empechement = cible === null ? obstacle(pose, atelier.plafond, libre) : null;
    const retenir = (choice: ChoixDeReaction, suite: { reason: string; proposal?: string | null; run?: string }) =>
      noter(ticket, {
        type: "manager.reacted",
        payload: { verdict, returns: connu.returns, choice, reason: suite.reason, proposal: suite.proposal ?? null, run: suite.run ?? null, from: pose, to: choice === "raise" ? cible : null },
      });
    const ouvert = etatDesGardeFous(base).breakerOpenedAt !== null;

    // Le second renvoi : le code tranche seul.
    if (connu.returns < RENVOIS_MAX) {
      // Disjoncteur ouvert, rien ne repart : le ticket attend « reprendre ».
      if (ouvert) return false;
      if (cible !== null) retenir("raise", { reason: "Second renvoi : le calibrage monte d'un cran." });
      else retenir("retry", { reason: empechement ?? "" });
      return true;
    }
    if (ouvert) {
      retenir("escalate", {
        reason: "Le disjoncteur du projet est ouvert : trop d'échecs d'affilée. Le manager ne relance plus rien, même s'il lui reste de quoi essayer.",
        proposal: "Regarder ce qui échoue en série (`npm --prefix runtime run garde-fous`), puis « reprendre » ; ce ticket se rend ensuite à la main.",
      });
      return true;
    }
    if (!atelier.peutJuger()) return false;
    const issue = await github.issue(ticket);
    if (arrete() || !issue) return false;
    const choix: Choix = { monter: cible, redecouper: !neDUneReaction(ticket) };
    const consigne = consigneDeReaction({
      depot: atelier.depotGitHub,
      issue: { number: ticket, title: issue.title, body: issue.body ?? "", labels: issue.labels },
      tentatives: tentatives(ticket),
      pose,
      choix,
      obstacle: empechement,
    });
    const reponse = await atelier.demander({ numero: ticket, prefixe: "reagit", nom: "réaction" }, consigne, (texte) => lireReaction(texte, choix));
    if (!reponse || arrete() || !tenu(connu)) return false;
    if ("valeur" in reponse) retenir(reponse.valeur.choice, { ...reponse.valeur, run: reponse.run });
    else {
      retenir("escalate", { reason: `Le jugement du manager n'a rendu aucun choix que le code sache suivre (${reponse.illisible}) : il ne devine pas.`, run: reponse.run });
      avertir(`brigade : réaction illisible sur le ticket #${ticket} (${reponse.illisible}) — remontée au chef`);
    }
    return true;
  };

  const commenter = async (connu: PassDeTicket, reaction: ReactionDeTicket) => {
    if (reaction.commented) return;
    await github.commenter(connu.ticket, dire(connu, reaction));
    noter(connu.ticket, { type: "manager.reaction-commented", payload: {} });
  };

  // Rend le ticket au rail : un cook repart dessus.
  const relancer = (connu: PassDeTicket) => {
    base.transaction(() => {
      if (!tenu(connu)) return;
      noter(connu.ticket, { type: "pass.returned", payload: { n: connu.returns + 1, findings: connu.findings } });
      rail.rendre(connu.ticket, PASS_ROUGE);
    });
  };

  // Le ticket quitte la pass sans repartir : il est 86, et la pass ne fait
  // plus que guetter un merge à la main.
  const arreter = (connu: PassDeTicket, motif: "manager-split" | "manager-escalated", raison: string) => {
    base.transaction(() => {
      if (!tenu(connu)) return;
      noter(connu.ticket, { type: "pass.escalated", payload: { reason: motif } });
      rail.quatreVingtSix(connu.ticket, { motif: raison });
    });
  };

  // Mène la réaction d'un ticket aussi loin qu'elle peut aller.
  const reagir = async (connu: PassDeTicket, verdict: number): Promise<void> => {
    const { ticket } = connu;
    let reaction = reactionDe(base, ticket);
    if (reaction?.verdict !== verdict) {
      if (!(await choisir(connu, verdict))) return;
      reaction = reactionDe(base, ticket);
    }
    if (!reaction || arrete() || atelier.eteint() || !tenu(connu)) return;

    switch (reaction.choice) {
      case "retry":
        await commenter(connu, reaction);
        return relancer(connu);
      case "raise": {
        const { from, to } = reaction;
        if (to === null) return;
        if (!reaction.raised) {
          let added = labels(to).filter((label) => !labels(from).includes(label));
          let removed = labels(from).filter((label) => !labels(to).includes(label));
          // Relu juste avant d'écrire : si le label à remplacer n'y est plus,
          // le chef a recalibré depuis le choix. Son geste est plus fort —
          // rien n'est posé, et le ticket repartira à son calibrage.
          const fraiche = await github.issue(ticket);
          if (arrete() || !fraiche) return;
          if (!removed.every((label) => fraiche.labels.includes(label))) [added, removed] = [[], []];
          if (added.length > 0) await github.labelliser(ticket, added);
          for (const label of removed) await github.delabelliser(ticket, label);
          if (arrete()) return;
          noter(ticket, { type: "manager.raised", payload: { added, removed } });
        }
        await commenter(connu, reaction);
        // Le rail lit les labels à son sondage : tant qu'il porte l'ancien
        // calibrage, le ticket ne repart pas — il repartirait à l'identique.
        const sur = ticketDuRail(base, ticket);
        if (!sur || !complet(sur) || egaux(sur, from)) return;
        return relancer(connu);
      }
      case "split": {
        const issue = await github.issue(ticket);
        if (arrete() || !issue) return;
        const commentaires = (await github.commentaires(ticket))
          .filter((commentaire) => DE_CONFIANCE.includes(commentaire.association) && !commentaire.body.includes(MARQUEUR_MANAGER))
          .map((commentaire) => commentaire.body);
        if (arrete()) return;
        const faites = tentatives(ticket);
        const echec = [
          `Ce ticket a été confié à un cook et a échoué ${faites.length} fois en pass. Le manager a décidé de le redécouper : ${reaction.reason}`,
          "",
          "Ce que la pass a trouvé en dernier :",
          "",
          ...(faites.at(-1)?.findings ?? []),
        ].join("\n");
        // Le ticket est sur le rail : son auteur a déjà la confiance du projet.
        const redecoupe = await atelier.redecouper({ ...issue, body: issue.body ?? "", association: "OWNER" }, commentaires, echec);
        if (redecoupe === null || arrete() || !tenu(connu)) return;
        if ("impossible" in redecoupe) {
          noter(ticket, {
            type: "manager.reacted",
            payload: {
              verdict,
              returns: connu.returns,
              choice: "escalate",
              reason: `Le manager voulait redécouper ce ticket (${reaction.reason}), mais le redécoupage est impossible : ${redecoupe.impossible}`,
              proposal: "Le découper à la main, ou en préciser le périmètre.",
              run: reaction.run,
              from: reaction.from,
              to: null,
            },
          });
          return reagir(connu, verdict);
        }
        await commenter(connu, reaction);
        // Ses sous-tickets naissent ensuite, comme ceux d'une épique.
        return arreter(connu, "manager-split", REDECOUPE);
      }
      case "escalate":
        await commenter(connu, reaction);
        arreter(connu, "manager-escalated", REMONTE);
        avertir(`brigade : le manager remonte le ticket #${ticket} au chef`);
        return;
    }
  };

  return {
    // Fait avancer chaque ticket que la pass a passé au manager.
    async traiter(): Promise<void> {
      for (const { ticket } of lirePass(base)) {
        if (arrete() || atelier.eteint()) return;
        const connu = passDuTicket(base, ticket);
        if (!connu || connu.verdictSeq === null || !tenu(connu)) continue;
        try {
          await reagir(connu, connu.verdictSeq);
        } catch (erreur) {
          // GitHub injoignable : la réaction reste où elle en est.
          if (!arrete()) avertir(`brigade : réaction du manager interrompue sur le ticket #${ticket}, elle reprendra où elle en est — ${message(erreur)}`);
        }
      }
    },
  };
}
