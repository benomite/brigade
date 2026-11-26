// Les gestes retenus lus là où la cuisine du projet tourne (held/read.ts, #4273) : la section `held gestures` de
// `manager`, telle que runtime/src/manager-cli.ts l'écrit (`montrerLesAttentes`), mise dans la forme du contrat ; et
// l'OK du chef, `manager approve <id>`. Ce qui ne se lit pas n'est jamais « aucun geste retenu ».
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ExecFileException } from "node:child_process";
import type { Lu, Rendu } from "../../src/box.ts";
import { approuverLeAction, lireLesRetenus } from "../../src/held/read.ts";

// La ligne de titre de `manager` : `ligne(titre, valeur)`, le titre sur 22 colonnes.
const titre = (valeur: string) => `${"held gestures".padEnd(22)}${valeur}`;
const SORTIE = [
  `${"manager".padEnd(22)}ON since 2026-11-25T08:00:00Z (by chef)`,
  `${"epics".padEnd(22)}none`,
  titre(""),
  "  2026-11-25T08:00:00.000Z  3  manager: split #4129 into 3 tickets — an epic split is held for the chef — `brigade parade manager approve 3`",
  "  2026-11-25T08:05:00.000Z  4  supervisor: reran `tests` on 0de1ff5 — red for 10 min — `brigade parade manager approve 4`",
  "  2026-11-25T08:06:00.000Z  5  closer: opened the closing pass #12 on `main` — nothing served for a day (approved: done at the runtime's next tick)",
  "",
].join("\n");
const LU: Lu = { nom: "parade", cuisine: { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } } };
const rendu = (sortie: string, error: Partial<ExecFileException> | null = null, erreurs = ""): Rendu => ({ lance: "$ node geste.ts parade manager", erreur: error as ExecFileException | null, sortie, erreurs });
// Ce que la vue reçoit d'une sortie de `manager` rendue par la station : les gestes, ou pourquoi ils ne se lisent pas.
async function retenusDe(sortie: string) {
  const lus = await lireLesRetenus(LU, async () => rendu(sortie));
  return lus === undefined || "gestes" in lus ? lus?.gestes : { sans: lus.sans };
}

describe("les gestes retenus lus dans `manager` (#4273)", () => {
  test("une ligne par geste, dans la forme du contrat ; un geste déjà approuvé n'attend plus l'OK du chef", async () => {
    assert.deepEqual(await retenusDe(SORTIE), [
      { id: "3", kind: "manager", summary: "split #4129 into 3 tickets", reason: "an epic split is held for the chef", approveCommand: "brigade parade manager approve 3", heldAt: "2026-11-25T08:00:00.000Z" },
      { id: "4", kind: "supervisor", summary: "reran `tests` on 0de1ff5", reason: "red for 10 min", approveCommand: "brigade parade manager approve 4", heldAt: "2026-11-25T08:05:00.000Z" },
    ]);
  });

  test("la section s'arrête au titre suivant", async () => {
    const suivie = [titre(""), "  2026-11-25T08:00:00.000Z  3  manager: split #1 into 2 tickets — held — `brigade parade manager approve 3`", `${"reactions".padEnd(22)}none`, "  not a gesture"].join("\n");
    assert.deepEqual(await retenusDe(suivie), [{ id: "3", kind: "manager", summary: "split #1 into 2 tickets", reason: "held", approveCommand: "brigade parade manager approve 3", heldAt: "2026-11-25T08:00:00.000Z" }]);
  });

  test("« none » : aucun ; « not read », une section absente ou une ligne sans la forme : jamais aucun", async () => {
    assert.deepEqual(await retenusDe(titre("none")), []);
    assert.deepEqual(await retenusDe(titre("not read — autonomy-pending.json cannot be read")), { sans: "held gestures not read — autonomy-pending.json cannot be read" });
    assert.match((await retenusDe(`${"manager".padEnd(22)}ON`) as { sans: string }).sans, /does not list them yet/);
    assert.match((await retenusDe([titre(""), "  2026-11-25 3 split"].join("\n")) as { sans: string }).sans, /does not have the expected form: “2026-11-25 3 split”/);
  });

  test("lus par `manager` sur la station de cet ordinateur ; rien pour un projet qui n'y cuit pas ; un échec se dit", async () => {
    const commands: string[] = [];
    const lancer = (answer: Rendu) => async (_: Lu, command: string) => (commands.push(command), answer);
    assert.equal(await lireLesRetenus(undefined, lancer(rendu(SORTIE))), undefined);
    assert.deepEqual(commands, []);
    const lus = await lireLesRetenus(LU, lancer(rendu(SORTIE)));
    assert.deepEqual(commands, ["manager"]);
    assert.deepEqual(lus !== undefined && "gestes" in lus ? lus.gestes.map(({ id }) => id) : lus, ["3", "4"]);
    assert.deepEqual(await lireLesRetenus(LU, lancer(rendu("", { code: 1 }, "brigade : no log in /station"))), { sans: "held gestures unavailable: `manager` failed on this computer's station", detail: "$ node geste.ts parade manager\nbrigade : no log in /station" });
    assert.deepEqual(await lireLesRetenus(LU, lancer(rendu(titre("not read — broken")))), { sans: "held gestures not read — broken", detail: `$ node geste.ts parade manager\n${titre("not read — broken")}` });
  });
});

describe("l'OK du chef à un geste retenu (#4273)", () => {
  const lancer = (answer: Rendu, commands: string[]) => async (_: Lu, command: string) => (commands.push(command), answer);

  test("`manager approve <id>` sur la station du projet : fait, ce que le runtime en dit", async () => {
    const commands: string[] = [];
    assert.deepEqual(await approuverLeAction("parade", LU, "3", lancer(rendu("brigade : gesture 3 of the manager approved (split #4129 into 3 tickets)\n"), commands)), { fait: "brigade : gesture 3 of the manager approved (split #4129 into 3 tickets)" });
    assert.deepEqual(commands, ["manager approve 3"]);
  });

  test("refusé : la raison du runtime, sans son préfixe ; sans raison, l'échec ; un runtime d'avant la commande, le dit", async () => {
    const commands: string[] = [];
    const refuse = await approuverLeAction("parade", LU, "9", lancer(rendu("", { code: 1 }, "brigade : no pending gesture 9 — nothing is approved\n"), commands));
    assert.equal("refus" in refuse && refuse.refus, "no pending gesture 9 — nothing is approved");
    const muet = await approuverLeAction("parade", LU, "9", lancer(rendu("", { code: 1 }), commands));
    assert.equal("refus" in muet && muet.refus, "nothing was approved: `manager approve` failed on this computer's station");
    const ancien = await approuverLeAction("parade", LU, "9", lancer(rendu("", { code: 66 }, "approve is not a runtime command"), commands));
    assert.match("refus" in ancien ? ancien.refus : "", /cannot approve a held gesture yet — update it/);
  });

  test("rien ne part pour un projet qui ne cuit pas ici, ni pour un id qui n'en est pas un", async () => {
    const commands: string[] = [];
    const ailleurs = await approuverLeAction("parade", undefined, "3", lancer(rendu(""), commands));
    assert.match("refus" in ailleurs ? ailleurs.refus : "", /parade does not cook on this computer/);
    for (const id of ["3; rm -rf /", 3, "0", ""]) {
      const refuse = await approuverLeAction("parade", LU, id, lancer(rendu(""), commands));
      assert.equal("refus" in refuse && refuse.refus, "nothing was approved: this is not the id of a held gesture");
    }
    assert.deepEqual(commands, []);
  });
});
