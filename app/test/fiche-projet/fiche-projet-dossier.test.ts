// La fiche du projet, côté process principal (#4240) : `.brigade/fiche-projet.json` lu et écrit dans le dossier du projet,
// sur de vrais fichiers. Absent, il se lit `null` ; seul ce chemin se lit ou s'écrit ; seul un objet JSON s'y écrit.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ecrireDansLeProjet, lireDansLeProjet } from "../../src/vue/fiche-projet/fiche-projet-dossier.ts";

function dossier() {
  const chemin = mkdtempSync(join(tmpdir(), "fiche-projet-dossier-"));
  return { projet: { dossier: chemin }, chemin, [Symbol.dispose]: () => rmSync(chemin, { recursive: true, force: true }) };
}

const FICHE = ".brigade/fiche-projet.json";

test("absente, la fiche se lit null ; écrite puis réécrite, elle se relit telle quelle, son dossier créé, sans fichier de reste", async () => {
  using d = dossier();
  assert.equal(await lireDansLeProjet(d.projet, FICHE), null);
  await ecrireDansLeProjet(d.projet, FICHE, '{"work":"a page"}\n');
  assert.equal(readFileSync(join(d.chemin, FICHE), "utf8"), '{"work":"a page"}\n');
  assert.equal(await lireDansLeProjet(d.projet, FICHE), '{"work":"a page"}\n');
  await ecrireDansLeProjet(d.projet, FICHE, '{"work":"an episode"}\n');
  assert.equal(await lireDansLeProjet(d.projet, FICHE), '{"work":"an episode"}\n', "réécrite, son dossier déjà là");
  assert.deepEqual(readdirSync(join(d.chemin, ".brigade")), ["fiche-projet.json"]);
});

test("une lecture qui échoue autrement qu'absente rejette, avec sa raison", async () => {
  using d = dossier();
  mkdirSync(join(d.chemin, FICHE), { recursive: true });
  await assert.rejects(lireDansLeProjet(d.projet, FICHE), { code: "EISDIR" });
});

test("un projet qui a quitté le fichier des projets, ou un autre chemin : rien n'est lu ni écrit", async () => {
  using d = dossier();
  writeFileSync(join(d.chemin, "secret.txt"), "x");
  await assert.rejects(lireDansLeProjet(undefined, FICHE), /no longer in the projects file/);
  await assert.rejects(ecrireDansLeProjet(undefined, FICHE, "{}"), /no longer in the projects file/);
  await assert.rejects(lireDansLeProjet(d.projet, "secret.txt"), /only \.brigade\/fiche-projet\.json/);
  await assert.rejects(ecrireDansLeProjet(d.projet, "../secret.txt", "{}"), /only \.brigade\/fiche-projet\.json/);
  assert.deepEqual(readdirSync(d.chemin), ["secret.txt"]);
});

test("un texte qui n'est pas un objet JSON n'écrase pas la fiche", async () => {
  using d = dossier();
  await ecrireDansLeProjet(d.projet, FICHE, '{"served":"the books"}');
  for (const texte of ["{ served", "[]", "null", "3", 42, undefined]) {
    await assert.rejects(ecrireDansLeProjet(d.projet, FICHE, texte), /nothing was written/);
  }
  assert.equal(readFileSync(join(d.chemin, FICHE), "utf8"), '{"served":"the books"}');
});
