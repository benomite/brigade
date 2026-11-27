// Le plugin de l'app (#2160) : ouvrir un projet y installe `brigade-app` en scope local — `/brigade:dev` et
// `/brigade:ask`, rien d'autre —, sans que `git status` en montre rien ; une app mise à jour le met à sa version ;
// retirer le projet l'en désinstalle, et ne touche à rien d'autre. Éprouvé contre le vrai `git`, sur des clones
// d'essai, et devant un `claude` doublure qui tient son registre comme le vrai (relevé sur claude 2.1.300) :
// `plugin list --json`, et `.claude/settings.local.json` écrit dans le dossier où il s'installe.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Project } from "../src/config.ts";
import { COMMANDS, SPACE, PLACES_PAR_DEFAULT, PR_OF_SETUP, OWN, SCRIPT_INIT, ID, launchReally, MARKETPLACE, setTheMarketplace, SETTINGS_LOCAL, withoutPluginApp, holdThePluginApp, versionOfPlugin, type Launch } from "../src/plugin-app.ts";

const COMMANDS_OF_REPOSITORY = join(import.meta.dirname, "..", "..", "commands");
const CLAUDE = "claude-doublure";
const git = launchReally(process.env, 10_000);

type Installs = { id: string; scope: string; version: string; projectPath: string };

// Un `claude` doublure : son registre, ses appels, et ce qu'il écrit dans le dossier où il installe.
function standIn() {
  const installed: Installs[] = [];
  const calls: { args: string[]; dossier: string | undefined }[] = [];
  let marketplace: string | undefined;
  let enOutage = false;
  const settings = (folder: string, set: (active: Record<string, boolean>) => void) => {
    const path = join(folder, SETTINGS_LOCAL);
    const readOnes = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as { enabledPlugins?: Record<string, boolean> }) : {};
    const active = readOnes.enabledPlugins ?? {};
    set(active);
    mkdirSync(join(folder, ".claude"), { recursive: true });
    writeFileSync(path, JSON.stringify({ ...readOnes, enabledPlugins: active }, null, 2));
  };
  const launch: Launch = async (command, args, folder) => {
    if (command !== CLAUDE) return git(command, args, folder);
    calls.push({ args: [...args], dossier: folder });
    if (enOutage) return { code: 1, sortie: "", erreur: "claude: not logged in\n" };
    const [, action, ...remains] = args;
    const here = folder === undefined ? "" : realpathSync(folder);
    const published = () => (JSON.parse(readFileSync(join(marketplace ?? "", ".claude-plugin", "plugin.json"), "utf8")) as { version: string }).version;
    const local = installed.find(({ id, scope, projectPath }) => id === ID && scope === "local" && projectPath === here);
    if (action === "marketplace" && remains[0] === "add") marketplace = remains[1];
    else if (action === "list") return { code: 0, sortie: JSON.stringify(installed), erreur: "" };
    else if (action === "install") {
      installed.push({ id: ID, scope: "local", version: published(), projectPath: here });
      settings(here, (active) => (active[ID] = true));
    } else if (action === "update" && local !== undefined) local.version = published();
    else if (action === "uninstall" && local !== undefined) {
      installed.splice(installed.indexOf(local), 1);
      settings(here, (active) => delete active[ID]);
    } else return { code: 1, sortie: "", erreur: `unexpected: ${args.join(" ")}` };
    return { code: 0, sortie: "✔ done", erreur: "" };
  };
  return { lancer: launch, installes: installed, appels: calls, marketplace: () => marketplace, panne: (yes: boolean) => void (enOutage = yes) };
}

function trial(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "brigade-plugin-app-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const clone = (name: string): Project => {
    const folder = join(root, name);
    mkdirSync(folder);
    execFileSync("git", ["init", "-q", folder]);
    writeFileSync(join(folder, "README.md"), "x\n");
    execFileSync("git", ["-C", folder, "add", "."]);
    execFileSync("git", ["-C", folder, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "x"]);
    return { nom: name, dossier: realpathSync(folder) };
  };
  const claude = standIn();
  const saidOnes: string[] = [];
  const marketplace = join(root, "config", "plugin-app");
  const plugin = (versionOfTheApp: string, commands = COMMANDS_OF_REPOSITORY) => holdThePluginApp({ lancer: claude.lancer, claude: CLAUDE, marketplace, commandes: commands, versionDeLApp: versionOfTheApp, dire: (line) => void saidOnes.push(line) });
  const status = (project: Project) => execFileSync("git", ["-C", project.dossier, "status", "--porcelain", "--untracked-files=all"], { encoding: "utf8" });
  return { racine: root, clone, claude, dits: saidOnes, marketplace, plugin, statut: status };
}

test("ouvrir un projet y installe brigade-app en scope local, et git status n'en montre rien", async (t) => {
  const { clone, claude, plugin, marketplace, statut: status } = trial(t);
  const calculus = clone("calculus");

  await plugin("1.2.3").suivre([calculus]);

  assert.equal(claude.marketplace(), marketplace);
  assert.deepEqual(claude.installes, [{ id: "brigade-app@brigade-app", scope: "local", version: "1.2.3", projectPath: calculus.dossier }]);
  assert.deepEqual(claude.appels.at(-1), { args: ["plugin", "install", "brigade-app@brigade-app", "--scope", "local"], dossier: calculus.dossier });
  assert.deepEqual(JSON.parse(readFileSync(join(calculus.dossier, SETTINGS_LOCAL), "utf8")), { enabledPlugins: { "brigade-app@brigade-app": true } });
  // Rien de nouveau pour git, et rien qui se commite : l'exclusion est dans le clone, pas dans un .gitignore.
  assert.equal(status(calculus), "");
  assert.equal(existsSync(join(calculus.dossier, ".gitignore")), false);
  assert.match(readFileSync(join(calculus.dossier, ".git", "info", "exclude"), "utf8"), /^\/\.claude\/settings\.local\.json$/m);
});

test("le marketplace de l'app ne porte que /brigade:dev et /brigade:ask, copiées de commands/, et son propre /brigade:init — aucun rôle V1", async (t) => {
  const { clone, plugin, marketplace } = trial(t);

  await plugin("1.2.3").suivre([clone("calculus")]);

  const manifest = JSON.parse(readFileSync(join(marketplace, ".claude-plugin", "plugin.json"), "utf8"));
  assert.equal(manifest.name, "brigade");
  assert.equal(manifest.name, SPACE);
  assert.equal(manifest.version, "1.2.3");
  assert.deepEqual(manifest.commands, ["./commands/dev.md", "./commands/ask.md", "./commands/init.md"]);
  assert.equal(manifest.agents, undefined);
  assert.deepEqual(readdirSync(join(marketplace, "commands")).sort(), ["ask.md", "dev.md", "init.md"]);
  for (const name of COMMANDS) assert.equal(readFileSync(join(marketplace, "commands", name), "utf8"), readFileSync(join(COMMANDS_OF_REPOSITORY, name), "utf8"));
  // `/brigade:init` est celui de l'app, pas le V1 de commands/ : il nomme le script posé à côté, par son chemin, en
  // barres obliques — sous Windows aussi, où `bash` est celui de Git (#2608).
  const script = join(marketplace, "scripts", SCRIPT_INIT);
  assert.equal(readFileSync(script, "utf8"), readFileSync(join(OWN, SCRIPT_INIT), "utf8"));
  // Il lance le script par la commande du runtime qui pose la carte de sa PR dans le TODO (#3169), avec le `node` donné.
  const prOfSetup = join(PLACES_PAR_DEFAULT.runtime, ...PR_OF_SETUP);
  assert.ok(existsSync(prOfSetup), prOfSetup);
  assert.equal(
    readFileSync(join(marketplace, "commands", "init.md"), "utf8"),
    readFileSync(join(OWN, "init.md"), "utf8").replaceAll("@SCRIPT@", script.replaceAll("\\", "/")).replaceAll("@SETUP_PR@", prOfSetup.replaceAll("\\", "/")).replaceAll("@NODE@", "node"),
  );
  assert.ok(readFileSync(join(marketplace, "commands", "init.md"), "utf8").includes(`"node" "${prOfSetup.replaceAll("\\", "/")}" "${script.replaceAll("\\", "/")}" --test`));
  assert.notEqual(readFileSync(join(marketplace, "commands", "init.md"), "utf8"), readFileSync(join(COMMANDS_OF_REPOSITORY, "init.md"), "utf8"));
  const catalog = JSON.parse(readFileSync(join(marketplace, ".claude-plugin", "marketplace.json"), "utf8"));
  assert.equal(catalog.name, MARKETPLACE);
  assert.deepEqual(catalog.plugins.map(({ name, source, version }: { name: string; source: string; version: string }) => ({ name, source, version })), [{ name: "brigade-app", source: "./", version: "1.2.3" }]);
});

test("un projet déjà à la version portée n'est pas réinstallé, et ne se relit pas pendant ce lancement", async (t) => {
  const { clone, claude, plugin } = trial(t);
  const calculus = clone("calculus");
  await plugin("1.2.3").suivre([calculus]);

  const relaunch = plugin("1.2.3");
  claude.appels.length = 0;
  await relaunch.suivre([calculus]);
  assert.deepEqual(claude.appels.map(({ args }) => args[1]), ["marketplace", "list"]);

  claude.appels.length = 0;
  await relaunch.suivre([calculus]);
  assert.deepEqual(claude.appels, []);
});

test("après une mise à jour de l'app, la version installée est celle de la nouvelle app", async (t) => {
  const { clone, claude, plugin, marketplace } = trial(t);
  const calculus = clone("calculus");
  const parade = clone("parade");
  await plugin("0.20261101.120000+gaaaaaaa").suivre([calculus, parade]);

  await plugin("0.20261104.090000+gbbbbbbb").suivre([calculus, parade]);

  assert.deepEqual(claude.installes.map(({ version }) => version), ["0.20261104.090000+gbbbbbbb", "0.20261104.090000+gbbbbbbb"]);
  assert.deepEqual(claude.appels.filter(({ args }) => args[1] === "update").map(({ args, dossier: folder }) => [args.join(" "), folder]), [
    ["plugin update brigade-app@brigade-app --scope local", calculus.dossier],
    ["plugin update brigade-app@brigade-app --scope local", parade.dossier],
  ]);
  assert.equal(JSON.parse(readFileSync(join(marketplace, ".claude-plugin", "plugin.json"), "utf8")).version, "0.20261104.090000+gbbbbbbb");
});

test("la version portée : celle de l'app installée ; depuis le dépôt, l'empreinte des deux commandes", (t) => {
  const { racine: root } = trial(t);
  const commands = join(root, "commands");
  mkdirSync(commands);
  for (const name of COMMANDS) writeFileSync(join(commands, name), `# ${name}\n`);

  assert.equal(versionOfPlugin("0.20261104.090000+gbbbbbbb", commands), "0.20261104.090000+gbbbbbbb");
  const before = versionOfPlugin("0.0.0", commands);
  assert.match(before, /^0\.0\.0-[0-9a-f]{12}$/);
  assert.equal(versionOfPlugin("0.0.0", commands), before);
  writeFileSync(join(commands, "ask.md"), "# ask.md, changée\n");
  assert.notEqual(versionOfPlugin("0.0.0", commands), before);
});

test("retirer le projet en désinstalle brigade-app, et rien d'autre : le plugin V1 et les autres projets restent", async (t) => {
  const { clone, claude, plugin, statut: status } = trial(t);
  const calculus = clone("calculus");
  const parade = clone("parade");
  const pluginApp = plugin("1.2.3");
  await pluginApp.suivre([calculus, parade]);
  // Un plugin `brigade` V1 installé à la main dans le même dossier.
  const v1 = { id: "brigade@brigade", scope: "local", version: "0.17.0", projectPath: calculus.dossier };
  claude.installes.push(v1);

  await pluginApp.retirer(calculus);

  assert.deepEqual(claude.appels.at(-1), { args: ["plugin", "uninstall", "brigade-app@brigade-app", "--scope", "local"], dossier: calculus.dossier });
  assert.deepEqual(claude.installes, [{ id: ID, scope: "local", version: "1.2.3", projectPath: parade.dossier }, v1]);
  assert.deepEqual(JSON.parse(readFileSync(join(calculus.dossier, SETTINGS_LOCAL), "utf8")), { enabledPlugins: {} });
  assert.equal(status(calculus), "");
  // Le marketplace de l'app n'est pas retiré : Claude Code désinstallerait le plugin de tous les projets.
  assert.equal(claude.appels.some(({ args }) => args.includes("remove")), false);

  // Un projet où l'app n'a rien installé : rien n'est désinstallé.
  claude.appels.length = 0;
  await pluginApp.retirer(calculus);
  assert.deepEqual(claude.appels.map(({ args }) => args[1]), ["list"]);
});

test("un clone qui ignore déjà les réglages locaux garde son exclude ; un dossier hors git reçoit le plugin quand même", async (t) => {
  const { racine: root, clone, claude, plugin, statut: status } = trial(t);
  const calculus = clone("calculus");
  writeFileSync(join(calculus.dossier, ".gitignore"), ".claude/\n");
  execFileSync("git", ["-C", calculus.dossier, "add", ".gitignore"]);
  const exclude = readFileSync(join(calculus.dossier, ".git", "info", "exclude"), "utf8");
  const draft: Project = { nom: "brouillon", dossier: join(root, "brouillon") };
  mkdirSync(draft.dossier);

  await plugin("1.2.3").suivre([calculus, draft]);

  assert.equal(readFileSync(join(calculus.dossier, ".git", "info", "exclude"), "utf8"), exclude);
  assert.equal(status(calculus), "A  .gitignore\n");
  assert.deepEqual(claude.installes.map(({ projectPath }) => projectPath), [calculus.dossier, realpathSync(draft.dossier)]);
});

test("un projet refusé ou sans dossier ne reçoit rien ; un claude en panne n'installe rien, le dit, et l'ouverture suivante réessaie", async (t) => {
  const { racine: root, clone, claude, plugin, dits: saidOnes } = trial(t);
  const pluginApp = plugin("1.2.3");

  await pluginApp.suivre([{ nom: "parti", dossier: join(root, "parti") }, { nom: "refuse", dossier: root, refus: "folder not found" }]);
  assert.deepEqual(claude.appels, []);

  const calculus = clone("calculus");
  claude.panne(true);
  await pluginApp.suivre([calculus]);
  assert.deepEqual(claude.installes, []);
  assert.deepEqual(saidOnes, ["brigade: the app's plugin marketplace was not added to Claude Code — claude: not logged in"]);

  claude.panne(false);
  await pluginApp.suivre([calculus]);
  assert.deepEqual(claude.installes.map(({ projectPath }) => projectPath), [calculus.dossier]);
});

test("poser le marketplace remet une commande changée à celle que l'app porte, et laisse le reste tel quel", (t) => {
  const { marketplace } = trial(t);
  setTheMarketplace(marketplace, COMMANDS_OF_REPOSITORY, "1.2.3");
  const manifest = join(marketplace, ".claude-plugin", "plugin.json");
  writeFileSync(join(marketplace, "commands", "dev.md"), "changée à la main\n");
  const before = readFileSync(manifest, "utf8");

  setTheMarketplace(marketplace, COMMANDS_OF_REPOSITORY, "1.2.3");

  assert.equal(readFileSync(manifest, "utf8"), before);
  assert.equal(readFileSync(join(marketplace, "commands", "dev.md"), "utf8"), readFileSync(join(COMMANDS_OF_REPOSITORY, "dev.md"), "utf8"));
});

test("une commande lancée pour le plugin a son entrée fermée : elle n'attend rien de ce qu'on ne lui tapera pas", async () => {
  // `cat` lit son entrée jusqu'au bout : ouverte, il attendrait le délai, et le rendu ne serait pas un succès.
  const rendered = await launchReally(process.env, 1_500)("cat", []);
  assert.deepEqual(rendered, { code: 0, sortie: "", erreur: "" });
});

test("lancée avec un `claude` de remplacement, l'app ne pose ni ne retire le plugin nulle part, et le dit une fois", async (t) => {
  const { clone, statut: status } = trial(t);
  const calculus = clone("calculus");
  const saidOnes: string[] = [];
  const pluginApp = withoutPluginApp((line) => saidOnes.push(line));

  await pluginApp.suivre([calculus]);
  await pluginApp.retirer(calculus);

  assert.equal(existsSync(join(calculus.dossier, SETTINGS_LOCAL)), false);
  assert.equal(status(calculus), "");
  assert.deepEqual(saidOnes, ["brigade: BRIGADE_CLAUDE_BIN is set — the app's plugin (/brigade:dev, /brigade:ask, /brigade:init) is installed in no project"]);
});
