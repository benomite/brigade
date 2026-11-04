// Quand démarrer une station cloud, quand l'arrêter (épique #2223) : une
// station cloud démarre quand le rail a des tickets à servir et qu'aucune
// station libre ne les prend, et s'arrête quand le rail est vide.
//
// Une station cloud est une station comme les autres : elle prend, cuisine,
// relit et merge sur GitHub seul, sous les mêmes gardes — CI verte avant tout
// merge, budget, disjoncteur. Ce module ne décide que de la faire tourner ou
// non ; il n'ouvre aucun chemin à côté de ces gardes, et n'en a pas besoin.
//
// Un geste par tour : au plus une station démarre. Si le rail déborde encore au
// tour suivant, la station démarrée au tour d'avant compte comme un preneur
// libre tant qu'elle ne tient rien, et une autre ne démarre que si des tickets
// restent sans preneur.
//
// Une station cloud qui tient un ticket ne s'arrête pas, même rail vide : on
// perdrait son travail. Elle s'arrête au premier tour où elle est libre et où
// le rail est vide.
import type { Fournisseur, StationCloud } from "./fournisseur.ts";

// Une station qui tourne pour le projet, telle que le tour la voit. `libre` :
// elle ne tient aucun ticket, elle prendrait le prochain. `cloud` : son id chez
// le fournisseur, ou null pour une station locale.
export type StationEnCours = { nom: string; libre: boolean; cloud: string | null };

// La réponse des plafonds du projet (stations à la fois, heures par jour, par
// mois) à « une station de plus peut-elle démarrer ? », et le plafond qui
// l'empêche quand non.
export type Accord = { permis: true } | { permis: false; plafond: string };

// Ce que le tour lit : le nombre de tickets du rail qu'une station libre
// prendrait maintenant, les stations qui tournent, et la réponse des plafonds.
export type Situation = { servables: number; stations: StationEnCours[]; plafonds: Accord };

// `demarrer` : une station cloud de plus. `arreter` : les stations cloud à
// arrêter, par leur id chez le fournisseur. `rien` : rien à faire, et pourquoi
// — le rail est vide et aucune station cloud n'est libre de s'arrêter, une
// station libre prendra les tickets, ou un plafond empêche de démarrer.
export type Decision =
  | { geste: "demarrer" }
  | { geste: "arreter"; ids: string[] }
  | { geste: "rien"; raison: "rail-vide" | "preneur-libre" }
  | { geste: "rien"; raison: "plafond"; plafond: string };

// Ce qu'il faut faire, d'après la situation du projet.
export function decider({ servables, stations, plafonds }: Situation): Decision {
  if (servables <= 0) {
    const ids = stations.flatMap((station) => (station.cloud !== null && station.libre ? [station.cloud] : []));
    return ids.length > 0 ? { geste: "arreter", ids } : { geste: "rien", raison: "rail-vide" };
  }
  // Chaque station libre, locale ou cloud, prendra un ticket : on ne démarre
  // que pour ceux qui resteraient sans preneur.
  const libres = stations.filter((station) => station.libre).length;
  if (servables <= libres) return { geste: "rien", raison: "preneur-libre" };
  if (!plafonds.permis) return { geste: "rien", raison: "plafond", plafond: plafonds.plafond };
  return { geste: "demarrer" };
}

export type Tour = {
  fournisseur: Fournisseur;
  projet: string;
  // Les tickets du rail qu'une station libre prendrait maintenant.
  servables: number;
  // Les stations locales du projet.
  locales: { nom: string; libre: boolean }[];
  // Les noms des stations qui tiennent un ticket, telles que GitHub le dit.
  occupees: ReadonlySet<string>;
  // La réponse des plafonds, sachant les stations cloud qui tournent.
  plafonds(enCours: StationCloud[]): Accord;
};

// Un tour de l'autoscaler : lit les stations cloud chez le fournisseur, décide,
// et fait le geste décidé. Rend la décision.
export async function tourner({ fournisseur, projet, servables, locales, occupees, plafonds }: Tour): Promise<Decision> {
  const enCours = await fournisseur.lister(projet);
  const stations: StationEnCours[] = [
    ...locales.map(({ nom, libre }) => ({ nom, libre, cloud: null })),
    ...enCours.map(({ id, nom }) => ({ nom, libre: !occupees.has(nom), cloud: id })),
  ];
  const decision = decider({ servables, stations, plafonds: plafonds(enCours) });
  if (decision.geste === "demarrer") await fournisseur.demarrer(projet);
  else if (decision.geste === "arreter") {
    for (const id of decision.ids) await fournisseur.arreter(id);
  }
  return decision;
}
