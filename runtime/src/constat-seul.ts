// Un ticket dont les critères admettent un constat écrit pour tout résultat —
// un diagnostic dont la cause est hors du dépôt, par exemple — se sert sans
// commit : le cook qui n'a rien commité et délimite son constat a livré, et la
// station poste ce constat sur l'issue, puis ferme le ticket (#2854). Sur
// BOBL-tech/espace#826, trois cooks ont rendu ce constat, comptés chacun pour
// un `echec`, et le ticket est parti `hors-cuisine`.
//
// La règle reste étroite, pour ne pas masquer un vrai échec : seuls comptent
// les critères d'acceptation du corps, et une phrase qui dit que le livrable
// du ticket est un constat ou un commentaire écrit. Ce qui y est cité — entre
// accents graves, entre guillemets, en citation `>` — ne compte pas : un
// ticket qui parle de ces tickets, comme #2854, n'en est pas un. Sans section
// de critères, le ticket attend un commit, comme avant. Sans E/S.
import { blanchir } from "./livrable.ts";
import { criteresDuCorps } from "./manager/verdict-incomplet.ts";

export const MARQUE_DE_CONSTAT = "<!-- brigade:constat";

const LIVRABLE_ECRIT = [
  /\bdeliverable is (?:a|the) (?:written )?(?:finding|comment|diagnosis)\b/i,
  /\blivrable est (?:un|le) (?:constat|commentaire|diagnostic)\b/i,
];

export function admetUnConstat(corps: string): boolean {
  const criteres = criteresDuCorps(corps);
  if (criteres === null) return false;
  const propres = blanchir(criteres)
    .split("\n")
    .filter((ligne) => !/^\s*>/.test(ligne))
    .join("\n")
    .replace(/"[^"\n]*"|“[^”\n]*”|«[^»\n]*»/g, " ");
  return LIVRABLE_ECRIT.some((motif) => motif.test(propres));
}
