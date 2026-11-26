// #3982 : la station ne dépose plus de ticket de mesure ; ce que le tour garde reste : il rattrape les prises des
// temps du clone. Ce test tient les lignes de `brigade-github.ts` que le retrait a touchées.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { brancheDuTicket, stationGitHub, type GitHubDuTour } from "../../src/brigade-github.ts";
import { FauxGitHub } from "../faux-github.ts";
import { repertoireTemporaire } from "../outils.ts";

// brigade:guard
test("a turn on a station with a clone catches up the claims of the recent tickets that lack one", async (t) => {
  const clone = repertoireTemporaire(t);
  mkdirSync(join(clone, ".claude", "brigade"), { recursive: true });
  const enregistrement = { ticket: 41, claimedAt: "2026-11-07T10:05:00.000Z", mergedAt: "2026-11-07T10:20:00.000Z", cuisson: 300, cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0 };
  writeFileSync(join(clone, ".claude", "brigade", "temps-tickets.json"), JSON.stringify([enregistrement]));
  const faux = new FauxGitHub();
  const lus: number[] = [];
  const bas = faux.pour("box");
  const github: GitHubDuTour = { ...bas, depotDuTicket: async (numero) => (lus.push(numero), { deposeAt: "2026-11-07T10:00:00.000Z", priseAt: "2026-11-07T10:01:00.000Z" }) };
  const station = stationGitHub({
    nom: "box",
    places: 1,
    base: "main",
    github,
    prise: faux.prise(github, "box"),
    cuisiner: async (ticket) => ({ branche: brancheDuTicket(ticket.number) }),
    juger: async () => ({ verdict: "approve", motif: "" }),
    jugerEnSecond: async () => ({ verdict: "approve", motif: "" }),
    avertir: () => {},
    clone,
  });
  await station.tour();
  await station.calme();
  assert.deepEqual(lus, [41]);
});
