// Un ticket en WAITING ne tient aucune zone de fichiers (#3814) : les tickets derrière elle partent.
import assert from "node:assert/strict";
import { test } from "node:test";
import { corpsDeLAttente } from "../../src/attente-github/attente-github.ts";
import { brancheDuTicket } from "../../src/brigade-github.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const ficheDe = (...zone: string[]) => `<!-- brigade:fiche -->\n- awaiting: none\n- zone: ${zone.join(", ")}`;

function feu(faux: FauxGitHub, numero: number, labels: string[], ...zone: string[]): void {
  faux.feu(numero, [...CALIBRE, ...labels], "the ticket's body");
  faux.poster(numero, "manager", ficheDe(...zone));
}

const cuits = (faux: FauxGitHub) => faux.cuissons.map(({ issue }) => issue).sort((a, b) => a - b);

test("a ticket in WAITING holds no zone: the ticket behind it starts", async () => {
  const faux = new FauxGitHub();
  feu(faux, 1, ["waiting"], "runtime/src/a.ts");
  faux.poster(1, "station", corpsDeLAttente({ what: "the client's API key", who: "the client", followUp: "2026-11-25T00:00:00.000Z" }));
  faux.prOuverte(["runtime/src/a.ts"], brancheDuTicket(1));
  feu(faux, 2, [], "runtime/src/a.ts");
  const sauts: string[] = [];
  const a = faux.station("A", { places: 2, sauter: (_numero, ligne) => sauts.push(ligne), maintenant: () => new Date("2026-11-18T09:00:00Z") });
  await a.tour();
  await a.calme();
  assert.deepEqual(cuits(faux), [2], sauts.join("\n"));
  assert.deepEqual(sauts.filter((ligne) => ligne.startsWith("#2 ")), []);
});
