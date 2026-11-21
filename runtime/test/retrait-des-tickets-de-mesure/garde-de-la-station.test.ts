// #3982 : la station ne dépose plus de ticket de mesure ; ce que le tour garde reste : il rattrape les prises des
// temps du clone, et l'étape `tests written` passe toujours par `stationDuDepot`. Ces tests tiennent les lignes de
// `brigade-github.ts` que le retrait a touchées.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { brancheDuTicket, stationDuDepot, stationGitHub, type GitHubDuTour, type Lancer } from "../../src/brigade-github.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import { LABEL_TESTS_ECRITS } from "../../src/tests-acceptation/etape.ts";
import { FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { BASE, depotGit, ENV_GIT, repertoireTemporaire } from "../outils.ts";

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

const CHEMIN = "test/acceptation/critere-1.test.ts";
const MARQUE_DE_LA_CONSIGNE = "<!-- brigade:tests-acceptation-consigne -->";

// brigade:guard
test("a station given a manager still writes the acceptance tests before any cook takes the ticket", async (t) => {
  const lieux = depotGit(t);
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
  const faux = new FauxGitHub();
  faux.feu(7, ["fire", "model:opus", "effort:medium"], ["## Context", "", "A screen.", "", "## Acceptance criteria", "", "- The dashboard shows the screen"].join("\n"));
  let cooks = 0;
  const lancer: Lancer = ({ cwd, flux, entree }) => {
    let message = "{}";
    if (entree?.startsWith(MARQUE_DE_LA_CONSIGNE)) {
      mkdirSync(dirname(join(cwd, CHEMIN)), { recursive: true });
      writeFileSync(join(cwd, CHEMIN), `// ${CHEMIN}\n`);
      message = JSON.stringify({ tests: [CHEMIN] });
    } else cooks++;
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const ouverte = stationDuDepot({ ...STATION_DU_DEPOT, base: BASE, github: fauxClient(faux), depot, testsAcceptation: () => ({ model: "opus", effort: "medium" }), flux: repertoireTemporaire(t), lancer, avertir: () => {} });
  if ("refus" in ouverte) throw new Error(ouverte.refus);
  await ouverte.tour();
  await ouverte.calme();
  assert.equal(cooks, 0, "no cook takes the ticket before its tests are written");
  assert.ok(faux.ticket(7).labels.has(LABEL_TESTS_ECRITS));
});
