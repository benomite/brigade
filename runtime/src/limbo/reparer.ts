// Les limbes (#4215, épique #4112) : un ticket que le manager a jugé, et que plus rien ne montre ni ne fait avancer.
// BOBL-tech/espace#221, jugé « decision issue » le 2026-11-23 — il attend le client, avec des réponses à choisir —,
// n'avait plus ni label de décision, ni calibrage, ni attente : aucune carte ne demandait rien au chef, aucun cook ne
// partait. La réparation lit le jugement du manager, seule source de vérité, quoi qu'il soit arrivé aux labels depuis :
// - jugé décision pour le chef, sans décision ouverte : sa carte de TODO, avec les réponses du jugement, revient ;
// - jugé en attente : le ticket se parque, la raison du manager dite en commentaire.
// - refusé pour une autre raison, sans décision stockée (#4219), avec `fire` : de même, avec la raison de son refus.
// Un ticket calibré, qui a une décision ouverte (le label `decision`, une carte) ou qui est déjà parqué, n'est pas
// touché ; un jugement auquel le chef a déjà répondu (`<!-- brigade:reponse`) attend que le manager le rejuge. Chaque
// geste se dit sur le ticket (`<!-- brigade:limbo -->`). La réparation est idempotente : un ticket réparé a sa carte ou
// son attente, et le tour suivant ne le voit plus en limbes.
//
// `reparerLesLimbes` ne lit et n'écrit que par ce qu'on lui donne ; `repairLimboOnGitHub` (on-github.ts) le
// branche sur le client GitHub de la station et les cartes `chef-todo`, et la guérison de chaque tour le joue
// (guerison/index.ts).
import { corpsDuParking } from "../attente-github/marque.ts";
import { RELANCE_PAR_DEFAUT_MS } from "../attente.ts";
import { ordonnerLesReponses, raisonDuRefus, recommandeeDuRefus } from "../decision/reponses.ts";
import { estParque } from "../github-etat/etats.ts";
import { MARQUEUR_MANAGER } from "../juger.ts";

// Ce que la réparation lit d'un ticket : ses labels et ses commentaires, du plus ancien au plus récent.
export type LimboTicket = { numero: number; etat: "open" | "closed"; etiquettes: string[]; commentaires: { corps: string }[] };

export type LimboGitHub = {
  listerTickets(): Promise<LimboTicket[]>;
  ajouterEtiquette(numero: number, nom: string): Promise<void>;
  retirerEtiquette(numero: number, nom: string): Promise<void>;
  commenter(numero: number, corps: string): Promise<void>;
};

// Une carte de TODO : la question posée au chef, et les réponses qu'il clique.
export type LimboCard = { numero: number; question: string; choix: string[] };
export type LimboCards = { lister(): Promise<LimboCard[]>; poser(carte: LimboCard): Promise<void> };

export type LimboOptions = {
  github: LimboGitHub;
  cartes: LimboCards;
  // Le label qui parque. `waiting` par défaut, le label d'attente que le contrat du ticket nomme, et qui se lit
  // toujours comme parqué (github-etat/etats.ts) ; sur GitHub, la station pose `parked`.
  labelDAttente?: string;
  maintenant?: () => Date;
};

// Ce qu'un jugement du manager demande.
type Jugement =
  | { quoi: "decision"; question: string | null; reponses: string[] }
  | { quoi: "attente"; raison: string; qui: string | null }
  | { quoi: "autre" };

export const LIMBO_MARK = "<!-- brigade:limbo -->";
const MARQUE_DE_REPONSE = /^\s*<!--\s*brigade:reponse\b/;

// Les deux formes d'un jugement : celle du contrat (`Judgment: decision` / `Answers:`, `Judgment: on hold` /
// `Reason:`), et le refus que le manager écrit (manager.ts, `dire`) — `**Manager — not a workable ticket: a decision
// issue.**` ou `a question`, puis sa question et une ligne `- [resume|close|wait] <réponse>` par réponse. Tout autre
// verdict du manager (`**Manager — …`) remplace le jugement d'avant ; un commentaire du manager qui n'en est pas un
// (null) ne remplace rien.
function lireJugement(corps: string): Jugement | null {
  if (!corps.startsWith(MARQUEUR_MANAGER)) return null;
  const lignes = corps.slice(MARQUEUR_MANAGER.length).split("\n").map((ligne) => ligne.trim());
  const valeur = (cle: string) => lignes.find((ligne) => ligne.toLowerCase().startsWith(`${cle.toLowerCase()}:`))?.slice(cle.length + 1).trim() ?? null;
  const dit = valeur("Judgment");
  if (dit !== null) {
    const nature = dit.toLowerCase();
    if (nature === "decision" || nature === "question") {
      const debut = lignes.findIndex((ligne) => /^answers:/i.test(ligne));
      const reponses: string[] = [];
      for (const ligne of debut < 0 ? [] : lignes.slice(debut + 1)) {
        if (!ligne.startsWith("- ")) break;
        if (ligne.slice(2).trim() !== "") reponses.push(ligne.slice(2).trim());
      }
      return { quoi: "decision", question: valeur("Question") || null, reponses };
    }
    if (nature === "on hold") {
      const raison = valeur("Reason");
      return raison ? { quoi: "attente", raison, qui: valeur("Awaits") || null } : { quoi: "autre" };
    }
    return { quoi: "autre" };
  }
  const entete = lignes.find((ligne) => ligne !== "");
  if (entete === undefined || !entete.startsWith("**Manager — ")) return null;
  if (!/^\*\*Manager — not a workable ticket: (a decision issue|a question)\.\*\*/.test(entete)) {
    // Un autre refus, sans décision stockée : sa raison met le ticket en attente (#4219).
    const raison = raisonDuRefus(lignes);
    return raison === null ? { quoi: "autre" } : { quoi: "attente", raison, qui: null };
  }
  const premiere = lignes.findIndex((ligne) => /^- \[(resume|close|wait)\] /.test(ligne));
  const lues = premiere < 0 ? [] : lignes.slice(premiere).filter((ligne) => /^- \[(resume|close|wait)\] /.test(ligne)).map((ligne) => ligne.replace(/^- \[[a-z]+\] /, "").trim());
  // La recommandée d'abord, comme sur la carte que le manager pose (#4219), même d'un refus écrit avant.
  const reponses = ordonnerLesReponses(lues, recommandeeDuRefus(lignes));
  const question = premiere < 0 ? null : (lignes.slice(0, premiere).findLast((ligne) => ligne.endsWith("?")) ?? null);
  return { quoi: "decision", question, reponses };
}

// Le dernier jugement du ticket, et ce qui l'a suivi : `repondu`, le chef y a déjà répondu.
function dernierJugement(commentaires: readonly { corps: string }[]): { jugement: Jugement; repondu: boolean } | null {
  for (let i = commentaires.length - 1; i >= 0; i--) {
    const jugement = lireJugement(commentaires[i]?.corps ?? "");
    if (jugement === null) continue;
    return { jugement, repondu: commentaires.slice(i + 1).some(({ corps }) => MARQUE_DE_REPONSE.test(corps)) };
  }
  return null;
}

export const isCalibrated = (etiquettes: readonly string[]) => etiquettes.some((e) => e.startsWith("model:")) && etiquettes.some((e) => e.startsWith("effort:"));

// Ce que la réparation fait d'un ticket, ou null s'il n'est pas en limbes.
function geste(ticket: LimboTicket, carte: boolean, labelDAttente: string): Exclude<Jugement, { quoi: "autre" }> | null {
  if (ticket.etat !== "open" || isCalibrated(ticket.etiquettes) || carte) return null;
  if (ticket.etiquettes.includes("decision") || ticket.etiquettes.includes(labelDAttente) || estParque(ticket.etiquettes)) return null;
  const dernier = dernierJugement(ticket.commentaires);
  if (dernier === null || dernier.repondu || dernier.jugement.quoi === "autre") return null;
  if (dernier.jugement.quoi === "attente" && !ticket.etiquettes.includes("fire")) return null;
  return dernier.jugement;
}

// La question de la carte : celle du jugement, ou celle que le manager pose quand il n'en a écrit aucune.
const questionDeLaCarte = (numero: number, question: string | null) => question ?? `The manager judged #${numero} a decision issue: which answer do you choose?`;

/**
 * Répare chaque ticket en limbes. Un ticket qui échoue ne retient pas les autres : la réparation va jusqu'au bout, puis
 * lève une erreur qui les nomme, et le tour suivant les reprend. Une liste ou des cartes illisibles ne réparent rien.
 */
export async function reparerLesLimbes(options: LimboOptions): Promise<void> {
  const { github, cartes } = options;
  const labelDAttente = options.labelDAttente ?? "waiting";
  const maintenant = options.maintenant ?? (() => new Date());
  const tickets = await github.listerTickets();
  const ouvertes = new Set((await cartes.lister()).map(({ numero }) => numero));
  const echecs: string[] = [];
  for (const ticket of tickets) {
    const aFaire = geste(ticket, ouvertes.has(ticket.numero), labelDAttente);
    if (aFaire === null) continue;
    try {
      if (aFaire.quoi === "decision") {
        const question = questionDeLaCarte(ticket.numero, aFaire.question);
        await cartes.poser({ numero: ticket.numero, question, choix: aFaire.reponses });
        await github.commenter(
          ticket.numero,
          [
            LIMBO_MARK,
            `**Kitchen — the manager's decision is back in the chef's TODO.** The manager judged this issue a decision for the chef, and nothing showed it any more: no open decision, no calibration, no hold. Its card is posed again, with the manager's answers:`,
            "",
            question,
            ...aFaire.reponses.map((reponse) => `- ${reponse}`),
          ].join("\n"),
        );
      } else {
        const attente = { what: aFaire.raison, who: aFaire.qui ?? "whoever the manager's reason names", followUp: new Date(maintenant().getTime() + RELANCE_PAR_DEFAUT_MS).toISOString() };
        await github.ajouterEtiquette(ticket.numero, labelDAttente);
        try {
          await github.commenter(
            ticket.numero,
            [corpsDuParking(attente), "", LIMBO_MARK, `**Kitchen — put on hold, as the manager judged.** \`fire\` was set with no calibration, no open decision and no hold. The manager's reason: ${aFaire.raison}`].join("\n"),
          );
        } catch (erreur) {
          // Le ticket n'attend pas sans dire pourquoi : le label posé part, le tour suivant reprend.
          await github.retirerEtiquette(ticket.numero, labelDAttente);
          throw erreur;
        }
      }
    } catch (erreur) {
      echecs.push(`#${ticket.numero}: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  }
  if (echecs.length > 0) throw new Error(`limbo repair failed on ${echecs.join("; ")}`);
}
