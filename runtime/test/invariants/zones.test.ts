// Invariant 1 du rail (#4026) : un ticket qu'aucun cook ne cuit et qui n'est
// pas en pass ne tient ni ne réserve aucune zone de fichiers.
import assert from "node:assert/strict";
import { test } from "node:test";
import { priseDeLaStation, stationGitHub, type GitHubDuTour, type OptionsDeStation } from "../../src/brigade-github.ts";
import { marqueDeLInvariant } from "../../src/invariants/invariants.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const fiche = (zone: string) => `<!-- brigade:fiche -->\n- awaiting: none\n- zone: ${zone}`;
const dits = (faux: FauxGitHub, invariant: number) => [...faux.commentaires.entries()].flatMap(([numero, liste]) => liste.filter((c) => c.body.includes(`<!-- brigade:invariant n=${invariant} `)).map((c) => ({ numero, body: c.body })));
// Une station sur le faux, avec ce que `faux.station` ne passe pas : les fichiers suivis, un GitHub retouché.
const stationSur = (faux: FauxGitHub, options: Partial<OptionsDeStation> = {}, github: GitHubDuTour = faux.pour("A")) =>
  stationGitHub({ nom: "A", places: 1, base: "main", github, prise: faux.prise(github, "A"), cuisiner: async (ticket) => (faux.cuissons.push({ station: "A", issue: ticket.number }), { echec: "not the point" }), juger: async () => ({ verdict: "approve", motif: "" }), sauter: () => {}, avertir: () => {}, ...options });
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

test("a delivery that awaits the chef keeps its zone: the waiting ticket does not start, and nothing is said", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, [...CALIBRE, "blocked-on-human"]);
  faux.feu(2, CALIBRE);
  faux.poster(2, "manager", fiche("runtime/src/b.ts"));
  faux.prOuverte(["runtime/src/b.ts"], "cook/1-abcdef01");
  const a = faux.station("A", sansCook);
  await a.tour();
  await a.calme();
  assert.deepEqual(faux.cuissons, []);
  assert.deepEqual(dits(faux, 1), []);
});

test("a taken ticket whose claim cannot be read keeps the zone of its open PR: in doubt, the zone stays held", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, [...CALIBRE, "taken"]);
  faux.feu(2, CALIBRE);
  faux.poster(2, "manager", fiche("runtime/src/b.ts"));
  faux.prOuverte(["runtime/src/b.ts"], "cook/1-abcdef01");
  const github = faux.pour("A");
  // Deux places : #1, `taken` sans cook ici, en tient une jusqu'à ce que la station le rende.
  const a = stationSur(faux, { places: 2 }, {
    ...github,
    commentaires: async (numero) => {
      if (numero === 1) throw new Error("GitHub said 502");
      return github.commentaires(numero);
    },
  });
  await a.tour();
  await a.calme();
  assert.deepEqual(faux.cuissons, []);
  assert.deepEqual(dits(faux, 1), []);
});

test("the zone the invariant reads is the claim gate's: a path the body names that the base does not track is not in it", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, CALIBRE);
  faux.feu(2, CALIBRE, "Edit `runtime/src/b.ts`, and see `runtime/src/nouveau/x.ts`.");
  faux.prOuverte(["runtime/src/nouveau/x.ts"], "cook/1-abcdef01");
  const a = stationSur(faux, { fichiersSuivis: () => ["runtime/src/b.ts"] });
  await a.tour();
  await a.calme();
  assert.deepEqual(dits(faux, 1), [], "#2 holds runtime/src/b.ts only");
});
