// #4212 : un ticket a un plafond dur d'essais, réécritures du manager comprises.
// Le total d'un ticket ne se remet jamais à zéro ; à l'atteinte du plafond, le système l'arrête lui-même
// et écrit la raison sur l'issue, sans rien demander au chef (ni WAITING, ni carte TODO).

// 12 : le ticket compte `ECHECS_MAX` (3) essais par passage chez le manager, et le manager a droit à une reprise
// par relancement. Quatre passages complets (3 × 4) sont déjà plus que ce qu'un ticket sain consomme ; #4064, relancé
// plus de 26 fois, aurait été arrêté à la moitié de sa boucle.
export const PLAFOND_ESSAIS = 12;

export type Essai = {
  echec: string;
  // Un essai que le classeur de charge marque `load` (un autre ticket) reste hors du compte.
  charge?: boolean;
};

export type PlafondEssais = {
  enregistrerEssai(numero: number, essai: Essai): Promise<void>;
  // Une réécriture du manager relance le ticket : elle ne touche pas au total.
  reecrire(numero: number): void;
  // Reprend un total déjà écrit sur l'issue (les essais d'avant un redémarrage de la station).
  amorcer(numero: number, total: number): void;
  total(numero: number): number;
  peutLancer(numero: number): boolean;
};

export type OptionsPlafondEssais = {
  plafond?: number;
  arreter: (numero: number) => Promise<void>;
  commenter: (numero: number, corps: string) => Promise<void>;
  // Jamais appelé pour le plafond : accepté pour que les tests le prouvent.
  chef?: { demanderAttente: () => void; creerCarteTodo: () => void };
};

export function corpsDuPlafond(plafond: number, total: number, echec: string): string {
  return `Station: this ticket reached its hard cap of ${plafond} tries, rewrites included (${total} tries so far). The system stopped it: it is not launched again, and nothing is asked of the chef.\n\nLast failure: ${echec}`;
}

export function creerPlafondEssais(options: OptionsPlafondEssais): PlafondEssais {
  const plafond = options.plafond ?? PLAFOND_ESSAIS;
  const totaux = new Map<number, number>();
  const total = (numero: number) => totaux.get(numero) ?? 0;
  return {
    async enregistrerEssai(numero, { echec, charge = false }) {
      if (charge) return;
      const avant = total(numero);
      totaux.set(numero, avant + 1);
      if (avant + 1 < plafond) return;
      await options.arreter(numero);
      await options.commenter(numero, corpsDuPlafond(plafond, avant + 1, echec));
    },
    reecrire() {},
    amorcer(numero, depart) {
      totaux.set(numero, Math.max(total(numero), depart));
    },
    total,
    peutLancer: (numero) => total(numero) < plafond,
  };
}
