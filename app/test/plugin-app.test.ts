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
import type { Projet } from "../src/config.ts";
import { COMMANDES, ESPACE, PROPRES, SCRIPT_INIT, ID, lancerVraiment, MARKETPLACE, poserLeMarketplace, REGLAGES_LOCAUX, sansPluginApp, tenirLePluginApp, versionDuPlugin, type Lancer } from "../src/plugin-app.ts";

const COMMANDES_DU_DEPOT = join(import.meta.dirname, "..", "..", "commands");
const CLAUDE = "claude-doublure";
const git = lancerVraiment(process.env, 10_000);

type Installe = { id: string; scope: string; version: string; projectPath: string };

// Un `claude` doublure : son registre, ses appels, et ce qu'il écrit dans le dossier où il installe.
function doublure() {
  const installes: Installe[] = [];
  const appels: { args: string[]; dossier: string | undefined }[] = [];
  let marketplace: string | undefined;
  let enPanne = false;
  const reglages = (dossier: string, poser: (actives: Record<string, boolean>) => void) => {
    const chemin = join(dossier, REGLAGES_LOCAUX);
    const lus = existsSync(chemin) ? (JSON.parse(readFileSync(chemin, "utf8")) as { enabledPlugins?: Record<string, boolean> }) : {};
    const actives = lus.enabledPlugins ?? {};
    poser(actives);
    mkdirSync(join(dossier, ".claude"), { recursive: true });
    writeFileSync(chemin, JSON.stringify({ ...lus, enabledPlugins: actives }, null, 2));
  };
  const lancer: Lancer = async (commande, args, dossier) => {
    if (commande !== CLAUDE) return git(commande, args, dossier);
    appels.push({ args: [...args], dossier });
    if (enPanne) return { code: 1, sortie: "", erreur: "claude: not logged in\n" };
    const [, geste, ...reste] = args;
    const ici = dossier === undefined ? "" : realpathSync(dossier);
    const publiee = () => (JSON.parse(readFileSync(join(marketplace ?? "", ".claude-plugin", "plugin.json"), "utf8")) as { version: string }).version;
    const local = installes.find(({ id, scope, projectPath }) => id === ID && scope === "local" && projectPath === ici);
    if (geste === "marketplace" && reste[0] === "add") marketplace = reste[1];
    else if (geste === "list") return { code: 0, sortie: JSON.stringify(installes), erreur: "" };
    else if (geste === "install") {
      installes.push({ id: ID, scope: "local", version: publiee(), projectPath: ici });
      reglages(ici, (actives) => (actives[ID] = true));
    } else if (geste === "update" && local !== undefined) local.version = publiee();
    else if (geste === "uninstall" && local !== undefined) {
      installes.splice(installes.indexOf(local), 1);
      reglages(ici, (actives) => delete actives[ID]);
    } else return { code: 1, sortie: "", erreur: `unexpected: ${args.join(" ")}` };
    return { code: 0, sortie: "✔ done", erreur: "" };
  };
  return { lancer, installes, appels, marketplace: () => marketplace, panne: (oui: boolean) => void (enPanne = oui) };
}

function essai(t: TestContext) {
  const racine = mkdtempSync(join(tmpdir(), "brigade-plugin-app-"));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const clone = (nom: string): Projet => {
    const dossier = join(racine, nom);
    mkdirSync(dossier);
    execFileSync("git", ["init", "-q", dossier]);
    writeFileSync(join(dossier, "README.md"), "x\n");
    execFileSync("git", ["-C", dossier, "add", "."]);
    execFileSync("git", ["-C", dossier, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "x"]);
    return { nom, dossier: realpathSync(dossier) };
  };
  const claude = doublure();
  const dits: string[] = [];
  const marketplace = join(racine, "config", "plugin-app");
  const plugin = (versionDeLApp: string, commandes = COMMANDES_DU_DEPOT) => tenirLePluginApp({ lancer: claude.lancer, claude: CLAUDE, marketplace, commandes, versionDeLApp, dire: (ligne) => void dits.push(ligne) });
  const statut = (projet: Projet) => execFileSync("git", ["-C", projet.dossier, "status", "--porcelain", "--untracked-files=all"], { encoding: "utf8" });
  return { racine, clone, claude, dits, marketplace, plugin, statut };
}

test("ouvrir un projet y installe brigade-app en scope local, et git status n'en montre rien", async (t) => {
  const { clone, claude, plugin, marketplace, statut } = essai(t);
  const calculus = clone("calculus");

  await plugin("1.2.3").suivre([calculus]);

  assert.equal(claude.marketplace(), marketplace);
  assert.deepEqual(claude.installes, [{ id: "brigade-app@brigade-app", scope: "local", version: "1.2.3", projectPath: calculus.dossier }]);
  assert.deepEqual(claude.appels.at(-1), { args: ["plugin", "install", "brigade-app@brigade-app", "--scope", "local"], dossier: calculus.dossier });
  assert.deepEqual(JSON.parse(readFileSync(join(calculus.dossier, REGLAGES_LOCAUX), "utf8")), { enabledPlugins: { "brigade-app@brigade-app": true } });
  // Rien de nouveau pour git, et rien qui se commite : l'exclusion est dans le clone, pas dans un .gitignore.
  assert.equal(statut(calculus), "");
  assert.equal(existsSync(join(calculus.dossier, ".gitignore")), false);
  assert.match(readFileSync(join(calculus.dossier, ".git", "info", "exclude"), "utf8"), /^\/\.claude\/settings\.local\.json$/m);
});

test("le marketplace de l'app ne porte que /brigade:dev et /brigade:ask, copiées de commands/, et son propre /brigade:init — aucun rôle V1", async (t) => {
  const { clone, plugin, marketplace } = essai(t);

  await plugin("1.2.3").suivre([clone("calculus")]);

  const manifeste = JSON.parse(readFileSync(join(marketplace, ".claude-plugin", "plugin.json"), "utf8"));
  assert.equal(manifeste.name, "brigade");
  assert.equal(manifeste.name, ESPACE);
  assert.equal(manifeste.version, "1.2.3");
  assert.deepEqual(manifeste.commands, ["./commands/dev.md", "./commands/ask.md", "./commands/init.md"]);
  assert.equal(manifeste.agents, undefined);
  assert.deepEqual(readdirSync(join(marketplace, "commands")).sort(), ["ask.md", "dev.md", "init.md"]);
  for (const nom of COMMANDES) assert.equal(readFileSync(join(marketplace, "commands", nom), "utf8"), readFileSync(join(COMMANDES_DU_DEPOT, nom), "utf8"));
  // `/brigade:init` est celui de l'app, pas le V1 de commands/ : il nomme le script posé à côté, par son chemin, en
  // barres obliques — sous Windows aussi, où `bash` est celui de Git (#2608).
  const script = join(marketplace, "scripts", SCRIPT_INIT);
  assert.equal(readFileSync(script, "utf8"), readFileSync(join(PROPRES, SCRIPT_INIT), "utf8"));
  assert.equal(readFileSync(join(marketplace, "commands", "init.md"), "utf8"), readFileSync(join(PROPRES, "init.md"), "utf8").replaceAll("@SCRIPT@", script.replaceAll("\\", "/")));
  assert.notEqual(readFileSync(join(marketplace, "commands", "init.md"), "utf8"), readFileSync(join(COMMANDES_DU_DEPOT, "init.md"), "utf8"));
  const catalogue = JSON.parse(readFileSync(join(marketplace, ".claude-plugin", "marketplace.json"), "utf8"));
  assert.equal(catalogue.name, MARKETPLACE);
  assert.deepEqual(catalogue.plugins.map(({ name, source, version }: { name: string; source: string; version: string }) => ({ name, source, version })), [{ name: "brigade-app", source: "./", version: "1.2.3" }]);
});

test("un projet déjà à la version portée n'est pas réinstallé, et ne se relit pas pendant ce lancement", async (t) => {
  const { clone, claude, plugin } = essai(t);
  const calculus = clone("calculus");
  await plugin("1.2.3").suivre([calculus]);

  const relance = plugin("1.2.3");
  claude.appels.length = 0;
  await relance.suivre([calculus]);
  assert.deepEqual(claude.appels.map(({ args }) => args[1]), ["marketplace", "list"]);

  claude.appels.length = 0;
  await relance.suivre([calculus]);
  assert.deepEqual(claude.appels, []);
});

test("après une mise à jour de l'app, la version installée est celle de la nouvelle app", async (t) => {
  const { clone, claude, plugin, marketplace } = essai(t);
  const calculus = clone("calculus");
  const parade = clone("parade");
  await plugin("0.20261101.120000+gaaaaaaa").suivre([calculus, parade]);

  await plugin("0.20261104.090000+gbbbbbbb").suivre([calculus, parade]);

  assert.deepEqual(claude.installes.map(({ version }) => version), ["0.20261104.090000+gbbbbbbb", "0.20261104.090000+gbbbbbbb"]);
  assert.deepEqual(claude.appels.filter(({ args }) => args[1] === "update").map(({ args, dossier }) => [args.join(" "), dossier]), [
    ["plugin update brigade-app@brigade-app --scope local", calculus.dossier],
    ["plugin update brigade-app@brigade-app --scope local", parade.dossier],
  ]);
  assert.equal(JSON.parse(readFileSync(join(marketplace, ".claude-plugin", "plugin.json"), "utf8")).version, "0.20261104.090000+gbbbbbbb");
});

test("la version portée : celle de l'app installée ; depuis le dépôt, l'empreinte des deux commandes", (t) => {
  const { racine } = essai(t);
  const commandes = join(racine, "commands");
  mkdirSync(commandes);
  for (const nom of COMMANDES) writeFileSync(join(commandes, nom), `# ${nom}\n`);

  assert.equal(versionDuPlugin("0.20261104.090000+gbbbbbbb", commandes), "0.20261104.090000+gbbbbbbb");
  const avant = versionDuPlugin("0.0.0", commandes);
  assert.match(avant, /^0\.0\.0-[0-9a-f]{12}$/);
  assert.equal(versionDuPlugin("0.0.0", commandes), avant);
  writeFileSync(join(commandes, "ask.md"), "# ask.md, changée\n");
  assert.notEqual(versionDuPlugin("0.0.0", commandes), avant);
});

test("retirer le projet en désinstalle brigade-app, et rien d'autre : le plugin V1 et les autres projets restent", async (t) => {
  const { clone, claude, plugin, statut } = essai(t);
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
  assert.deepEqual(JSON.parse(readFileSync(join(calculus.dossier, REGLAGES_LOCAUX), "utf8")), { enabledPlugins: {} });
  assert.equal(statut(calculus), "");
  // Le marketplace de l'app n'est pas retiré : Claude Code désinstallerait le plugin de tous les projets.
  assert.equal(claude.appels.some(({ args }) => args.includes("remove")), false);

  // Un projet où l'app n'a rien installé : rien n'est désinstallé.
  claude.appels.length = 0;
  await pluginApp.retirer(calculus);
  assert.deepEqual(claude.appels.map(({ args }) => args[1]), ["list"]);
});

test("un clone qui ignore déjà les réglages locaux garde son exclude ; un dossier hors git reçoit le plugin quand même", async (t) => {
  const { racine, clone, claude, plugin, statut } = essai(t);
  const calculus = clone("calculus");
  writeFileSync(join(calculus.dossier, ".gitignore"), ".claude/\n");
  execFileSync("git", ["-C", calculus.dossier, "add", ".gitignore"]);
  const exclude = readFileSync(join(calculus.dossier, ".git", "info", "exclude"), "utf8");
  const brouillon: Projet = { nom: "brouillon", dossier: join(racine, "brouillon") };
  mkdirSync(brouillon.dossier);

  await plugin("1.2.3").suivre([calculus, brouillon]);

  assert.equal(readFileSync(join(calculus.dossier, ".git", "info", "exclude"), "utf8"), exclude);
  assert.equal(statut(calculus), "A  .gitignore\n");
  assert.deepEqual(claude.installes.map(({ projectPath }) => projectPath), [calculus.dossier, realpathSync(brouillon.dossier)]);
});

test("un projet refusé ou sans dossier ne reçoit rien ; un claude en panne n'installe rien, le dit, et l'ouverture suivante réessaie", async (t) => {
  const { racine, clone, claude, plugin, dits } = essai(t);
  const pluginApp = plugin("1.2.3");

  await pluginApp.suivre([{ nom: "parti", dossier: join(racine, "parti") }, { nom: "refuse", dossier: racine, refus: "folder not found" }]);
  assert.deepEqual(claude.appels, []);

  const calculus = clone("calculus");
  claude.panne(true);
  await pluginApp.suivre([calculus]);
  assert.deepEqual(claude.installes, []);
  assert.deepEqual(dits, ["brigade: the app's plugin marketplace was not added to Claude Code — claude: not logged in"]);

  claude.panne(false);
  await pluginApp.suivre([calculus]);
  assert.deepEqual(claude.installes.map(({ projectPath }) => projectPath), [calculus.dossier]);
});

test("poser le marketplace remet une commande changée à celle que l'app porte, et laisse le reste tel quel", (t) => {
  const { marketplace } = essai(t);
  poserLeMarketplace(marketplace, COMMANDES_DU_DEPOT, "1.2.3");
  const manifeste = join(marketplace, ".claude-plugin", "plugin.json");
  writeFileSync(join(marketplace, "commands", "dev.md"), "changée à la main\n");
  const avant = readFileSync(manifeste, "utf8");

  poserLeMarketplace(marketplace, COMMANDES_DU_DEPOT, "1.2.3");

  assert.equal(readFileSync(manifeste, "utf8"), avant);
  assert.equal(readFileSync(join(marketplace, "commands", "dev.md"), "utf8"), readFileSync(join(COMMANDES_DU_DEPOT, "dev.md"), "utf8"));
});

test("une commande lancée pour le plugin a son entrée fermée : elle n'attend rien de ce qu'on ne lui tapera pas", async () => {
  // `cat` lit son entrée jusqu'au bout : ouverte, il attendrait le délai, et le rendu ne serait pas un succès.
  const rendu = await lancerVraiment(process.env, 1_500)("cat", []);
  assert.deepEqual(rendu, { code: 0, sortie: "", erreur: "" });
});

test("lancée avec un `claude` de remplacement, l'app ne pose ni ne retire le plugin nulle part, et le dit une fois", async (t) => {
  const { clone, statut } = essai(t);
  const calculus = clone("calculus");
  const dits: string[] = [];
  const pluginApp = sansPluginApp((ligne) => dits.push(ligne));

  await pluginApp.suivre([calculus]);
  await pluginApp.retirer(calculus);

  assert.equal(existsSync(join(calculus.dossier, REGLAGES_LOCAUX)), false);
  assert.equal(statut(calculus), "");
  assert.deepEqual(dits, ["brigade: BRIGADE_CLAUDE_BIN is set — the app's plugin (/brigade:dev, /brigade:ask, /brigade:init) is installed in no project"]);
});
