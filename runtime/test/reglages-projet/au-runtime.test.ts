// Le changement des réglages du projet demandé au runtime qui le sert (#1308) :
// l'appel écrit la demande au journal, le runtime — sa vraie pass, le vrai
// dépôt de sa station — ouvre la PR et la remet à la pass, et l'appel rend son
// adresse. Jugée verte sous grant, la PR n'est pas mergée : elle change un
// réglage du projet, et la pass la retient pour le chef (#1305). Une valeur
// que l'écriture refuse rend son erreur, sans PR ni rien d'écrit.
import assert from "node:assert/strict";
import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Depot } from "../../src/depot.ts";
import { A_RELIRE, causeDeDeclarations } from "../../src/events/pass.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import type { Pass } from "../../src/pass.ts";
import type { Runtime } from "../../src/runtime.ts";
import { brancherReglages, proposerAuRuntime } from "../../src/reglages-projet/au-runtime.ts";
import { FICHIER, reglagesDuTexte } from "../../src/reglages-projet/reglages.ts";
import { chef, cuisine, fauxGitHub, montre } from "../aides/cuisine.ts";
import { BASE, depotGit, ENV_GIT, git, jusqua, repertoireTemporaire } from "../outils.ts";

// Une cuisine sous grant, sa pass branchée, ses gates sur la base — sans
// elles, la pass ne juge rien —, et le runtime branché sur les demandes.
function servie(t: TestContext) {
  const { origine, clone } = depotGit(t);
  mkdirSync(join(clone, ".claude/brigade"), { recursive: true });
  symlinkSync(join(import.meta.dirname, "../aides/fausses-gates.sh"), join(clone, ".claude/brigade/gates.sh"));
  git(clone, "add", ".");
  git(clone, "commit", "-q", "-m", "les gates du projet");
  git(clone, "push", "-q", "origin", BASE);
  const lieux = { repertoire: repertoireTemporaire(t), origine, clone, gh: fauxGitHub(), heure: montre() };
  chef(lieux.repertoire, "grant.activated");
  const tenu: { depot?: Depot } = {};
  const lieu = cuisine(t, { lieux, git: true, pass: true, depot: (vrai) => (tenu.depot = vrai) });
  const { depot } = tenu;
  assert.ok(depot, "the kitchen has a repository");
  brancherReglages(lieu.runtime as unknown as Runtime & Pass, { depot, github: lieu.gh.github, base: BASE, env: ENV_GIT, avertir: () => {} });
  return { ...lieu, origine, appel: { repertoireEtat: lieux.repertoire, projet: "brigade" } };
}

describe("asking the project's runtime for a project setting change", () => {
  test("a new ceiling returns the PR URL; the PR changes only the settings file, and the pass, judging it green under grant, holds it for the chef and never merges it", async (t) => {
    const lieu = servie(t);
    const reponse = await proposerAuRuntime({ calibrationCeiling: { model: "opus", effort: "high" } }, lieu.appel);

    assert.ok(reponse.ok, JSON.stringify(reponse));
    assert.equal(reponse.pr, `https://github.com/benomite/brigade/pull/${reponse.numero}`);
    assert.deepEqual(lieu.gh.prs.map(({ base, branche }) => [base, branche]), [[BASE, reponse.branche]]);
    assert.deepEqual(git(lieu.origine, "diff", "--name-only", `${BASE}...${reponse.branche}`).split("\n"), [FICHIER]);
    assert.deepEqual(reglagesDuTexte(`${git(lieu.origine, "show", `${reponse.branche}:${FICHIER}`)}\n`).calibrationCeiling, { model: "opus", effort: "high" });
    assert.deepEqual(reponse.reglages.calibrationCeiling, { model: "opus", effort: "high" });

    const fait = (type: string) => lieu.journal.duTicket(reponse.numero).find((e) => e.type === type);
    await jusqua(() => fait("pass.held") !== undefined);
    assert.equal((fait("pass.judged")?.payload as { verdict: string } | undefined)?.verdict, "green");
    assert.deepEqual(fait("pass.held")?.payload, { reason: A_RELIRE, cause: causeDeDeclarations([FICHIER]) });
    assert.deepEqual(lieu.gh.merges, []);
    await jusqua(() => lieu.gh.commentaires.some(([numero, corps]) => numero === reponse.numero && /non mergée \(`review-required`\)[\s\S]*elle change un réglage du projet/.test(corps)));
    // Une réponse par demande.
    assert.equal(lieu.journal.tout().filter((e) => e.type === "setting.proposed").length, 1);
  });

  test("a value the writer refuses returns a clear error: no PR, and nothing of it written to the log", async (t) => {
    const lieu = servie(t);
    const reponse = await proposerAuRuntime({ calibrationCeiling: { model: "opus", effort: "high" }, workspaceFolder: "/home/chef/espaces" }, lieu.appel);

    assert.ok(!reponse.ok, JSON.stringify(reponse));
    assert.equal(reponse.motif, "limite-machine");
    assert.equal(reponse.cle, "workspaceFolder");
    assert.match(reponse.message, /`workspaceFolder` does not belong in the project's repository/);
    assert.deepEqual(lieu.gh.prs, []);
    assert.equal(lieu.journal.tout().some((e) => e.type.startsWith("setting.")), false);
    assert.equal(JSON.stringify(lieu.journal.tout()).includes("/home/chef/espaces"), false);
  });

  test("a change the base already carries is answered by the runtime: nothing to propose, and no PR", async (t) => {
    const lieu = servie(t);
    // Le dépôt du gabarit ne porte aucun réglage : sa branche, c'est la base.
    const reponse = await proposerAuRuntime({ integrationBranch: BASE }, lieu.appel);
    assert.ok(!reponse.ok && reponse.motif === "inchange", JSON.stringify(reponse));
    assert.deepEqual(lieu.gh.prs, []);
    assert.equal(lieu.journal.tout().filter((e) => e.type === "setting.refused").length, 1);
  });

  test("with no runtime to answer, the call says so once its wait is over, and the request stays in the log", async (t) => {
    const repertoireEtat = repertoireTemporaire(t);
    const reponse = await proposerAuRuntime({ calibrationCeiling: { model: "opus", effort: "high" } }, { repertoireEtat, projet: "brigade", delaiMs: 0 });
    assert.ok(!reponse.ok && reponse.motif === "sans-reponse", JSON.stringify(reponse));
    assert.match(reponse.message, /did not answer in time/);
    const journal = ouvrirJournal(repertoireEtat);
    t.after(() => journal.fermer());
    assert.deepEqual(journal.tout().filter((e) => e.type === "setting.requested").map((e) => e.payload.change), [{ calibrationCeiling: { model: "opus", effort: "high" } }]);
  });
});
