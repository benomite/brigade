// #3979, critère 3 : le cycle du 2026-11-20 (#3953, #3908, #3921, #3761, #3945) est reproduit, et la cuisine démarre un ticket.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const fiche = (zone: string) => `<!-- brigade:fiche -->\n- awaiting: none\n- zone: ${zone}`;

test("tickets that reserve zones for one another in a cycle, none claimed: the kitchen starts one", async () => {
  const faux = new FauxGitHub();
  // #3953 attend #3761, #3908 et #3921 ; ceux-ci attendent #3945 ; #3945 attend #3953.
  const zones: Record<number, string> = { 3953: "runtime/src/p.ts", 3761: "runtime/src/q.ts", 3908: "runtime/src/r.ts", 3921: "runtime/src/s.ts", 3945: "runtime/src/t.ts" };
  const pr: Record<number, string[]> = {
    3953: [zones[3945]!],
    3761: [zones[3953]!],
    3908: [zones[3953]!],
    3921: [zones[3953]!],
    3945: [zones[3761]!, zones[3908]!, zones[3921]!],
  };
  for (const [n, zone] of Object.entries(zones)) {
    faux.feu(Number(n), CALIBRE);
    faux.poster(Number(n), "manager", fiche(zone));
    faux.prOuverte(pr[Number(n)]!, `cook/${n}-abcdef01`);
  }
  const a = faux.station("A", { places: 3, sauter: () => {}, cuisiner: async () => ({ echec: "not the point" }), avertir: () => {} });
  await a.tour();
  await a.calme();
  assert.ok(faux.cuissons.length >= 1, "at least one ticket starts, the cycle does not freeze the kitchen");
});
