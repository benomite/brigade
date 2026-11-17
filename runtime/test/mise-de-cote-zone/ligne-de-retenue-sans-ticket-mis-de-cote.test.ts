// La ligne de retenue ne dit jamais « zone held by #N » d'un ticket mis de côté (#3798).
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

test("the hold line never names a set-aside ticket as the holder of a zone", async () => {
  const faux = new FauxGitHub();
  feu(faux, 1, ["set-aside:failures"], "runtime/src/a.ts");
  faux.prOuverte(["runtime/src/a.ts"], brancheDuTicket(1));
  feu(faux, 2, [], "runtime/src/a.ts");
  feu(faux, 3, ["set-aside:failures"], "runtime/src/b.ts");
  faux.prOuverte(["runtime/src/b.ts"], brancheDuTicket(3));
  feu(faux, 4, [], "runtime/src/b.ts");
  const sauts: string[] = [];
  const a = faux.station("A", { places: 4, sauter: (_numero, ligne) => sauts.push(ligne) });
  await tour(a);
  await tour(a);
  assert.deepEqual(sauts.filter((ligne) => /zone held by[^\n]*#[13]\b/.test(ligne)), []);
});
