// Les gestes retenus lus là où la cuisine du projet tourne (held/lecture.ts, #4273) : la section `held gestures` de
// `manager`, telle que runtime/src/manager-cli.ts l'écrit (`montrerLesAttentes`), mise dans la forme du contrat ; et
// l'OK du chef, `manager approve <id>`. Ce qui ne se lit pas n'est jamais « aucun geste retenu ».
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ExecFileException } from "node:child_process";
import type { Lu, Rendu } from "../../src/box.ts";
import { approuverLeGeste, lireLesRetenus, retenusDe } from "../../src/held/lecture.ts";

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
const rendu = (sortie: string, erreur: Partial<ExecFileException> | null = null, erreurs = ""): Rendu => ({ lance: "$ node geste.ts parade manager", erreur: erreur as ExecFileException | null, sortie, erreurs });

describe("les gestes retenus lus dans `manager` (#4273)", () => {
  test("une ligne par geste, dans la forme du contrat ; un geste déjà approuvé n'attend plus l'OK du chef", () => {
    assert.deepEqual(retenusDe(SORTIE), [
      { id: "3", kind: "manager", summary: "split #4129 into 3 tickets", reason: "an epic split is held for the chef", approveCommand: "brigade parade manager approve 3", heldAt: "2026-11-25T08:00:00.000Z" },
      { id: "4", kind: "supervisor", summary: "reran `tests` on 0de1ff5", reason: "red for 10 min", approveCommand: "brigade parade manager approve 4", heldAt: "2026-11-25T08:05:00.000Z" },
    ]);
  });

  test("la section s'arrête au titre suivant", () => {
    const suivie = [titre(""), "  2026-11-25T08:00:00.000Z  3  manager: split #1 into 2 tickets — held — `brigade parade manager approve 3`", `${"reactions".padEnd(22)}none`, "  not a gesture"].join("\n");
    assert.deepEqual(retenusDe(suivie), [{ id: "3", kind: "manager", summary: "split #1 into 2 tickets", reason: "held", approveCommand: "brigade parade manager approve 3", heldAt: "2026-11-25T08:00:00.000Z" }]);
  });

  test("« none » : aucun ; « not read », une section absente ou une ligne sans la forme : jamais aucun", () => {
    assert.deepEqual(retenusDe(titre("none")), []);
    assert.deepEqual(retenusDe(titre("not read — autonomy-pending.json cannot be read")), { sans: "held gestures not read — autonomy-pending.json cannot be read" });
    assert.match((retenusDe(`${"manager".padEnd(22)}ON`) as { sans: string }).sans, /does not list them yet/);
    assert.match((retenusDe([titre(""), "  2026-11-25 3 split"].join("\n")) as { sans: string }).sans, /does not have the expected form: “2026-11-25 3 split”/);
  });

  test("lus par `manager` sur la station de cet ordinateur ; rien pour un projet qui n'y cuit pas ; un échec se dit", async () => {
    const commandes: string[] = [];
    const lancer = (reponse: Rendu) => async (_: Lu, commande: string) => (commandes.push(commande), reponse);
    assert.equal(await lireLesRetenus(undefined, lancer(rendu(SORTIE))), undefined);
    assert.deepEqual(commandes, []);
    const lus = await lireLesRetenus(LU, lancer(rendu(SORTIE)));
    assert.deepEqual(commandes, ["manager"]);
    assert.deepEqual(lus !== undefined && "gestes" in lus ? lus.gestes.map(({ id }) => id) : lus, ["3", "4"]);
    assert.deepEqual(await lireLesRetenus(LU, lancer(rendu("", { code: 1 }, "brigade : no log in /station"))), { sans: "held gestures unavailable: `manager` failed on this computer's station", detail: "$ node geste.ts parade manager\nbrigade : no log in /station" });
    assert.deepEqual(await lireLesRetenus(LU, lancer(rendu(titre("not read — broken")))), { sans: "held gestures not read — broken", detail: `$ node geste.ts parade manager\n${titre("not read — broken")}` });
  });
});

describe("l'OK du chef à un geste retenu (#4273)", () => {
  const lancer = (reponse: Rendu, commandes: string[]) => async (_: Lu, commande: string) => (commandes.push(commande), reponse);

  test("`manager approve <id>` sur la station du projet : fait, ce que le runtime en dit", async () => {
    const commandes: string[] = [];
    assert.deepEqual(await approuverLeGeste("parade", LU, "3", lancer(rendu("brigade : gesture 3 of the manager approved (split #4129 into 3 tickets)\n"), commandes)), { fait: "brigade : gesture 3 of the manager approved (split #4129 into 3 tickets)" });
    assert.deepEqual(commandes, ["manager approve 3"]);
  });

  test("refusé : la raison du runtime, sans son préfixe ; sans raison, l'échec ; un runtime d'avant la commande, le dit", async () => {
    const commandes: string[] = [];
    const refuse = await approuverLeGeste("parade", LU, "9", lancer(rendu("", { code: 1 }, "brigade : no pending gesture 9 — nothing is approved\n"), commandes));
    assert.equal("refus" in refuse && refuse.refus, "no pending gesture 9 — nothing is approved");
    const muet = await approuverLeGeste("parade", LU, "9", lancer(rendu("", { code: 1 }), commandes));
    assert.equal("refus" in muet && muet.refus, "nothing was approved: `manager approve` failed on this computer's station");
    const ancien = await approuverLeGeste("parade", LU, "9", lancer(rendu("", { code: 66 }, "approve is not a runtime command"), commandes));
    assert.match("refus" in ancien ? ancien.refus : "", /cannot approve a held gesture yet — update it/);
  });

  test("rien ne part pour un projet qui ne cuit pas ici, ni pour un id qui n'en est pas un", async () => {
    const commandes: string[] = [];
    const ailleurs = await approuverLeGeste("parade", undefined, "3", lancer(rendu(""), commandes));
    assert.match("refus" in ailleurs ? ailleurs.refus : "", /parade does not cook on this computer/);
    for (const id of ["3; rm -rf /", 3, "0", ""]) {
      const refuse = await approuverLeGeste("parade", LU, id, lancer(rendu(""), commandes));
      assert.equal("refus" in refuse && refuse.refus, "nothing was approved: this is not the id of a held gesture");
    }
    assert.deepEqual(commandes, []);
  });
});
