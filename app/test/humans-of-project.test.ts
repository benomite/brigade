// Les humains du projet, côté app (#2930) : lus et changés par la commande du runtime `humans` (#2929) là où la cuisine
// du projet tourne. Une écriture rend l'adresse de la PR ou la ligne du refus ; une sortie illisible, un runtime trop
// vieux ou un projet sans station ne se devinent pas : ils se disent.
import assert from "node:assert/strict";
import type { ExecFileException } from "node:child_process";
import { describe, test } from "node:test";
import type { Read, Rendered } from "../src/box.ts";
import { commandOfHumans, writeTheHumans, readTheHumans } from "../src/humans-of-project.ts";

const BOX: Read = { nom: "parade", cuisine: { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } } };
const PR = "https://github.com/benomite/parade/pull/52";
const rendered = (output: string, code: number | null = null, errors = ""): Rendered => ({
  lance: "$ node geste.ts parade humans",
  erreur: code === null ? null : (Object.assign(new Error(`exit ${code}`), { code }) as ExecFileException),
  sortie: output,
  erreurs: errors,
});
// Un lanceur qui retient les commandes et rend ce qu'on lui donne.
function launcher(render: Rendered) {
  const launched: string[] = [];
  return { lancees: launched, lancer: async (_: Read, command: string) => (launched.push(command), render) };
}

describe("les humains du projet, par la commande `humans`", () => {
  test("la lecture rend les humains déclarés, avec les seuls rôles connus", async () => {
    const { lancees: launched, lancer: launch } = launcher(rendered(`${JSON.stringify({ humans: [{ login: "alice", roles: ["product", "chef"] }, { login: "bob", roles: [] }] })}\n`));
    assert.deepEqual(await readTheHumans("parade", BOX, launch), [
      { login: "alice", roles: ["product"] },
      { login: "bob", roles: [] },
    ]);
    assert.deepEqual(launched, ["humans"]);
  });

  test("une lecture qui échoue, illisible, d'un runtime trop vieux ou sans station se dit, sans liste inventée", async () => {
    const failure = await readTheHumans("parade", BOX, launcher(rendered("", 1, "brigade: the project's humans are not read — HTTP 502")).lancer);
    assert.ok(!Array.isArray(failure) && failure.sans === "humans unavailable" && failure.detail?.includes("HTTP 502"));
    const unreadable = await readTheHumans("parade", BOX, launcher(rendered("pas du json")).lancer);
    assert.ok(!Array.isArray(unreadable) && unreadable.sans === "humans unavailable");
    const old = await readTheHumans("parade", BOX, launcher(rendered("", 66, "humans is not a runtime command")).lancer);
    assert.ok(!Array.isArray(old) && /update it/.test(old.sans));
    const { lancees: launched, lancer: launch } = launcher(rendered("[]"));
    const withoutStation = await readTheHumans("parade", undefined, launch);
    assert.ok(!Array.isArray(withoutStation) && /has no station/.test(withoutStation.sans));
    assert.deepEqual(launched, []);
  });

  test("les mots d'une écriture : un login GitHub et des rôles connus, sinon rien ne part", () => {
    assert.deepEqual(commandOfHumans({ save: { login: " alice ", roles: ["product", "review"] } }), { commande: "humans save alice product review" });
    assert.deepEqual(commandOfHumans({ save: { login: "bob", roles: [] } }), { commande: "humans save bob" });
    assert.deepEqual(commandOfHumans({ remove: "bob" }), { commande: "humans remove bob" });
    assert.ok("refus" in commandOfHumans({ save: { login: "alice; rm -rf /", roles: [] } }));
    assert.ok("refus" in commandOfHumans({ save: { login: "alice", roles: ["chef"] } }));
    assert.ok("refus" in commandOfHumans({ remove: "" }));
  });

  test("une écriture rend l'adresse de la PR, ou la ligne du refus du runtime", async () => {
    const openOne = launcher(rendered(`${JSON.stringify({ ok: true, pr: PR })}\n`));
    assert.deepEqual(await writeTheHumans("parade", BOX, { save: { login: "carol", roles: ["design"] } }, openOne.lancer), { pr: PR });
    assert.deepEqual(openOne.lancees, ["humans save carol design"]);

    const refused = await writeTheHumans("parade", BOX, { remove: "ghost" }, launcher(rendered(`${JSON.stringify({ ok: false, message: "`ghost` is not a GitHub account" })}\n`, 1)).lancer);
    assert.ok("refus" in refused && refused.refus === "ghost is not a GitHub account");

    const unreadable = await writeTheHumans("parade", BOX, { remove: "bob" }, launcher(rendered("", 1, "boom")).lancer);
    assert.ok("refus" in unreadable && /could not be read/.test(unreadable.refus));
    const withoutStation = await writeTheHumans("parade", undefined, { remove: "bob" }, launcher(rendered("")).lancer);
    assert.ok("refus" in withoutStation && /no station/.test(withoutStation.refus));
  });
});
