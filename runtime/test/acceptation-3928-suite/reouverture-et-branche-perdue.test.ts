// #3928 : la réouverture remet à zéro le compte des échecs même sans `set-aside:failures`, et la branche née sans commit
// d'une réception manquée est élaguée quand les tests se réécrivent (celle qui porte des commits reste).
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { brancheDuTicket, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { ouvreReparation, type CheckDeLaBase, type GitHubDeLaReparation } from "../../src/base-rouge/ouvre-reparation.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import { ECHECS_ATTEINTS } from "../../src/github.ts";
import { LABEL_TESTS_ECRITS } from "../../src/tests-acceptation/etape.ts";
import { FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { BASE, depotGit, ENV_GIT, git, repertoireTemporaire } from "../outils.ts";

const ROUGE: CheckDeLaBase[] = [{ name: "windows tests (1/4)", outcome: "red" }];

test("a reopened ticket that was not set aside still gets a dated removal of 'set-aside:failures'", async () => {
  const retraits: string[] = [];
  const labels = new Set<string>();
  let tete = "a".repeat(40);
  const issue = { number: 3860, titre: "", corps: "", state: "open" as "open" | "closed" };
  const github: GitHubDeLaReparation = {
    teteDeLaBase: async () => tete,
    issuesDepuis: async () => [{ number: issue.number, title: issue.titre, body: issue.corps, association: "OWNER", state: issue.state, labels: [...labels], updatedAt: "2026-11-20T13:54:00Z" }],
    creerIssue: async ({ titre, corps }) => {
      Object.assign(issue, { titre, corps });
      return issue.number;
    },
    fermerIssue: async () => undefined,
    rouvrirIssue: async () => {
      issue.state = "open";
    },
    ecrireCorps: async () => undefined,
    ecrireTitre: async () => undefined,
    labelliser: async (_, l) => l.forEach((x) => labels.add(x)),
    // Comme GitHub : sans le label, aucun retrait n'est daté.
    delabelliser: async (_, l) => {
      if (labels.delete(l) && l === ECHECS_ATTEINTS) retraits.push(l);
    },
  };
  const ouvrir = ouvreReparation({ github, base: "main", maintenant: () => new Date("2026-11-20T14:00:00Z") });
  await ouvrir(ROUGE);
  labels.add(LABEL_TESTS_ECRITS);
  issue.state = "closed";
  tete = "c".repeat(40);
  await ouvrir(ROUGE);
  assert.equal(issue.state, "open");
  assert.equal(retraits.length, 1, "the failure count is reset by a removal GitHub dates");
  assert.ok(!labels.has(LABEL_TESTS_ECRITS) && !labels.has(ECHECS_ATTEINTS));
});

for (const [nom, avecCommit] of [["a branch born without commit is pruned and the tests are written again", false], ["a branch that carries commits is kept", true]] as const) {
  test(`'tests-written' lost on the origin: ${nom}`, async (t) => {
    const lieux = depotGit(t);
    const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
    const branche = brancheDuTicket(8);
    git(lieux.clone, "branch", branche, `origin/${BASE}`);
    if (avecCommit) {
      const w = join(repertoireTemporaire(t), "w");
      git(lieux.clone, "worktree", "add", "-q", w, branche);
      writeFileSync(join(w, "x.ts"), "export const x = 1;\n");
      git(w, "add", "x.ts");
      git(w, "commit", "-q", "-m", "x");
      git(lieux.clone, "worktree", "remove", "--force", w);
    }
    const faux = new FauxGitHub();
    faux.feu(8, ["fire", "model:opus", "effort:medium", LABEL_TESTS_ECRITS], ["## Context", "", "W.", "", "## Acceptance criteria", "", "- It passes"].join("\n"));
    const ecritures: string[] = [];
    const lancer: Lancer = ({ cwd, flux, entree }) => {
      let message = "{}";
      if (entree?.startsWith("<!-- brigade:tests-acceptation-consigne -->")) {
        ecritures.push(cwd);
        mkdirSync(dirname(join(cwd, "test/acceptation/c.test.ts")), { recursive: true });
        writeFileSync(join(cwd, "test/acceptation/c.test.ts"), "// c\n");
        message = JSON.stringify({ tests: ["test/acceptation/c.test.ts"] });
      }
      writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`);
      return { fin: Promise.resolve({ code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
    };
    const ouverte = stationDuDepot({ ...STATION_DU_DEPOT, base: BASE, github: fauxClient(faux), depot, testsAcceptation: () => ({ model: "opus", effort: "medium" }), flux: repertoireTemporaire(t), lancer, avertir: () => {} });
    if ("refus" in ouverte) throw new Error(ouverte.refus);
    await ouverte.tour();
    await ouverte.calme();
    assert.equal(ecritures.length, avecCommit ? 0 : 1);
    if (avecCommit) assert.ok(depot.connait(branche), "a branch with commits stays in the clone");
  });
}
