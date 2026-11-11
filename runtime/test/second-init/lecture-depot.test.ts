// Ce que le second lit d'un dépôt pas encore préparé (#3167) : la branche
// d'intégration, les checks, les zones — sur plusieurs dépôts de fixture —, et
// ce qui ne se lit pas, dit avec sa raison au lieu d'être deviné.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { etatDuDepot, lireLeDepot } from "../../src/second-init/lecture-depot.ts";
import { git, repertoireTemporaire } from "../outils.ts";

// Un dépôt de fixture : ses fichiers, chemin → contenu ; un chemin qui finit par `/` est un dossier.
function fixture(t: TestContext, fichiers: Record<string, string>): string {
  const dossier = repertoireTemporaire(t);
  for (const [chemin, contenu] of Object.entries(fichiers)) {
    if (chemin.endsWith("/")) mkdirSync(join(dossier, chemin), { recursive: true });
    else {
      mkdirSync(join(dossier, chemin, ".."), { recursive: true });
      writeFileSync(join(dossier, chemin), contenu);
    }
  }
  return dossier;
}

const ORIGIN_HEAD = (branche: string) => ({ ".git/refs/remotes/origin/HEAD": `ref: refs/remotes/origin/${branche}\n` });

test("un dépôt Node à workspaces, cloné par git : sa branche par défaut, ses scripts joués par pnpm, ses workspaces", (t) => {
  const dossier = fixture(t, {
    "package.json": JSON.stringify({ name: "parade", workspaces: ["packages/*", "apps/web/"], scripts: { test: "vitest run", lint: "eslint .", build: "tsc" } }),
    "pnpm-lock.yaml": "lockfileVersion: 9\n",
    "CLAUDE.md": "# Parade\n",
    "packages/": "",
  });
  git(dossier, "init", "-q", "--initial-branch=trunk");
  git(dossier, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk");
  assert.deepEqual(lireLeDepot(dossier), {
    branche: { lu: true, valeur: "trunk", source: "the default branch of `origin`" },
    checks: { lu: true, valeur: ["pnpm test", "pnpm run lint"], source: "the scripts `test`, `lint` of `package.json`" },
    zones: { lu: true, valeur: ["packages/*/", "apps/web/"], source: "the `workspaces` of `package.json`" },
  });
});

test("un dépôt à plusieurs paquets sans racine : les scripts de chaque paquet, ses dossiers de code pour zones", (t) => {
  const dossier = fixture(t, {
    ...ORIGIN_HEAD("main"),
    "runtime/package.json": JSON.stringify({ scripts: { test: "node --test", typecheck: "tsc --noEmit", start: "node src/main.ts" } }),
    "app/package.json": JSON.stringify({ scripts: { test: "node --test" } }),
    "app/yarn.lock": "",
    "docs/README.md": "doc\n",
    ".github/workflows/ci.yml": "on: push\n",
    "node_modules/x/package.json": "{}",
  });
  assert.deepEqual(lireLeDepot(dossier), {
    branche: { lu: true, valeur: "main", source: "the default branch of `origin`" },
    checks: { lu: true, valeur: ["yarn --cwd app test", "npm --prefix runtime test", "npm --prefix runtime run typecheck"], source: "the scripts `test` of `app/package.json`; the scripts `test`, `typecheck` of `runtime/package.json`" },
    zones: { lu: true, valeur: ["app/", "docs/", "runtime/"], source: "the first-level folders of the repository" },
  });
});

test("un dépôt Rust dans un worktree (`.git` fichier) : la branche du dépôt commun, `cargo test`", (t) => {
  const commun = fixture(t, { ...ORIGIN_HEAD("develop"), ".git/worktrees/wt/commondir": "../..\n" });
  const dossier = fixture(t, { ".git": `gitdir: ${join(commun, ".git", "worktrees", "wt")}\n`, "Cargo.toml": "[package]\nname = \"x\"\n", "src/main.rs": "fn main() {}\n" });
  assert.deepEqual(lireLeDepot(dossier), {
    branche: { lu: true, valeur: "develop", source: "the default branch of `origin`" },
    checks: { lu: true, valeur: ["cargo test"], source: "`Cargo.toml`" },
    zones: { lu: true, valeur: ["src/"], source: "the first-level folders of the repository" },
  });
});

test("ce qui ne se lit pas est dit, avec sa raison — rien n'est deviné", async (t) => {
  await t.test("sans `origin/HEAD`, sans commande de test, sans dossier : trois choses non lues", (t) => {
    const lecture = lireLeDepot(fixture(t, { ".git/HEAD": "ref: refs/heads/main\n", "package.json": JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }) }));
    assert.deepEqual(lecture.branche, { lu: false, raison: "the clone does not record the repository's default branch (no `refs/remotes/origin/HEAD`)" });
    assert.equal(lecture.checks.lu, false);
    assert.match(lecture.checks.lu ? "" : lecture.checks.raison, /^no test command was found/);
    assert.deepEqual(lecture.zones, { lu: false, raison: "the repository has no first-level code folder to split into zones" });
  });

  await t.test("un `package.json` qui n'est pas du JSON : les checks et les zones le disent, la branche se lit", (t) => {
    const dossier = fixture(t, { ...ORIGIN_HEAD("main"), "package.json": "{ not json", "src/": "" });
    const lecture = lireLeDepot(dossier);
    assert.equal(lecture.branche.lu, true);
    assert.match(lecture.checks.lu ? "" : lecture.checks.raison, /^`package\.json` is not valid JSON/);
    assert.match(lecture.zones.lu ? "" : lecture.zones.raison, /^`package\.json` is not valid JSON/);
  });

  await t.test("un fichier illisible (un dossier à sa place) : sa lecture le dit", (t) => {
    const dossier = fixture(t, { ".git/refs/remotes/origin/HEAD/": "", "package.json/": "" });
    const lecture = lireLeDepot(dossier);
    assert.match(lecture.branche.lu ? "" : lecture.branche.raison, /^`refs\/remotes\/origin\/HEAD` cannot be read/);
    assert.match(lecture.checks.lu ? "" : lecture.checks.raison, /^`package\.json` cannot be read/);
  });

  await t.test("un `origin/HEAD` qui ne nomme pas de branche", (t) => {
    assert.deepEqual(lireLeDepot(fixture(t, { ".git/refs/remotes/origin/HEAD": "0123abcd\n" })).branche, { lu: false, raison: "`refs/remotes/origin/HEAD` does not name a branch of `origin`" });
  });
});

test("l'état du dossier : hors dépôt, préparé, pas préparé, ou inconnu quand son `CLAUDE.md` ne se lit pas", (t) => {
  assert.deepEqual(etatDuDepot(fixture(t, { "CLAUDE.md": "# x\n" })), { etat: "hors-depot" });
  assert.deepEqual(etatDuDepot(fixture(t, { ".git/HEAD": "", "CLAUDE.md": "# x\n\n## Équipe multi-agents (plugin brigade)\n\n- **Branche d'intégration** : `main`\n" })), { etat: "prepare" });
  assert.deepEqual(etatDuDepot(fixture(t, { ".git/HEAD": "", "CLAUDE.md": "# x\n" })), { etat: "non-prepare" });
  assert.deepEqual(etatDuDepot(fixture(t, { ".git/HEAD": "" })), { etat: "non-prepare" });
  const inconnu = etatDuDepot(fixture(t, { ".git/HEAD": "", "CLAUDE.md/": "" }));
  assert.equal(inconnu.etat, "inconnu");
  assert.match(inconnu.etat === "inconnu" ? inconnu.raison : "", /^`CLAUDE\.md` cannot be read/);
});
