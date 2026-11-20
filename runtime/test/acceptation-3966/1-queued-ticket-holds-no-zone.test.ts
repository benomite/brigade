// #3966, critère 1 : seul un ticket qu'un cook cuisine, ou une livraison en pass, tient une zone. Un ticket en file n'en tient jamais.
import assert from "node:assert/strict";
import { test } from "node:test";
import { LABEL_TAKEN } from "../../src/github-etat/etats.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const ficheDe = (...zone: string[]) => `<!-- brigade:fiche -->\n- awaiting: none\n- zone: ${zone.join(", ")}`;

function feu(faux: FauxGitHub, numero: number, labels: string[], ...zone: string[]): void {
  faux.feu(numero, [...CALIBRE, ...labels], "the ticket's body");
  faux.poster(numero, "manager", ficheDe(...zone));
}

test("a ticket nobody has claimed holds no zone, even labelled taken: the ticket behind it starts", async () => {
  const faux = new FauxGitHub();
  // #1 carries the `taken` label but no station's claim comment and no cook: it is queued in fact.
  feu(faux, 1, [LABEL_TAKEN], "runtime/src/a.ts");
  feu(faux, 2, [], "runtime/src/a.ts");
  const sauts: string[] = [];
  const a = faux.station("A", { places: 2, sauter: (_numero, ligne) => sauts.push(ligne), cuisiner: async () => ({ echec: "not the point" }), avertir: () => {} });
  await a.tour();
  await a.calme();
  assert.deepEqual(sauts.filter((ligne) => ligne.startsWith("#2 ")), [], sauts.join("\n"));
  assert.ok(faux.cuissons.some(({ issue }) => issue === 2), `#2 starts, #1 being claimed by nobody:\n${sauts.join("\n")}`);
});
