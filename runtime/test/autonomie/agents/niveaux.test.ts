// The autonomy level of each agent, kept per project in the directory the store is given (#4036, spec
// 2026-11-23-autonomy-trust-control, C4).
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { magasinDeNiveaux, NiveauxIllisibles, type Niveaux } from "../../../src/autonomie/agents/niveaux.ts";
import { repertoireTemporaire } from "../../outils.ts";

const FICHIER_DES_NIVEAUX = "autonomy-levels.json";
// The chef's answer of 2026-11-23 (Q2): supervisor and pass on act, closer on propose, manager on act except
// splitting an epic, on propose.
const DU_CHEF: Niveaux = { manager: "act", "manager split-epic": "propose", supervisor: "act", closer: "propose", pass: "act", cook: "act" };

test("a fresh project reads the chef's default levels, and writes nothing", (t) => {
  const repertoire = repertoireTemporaire(t);
  assert.deepEqual(magasinDeNiveaux(repertoire).lire("shop"), DU_CHEF);
  assert.equal(existsSync(join(repertoire, FICHIER_DES_NIVEAUX)), false);
});

test("one agent's level set survives a restart — a new store on the same directory — and leaves the other agents and projects as they were", (t) => {
  const repertoire = repertoireTemporaire(t);
  magasinDeNiveaux(repertoire).poser("shop", "closer", "act");

  const apres = magasinDeNiveaux(repertoire);
  assert.deepEqual(apres.lire("shop"), { ...DU_CHEF, closer: "act" });
  assert.deepEqual(apres.lire("cantine"), DU_CHEF);

  apres.poser("shop", "manager split-epic", "observe");
  assert.deepEqual(magasinDeNiveaux(repertoire).lire("shop"), { ...DU_CHEF, closer: "act", "manager split-epic": "observe" });
});

test("an unreadable levels file is refused by the read and by the write, and is never overwritten", (t) => {
  for (const contenu of ["{not json", "null", "[]", '{"shop": []}', '{"shop": {"chef": "act"}}', '{"shop": {"closer": "maybe"}}']) {
    const repertoire = repertoireTemporaire(t);
    const fichier = join(repertoire, FICHIER_DES_NIVEAUX);
    writeFileSync(fichier, contenu);
    const magasin = magasinDeNiveaux(repertoire);
    assert.throws(() => magasin.lire("shop"), NiveauxIllisibles, contenu);
    assert.throws(() => magasin.poser("shop", "pass", "observe"), NiveauxIllisibles, contenu);
    assert.equal(readFileSync(fichier, "utf8"), contenu);
  }
});

test("a level or an agent that does not exist is refused, and nothing is written", (t) => {
  const repertoire = repertoireTemporaire(t);
  const magasin = magasinDeNiveaux(repertoire);
  assert.throws(() => magasin.poser("shop", "closer", "maybe" as never), NiveauxIllisibles);
  assert.throws(() => magasin.poser("shop", "chef" as never, "act"), NiveauxIllisibles);
  assert.equal(existsSync(join(repertoire, FICHIER_DES_NIVEAUX)), false);
});
