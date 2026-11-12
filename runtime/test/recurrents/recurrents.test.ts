// Les tickets récurrents d'un projet (#3230), par la commande `recurring` que le
// chef, le second et l'app jouent : déclarer, lister, suspendre, reprendre,
// retirer — et ce qui est refusé sans rien écrire.
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { Sortie } from "../../src/appel.ts";
import { principal } from "../../src/recurrents/commande.ts";
import { cheminDesRecurrents, ouvrirRecurrents } from "../../src/recurrents/recurrents.ts";
import { repertoireTemporaire } from "../outils.ts";

function recurring(repertoireEtat: string, ...args: string[]) {
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

const lister = (etat: string) => {
  const lu = recurring(etat);
  assert.equal(lu.code, 0, lu.erreur);
  return lu.json.recurring;
};

describe("the recurring command", () => {
  test("declaring daily, weekly + weekday and monthly + day persists each; listing returns {id, title, body, rhythm, paused, nextDate}", (t: TestContext) => {
    const etat = repertoireTemporaire(t);
    const ecrits = [
      recurring(etat, "declare", "--title", "Daily triage", "--body", "Look at the inbox", "--rhythm", "daily"),
      recurring(etat, "declare", "--title", "Weekly digest", "--rhythm", "weekly", "--weekday", "1"),
      recurring(etat, "declare", "--title", "Monthly invoice", "--body", "Send it", "--rhythm", "monthly", "--day", "31"),
    ];
    for (const ecrit of ecrits) assert.equal(ecrit.code, 0, ecrit.erreur);
    const lus = lister(etat);
    assert.equal(lus.length, 3);
    for (const lu of lus) assert.deepEqual(Object.keys(lu).sort(), ["body", "id", "nextDate", "paused", "rhythm", "title"]);
    assert.deepEqual(lus.map((lu: { id: string }) => lu.id), ecrits.map((ecrit) => ecrit.json.recurring.id));
    assert.deepEqual(
      lus.map(({ title, body, rhythm, paused }: Record<string, unknown>) => ({ title, body, rhythm, paused })),
      [
        { title: "Daily triage", body: "Look at the inbox", rhythm: { kind: "daily" }, paused: false },
        { title: "Weekly digest", body: "", rhythm: { kind: "weekly", weekday: 1 }, paused: false },
        { title: "Monthly invoice", body: "Send it", rhythm: { kind: "monthly", dayOfMonth: 31 }, paused: false },
      ],
    );
    for (const lu of lus) assert.match(lu.nextDate, /^\d{4}-\d{2}-\d{2}$/);
  });

  test("an unknown kind, a weekday or day of month out of range, an empty title are refused with a readable error, and nothing is stored", (t: TestContext) => {
    const etat = repertoireTemporaire(t);
    const refus: Array<[string[], RegExp]> = [
      [["--title", "x", "--rhythm", "yearly"], /unknown rhythm “yearly”/],
      [["--title", "x", "--rhythm", "weekly", "--weekday", "8"], /weekday 8 is out of range/],
      [["--title", "x", "--rhythm", "weekly", "--weekday", "monday"], /weekday monday is out of range/],
      [["--title", "x", "--rhythm", "weekly"], /weekday undefined is out of range/],
      [["--title", "x", "--rhythm", "monthly", "--day", "32"], /day of month 32 is out of range/],
      [["--title", "x", "--rhythm", "monthly", "--day", "0"], /day of month 0 is out of range/],
      [["--title", "  ", "--rhythm", "daily"], /the title is empty/],
      [["--rhythm", "daily"], /the title is empty/],
    ];
    for (const [args, message] of refus) {
      const refuse = recurring(etat, "declare", ...args);
      assert.equal(refuse.code, 1, args.join(" "));
      assert.equal(refuse.json.ok, false);
      assert.match(refuse.json.message, message);
    }
    assert.equal(existsSync(cheminDesRecurrents(etat)), false);
    assert.deepEqual(lister(etat), []);
  });

  test("pause marks it paused, resume restores it, remove deletes it from the list", (t: TestContext) => {
    const etat = repertoireTemporaire(t);
    const { id } = recurring(etat, "declare", "--title", "Daily triage", "--rhythm", "daily").json.recurring;
    assert.equal(recurring(etat, "pause", id).json.recurring.paused, true);
    assert.equal(lister(etat)[0].paused, true);
    assert.equal(recurring(etat, "resume", id).json.recurring.paused, false);
    assert.equal(lister(etat)[0].paused, false);
    assert.deepEqual(recurring(etat, "remove", id).json, { ok: true });
    assert.deepEqual(lister(etat), []);
    // Un identifiant inconnu est refusé.
    for (const geste of ["pause", "resume", "remove"]) {
      const refuse = recurring(etat, geste, id);
      assert.equal(refuse.code, 1, geste);
      assert.match(refuse.json.message, new RegExp(`no recurring ticket ${id}`));
    }
  });

  test("resumed after its date, it restarts at its next occurrence from today: the dates passed while paused create nothing", (t: TestContext) => {
    const etat = repertoireTemporaire(t);
    let maintenant = new Date("2026-11-11T09:00:00Z");
    const recurrents = ouvrirRecurrents(etat, { maintenant: () => maintenant });
    const { id, nextDate } = recurrents.declare({ title: "Weekly digest", rhythm: { kind: "weekly", weekday: 1 } });
    assert.equal(nextDate, "2026-11-16");
    recurrents.pause(id);
    maintenant = new Date("2026-12-02T09:00:00Z");
    assert.equal(recurrents.resume(id).nextDate, "2026-12-07");
  });

  test("an unreadable file is said, never rewritten: neither a listing nor a declaration overwrites it", (t: TestContext) => {
    const etat = repertoireTemporaire(t);
    writeFileSync(cheminDesRecurrents(etat), "{ pas du json");
    const lu = recurring(etat);
    assert.equal(lu.code, 1);
    assert.match(lu.erreur, /recurring tickets are not read — .*recurring\.json is not valid JSON/);
    const declare = recurring(etat, "declare", "--title", "x", "--rhythm", "daily");
    assert.equal(declare.code, 1);
    assert.match(declare.json.message, /not valid JSON/);
    assert.equal(readFileSync(join(etat, "recurring.json"), "utf8"), "{ pas du json");
  });

  test("a usage that does not read exits with 2, naming the command", (t: TestContext) => {
    const etat = repertoireTemporaire(t);
    for (const args of [["bouger"], ["pause"], ["declare", "--title"], ["declare", "--colour", "red"], ["remove", "a", "b"]]) {
      const refuse = recurring(etat, ...args);
      assert.equal(refuse.code, 2, args.join(" "));
      assert.match(refuse.erreur, /run recurring/);
    }
    const sansEtat = (() => {
      try {
        principal({ args: [], env: {}, dire: () => {}, redire: () => {} });
        return 0;
      } catch (e) {
        return (e as Sortie).code;
      }
    })();
    assert.equal(sansEtat, 2);
  });
});
