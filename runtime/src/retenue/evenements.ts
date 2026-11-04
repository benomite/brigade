// Les faits de la cuisine retenue (#2281) : rien n'a été servi depuis 30 min
// alors que des tickets attendent (retenue.ts). La retenue elle-même se relit
// de ce qu'observe la boucle ; ces faits gardent ses transitions — quand elle a
// commencé, la cause qu'on lui a trouvée, quand elle a été levée —, et c'est
// d'eux que la file du chef tire sa ligne (lire.ts).

// La cause d'une retenue, telle que le diagnostic l'a lue. `base-red` :
// `checks`, ce qui échoue sur la base, nommé par ses checks ou ses gates ;
// `sha`, son commit quand il est connu. `github-limit` : `limit`, la sorte de
// limite (`primary`, `secondary-writes`…, `reserve` pour la réserve des gestes
// que la box garde) ; `backAt`, la reprise. `write-pacer` : `writes`, les
// écritures de l'heure ; `nextAt`, la prochaine. `breaker` : `since`, son
// ouverture. `unknown` : rien de ce que le runtime lit ne l'explique.
export type CauseDeRetenue =
  | { kind: "base-red"; sha: string | null; checks: string[] }
  | { kind: "github-limit"; limit: string | null; backAt: string }
  | { kind: "write-pacer"; writes: number; nextAt: string }
  | { kind: "breaker"; since: string }
  | { kind: "unknown" };

export type FaitRetenue =
  // Écrit quand la retenue commence (`change` faux), puis quand sa cause
  // change sans qu'elle soit levée (`change` vrai) — jamais à chaque passe.
  // `since` : depuis quand rien n'est servi, stable tant que dure la retenue ;
  // `tickets` : ceux qui attendent, prenables ou en pass ; `gesture` : ce qui
  // la lève, nul quand elle se lève seule ou qu'on ne le sait pas.
  | { type: "kitchen.held"; payload: { since: string; tickets: number[]; cause: CauseDeRetenue; gesture: string | null; change: boolean } }
  // Écrit quand la retenue est levée. `reason` : `served`, un ticket a été
  // servi ; `nothing-waits`, plus aucun ticket n'attend ; `stopped`, la
  // cuisine a été arrêtée ou éteinte par le chef.
  | { type: "kitchen.hold-lifted"; payload: { since: string; reason: "served" | "nothing-waits" | "stopped" } };
