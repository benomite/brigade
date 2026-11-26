// #4218, critère 3 : une livraison sur le même arbre que la précédente, après des gates rouges, ne compte pas pour un nouvel essai.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import { FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { BASE, depotGit, ENV_GIT, repertoireTemporaire } from "../outils.ts";

test("a delivery on the same tree as the previous one, after red gates, does not count as a new try", async (t) => {
  const lieux = depotGit(t);
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
  const faux = new FauxGitHub();
  faux.feu(12, ["fire", "model:opus", "effort:medium"], "## Acceptance criteria\n\n- The button exists");
  // Le premier cook livre sous des gates rouges ; le suivant n'ajoute rien.
  let cuissons = 0;
  const lancer: Lancer = ({ args, cwd, flux }) => {
    if (!args.includes("--tools") && (cuissons += 1) === 1) {
      mkdirSync(join(cwd, ".claude/brigade"), { recursive: true });
      writeFileSync(join(cwd, ".claude/brigade/gates.sh"), '#!/usr/bin/env bash\necho "FAIL  the button test is red" >&2\nexit 1\n');
      chmodSync(join(cwd, ".claude/brigade/gates.sh"), 0o755);
      writeFileSync(join(cwd, "bouton.ts"), "export const bouton = 1;\n");
    }
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "Done.\n<livrable>\nThe button.\n</livrable>" })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 30, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const dits: string[] = [];
  const station = stationDuDepot({ ...STATION_DU_DEPOT, base: BASE, github: fauxClient(faux), depot, flux: repertoireTemporaire(t), lancer, avertir: (texte: string) => dits.push(texte) });
  if ("refus" in station) throw new Error(station.refus);

  for (let tour = 0; tour < 4 && cuissons < 2; tour += 1) {
    await station.tour();
    await station.calme();
  }
  assert.equal(cuissons, 2, "the second cook was launched");
  const essais = dits.filter((texte) => /try \d+\/\d+/.test(texte));
  assert.ok(essais.some((texte) => /try 1\//.test(texte)), "the red delivery of the first cook is a try");
  assert.deepEqual(essais.filter((texte) => /try 2\//.test(texte)), [], "the same tree, delivered again, is not a second try");
});
