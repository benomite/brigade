// Un cook bloqué sur une question que la preuve de la mesure répond (#2841,
// épique #2838). Le cook d'un ticket de mesure — le ticket de qualité, qui
// compte des tickets renvoyés (`alerte-qualite.ts`) — s'arrêtait bloqué en
// demandant les numéros des tickets, les motifs de leurs renvois ou de leurs
// échecs, leurs instants : une question purement technique, posée au chef
// sous `blocked-on-human` (#2832, #2837, BOBL-tech/espace#825). La station a
// ces faits : les commentaires `brigade:renvoi` et `brigade:echec` que les
// stations ont écrits sur chaque ticket compté. Elle les ajoute au corps du
// ticket, sous une marque, et le rend à un cook, sans `blocked-on-human`.
//
// Une seule fois : un ticket qui porte déjà la marque et bloque encore va au
// manager (#2894, `blocage-au-manager.ts`), comme une question que la preuve ne
// répond pas, ou une preuve que la station ne peut pas lire ou écrire.
import { DE_CONFIANCE } from "./alimenter.ts";
import { comptesDe, MARQUE_QUALITE } from "./alerte-qualite.ts";
import type { GitHubDuTour } from "./brigade-github.ts";
import { MARQUE_D_ECHEC, MARQUE_DE_RENVOI, raisonDe } from "./qualite-github.ts";

export const MARQUE_DE_PREUVE = "<!-- brigade:preuve -->";

// Ce que la preuve d'une mesure répond : quels tickets, leurs renvois ou
// cooks sans livraison, leurs motifs, leurs instants, les événements de la fenêtre.
const SUJETS_DE_LA_PREUVE = /\b(ticket numbers?|which tickets?|send-?backs?|sent back|renvois?|reasons?|motifs?|failed cooks?|cooks? without (?:a )?delivery|[ée]checs?|timestamps?|journal|events?|window)\b/i;

export const repondParLaPreuve = (question: string): boolean => SUJETS_DE_LA_PREUVE.test(question);

type Fait = { createdAt: string; genre: string; raison: string };

// La section ajoutée au corps : pour chaque ticket compté, ses renvois et ses
// cooks sans livraison, avec leur instant et leur motif, tels que les stations les ont écrits.
export function sectionDeLaPreuve(question: string, faits: ReadonlyMap<number, readonly Fait[]>): string {
  const citee = question.split("\n").map((ligne) => `> ${ligne}`).join("\n");
  return [
    MARQUE_DE_PREUVE,
    "## Evidence (added by the station)",
    "",
    "A cook stopped blocked on a question this evidence answers:",
    "",
    citee,
    "",
    "Each counted ticket, with every send-back and cook without a delivery a station wrote on it (`brigade:renvoi`, `brigade:echec`): when, and its reason.",
    ...[...faits].flatMap(([ticket, liste]) => ["", `### #${ticket}`, "", ...(liste.length === 0 ? ["- no send-back or cook without a delivery written by a station"] : liste.map(({ createdAt, genre, raison }) => `- ${createdAt} — ${genre}: ${raison}`))]),
  ].join("\n");
}

// `null` : pas un cas de preuve — le ticket ne compte aucun ticket, ou la
// question ne demande pas ce que la preuve dit. `relance: false` : un cas de
// preuve que la station ne peut pas servir, et pourquoi ; le blocage va au manager.
export type Relance = null | { relance: true } | { relance: false; pourquoi: string };

// Ajoute la preuve au corps du ticket bloqué si elle répond à sa question.
// Une lecture ou une écriture qui échoue ne relance rien : le chemin d'avant reprend.
export async function ajouterLaPreuve(github: Pick<GitHubDuTour, "corpsDuTicket" | "commentaires" | "ecrireCorps">, issue: number, question: string): Promise<Relance> {
  if (!repondParLaPreuve(question)) return null;
  let corps: string;
  try {
    corps = await github.corpsDuTicket(issue);
  } catch (erreur) {
    return { relance: false, pourquoi: `the ticket's body could not be read: ${erreur instanceof Error ? erreur.message : String(erreur)}` };
  }
  const comptes = corps.includes(MARQUE_QUALITE) ? comptesDe(corps) : [];
  if (comptes.length === 0) return null;
  if (corps.includes(MARQUE_DE_PREUVE)) return { relance: false, pourquoi: "the ticket already carried the evidence, and its cook still blocked" };
  if (github.ecrireCorps === undefined) return { relance: false, pourquoi: "this GitHub client cannot write the ticket's body" };
  const faits = new Map<number, Fait[]>();
  try {
    for (const ticket of comptes) {
      const siens = (await github.commentaires(ticket)).filter(({ association }) => DE_CONFIANCE.includes(association));
      faits.set(
        ticket,
        siens.flatMap(({ body, createdAt }) => {
          if (body.startsWith(MARQUE_DE_RENVOI)) return [{ createdAt, genre: "send-back", raison: raisonDe(body) }];
          if (body.startsWith(MARQUE_D_ECHEC)) return [{ createdAt, genre: "cook without a delivery", raison: raisonDe(body) }];
          return [];
        }),
      );
    }
    await github.ecrireCorps(issue, `${corps.trimEnd()}\n\n${sectionDeLaPreuve(question, faits)}\n`);
  } catch (erreur) {
    return { relance: false, pourquoi: `the evidence could not be gathered or written: ${erreur instanceof Error ? erreur.message : String(erreur)}` };
  }
  return { relance: true };
}
