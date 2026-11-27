// Les gestes retenus lus là où la cuisine du projet tourne (held/read.ts, #4273) : la section `held gestures` de
// `manager`, telle que runtime/src/manager-cli.ts l'écrit (`montrerLesAttentes`), mise dans la forme du contrat ; et
// l'OK du chef, `manager approve <id>`. Ce qui ne se lit pas n'est jamais « aucun geste retenu ».
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ExecFileException } from "node:child_process";
import type { Read, Rendered } from "../../src/box.ts";
import { approveTheAction, readTheHeld } from "../../src/held/read.ts";

// La ligne de titre de `manager` : `ligne(titre, valeur)`, le titre sur 22 colonnes.
const title = (value: string) => `${"held gestures".padEnd(22)}${value}`;
const OUTPUT = [
  `${"manager".padEnd(22)}ON since 2026-11-25T08:00:00Z (by chef)`,
  `${"epics".padEnd(22)}none`,
  title(""),
  "  2026-11-25T08:00:00.000Z  3  manager: split #4129 into 3 tickets — an epic split is held for the chef — `brigade parade manager approve 3`",
  "  2026-11-25T08:05:00.000Z  4  supervisor: reran `tests` on 0de1ff5 — red for 10 min — `brigade parade manager approve 4`",
  "  2026-11-25T08:06:00.000Z  5  closer: opened the closing pass #12 on `main` — nothing served for a day (approved: done at the runtime's next tick)",
  "",
].join("\n");
const READ: Read = { nom: "parade", cuisine: { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } } };
const rendered = (output: string, error: Partial<ExecFileException> | null = null, errors = ""): Rendered => ({ lance: "$ node geste.ts parade manager", erreur: error as ExecFileException | null, sortie: output, erreurs: errors });
// Ce que la vue reçoit d'une sortie de `manager` rendue par la station : les gestes, ou pourquoi ils ne se lisent pas.
async function heldOf(output: string) {
  const readOnes = await readTheHeld(READ, async () => rendered(output));
  return readOnes === undefined || "gestes" in readOnes ? readOnes?.gestes : { sans: readOnes.sans };
}

describe("les gestes retenus lus dans `manager` (#4273)", () => {
  test("une ligne par geste, dans la forme du contrat ; un geste déjà approuvé n'attend plus l'OK du chef", async () => {
    assert.deepEqual(await heldOf(OUTPUT), [
      { id: "3", kind: "manager", summary: "split #4129 into 3 tickets", reason: "an epic split is held for the chef", approveCommand: "brigade parade manager approve 3", heldAt: "2026-11-25T08:00:00.000Z" },
      { id: "4", kind: "supervisor", summary: "reran `tests` on 0de1ff5", reason: "red for 10 min", approveCommand: "brigade parade manager approve 4", heldAt: "2026-11-25T08:05:00.000Z" },
    ]);
  });

  test("la section s'arrête au titre suivant", async () => {
    const tracked = [title(""), "  2026-11-25T08:00:00.000Z  3  manager: split #1 into 2 tickets — held — `brigade parade manager approve 3`", `${"reactions".padEnd(22)}none`, "  not a gesture"].join("\n");
    assert.deepEqual(await heldOf(tracked), [{ id: "3", kind: "manager", summary: "split #1 into 2 tickets", reason: "held", approveCommand: "brigade parade manager approve 3", heldAt: "2026-11-25T08:00:00.000Z" }]);
  });

  test("« none » : aucun ; « not read », une section absente ou une ligne sans la forme : jamais aucun", async () => {
    assert.deepEqual(await heldOf(title("none")), []);
    assert.deepEqual(await heldOf(title("not read — autonomy-pending.json cannot be read")), { sans: "held gestures not read — autonomy-pending.json cannot be read" });
    assert.match((await heldOf(`${"manager".padEnd(22)}ON`) as { sans: string }).sans, /does not list them yet/);
    assert.match((await heldOf([title(""), "  2026-11-25 3 split"].join("\n")) as { sans: string }).sans, /does not have the expected form: “2026-11-25 3 split”/);
  });

  test("lus par `manager` sur la station de cet ordinateur ; rien pour un projet qui n'y cuit pas ; un échec se dit", async () => {
    const commands: string[] = [];
    const launch = (answer: Rendered) => async (_: Read, command: string) => (commands.push(command), answer);
    assert.equal(await readTheHeld(undefined, launch(rendered(OUTPUT))), undefined);
    assert.deepEqual(commands, []);
    const readOnes = await readTheHeld(READ, launch(rendered(OUTPUT)));
    assert.deepEqual(commands, ["manager"]);
    assert.deepEqual(readOnes !== undefined && "gestes" in readOnes ? readOnes.gestes.map(({ id }) => id) : readOnes, ["3", "4"]);
    assert.deepEqual(await readTheHeld(READ, launch(rendered("", { code: 1 }, "brigade : no log in /station"))), { sans: "held gestures unavailable: `manager` failed on this computer's station", detail: "$ node geste.ts parade manager\nbrigade : no log in /station" });
    assert.deepEqual(await readTheHeld(READ, launch(rendered(title("not read — broken")))), { sans: "held gestures not read — broken", detail: `$ node geste.ts parade manager\n${title("not read — broken")}` });
  });
});

describe("l'OK du chef à un geste retenu (#4273)", () => {
  const launch = (answer: Rendered, commands: string[]) => async (_: Read, command: string) => (commands.push(command), answer);

  test("`manager approve <id>` sur la station du projet : fait, ce que le runtime en dit", async () => {
    const commands: string[] = [];
    assert.deepEqual(await approveTheAction("parade", READ, "3", launch(rendered("brigade : gesture 3 of the manager approved (split #4129 into 3 tickets)\n"), commands)), { fait: "brigade : gesture 3 of the manager approved (split #4129 into 3 tickets)" });
    assert.deepEqual(commands, ["manager approve 3"]);
  });

  test("refusé : la raison du runtime, sans son préfixe ; sans raison, l'échec ; un runtime d'avant la commande, le dit", async () => {
    const commands: string[] = [];
    const refuses = await approveTheAction("parade", READ, "9", launch(rendered("", { code: 1 }, "brigade : no pending gesture 9 — nothing is approved\n"), commands));
    assert.equal("refus" in refuses && refuses.refus, "no pending gesture 9 — nothing is approved");
    const silent = await approveTheAction("parade", READ, "9", launch(rendered("", { code: 1 }), commands));
    assert.equal("refus" in silent && silent.refus, "nothing was approved: `manager approve` failed on this computer's station");
    const old = await approveTheAction("parade", READ, "9", launch(rendered("", { code: 66 }, "approve is not a runtime command"), commands));
    assert.match("refus" in old ? old.refus : "", /cannot approve a held gesture yet — update it/);
  });

  test("rien ne part pour un projet qui ne cuit pas ici, ni pour un id qui n'en est pas un", async () => {
    const commands: string[] = [];
    const elsewhere = await approveTheAction("parade", undefined, "3", launch(rendered(""), commands));
    assert.match("refus" in elsewhere ? elsewhere.refus : "", /parade does not cook on this computer/);
    for (const id of ["3; rm -rf /", 3, "0", ""]) {
      const refuses = await approveTheAction("parade", READ, id, launch(rendered(""), commands));
      assert.equal("refus" in refuses && refuses.refus, "nothing was approved: this is not the id of a held gesture");
    }
    assert.deepEqual(commands, []);
  });
});
