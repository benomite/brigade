// Le triage : chaque carte qui allait entrer en TODO passe d'abord par l'agent
// de triage (`agents/triage.md`). La porte la retient (carte-todo.ts,
// `todo.held`) ; le triage rassemble ce que l'agent doit lire — l'issue, la
// PR, les reviews, la CI et ses journaux —, le lui donne, et suit sa réponse.
//
// L'agent tranche : le code exécute l'action — relancer le cook avec son
// diagnostic, redécouper, corriger une dépendance livrée, attendre une CI
// lente, retirer le ticket du rail — et écrit sur l'issue, en un seul
// commentaire, la phrase qui dit ce qui a été fait. La carte n'entre pas dans
// TODO. L'agent ne tranche pas — il répond `todo`, sa réponse ne se lit pas,
// il n'a pas pu partir, ou son action ne peut pas se faire — : la carte entre
// dans TODO telle qu'elle a été posée, comme avant le triage.
//
// Le triage ne merge jamais : aucune de ses actions ne touche au merge, qui
// reste au grant, sur une pass verte. Un merge que l'agent demanderait n'est
// pas une réponse qui se lit (consigne.ts).
//
// Rien n'est gardé en mémoire : la carte retenue, la décision et son action se
// relisent du journal.
import { DE_CONFIANCE } from "../alimenter.ts";
import { cartesEnTodo, cartesRetenues, laisserEntrer, sortirDeTodo, type CarteRetenue } from "../carte-todo.ts";
import type { Reponse } from "../decoupage.ts";
import type { Check } from "../events/pass.ts";
import { REDECOUPE as REDECOUPE_EN_PASS } from "../events/pass.ts";
import { REDECOUPE } from "../events/rail.ts";
import { fiche, porteFiche, sansAttente } from "../fiche.ts";
import { LABEL, type GitHub, type IssueOuverte } from "../github.ts";
import type { Journal } from "../journal.ts";
import { MARQUEUR_MANAGER } from "../juger.ts";
import { passDuTicket } from "../projections/pass.ts";
import { ticketDuRail } from "../projections/rail.ts";
import type { Rail } from "../rail.ts";
import { consigneDeTriage, lireTriage, type Action, type DecisionDuTriage, type Dossier } from "./consigne.ts";

// Qui écrit ce que le triage fait : il tourne avec le manager, et sous son
// identité GitHub.
const AUTEUR = "manager";
// Le motif du retour au rail d'un ticket que le triage relance.
export const RELANCE_DU_TRIAGE = "triage:relaunched";
// Combien de temps une carte attend la CI lente avant d'être retriée.
export const ATTENTE_CI_MS = 15 * 60_000;

export type AtelierDuTriage = {
  journal: Journal;
  projet: string;
  rail: Rail;
  github: GitHub;
  // `<owner>/<repo>`, pour la consigne.
  depotGitHub: string;
  // Fait répondre l'agent de triage, sous les garde-fous.
  demander: <T>(sujet: { numero: number; prefixe: string; nom: string }, consigne: string, lire: (message: string | null) => { valeur: T } | { illisible: string }) => Promise<Reponse<T> | null>;
  peutJuger: () => boolean;
  // Redécoupe le ticket en sous-tickets : le découpage du manager. Rien n'est
  // écrit avant `retenir`.
  redecouper: (ticket: IssueOuverte, commentaires: string[], echec: string) => Promise<{ retenir: () => void } | { impossible: string } | null>;
  maintenant: () => Date;
  arrete: () => boolean;
  avertir: (message: string) => void;
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Ce qu'une action a donné : faite, ou impossible — et pourquoi.
type Execution = { faite: true; until?: string } | { faite: false; pourquoi: string };
const impossible = (pourquoi: string): Execution => ({ faite: false, pourquoi });

export function ouvrirTriage(atelier: AtelierDuTriage) {
  const { journal, projet, rail, github, avertir, arrete } = atelier;
  const { base } = journal;

  // La carte est toujours celle que le triage a lue : ni remplacée, ni
  // tranchée, ni partie avec son ticket.
  const tenue = (carte: CarteRetenue) => cartesRetenues(base).some((autre) => autre.seq === carte.seq);

  const noter = (carte: CarteRetenue, action: Action | "through", reason: string, run: string | null, sentence: string | null = null, until: string | null = null) =>
    journal.ajouter({ project: projet, ticket: carte.ticket, author: AUTEUR, type: "todo.triaged", payload: { action, sentence, reason, run, ...(until === null ? {} : { until }) } });

  // L'agent n'a pas tranché : la carte entre dans TODO.
  const laisserPasser = (carte: CarteRetenue, reason: string, run: string | null) =>
    base.transaction(() => {
      if (!tenue(carte)) return;
      noter(carte, "through", reason, run);
      laisserEntrer(journal, projet, carte);
    });

  // Tout ce que l'agent doit lire du ticket de la carte.
  const rassembler = async (carte: CarteRetenue): Promise<Dossier> => {
    const { ticket } = carte;
    const issue = await github.issue(ticket);
    const commentaires = (await github.commentaires(ticket)).filter((commentaire) => DE_CONFIANCE.includes(commentaire.association)).map((commentaire) => commentaire.body);
    const sur = ticketDuRail(base, ticket);
    const livraison = passDuTicket(base, ticket);
    // La PR et sa CI se lisent si GitHub les rend : une PR disparue ne retient
    // pas la carte, l'agent lit qu'elles manquent.
    const sha = livraison?.sha ?? null;
    const numero = livraison?.number ?? null;
    const diff = numero === null ? null : await github.diff(numero).catch(() => null);
    const ci: Check[] = sha === null ? [] : await github.ci(sha).catch(() => []);
    const journaux: Dossier["journaux"] = [];
    for (const check of ci.filter(({ outcome }) => outcome === "red")) {
      const lu = await github.journalDuCheck(check).catch(() => null);
      if (lu !== null) journaux.push({ check: check.name, journal: lu });
    }
    return {
      depot: atelier.depotGitHub,
      carte,
      issue: issue && { title: issue.title, body: issue.body ?? "", labels: issue.labels, state: issue.state },
      commentaires,
      rail: sur && `#${ticket} est ${sur.state}${sur.reason ? ` (${sur.reason})` : ""}, depuis ${sur.since}${sur.station ? `, station ${sur.station}` : ""}.`,
      // Ce qu'il attend : `awaits` ne porte que ceux qui ne sont pas servis.
      attend: (sur?.card?.waitsFor ?? []).map((attendu) => {
        const retenu = sur?.awaits.find((autre) => autre.ticket === attendu);
        if (!retenu) return `attend #${attendu} : servi`;
        if (retenu.left) return `attend #${attendu} : parti du rail sans être servi (${retenu.left.reason})`;
        return `attend #${attendu} : ${ticketDuRail(base, attendu)?.state ?? "inconnu du rail"}`;
      }),
      livraison: livraison && [
        `Branche \`${livraison.branch ?? "?"}\`${livraison.pr ? `, PR ${livraison.pr}` : ", sans PR"}, commit ${livraison.sha ?? "?"} — pass : ${livraison.phase}${livraison.verdict ? `, verdict ${livraison.verdict}` : ""}${livraison.reason ? `, ${livraison.reason}` : ""}${livraison.cause ? ` (${livraison.cause})` : ""}, ${livraison.returns} renvoi(s).`,
        ...(livraison.findings.length === 0 ? [] : ["", "Ce que la pass a trouvé :", ...livraison.findings.map((finding) => `- ${finding}`)]),
        ...(livraison.review === null
          ? []
          : [
              "",
              `Relecture (${livraison.review.outcome}) : ${livraison.review.summary ?? "sans résumé"}`,
              ...livraison.review.findings.map(({ severity, file, text }) => `- ${severity}${file ? ` (\`${file}\`)` : ""} : ${text}`),
            ]),
      ],
      diff,
      ci,
      journaux,
    };
  };

  // Relancer avec un diagnostic précis : le ticket retourne au rail, et sa
  // livraison, s'il en a une, repart chez un cook qui lit le diagnostic à la
  // place des findings — comme un renvoi de la pass.
  const relancer = (carte: CarteRetenue, diagnostic: string): Execution =>
    base.transaction(() => {
      const sur = ticketDuRail(base, carte.ticket);
      if (sur?.state !== "pass" && sur?.state !== "86") return impossible(sur ? `#${carte.ticket} is ${sur.state}: only a ticket stopped in pass or 86 is relaunched` : `#${carte.ticket} is not on the rail`);
      const livraison = passDuTicket(base, carte.ticket);
      if (livraison?.branch) journal.ajouter({ project: projet, ticket: carte.ticket, author: AUTEUR, type: "pass.returned", payload: { n: livraison.returns + 1, findings: [diagnostic] } });
      rail.rendre(carte.ticket, RELANCE_DU_TRIAGE);
      return { faite: true };
    });

  // Redécouper : le découpage du manager, puis le ticket est 86 `split`, et
  // ses sous-tickets naissent comme ceux d'une épique.
  const redecouper = async (carte: CarteRetenue, motif: string | null): Promise<Execution> => {
    if (ticketDuRail(base, carte.ticket)?.state === "taken") return impossible(`a cook is working on #${carte.ticket}`);
    const issue = await github.issue(carte.ticket);
    if (!issue || issue.state !== "open") return impossible(`#${carte.ticket} is not an open issue`);
    const commentaires = (await github.commentaires(carte.ticket))
      .filter((commentaire) => DE_CONFIANCE.includes(commentaire.association) && !commentaire.body.includes(MARQUEUR_MANAGER))
      .map((commentaire) => commentaire.body);
    const echec = `Le triage a décidé de redécouper ce ticket plutôt que de le poser devant le chef${motif ? ` : ${motif}` : "."}`;
    // Le ticket est sur le rail, ou retenu par le chef : son auteur a la confiance du projet.
    const redecoupe = await atelier.redecouper({ ...issue, body: issue.body ?? "", association: "OWNER" }, commentaires, echec);
    if (redecoupe === null) return impossible("the split did not run");
    if ("impossible" in redecoupe) return impossible(`the split is impossible: ${redecoupe.impossible}`);
    return base.transaction(() => {
      const sur = ticketDuRail(base, carte.ticket);
      if (sur?.state === "taken") return impossible(`a cook took #${carte.ticket} during the split`);
      redecoupe.retenir();
      if (sur?.state === "pass") journal.ajouter({ project: projet, ticket: carte.ticket, author: AUTEUR, type: "pass.escalated", payload: { reason: REDECOUPE_EN_PASS } });
      if (sur?.state === "86") rail.rendre(carte.ticket, RELANCE_DU_TRIAGE);
      if (sur && sur.state !== "served") rail.quatreVingtSix(carte.ticket, { motif: REDECOUPE });
      return { faite: true };
    });
  };

  // Corriger une dépendance livrée : la ligne `attend` de la fiche ne la porte
  // plus.
  const corrigerLaDependance = async (carte: CarteRetenue, numero: number): Promise<Execution> => {
    const fiches = (await github.commentaires(carte.ticket)).filter((commentaire) => DE_CONFIANCE.includes(commentaire.association) && porteFiche(commentaire.body));
    const [lue] = fiches;
    if (lue === undefined || fiches.length > 1) return impossible(`#${carte.ticket} does not carry exactly one card (fiche)`);
    if (!fiche([lue.body])?.waitsFor.includes(numero)) return impossible(`the card of #${carte.ticket} does not wait for #${numero}`);
    const corrigee = sansAttente(lue.body, numero);
    if (corrigee === null) return impossible(`the card of #${carte.ticket} does not wait for #${numero}`);
    if (!(await github.remplacerCommentaire(carte.ticket, lue.body, corrigee))) return impossible(`the card of #${carte.ticket} changed during the triage`);
    return { faite: true };
  };

  // Attendre une CI lente : seulement si un check tourne encore. La carte
  // reste retenue, et se retrie passé le délai.
  const attendre = (dossier: Dossier): Execution => {
    if (!dossier.ci.some(({ outcome }) => outcome === "pending")) return impossible("no check of the delivery is still running");
    return { faite: true, until: new Date(atelier.maintenant().getTime() + ATTENTE_CI_MS).toISOString() };
  };

  // Retirer le ticket du rail : son label `fire` s'en va, il ne repart pas.
  const retirer = async (carte: CarteRetenue): Promise<Execution> => {
    const sur = ticketDuRail(base, carte.ticket);
    if (!sur || sur.state === "served") return impossible(`#${carte.ticket} is not on the rail`);
    if (sur.state === "taken") return impossible(`a cook is working on #${carte.ticket}`);
    await github.delabelliser(carte.ticket, LABEL);
    // Pris entre-temps : le label est retiré, et le sondage en rendra compte.
    if (ticketDuRail(base, carte.ticket)?.state === sur.state) journal.ajouter({ project: projet, ticket: carte.ticket, author: AUTEUR, type: "ticket.left", payload: { reason: "unfired" } });
    return { faite: true };
  };

  const executer = (carte: CarteRetenue, decision: Exclude<DecisionDuTriage, { action: "through" }>, dossier: Dossier): Promise<Execution> | Execution => {
    switch (decision.action) {
      case "relaunch":
        return relancer(carte, decision.diagnostic);
      case "resplit":
        return redecouper(carte, decision.motif);
      case "dependency":
        return corrigerLaDependance(carte, decision.dependance);
      case "wait":
        return attendre(dossier);
      case "remove":
        return retirer(carte);
    }
  };

  const trier = async (carte: CarteRetenue): Promise<void> => {
    let dossier: Dossier;
    try {
      dossier = await rassembler(carte);
    } catch (erreur) {
      // GitHub ne répond pas : la carte reste retenue, le tour suivant la reprend.
      if (!arrete()) avertir(`brigade : triage de la carte du ticket #${carte.ticket} reporté, ce qu'il doit lire ne se lit pas — ${message(erreur)}`);
      return;
    }
    if (arrete() || !tenue(carte)) return;
    const reponse = await atelier.demander({ numero: carte.ticket, prefixe: "trie", nom: "triage" }, consigneDeTriage(dossier), lireTriage);
    if (arrete() || !tenue(carte)) return;
    if (reponse === null) return laisserPasser(carte, "the triage agent did not answer", null);
    if ("illisible" in reponse) {
      avertir(`brigade : triage illisible sur le ticket #${carte.ticket} (${reponse.illisible}) — la carte entre dans TODO`);
      return laisserPasser(carte, `unreadable answer: ${reponse.illisible}`, reponse.run);
    }
    const { run, valeur } = reponse;
    if (valeur.action === "through") return laisserPasser(carte, valeur.motif ?? "the triage agent sends the card to the chef", run);
    let execution: Execution;
    try {
      execution = await executer(carte, valeur, dossier);
    } catch (erreur) {
      execution = impossible(message(erreur));
    }
    if (arrete()) return;
    if (!execution.faite) {
      avertir(`brigade : le triage voulait ${valeur.action} sur le ticket #${carte.ticket}, impossible (${execution.pourquoi}) — la carte entre dans TODO`);
      return laisserPasser(carte, `${valeur.action} chosen, but impossible: ${execution.pourquoi}`, run);
    }
    base.transaction(() => {
      noter(carte, valeur.action, valeur.motif ?? valeur.phrase, run, valeur.phrase, execution.until ?? null);
      // Une carte que ce ticket avait déjà dans TODO n'est plus au chef.
      if (cartesEnTodo(base).some((autre) => autre.ticket === carte.ticket)) sortirDeTodo(journal, projet, carte.ticket, `settled by the triage: ${valeur.action}`, AUTEUR);
    });
    try {
      await github.commenter(carte.ticket, `${MARQUEUR_MANAGER}\n${valeur.phrase}`);
    } catch (erreur) {
      if (!arrete()) avertir(`brigade : phrase du triage non posée sur le ticket #${carte.ticket} — ${message(erreur)}`);
    }
  };

  return {
    // Trie chaque carte retenue, une à la fois. Sans de quoi lancer l'agent —
    // « stop », disjoncteur, compte retenu —, la carte entre dans TODO : le
    // triage ne cache rien au chef faute de pouvoir décider.
    async traiter(): Promise<void> {
      for (const carte of cartesRetenues(base)) {
        if (arrete()) return;
        if (carte.until !== null && Date.parse(carte.until) > atelier.maintenant().getTime()) continue;
        if (!atelier.peutJuger()) {
          laisserPasser(carte, "the triage agent cannot run: kitchen stopped, breaker open, or account held", null);
          continue;
        }
        await trier(carte);
      }
    },

    // Le triage ne retient plus : le manager est éteint. Chaque carte retenue
    // entre dans TODO.
    relacher(pourquoi: string): void {
      for (const carte of cartesRetenues(base)) laisserPasser(carte, pourquoi, null);
    },
  };
}
