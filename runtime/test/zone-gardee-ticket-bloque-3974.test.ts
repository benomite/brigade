// #3974 : un ticket plus prioritaire qui ne partirait pas (il attend un ticket ouvert) ne garde pas sa zone contre celui qu'il attend.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CALIBRE, FauxGitHub } from "./faux-github.ts";

const fiche = (zone: string, attend = "none") => `<!-- brigade:fiche -->\n- awaiting: ${attend}\n- zone: ${zone}`;

test("a prio:0 ticket that waits on an overlapping lower ticket does not keep its zone against it", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, [...CALIBRE, "prio:0"]);
  faux.poster(1, "manager", fiche("runtime/src", "#2"));
  faux.feu(2, [...CALIBRE, "prio:2"]);
  faux.poster(2, "manager", fiche("runtime/src/b.ts"));
  const a = faux.station("A", { places: 3, sauter: () => {}, cuisiner: async () => ({ echec: "not the point" }), avertir: () => {} });
  await a.tour();
  await a.calme();
  assert.ok(faux.cuissons.some(({ issue }) => issue === 2), "#2 starts: #1 waits on it and cannot start");
});

const lanceSeul = async (labelsDeA: string[]) => {
  const faux = new FauxGitHub();
  faux.feu(1, labelsDeA);
  faux.poster(1, "manager", fiche("runtime/src"));
  faux.feu(2, [...CALIBRE, "prio:2"]);
  faux.poster(2, "manager", fiche("runtime/src/b.ts"));
  const a = faux.station("A", { places: 3, sauter: () => {}, cuisiner: async () => ({ echec: "not the point" }), avertir: () => {} });
  await a.tour();
  await a.calme();
  return faux.cuissons.map(({ issue }) => issue);
};

test("a prio:0 ticket needing a capability the station lacks does not keep its zone against a lower ticket", async () => {
  assert.deepEqual(await lanceSeul([...CALIBRE, "prio:0", "needs:gpu"]), [2]);
});

test("a prio:0 ticket with an incomplete calibration does not keep its zone against a lower ticket", async () => {
  assert.deepEqual(await lanceSeul(["fire", "prio:0"]), [2]);
});
