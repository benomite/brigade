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
// ouverture. `ci-wait` (#2456) : des livraisons en pass attendent un check sur
// la tête de leur PR — `tickets`, lesquelles ; `running`, les checks qui y
// tournent, vide quand aucun n'y a démarré. `tickets` (#2429) : ni limite, ni
// budget, ni disjoncteur, ni base rouge, mais `lines`, ce qui retient les
// tickets un à un — une attente sur un ticket mis de côté, un saut de la porte
// de prise. `refusedAt` d'une limite : le dernier appel que GitHub a refusé
// alors que `backAt` était passée ; `pauses` (#3448), ce que le compteur des
// appels de la station garde des pauses de l'heure (`PausesDeLaCause`).
// `unknown` : rien de ce que le runtime lit ne l'explique.
export type CauseDeRetenue =
  | { kind: "base-red"; sha: string | null; checks: string[] }
  | { kind: "github-limit"; limit: string | null; backAt: string; refusedAt?: string; pauses?: PausesDeLaCause }
  | { kind: "write-pacer"; writes: number; nextAt: string }
  | { kind: "breaker"; since: string }
  | { kind: "ci-wait"; tickets: number[]; running: string[] }
  | { kind: "tickets"; lines: string[] }
  | { kind: "unknown" };

// Les pauses de GitHub de l'heure écoulée, telles que le compteur des appels
// les garde (#3448) : `count`, combien ; `refusedMinutes`, les minutes où
// GitHub a refusé un appel ; `last`, la dernière — son début, sa fin, le statut,
// la ressource (`x-ratelimit-resource`) et le `retry-after` du refus qui l'a
// posée, nuls quand GitHub ne les a pas dits ; `callsBefore`, les derniers appels
// comptés avant elle, le plus récent d'abord : `<projet> <sorte>`, suivi de
// `write` pour une écriture. Sans elles, le ticket #3448 lisait `limit: null`
// et ne pouvait nommer ni la limite ni les appels qui l'avaient amenée.
export type PausesDeLaCause = {
  count: number;
  refusedMinutes: number;
  last: { at: string; until: string; status: number | null; resource: string | null; retryAfter: string | null };
  callsBefore: string[];
};

export type FaitRetenue =
  // Écrit quand la retenue commence (`change` faux), puis quand sa cause
  // change sans qu'elle soit levée (`change` vrai) — jamais à chaque passe.
  // `since` : depuis quand rien n'est servi, stable tant que dure la retenue ;
  // `tickets` : ceux qui attendent, prenables ou en pass ; `gesture` : ce qui
  // la lève, nul quand elle se lève seule ou qu'on ne le sait pas ; `skips`
  // (#3448) : ce que la porte de prise a dit de chaque ticket qu'elle n'a pas
  // pris, quand la cause n'est pas déjà ces lignes — absent sans saut.
  | { type: "kitchen.held"; payload: { since: string; tickets: number[]; cause: CauseDeRetenue; gesture: string | null; change: boolean; skips?: string[] } }
  // Écrit quand la retenue est levée. `reason` : `served`, un ticket a été
  // servi ; `nothing-waits`, plus aucun ticket n'attend ; `stopped`, la
  // cuisine a été arrêtée ou éteinte par le chef.
  | { type: "kitchen.hold-lifted"; payload: { since: string; reason: "served" | "nothing-waits" | "stopped" } };
