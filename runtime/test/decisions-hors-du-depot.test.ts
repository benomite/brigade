// Les décisions du chef — stations, seuils de coût, calibrage du manager et du
// reviewer — n'ont plus le drop-in pour support : ni les fichiers de déploiement,
// ni la doc d'installation ne les posent comme valeur lue à l'exécution. Seule
// la migration vers le geste les nomme.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { DECISIONS, gesteDe } from "../src/decisions.ts";
import { GESTES } from "../src/montrer-station.ts";

const RACINE = join(import.meta.dirname, "../..");
const DEPLOY = join(RACINE, "runtime/deploy");
// Ce qui les nomme sans les poser : la bascule dit, avant l'essai, ce que
// l'unité garde encore (migration), et la liste des obligatoires que la
// version livre.
const MIGRATION = ["brigade-bascule", "decisions-obligatoires"];
const lire = (chemin: string) => readFileSync(chemin, "utf8");
const AFFECTE = new RegExp(`(^|[\\s;])#?(Environment=)?(${DECISIONS.join("|")})=`, "m");

test("aucun fichier de déploiement ne pose une décision du chef : seule la migration les nomme", () => {
  for (const nom of readdirSync(DEPLOY)) {
    const contenu = lire(join(DEPLOY, nom));
    if (MIGRATION.includes(nom)) continue;
    for (const decision of DECISIONS) assert.equal(contenu.includes(decision), false, `${nom} nomme ${decision}`);
  }
});

test("le modèle de drop-in et la doc d'installation ne posent aucune décision comme variable", () => {
  for (const fichier of ["docs/installer.md", "README.md", "runtime/deploy/brigade@.service"]) {
    const contenu = lire(join(RACINE, fichier));
    assert.doesNotMatch(contenu, AFFECTE, `${fichier} affecte une variable de décision`);
  }
  // Ce que le drop-in porte, tel que le geste d'installation l'écrit : aucune décision.
  const installateur = lire(join(RACINE, "runtime/src/installateur.ts"));
  const posees = /export const VARIABLES_POSEES = \[([^\]]*)\]/.exec(installateur)?.[1] ?? "";
  for (const decision of DECISIONS) assert.equal(posees.includes(decision), false, `le geste d'installation écrit ${decision}`);
});

test("la liste des variables de décision de la bascule est celle du runtime, geste compris", () => {
  const bascule = lire(join(DEPLOY, "brigade-bascule"));
  const bloc = /GESTES_DES_DECISIONS="([^"]*)"/.exec(bascule)?.[1] ?? "";
  const lignes = bloc.split("\n").map((ligne) => ligne.trim().split(" "));
  assert.deepEqual(lignes.map(([variable]) => variable).sort(), [...DECISIONS].sort());
  for (const [variable = "", geste] of lignes) assert.match(geste ?? "", /^[a-z-]+$/, variable);
});

test("le geste que le runtime nomme pour une décision est celui que `station` accepte", () => {
  for (const [geste, { decision }] of Object.entries(GESTES)) assert.equal(gesteDe(decision), geste);
});
