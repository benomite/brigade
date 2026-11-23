// #4026, critère 3 : la PR d'une épique qui tient la zone de ses propres tickets découpés la rend en un tour (panne #3932).
import assert from "node:assert/strict";
import { test } from "node:test";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const fiche = (zone: string) => `<!-- brigade:fiche -->\n- awaiting: none\n- zone: ${zone}`;

test("an epic's open PR does not keep the zone of its own split tickets after one tick", async () => {
  const faux = new FauxGitHub();
  faux.feu(10, ["epic", "fire"], "Epic body");
  faux.feu(11, CALIBRE, "Part of #10");
  faux.poster(11, "manager", fiche("runtime/src/a.ts"));
  const pr = faux.prOuverte(["runtime/src/a.ts"], "cook/10-abcdef01");
  pr.issue = 10;
  const a = faux.station("A", { places: 1, sauter: () => {}, cuisiner: async () => ({ echec: "not the point" }), avertir: () => {} });
  await a.tour();
  await a.calme();
  assert.ok(
    faux.cuissons.some(({ issue }) => issue === 11),
    `#11 starts, the epic's PR released its zone; started: ${faux.cuissons.map(({ issue }) => `#${issue}`).join(", ")}`,
  );
  assert.ok([...faux.commentaires.values()].flat().some((c) => /invariant 1/i.test(c.body)), "the repair is written on a ticket");
});
