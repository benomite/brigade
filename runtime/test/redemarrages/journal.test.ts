import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { FICHIER, ligneDesRedemarrages, noterUnDemarrage, redemarragesDes24h } from "../../src/redemarrages/journal.ts";

const H = 3_600_000;
const dossier = () => mkdtempSync(join(tmpdir(), "redemarrages-"));

test("après un redémarrage, le compte monte de un (#2589)", () => {
  const d = dossier();
  assert.equal(redemarragesDes24h(d, 1000 * H), 0);
  noterUnDemarrage(d, "1.0.0", 1000 * H);
  assert.equal(redemarragesDes24h(d, 1000 * H), 1);
  noterUnDemarrage(d, "1.0.1", 1001 * H);
  assert.equal(redemarragesDes24h(d, 1001 * H), 2);
  assert.equal(ligneDesRedemarrages(d, 1001 * H), "Restarts (24h): 2");
});

test("un redémarrage de plus de 24 heures n'est pas compté, horloge truquée (#2589)", () => {
  const d = dossier();
  noterUnDemarrage(d, "1.0.0", 1000 * H);
  assert.equal(redemarragesDes24h(d, 1023 * H), 1);
  assert.equal(redemarragesDes24h(d, 1024 * H + 1), 0);
});

test("le journal ne garde que 24 heures plus une marge (#2589)", () => {
  const d = dossier();
  noterUnDemarrage(d, "a", 1000 * H);
  noterUnDemarrage(d, "b", 1100 * H);
  const gardes = JSON.parse(readFileSync(join(d, FICHIER), "utf8"));
  assert.deepEqual(gardes, [{ a: 1100 * H, version: "b" }]);
});

test("un journal absent ou illisible donne 0 sans échec (#2589)", () => {
  const d = dossier();
  assert.equal(redemarragesDes24h(d, 1000 * H), 0);
  assert.equal(redemarragesDes24h(undefined, 1000 * H), 0);
  writeFileSync(join(d, FICHIER), "{pas du json");
  assert.equal(redemarragesDes24h(d, 1000 * H), 0);
  writeFileSync(join(d, FICHIER), '{"a":1}');
  assert.equal(ligneDesRedemarrages(d, 1000 * H), "Restarts (24h): 0");
  noterUnDemarrage(d, "x", 1000 * H);
  assert.equal(redemarragesDes24h(d, 1000 * H), 1);
});
