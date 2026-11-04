// Les lancements du fichier d'une commande qui n'a pas de fonction à appeler
// (`principal`, appel.ts), joués l'un après l'autre dans un seul process
// (`jouer-en-serie.ts`) : ce que chacun écrirait et le code qu'il rendrait,
// lancé seul avec ses arguments et son environnement — un Node qui démarre pour
// tous, au lieu d'un par lancement. Ce qui tient au process lui-même (un
// signal, sa mort) se prouve avec `lancer`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { lancer, repertoireTemporaire } from "../outils.ts";

const JOUER = join(import.meta.dirname, "jouer-en-serie.ts");

// `precharger` : le module que son process précharge (`--import`), une adresse
// `file:` — il reste chargé pour les lancements qui suivent : à ne poser que
// sur les derniers.
export type Lancement = { args?: string[]; env?: Record<string, string>; precharger?: string };

export async function enSerie(t: TestContext, fichier: string, lancements: Lancement[]): Promise<Array<{ code: number; sortie: string }>> {
  const resultat = join(repertoireTemporaire(t), "resultats.json");
  // L'environnement de chacun : celui d'un process que `lancer` démarre, plus le sien.
  const enfant = lancer(t, JOUER, [fichier, JSON.stringify(lancements.map(({ args = [], env = {}, precharger }) => ({ args, env, precharger }))), resultat]);
  assert.equal(await enfant.fin, 0, enfant.sortie());
  return JSON.parse(readFileSync(resultat, "utf8")) as Array<{ code: number; sortie: string }>;
}
