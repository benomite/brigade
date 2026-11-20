// #3910, critère 2 : une livraison qui change un test gelé n'est pas refusée automatiquement : la revue le voit, avec
// le diff du test, pour le juger comme un constat bloquant. Par la station, sur le vrai dépôt, GitHub et `claude` faux :
// le cook commite les tests gelés, puis les change dans un commit suivant ; le relecteur doit être lancé, et sa
// consigne porter le diff du test depuis le gel.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { brancheDuTicket, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import { FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { BASE, depotGit, ENV_GIT, git, repertoireTemporaire } from "../outils.ts";

const TICKET = 12;
const CALIBRE = ["fire", "model:opus", "effort:medium"];
const CORPS = ["## Context", "", "A label.", "", "## Acceptance criteria", "", "- The export button is labelled"].join("\n");
const GELE = "test/acceptation/critere-1.test.ts";
const ANCIEN = "assert.match(label(), /Exprot/);";
const NOUVEAU = "assert.match(label(), /Export/);";
const RENDU = (message: string) => `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`;

test("a delivery that changes a frozen test is not refused before the review: the reviewer runs and its brief carries the test's diff", async (t) => {
  const lieux = depotGit(t);
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
  const faux = new FauxGitHub();
  faux.feu(TICKET, CALIBRE, CORPS);
  const relectures: string[] = [];
  const lancer: Lancer = ({ args, cwd, flux, entree }) => {
    const relecteur = args.includes("--tools");
    let message = "{}";
    if (relecteur) {
      relectures.push(entree ?? "");
      message = JSON.stringify({ verdict: "rouge", resume: "The cook changed a frozen test.", constats: [], criteres: [{ critere: 1, tests: [], relecture: false }] });
    } else if (git(cwd, "log", "--format=%B", `origin/${BASE}..HEAD`).includes("Acceptance-Tests: frozen")) {
      // Le cook : il change le test gelé, puis livre.
      writeFileSync(join(cwd, GELE), `${NOUVEAU}\n`);
      git(cwd, "add", GELE);
      git(cwd, "commit", "-q", "-m", "test: fix the label");
      writeFileSync(join(cwd, "bouton.ts"), "export const bouton = 1;\n");
      git(cwd, "add", "bouton.ts");
      git(cwd, "commit", "-q", "-m", "feat: the button");
      message = "Done.\n<livrable>\nThe button.\n</livrable>";
    } else {
      // La station l'a lancé sur une branche sans tests gelés : le manager les a écrits avant lui ; ici, on les pose.
      mkdirSync(dirname(join(cwd, GELE)), { recursive: true });
      writeFileSync(join(cwd, GELE), `${ANCIEN}\n`);
      git(cwd, "add", GELE);
      git(cwd, "commit", "-q", "-m", `test(#${TICKET}): frozen acceptance tests`, "-m", "Acceptance-Tests: frozen");
      writeFileSync(join(cwd, GELE), `${NOUVEAU}\n`);
      git(cwd, "add", GELE);
      git(cwd, "commit", "-q", "-m", "test: fix the label");
      writeFileSync(join(cwd, "bouton.ts"), "export const bouton = 1;\n");
      git(cwd, "add", "bouton.ts");
      git(cwd, "commit", "-q", "-m", "feat: the button");
      message = "Done.\n<livrable>\nThe button.\n</livrable>";
    }
    writeFileSync(flux, RENDU(message));
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const ouverte = stationDuDepot({ ...STATION_DU_DEPOT, base: BASE, github: fauxClient(faux), depot, manager: () => ({ model: "opus", effort: "medium" }), flux: repertoireTemporaire(t), lancer, avertir: () => {} });
  if ("refus" in ouverte) throw new Error(ouverte.refus);
  for (let tour = 0; tour < 4 && relectures.length === 0; tour += 1) {
    await ouverte.tour();
    await ouverte.calme();
  }
  assert.ok(git(lieux.origine, "branch", "--list", brancheDuTicket(TICKET)) !== "", "the delivery was pushed");
  assert.equal(relectures.length > 0, true, "the reviewer runs: the changed frozen test does not stop the delivery before the review");
  const consigne = relectures[0] ?? "";
  assert.ok(consigne.includes(`-${ANCIEN}`) && consigne.includes(`+${NOUVEAU}`), "the review's brief carries the diff of the frozen test since the freeze");
  assert.ok(consigne.includes(GELE), "the review's brief names the frozen test");
});
