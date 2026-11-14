// Le rail de « parade », son bandeau Backlog (#3480, épique #3473) : deux besoins découpés dont le corps porte la liste
// de leurs tickets en cases à cocher (`- [x] #<ticket>`, une ligne par ticket, cochée quand il est servi) — #38, deux
// lignes cochées sur cinq, et #41, ses trois lignes cochées. Les autres besoins sont ceux de `rail-backlog`.
import type { Ecran } from "./commun.ts";
import { AVANT_LE_RAIL, donnees } from "./rail-backlog.ts";

const LISTES: Record<number, { servis: number; total: number }> = { 38: { servis: 2, total: 5 }, 41: { servis: 3, total: 3 } };
const AVANT = { ...AVANT_LE_RAIL, issues: AVANT_LE_RAIL.issues.map((issue) => (LISTES[issue.ticket] === undefined ? issue : { ...issue, avancement: LISTES[issue.ticket] })) };

export const ecran: Ecran = {
  dit: "Le rail de « parade », son bandeau Backlog : #38, sa liste de tickets cochée deux lignes sur cinq, dit 2/5 ; #41, toute cochée, dit 3/3 served (#3480)",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => donnees(AVANT),
};
