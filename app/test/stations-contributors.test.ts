// Les stations contributrices du projet, côté app (#2936) : lues et changées par la commande du runtime
// `contributor-stations` là où la cuisine du projet tourne. Une sortie illisible, un runtime trop vieux ou un projet sans
// station ne se devinent pas : ils se disent.
import assert from "node:assert/strict";
import type { ExecFileException } from "node:child_process";
import { describe, test } from "node:test";
import type { Read, Rendered } from "../src/box.ts";
import { commandOfStations, writeTheStations, readTheStations } from "../src/stations-contributors.ts";

const BOX: Read = { nom: "parade", cuisine: { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } } };
const rendered = (output: string, code: number | null = null, errors = ""): Rendered => ({
  lance: "$ node geste.ts parade contributor-stations",
  erreur: code === null ? null : (Object.assign(new Error(`exit ${code}`), { code }) as ExecFileException),
  sortie: output,
  erreurs: errors,
});
function launcher(render: Rendered) {
  const launched: string[] = [];
  return { lancees: launched, lancer: async (_: Read, command: string) => (launched.push(command), render) };
}

describe("les stations contributrices, par la commande `contributor-stations`", () => {
  test("la lecture rend les stations, refusées ou non", async () => {
    const { lancees: launched, lancer: launch } = launcher(rendered(`${JSON.stringify({ stations: [{ station: "bob-pc/claude", login: "bob", refused: true }, { station: "carol/claude", login: null, refused: true }] })}\n`));
    assert.deepEqual(await readTheStations("parade", BOX, launch), [
      { station: "bob-pc/claude", login: "bob", refused: true },
      { station: "carol/claude", login: null, refused: true },
    ]);
    assert.deepEqual(launched, ["contributor-stations"]);
  });

  test("une lecture qui échoue se dit : sans station, runtime trop vieux, sortie illisible, commande en échec", async () => {
    assert.match(((await readTheStations("parade", undefined, async () => assert.fail("rien à lancer"))) as { sans: string }).sans, /has no station/);
    const old = await readTheStations("parade", BOX, launcher(rendered("", 66, "brigade: “contributor-stations” is not a runtime command")).lancer);
    assert.match((old as { sans: string }).sans, /does not give them yet — update it/);
    for (const r of [rendered("pas du JSON\n"), rendered('{"stations":[{"station":"x"}]}\n'), rendered("", 1, "boom")]) {
      const readEntry = await readTheStations("parade", BOX, launcher(r).lancer);
      assert.equal((readEntry as { sans: string }).sans, "contributor stations unavailable");
      assert.match((readEntry as { detail: string }).detail, /contributor-stations/);
    }
  });

  test("refuser ou réaccepter part avec le nom de la station ; un nom qui ne s'écrit pas ne part pas", async () => {
    assert.deepEqual(commandOfStations({ refuse: "bob-pc/claude" }), { commande: "contributor-stations refuse bob-pc/claude" });
    assert.deepEqual(commandOfStations({ accept: "bob-pc/claude" }), { commande: "contributor-stations accept bob-pc/claude" });
    for (const bad of ["", "bob pc", "x; rm -rf /", 7, undefined]) assert.deepEqual(commandOfStations({ refuse: bad }), { refus: "nothing was sent: this is not a station name" });
    const { lancees: launched, lancer: launch } = launcher(rendered('{"ok":true}\n'));
    assert.deepEqual(await writeTheStations("parade", BOX, { refuse: "bad name" }, launch), { refus: "nothing was sent: this is not a station name" });
    assert.deepEqual(launched, []);
    assert.deepEqual(await writeTheStations("parade", BOX, { refuse: "bob-pc/claude" }, launch), { ok: true });
    assert.deepEqual(launched, ["contributor-stations refuse bob-pc/claude"]);
  });

  test("un refus du runtime se dit en sa première ligne ; une réponse illisible, un runtime trop vieux ou un projet sans station se disent", async () => {
    const refusal = await writeTheStations("parade", BOX, { accept: "bob-pc/claude" }, launcher(rendered('{"ok":false,"message":"only the `chef` may refuse\\nsecond line"}\n', 1)).lancer);
    assert.equal((refusal as { refus: string }).refus, "only the chef may refuse");
    assert.match((await writeTheStations("parade", BOX, { accept: "x" }, launcher(rendered("???\n", 1)).lancer) as { refus: string }).refus, /could not be read/);
    assert.match((await writeTheStations("parade", BOX, { accept: "x" }, launcher(rendered("", 66, "is not a runtime command")).lancer) as { refus: string }).refus, /update it/);
    assert.match((await writeTheStations("parade", undefined, { accept: "x" }, async () => assert.fail("rien à lancer")) as { refus: string }).refus, /has no station/);
  });
});
