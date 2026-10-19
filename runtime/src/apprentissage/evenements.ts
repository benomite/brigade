// Les faits de l'apprentissage des cooks : la rétro d'un ticket servi, et les
// leçons provisoires qu'elle laisse au projet (`apprentissage/provisoires.ts`).

// Ce qu'une rétro retient, entrée par entrée : une leçon nouvelle, ou une leçon
// du projet reconfirmée par son id. Déjà triée à l'écriture — au plus
// `LECONS_MAX`, chacune en `PHRASES_MAX` phrases au plus — : le relire ne
// redécide rien.
export type EntreeRetenue = { kind: "propose"; text: string } | { kind: "reconfirm"; id: string };

// Pourquoi une ligne de la rétro n'est pas retenue : illisible (`unreadable`),
// une leçon trop longue (`too-long`), un id qui n'est celui d'aucune leçon du
// projet (`unknown-id`), une entrée déjà dite par la même rétro (`duplicate`),
// ou au-delà des leçons qu'une rétro peut laisser (`over-limit`).
export type Ecart = "unreadable" | "too-long" | "unknown-id" | "duplicate" | "over-limit";

export type FaitApprentissage =
  // Le ticket vient d'être servi : sa rétro est celle du cook dont la
  // livraison l'a été — `run`, nul quand le journal n'en connaît aucun.
  // `text` : ce que ce cook a écrit entre `<retro>` et `</retro>`, nul s'il
  // n'en a rien écrit. `kept` : les leçons qu'elle laisse au projet, aussitôt
  // lisibles, provisoires, sans validation de personne. `dropped` : les lignes
  // écartées, et pourquoi. Une fois par service.
  | { type: "retro.recorded"; payload: { run: string | null; text: string | null; kept: EntreeRetenue[]; dropped: { line: string; reason: Ecart }[] } };
