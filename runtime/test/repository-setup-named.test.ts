// #4631 : la mise en place du dépôt n'a plus de commande à son nom. Les
// messages et les étapes qui y renvoient le chef disent « la mise en place du
// dépôt » (the repository setup), la session que l'app ouvre dans le second ;
// aucun ne nomme une commande ou un rôle du plugin V1.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { chefDeGitHub } from "../src/chef/chef.ts";
import { ETAPES } from "../src/etapes.ts";
import { jugerReseau, verifier, type Constat } from "../src/installation.ts";
import { BASE, depotGit, ENV_GIT, FAUX_CLAUDE, git } from "./outils.ts";

const V1 = /brigade:(designer|dev|manager|po|sync|init)\b|commands\/[a-z]+\.md/;
const SANS_SYSTEMD = { minuteurActif: async () => false, passages: async () => [] };

// Les constats du dépôt, une fois `claudeMd` poussé (ou rien) sur la base de l'origine.
async function constatsDuDepot(t: TestContext, claudeMd: string | null): Promise<Constat[]> {
  const { clone } = depotGit(t);
  if (claudeMd !== null) {
    writeFileSync(join(clone, "CLAUDE.md"), claudeMd);
    git(clone, "add", "CLAUDE.md");
    git(clone, "commit", "-q", "-m", "bindings");
    git(clone, "push", "-q", "origin", `HEAD:${BASE}`);
  }
  const env = { ...ENV_GIT, BRIGADE_REPO_DIR: clone, BRIGADE_BASE_BRANCH: BASE, BRIGADE_CLAUDE_BIN: FAUX_CLAUDE, BRIGADE_SYSTEMCTL_BIN: join(import.meta.dirname, "aides/faux-systemctl.sh"), BRIGADE_GH_BIN: join(clone, "pas-de-gh") };
  return (await verifier(env, SANS_SYSTEMD)).filter(({ ou }) => ou === "depot");
}

test("the box check sends a repository with no gates and no bindings to the repository setup, and names no command", async (t) => {
  const depot = await constatsDuDepot(t, null);

  const gates = depot.find(({ texte }) => texte.includes("without gates, the pass judges no delivery"));
  const bindings = depot.find(({ texte }) => texte.startsWith("the bindings block"));
  assert.equal(gates?.geste, `the repository setup, then merge its PR into \`${BASE}\``, JSON.stringify(depot));
  assert.equal(bindings?.geste, `the repository setup, then merge its PR into \`${BASE}\``, JSON.stringify(depot));
  for (const constat of depot) assert.doesNotMatch(JSON.stringify(constat), V1);
});

test("the box check says which bindings are missing from the block, without naming a command to add them", async (t) => {
  const depot = await constatsDuDepot(t, ["# Projet", "", "## Équipe multi-agents (plugin brigade)", "", `- **Branche d'intégration** : \`${BASE}\``, ""].join("\n"));

  const absents = depot.find(({ texte }) => texte.startsWith("bindings missing from the block"));
  assert.equal(absents?.geste, "add them to the block", JSON.stringify(depot));
  for (const constat of depot) assert.doesNotMatch(JSON.stringify(constat), V1);
});

test("a host the setup reaches but the repository does not declare: the gesture names the file, not a command", () => {
  const juge = jugerReseau({ setup: "npm ci\n", declaration: null });

  assert.equal(juge.geste, "add this host to `.claude/brigade/reseau`, committed on the integration branch");
});

test("the onboarding step of the repository setup says what it does and the gesture it asks, with no command", () => {
  const etape = ETAPES.find(({ id }) => id === "init");

  assert.match(etape?.sert ?? "", /^La mise en place du dépôt pose les bindings, les gates et le setup de worktree/);
  assert.match(etape?.geste ?? "", /^Faire la mise en place du dépôt dans la session que l'app ouvre dans le second, puis merger sa PR/);
  for (const { sert, sauter, geste } of ETAPES) assert.doesNotMatch(`${sert} ${sauter} ${geste}`, V1);
});

test("with no chef declared, an organisation's repository and no merged setup PR: the reason names the repository setup", async () => {
  const resolu = await chefDeGitHub({ proprietaire: async () => ({ login: "atelier", organisation: true }), auteurDeLInit: async () => null });

  assert.deepEqual(resolu, {
    login: null,
    reason: "no `chef` declared, the repo belongs to the organization atelier, and no merged repository setup PR was found: set `chef` to the chef's GitHub login in `.claude/brigade/projet.json`",
  });
});
