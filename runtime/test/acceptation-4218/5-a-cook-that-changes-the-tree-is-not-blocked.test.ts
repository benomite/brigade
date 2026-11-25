// #4218, critère 5 : un cook qui change l'arbre après des gates rouges n'est pas bloqué par cette règle.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import { FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { BASE, depotGit, ENV_GIT, repertoireTemporaire } from "../outils.ts";

test("a cook that changes the tree after red gates is not blocked: the gates run again, and what they say about the new tree reaches the ticket with the failed gate and its error lines", async (t) => {
  const lieux = depotGit(t);
  const trace = join(repertoireTemporaire(t), "gates-jouees").replaceAll("\\", "/");
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
  const faux = new FauxGitHub();
  faux.feu(12, ["fire", "model:opus", "effort:medium"], "## Acceptance criteria\n\n- The button exists");
  let cuissons = 0;
  const lancer: Lancer = ({ args, cwd, flux }) => {
    if (!args.includes("--tools")) {
      cuissons += 1;
      if (cuissons === 1) {
        mkdirSync(join(cwd, ".claude/brigade"), { recursive: true });
        // Rouges jusqu'au bout, sous beaucoup de sortie ; ce qu'elles disent change avec l'arbre.
        writeFileSync(
          join(cwd, ".claude/brigade/gates.sh"),
          `#!/usr/bin/env bash\necho gates >> '${trace}'\nif [ -f "$1/second.txt" ]; then echo "  ✖ the card is not shown (second tree)" >&2; else echo "  ✖ the button is not shown (first tree)" >&2; fi\necho "FAIL  card tests are red" >&2\nfor i in $(seq 1 400); do echo "ok    later gate $i"; done\nexit 1\n`,
        );
        chmodSync(join(cwd, ".claude/brigade/gates.sh"), 0o755);
        writeFileSync(join(cwd, "bouton.ts"), "export const bouton = 1;\n");
      } else writeFileSync(join(cwd, "second.txt"), "changed\n");
    }
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

  assert.equal((existsSync(trace) ? readFileSync(trace, "utf8") : "").split("\n").filter(Boolean).length, 2, "the tree changed: the gates run again");
  const corps = [...faux.commentaires.values()].flat().map((c) => c.body);
  assert.ok(!corps.some((c) => /nothing new to deliver/i.test(c)), "a cook that changed the tree is not told it had nothing new");
  assert.ok(corps.some((c) => /card tests are red/.test(c) && /the card is not shown \(second tree\)/.test(c)), "the ticket says which gate is red on the new tree, with its error lines");
});
