// Ce que la suite joue en ce moment, pour le job Windows : un reporter de `node --test` qui réécrit, à
// chaque événement, la liste des tests commencés et pas finis. Si un runner cale (« The hosted runner lost
// communication with the server », runs 41426885796 et 41428166276 : 50 min, aucun journal, aucune
// annotation), le garde de windows.ts lit ce fichier et nomme le test coincé avant de tuer l'arbre.
import { writeFileSync } from "node:fs";

import type { Evenement } from "./annotations.ts";

const cle = (data: Evenement["data"]) => `${data.file ?? "?"}:${data.line ?? 0} — ${data.name ?? ""}`;

// Les tests commencés et pas finis, dans l'ordre où ils ont commencé.
export function enCours(evenements: Evenement[]): string[] {
  const ouverts = new Map<string, string>();
  for (const { type, data } of evenements) {
    if (type === "test:start") ouverts.set(cle(data), cle(data));
    else if (type === "test:pass" || type === "test:fail") ouverts.delete(cle(data));
  }
  return [...ouverts.values()];
}

export default async function* suivi(source: AsyncIterable<Evenement>): AsyncGenerator<string> {
  const ouverts = new Map<string, string>();
  const fichier = process.env.BRIGADE_SUIVI_DES_TESTS;
  for await (const { type, data } of source) {
    if (fichier === undefined) continue;
    if (type === "test:start") ouverts.set(cle(data), cle(data));
    else if (type === "test:pass" || type === "test:fail") ouverts.delete(cle(data));
    else continue;
    writeFileSync(fichier, [...ouverts.values()].join("\n"));
  }
}
