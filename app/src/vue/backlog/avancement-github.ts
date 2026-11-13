// L'avancement d'un besoin découpé, tel que son issue l'écrit (#3480, épique #3473) : le corps du besoin porte la liste de
// ses tickets en cases à cocher, une ligne par ticket (`- [ ] #<ticket>`), cochée quand ce ticket est servi — chaque
// ticket, lui, porte `Part of #<besoin>`. Servis : les lignes cochées ; total : toutes. Un corps sans cette liste n'a pas
// d'avancement : rien n'est compté, jamais un `0/0`. Lu par tableau/lecture.ts dans le corps de chaque besoin ; posé par
// le bandeau Backlog (avancement.js). Sans E/S.
import { lignesHorsCode } from "../../../../runtime/src/epique.ts";

export type Avancement = { servis: number; total: number };

// Une case de la liste : un élément de liste, sa case, cochée ou non, puis le numéro du ticket en tête.
const CASE = /^\s*[-*+]\s+\[([ xX])\]\s+#([1-9]\d*)\b/;

// Les cases du corps, hors bloc de code : un exemple cité n'est pas une liste. Un ticket nommé deux fois compte une fois,
// servi si l'une de ses lignes est cochée.
export function avancementDeLaListe(corps: string): Avancement | undefined {
  const coches = new Map<number, boolean>();
  for (const { texte } of lignesHorsCode(corps)) {
    const lue = CASE.exec(texte);
    if (lue === null) continue;
    const ticket = Number(lue[2]);
    coches.set(ticket, (coches.get(ticket) ?? false) || lue[1] !== " ");
  }
  if (coches.size === 0) return undefined;
  return { servis: [...coches.values()].filter(Boolean).length, total: coches.size };
}
