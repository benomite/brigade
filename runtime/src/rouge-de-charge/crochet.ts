// Le crochet de la livraison sur des gates rouges (#4211) : un rouge `code`
// compte un essai raté, comme avant ; un rouge `load` n'en compte aucun, le
// dit en une ligne avec la charge, et remet le ticket sur le rail, rejoué dès
// que la machine est calme (`rejouerQuandCalme`).
import type { Gates } from "../events/pass.ts";
import { classerLeRouge, seuilDeCharge, type ClasseDuRouge } from "./classeur.ts";

// Les essais ratés du ticket : `ajouter` en compte un. `compter`, s'il est donné, les lit.
export type Essais = { ajouter(ticket: number): void; compter?(ticket: number): number };
export type Journal = { ecrire(ligne: string): void };
export type Rail = { remettre(ticket: number): void };

const nombre = (valeur: number) => valeur.toLocaleString("en-US", { maximumFractionDigits: 2 });

export async function enregistrerGatesRouges({
  ticket,
  gates,
  lireCharge,
  essais,
  journal,
  rail,
  seuil = seuilDeCharge(process.env),
}: {
  ticket: number;
  gates: Gates;
  lireCharge: () => number;
  essais: Essais;
  journal: Journal;
  rail: Rail;
  seuil?: number;
}): Promise<{ classe: ClasseDuRouge }> {
  // Lue une fois : la ligne dit la charge même qui a classé le rouge.
  const charge = lireCharge();
  const classe = classerLeRouge({ gates, lireCharge: () => charge, seuil });
  if (classe === "code") {
    essais.ajouter(ticket);
    return { classe };
  }
  journal.ecrire(`#${ticket}: its gates are red because of machine load (load ${nombre(charge)} for at most ${nombre(seuil)}), not of its code: no failed try is counted, the ticket goes back on the rail and its gates are replayed once the machine is calm`);
  rail.remettre(ticket);
  return { classe };
}

// Rejoue les tickets remis sur le rail pour la charge, dès qu'elle est repassée
// sous le seuil ; aucun tant qu'elle ne l'est pas. `rail` : celui où ils attendent.
export async function rejouerQuandCalme({
  tickets,
  lireCharge,
  rejouer,
  seuil = seuilDeCharge(process.env),
}: {
  tickets: readonly number[];
  lireCharge: () => number;
  rail: Rail;
  rejouer: (ticket: number) => void | Promise<void>;
  seuil?: number;
}): Promise<void> {
  if (lireCharge() > seuil) return;
  for (const ticket of [...tickets]) await rejouer(ticket);
}
