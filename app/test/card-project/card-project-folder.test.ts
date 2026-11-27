// La fiche du projet, côté process principal (#4240) : `.brigade/fiche-projet.json` lu et écrit dans le dossier du projet,
// sur de vrais fichiers. Absent, il se lit `null` ; seul ce chemin se lit ou s'écrit ; seul un objet JSON s'y écrit.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { writeInTheProject, readInTheProject } from "../../src/vue/card-project/card-project-folder.ts";

function folder() {
  const path = mkdtempSync(join(tmpdir(), "fiche-projet-dossier-"));
  return { projet: { dossier: path }, chemin: path, [Symbol.dispose]: () => rmSync(path, { recursive: true, force: true }) };
}

const CARD = ".brigade/fiche-projet.json";

test("absente, la fiche se lit null ; écrite puis réécrite, elle se relit telle quelle, son dossier créé, sans fichier de reste", async () => {
  using d = folder();
  assert.equal(await readInTheProject(d.projet, CARD), null);
  await writeInTheProject(d.projet, CARD, '{"work":"a page"}\n');
  assert.equal(readFileSync(join(d.chemin, CARD), "utf8"), '{"work":"a page"}\n');
  assert.equal(await readInTheProject(d.projet, CARD), '{"work":"a page"}\n');
  await writeInTheProject(d.projet, CARD, '{"work":"an episode"}\n');
  assert.equal(await readInTheProject(d.projet, CARD), '{"work":"an episode"}\n', "réécrite, son dossier déjà là");
  assert.deepEqual(readdirSync(join(d.chemin, ".brigade")), ["fiche-projet.json"]);
});

test("une lecture qui échoue autrement qu'absente rejette, avec sa raison", async () => {
  using d = folder();
  mkdirSync(join(d.chemin, CARD), { recursive: true });
  await assert.rejects(readInTheProject(d.projet, CARD), { code: "EISDIR" });
});

test("un projet qui a quitté le fichier des projets, ou un autre chemin : rien n'est lu ni écrit", async () => {
  using d = folder();
  writeFileSync(join(d.chemin, "secret.txt"), "x");
  await assert.rejects(readInTheProject(undefined, CARD), /no longer in the projects file/);
  await assert.rejects(writeInTheProject(undefined, CARD, "{}"), /no longer in the projects file/);
  await assert.rejects(readInTheProject(d.projet, "secret.txt"), /only \.brigade\/fiche-projet\.json/);
  await assert.rejects(writeInTheProject(d.projet, "../secret.txt", "{}"), /only \.brigade\/fiche-projet\.json/);
  assert.deepEqual(readdirSync(d.chemin), ["secret.txt"]);
});

test("un texte qui n'est pas un objet JSON n'écrase pas la fiche", async () => {
  using d = folder();
  await writeInTheProject(d.projet, CARD, '{"served":"the books"}');
  for (const text of ["{ served", "[]", "null", "3", 42, undefined]) {
    await assert.rejects(writeInTheProject(d.projet, CARD, text), /nothing was written/);
  }
  assert.equal(readFileSync(join(d.chemin, CARD), "utf8"), '{"served":"the books"}');
});
