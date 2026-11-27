// Les stations contributrices du projet, côté app (#2936) : lues et changées par la commande du runtime
// `contributor-stations` là où la cuisine du projet tourne. Une sortie illisible, un runtime trop vieux ou un projet sans
// station ne se devinent pas : ils se disent.
import assert from "node:assert/strict";
import type { ExecFileException } from "node:child_process";
import { describe, test } from "node:test";
import type { Lu, Rendu } from "../src/box.ts";
import { commandeDesStations, ecrireLesStations, lireLesStations } from "../src/stations-contributrices.ts";

const BOX: Lu = { nom: "parade", cuisine: { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } } };
const rendu = (sortie: string, code: number | null = null, erreurs = ""): Rendu => ({
  lance: "$ node geste.ts parade contributor-stations",
  erreur: code === null ? null : (Object.assign(new Error(`exit ${code}`), { code }) as ExecFileException),
  sortie,
  erreurs,
});
function lanceur(rendre: Rendu) {
  const lancees: string[] = [];
  return { lancees, lancer: async (_: Lu, commande: string) => (lancees.push(commande), rendre) };
}

describe("les stations contributrices, par la commande `contributor-stations`", () => {
  test("la lecture rend les stations, refusées ou non", async () => {
    const { lancees, lancer } = lanceur(rendu(`${JSON.stringify({ stations: [{ station: "bob-pc/claude", login: "bob", refused: true }, { station: "carol/claude", login: null, refused: true }] })}\n`));
    assert.deepEqual(await lireLesStations("parade", BOX, lancer), [
      { station: "bob-pc/claude", login: "bob", refused: true },
      { station: "carol/claude", login: null, refused: true },
    ]);
    assert.deepEqual(lancees, ["contributor-stations"]);
  });

  test("une lecture qui échoue se dit : sans station, runtime trop vieux, sortie illisible, commande en échec", async () => {
    assert.match(((await lireLesStations("parade", undefined, async () => assert.fail("rien à lancer"))) as { sans: string }).sans, /has no station/);
    const vieux = await lireLesStations("parade", BOX, lanceur(rendu("", 66, "brigade: “contributor-stations” is not a runtime command")).lancer);
    assert.match((vieux as { sans: string }).sans, /does not give them yet — update it/);
    for (const r of [rendu("pas du JSON\n"), rendu('{"stations":[{"station":"x"}]}\n'), rendu("", 1, "boom")]) {
      const lue = await lireLesStations("parade", BOX, lanceur(r).lancer);
      assert.equal((lue as { sans: string }).sans, "contributor stations unavailable");
      assert.match((lue as { detail: string }).detail, /contributor-stations/);
    }
  });

  test("refuser ou réaccepter part avec le nom de la station ; un nom qui ne s'écrit pas ne part pas", async () => {
    assert.deepEqual(commandeDesStations({ refuse: "bob-pc/claude" }), { commande: "contributor-stations refuse bob-pc/claude" });
    assert.deepEqual(commandeDesStations({ accept: "bob-pc/claude" }), { commande: "contributor-stations accept bob-pc/claude" });
    for (const mauvais of ["", "bob pc", "x; rm -rf /", 7, undefined]) assert.deepEqual(commandeDesStations({ refuse: mauvais }), { refus: "nothing was sent: this is not a station name" });
    const { lancees, lancer } = lanceur(rendu('{"ok":true}\n'));
    assert.deepEqual(await ecrireLesStations("parade", BOX, { refuse: "bad name" }, lancer), { refus: "nothing was sent: this is not a station name" });
    assert.deepEqual(lancees, []);
    assert.deepEqual(await ecrireLesStations("parade", BOX, { refuse: "bob-pc/claude" }, lancer), { ok: true });
    assert.deepEqual(lancees, ["contributor-stations refuse bob-pc/claude"]);
  });

  test("un refus du runtime se dit en sa première ligne ; une réponse illisible, un runtime trop vieux ou un projet sans station se disent", async () => {
    const refus = await ecrireLesStations("parade", BOX, { accept: "bob-pc/claude" }, lanceur(rendu('{"ok":false,"message":"only the `chef` may refuse\\nsecond line"}\n', 1)).lancer);
    assert.equal((refus as { refus: string }).refus, "only the chef may refuse");
    assert.match((await ecrireLesStations("parade", BOX, { accept: "x" }, lanceur(rendu("???\n", 1)).lancer) as { refus: string }).refus, /could not be read/);
    assert.match((await ecrireLesStations("parade", BOX, { accept: "x" }, lanceur(rendu("", 66, "is not a runtime command")).lancer) as { refus: string }).refus, /update it/);
    assert.match((await ecrireLesStations("parade", undefined, { accept: "x" }, async () => assert.fail("rien à lancer")) as { refus: string }).refus, /has no station/);
  });
});
