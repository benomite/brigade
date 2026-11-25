// Admission à la charge (#4210) : la station appelle le module avant de lancer
// chaque cook, et une ligne de log dit le report quand la machine est chargée.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { admettre } from "../../src/admission-charge/admission-charge.ts";

const SRC = join(import.meta.dirname, "..", "..", "src");

function sources(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return nom === "admission-charge" ? [] : sources(chemin);
    return chemin.endsWith(".ts") ? [chemin] : [];
  });
}

test("le module dit le report dans le log quand la machine est chargée, et se tait quand elle ne l'est pas", () => {
  const lignes: string[] = [];
  const charge = admettre({ genre: "cook", enCours: 0, lireMachine: () => ({ charge: 27, coeurs: 8 }), avertir: (l) => lignes.push(l) });
  assert.equal(charge.admis, false);
  assert.equal(lignes.length, 1);
  assert.match(lignes[0] as string, /defer|deferr|report|load|charge/i);
  const repos: string[] = [];
  assert.equal(admettre({ genre: "cook", enCours: 0, lireMachine: () => ({ charge: 0.2, coeurs: 8 }), avertir: (l) => repos.push(l) }).admis, true);
  assert.deepEqual(repos, []);
});

test("le code de la station qui lance un cook appelle le module d'admission", () => {
  const appelants = sources(SRC).filter((f) => /admission-charge\/admission-charge\.ts["']/.test(readFileSync(f, "utf8")) && /\badmettre\s*\(/.test(readFileSync(f, "utf8")));
  assert.ok(appelants.length >= 1, "aucun fichier de runtime/src n'importe et n'appelle `admettre`");
});
