// #4227, critère 5 : la suite de tests du runtime passe. Elle se joue elle-même : ce test joue donc les quatre autres
// tests d'acceptation du ticket — ceux qui échouent tant que la pass n'est pas seul juge — dans un process à part.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const DOSSIER = import.meta.dirname;

test("the four acceptance tests of the pass-only-judge ticket pass in a run of their own", async () => {
  const fichiers = readdirSync(DOSSIER)
    .filter((nom) => /^[1-4]-.*\.test\.ts$/.test(nom))
    .map((nom) => join(DOSSIER, nom));
  assert.equal(fichiers.length, 4);
  // Hors du contexte du lanceur qui joue ce test : le process fils se juge seul.
  const { NODE_TEST_CONTEXT: _, ...env } = process.env;
  const sortie: string[] = [];
  const code = await new Promise<number | null>((fin) => {
    const enfant = spawn(process.execPath, ["--test", "--test-reporter=spec", ...fichiers], { stdio: ["ignore", "pipe", "pipe"], env });
    enfant.stdout.on("data", (morceau: Buffer) => sortie.push(morceau.toString()));
    enfant.stderr.on("data", (morceau: Buffer) => sortie.push(morceau.toString()));
    enfant.on("close", fin);
  });
  assert.equal(code, 0, sortie.join("").slice(-2000));
});
