// Proposer un changement des réglages du projet par une PR (#1308) : la
// branche part de la base, son commit ne porte que `.claude/brigade/projet.json`,
// et la PR est remise à la pass (`proposer-en-pass.test.ts` : elle l'y retient
// pour le chef). Une valeur que l'écriture refuse ne prépare rien. Sur de vrais dépôts git, sans réseau
// (`aides/projet-sur-git.ts`), avec un faux client GitHub.
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ouvrirDepot, type Depot } from "../../src/depot.ts";
import type { PR } from "../../src/github.ts";
import type { LivraisonHorsRail } from "../../src/pass.ts";
import { estUnePropositionDeReglage, proposerUnReglage } from "../../src/reglages-projet/proposer.ts";
import { FICHIER, reglagesDuTexte, type ReglagesProjet } from "../../src/reglages-projet/reglages.ts";
import { projetSurGit } from "../aides/projet-sur-git.ts";
import { BASE, ENV_GIT, git, repertoireTemporaire } from "../outils.ts";

const REGLAGES: ReglagesProjet = {
  integrationBranch: BASE,
  defaultCalibrations: { manager: { model: "sonnet", effort: "medium" }, reviewer: { model: "haiku", effort: "medium" } },
  calibrationCeiling: { model: "sonnet", effort: "high" },
};

type PROuverte = { branche: string; base: string; titre: string; corps: string; number: number; url: string };

// Le dépôt d'un projet et la station qui le sert : `amont` tient lieu de
// GitHub, le clone est celui de la station, son dépôt le vrai. Un faux client
// de PR, et une fausse pass qui retient ce qu'on lui remet.
function station(t: TestContext, contenu: Parameters<typeof projetSurGit>[1] = { reglages: REGLAGES }) {
  const { amont, clone, merger } = projetSurGit(t, contenu);
  const vrai = ouvrirDepot({ clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
  const preparees: string[] = [];
  const poussees: string[] = [];
  const depot: Pick<Depot, "preparer" | "retirer" | "ranger" | "pousser"> = {
    preparer: (run) => (preparees.push(run), vrai.preparer(run)),
    retirer: (worktree, branche) => vrai.retirer(worktree, branche),
    ranger: (worktree, branche) => vrai.ranger(worktree, branche),
    pousser: (branche) => (poussees.push(branche), vrai.pousser(branche)),
  };
  const prs: PROuverte[] = [];
  const pannes = { pr: false };
  const github = {
    async ouvrirPR(pr: { branche: string; base: string; titre: string; corps: string }) {
      if (pannes.pr) throw new Error("gh api : HTTP 422");
      const number = 900 + prs.length;
      const url = `https://github.com/acme/espace/pull/${number}`;
      prs.push({ ...pr, number, url });
      return url;
    },
    async prDeBranche(branche: string): Promise<PR | null> {
      const pr = prs.findLast((p) => p.branche === branche);
      return pr ? { number: pr.number, url: pr.url, base: pr.base, sha: git(amont, "rev-parse", branche), state: "open", merged: false, enRetard: false, mergeePar: null } : null;
    },
  };
  const enPass: LivraisonHorsRail[] = [];
  const options = { depot, github, base: BASE, remettre: (livraison: LivraisonHorsRail) => void enPass.push(livraison), env: ENV_GIT, avertir: () => {} };
  // Les fichiers que la PR change, et le fichier des réglages de chaque côté.
  const fichiersDe = (branche: string) => git(amont, "diff", "--name-only", `${BASE}...${branche}`).split("\n").filter(Boolean);
  const reglagesDe = (ref: string) => reglagesDuTexte(`${git(amont, "show", `${ref}:${FICHIER}`)}\n`);
  return { amont, clone, merger, options, prs, pannes, enPass, preparees, poussees, fichiersDe, reglagesDe };
}

describe("proposing a project setting change as a pull request", { concurrency: 4 }, () => {
  test("a new calibration ceiling opens a PR towards the integration branch whose diff changes only the ceiling in the settings file, hands it to the pass, and returns its URL", async (t) => {
    const lieu = station(t);
    const propose = await proposerUnReglage({ calibrationCeiling: { model: "opus", effort: "high" } }, lieu.options);

    assert.ok(propose.ok, JSON.stringify(propose));
    const [pr] = lieu.prs;
    assert.ok(pr !== undefined && lieu.prs.length === 1, "one PR is opened");
    assert.equal(propose.pr, pr.url);
    assert.equal(propose.numero, pr.number);
    assert.equal(pr.base, BASE);
    assert.equal(pr.branche, propose.branche);
    assert.match(pr.titre, /calibration ceiling: sonnet \/ high → opus \/ high/);
    assert.match(pr.corps, /held for the chef/);

    // Le seul fichier des réglages, et en lui le seul plafond.
    assert.deepEqual(lieu.fichiersDe(pr.branche), [FICHIER]);
    assert.deepEqual(lieu.reglagesDe(pr.branche), { ...REGLAGES, calibrationCeiling: { model: "opus", effort: "high" } });
    assert.deepEqual(propose.reglages, lieu.reglagesDe(pr.branche));
    const diff = git(lieu.amont, "diff", "-U0", `${BASE}...${pr.branche}`, "--", FICHIER)
      .split("\n")
      .filter((ligne) => /^[+-](?![+-])/.test(ligne));
    assert.deepEqual(diff, ['-    "model": "sonnet",', '+    "model": "opus",']);
    // Une branche de plus sur l'amont, rien sur la base.
    assert.equal(git(lieu.amont, "rev-list", "--count", `${BASE}..${pr.branche}`), "1");
    assert.equal(git(lieu.amont, "log", "-1", "--format=%s", BASE), "amorce");

    // Remise à la pass, du même geste.
    assert.deepEqual(lieu.enPass, [{ run: lieu.preparees[0], branche: pr.branche, pr: pr.url, numero: pr.number }]);
    assert.ok(estUnePropositionDeReglage(lieu.enPass[0]?.run ?? ""));
  });

  test("the change applies to the settings of the freshly fetched base, not to what the station's clone last saw", async (t) => {
    const lieu = station(t);
    // Mergé sur le dépôt après que la station l'a cloné : le reviewer a changé.
    lieu.merger(BASE, `${JSON.stringify({ version: 1, ...REGLAGES, defaultCalibrations: { ...REGLAGES.defaultCalibrations, reviewer: { model: "sonnet", effort: "high" } } }, null, 2)}\n`);
    const propose = await proposerUnReglage({ calibrationCeiling: { model: "opus", effort: "max" } }, lieu.options);
    assert.ok(propose.ok, JSON.stringify(propose));
    assert.deepEqual(lieu.reglagesDe(propose.branche).defaultCalibrations?.reviewer, { model: "sonnet", effort: "high" });
    assert.deepEqual(lieu.fichiersDe(propose.branche), [FICHIER]);
  });

  for (const [quoi, changement, motif, cle] of [
    ["a secret", { calibrationCeiling: { model: "opus", effort: "high" }, githubToken: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" }, "secret", "githubToken"],
    ["a machine path", { integrationBranch: "/home/chef/espace" }, "chemin", "integrationBranch"],
    ["a machine-specific limit", { calibrationCeiling: { model: "opus", effort: "high" }, maxCooks: 3 }, "limite-machine", "maxCooks"],
    ["a value that is no calibration", { calibrationCeiling: { model: "gpt-5", effort: "high" } }, "invalide", "calibrationCeiling.model"],
  ] as const) {
    test(`a change carrying ${quoi} opens no PR, prepares no branch, and says which setting and why`, async (t) => {
      const lieu = station(t);
      const avant = git(lieu.amont, "branch", "--list");
      const propose = await proposerUnReglage(changement, lieu.options);

      assert.ok(!propose.ok, JSON.stringify(propose));
      assert.equal(propose.motif, motif);
      assert.equal(propose.cle, cle);
      assert.match(propose.message, new RegExp(`\`${cle.replaceAll(".", "\\.")}\``));
      assert.doesNotMatch(propose.message, /ghp_/, "the message never quotes the value");
      assert.deepEqual([lieu.prs, lieu.enPass, lieu.preparees, lieu.poussees], [[], [], [], []]);
      assert.equal(git(lieu.amont, "branch", "--list"), avant);
    });
  }

  test("a change that names nothing, or is no object, is refused before anything is prepared", async (t) => {
    const lieu = station(t);
    for (const changement of [{}, null, "opus", [{ calibrationCeiling: null }]]) {
      const propose = await proposerUnReglage(changement, lieu.options);
      assert.ok(!propose.ok && propose.motif === "invalide", JSON.stringify(propose));
    }
    assert.deepEqual([lieu.prs, lieu.preparees], [[], []]);
  });

  test("a change the base already carries opens no PR and leaves no branch", async (t) => {
    const lieu = station(t);
    const propose = await proposerUnReglage({ calibrationCeiling: { model: "sonnet", effort: "high" } }, lieu.options);
    assert.ok(!propose.ok && propose.motif === "inchange", JSON.stringify(propose));
    assert.deepEqual([lieu.prs, lieu.enPass, lieu.poussees], [[], [], []]);
    assert.equal(git(lieu.clone, "branch", "--list", "cook/*"), "");
  });

  test("without a settings file, the PR creates it from the branch the CLAUDE.md declares, with the new ceiling", async (t) => {
    const lieu = station(t, { claudeMd: "- **Branche d'intégration** : `v2`\n" });
    const propose = await proposerUnReglage({ calibrationCeiling: { model: "opus", effort: "high" } }, lieu.options);
    assert.ok(propose.ok, JSON.stringify(propose));
    assert.deepEqual(lieu.fichiersDe(propose.branche), [FICHIER]);
    assert.deepEqual(lieu.reglagesDe(propose.branche), { integrationBranch: BASE, calibrationCeiling: { model: "opus", effort: "high" } });
    assert.match(lieu.prs[0]?.titre ?? "", /calibration ceiling: none → opus \/ high/);
  });

  test("removing a setting with null, and a default calibration changed role by role", async (t) => {
    const lieu = station(t);
    const propose = await proposerUnReglage({ calibrationCeiling: null, defaultCalibrations: { manager: { model: "opus", effort: "high" } } }, lieu.options);
    assert.ok(propose.ok, JSON.stringify(propose));
    assert.deepEqual(lieu.reglagesDe(propose.branche), { integrationBranch: BASE, defaultCalibrations: { manager: { model: "opus", effort: "high" }, reviewer: { model: "haiku", effort: "medium" } } });
  });

  test("GitHub refusing the PR is said, and nothing is handed to the pass", async (t) => {
    const lieu = station(t);
    lieu.pannes.pr = true;
    const propose = await proposerUnReglage({ calibrationCeiling: { model: "opus", effort: "high" } }, lieu.options);
    assert.ok(!propose.ok && propose.motif === "echec", JSON.stringify(propose));
    assert.match(propose.message, /could not be opened: gh api : HTTP 422/);
    assert.deepEqual(lieu.enPass, []);
  });
});
