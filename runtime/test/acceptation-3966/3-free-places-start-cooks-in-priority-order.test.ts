// #3966, critère 3 : quand des tickets sont prêts et des places libres, un cook part dans le tour, par priorité (prio:0 d'abord).
import assert from "node:assert/strict";
import { test } from "node:test";
import { LABEL_TAKEN } from "../../src/github-etat/etats.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const ficheDe = (...zone: string[]) => `<!-- brigade:fiche -->\n- awaiting: none\n- zone: ${zone.join(", ")}`;

function feu(faux: FauxGitHub, numero: number, labels: string[], ...zone: string[]): void {
  faux.feu(numero, [...CALIBRE, ...labels], "the ticket's body");
  faux.poster(numero, "manager", ficheDe(...zone));
}

test("with ready tickets and free places, one tick starts the cooks, prio:0 first, though an unclaimed ticket sits on its zone", async () => {
  const faux = new FauxGitHub();
  // #1 is taken by nobody and cooks nothing; #2 (prio:0) shares its zone, #3 (prio:2) is elsewhere. One place is free.
  feu(faux, 1, [LABEL_TAKEN, "prio:1"], "runtime/src/a.ts");
  feu(faux, 3, ["prio:2"], "runtime/src/c.ts");
  feu(faux, 2, ["prio:0"], "runtime/src/a.ts");
  const sauts: string[] = [];
  const a = faux.station("A", { places: 1, sauter: (_numero, ligne) => sauts.push(ligne), cuisiner: async () => ({ echec: "not the point" }), avertir: () => {} });
  await a.tour();
  await a.calme();
  assert.deepEqual(faux.cuissons.map(({ issue }) => issue), [2], `the single free place goes to the prio:0 ticket within one tick:\n${sauts.join("\n")}`);
});
