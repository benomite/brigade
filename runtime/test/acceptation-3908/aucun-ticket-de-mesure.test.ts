// #3908, critère 1 : la cuisine ne dépose plus aucun ticket de temps perdu, de
// qualité ou de temps de cuisson, sur aucun projet — aucun titre de ces
// tickets ne subsiste dans `runtime/src`.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SRC = join(import.meta.dirname, "../../src");
const TITRES = ["Tickets lose too much time", "Quality before time", "Cooking takes longer than estimated"];

function sources(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const chemin = join(dossier, e.name);
    return e.isDirectory() ? sources(chemin) : e.name.endsWith(".ts") ? [chemin] : [];
  });
}

test("aucun code de runtime/src ne dépose un ticket de temps perdu, de qualité ou de temps de cuisson", () => {
  const trouves = sources(SRC).flatMap((fichier) => {
    const texte = readFileSync(fichier, "utf8");
    return TITRES.filter((titre) => texte.includes(titre)).map((titre) => `${fichier.slice(SRC.length + 1)}: ${titre}`);
  });
  assert.deepEqual(trouves, []);
});
