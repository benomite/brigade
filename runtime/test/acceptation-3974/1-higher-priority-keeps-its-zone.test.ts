// #3974, critère 1 : un ticket de priorité plus basse ne prend jamais une zone qu'un ticket plus prioritaire attend.
import assert from "node:assert/strict";
import { test } from "node:test";
import { LABEL_IN_PASS } from "../../src/github-etat/etats.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const fiche = (zone: string) => `<!-- brigade:fiche -->\n- awaiting: none\n- zone: ${zone}`;

test("a ticket with no priority does not take a zone a waiting prio:0 ticket overlaps, while a place is free", async () => {
  const faux = new FauxGitHub();
  // #1 est en pass sur un fichier de `runtime/src` : #2 (prio:0, tout `runtime/src`) l'attend.
  faux.feu(1, [...CALIBRE, LABEL_IN_PASS]);
  faux.poster(1, "manager", fiche("runtime/src/a.ts"));
  faux.feu(2, [...CALIBRE, "prio:0"]);
  faux.poster(2, "manager", fiche("runtime/src"));
  // #3, sans priorité, ne chevauche pas #1 : il partirait, et tiendrait la zone de #2.
  faux.feu(3, CALIBRE);
  faux.poster(3, "manager", fiche("runtime/src/c.ts"));
  const a = faux.station("A", { places: 3, sauter: () => {}, cuisiner: async () => ({ echec: "not the point" }), avertir: () => {} });
  for (let i = 0; i < 3; i += 1) {
    await a.tour();
    await a.calme();
  }
  assert.ok(!faux.cuissons.some(({ issue }) => issue === 3), "#3 does not start on the zone #2 (prio:0) is waiting for");
});
