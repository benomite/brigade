// Ce que la suite joue en ce moment, pour le job Windows : un reporter de `node --test` qui réécrit, à
// chaque événement, la liste des tests commencés et pas finis. Si un runner cale (« The hosted runner lost
// communication with the server », runs 41426885796 et 41428166276 : 50 min, aucun journal, aucune
// annotation), le garde de windows.ts lit ce fichier et nomme le test coincé avant de tuer l'arbre.
// Un test commence à `test:dequeue` et finit à `test:complete`, ses crochets de fin compris : les deux
// tombent quand ils arrivent, le fichier joué compris. `test:start` et `test:pass` ne tombent qu'au rapport,
// une fois le test fini : suivi sur eux, le garde ne nommait jamais rien (« none recorded », #2421).
import { writeFileSync } from "node:fs";

import type { Evenement } from "./annotations.ts";

const cle = (data: Evenement["data"]) => `${data.file ?? "?"}:${data.line ?? 0} — ${data.name ?? ""}`;

// Tient `ouverts` à jour d'un événement ; faux s'il n'y change rien.
function suivre(ouverts: Map<string, string>, { type, data }: Evenement): boolean {
  if (type === "test:dequeue") ouverts.set(cle(data), cle(data));
  else if (type === "test:complete") ouverts.delete(cle(data));
  else return false;
  return true;
}

// Les tests commencés et pas finis, dans l'ordre où ils ont commencé.
export function enCours(evenements: Evenement[]): string[] {
  const ouverts = new Map<string, string>();
  for (const evenement of evenements) suivre(ouverts, evenement);
  return [...ouverts.values()];
}

export default async function* suivi(source: AsyncIterable<Evenement>): AsyncGenerator<string> {
  const ouverts = new Map<string, string>();
  const fichier = process.env.BRIGADE_SUIVI_DES_TESTS;
  for await (const evenement of source) {
    if (fichier === undefined || !suivre(ouverts, evenement)) continue;
    writeFileSync(fichier, [...ouverts.values()].join("\n"));
  }
}
