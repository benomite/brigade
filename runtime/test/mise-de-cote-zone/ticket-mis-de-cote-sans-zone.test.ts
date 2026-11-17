// Un ticket mis de côté ne tient aucune zone de fichiers (#3798) : les tickets derrière elle partent.
import assert from "node:assert/strict";
import { test } from "node:test";
import { brancheDuTicket } from "../../src/brigade-github.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const ficheDe = (...zone: string[]) => `<!-- brigade:fiche -->\n- awaiting: none\n- zone: ${zone.join(", ")}`;

// Un ticket au feu, dont la fiche annonce `zone`.
function feu(faux: FauxGitHub, numero: number, labels: string[], ...zone: string[]): void {
  faux.feu(numero, [...CALIBRE, ...labels], "the ticket's body");
  faux.poster(numero, "manager", ficheDe(...zone));
}

const cuits = (faux: FauxGitHub) => faux.cuissons.map(({ issue }) => issue).sort((a, b) => a - b);

async function tour(station: ReturnType<FauxGitHub["station"]>): Promise<void> {
  await station.tour();
  await station.calme();
}

test("a ticket set aside for failures holds no zone: the ticket behind it starts", async () => {
  const faux = new FauxGitHub();
  feu(faux, 1, ["set-aside:failures"], "runtime/src/a.ts");
  faux.prOuverte(["runtime/src/a.ts"], brancheDuTicket(1));
  feu(faux, 2, [], "runtime/src/a.ts");
  const sauts: string[] = [];
  const a = faux.station("A", { places: 2, sauter: (_numero, ligne) => sauts.push(ligne) });
  await tour(a);
  assert.deepEqual(cuits(faux), [2], sauts.join("\n"));
  assert.deepEqual(sauts.filter((ligne) => ligne.startsWith("#2 ")), []);
});
