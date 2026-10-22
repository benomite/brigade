// La PR qui propose un changement des réglages du projet (#1308), remise à la
// vraie pass : jugée verte sous grant, elle n'est pas mergée — elle change un
// réglage du projet, et la pass la retient pour le chef (#1305).
import assert from "node:assert/strict";
import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { Depot } from "../../src/depot.ts";
import { A_RELIRE, causeDeDeclarations } from "../../src/events/pass.ts";
import type { Pass } from "../../src/pass.ts";
import { proposerUnReglage } from "../../src/reglages-projet/proposer.ts";
import { FICHIER } from "../../src/reglages-projet/reglages.ts";
import { chef, cuisine, fauxGitHub, montre } from "../aides/cuisine.ts";
import { BASE, depotGit, ENV_GIT, git, jusqua, repertoireTemporaire } from "../outils.ts";

test("judged green under grant, the proposed PR is held for the chef because it changes a project setting, and never merged", async (t) => {
  const { origine, clone } = depotGit(t);
  // Le projet a des gates, sur sa base : sans elles, la pass ne juge rien.
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
  const runtime = lieu.runtime as unknown as Pick<Pass, "prendreHorsRail">;

  const propose = await proposerUnReglage({ calibrationCeiling: { model: "opus", effort: "high" } }, { depot, github: lieu.gh.github, base: BASE, remettre: (livraison) => runtime.prendreHorsRail(livraison), env: ENV_GIT, avertir: () => {} });
  assert.ok(propose.ok, JSON.stringify(propose));
  assert.deepEqual(git(origine, "diff", "--name-only", `${BASE}...${propose.branche}`).split("\n"), [FICHIER]);

  const fait = (type: string) => lieu.journal.duTicket(propose.numero).find((e) => e.type === type);
  await jusqua(() => fait("pass.held") !== undefined);
  assert.equal((fait("pass.judged")?.payload as { verdict: string } | undefined)?.verdict, "green");
  assert.deepEqual(fait("pass.held")?.payload, { reason: A_RELIRE, cause: causeDeDeclarations([FICHIER]) });
  assert.deepEqual(lieu.gh.merges, []);
  await jusqua(() => lieu.gh.commentaires.some(([numero, corps]) => numero === propose.numero && /non mergée \(`review-required`\)[\s\S]*elle change un réglage du projet/.test(corps)));
});
