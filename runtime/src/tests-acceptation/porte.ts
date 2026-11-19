// La porte de prise de l'étape « tests written » (#3725) : la station ne prend
// un ticket que s'il a passé l'étape. Un ticket `queued` part à l'écriture de
// ses tests — une seule à la fois par ticket —, et son saut le dit ; quand
// elle finit, la station rejoue un tour, et le prend.
//
// Les écritures de plusieurs tickets partent ensemble, sans file ni verrou qui
// leur soit propre : la station les compte dans ses places, comme ses cooks
// (`enEcriture`, #3742), et l'étape n'attend jamais son tour.
//
// Un ticket sans critères d'acceptation n'a aucun test à geler : l'étape ne
// s'applique pas à lui, et il se prend comme avant, une fois son corps lu.
//
// Un ticket retenu par un autre — un ticket ouvert qu'il attend, un ticket mis
// de côté, sa zone tenue — part aussi à l'écriture, pendant la retenue (#3872) :
// sa prise, à la levée, ne l'attend plus après elle.
import { etapeDuRail } from "./etape.ts";
import type { Ecriture } from "./ecriture.ts";

// Les écritures ratées d'un ticket après lesquelles la station n'en lance plus :
// chacune coûte un lancement du manager.
export const ESSAIS_MAX = 3;

// Le saut d'un ticket dont les tests s'écrivent.
export const EN_ECRITURE = "its acceptance tests are being written by the manager";

export type PorteDesTests = {
  // null : le ticket a passé l'étape, il se prend. Sinon, la ligne de son saut.
  porte(ticket: { number: number; labels: readonly string[] }): string | null;
  // Vrai si `porte` lancerait l'écriture des tests de ce ticket maintenant.
  aEcrire(ticket: { number: number; labels: readonly string[] }): boolean;
  // Les tickets dont les tests s'écrivent en ce moment : chacun tient une
  // place de la station, comme un cook (#3742).
  enEcriture(): number[];
  // Attend les écritures en cours.
  calme(): Promise<void>;
};

// `dejaParti` : le clone a déjà la branche du ticket, hors d'une écriture en
// cours — il a été pris avant que l'étape n'existe, et se prend tel quel.
export function porteDesTests(ecrire: (ticket: number) => Promise<Ecriture>, options: { apres: () => void; avertir: (message: string) => void; dejaParti?: (ticket: number) => boolean }): PorteDesTests {
  const enCours = new Map<number, Promise<void>>();
  const echecs = new Map<number, { fois: number; motif: string }>();
  const sansCriteres = new Set<number>();
  const aEcrire = (ticket: { number: number; labels: readonly string[] }) =>
    etapeDuRail(ticket.labels) === "queued" && !sansCriteres.has(ticket.number) && !enCours.has(ticket.number) && options.dejaParti?.(ticket.number) !== true && (echecs.get(ticket.number)?.fois ?? 0) < ESSAIS_MAX;
  return {
    aEcrire,
    porte(ticket) {
      if (etapeDuRail(ticket.labels) !== "queued" || sansCriteres.has(ticket.number)) return null;
      if (enCours.has(ticket.number)) return EN_ECRITURE;
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
            // Sans critère testable (#3740), pas plus de tests à geler.
            if ("sansCriteres" in fait || "sansTestable" in fait) sansCriteres.add(ticket.number);
          }
        })
        .finally(() => {
          enCours.delete(ticket.number);
          options.apres();
        });
      enCours.set(ticket.number, ecriture);
      return EN_ECRITURE;
    },
    enEcriture: () => [...enCours.keys()],
    calme: async () => {
      while (enCours.size > 0) await Promise.all([...enCours.values()]);
    },
  };
}
