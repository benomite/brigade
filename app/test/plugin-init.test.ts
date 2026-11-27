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
import { launchReally, holdThePluginApp, type Launch } from "../src/plugin-app.ts";
import { WITHOUT_POSIX } from "./helpers/posix.ts";

// Le catalogue des labels d'un projet Brigade, tel que l'ancien runtime le tenait (runtime/src/etiquettes.ts,
// supprimé avec lui, #4499) : un nom, une couleur, une description anglaise.
const ETIQUETTES: ReadonlyArray<{ name: string; color: string; description: string }> = [
  { name: "product", color: "0E8A16", description: "Issue born from the product owner" },
  { name: "design", color: "D93F0B", description: "Interface work, reserved to the designer" },
  { name: "triage", color: "FBCA04", description: "To be qualified" },
  { name: "feature", color: "1D76DB", description: "New functionality" },
  { name: "fix", color: "D73A4A", description: "Correction of a defect" },
  { name: "tech", color: "5319E7", description: "Technical work, no functional impact" },
  { name: "prio:0", color: "B60205", description: "Urgent: before everything else" },
  { name: "prio:1", color: "000000", description: "To do first" },
  { name: "prio:2", color: "555555", description: "Important, not blocking" },
  { name: "prio:3", color: "AAAAAA", description: "Desirable, later" },
  { name: "fire", color: "D93F0B", description: "To be served: the issue enters the rail" },
  { name: "model:opus", color: "5319E7", description: "The cook of this ticket runs on opus" },
  { name: "model:sonnet", color: "5319E7", description: "The cook of this ticket runs on sonnet" },
  { name: "model:haiku", color: "5319E7", description: "The cook of this ticket runs on haiku" },
  { name: "effort:low", color: "1D76DB", description: "The cook of this ticket runs at low effort" },
  { name: "effort:medium", color: "1D76DB", description: "The cook of this ticket runs at medium effort" },
  { name: "effort:high", color: "1D76DB", description: "The cook of this ticket runs at high effort" },
  { name: "effort:xhigh", color: "1D76DB", description: "The cook of this ticket runs at xhigh effort" },
  { name: "effort:max", color: "1D76DB", description: "The cook of this ticket runs at max effort" },
  { name: "epic", color: "3E4B9E", description: "Groups other tickets: it is split, never cooked itself" },
  { name: "served-elsewhere", color: "6E7781", description: "This box does not serve the ticket: another box serves it" },
  { name: "taken", color: "0052CC", description: "A cook holds the ticket" },
  { name: "in-pass", color: "0052CC", description: "The delivery of the ticket is being judged" },
  { name: "parked", color: "C5DEF5", description: "Waits for someone: who, for what, until when (a date or a fact) — nothing takes it before" },
  { name: "chef-todo", color: "B60205", description: "Parked for the chef: a card in the chef's to-do list waits on this ticket" },
  { name: "idea", color: "C2E0C6", description: "An idea in reserve, not a request: the manager never reads it" },
  { name: "horizon:1", color: "1D76DB", description: "Direction of the product: autonomy now" },
  { name: "horizon:2", color: "1D76DB", description: "Direction of the product: humans as stations" },
  { name: "horizon:3", color: "1D76DB", description: "Direction of the product: any project run on its own" },
  { name: "kitchen-board", color: "BFD4F2", description: "The former board issue of the kitchen: never a card" },
];

const COMMANDS_OF_REPOSITORY = join(import.meta.dirname, "..", "..", "commands");
const URL_OF_THE_PR = "https://github.com/benomite/calculus/pull/1";

function trial(t: TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "brigade-plugin-init-")));
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

  // L'app ouvre le projet : son plugin y est posé, devant un `claude` doublure qui accepte tout.
  const launch: Launch = async (command, args, here) => {
    if (command !== "claude-doublure") return launchReally(env, 10_000)(command, args, here);
    return args[1] === "list" ? { code: 0, sortie: "[]", erreur: "" } : { code: 0, sortie: "✔ done", erreur: "" };
  };
  const marketplace = join(root, "config", "plugin-app");
  const open = () => holdThePluginApp({ lancer: launch, claude: "claude-doublure", marketplace, commandes: COMMANDS_OF_REPOSITORY, versionDeLApp: "1.2.3", dire: () => {} }).suivre([{ nom: "calculus", dossier: folder }]);

  // Ce que `/brigade:init` joue : le script que la commande posée nomme, depuis le dossier du projet.
  const initialize = (...args: string[]) => {
    const command = readFileSync(join(marketplace, "commands", "init.md"), "utf8");
    const script = /pr-de-setup\.ts" "([^"]+)"/.exec(command)?.[1];
    assert.ok(script !== undefined && script.startsWith(marketplace), `the command names its script: ${script}`);
    return execFileSync("bash", [script, ...args], { cwd: folder, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  };
  const callsOfGh = () => readFileSync(env.GH_LOG, "utf8").trim().split("\n");
  const labelsOfRepository = (...names: string[]) => writeFileSync(env.GH_LABELS, names.map((n) => `${n}\n`).join(""));
  return { git, origin, dossier: folder, ouvrir: open, initialiser: initialize, appelsDeGh: callsOfGh, labelsDuDepot: labelsOfRepository };
}

test("un dépôt neuf ouvert par l'app se prépare par /brigade:init : les labels posés, les bindings et les gates dans une PR, rien dans le dossier de l'utilisateur", { skip: WITHOUT_POSIX }, async (t) => {
  const { git, origin, dossier: folder, ouvrir: open, initialiser: initialize, appelsDeGh: callsOfGh } = trial(t);
  await open();

  const output = initialize("--test", "true", "--install", "true", "--zones", "`src/`");

  assert.equal(output.trim().split("\n").at(-1), `pr ${URL_OF_THE_PR}`);
  // Tous les labels du catalogue, avec leur description anglaise.
  const creations = callsOfGh().filter((call) => call.startsWith("label create "));
  assert.deepEqual(creations.map((call) => /^label create (\S+) /.exec(call)?.[1]), ETIQUETTES.map(({ name }) => name));
  for (const { name, color, description } of ETIQUETTES) assert.ok(creations.includes(`label create ${name} --color ${color} --description ${description}`), name);
  assert.deepEqual(callsOfGh().filter((call) => call.startsWith("label edit ")), []);
  assert.match(callsOfGh().find((a) => a.startsWith("pr create")) ?? "", /^pr create --base main --head brigade\/init /);

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

test("/brigade:init renomme l'ancien label hors-cuisine en served-elsewhere, sans rien supprimer", { skip: WITHOUT_POSIX }, async (t) => {
  const { ouvrir: open, initialiser: initialize, appelsDeGh: callsOfGh, labelsDuDepot: labelsOfRepository } = trial(t);
  await open();
  labelsOfRepository("hors-cuisine", "fire");

  initialize("--test", "true");

  const calls = callsOfGh();
  assert.ok(calls.includes("label edit hors-cuisine --name served-elsewhere"));
  assert.equal(calls.filter((a) => a.startsWith("label delete")).length, 0);
});

test("/brigade:init rejoué sur un dépôt qui porte déjà served-elsewhere ne le supprime ni ne le renomme", { skip: WITHOUT_POSIX }, async (t) => {
  const { ouvrir: open, initialiser: initialize, appelsDeGh: callsOfGh, labelsDuDepot: labelsOfRepository } = trial(t);
  await open();
  labelsOfRepository("served-elsewhere", "fire");

  initialize("--test", "true");

  const calls = callsOfGh();
  assert.equal(calls.filter((a) => a.startsWith("label delete") || a.includes("--name")).length, 0);
});

test("/brigade:init corrige la description d'un label déjà là (repli label edit)", { skip: WITHOUT_POSIX }, async (t) => {
  const { ouvrir: open, initialiser: initialize, appelsDeGh: callsOfGh, labelsDuDepot: labelsOfRepository } = trial(t);
  await open();
  labelsOfRepository("fix");

  initialize("--test", "true");

  const fix = ETIQUETTES.find(({ name }) => name === "fix");
  assert.ok(callsOfGh().includes(`label edit fix --description ${fix?.description}`));
});

test("rejoué une fois la PR mergée, /brigade:init ne propose rien : la branche d'intégration porte déjà tout", { skip: WITHOUT_POSIX }, async (t) => {
  const { git, origin, dossier: folder, ouvrir: open, initialiser: initialize, appelsDeGh: callsOfGh } = trial(t);
  await open();
  initialize("--test", "true");
  git("--git-dir", origin, "update-ref", "refs/heads/main", "brigade/init");

  const output = initialize("--test", "true");

  assert.equal(output.trim(), "unchanged");
  assert.equal(callsOfGh().filter((call) => call.startsWith("pr create")).length, 1);
  assert.equal(git("-C", folder, "worktree", "list").trim().split("\n").length, 1);
});

test("sans commande de test, /brigade:init n'écrit rien : une gate qui ne lance rien serait un faux vert", { skip: WITHOUT_POSIX }, async (t) => {
  const { origin, ouvrir: open, initialiser: initialize, git } = trial(t);
  await open();

  assert.throws(() => initialize(), (error: { status?: number; stderr?: string }) => error.status === 64 && /--test is required/.test(error.stderr ?? ""));
  assert.equal(git("--git-dir", origin, "branch", "--list", "brigade/init"), "");
});

test("le catalogue que lit /brigade:init (labels.tsv) est celui de l'ancien runtime (etiquettes.ts), ligne pour ligne", () => {
  const tsv = readFileSync(join(import.meta.dirname, "..", "src", "plugin", "labels.tsv"), "utf8");
  assert.equal(tsv, ETIQUETTES.map((e) => `${e.name}\t${e.color}\t${e.description}\n`).join(""));
});
