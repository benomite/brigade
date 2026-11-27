// L'avancement d'un besoin découpé, tel que son issue l'écrit (ticket 3480, épique 3473) : le corps du besoin porte la liste de
// ses tickets en cases à cocher, une ligne par ticket (`- [ ] #<ticket>`), cochée quand ce ticket est servi — chaque
// ticket, lui, porte `Part of #<besoin>`. Servis : les lignes cochées ; total : toutes. Un corps sans cette liste n'a pas
// d'avancement : rien n'est compté, jamais un `0/0`. Lu par board/read.ts dans le corps de chaque besoin ; posé par
// le bandeau Backlog (avancement.js). Sans E/S.
import { lignesHorsCode } from "../../../../runtime/src/epique.ts";

export type Progress = { servis: number; total: number };

// Une case de la liste : un élément de liste, sa case, cochée ou non, puis le numéro du ticket en tête.
const CASE = /^\s*[-*+]\s+\[([ xX])\]\s+#([1-9]\d*)\b/;

// Les cases du corps, hors bloc de code : un exemple cité n'est pas une liste. Un ticket nommé deux fois compte une fois,
// servi si l'une de ses lignes est cochée.
export function progressOfTheList(body: string): Progress | undefined {
  const ticks = new Map<number, boolean>();
  for (const { texte: text } of lignesHorsCode(body)) {
    const readEntry = CASE.exec(text);
    if (readEntry === null) continue;
    const ticket = Number(readEntry[2]);
    ticks.set(ticket, (ticks.get(ticket) ?? false) || readEntry[1] !== " ");
  }
  if (ticks.size === 0) return undefined;
  return { servis: [...ticks.values()].filter(Boolean).length, total: ticks.size };
}
