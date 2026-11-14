// La porte de prise retient un ticket tant qu'un ticket en vol annonce un
// chemin de sa zone, et refuse celui dont la fiche n'en annonce aucune (#3509).
import assert from "node:assert/strict";
import { test } from "node:test";
import { attenteDeZone, ZONE_VIDE } from "../../src/chevauchement/chevauchement.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const ficheDe = (...zone: string[]) => `<!-- brigade:fiche -->\n- awaiting: none\n- zone: ${zone.length === 0 ? "none" : zone.join(", ")}`;

// Un ticket au feu, dont la fiche annonce `zone`.
function feu(faux: FauxGitHub, numero: number, ...zone: string[]): void {
  faux.feu(numero, CALIBRE, "the ticket's body");
  faux.poster(numero, "manager", ficheDe(...zone));
}

const cuits = (faux: FauxGitHub) => faux.cuissons.map(({ issue }) => issue).sort((a, b) => a - b);

async function tour(station: ReturnType<FauxGitHub["station"]>): Promise<void> {
  await station.tour();
  await station.calme();
}

test("two tickets with the same file in their zones: the second does not start while the first is not merged, and starts once it is", async () => {
  const faux = new FauxGitHub();
  feu(faux, 1, "runtime/src/a.ts", "docs/a.md");
  feu(faux, 2, "runtime/src/a.ts");
  const sauts: string[] = [];
  const a = faux.station("A", { places: 2, sauter: (_numero, ligne) => sauts.push(ligne) });
  await tour(a);
  assert.deepEqual(cuits(faux), [1]);
  assert.ok(sauts.some((ligne) => ligne.startsWith("#2 ") && ligne.endsWith("zone held by #1")), sauts.join("\n"));
  for (let n = 0; n < 4 && !cuits(faux).includes(2); n++) {
    if (faux.mergee(1) === undefined) assert.deepEqual(cuits(faux), [1], "#2 starts only once #1 is merged");
    await tour(a);
  }
  assert.ok(faux.mergee(1) !== undefined);
  assert.deepEqual(cuits(faux), [1, 2]);
});

test("a folder zone and a file inside that folder overlap; a sibling folder with a longer name does not", async () => {
  assert.deepEqual(attenteDeZone(2, ["runtime/src/chevauchement/a.ts"], [{ ticket: 1, zone: ["runtime/src/chevauchement/"] }]), { ticket: 2, attend: [1] });
  assert.deepEqual(attenteDeZone(2, ["runtime/src/chevauchement"], [{ ticket: 1, zone: ["runtime/src/chevauchement/a.ts"] }]), { ticket: 2, attend: [1] });
  assert.equal(attenteDeZone(2, ["runtime/src2/a.ts"], [{ ticket: 1, zone: ["runtime/src"] }]), null);

  const faux = new FauxGitHub();
  feu(faux, 1, "runtime/src/chevauchement/");
  feu(faux, 2, "runtime/src/chevauchement/a.ts");
  const sauts: string[] = [];
  const a = faux.station("A", { places: 2, sauter: (_numero, ligne) => sauts.push(ligne) });
  await tour(a);
  assert.deepEqual(cuits(faux), [1]);
  assert.ok(sauts.some((ligne) => ligne.startsWith("#2 ") && ligne.endsWith("zone held by #1")), sauts.join("\n"));
});

test("two tickets with disjoint zones both start in the same turn, with no waiting", async () => {
  const faux = new FauxGitHub();
  feu(faux, 1, "runtime/src/a.ts", "runtime/test/a/");
  feu(faux, 2, "runtime/src/b.ts", "runtime/test/b/");
  const sauts: string[] = [];
  const a = faux.station("A", { places: 2, sauter: (_numero, ligne) => sauts.push(ligne) });
  await tour(a);
  assert.deepEqual(cuits(faux), [1, 2]);
  assert.deepEqual(sauts, []);
});

test("a waiting ticket carries every blocking ticket in its `attend`", async () => {
  assert.deepEqual(
    attenteDeZone(3, ["runtime/src/a.ts", "runtime/src/b.ts"], [
      { ticket: 2, zone: ["runtime/src/b.ts"] },
      { ticket: 1, zone: ["runtime/src"] },
      { ticket: 4, zone: ["docs/"] },
      { ticket: 3, zone: ["runtime/src/a.ts"] },
    ]),
    { ticket: 3, attend: [1, 2] },
  );

  const faux = new FauxGitHub();
  feu(faux, 1, "runtime/src/a.ts");
  feu(faux, 2, "runtime/src/b.ts");
  feu(faux, 3, "runtime/src/a.ts", "runtime/src/b.ts");
  const sauts: string[] = [];
  const a = faux.station("A", { places: 3, sauter: (_numero, ligne) => sauts.push(ligne) });
  await tour(a);
  assert.deepEqual(cuits(faux), [1, 2]);
  assert.ok(sauts.some((ligne) => ligne.startsWith("#3 ") && ligne.endsWith("zone held by #1, #2")), sauts.join("\n"));
});

test("a ticket whose card announces an empty zone is refused, with a message asking for the files it expects to touch", async () => {
  const faux = new FauxGitHub();
  feu(faux, 1);
  const sauts: string[] = [];
  const a = faux.station("A", { places: 2, sauter: (_numero, ligne) => sauts.push(ligne) });
  await tour(a);
  await tour(a);
  assert.deepEqual(cuits(faux), []);
  assert.ok(sauts.length > 0 && sauts.every((ligne) => ligne.startsWith("#1 ") && ligne.endsWith(ZONE_VIDE)), sauts.join("\n"));
  assert.match(ZONE_VIDE, /name the files and folders it expects to touch/);

  // Its card names its files: it starts.
  faux.commentaires.set(1, []);
  faux.poster(1, "manager", ficheDe("runtime/src/a.ts"));
  await tour(a);
  assert.deepEqual(cuits(faux), [1]);
});
