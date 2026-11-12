// Le registre des explications des mots de la cuisine (#3308), par la commande
// `explanations` que l'app joue là où la cuisine du projet tourne : ce que chaque
// chef a vu ou écarté s'y écrit, s'y relit et s'y efface — par chef, pas par
// appareil : deux appareils du même chef jouent la même commande sur le même
// répertoire d'état, et lisent la même chose ; un autre chef ne lit pas la sienne.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { Sortie } from "../../src/appel.ts";
import { principal } from "../../src/explications/commande.ts";
import { cheminDesExplications, MOTS_EXPLIQUES } from "../../src/explications/explications.ts";
import { lancer, repertoireTemporaire } from "../outils.ts";

function explanations(repertoireEtat: string, ...args: string[]) {
  const sortie: string[] = [];
  const erreur: string[] = [];
  let code = 0;
  try {
    principal({ args, env: { BRIGADE_STATE_DIR: repertoireEtat }, dire: (ligne) => sortie.push(ligne), redire: (ligne) => erreur.push(ligne) });
  } catch (e) {
    if (!(e instanceof Sortie)) throw e;
    code = e.code;
  }
  return { code, json: sortie.length === 1 ? JSON.parse(sortie[0] ?? "") : undefined, erreur: erreur.join("\n") };
}

const vus = (etat: string, chef: string) => {
  const lu = explanations(etat, "--chef", chef);
  assert.equal(lu.code, 0, lu.erreur);
  return lu.json.seen;
};

describe("the explanations command", () => {
  test("an empty record reads no word: every explanation is still to show", (t: TestContext) => {
    assert.deepEqual(vus(repertoireTemporaire(t), "alice"), []);
  });

  test("a word seen is stored and read back, in the order of the six words; seen twice, it is kept once", (t: TestContext) => {
    const etat = repertoireTemporaire(t);
    assert.deepEqual(explanations(etat, "seen", "WAITING", "--chef", "alice").json, { ok: true, seen: ["WAITING"] });
    assert.deepEqual(explanations(etat, "seen", "rail", "--chef", "alice").json, { ok: true, seen: ["rail", "WAITING"] });
    assert.deepEqual(explanations(etat, "seen", "rail", "--chef", "alice").json, { ok: true, seen: ["rail", "WAITING"] });
    assert.deepEqual(vus(etat, "alice"), ["rail", "WAITING"]);
  });

  test("the record is kept per chef, not per device: another session of the same chef reads it, another chef does not", (t: TestContext) => {
    const etat = repertoireTemporaire(t);
    // Son Mac : il voit l'explication de « pass ».
    assert.equal(explanations(etat, "seen", "pass", "--chef", "Alice").code, 0);
    // Son PC, une autre session : même compte GitHub — la casse n'y change rien, comme sur GitHub.
    assert.deepEqual(vus(etat, "alice"), ["pass"]);
    // Bob, sur le même projet : rien de vu.
    assert.deepEqual(vus(etat, "bob"), []);
    assert.deepEqual(JSON.parse(readFileSync(cheminDesExplications(etat), "utf8")), { chefs: { alice: ["pass"] } });
  });

  test("reset clears the chef's record only: each of the six words is to show again, for this chef on every device", (t: TestContext) => {
    const etat = repertoireTemporaire(t);
    for (const mot of MOTS_EXPLIQUES) assert.equal(explanations(etat, "seen", mot, "--chef", "alice").code, 0);
    assert.equal(explanations(etat, "seen", "cook", "--chef", "bob").code, 0);
    assert.deepEqual(vus(etat, "alice"), [...MOTS_EXPLIQUES]);
    assert.deepEqual(explanations(etat, "reset", "--chef", "alice").json, { ok: true, seen: [] });
    assert.deepEqual(vus(etat, "alice"), []);
    assert.deepEqual(vus(etat, "bob"), ["cook"]);
    // Rien à effacer : la réponse est la même, et rien ne change.
    assert.deepEqual(explanations(etat, "reset", "--chef", "carol").json, { ok: true, seen: [] });
    assert.deepEqual(vus(etat, "bob"), ["cook"]);
  });

  test("a word that is not one of the six, or a chef that is not a GitHub account, is refused and writes nothing", (t: TestContext) => {
    const etat = repertoireTemporaire(t);
    const mot = explanations(etat, "seen", "kitchen", "--chef", "alice");
    assert.equal(mot.code, 1);
    assert.equal(mot.json.ok, false);
    assert.match(mot.json.message, /“kitchen” is not one of the explained words: rail, pass, cook, second, TODO, WAITING/);
    const chef = explanations(etat, "seen", "rail", "--chef", "../alice");
    assert.equal(chef.code, 1);
    assert.match(chef.json.message, /is not a GitHub account/);
    assert.equal(explanations(etat, "--chef", "-x").code, 1);
    assert.deepEqual(vus(etat, "alice"), []);
  });

  test("an unreadable record is said, never read as empty nor overwritten", (t: TestContext) => {
    const etat = repertoireTemporaire(t);
    const chemin = cheminDesExplications(etat);
    for (const contenu of ["{ not json", JSON.stringify({ chefs: { alice: ["kitchen"] } }), JSON.stringify({ chefs: [] })]) {
      writeFileSync(chemin, contenu);
      const lu = explanations(etat, "--chef", "alice");
      assert.equal(lu.code, 1);
      assert.match(lu.erreur, /the explanations are not read — explanations\.json/);
      for (const ecrit of [explanations(etat, "seen", "rail", "--chef", "alice"), explanations(etat, "reset", "--chef", "alice")]) {
        assert.equal(ecrit.code, 1);
        assert.equal(ecrit.json.ok, false);
      }
      assert.equal(readFileSync(chemin, "utf8"), contenu);
    }
  });

  test("a usage that does not read exits 2, naming the usage", (t: TestContext) => {
    const etat = repertoireTemporaire(t);
    for (const args of [[], ["seen", "rail"], ["seen", "--chef", "alice"], ["reset", "rail", "--chef", "alice"], ["bouger", "--chef", "alice"], ["--chef"]]) {
      const lu = explanations(etat, ...args);
      assert.equal(lu.code, 2, args.join(" "));
      assert.match(lu.erreur, /usage: .*explanations/);
    }
    assert.equal(explanations("", "--chef", "alice").code, 2);
  });

  test("launched as the station launches it — its script — a second process of the same chef reads what the first wrote", async (t: TestContext) => {
    const etat = repertoireTemporaire(t);
    const cli = join(import.meta.dirname, "..", "..", "src", "explications-cli.ts");
    const premier = lancer(t, cli, ["seen", "second", "--chef", "alice"], { BRIGADE_STATE_DIR: etat });
    assert.equal(await premier.fin, 0, premier.sortie());
    const second = lancer(t, cli, ["--chef", "alice"], { BRIGADE_STATE_DIR: etat });
    assert.equal(await second.fin, 0, second.sortie());
    assert.deepEqual(JSON.parse(second.sortie().trim()), { seen: ["second"] });
  });
});
