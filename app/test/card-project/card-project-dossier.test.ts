// La fiche du projet, côté process principal (#4240) : `.brigade/fiche-projet.json` lu et écrit dans le dossier du projet,
// sur de vrais fichiers. Absent, il se lit `null` ; seul ce chemin se lit ou s'écrit ; seul un objet JSON s'y écrit.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ecrireDansLeProject, lireDansLeProject } from "../../src/vue/card-project/card-project-dossier.ts";

function dossier() {
  const chemin = mkdtempSync(join(tmpdir(), "fiche-projet-dossier-"));
  return { projet: { dossier: chemin }, chemin, [Symbol.dispose]: () => rmSync(chemin, { recursive: true, force: true }) };
}

const CARD = ".brigade/fiche-projet.json";

test("absente, la fiche se lit null ; écrite puis réécrite, elle se relit telle quelle, son dossier créé, sans fichier de reste", async () => {
  using d = dossier();
  assert.equal(await lireDansLeProject(d.projet, CARD), null);
  await ecrireDansLeProject(d.projet, CARD, '{"work":"a page"}\n');
  assert.equal(readFileSync(join(d.chemin, CARD), "utf8"), '{"work":"a page"}\n');
  assert.equal(await lireDansLeProject(d.projet, CARD), '{"work":"a page"}\n');
  await ecrireDansLeProject(d.projet, CARD, '{"work":"an episode"}\n');
  assert.equal(await lireDansLeProject(d.projet, CARD), '{"work":"an episode"}\n', "réécrite, son dossier déjà là");
  assert.deepEqual(readdirSync(join(d.chemin, ".brigade")), ["fiche-projet.json"]);
});

test("une lecture qui échoue autrement qu'absente rejette, avec sa raison", async () => {
  using d = dossier();
  mkdirSync(join(d.chemin, CARD), { recursive: true });
  await assert.rejects(lireDansLeProject(d.projet, CARD), { code: "EISDIR" });
});

test("un projet qui a quitté le fichier des projets, ou un autre chemin : rien n'est lu ni écrit", async () => {
  using d = dossier();
  writeFileSync(join(d.chemin, "secret.txt"), "x");
  await assert.rejects(lireDansLeProject(undefined, CARD), /no longer in the projects file/);
  await assert.rejects(ecrireDansLeProject(undefined, CARD, "{}"), /no longer in the projects file/);
  await assert.rejects(lireDansLeProject(d.projet, "secret.txt"), /only \.brigade\/fiche-projet\.json/);
  await assert.rejects(ecrireDansLeProject(d.projet, "../secret.txt", "{}"), /only \.brigade\/fiche-projet\.json/);
  assert.deepEqual(readdirSync(d.chemin), ["secret.txt"]);
});

test("un texte qui n'est pas un objet JSON n'écrase pas la fiche", async () => {
  using d = dossier();
  await ecrireDansLeProject(d.projet, CARD, '{"served":"the books"}');
  for (const texte of ["{ served", "[]", "null", "3", 42, undefined]) {
    await assert.rejects(ecrireDansLeProject(d.projet, CARD, texte), /nothing was written/);
  }
  assert.equal(readFileSync(join(d.chemin, CARD), "utf8"), '{"served":"the books"}');
});
