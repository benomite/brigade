// #4229, critère 1 : aucune étape du flux n'écrit ni ne gèle un test d'acceptation avant le code ; la recherche de l'étape de gel dans runtime/src ne trouve aucun chemin de code vivant.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SRC = join(import.meta.dirname, "../../src");

function sources(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(join(dossier, e.name)) : e.name.endsWith(".ts") ? [join(dossier, e.name)] : []));
}

// Le code seul : sans les commentaires de ligne ni de bloc.
const code = (texte: string) => texte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("runtime/src has no live code path that writes or freezes acceptance tests before the code", () => {
  const marques = [/Acceptance-Tests: frozen/, /frozen acceptance tests/, /\bcommitDesTestsGeles\b/, /\bfichiersGeles\b/, /\btestsGelesTouches\b/, /\becrireLesTests\b/, /\bconsigneDesTests\b/, /\bporteDesTests\b/, /\bestLeCommitDesTests\b/, /\bLABEL_TESTS_ECRITS\b/];
  const trouves = sources(SRC).flatMap((fichier) => {
    const texte = code(readFileSync(fichier, "utf8"));
    return marques.filter((m) => m.test(texte)).map((m) => `${fichier.slice(SRC.length + 1)}: ${m}`);
  });
  assert.deepEqual(trouves, []);
});
