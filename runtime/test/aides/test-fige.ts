// Fichier de tests d'essai : son seul test se fige dans du code synchrone. La
// boucle d'événements ne tourne plus, donc aucun minuteur du lanceur ne peut
// l'arrêter. Il attend au lieu de boucler : le blocage est le même, sans
// brûler un cœur le temps de l'essai.
import { writeFileSync } from "node:fs";
import test from "node:test";

test("un test figé dans du code synchrone", () => {
  writeFileSync(process.env.TEMOIN ?? "", String(process.pid));
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
});
