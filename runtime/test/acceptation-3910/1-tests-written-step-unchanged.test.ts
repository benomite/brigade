// #3910, critère 1 : le manager écrit toujours les tests d'acceptation en premier (l'étape `tests-written` ne change
// pas) — comme avant : un ticket en file n'est pas pris, ses tests sont écrits et commités en premier commit de la
// branche, avec le trailer `Acceptance-Tests: frozen`, puis le cook part de ce commit. Test d'acceptation gelé (#3725),
// sur le vrai dépôt, GitHub et `claude` faux.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { brancheDuTicket, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import { LABEL_TAKEN } from "../../src/github-etat/etats.ts";
import { LABEL_TESTS_ECRITS } from "../../src/tests-acceptation/etape.ts";
import { FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { BASE, depotGit, ENV_GIT, git, repertoireTemporaire } from "../outils.ts";

const TICKET = 7;
const CALIBRE = ["fire", "model:opus", "effort:medium"];
const CORPS = ["## Context", "", "The second screen.", "", "## Acceptance criteria", "", "- The dashboard shows the second screen"].join("\n");
const CHEMIN = "test/acceptation/critere-1.test.ts";
const MARQUE_DE_LA_CONSIGNE = "<!-- brigade:tests-acceptation-consigne -->";
const RENDU = (message: string) => `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`;

// brigade:guard
test("the manager writes the acceptance tests first: no cook before the 'tests-written' step, the tests are the branch's first commit with the frozen trailer", async (t) => {
  const lieux = depotGit(t);
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
  const faux = new FauxGitHub();
  faux.feu(TICKET, CALIBRE, CORPS);
  const cooks: { etiquettes: string[]; premier: string }[] = [];
  const lancer: Lancer = ({ args, cwd, flux, entree }) => {
    let message = "{}";
    if (entree?.startsWith(MARQUE_DE_LA_CONSIGNE)) {
      mkdirSync(dirname(join(cwd, CHEMIN)), { recursive: true });
      writeFileSync(join(cwd, CHEMIN), `// ${CHEMIN}\n`);
      message = JSON.stringify({ tests: [CHEMIN] });
    } else if (!args.includes("--tools")) {
      cooks.push({ etiquettes: [...faux.ticket(TICKET).labels], premier: git(cwd, "rev-list", "--reverse", `origin/${BASE}..HEAD`).split("\n")[0] ?? "" });
      writeFileSync(join(cwd, "ecran.ts"), "export const ecran = 2;\n");
      git(cwd, "add", "ecran.ts");
      git(cwd, "commit", "-q", "-m", "feat: the second screen");
      message = "Done.\n<livrable>\nThe second screen.\n</livrable>";
    }
    writeFileSync(flux, RENDU(message));
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const ouverte = stationDuDepot({ ...STATION_DU_DEPOT, base: BASE, github: fauxClient(faux), depot, testsAcceptation: () => ({ model: "opus", effort: "medium" }), flux: repertoireTemporaire(t), lancer, avertir: () => {} });
  if ("refus" in ouverte) throw new Error(ouverte.refus);
  await ouverte.tour();
  await ouverte.calme();
  assert.equal(cooks.length, 0, "no cook takes the ticket before its tests are written");
  assert.ok(faux.ticket(TICKET).labels.has(LABEL_TESTS_ECRITS), "the 'tests-written' step is done");
  await ouverte.tour();
  await ouverte.calme();
  assert.equal(cooks.length, 1);
  assert.ok(cooks[0]?.etiquettes.includes(LABEL_TAKEN) && cooks[0].etiquettes.includes(LABEL_TESTS_ECRITS));
  const [tests] = git(lieux.origine, "rev-list", "--reverse", `${BASE}..${brancheDuTicket(TICKET)}`).split("\n").filter(Boolean);
  assert.equal(cooks[0]?.premier, tests, "the cook starts from the tests' commit");
  assert.equal(git(lieux.origine, "show", "--name-only", "--format=", tests ?? "").split("\n").filter(Boolean).join(), CHEMIN);
  assert.equal(git(lieux.origine, "log", "-1", "--format=%(trailers:key=Acceptance-Tests,valueonly)", tests ?? ""), "frozen");
});
