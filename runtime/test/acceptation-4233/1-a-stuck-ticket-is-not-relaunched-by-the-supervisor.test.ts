// #4233, critère 1 : avec un ticket bloqué, le superviseur ne lance pas de cook pour lui — ni en le remettant sur le
// rail, ni en relançant ses jobs : il ne reste que le commentaire du run.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Reveil } from "../../src/superviseur/declencheur.ts";
import { jouerLeRun } from "../../src/superviseur/gestes.ts";
import { FauxDepot } from "../superviseur/faux-depot.ts";

const BLOQUE: Reveil = { cause: "no-progress", state: "set-aside", since: "2026-11-20T08:00:00.000Z", ticket: 40 } as Reveil;

test("a stuck ticket is never put back on the rail nor rerun by the supervisor: no cook can start for it", async () => {
  const demandes: unknown[] = [
    { gesture: "back-on-rail", ticket: 40, note: "its zone is free again" },
    { gesture: "rerun", ticket: 40 },
    { gesture: "relaunch", ticket: 40 },
    { gesture: "reclaim", ticket: 40 },
  ];
  for (const gesture of demandes) {
    const depot = new FauxDepot();
    depot.issue(40, ["fire", "set-aside:failures"]);
    depot.checkRouge("tests (linux)", 7);
    await jouerLeRun({ github: depot.client(), depot: "acme/shop", branche: "main", maintenant: new Date("2026-11-20T10:00:00.000Z") }, BLOQUE, { saw: "the ticket is stuck", gesture });
    const label = JSON.stringify(gesture);
    assert.deepEqual(depot.labelsDe(40), ["fire", "set-aside:failures"], `${label}: the ticket is untouched`);
    assert.deepEqual(depot.relances(), [], `${label}: no job rerun`);
    assert.deepEqual(
      depot.appels.filter(({ methode, chemin }) => methode !== "GET" && !/\/issues\/\d+\/comments$/.test(chemin) && !/\/labels/.test(chemin)).map(({ chemin }) => chemin),
      [],
      `${label}: nothing written but the run's comment and a park`,
    );
  }
});
