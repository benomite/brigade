// #4026, critère 2 : des tickets sans cook, en cycle de zones (panne #3979), rendent leurs zones en un tour.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const fiche = (zone: string) => `<!-- brigade:fiche -->\n- awaiting: none\n- zone: ${zone}`;

test("unclaimed tickets whose open PRs hold each other's zones in a cycle release them after one tick", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, CALIBRE);
  faux.poster(1, "manager", fiche("runtime/src/a.ts"));
  faux.feu(2, CALIBRE);
  faux.poster(2, "manager", fiche("runtime/src/b.ts"));
  faux.prOuverte(["runtime/src/b.ts"], "cook/1-abcdef01");
  faux.prOuverte(["runtime/src/a.ts"], "cook/2-abcdef01");
  const a = faux.station("A", { places: 1, sauter: () => {}, cuisiner: async () => ({ echec: "not the point" }), avertir: () => {} });
  await a.tour();
  await a.calme();
  const reprises = faux.commentaires;
  const dit = [...reprises.values()].flat().some((c) => /invariant 1/i.test(c.body));
  assert.ok(dit, "the supervisor wrote which invariant broke (invariant 1) on a ticket");
  assert.ok(faux.cuissons.length > 0, "after the tick a ticket of the cycle starts: its zone is no longer held");
});
