// #4260 : rien ne prend un ticket parqué, à aucune étape — ni la station (aucun cook, aucune pass, aucun merge), ni la
// réparation de son tour (la guérison : aucun claim libéré, aucun `in-pass` posé). Un ticket libre, au même tour, est
// cuisiné : le tour joue bien.
import assert from "node:assert/strict";
import { test } from "node:test";
import { brancheDuTicket, stationGitHub, type GitHubDuTour } from "../../src/brigade-github.ts";
import { corpsDeVerdict } from "../../src/github-etat/fusion.ts";
import { corpsDePrise } from "../../src/github-etat/prise.ts";
import { DELAI_CLAIM_PERIME_MS } from "../../src/guerison/claim-perime.ts";
import { CALIBRE, FauxGitHub, fauxClient } from "../faux-github.ts";

const STATION = "box/claude";
const MINUTE = 60_000;
// Parqué au backlog ; en cuisson, son claim périmé ; sa PR prête, sans `in-pass` ; à la pass, sa PR approuvée.
const AU_BACKLOG = 31;
const EN_CUISSON = 32;
const PR_PRETE = 33;
const A_LA_PASS = 34;
const LIBRE = 35;

function station() {
  const faux = new FauxGitHub();
  let instant = Date.parse("2026-11-25T10:00:00Z");
  const poses: Array<[number, string]> = [];
  const bas = faux.pour(STATION);
  const github: GitHubDuTour = {
    ...bas,
    issue: fauxClient(faux, STATION).issue,
    labelliser: async (numero, labels) => {
      for (const label of labels) poses.push([numero, label]);
      await bas.labelliser(numero, labels);
    },
  };
  const tour = stationGitHub({
    nom: STATION,
    places: 4,
    base: "main",
    github,
    prise: faux.prise(github, STATION),
    cuisiner: async (ticket) => {
      faux.cuissons.push({ station: STATION, issue: ticket.number });
      return { echec: "the cook stopped" };
    },
    juger: async () => ({ verdict: "approve", motif: "" }),
    jugerEnSecond: async () => ({ verdict: "approve", motif: "" }),
    avertir: () => {},
    maintenant: () => new Date(instant),
  });
  const passer = async () => {
    await tour.tour();
    await tour.calme();
    await tour.relu();
  };
  const prApprouvee = (numero: number) => {
    const sha = faux.sha();
    faux.prs.push({ number: 100 + numero, issue: numero, branche: brancheDuTicket(numero), sha, state: "open", merged: false, enRetard: false, mergeePar: null, fichiers: [] });
    faux.poster(100 + numero, STATION, corpsDeVerdict(STATION, sha, { verdict: "approve", motif: "" }));
  };
  return { faux, poses, passer, prApprouvee, avancer: (ms: number) => (instant += ms) };
}

test("a parked ticket is taken by nothing at any step: no cook, no released claim, no in-pass, no merge — a free ticket in the same turn is cooked", async () => {
  const s = station();
  s.faux.feu(EN_CUISSON, [...CALIBRE, "taken", "parked"]);
  s.faux.poster(EN_CUISSON, STATION, corpsDePrise(STATION));
  await s.passer();
  s.avancer(DELAI_CLAIM_PERIME_MS + MINUTE);
  s.faux.feu(AU_BACKLOG, [...CALIBRE, "parked"]);
  s.faux.feu(PR_PRETE, [...CALIBRE, "parked"]);
  s.prApprouvee(PR_PRETE);
  s.faux.feu(A_LA_PASS, [...CALIBRE, "in-pass", "parked"]);
  s.prApprouvee(A_LA_PASS);
  s.faux.feu(LIBRE);

  await s.passer();
  await s.passer();

  assert.deepEqual([...new Set(s.faux.cuissons.map(({ issue }) => issue))], [LIBRE], "only the free ticket is cooked");
  assert.ok(s.faux.ticket(EN_CUISSON).labels.has("taken"), "the parked ticket's stale claim is not released");
  assert.equal((s.faux.commentaires.get(EN_CUISSON) ?? []).some(({ body }) => /released the claim/.test(body)), false);
  assert.equal(s.poses.some(([numero, label]) => numero === PR_PRETE && label === "in-pass"), false, "no in-pass on a parked ticket's ready PR");
  assert.equal(s.faux.mergee(A_LA_PASS), undefined, "the pass does not merge a parked ticket");
  for (const numero of [AU_BACKLOG, EN_CUISSON, PR_PRETE, A_LA_PASS]) assert.ok(s.faux.ticket(numero).labels.has("parked"), `#${numero} stays parked`);
});
