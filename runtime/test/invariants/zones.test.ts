// Invariant 1 du rail (#4026) : un ticket qu'aucun cook ne cuit et qui n'est
// pas en pass ne tient ni ne réserve aucune zone de fichiers.
import assert from "node:assert/strict";
import { test } from "node:test";
import { priseDeLaStation, stationGitHub, type GitHubDuTour, type OptionsDeStation } from "../../src/brigade-github.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const fiche = (zone: string) => `<!-- brigade:fiche -->\n- awaiting: none\n- zone: ${zone}`;
const dits = (faux: FauxGitHub, invariant: number) => [...faux.commentaires.entries()].flatMap(([numero, liste]) => liste.filter((c) => c.body.includes(`<!-- brigade:invariant n=${invariant} `)).map((c) => ({ numero, body: c.body })));
// Une station sur le faux, avec ce que `faux.station` ne passe pas : les fichiers suivis, un GitHub retouché.
const stationSur = (faux: FauxGitHub, options: Partial<OptionsDeStation> = {}, github: GitHubDuTour = faux.pour("A")) =>
  stationGitHub({ nom: "A", places: 1, base: "main", github, prise: faux.prise(github, "A"), cuisiner: async (ticket) => (faux.cuissons.push({ station: "A", issue: ticket.number }), { echec: "not the point" }), juger: async () => ({ verdict: "approve", motif: "" }), sauter: () => {}, avertir: () => {}, ...options });
// Une vraie casse à côté du cas jugé : #5, sans cook, a une PR ouverte sur la zone de #6, qui attend sa prise.
// Elle seule est dite : le cas jugé ne casse rien.
const avecUneCasse = (faux: FauxGitHub) => {
  faux.feu(5, CALIBRE);
  faux.poster(5, "manager", fiche("runtime/src/e.ts"));
  faux.feu(6, CALIBRE);
  faux.poster(6, "manager", fiche("runtime/src/d.ts"));
  faux.prOuverte(["runtime/src/d.ts"], "cook/5-abcdef01");
};
const seuleLaCasse = (faux: FauxGitHub) => assert.deepEqual(dits(faux, 1).map(({ numero }) => numero), [5], "only the break next to it is said");
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
  assert.ok(premiers.find(({ numero }) => numero === 2)?.body.includes(`<!-- brigade:invariant n=1 pr=${deDeux.number} -->`));
  // Une station neuve, sans mémoire : la marque sur le ticket suffit.
  const relancee = faux.station("A", sansCook);
  await relancee.tour();
  await relancee.calme();
  assert.equal(dits(faux, 1).length, 2, "not written again");
});

test("a ticket cooked on another station keeps the zone of its open PR: the waiting ticket does not start, and only the break next to it is said", async () => {
  const faux = new FauxGitHub();
  avecUneCasse(faux);
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
  assert.ok(!faux.cuissons.some(({ issue }) => issue === 2), "#2 waits for the zone #1 holds");
  seuleLaCasse(faux);
});

test("an unclaimed PR that changes only its own ticket's zone and the zone of a ticket in cooking breaks nothing: only the break next to it is said", async () => {
  const faux = new FauxGitHub();
  avecUneCasse(faux);
  faux.feu(2, CALIBRE);
  faux.poster(2, "manager", fiche("runtime/src/b.ts"));
  faux.feu(3, CALIBRE);
  faux.poster(3, "manager", fiche("runtime/src/c.ts"));
  faux.prOuverte(["runtime/src/b.ts", "runtime/src/c.ts"], "cook/3-abcdef01");
  assert.equal((await priseDeLaStation(faux.pour("B"), "B").prendre({ number: 2, labels: [...faux.ticket(2).labels] })).prise, true);
  const a = faux.station("A", sansCook);
  await a.tour();
  await a.calme();
  seuleLaCasse(faux);
});

test("a delivery that awaits the chef keeps its zone: the waiting ticket does not start, and only the break next to it is said", async () => {
  const faux = new FauxGitHub();
  avecUneCasse(faux);
  faux.feu(1, [...CALIBRE, "blocked-on-human"]);
  faux.feu(2, CALIBRE);
  faux.poster(2, "manager", fiche("runtime/src/b.ts"));
  faux.prOuverte(["runtime/src/b.ts"], "cook/1-abcdef01");
  const a = faux.station("A", sansCook);
  await a.tour();
  await a.calme();
  assert.ok(!faux.cuissons.some(({ issue }) => issue === 2), "#2 waits for the zone #1 holds");
  seuleLaCasse(faux);
});

test("a taken ticket whose claim cannot be read keeps the zone of its open PR: in doubt, the zone stays held", async () => {
  const faux = new FauxGitHub();
  avecUneCasse(faux);
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
  assert.ok(!faux.cuissons.some(({ issue }) => issue === 2), "#2 waits for the zone #1 holds");
  seuleLaCasse(faux);
});

test("the zone the invariant reads is the claim gate's: a path the body names that the base does not track is not in it", async () => {
  const faux = new FauxGitHub();
  avecUneCasse(faux);
  faux.feu(1, CALIBRE);
  faux.feu(2, CALIBRE, "Edit `runtime/src/b.ts`, and see `runtime/src/nouveau/x.ts`.");
  faux.prOuverte(["runtime/src/nouveau/x.ts"], "cook/1-abcdef01");
  const a = stationSur(faux, { fichiersSuivis: () => ["runtime/src/b.ts"] });
  await a.tour();
  await a.calme();
  seuleLaCasse(faux);
});

test("a ticket cooked on this station keeps the zone of its open PR, even when its labels no longer say it is taken: only the break next to it is said", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, CALIBRE);
  faux.poster(1, "manager", fiche("runtime/src/a.ts"));
  faux.prOuverte(["runtime/src/b.ts"], "cook/1-abcdef01");
  let finir = () => {};
  const a = faux.station("A", { places: 2, sauter: () => {}, avertir: () => {}, cuisiner: (ticket) => ticket === 1 ? new Promise((fini) => void (finir = () => fini({ echec: `#${ticket} not the point` }))) : Promise.resolve({ echec: "not the point" }) });
  await a.tour();
  assert.deepEqual(faux.cuissons.map(({ issue }) => issue), [1]);
  // #1 cuit ici ; ses labels, eux, ne le disent plus.
  faux.ticket(1).labels.delete("taken");
  avecUneCasse(faux);
  faux.feu(2, CALIBRE);
  faux.poster(2, "manager", fiche("runtime/src/b.ts"));
  await a.tour();
  assert.ok(!faux.cuissons.some(({ issue }) => issue === 2), "#2 waits for the zone #1's PR holds");
  finir();
  await a.calme();
  seuleLaCasse(faux);
});
