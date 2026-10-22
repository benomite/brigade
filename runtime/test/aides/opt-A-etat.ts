// L'état d'exemple du bas de `status` (bas-de-status.ts), bâti une fois par fichier de test puis copié dans le
// répertoire de chaque test : le même journal, octet pour octet, sans rejouer ses centaines d'écritures à chaque test.
// Chaque copie est à son test seul — ce qu'une commande y écrit ne se voit dans aucun autre.
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { repertoireTemporaire } from "../outils.ts";
import { exempleDuBas } from "./bas-de-status.ts";

let modele: string | undefined;

// Le modèle : l'exemple écrit dans un répertoire à lui, son journal fermé avant toute copie.
function batir(): string {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-test-modele-"));
  process.once("exit", () => rmSync(repertoire, { recursive: true, force: true }));
  const fermetures: Array<() => unknown> = [];
  exempleDuBas({ after: (fermer: () => unknown) => void fermetures.push(fermer) } as unknown as TestContext, repertoire);
  for (const fermer of fermetures) fermer();
  return repertoire;
}

// Un répertoire neuf du test, qui porte l'état d'exemple du bas.
export function copieDeLExempleDuBas(t: TestContext): string {
  modele ??= batir();
  const repertoire = repertoireTemporaire(t);
  cpSync(modele, repertoire, { recursive: true });
  return repertoire;
}
