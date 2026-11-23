// Invariant 1 du rail (#4026) : un ticket qu'aucun cook ne cuit et qui n'est
// pas en pass ne tient ni ne réserve aucune zone de fichiers.
import assert from "node:assert/strict";
import { test } from "node:test";
import { priseDeLaStation } from "../../src/brigade-github.ts";
import { marqueDeLInvariant } from "../../src/invariants/invariants.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const fiche = (zone: string) => `<!-- brigade:fiche -->\n- awaiting: none\n- zone: ${zone}`;
const dits = (faux: FauxGitHub, invariant: number) => [...faux.commentaires.entries()].flatMap(([numero, liste]) => liste.filter((c) => c.body.includes(`<!-- brigade:invariant n=${invariant} `)).map((c) => ({ numero, body: c.body })));
const sansCook = { places: 1, sauter: () => {}, cuisiner: async () => ({ echec: "not the point" }), avertir: () => {} };

test("the repair names the open PR it released, and is written once per PR, even by a station that restarts", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, CALIBRE);
  faux.poster(1, "manager", fiche("runtime/src/a.ts"));
  faux.feu(2, CALIBRE);
  faux.poster(2, "manager", fiche("runtime/src/b.ts"));
  const deUn = faux.prOuverte(["runtime/src/b.ts"], "cook/1-abcdef01");
  const deDeux = faux.prOuverte(["runtime/src/a.ts"], "cook/2-abcdef01");
  const a = faux.station("A", sansCook);
  await a.tour();
  await a.calme();
  const premiers = dits(faux, 1);
  assert.deepEqual(premiers.map(({ numero }) => numero).sort(), [1, 2], "written on the ticket of each PR that held a zone");
  assert.match(premiers.find(({ numero }) => numero === 1)?.body ?? "", new RegExp(`its open PR #${deUn.number} held files of the zone of #2[\\s\\S]*released its zone`));
  assert.ok(premiers.find(({ numero }) => numero === 2)?.body.includes(marqueDeLInvariant(1, `pr=${deDeux.number}`)));
  // Une station neuve, sans mémoire : la marque sur le ticket suffit.
  const relancee = faux.station("A", sansCook);
  await relancee.tour();
  await relancee.calme();
  assert.equal(dits(faux, 1).length, 2, "not written again");
});

test("a ticket cooked on another station keeps the zone of its open PR: the waiting ticket does not start, and nothing is said", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, CALIBRE);
  faux.poster(1, "manager", fiche("runtime/src/a.ts"));
  faux.feu(2, CALIBRE);
  faux.poster(2, "manager", fiche("runtime/src/b.ts"));
  faux.prOuverte(["runtime/src/b.ts"], "cook/1-abcdef01");
  // B tient #1 : sa prise se lit sur l'issue.
  assert.equal((await priseDeLaStation(faux.pour("B"), "B").prendre({ number: 1, labels: [...faux.ticket(1).labels] })).prise, true);
  const a = faux.station("A", sansCook);
  await a.tour();
  await a.calme();
  assert.deepEqual(faux.cuissons, [], "#2 waits for the zone #1 holds");
  assert.deepEqual(dits(faux, 1), []);
});

test("an unclaimed PR that changes only its own ticket's zone and the zone of a ticket in cooking breaks nothing: nothing is said", async () => {
  const faux = new FauxGitHub();
  faux.feu(2, CALIBRE);
  faux.poster(2, "manager", fiche("runtime/src/b.ts"));
  faux.feu(3, CALIBRE);
  faux.poster(3, "manager", fiche("runtime/src/c.ts"));
  faux.prOuverte(["runtime/src/b.ts", "runtime/src/c.ts"], "cook/3-abcdef01");
  assert.equal((await priseDeLaStation(faux.pour("B"), "B").prendre({ number: 2, labels: [...faux.ticket(2).labels] })).prise, true);
  const a = faux.station("A", sansCook);
  await a.tour();
  await a.calme();
  assert.deepEqual(dits(faux, 1), [], "no ticket waits for a zone this PR holds");
});
