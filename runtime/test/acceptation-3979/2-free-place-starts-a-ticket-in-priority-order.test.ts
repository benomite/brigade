// #3979, critère 2 : des tickets claimables et une place libre, un ticket part dans le tour, par ordre de priorité ; aucun cycle d'attentes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const fiche = (zone: string) => `<!-- brigade:fiche -->\n- awaiting: none\n- zone: ${zone}`;

test("two unclaimed tickets whose open PRs overlap each other's zone: the higher priority starts within one tick", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, [...CALIBRE, "prio:1"]);
  faux.poster(1, "manager", fiche("runtime/src/a.ts"));
  faux.prOuverte(["runtime/src/b.ts"], "cook/1-abcdef01");
  faux.feu(2, [...CALIBRE, "prio:0"]);
  faux.poster(2, "manager", fiche("runtime/src/b.ts"));
  faux.prOuverte(["runtime/src/a.ts"], "cook/2-abcdef01");
  const a = faux.station("A", { places: 1, sauter: () => {}, cuisiner: async () => ({ echec: "not the point" }), avertir: () => {} });
  await a.tour();
  await a.calme();
  assert.deepEqual(
    faux.cuissons.map(({ issue }) => issue),
    [2],
    "the prio:0 ticket takes the only place, the kitchen does not freeze",
  );
});
