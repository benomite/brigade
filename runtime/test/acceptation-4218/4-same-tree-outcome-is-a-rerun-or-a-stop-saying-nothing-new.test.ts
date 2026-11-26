// #4218, critère 4 : sur le même arbre, l'issue est l'une des deux : le cook change l'arbre et les gates rejouent, ou le ticket s'arrête et dit que le cook n'avait rien de neuf à livrer.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { brancheDuTicket, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import { FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { BASE, depotGit, ENV_GIT, git, repertoireTemporaire } from "../outils.ts";

test("after red gates, a cook that delivers the same tree ends in one of two ways: the gates run again on a changed tree, or the ticket stops and says the cook had nothing new to deliver", async (t) => {
  const lieux = depotGit(t);
  const trace = join(repertoireTemporaire(t), "gates-jouees").replaceAll("\\", "/");
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
  const faux = new FauxGitHub();
  faux.feu(12, ["fire", "model:opus", "effort:medium"], "## Acceptance criteria\n\n- The button exists");
  let cuissons = 0;
  const lancer: Lancer = ({ args, cwd, flux }) => {
    if (!args.includes("--tools") && (cuissons += 1) === 1) {
      mkdirSync(join(cwd, ".claude/brigade"), { recursive: true });
      writeFileSync(join(cwd, ".claude/brigade/gates.sh"), `#!/usr/bin/env bash\necho gates >> '${trace}'\necho "FAIL  the button test is red" >&2\nexit 1\n`);
      chmodSync(join(cwd, ".claude/brigade/gates.sh"), 0o755);
      writeFileSync(join(cwd, "bouton.ts"), "export const bouton = 1;\n");
    }
    // Le cook suivant n'ajoute rien : l'arbre ne change pas.
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "Done.\n<livrable>\nThe button.\n</livrable>" })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 30, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({ ...STATION_DU_DEPOT, base: BASE, github: fauxClient(faux), depot, flux: repertoireTemporaire(t), lancer, avertir: () => {} });
  if ("refus" in station) throw new Error(station.refus);
  for (let tour = 0; tour < 4 && cuissons < 2; tour += 1) {
    await station.tour();
    await station.calme();
  }
  assert.equal(cuissons, 2, "the second cook was launched");

  const parties = (existsSync(trace) ? readFileSync(trace, "utf8") : "").split("\n").filter(Boolean).length;
  const dit = [...faux.commentaires.values()].flat().some((c) => /nothing new to deliver/i.test(c.body));
  // Le même arbre ne se rejoue pas : seule reste l'issue où le ticket dit que le cook n'avait rien de neuf.
  assert.equal(parties, 1, "the tree did not change: the gates are not played again");
  assert.ok(dit, "the ticket says that the cook had nothing new to deliver");
  assert.equal(git(lieux.origine, "branch", "--list", brancheDuTicket(12)), "", "the red tree is not pushed");
});
