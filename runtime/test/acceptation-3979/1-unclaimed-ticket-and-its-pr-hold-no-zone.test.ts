// #3979, critère 1 : un ticket qu'on ne cuit pas et qui n'est pas en pass ne tient aucune zone, ni sa PR ouverte.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const fiche = (zone: string) => `<!-- brigade:fiche -->\n- awaiting: none\n- zone: ${zone}`;

test("the open PR of a ticket nobody cooks does not hold the zone a claimable ticket overlaps", async () => {
  const faux = new FauxGitHub();
  // #2 n'est ni cuit ni en pass : sa PR ouverte touche le fichier de #1.
  faux.feu(2, CALIBRE);
  faux.poster(2, "manager", fiche("runtime/src/b.ts"));
  faux.prOuverte(["runtime/src/a.ts"], "cook/2-abcdef01");
  faux.feu(1, [...CALIBRE, "prio:0"]);
  faux.poster(1, "manager", fiche("runtime/src/a.ts"));
  const a = faux.station("A", { places: 1, sauter: () => {}, cuisiner: async () => ({ echec: "not the point" }), avertir: () => {} });
  await a.tour();
  await a.calme();
  assert.ok(
    faux.cuissons.some(({ issue }) => issue === 1),
    `#1 starts, the PR of unclaimed #2 holds nothing; started: ${faux.cuissons.map(({ issue }) => `#${issue}`).join(", ")}`,
  );
});
