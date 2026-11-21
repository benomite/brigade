// #3996, critère 2 : une livraison pour la pass n'est poussée qu'une fois les gates de la station vertes. Par la station,
// sur le vrai dépôt : le cook livre une branche dont les gates (celles du projet, dans son worktree) sont rouges ; les
// gates sont jouées — la preuve en est laissée par le script —, et rien n'est poussé sur l'origine.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { brancheDuTicket, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import { FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { BASE, depotGit, ENV_GIT, git, repertoireTemporaire } from "../outils.ts";

const TICKET = 12;

test("a delivery whose gates are red is not pushed to the origin", async (t) => {
  const lieux = depotGit(t);
  const trace = join(repertoireTemporaire(t), "gates-jouees");
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
  const faux = new FauxGitHub();
  faux.feu(TICKET, ["fire", "model:opus", "effort:medium"], "## Acceptance criteria\n\n- The button exists");
  const lancer: Lancer = ({ args, cwd, flux }) => {
    if (!args.includes("--tools")) {
      mkdirSync(join(cwd, ".claude/brigade"), { recursive: true });
      writeFileSync(join(cwd, ".claude/brigade/gates.sh"), `#!/usr/bin/env bash\necho gates >> '${trace.replaceAll("\\", "/")}'\necho "FAIL  a gate is red" >&2\nexit 1\n`);
      chmodSync(join(cwd, ".claude/brigade/gates.sh"), 0o755);
      writeFileSync(join(cwd, "bouton.ts"), "export const bouton = 1;\n");
    }
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "Done.\n<livrable>\nThe button.\n</livrable>" })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 30, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({ ...STATION_DU_DEPOT, base: BASE, github: fauxClient(faux), depot, flux: repertoireTemporaire(t), lancer, avertir: () => {} });
  if ("refus" in station) throw new Error(station.refus);
  for (let tour = 0; tour < 4; tour += 1) {
    await station.tour();
    await station.calme();
  }
  assert.equal(existsSync(trace), true, "the station played the project's gates on the delivery");
  assert.equal(git(lieux.origine, "branch", "--list", brancheDuTicket(TICKET)), "", "nothing was pushed: a gate is red");
  assert.equal(faux.prs.some((pr) => pr.branche === brancheDuTicket(TICKET)), false, "no PR was opened");
});
