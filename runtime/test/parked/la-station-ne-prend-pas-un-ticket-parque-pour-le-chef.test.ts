// #4129 : un ticket parqué pour le chef — `chef-todo` seul, au backlog, sans `parked` ni `blocked-on-human` — n'est pris
// par aucune station avant la réponse du chef ; répondu (`chef-todo` retiré), il reprend où il était : la station le prend.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import { CHEF_TODO } from "../../src/github-etat/etats.ts";
import type { GitHub } from "../../src/github.ts";
import { FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { BASE, depotGit, ENV_GIT, repertoireTemporaire } from "../outils.ts";

const TICKET = 77;

function station(t: TestContext) {
  const lieux = depotGit(t);
  const faux = new FauxGitHub();
  faux.feu(TICKET, ["fire", "model:opus", "effort:medium", CHEF_TODO], "## Context\n\nThe export.");
  faux.poster(TICKET, "box", "<!-- brigade:todo kind=blocked -->\n**Question for the chef (product):** which column order does the export keep?");
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
  const lancer: Lancer = ({ flux }) => {
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "I stopped.\n<livrable>\nNothing yet.\n</livrable>" })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const github: GitHub = { ...fauxClient(faux), creerIssue: faux.pour("box").creerIssue };
  const ouverte = stationDuDepot({ ...STATION_DU_DEPOT, base: BASE, github, depot, manager: () => ({ model: "opus", effort: "high" }), flux: repertoireTemporaire(t), lancer, avertir: () => undefined });
  if ("refus" in ouverte) throw new Error(ouverte.refus);
  const tour = async () => {
    await ouverte.tour();
    await ouverte.calme();
  };
  return { faux, tour, prises: () => faux.cuissons.filter(({ issue }) => issue === TICKET).length };
}

test("a ticket parked for the chef at the backlog (`chef-todo` alone) is taken by no station until the chef answers; answered, it is taken", async (t) => {
  const s = station(t);
  for (let i = 0; i < 3; i++) await s.tour();
  assert.equal(s.prises(), 0, "nothing takes it while it waits for the chef");
  assert.ok(s.faux.ticket(TICKET).labels.has(CHEF_TODO), "its card still waits");
  s.faux.ticket(TICKET).labels.delete(CHEF_TODO);
  await s.tour();
  assert.equal(s.prises(), 1, "answered, it resumes where it was: the station takes it");
});
