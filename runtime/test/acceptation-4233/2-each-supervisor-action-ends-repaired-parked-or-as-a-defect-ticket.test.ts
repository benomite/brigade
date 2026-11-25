// #4233, critère 2 : chaque action du superviseur finit en l'un de trois états — état réparé, ticket mis de côté,
// ticket de défaut ouvert. Une action qui remet sur le rail ou relance n'en est aucun.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Reveil } from "../../src/superviseur/declencheur.ts";
import { jouerLeRun } from "../../src/superviseur/gestes.ts";
import { FauxDepot } from "../superviseur/faux-depot.ts";

const PRISES: Reveil = { cause: "takes", takes: 3, ticket: 40 };

const ACTIONS: Array<{ gesture: unknown; fin: "repaired" | "parked" | "defect" | null }> = [
  { gesture: { gesture: "waiting", ticket: 40, what: "the API key", who: "the client" }, fin: "parked" },
  { gesture: { gesture: "fix", cause: "the journal is read twice", title: "Read the journal once per tick", body: "The tick reads the journal twice." }, fin: "defect" },
  { gesture: { gesture: "close-duplicate", ticket: 40, of: 12 }, fin: "repaired" },
  { gesture: { gesture: "back-on-rail", ticket: 40, note: "its zone is free again" }, fin: null },
  { gesture: { gesture: "rerun", ticket: 40 }, fin: null },
];

test("each supervisor action ends as state repaired, ticket parked or defect ticket opened — never a relaunch", async () => {
  for (const { gesture, fin } of ACTIONS) {
    const depot = new FauxDepot();
    depot.issue(40, ["fire", "set-aside:failures"]);
    depot.issue(12, ["fire"]);
    depot.checkRouge("tests (linux)", 7);
    const trace = await jouerLeRun({ github: depot.client(), depot: "acme/shop", branche: "main", maintenant: new Date("2026-11-20T10:00:00.000Z") }, PRISES, { saw: "the dossier", gesture });
    const nom = JSON.stringify(gesture);
    const fins: string[] = [];
    if (depot.issues.get(40)?.state === "closed") fins.push("repaired");
    if (depot.labelsDe(40).includes("waiting")) fins.push("parked");
    if (depot.creees().length > 0) fins.push("defect");
    const relance = depot.relances().length > 0 || (!depot.labelsDe(40).includes("waiting") && !depot.labelsDe(40).includes("set-aside:failures"));
    assert.equal(relance, false, `${nom}: relaunched`);
    if (fin === null) {
      assert.notEqual(trace.outcome, "done", `${nom}: is not a supervisor action`);
      assert.deepEqual(fins, [], nom);
    } else {
      assert.equal(trace.outcome, "done", `${nom}: ${trace.comment}`);
      assert.deepEqual(fins, [fin], nom);
    }
  }
});
