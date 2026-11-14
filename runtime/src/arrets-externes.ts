// Les arrêts externes d'avant #3528 (#3528) : un cook tué du dehors — SIGTERM, code 143 : la
// station qui redémarre ou se met à jour, l'app fermée — ne compte ni pour le disjoncteur ni pour
// les essais de son ticket. Les cooks d'avant le correctif les ont comptés, et mis des tickets de
// côté pour cela (secondes#21 : « 2 cooks in a row stopped without delivering anything »).
//
// Au premier tour de la station, une fois, chaque ticket mis de côté par son compte d'échecs relit
// ses échecs notés : sans les arrêts externes, le compte ne tient plus, le ticket revient sur le rail
// sans qu'aucun chef ne le reprenne. Le retrait du label date, sur GitHub, le nouveau départ du
// compte (`depuisLeRelancement`) : les échecs externes d'avant ne comptent plus jamais.
//
// L'appel vient du tour de la station (`brigade-github.ts`).
import { estMisDeCote, LABEL, MIS_DE_COTE, type GitHub } from "./github.ts";
import { horsCuisine } from "./seuil-served-elsewhere.ts";

export const MARQUE_DE_LA_RECONCILIATION = "<!-- brigade:reconciliation-externe -->";

// Un échec noté dont la fin est un arrêt externe : le code 143, ou le signal SIGTERM, que
// `direLaFin` écrit dans le motif.
export const estUnArretExterne = (motif: string): boolean => /\(exit code 143\b|signal SIGTERM\b/.test(motif);

// Ce que la station a écrit sur ce ticket en le mettant de côté : le dernier commentaire de la station
// est celui d'un échec qui le met de côté. Un renvoi, ou un label posé à la main, n'en est pas un.
const MISE_DE_COTE_PAR_LES_ECHECS = /Taken off the kitchen|Set aside by its failure count/;
const motifDe = (corps: string) => corps.match(/ — ([^\n]*)/)?.[1] ?? "";

export type OptionsDeLaReconciliation = {
  github: Pick<GitHub, "commenter" | "labelliser" | "delabelliser"> & { commentaires(numero: number): Promise<{ body: string }[]> };
  station: string;
  // Les commentaires d'échec (`MARQUE_D_ECHEC`) comptés depuis le dernier retrait du label, du plus ancien au plus récent.
  echecs(numero: number): Promise<{ body: string }[]>;
  avertir(texte: string): void;
};

// Rend les tickets remis sur le rail. Un ticket illisible reste tel quel, dit, et la reconciliation
// recommence au tour suivant.
export async function reconcilierLesArretsExternes(tickets: readonly { number: number; labels: readonly string[] }[], options: OptionsDeLaReconciliation): Promise<{ rendus: number[]; complete: boolean }> {
  const { github, station, avertir } = options;
  const rendus: number[] = [];
  let complete = true;
  for (const ticket of tickets.filter(({ labels }) => estMisDeCote(labels))) {
    try {
      const commentaires = await github.commentaires(ticket.number);
      const dernierDeLaStation = commentaires.filter(({ body }) => body.startsWith("<!-- brigade:echec") || body.startsWith("<!-- brigade:renvoi")).at(-1);
      if (dernierDeLaStation === undefined || !dernierDeLaStation.body.startsWith("<!-- brigade:echec") || !MISE_DE_COTE_PAR_LES_ECHECS.test(dernierDeLaStation.body)) continue;
      const echecs = await options.echecs(ticket.number);
      const propres = echecs.filter(({ body }) => !estUnArretExterne(motifDe(body)));
      // Rien d'externe : le compte d'échecs tient tel qu'il est.
      if (propres.length === echecs.length) continue;
      if (horsCuisine(propres.map(({ body }) => ({ motif: motifDe(body), desaccord: false })))) continue;
      await github.commenter(ticket.number, `${MARQUE_DE_LA_RECONCILIATION}\nStation \`${station}\`: ${echecs.length - propres.length} of this ticket's ${echecs.length} cooks without a delivery were killed from outside (exit code 143, SIGTERM: a station restarting or updating, or the app closed), which is not a failed cook and counts for nothing. Without them the ticket is not set aside: it is back on the rail and a cook takes it again. Nobody needs to resume it.`);
      if (!ticket.labels.includes(LABEL)) await github.labelliser(ticket.number, [LABEL]);
      for (const label of MIS_DE_COTE) if (ticket.labels.includes(label)) await github.delabelliser(ticket.number, label);
      rendus.push(ticket.number);
    } catch (erreur) {
      complete = false;
      avertir(`brigade : #${ticket.number} sur ${station} — the cooks killed from outside could not be reconciled: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  }
  return { rendus, complete };
}
