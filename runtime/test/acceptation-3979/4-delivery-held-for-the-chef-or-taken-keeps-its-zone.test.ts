// #3979 : seuls les tickets en file lâchent leur zone ; un ticket qui attend le chef, ou dont la prise se lit, la garde.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CHEF_TODO } from "../../src/github-etat/etats.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const fiche = (zone: string) => `<!-- brigade:fiche -->\n- awaiting: none\n- zone: ${zone}`;

async function demarre(labelsDeDeux: string[], prise: boolean): Promise<boolean> {
  const faux = new FauxGitHub();
  faux.feu(2, [...labelsDeDeux]);
  faux.poster(2, "manager", fiche("runtime/src/b.ts"));
  if (prise) faux.poster(2, "autre/station", "<!-- brigade:prise station=autre/station -->");
  faux.prOuverte(["runtime/src/a.ts"], "cook/2-abcdef01");
  faux.feu(1, [...CALIBRE, "prio:0"]);
  faux.poster(1, "manager", fiche("runtime/src/a.ts"));
  const a = faux.station("A", { places: 1, sauter: () => {}, cuisiner: async () => ({ echec: "not the point" }), avertir: () => {} });
  await a.tour();
  await a.calme();
  return faux.cuissons.some(({ issue }) => issue === 1);
}

// #4260 : un ticket retenu pour le chef porte `chef-todo` (parqué pour lui), plus `blocked-on-human`.
test("the open PR of a ticket held for the chef keeps its zone", async () => {
  assert.equal(await demarre([...CALIBRE, CHEF_TODO], false), false);
});

test("the open PR of a ticket taken by a station keeps its zone", async () => {
  assert.equal(await demarre([...CALIBRE, "taken"], true), false);
});

test("the open PR of a ticket labelled taken with no readable prise holds nothing", async () => {
  assert.equal(await demarre([...CALIBRE, "taken"], false), true);
});
