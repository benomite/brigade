// `/brigade:init` du plugin de l'app (#2595) : un dépôt neuf, ouvert par l'app, se prépare pour Brigade sur le
// seul chemin GitHub. La commande est une conversation ; ce qu'elle écrit, elle le fait écrire par le script
// que l'app pose dans son marketplace — c'est lui qu'on joue ici, par le chemin que la commande posée nomme.
// Contre le vrai `git` (un `origin` nu, local) et un `gh` doublure qui note ce qu'on lui demande.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { LABELS } from "../../runtime/src/installation.ts";
import { lancerVraiment, tenirLePluginApp, type Lancer } from "../src/plugin-app.ts";
import { SANS_POSIX } from "./aides/posix.ts";

const COMMANDES_DU_DEPOT = join(import.meta.dirname, "..", "..", "commands");
const URL_DE_LA_PR = "https://github.com/benomite/calculus/pull/1";

function essai(t: TestContext) {
  const racine = realpathSync(mkdtempSync(join(tmpdir(), "brigade-plugin-init-")));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const env = {
    ...process.env,
    PATH: `${join(racine, "bin")}:${process.env.PATH}`,
    GH_LOG: join(racine, "gh.log"),
    TMPDIR: racine,
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@t",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@t",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "commit.gpgsign",
    GIT_CONFIG_VALUE_0: "false",
  };
  const git = (...args: string[]) => execFileSync("git", args, { env, encoding: "utf8" });

  // Le `gh` doublure : connecté, il note chaque appel ; aucune PR ouverte, il en crée une.
  mkdirSync(join(racine, "bin"));
  writeFileSync(
    join(racine, "bin", "gh"),
    `#!/usr/bin/env bash\necho "$*" >>"$GH_LOG"\ncase "$1 $2" in\n  "pr create") echo "${URL_DE_LA_PR}" ;;\nesac\nexit 0\n`,
    { mode: 0o755 },
  );

  // Un dépôt neuf : un commit sur `main`, poussé sur son `origin` — rien de Brigade.
  const origin = join(racine, "origin.git");
  git("init", "-q", "--bare", "-b", "main", origin);
  const dossier = join(racine, "calculus");
  git("init", "-q", "-b", "main", dossier);
  writeFileSync(join(dossier, "README.md"), "# calculus\n");
  writeFileSync(join(dossier, "CLAUDE.md"), "# calculus\n\nKeep it simple.\n");
  git("-C", dossier, "add", ".");
  git("-C", dossier, "commit", "-q", "-m", "x");
  git("-C", dossier, "remote", "add", "origin", origin);
  git("-C", dossier, "push", "-q", "-u", "origin", "main");

  // L'app ouvre le projet : son plugin y est posé, devant un `claude` doublure qui accepte tout.
  const lancer: Lancer = async (commande, args, ici) => {
    if (commande !== "claude-doublure") return lancerVraiment(env, 10_000)(commande, args, ici);
    return args[1] === "list" ? { code: 0, sortie: "[]", erreur: "" } : { code: 0, sortie: "✔ done", erreur: "" };
  };
  const marketplace = join(racine, "config", "plugin-app");
  const ouvrir = () => tenirLePluginApp({ lancer, claude: "claude-doublure", marketplace, commandes: COMMANDES_DU_DEPOT, versionDeLApp: "1.2.3", dire: () => {} }).suivre([{ nom: "calculus", dossier }]);

  // Ce que `/brigade:init` joue : le script que la commande posée nomme, depuis le dossier du projet.
  const initialiser = (...args: string[]) => {
    const commande = readFileSync(join(marketplace, "commands", "init.md"), "utf8");
    const script = /bash "([^"]+)"/.exec(commande)?.[1];
    assert.ok(script !== undefined && script.startsWith(marketplace), `the command names its script: ${script}`);
    return execFileSync("bash", [script, ...args], { cwd: dossier, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  };
  const appelsDeGh = () => readFileSync(env.GH_LOG, "utf8").trim().split("\n");
  return { git, origin, dossier, ouvrir, initialiser, appelsDeGh };
}

test("un dépôt neuf ouvert par l'app se prépare par /brigade:init : les labels posés, les bindings et les gates dans une PR, rien dans le dossier de l'utilisateur", { skip: SANS_POSIX }, async (t) => {
  const { git, origin, dossier, ouvrir, initialiser, appelsDeGh } = essai(t);
  await ouvrir();

  const sortie = initialiser("--test", "true", "--install", "true", "--zones", "`src/`");

  assert.equal(sortie.trim().split("\n").at(-1), `pr ${URL_DE_LA_PR}`);
  // Les labels du rail, ceux que la station vérifie (runtime/src/installation.ts), tous.
  const labels = appelsDeGh().flatMap((appel) => /^label create (\S+) /.exec(appel)?.[1] ?? []);
  assert.deepEqual(labels, LABELS.map(({ name }) => name));
  assert.match(appelsDeGh().find((a) => a.startsWith("pr create")) ?? "", /^pr create --base main --head brigade\/init /);

  // La branche poussée porte le bloc, après ce que `CLAUDE.md` disait déjà, et les deux scripts exécutables.
  const claudeMd = git("--git-dir", origin, "show", "brigade/init:CLAUDE.md");
  assert.match(claudeMd, /^# calculus\n\nKeep it simple\.\n\n## Équipe multi-agents \(plugin brigade\)\n/);
  assert.match(claudeMd, /^- \*\*Branche d'intégration\*\* : `main`$/m);
  assert.match(claudeMd, /^- \*\*Gates\*\* : `\.claude\/brigade\/gates\.sh <WT>`$/m);
  assert.match(claudeMd, /^- \*\*Setup worktree\*\* : `\.claude\/brigade\/worktree-setup\.sh <n> <WT>`$/m);
  assert.match(claudeMd, /^- \*\*Zones de fichiers\*\* : `src\/`$/m);
  assert.doesNotMatch(claudeMd, new RegExp(dossier));
  const arbre = git("--git-dir", origin, "ls-tree", "-r", "brigade/init", ".claude/brigade");
  assert.match(arbre, /^100755 blob \S+\t\.claude\/brigade\/gates\.sh$/m);
  assert.match(arbre, /^100755 blob \S+\t\.claude\/brigade\/worktree-setup\.sh$/m);
  assert.match(git("--git-dir", origin, "show", "brigade/init:.claude/brigade/gates.sh"), /\ntrue\n$/);
  // `main` n'a pas bougé : c'est l'utilisateur qui merge.
  assert.equal(git("--git-dir", origin, "rev-parse", "main"), git("-C", dossier, "rev-parse", "main"));

  // Le dossier de l'utilisateur : même branche, rien de nouveau, aucun worktree laissé.
  assert.equal(git("-C", dossier, "branch", "--show-current").trim(), "main");
  assert.equal(git("-C", dossier, "status", "--porcelain"), "");
  assert.equal(git("-C", dossier, "worktree", "list").trim().split("\n").length, 1);

  // Les gates écrites se jouent, vertes, dans un worktree de la branche.
  const essaiDesGates = join(dossier, "..", "essai-des-gates");
  git("-C", dossier, "fetch", "-q", "origin", "brigade/init");
  git("-C", dossier, "worktree", "add", "-q", essaiDesGates, "origin/brigade/init");
  execFileSync(join(essaiDesGates, ".claude", "brigade", "gates.sh"), [essaiDesGates]);
});

test("rejoué une fois la PR mergée, /brigade:init ne propose rien : la branche d'intégration porte déjà tout", { skip: SANS_POSIX }, async (t) => {
  const { git, origin, dossier, ouvrir, initialiser, appelsDeGh } = essai(t);
  await ouvrir();
  initialiser("--test", "true");
  git("--git-dir", origin, "update-ref", "refs/heads/main", "brigade/init");

  const sortie = initialiser("--test", "true");

  assert.equal(sortie.trim(), "unchanged");
  assert.equal(appelsDeGh().filter((appel) => appel.startsWith("pr create")).length, 1);
  assert.equal(git("-C", dossier, "worktree", "list").trim().split("\n").length, 1);
});

test("sans commande de test, /brigade:init n'écrit rien : une gate qui ne lance rien serait un faux vert", { skip: SANS_POSIX }, async (t) => {
  const { origin, ouvrir, initialiser, git } = essai(t);
  await ouvrir();

  assert.throws(() => initialiser(), (erreur: { status?: number; stderr?: string }) => erreur.status === 64 && /--test is required/.test(erreur.stderr ?? ""));
  assert.equal(git("--git-dir", origin, "branch", "--list", "brigade/init"), "");
});
