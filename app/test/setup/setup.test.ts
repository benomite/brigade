// La préparation d'un dépôt par l'app (#2595, #4632) : un dépôt neuf, ouvert par l'app, se prépare pour Brigade sur
// le seul chemin GitHub. La session est une conversation, ouverte avec ses instructions (setup/setup.ts) ; ce qu'elle
// écrit, elle le fait écrire par le script que l'app pose à côté d'elles — c'est lui qu'on joue ici, par le chemin
// que les instructions posées nomment. Contre le vrai `git` (un `origin` nu, local) et un `gh` doublure qui note ce
// qu'on lui demande.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ETIQUETTES } from "../../../runtime/src/etiquettes.ts";
import { argumentsOfSetup, CATALOG_OF_LABELS, INSTRUCTIONS, OWN, PLACES_BY_DEFAULT, PR_OF_SETUP, SCRIPT, setTheSetup, setupInWords, START_OF_SETUP } from "../../src/setup/setup.ts";
import { WITHOUT_POSIX } from "../helpers/posix.ts";

const URL_OF_THE_PR = "https://github.com/benomite/calculus/pull/1";

function trial(t: TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "brigade-setup-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = {
    ...process.env,
    PATH: `${join(root, "bin")}:${process.env.PATH}`,
    GH_LOG: join(root, "gh.log"),
    GH_LABELS: join(root, "gh-labels.txt"),
    TMPDIR: root,
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
  mkdirSync(join(root, "bin"));
  writeFileSync(
    join(root, "bin", "gh"),
    `#!/usr/bin/env bash\necho "$*" >>"$GH_LOG"\ncase "$1 $2" in\n  "label create") grep -qxF "$3" "$GH_LABELS" 2>/dev/null && exit 1 ;;\n  "label list") cat "$GH_LABELS" 2>/dev/null ;;\n  "pr create") echo "${URL_OF_THE_PR}" ;;\nesac\nexit 0\n`,
    { mode: 0o755 },
  );

  // Un dépôt neuf : un commit sur `main`, poussé sur son `origin` — rien de Brigade.
  const origin = join(root, "origin.git");
  git("init", "-q", "--bare", "-b", "main", origin);
  const folder = join(root, "calculus");
  git("init", "-q", "-b", "main", folder);
  writeFileSync(join(folder, "README.md"), "# calculus\n");
  writeFileSync(join(folder, "CLAUDE.md"), "# calculus\n\nKeep it simple.\n");
  git("-C", folder, "add", ".");
  git("-C", folder, "commit", "-q", "-m", "x");
  git("-C", folder, "remote", "add", "origin", origin);
  git("-C", folder, "push", "-q", "-u", "origin", "main");

  // L'app ouvre la session : ses instructions sont posées à côté du fichier des projets.
  const setup = join(root, "config", "setup");
  const open = async () => void setTheSetup(setup);

  // Ce que la session joue : le script que les instructions posées nomment, depuis le dossier du projet.
  const initialize = (...args: string[]) => {
    const instructions = readFileSync(join(setup, INSTRUCTIONS), "utf8");
    const script = /pr-de-setup\.ts" "([^"]+)"/.exec(instructions)?.[1];
    assert.ok(script !== undefined && script.startsWith(setup), `the instructions name its script: ${script}`);
    return execFileSync("bash", [script, ...args], { cwd: folder, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  };
  const callsOfGh = () => readFileSync(env.GH_LOG, "utf8").trim().split("\n");
  const labelsOfRepository = (...names: string[]) => writeFileSync(env.GH_LABELS, names.map((n) => `${n}\n`).join(""));
  return { git, origin, dossier: folder, ouvrir: open, initialiser: initialize, appelsDeGh: callsOfGh, labelsDuDepot: labelsOfRepository };
}

test("un dépôt neuf ouvert par l'app se prépare par sa session : les labels posés, les bindings et les gates dans une PR, rien dans le dossier de l'utilisateur", { skip: WITHOUT_POSIX }, async (t) => {
  const { git, origin, dossier: folder, ouvrir: open, initialiser: initialize, appelsDeGh: callsOfGh } = trial(t);
  await open();

  const output = initialize("--test", "true", "--install", "true", "--zones", "`src/`");

  assert.equal(output.trim().split("\n").at(-1), `pr ${URL_OF_THE_PR}`);
  // Tous les labels du catalogue du runtime, avec leur description anglaise.
  const creations = callsOfGh().filter((call) => call.startsWith("label create "));
  assert.deepEqual(creations.map((call) => /^label create (\S+) /.exec(call)?.[1]), ETIQUETTES.map(({ name }) => name));
  for (const { name, color, description } of ETIQUETTES) assert.ok(creations.includes(`label create ${name} --color ${color} --description ${description}`), name);
  assert.deepEqual(callsOfGh().filter((call) => call.startsWith("label edit ")), []);
  assert.match(callsOfGh().find((a) => a.startsWith("pr create")) ?? "", /^pr create --base main --head brigade\/init /);
  // Ni le commit ni la PR ne nomment une commande du plugin : la préparation est un geste de l'app (#4632).
  const prCreate = callsOfGh().find((a) => a.startsWith("pr create")) ?? "";
  assert.match(prCreate, /Written by the Brigade app's repository setup: /);
  assert.doesNotMatch(prCreate, /\/brigade:/);
  const message = git("--git-dir", origin, "log", "-1", "--format=%B", "brigade/init");
  assert.match(message, /written by the Brigade app's repository setup\./);
  assert.doesNotMatch(message, /\/brigade:/);

  // La branche poussée porte le bloc, après ce que `CLAUDE.md` disait déjà, et les deux scripts exécutables.
  const claudeMd = git("--git-dir", origin, "show", "brigade/init:CLAUDE.md");
  assert.match(claudeMd, /^# calculus\n\nKeep it simple\.\n\n## Équipe multi-agents \(plugin brigade\)\n/);
  assert.match(claudeMd, /^- \*\*Branche d'intégration\*\* : `main`$/m);
  assert.match(claudeMd, /^- \*\*Gates\*\* : `\.claude\/brigade\/gates\.sh <WT>`$/m);
  assert.match(claudeMd, /^- \*\*Setup worktree\*\* : `\.claude\/brigade\/worktree-setup\.sh <n> <WT>`$/m);
  assert.match(claudeMd, /^- \*\*Zones de fichiers\*\* : `src\/`$/m);
  assert.doesNotMatch(claudeMd, new RegExp(folder));
  const tree = git("--git-dir", origin, "ls-tree", "-r", "brigade/init", ".claude/brigade");
  assert.match(tree, /^100755 blob \S+\t\.claude\/brigade\/gates\.sh$/m);
  assert.match(tree, /^100755 blob \S+\t\.claude\/brigade\/worktree-setup\.sh$/m);
  assert.match(git("--git-dir", origin, "show", "brigade/init:.claude/brigade/gates.sh"), /\ntrue\n$/);
  // `main` n'a pas bougé : c'est l'utilisateur qui merge.
  assert.equal(git("--git-dir", origin, "rev-parse", "main"), git("-C", folder, "rev-parse", "main"));

  // Le dossier de l'utilisateur : même branche, rien de nouveau, aucun worktree laissé.
  assert.equal(git("-C", folder, "branch", "--show-current").trim(), "main");
  assert.equal(git("-C", folder, "status", "--porcelain"), "");
  assert.equal(git("-C", folder, "worktree", "list").trim().split("\n").length, 1);

  // Les gates écrites se jouent, vertes, dans un worktree de la branche.
  const trialOfGates = join(folder, "..", "essai-des-gates");
  git("-C", folder, "fetch", "-q", "origin", "brigade/init");
  git("-C", folder, "worktree", "add", "-q", trialOfGates, "origin/brigade/init");
  execFileSync(join(trialOfGates, ".claude", "brigade", "gates.sh"), [trialOfGates]);
});

test("la préparation renomme l'ancien label hors-cuisine en served-elsewhere, sans rien supprimer", { skip: WITHOUT_POSIX }, async (t) => {
  const { ouvrir: open, initialiser: initialize, appelsDeGh: callsOfGh, labelsDuDepot: labelsOfRepository } = trial(t);
  await open();
  labelsOfRepository("hors-cuisine", "fire");

  initialize("--test", "true");

  const calls = callsOfGh();
  assert.ok(calls.includes("label edit hors-cuisine --name served-elsewhere"));
  assert.equal(calls.filter((a) => a.startsWith("label delete")).length, 0);
});

test("la préparation rejouée sur un dépôt qui porte déjà served-elsewhere ne le supprime ni ne le renomme", { skip: WITHOUT_POSIX }, async (t) => {
  const { ouvrir: open, initialiser: initialize, appelsDeGh: callsOfGh, labelsDuDepot: labelsOfRepository } = trial(t);
  await open();
  labelsOfRepository("served-elsewhere", "fire");

  initialize("--test", "true");

  const calls = callsOfGh();
  assert.equal(calls.filter((a) => a.startsWith("label delete") || a.includes("--name")).length, 0);
});

test("la préparation corrige la description d'un label déjà là (repli label edit)", { skip: WITHOUT_POSIX }, async (t) => {
  const { ouvrir: open, initialiser: initialize, appelsDeGh: callsOfGh, labelsDuDepot: labelsOfRepository } = trial(t);
  await open();
  labelsOfRepository("fix");

  initialize("--test", "true");

  const fix = ETIQUETTES.find(({ name }) => name === "fix");
  assert.ok(callsOfGh().includes(`label edit fix --description ${fix?.description}`));
});

test("rejouée une fois la PR mergée, la préparation ne propose rien : la branche d'intégration porte déjà tout", { skip: WITHOUT_POSIX }, async (t) => {
  const { git, origin, dossier: folder, ouvrir: open, initialiser: initialize, appelsDeGh: callsOfGh } = trial(t);
  await open();
  initialize("--test", "true");
  git("--git-dir", origin, "update-ref", "refs/heads/main", "brigade/init");

  const output = initialize("--test", "true");

  assert.equal(output.trim(), "unchanged");
  assert.equal(callsOfGh().filter((call) => call.startsWith("pr create")).length, 1);
  assert.equal(git("-C", folder, "worktree", "list").trim().split("\n").length, 1);
});

test("sans commande de test, la préparation n'écrit rien : une gate qui ne lance rien serait un faux vert", { skip: WITHOUT_POSIX }, async (t) => {
  const { origin, ouvrir: open, initialiser: initialize, git } = trial(t);
  await open();

  assert.throws(() => initialize(), (error: { status?: number; stderr?: string }) => error.status === 64 && /--test is required/.test(error.stderr ?? ""));
  assert.equal(git("--git-dir", origin, "branch", "--list", "brigade/init"), "");
});

test("le catalogue que lit la préparation (labels.tsv) est celui du runtime (etiquettes.ts), ligne pour ligne", () => {
  const tsv = readFileSync(join(OWN, CATALOG_OF_LABELS), "utf8");
  assert.equal(tsv, ETIQUETTES.map((e) => `${e.name}\t${e.color}\t${e.description}\n`).join(""));
});

test("les instructions posées nomment le `node`, la commande du runtime et le script par leurs chemins, en barres obliques — et aucune commande du plugin", { skip: WITHOUT_POSIX }, (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "brigade-setup-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const folder = join(root, "setup");

  const path = setTheSetup(folder, { node: "/opt/brigade/node", runtime: "/opt/brigade/runtime" });

  assert.equal(path, join(folder, INSTRUCTIONS));
  const instructions = readFileSync(path, "utf8");
  assert.ok(instructions.includes(`"/opt/brigade/node" "/opt/brigade/runtime/${PR_OF_SETUP.join("/")}" "${join(folder, SCRIPT)}" --test`));
  assert.doesNotMatch(instructions, /@(?:NODE|SETUP_PR|SCRIPT)@/);
  assert.doesNotMatch(instructions, /\/brigade:/);
  // Un prompt système, pas une commande : aucun en-tête de commande de Claude Code.
  assert.doesNotMatch(instructions, /^---/);
  // Le script, exécutable, et son catalogue, à côté des instructions.
  assert.equal(readFileSync(join(folder, SCRIPT), "utf8"), readFileSync(join(OWN, SCRIPT), "utf8"));
  assert.equal(statSync(join(folder, SCRIPT)).mode & 0o755, 0o755);
  assert.equal(readFileSync(join(folder, CATALOG_OF_LABELS), "utf8"), readFileSync(join(OWN, CATALOG_OF_LABELS), "utf8"));
  // Reposée telle quelle, rien ne change.
  assert.equal(setTheSetup(folder, { node: "/opt/brigade/node", runtime: "/opt/brigade/runtime" }), path);
  assert.equal(readFileSync(path, "utf8"), instructions);
});

test("par défaut, les instructions lancent la commande du runtime du dépôt par le `node` du PATH", (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "brigade-setup-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const prOfSetup = join(PLACES_BY_DEFAULT.runtime, ...PR_OF_SETUP);
  assert.ok(existsSync(prOfSetup), prOfSetup);
  const instructions = readFileSync(setTheSetup(root), "utf8");
  assert.ok(instructions.includes(`"node" "${prOfSetup.replaceAll("\\", "/")}" "${join(root, SCRIPT).replaceAll("\\", "/")}" --test`));
});

test("la session s'ouvre avec les instructions dans son prompt système et un premier message d'une ligne, sans commande", () => {
  assert.deepEqual(argumentsOfSetup("/config/setup/instructions.md"), ["--append-system-prompt-file", "/config/setup/instructions.md", START_OF_SETUP]);
  // Sous Windows, un `claude.cmd` ne reçoit aucun argument sur plusieurs lignes ; et rien n'y est une commande à taper.
  assert.doesNotMatch(START_OF_SETUP, /[\r\n]/);
  assert.doesNotMatch(START_OF_SETUP, /^\/|brigade:/);
  // Un second qui tourne déjà reçoit une demande d'une ligne qui nomme ses instructions.
  assert.equal(setupInWords("/config/setup/instructions.md"), "Set this repository up for Brigade: read /config/setup/instructions.md and follow it.");
});
