// Le savoir-faire du projet (#4241), par la commande `know-how` que l'app lance : ses entrées lues, chacune avec le
// ticket d'où elle est née ; une entrée réécrite, une entrée retirée — et ce que les cooks du projet en reçoivent
// ensuite (`apprentissage/injection.ts`). Un refus n'écrit rien.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { leconsAInjecter } from "../../src/apprentissage/injection.ts";
import { ouvrirJournal, type Journal } from "../../src/journal.ts";
import { principal } from "../../src/savoir-faire/commande.ts";
import { appeler, repertoireTemporaire } from "../outils.ts";

// La rétro du ticket `ticket` de `projet`, servi, laisse une leçon par texte.
function retro(journal: Journal, projet: string, ticket: number, ...textes: string[]) {
  journal.ajouter({ project: projet, ticket, author: "pass", type: "retro.recorded", payload: { run: null, text: null, kept: textes.map((text) => ({ kind: "propose" as const, text })), dropped: [] } });
}

// Un état de box : le projet « a » a appris L1 (#4001) et L2 (#4002) ; « b » a sa propre L1.
function etat(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  retro(journal, "a", 4001, "Run the typecheck before pushing.");
  retro(journal, "a", 4002, "Never kill a process by name.");
  retro(journal, "b", 4100, "A lesson of b.");
  journal.fermer();
  return { BRIGADE_STATE_DIR: repertoire, BRIGADE_PROJECT: "a" };
}

async function jouer(env: Record<string, string>, ...args: string[]) {
  const enfant = appeler(principal, args, env);
  const code = await enfant.fin;
  return { code, sortie: enfant.sortie().trim() };
}
const entrees = async (env: Record<string, string>) => JSON.parse((await jouer(env)).sortie).entries;
// Ce que reçoit le prochain cook du projet.
function recues(env: Record<string, string>, projet = "a") {
  const journal = ouvrirJournal(env.BRIGADE_STATE_DIR ?? "", { lectureSeule: true });
  try {
    return leconsAInjecter(journal.base, projet, { plafond: 20, carnet: null }).map((lecon) => lecon.texte);
  } finally {
    journal.fermer();
  }
}

describe("know-how : le savoir-faire du projet", () => {
  test("lu : chaque entrée du projet, avec le ticket d'où elle vient — jamais celle d'un autre projet", async (t) => {
    const env = etat(t);
    const lu = await jouer(env);
    assert.equal(lu.code, 0);
    assert.deepEqual(JSON.parse(lu.sortie), {
      entries: [
        { id: "L1", text: "Run the typecheck before pushing.", ticket: 4001 },
        { id: "L2", text: "Never kill a process by name.", ticket: 4002 },
      ],
    });
    assert.deepEqual(await entrees({ ...env, BRIGADE_PROJECT: "c" }), []);
  });

  test("edit : le texte réécrit, sur une ligne, se relit et c'est lui que les cooks reçoivent ; le dernier l'emporte", async (t) => {
    const env = etat(t);
    const ecrit = await jouer(env, "edit", "L2", "Never kill a process by name,\n  use its", "pid.");
    assert.equal(ecrit.code, 0);
    assert.deepEqual(JSON.parse(ecrit.sortie), { ok: true, entry: { id: "L2", text: "Never kill a process by name, use its pid.", ticket: 4002 } });
    assert.deepEqual(await entrees(env), [
      { id: "L1", text: "Run the typecheck before pushing.", ticket: 4001 },
      { id: "L2", text: "Never kill a process by name, use its pid.", ticket: 4002 },
    ]);
    assert.deepEqual(recues(env), ["Never kill a process by name, use its pid.", "Run the typecheck before pushing."]);
    assert.equal((await jouer(env, "edit", "L2", "Kill by pid.")).code, 0);
    assert.deepEqual((await entrees(env)).map((e: { text: string }) => e.text), ["Run the typecheck before pushing.", "Kill by pid."]);
    // L'entrée de même id d'un autre projet ne bouge pas.
    assert.deepEqual(await entrees({ ...env, BRIGADE_PROJECT: "b" }), [{ id: "L1", text: "A lesson of b.", ticket: 4100 }]);
  });

  test("remove : l'entrée ne se relit plus, et aucun cook ne la reçoit ; les autres restent", async (t) => {
    const env = etat(t);
    const retire = await jouer(env, "remove", "L1");
    assert.equal(retire.code, 0);
    assert.deepEqual(JSON.parse(retire.sortie), { ok: true });
    assert.deepEqual(await entrees(env), [{ id: "L2", text: "Never kill a process by name.", ticket: 4002 }]);
    assert.deepEqual(recues(env), ["Never kill a process by name."]);
    assert.deepEqual(recues(env, "b"), ["A lesson of b."]);
  });

  test("un changement refusé le dit en une ligne, en 1, et n'écrit rien : une entrée inconnue, retirée, ou un texte vide", async (t) => {
    const env = etat(t);
    assert.equal((await jouer(env, "remove", "L1")).code, 0);
    for (const [args, message] of [
      [["edit", "L9", "Some text."], "“L9” is not an entry of the project's know-how"],
      [["remove", "L9"], "“L9” is not an entry of the project's know-how"],
      [["edit", "L1", "Back."], "“L1” is not an entry of the project's know-how"],
      [["edit", "L2", " \n "], "an entry of the know-how cannot be empty"],
    ] as const) {
      const refus = await jouer(env, ...args);
      assert.equal(refus.code, 1, args.join(" "));
      assert.deepEqual(JSON.parse(refus.sortie), { ok: false, message });
    }
    assert.deepEqual(await entrees(env), [{ id: "L2", text: "Never kill a process by name.", ticket: 4002 }]);
  });

  test("ce qui ne se lit pas ne se devine pas : sans journal, la lecture échoue en 1 ; un usage inconnu, ou sans projet, en 2", async (t) => {
    const sansJournal = await jouer({ BRIGADE_STATE_DIR: repertoireTemporaire(t), BRIGADE_PROJECT: "a" });
    assert.equal(sansJournal.code, 1);
    assert.match(sansJournal.sortie, /^brigade: the know-how is not read — /);
    const env = etat(t);
    for (const args of [["edit", "L1"], ["remove"], ["remove", "L1", "L2"], ["list"]]) assert.equal((await jouer(env, ...args)).code, 2, args.join(" "));
    assert.equal((await jouer({ BRIGADE_STATE_DIR: env.BRIGADE_STATE_DIR })).code, 2);
    assert.equal((await jouer({ BRIGADE_PROJECT: "a" })).code, 2);
  });
});
