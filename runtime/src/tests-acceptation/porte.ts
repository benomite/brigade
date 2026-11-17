// La porte de prise de l'étape « tests written » (#3725) : la station ne prend
// un ticket que s'il a passé l'étape. Un ticket `queued` part à l'écriture de
// ses tests — une seule à la fois par ticket —, et son saut le dit ; quand
// elle finit, la station rejoue un tour, et le prend.
//
// Un ticket sans critères d'acceptation n'a aucun test à geler : l'étape ne
// s'applique pas à lui, et il se prend comme avant, une fois son corps lu.
import { etapeDuRail } from "./etape.ts";
import type { Ecriture } from "./ecriture.ts";

// Les écritures ratées d'un ticket après lesquelles la station n'en lance plus :
// chacune coûte un lancement du manager.
export const ESSAIS_MAX = 3;

export type PorteDesTests = {
  // null : le ticket a passé l'étape, il se prend. Sinon, la ligne de son saut.
  porte(ticket: { number: number; labels: readonly string[] }): string | null;
  // Attend les écritures en cours.
  calme(): Promise<void>;
};

// `dejaParti` : le clone a déjà la branche du ticket, hors d'une écriture en
// cours — il a été pris avant que l'étape n'existe, et se prend tel quel.
export function porteDesTests(ecrire: (ticket: number) => Promise<Ecriture>, options: { apres: () => void; avertir: (message: string) => void; dejaParti?: (ticket: number) => boolean }): PorteDesTests {
  const enCours = new Map<number, Promise<void>>();
  const echecs = new Map<number, { fois: number; motif: string }>();
  const sansCriteres = new Set<number>();
  return {
    porte(ticket) {
      if (etapeDuRail(ticket.labels) !== "queued" || sansCriteres.has(ticket.number)) return null;
      if (enCours.has(ticket.number)) return "its acceptance tests are being written by the manager";
      if (options.dejaParti?.(ticket.number) === true) return null;
      const rate = echecs.get(ticket.number);
      if (rate !== undefined && rate.fois >= ESSAIS_MAX) return `its acceptance tests could not be written (${rate.fois} tries on this station, last: ${rate.motif})`;
      const ecriture = ecrire(ticket.number)
        .catch((erreur: unknown): Ecriture => ({ echec: erreur instanceof Error ? erreur.message : String(erreur) }))
        .then((fait) => {
          if ("echec" in fait) {
            const fois = (echecs.get(ticket.number)?.fois ?? 0) + 1;
            echecs.set(ticket.number, { fois, motif: fait.echec });
            options.avertir(`brigade : #${ticket.number} — its acceptance tests could not be written (${fois}/${ESSAIS_MAX}): ${fait.echec}`);
          } else {
            echecs.delete(ticket.number);
            if ("sansCriteres" in fait) sansCriteres.add(ticket.number);
          }
        })
        .finally(() => {
          enCours.delete(ticket.number);
          options.apres();
        });
      enCours.set(ticket.number, ecriture);
      return "its acceptance tests are being written by the manager";
    },
    calme: async () => {
      while (enCours.size > 0) await Promise.all([...enCours.values()]);
    },
  };
}
