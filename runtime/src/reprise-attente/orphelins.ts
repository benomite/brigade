// Un ticket `taken` qu'aucun cook ne cuit et qu'aucune attente ne retient perd
// `taken` et rentre sur le rail (#3883). Le 2026-11-19, la station box/claude a
// mis #3764 sur une attente datée en gardant `taken`, puis a redémarré deux
// fois : aucun cook n'est reparti, et le ticket a tenu sa zone plus de deux
// heures — la porte de prise sautait #3761 et #3786, « zone held by #3764 ».
//
// L'attente ne vit pas dans la mémoire d'une station : sa date est écrite sur
// l'issue, dans le commentaire `brigade:attente until=<ms>` que la station
// poste quand elle la pose. Chaque tour la relit — au démarrage comme ensuite :
// une attente posée avant un redémarrage est réarmée à son premier tour, et
// une date passée pendant ce redémarrage n'est pas perdue.
//
// Aucun cook ne tourne sur le ticket, sur aucune station, quand :
//   - cette station le tient et n'y fait tourner aucun cook (la veille ne
//     regarde que les tickets sans cook ici) ;
//   - une autre le tient, et l'issue porte, après sa prise, une attente : le
//     cook de cette prise s'est arrêté, et aucun ne repart sans une prise neuve ;
//   - une autre le tient depuis plus que la vie d'un cook (`COOK_LE_PLUS_LONG_MS`).
// Ni cook ni attente vivante depuis plus de `ORPHELIN_APRES_MS`, comptés du
// premier tour qui l'a vu ainsi : sa prise est lâchée au nom de la station qui
// la tenait, `taken` part, et un commentaire dit pourquoi.
import { MARQUE_D_ATTENTE } from "../qualite-github.ts";
import { tenant, type CommentaireDePrise, type GitHubDeLaPrise } from "../github-etat/prise.ts";
import { LABEL_TAKEN } from "../github-etat/etats.ts";

// Combien de temps un ticket reste `taken` sans cook ni attente vivante avant d'être rendu au rail.
export const ORPHELIN_APRES_MS = 5 * 60_000;

// Au-delà, aucun cook ne tourne plus sous une prise : le plafond de durée d'un
// cook est de 60 min par défaut (`BRIGADE_MAX_MINUTES`), et ce plus long
// laisse place à un plafond relevé, aux tests d'acceptation et à la livraison.
export const COOK_LE_PLUS_LONG_MS = 6 * 60 * 60_000;

// Le terme (ms) de la dernière attente d'après un arrêt, s'il n'est pas passé ; sinon null.
export function termeDeLAttente(commentaires: readonly { body: string }[], instant: number): number | null {
  const derniere = commentaires.filter((c) => c.body.startsWith(MARQUE_D_ATTENTE)).pop();
  const terme = Number(/until=(\d+)/.exec(derniere?.body ?? "")?.[1]);
  return Number.isFinite(terme) && terme > instant ? terme : null;
}

// La station qui tient le ticket, s'il n'a ni cook sur aucune station ni
// attente vivante ; null sinon — personne ne le tient (`purger` s'en charge),
// ou un cook peut y tourner sur une autre station, ou il attend. `station` n'y
// fait tourner aucun cook. `commentaires` sont ceux de l'issue, lue avec `fire`
// et `taken` : sa prise se lit sur eux seuls (`lireTenant`).
function tenantSansCook(commentaires: readonly CommentaireDePrise[], { station, instant }: { station: string; instant: number }): string | null {
  const tient = tenant([...commentaires], []);
  if (tient === null || termeDeLAttente(commentaires, instant) !== null) return null;
  if (tient.station === station) return tient.station;
  const prise = commentaires.findIndex((c) => c.id === tient.commentaire);
  if (commentaires.slice(prise + 1).some((c) => c.body.startsWith(MARQUE_D_ATTENTE))) return tient.station;
  const depuis = Date.parse(tient.createdAt);
  return instant - depuis > COOK_LE_PLUS_LONG_MS ? tient.station : null;
}

const corpsDeLaLiberation = (station: string, tenant: string) =>
  `<!-- brigade:lache station=${tenant} -->\nStation \`${station}\`: this ticket was \`taken\` by station \`${tenant}\` with no cook on any station and no wait for more than ${ORPHELIN_APRES_MS / 60_000} minutes. Its claim is released and \`taken\` is removed: the ticket returns to the rail.`;

export type VeilleDesOrphelins = {
  // Regarde un ticket `taken` du tour, sans cook sur cette station ; rend vrai s'il vient d'être rendu au rail, le commentaire posé sur l'issue le disant.
  voir(ticket: { number: number }): Promise<boolean>;
  // Les tickets que le tour n'a pas regardés oublient leur premier instant sans cook.
  finirLeTour(vus: ReadonlySet<number>): void;
};

export function veilleDesOrphelins({ github, station, maintenant }: { github: Pick<GitHubDeLaPrise, "commentaires" | "commenter" | "delabelliser">; station: string; maintenant: () => number }): VeilleDesOrphelins {
  // Le premier instant où un tour a vu chaque ticket sans cook ni attente.
  const depuis = new Map<number, number>();
  return {
    async voir(ticket) {
      const instant = maintenant(); 
      const tient = tenantSansCook(await github.commentaires(ticket.number), { station, instant });
      if (tient === null) {
        depuis.delete(ticket.number);
        return false;
      }
      const vu = depuis.get(ticket.number) ?? instant;
      depuis.set(ticket.number, vu);
      if (instant - vu <= ORPHELIN_APRES_MS) return false;
      await github.commenter(ticket.number, corpsDeLaLiberation(station, tient));
      try {
        await github.delabelliser(ticket.number, LABEL_TAKEN);
      } catch (erreur) {
        // Déjà parti entre la lecture et le retrait : rien à retirer.
        if (!/\b404\b|not found/i.test(erreur instanceof Error ? erreur.message : String(erreur))) throw erreur;
      }
      depuis.delete(ticket.number);
      return true;
    },
    finirLeTour(vus) {
      for (const numero of depuis.keys()) if (!vus.has(numero)) depuis.delete(numero);
    },
  };
}
