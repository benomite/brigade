// La retenue en cours, relue du journal : le dernier `kitchen.held` qu'aucun
// `kitchen.hold-lifted` n'a suivi. C'est ce que la file du chef en montre
// (attend.ts) — une seule ligne par retenue, quel que soit le nombre de passes
// qui l'ont vue —, et ce que tout autre module en lit.
import type { Base } from "../base.ts";
import type { FaitRetenue } from "./evenements.ts";
import type { Retenue } from "./retenue.ts";

type Tenue = Extract<FaitRetenue, { type: "kitchen.held" }>["payload"];

// `seq` : le fait qui la dit telle qu'elle est — son début, ou le dernier
// changement de sa cause.
export type RetenueEnCours = Retenue & { seq: number };

export function retenueEnCours(base: Base): RetenueEnCours | null {
  const [dernier] = base.lire<{ seq: number; type: string; payload: string }>("SELECT seq, type, payload FROM events WHERE type IN ('kitchen.held', 'kitchen.hold-lifted') ORDER BY seq DESC LIMIT 1");
  if (dernier === undefined || dernier.type !== "kitchen.held") return null;
  const { since, tickets, cause, gesture } = JSON.parse(dernier.payload) as Tenue;
  return { seq: dernier.seq, since, tickets, cause, gesture };
}
