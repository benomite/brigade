import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { prendreVerrou, VerrouTenu } from "../src/verrou.ts";
import { lancer, repertoireTemporaire } from "./outils.ts";

const TIENT_VERROU = join(import.meta.dirname, "aides/tient-verrou.ts");

test("un verrou tenu ne se prend pas une seconde fois", (t) => {
  const repertoire = repertoireTemporaire(t);
  const verrou = prendreVerrou(repertoire);
  t.after(() => verrou.relacher());

  assert.throws(() => prendreVerrou(repertoire), VerrouTenu);
});

test("un verrou relâché se reprend", (t) => {
  const repertoire = repertoireTemporaire(t);
  prendreVerrou(repertoire).relacher();

  const verrou = prendreVerrou(repertoire);
  t.after(() => verrou.relacher());
});

test("deux répertoires d'état ont deux verrous indépendants", (t) => {
  const un = prendreVerrou(repertoireTemporaire(t));
  const deux = prendreVerrou(repertoireTemporaire(t));
  t.after(() => {
    un.relacher();
    deux.relacher();
  });
});

test("le verrou d'un autre process est refusé, puis se reprend dès qu'il est tué, sans nettoyage", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const autre = lancer(t, TIENT_VERROU, [repertoire]);
  await autre.attendre("tenu");

  assert.throws(() => prendreVerrou(repertoire), VerrouTenu);

  autre.process.kill("SIGKILL");
  await autre.fin;
  const verrou = prendreVerrou(repertoire);
  t.after(() => verrou.relacher());
});
