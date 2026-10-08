// Fichier de tests d'essai : son seul test ne finit jamais, et tient une
// poignée qu'aucun crochet de fin ne relâche.
import test from "node:test";

test("un test qui ne rend pas la main", async () => {
  setInterval(() => {}, 1000);
  await new Promise(() => {});
});
