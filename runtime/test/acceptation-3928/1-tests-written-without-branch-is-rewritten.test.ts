// #3928, critère 1 : un ticket étiqueté `tests-written` dont la branche a disparu de l'origine voit ses tests
// d'acceptation réécrits avant qu'aucun cook ne le prenne, et n'est jamais compté comme un cook raté. Par la
// station, sur le vrai dépôt, GitHub et `claude` faux.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { brancheDuTicket, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import { LABEL_TESTS_ECRITS } from "../../src/tests-acceptation/etape.ts";
import { MARQUE_D_ECHEC } from "../../src/qualite-github.ts";
import { FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { BASE, depotGit, ENV_GIT, git, repertoireTemporaire } from "../outils.ts";

const TICKET = 8;
const CALIBRE = ["fire", "model:opus", "effort:medium"];
const CORPS = ["## Context", "", "Windows.", "", "## Acceptance criteria", "", "- The windows tests pass"].join("\n");
const CHEMIN = "test/acceptation/critere-1.test.ts";
const MARQUE_DE_LA_CONSIGNE = "<!-- brigade:tests-acceptation-consigne -->";
const RENDU = (message: string) => `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`;

test("a 'tests-written' ticket whose branch is gone gets its tests written again before any cook, and no failed cook is counted", async (t) => {
  const lieux = depotGit(t);
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
  const faux = new FauxGitHub();
  faux.feu(TICKET, [...CALIBRE, LABEL_TESTS_ECRITS], CORPS);
  const cooks: string[] = [];
  const ecritures: string[] = [];
  const lancer: Lancer = ({ args, cwd, flux, entree }) => {
    let message = "{}";
    if (entree?.startsWith(MARQUE_DE_LA_CONSIGNE)) {
      ecritures.push(cwd);
      mkdirSync(dirname(join(cwd, CHEMIN)), { recursive: true });
      writeFileSync(join(cwd, CHEMIN), `// ${CHEMIN}\n`);
      message = JSON.stringify({ tests: [CHEMIN] });
    } else if (!args.includes("--tools")) {
      cooks.push(git(cwd, "rev-list", "--reverse", `origin/${BASE}..HEAD`).split("\n")[0] ?? "");
      writeFileSync(join(cwd, "fenetre.ts"), "export const fenetre = 1;\n");
      git(cwd, "add", "fenetre.ts");
      git(cwd, "commit", "-q", "-m", "fix: windows");
      message = "Done.\n<livrable>\nWindows.\n</livrable>";
    }
    writeFileSync(flux, RENDU(message));
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const ouverte = stationDuDepot({ ...STATION_DU_DEPOT, base: BASE, github: fauxClient(faux), depot, testsAcceptation: () => ({ model: "opus", effort: "medium" }), flux: repertoireTemporaire(t), lancer, avertir: () => {} });
  if ("refus" in ouverte) throw new Error(ouverte.refus);
  await ouverte.tour();
  await ouverte.calme();
  assert.equal(cooks.length, 0, "no cook takes the ticket before its tests are written again");
  assert.equal(ecritures.length, 1, "the manager writes the tests again");
  const echecs = () => (faux.commentaires.get(TICKET) ?? []).filter(({ body }) => body.startsWith(MARQUE_D_ECHEC));
  assert.equal(echecs().length, 0, "no failed cook is counted");
  await ouverte.tour();
  await ouverte.calme();
  assert.equal(cooks.length, 1);
  const [tests] = git(lieux.origine, "rev-list", "--reverse", `${BASE}..${brancheDuTicket(TICKET)}`).split("\n").filter(Boolean);
  assert.equal(cooks[0], tests, "the cook starts from the rewritten tests' commit");
  assert.equal(echecs().length, 0, "no failed cook is counted");
});
