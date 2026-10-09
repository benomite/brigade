// L'installation de brigade dans un projet : ce que le dépôt et la machine
// doivent porter pour qu'un cook puisse y être lancé, vérifié d'un coup et sans
// rien lancer ; les labels créés ; le coût du setup mesuré ; la désinstallation.
import assert from "node:assert/strict";
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { desinstaller, InstallationRefusee, jugerTemporaire, LABELS, mesurerSetup, poserLabels, tenir, VARIABLES, verifier, type Constat } from "../src/installation.ts";
import { configRail } from "../src/alimenter.ts";
import { lireSeuils } from "../src/derive.ts";
import { lireReglages } from "../src/garde-fous.ts";
import { configManager } from "../src/manager.ts";
import { configPass } from "../src/pass.ts";
import { configReviewer } from "../src/reviewer.ts";
import { ConfigInvalide } from "../src/runtime.ts";
import { configStation } from "../src/station.ts";
import { prendreVerrou } from "../src/verrou.ts";
import { BASE, DEPOT, ENV_GIT, FAUX_CLAUDE, fauxGh, git, lancer, repertoireDuFichier, repertoireTemporaire, type FauxGh } from "./outils.ts";

const CLI = join(import.meta.dirname, "../src/installation-cli.ts");
const FAUX_SYSTEMCTL = join(import.meta.dirname, "aides/faux-systemctl.sh");
const FAUX_SETUP = join(import.meta.dirname, "aides/faux-setup.sh");
const PROJET = "calculus";
const GATES = ".claude/brigade/gates.sh";
const SETUP = ".claude/brigade/worktree-setup.sh";
// L'adresse de l'origine dans le gabarit : chaque copie y met la sienne.
const ORIGINE = "@ORIGINE@";
const LABELS_DU_DEPOT = `repos/${DEPOT}/labels?per_page=100`;

const bindings = (lignes: string[]) => ["# Le projet", "", "## Équipe multi-agents (plugin brigade)", "", ...lignes, "", "## Autre chose", "", "- **Dev local** : ailleurs"].join("\n");
const BINDINGS = bindings([
  `- **Branche d'intégration** : \`${BASE}\``,
  "- **Gates** : `.claude/brigade/gates.sh <WT>`",
  "- **Plafond des gates** : `75 s` de processeur",
  "- **Zones de fichiers** : `src/`, `docs/`",
  // Un binding dont la valeur tient en sous-liste.
  "- **Dev local** :",
  "  - **Serveur** : `npm run dev`",
]);

type Fichier = { contenu: string; executable?: boolean } | { lien: string };

// Ce que le dépôt du projet porte sur sa branche d'intégration. `null` : le
// fichier n'y est pas.
// `secrets` : les noms de secrets qu'il déclare.
type Porte = { bindings?: string | null; gates?: Fichier | null; setup?: Fichier | null; secrets?: string };

// Le dépôt d'un projet tel qu'il est poussé sur son origine, fabriqué une fois
// par fichier pour chaque chose qu'un test lui fait porter : chaque test en
// reçoit une copie, et copier coûte bien moins que rejouer `git`.
const gabarits = new Map<string, string>();
function gabarit(porte: Porte): string {
  const cle = JSON.stringify(porte);
  const connu = gabarits.get(cle);
  if (connu !== undefined) return connu;
  const racine = repertoireDuFichier("brigade-test-installation-", () => gabarits.clear());
  mkdirSync(join(racine, "clone"));
  const [origine, travail] = [join(racine, "origine.git"), join(racine, "travail")];
  git(racine, "init", "-q", "--bare", `--initial-branch=${BASE}`, origine);
  git(racine, "init", "-q", `--initial-branch=${BASE}`, travail);
  const fichiers: Record<string, Fichier | null> = {
    "CLAUDE.md": porte.bindings === null ? null : { contenu: porte.bindings ?? BINDINGS },
    [GATES]: porte.gates === undefined ? { contenu: "#!/usr/bin/env bash\nexit 0\n", executable: true } : porte.gates,
    [SETUP]: porte.setup === undefined ? { lien: FAUX_SETUP } : porte.setup,
    ".claude/brigade/secrets": porte.secrets === undefined ? null : { contenu: porte.secrets },
  };
  writeFileSync(join(travail, "LISEZMOI"), "le projet\n");
  for (const [chemin, fichier] of Object.entries(fichiers)) {
    if (fichier === null) continue;
    const cible = join(travail, chemin);
    mkdirSync(dirname(cible), { recursive: true });
    if ("lien" in fichier) symlinkSync(fichier.lien, cible);
    else {
      writeFileSync(cible, fichier.contenu);
      if (fichier.executable) chmodSync(cible, 0o755);
    }
  }
  git(travail, "add", ".");
  git(travail, "commit", "-q", "-m", "installe brigade");
  git(travail, "push", "-q", origine, BASE);
  // Le clone réservé : posé avant l'installation, il ne connaît pas encore ce
  // que l'origine porte.
  git(join(racine, "clone"), "init", "-q", `--initial-branch=${BASE}`);
  git(join(racine, "clone"), "remote", "add", "origin", ORIGINE);
  rmSync(travail, { recursive: true });
  gabarits.set(cle, racine);
  return racine;
}

// Un projet installé : son dépôt poussé sur l'origine, le clone réservé, le
// répertoire d'état, et l'environnement du service — celui que la commande lit.
function projet(t: TestContext, porte: Porte = {}) {
  const racine = repertoireTemporaire(t);
  cpSync(gabarit(porte), racine, { recursive: true });
  const [origine, clone] = [join(racine, "origine.git"), join(racine, "clone")];
  const config = join(clone, ".git/config");
  writeFileSync(config, readFileSync(config, "utf8").replaceAll(ORIGINE, origine));

  const etat = join(racine, "etat");
  mkdirSync(etat);
  const gh = fauxGh(t);
  gh.repondre(`repos/${DEPOT}`, { corps: { full_name: DEPOT } });
  gh.repondre(LABELS_DU_DEPOT, { corps: LABELS.map(({ name }) => ({ name })) });
  const env: Record<string, string> = {
    ...ENV_GIT,
    BRIGADE_STATE_DIR: etat,
    BRIGADE_PROJECT: PROJET,
    BRIGADE_GITHUB_REPO: DEPOT,
    BRIGADE_REPO_DIR: clone,
    BRIGADE_BASE_BRANCH: BASE,
    BRIGADE_MANAGER_MODEL: "sonnet",
    BRIGADE_MANAGER_EFFORT: "medium",
    BRIGADE_REVIEWER_MODEL: "sonnet",
    BRIGADE_REVIEWER_EFFORT: "medium",
    BRIGADE_GH_BIN: gh.bin,
    BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
    BRIGADE_SYSTEMCTL_BIN: FAUX_SYSTEMCTL,
    FAUX_SYSTEMCTL_UNITES: `brigade@${PROJET}.service brigade-sauvegarde@${PROJET}.timer`,
    FAUX_SETUP: join(racine, "setup"),
    // Le répertoire temporaire de `claude` : celui du test, pas celui de la machine.
    CLAUDE_CODE_TMPDIR: racine,
  };
  return { origine, clone, etat, racine, gh, env };
}

const manques = (constats: Constat[]) => constats.filter((constat) => constat.etat === "manque").map((constat) => constat.texte);
const notes = (constats: Constat[]) => constats.filter((constat) => constat.etat === "note").map((constat) => constat.texte);
const sans = (env: Record<string, string>, ...variables: string[]) => Object.fromEntries(Object.entries(env).filter(([nom]) => !variables.includes(nom)));

describe("les variables obligatoires", () => {
  const lecteurs = [configRail, lireReglages, configStation, configPass, configReviewer, configManager, lireSeuils];
  const complet = Object.fromEntries(VARIABLES.map((variable) => [variable, { BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_BASE_BRANCH: BASE }[variable as string] ?? "sonnet"]));
  const calibre = { ...complet, BRIGADE_MANAGER_EFFORT: "low", BRIGADE_REVIEWER_EFFORT: "low" };

  test("la liste suffit au runtime : avec elles seules, aucun lecteur de configuration ne refuse", () => {
    for (const lecteur of lecteurs) lecteur(calibre);
  });

  test("chacune est exigée : sans elle, le runtime refuse de démarrer en la nommant", () => {
    // Ces deux-là sont exigées par le point d'entrée, avant tout lecteur.
    const duPointDEntree = ["BRIGADE_STATE_DIR", "BRIGADE_PROJECT"];
    for (const variable of VARIABLES.filter((nom) => !duPointDEntree.includes(nom))) {
      const refus = lecteurs.flatMap((lecteur) => {
        try {
          lecteur(sans(calibre, variable));
          return [];
        } catch (erreur) {
          assert.ok(erreur instanceof ConfigInvalide);
          return [erreur.message];
        }
      });
      assert.equal(refus.length, 1, variable);
      assert.match(refus[0] ?? "", new RegExp(variable));
    }
  });
});

describe("la vérification", () => {
  test("un projet installé est prêt : rien ne manque", async (t) => {
    const { env } = projet(t);

    const constats = await verifier(env);

    assert.deepEqual(manques(constats), []);
    assert.deepEqual(notes(constats), []);
  });

  test("elle ne lance ni cook ni setup, n'écrit rien sur GitHub et ne déplace rien dans le clone", async (t) => {
    const { env, gh, etat, clone } = projet(t);
    const refs = git(clone, "for-each-ref");

    await verifier(env);

    // Pas même une référence du clone : la station peut rapatrier au même instant.
    assert.equal(git(clone, "for-each-ref"), refs);
    assert.equal(existsSync(`${env.FAUX_SETUP}.appels`), false);
    assert.deepEqual(gh.appels().filter((appel) => appel.includes("-X")), []);
    assert.equal(existsSync(join(etat, "log.db")), false);
  });

  test("toutes les variables absentes sont nommées d'un coup, pas la première", async (t) => {
    const { env } = projet(t);

    const constats = await verifier(sans(env, "BRIGADE_MANAGER_MODEL", "BRIGADE_REVIEWER_EFFORT", "BRIGADE_BASE_BRANCH"));

    const dits = manques(constats).join("\n");
    for (const variable of ["BRIGADE_MANAGER_MODEL", "BRIGADE_REVIEWER_EFFORT", "BRIGADE_BASE_BRANCH"]) assert.match(dits, new RegExp(`${variable} n'est pas défini`));
  });

  test("une variable mal écrite est nommée avec ce que le runtime en dirait", async (t) => {
    const { env } = projet(t);

    const constats = await verifier({ ...env, BRIGADE_MANAGER_MODEL: "gpt", BRIGADE_MAX_TURNS: "beaucoup", ANTHROPIC_API_KEY: "sk-x" });

    const dits = manques(constats).join("\n");
    assert.match(dits, /BRIGADE_MANAGER_MODEL invalide/);
    assert.match(dits, /BRIGADE_MAX_TURNS invalide/);
    assert.match(dits, /ANTHROPIC_API_KEY est défini/);
  });

  test("un nom de projet que le runtime refuserait manque, avec ses mots", async (t) => {
    const { env } = projet(t);

    const dits = manques(await verifier({ ...env, BRIGADE_PROJECT: "Calculus", FAUX_SYSTEMCTL_UNITES: "brigade@Calculus.service brigade-sauvegarde@Calculus.timer" }));

    assert.equal(dits.length, 1);
    assert.match(dits[0] ?? "", /nom de projet invalide : « Calculus »/);
  });

  test("ce qui manque au dépôt, à GitHub et à la machine est dit dans le même passage", async (t) => {
    const { env, gh } = projet(t, { gates: null, bindings: null });
    gh.repondre(LABELS_DU_DEPOT, { corps: [{ name: "fire" }, { name: "bug" }] });

    const constats = await verifier({ ...env, FAUX_SYSTEMCTL_UNITES: "", FAUX_CLAUDE_SESSION: "absente" });

    const dits = manques(constats).join("\n");
    assert.match(dits, /\.claude\/brigade\/gates\.sh/);
    assert.match(dits, /bloc de bindings/);
    assert.match(dits, /labels absents.*prio:1.*model:opus.*effort:max/);
    assert.doesNotMatch(dits, /labels absents.*fire/);
    assert.match(dits, new RegExp(`brigade@${PROJET}\\.service`));
    assert.match(dits, /session Max/);
  });

  test("des gates ou un setup non exécutables manquent : le runtime les exécute tels quels", async (t) => {
    const { env } = projet(t, { gates: { contenu: "exit 0\n" }, setup: { contenu: "exit 0\n" } });

    const dits = manques(await verifier(env)).join("\n");

    assert.match(dits, /gates\.sh.*pas exécutable/);
    assert.match(dits, /worktree-setup\.sh.*pas exécutable/);
  });

  test("un projet sans setup est prêt, et c'est dit : un worktree neuf y part tel quel", async (t) => {
    const { env } = projet(t, { setup: null });

    const constats = await verifier(env);

    assert.deepEqual(manques(constats), []);
    assert.match(notes(constats).join("\n"), /worktree-setup\.sh/);
  });

  test("la branche d'intégration des bindings et celle de la machine doivent être la même", async (t) => {
    const { env } = projet(t, { bindings: bindings(["- **Branche d'intégration** : `develop`", "- **Zones de fichiers** : `src/`", "- **Dev local** : rien", "- **Plafond des gates** : `75 s`"]) });

    assert.match(manques(await verifier(env)).join("\n"), new RegExp(`les bindings disent \`develop\`.*BRIGADE_BASE_BRANCH.*\`${BASE}\``));
  });

  test("des bindings sans branche d'intégration valent `main`", async (t) => {
    const { env } = projet(t, { bindings: bindings(["- **Zones de fichiers** : `src/`", "- **Dev local** : rien", "- **Plafond des gates** : `75 s`"]) });

    assert.match(manques(await verifier(env)).join("\n"), /les bindings disent `main`/);
  });

  test("les bindings que le runtime ne lit pas sont signalés sans rien retenir", async (t) => {
    const { env } = projet(t, { bindings: bindings([`- **Branche d'intégration** : \`${BASE}\``]) });

    const constats = await verifier(env);

    assert.deepEqual(manques(constats), []);
    const dits = notes(constats).join("\n");
    for (const binding of ["Zones de fichiers", "Dev local", "Plafond des gates"]) assert.match(dits, new RegExp(binding));
  });

  test("une branche d'intégration que l'origine n'a pas manque, et le dépôt n'est pas jugé à l'aveugle", async (t) => {
    const { env } = projet(t);

    const constats = await verifier({ ...env, BRIGADE_BASE_BRANCH: "main" });

    assert.match(manques(constats).join("\n"), /`main`.*origine/);
    assert.match(notes(constats).join("\n"), /non vérifié/);
  });

  test("une origine injoignable manque, et n'est pas prise pour une branche absente", async (t) => {
    const { env, clone, racine } = projet(t);
    git(clone, "remote", "set-url", "origin", join(racine, "disparue.git"));

    const dits = manques(await verifier(env)).join("\n");

    assert.match(dits, /origine du clone.*ne répond pas/);
    assert.doesNotMatch(dits, /n'existe pas sur l'origine/);
  });

  test("un clone réservé absent manque, avec le geste qui le pose", async (t) => {
    const { env, racine } = projet(t);

    const constats = await verifier({ ...env, BRIGADE_REPO_DIR: join(racine, "nulle-part") });

    const manque = constats.find((constat) => constat.etat === "manque");
    assert.match(manque?.texte ?? "", /clone réservé/);
    assert.match(manque?.geste ?? "", /git clone/);
  });

  test("un dépôt GitHub que `gh` ne lit pas manque", async (t) => {
    const { env, gh } = projet(t);
    gh.repondre(`repos/${DEPOT}`, { statut: 404, corps: { message: "Not Found" } });

    assert.match(manques(await verifier(env)).join("\n"), new RegExp(`${DEPOT}.*HTTP 404`));
  });

  test("un label écrit avec une autre casse est le même label : GitHub ne la distingue pas", async (t) => {
    const { env, gh } = projet(t);
    gh.repondre(LABELS_DU_DEPOT, { corps: LABELS.map(({ name }) => ({ name: name.toUpperCase() })) });

    assert.deepEqual(manques(await verifier(env)), []);
    assert.deepEqual(await poserLabels(env), { crees: [], presents: LABELS.map(({ name }) => name) });
    assert.deepEqual(gh.appels().filter((appel) => appel.includes("POST")), []);
  });

  test("les labels sont lus au-delà de la première page", async (t) => {
    const { env, gh } = projet(t);
    const suite = `repos/${DEPOT}/labels?per_page=100&page=2`;
    gh.repondre(LABELS_DU_DEPOT, { corps: LABELS.slice(0, 3).map(({ name }) => ({ name })), suivant: suite });
    gh.repondre(suite, { corps: LABELS.slice(3).map(({ name }) => ({ name })) });

    assert.deepEqual(manques(await verifier(env)), []);
  });

  test("sans systemd sur la machine, l'unité n'est pas vérifiée et c'est dit", async (t) => {
    const { env, racine } = projet(t);

    const constats = await verifier({ ...env, BRIGADE_SYSTEMCTL_BIN: join(racine, "pas-de-systemctl") });

    assert.deepEqual(manques(constats), []);
    assert.match(notes(constats).join("\n"), /systemd/);
  });

  // Un `claude` que le shell trouve par son nom, comme l'installeur natif le
  // pose : dans un répertoire du compte, que systemd ne donne pas à l'unité.
  function claudeDuCompte(racine: string, env: Record<string, string>) {
    const bin = join(racine, "local/bin");
    mkdirSync(bin, { recursive: true });
    symlinkSync(FAUX_CLAUDE, join(bin, "claude"));
    return { bin, env: { ...sans(env, "BRIGADE_CLAUDE_BIN"), PATH: `${bin}:${process.env.PATH}` } };
  }

  test("un `claude` que le shell trouve mais pas l'unité manque : c'est le `PATH` de l'unité qui compte", async (t) => {
    const { env, racine } = projet(t);
    const compte = claudeDuCompte(racine, env);

    const constats = await verifier({ ...compte.env, FAUX_SYSTEMCTL_ENVIRONNEMENT: `BRIGADE_GITHUB_REPO=${DEPOT} PATH=${racine}/ailleurs:/nulle/part BRIGADE_BASE_BRANCH=${BASE}` });

    // Le shell le trouve : la session Max, elle, est lue.
    assert.deepEqual(manques(constats), [`\`claude\` est introuvable dans le \`PATH\` que l'unité brigade@${PROJET}.service donnera au runtime (${racine}/ailleurs:/nulle/part) : aucun cook ne partirait — le \`PATH\` du shell qui lance cette commande ne compte pas`]);
    const geste = constats.find((constat) => constat.etat === "manque")?.geste ?? "";
    assert.match(geste, new RegExp(`sudo systemctl edit brigade@${PROJET}\\.service`));
    assert.match(geste, new RegExp(`Environment=PATH=${compte.bin}:${racine}/ailleurs:/nulle/part`));
  });

  test("un `claude` que le `PATH` de l'unité donne ne manque pas", async (t) => {
    const { env, racine } = projet(t);
    const compte = claudeDuCompte(racine, env);

    const constats = await verifier({ ...compte.env, FAUX_SYSTEMCTL_ENVIRONNEMENT: `PATH=/nulle/part:${compte.bin}` });

    assert.deepEqual(manques(constats), []);
  });

  test("sans `PATH` dans ses drop-ins, l'unité reçoit celui de systemd, et c'est lui qui est fouillé", async (t) => {
    const { env } = projet(t);

    const constats = await verifier({ ...env, BRIGADE_CLAUDE_BIN: "claude-que-personne-n-a-installe" });

    assert.match(manques(constats).join("\n"), /introuvable dans le `PATH` que l'unité .* donnera au runtime \(\/usr\/local\/sbin:\/usr\/local\/bin:\/usr\/sbin:\/usr\/bin, le défaut de systemd : aucun `Environment=PATH=` dans ses drop-ins\)/);
  });

  test("un `claude` désigné par son chemin ne doit rien au `PATH` de l'unité", async (t) => {
    const { env } = projet(t);

    const constats = await verifier({ ...env, FAUX_SYSTEMCTL_ENVIRONNEMENT: "PATH=/nulle/part" });

    assert.deepEqual(manques(constats), []);
  });

  test("un répertoire temporaire de `claude` qui n'est pas au compte manque : chaque cook s'y refuserait", async (t) => {
    const { env, racine } = projet(t);
    // Celui d'un autre : la racine du système, sous le nom que `claude` attend.
    const temporaire = join(racine, `claude-${process.getuid?.()}`);
    symlinkSync("/", temporaire);

    const constats = await verifier(env);

    assert.deepEqual(manques(constats), [`le répertoire temporaire de \`claude\` (${temporaire}) n'est pas au compte (uid 0, attendu ${process.getuid?.()}) : \`claude\` refuse de s'y lancer, chaque cook échouerait`]);
    assert.match(constats.find((constat) => constat.etat === "manque")?.geste ?? "", /chown .*CLAUDE_CODE_TMPDIR/);
  });

  test("ce répertoire, sous une unité qui a son propre /tmp, ne retient que la connexion faite à la main", () => {
    const lu = { repertoire: "/tmp/claude-1001", proprietaire: 0, uid: 1001 };

    assert.equal(jugerTemporaire({ ...lu, prive: false }).etat, "manque");
    const sousCloison = jugerTemporaire({ ...lu, prive: true });
    assert.equal(sousCloison.etat, "note");
    assert.match(sousCloison.texte, /\/tmp\/claude-1001.*uid 0, attendu 1001.*`PrivateTmp`.*connexion Max/);
  });

  test("une sauvegarde qui n'est pas programmée est signalée sans rien retenir", async (t) => {
    const { env } = projet(t);

    const constats = await verifier({ ...env, FAUX_SYSTEMCTL_UNITES: `brigade@${PROJET}.service` });

    assert.deepEqual(manques(constats), []);
    assert.match(notes(constats).join("\n"), new RegExp(`brigade-sauvegarde@${PROJET}\\.timer`));
  });
});

describe("les labels", () => {
  const CREATION = `repos/${DEPOT}/labels`;
  const crees = (gh: FauxGh) =>
    gh
      .appels()
      .filter((appel) => appel.includes("POST"))
      .map((appel) => appel.find((argument) => argument.startsWith("name="))?.slice("name=".length));

  test("ceux qui manquent sont créés, ceux qui existent ne sont pas touchés", async (t) => {
    const { env, gh } = projet(t);
    gh.repondre(LABELS_DU_DEPOT, { corps: [{ name: "fire" }, { name: "prio:1" }, { name: "bug" }] });
    gh.repondre(CREATION, { statut: 201, corps: {} });

    const bilan = await poserLabels(env);

    const attendus = LABELS.map(({ name }) => name).filter((nom) => nom !== "fire" && nom !== "prio:1");
    assert.deepEqual(bilan, { crees: attendus, presents: ["fire", "prio:1"] });
    assert.deepEqual(crees(gh), attendus);
    const appel = gh.appels().find((arguments_) => arguments_.includes("name=model:opus"));
    assert.ok(appel?.some((argument) => /^color=[0-9A-F]{6}$/.test(argument)));
    assert.ok(appel?.some((argument) => argument.startsWith("description=")));
  });

  test("rejouée sur un dépôt qui les a tous, l'installation ne crée rien", async (t) => {
    const { env, gh } = projet(t);

    const bilan = await poserLabels(env);

    assert.deepEqual(bilan.crees, []);
    assert.deepEqual(crees(gh), []);
  });

  test("un label créé entre-temps par quelqu'un d'autre n'est pas une erreur", async (t) => {
    const { env, gh } = projet(t);
    gh.repondre(LABELS_DU_DEPOT, { corps: LABELS.slice(1).map(({ name }) => ({ name })) });
    gh.repondre(CREATION, { statut: 422, corps: { message: "Validation Failed" } });

    assert.deepEqual((await poserLabels(env)).crees, []);
  });

  test("un refus de GitHub est dit, avec le label en cause", async (t) => {
    const { env, gh } = projet(t);
    gh.repondre(LABELS_DU_DEPOT, { corps: [] });
    gh.repondre(CREATION, { statut: 403, corps: { message: "Forbidden" } });

    await assert.rejects(poserLabels(env), /fire.*HTTP 403/);
  });
});

test("un fichier de secrets que le runtime refuserait est un manque de la machine", async (t) => {
  const { env, racine } = projet(t);
  writeFileSync(join(racine, "secrets.env"), "CLE_API=une-valeur-de-dev\n", { mode: 0o644 });

  assert.match(manques(await verifier({ ...env, BRIGADE_SECRETS_FILE: join(racine, "secrets.env") })).join("\n"), /BRIGADE_SECRETS_FILE invalide.*chmod 600/);
});

describe("le coût du setup", () => {
  const essais = (etat: string) => join(etat, "worktrees/.essais/installation");

  test("le setup est joué une fois, à blanc, dans un worktree neuf de la base — retiré ensuite", async (t) => {
    const { env, clone, etat, origine } = projet(t);

    const mesure = await mesurerSetup(env);

    assert.equal(mesure.pret, true);
    assert.equal(mesure.joue, true);
    assert.equal(mesure.sha, git(origine, "rev-parse", BASE));
    // Le numéro d'aucun ticket : rien de ce que le setup réserve par numéro ne croise un cook.
    assert.equal(readFileSync(`${env.FAUX_SETUP}.appels`, "utf8"), `0 ${essais(etat)}\n`);
    assert.equal(existsSync(essais(etat)), false);
    assert.equal(git(clone, "worktree", "list").split("\n").length, 1);
  });

  test("ce que le setup pose dans le worktree est pesé", async (t) => {
    const pose = '#!/usr/bin/env bash\nhead -c 400000 /dev/urandom > "$2/dependances.bin"\necho "export PRET=1"\n';
    const { env } = projet(t, { setup: { contenu: pose, executable: true } });

    const mesure = await mesurerSetup(env);

    assert.equal(mesure.pret, true);
    assert.ok(mesure.apresOctets - mesure.avantOctets >= 300_000, `${mesure.avantOctets} → ${mesure.apresOctets}`);
  });

  test("un setup en échec est rendu avec ce qu'il a dit, et son worktree est retiré", async (t) => {
    const { env, etat } = projet(t);
    writeFileSync(env.FAUX_SETUP ?? "", "echec");

    const mesure = await mesurerSetup(env);

    assert.equal(mesure.pret, false);
    assert.match(mesure.sortie, /npm ci a échoué/);
    assert.equal(existsSync(essais(etat)), false);
  });

  test("le setup à blanc reçoit les secrets que le dépôt déclare, et ce qu'il en dit est masqué", async (t) => {
    const dit = '#!/usr/bin/env bash\necho "base créée sur $DATABASE_URL" >&2\n';
    const { env, racine } = projet(t, { setup: { contenu: dit, executable: true }, secrets: "DATABASE_URL\n" });
    writeFileSync(join(racine, "secrets.env"), "DATABASE_URL=postgres://dev:mot-de-passe@localhost\n", { mode: 0o600 });

    const mesure = await mesurerSetup({ ...env, BRIGADE_SECRETS_FILE: join(racine, "secrets.env") });

    assert.equal(mesure.pret, true);
    assert.equal(mesure.sortie, "base créée sur [secret:DATABASE_URL]\n");
  });

  test("un secret déclaré que la machine ne détient pas : le setup n'est pas joué, comme la station ne lancerait aucun cook", async (t) => {
    const { env, etat } = projet(t, { secrets: "DATABASE_URL\n" });

    const mesure = await mesurerSetup(env);

    assert.equal(mesure.pret, false);
    assert.match(mesure.sortie, /secrets du projet indisponibles[\s\S]*BRIGADE_SECRETS_FILE n'est pas défini.*`DATABASE_URL`/);
    assert.equal(existsSync(`${env.FAUX_SETUP}.appels`), false);
    assert.equal(existsSync(essais(etat)), false);
  });

  test("le setup ne reçoit rien de l'état du runtime", async (t) => {
    const temoin = '#!/usr/bin/env bash\nenv | grep -c "^BRIGADE_" > "$2/../../../brigade-vues"\n';
    const { env, etat } = projet(t, { setup: { contenu: temoin, executable: true } });

    await mesurerSetup(env);

    assert.equal(readFileSync(join(etat, "brigade-vues"), "utf8").trim(), "0");
  });

  test("un projet sans setup n'a rien à mesurer que son worktree", async (t) => {
    const { env } = projet(t, { setup: null });

    const mesure = await mesurerSetup(env);

    assert.equal(mesure.joue, false);
    assert.equal(mesure.avantOctets, mesure.apresOctets);
  });

  const MO = 1024 ** 2;
  const mesure = { pret: true as const, joue: true, sha: "abc", dureeMs: 60_000, avantOctets: 11 * MO, apresOctets: 400 * MO, sortie: "" };
  const machine = { cooks: 30, entrees: 4, bailMs: 1_800_000, disqueLibre: 100 * 1024 * MO, disqueMinOctets: 5 * 1024 * MO };

  test("à 30 cooks : le disque que trente worktrees prennent, et le temps que le dernier attend son entrée", () => {
    const tenue = tenir(mesure, machine);

    assert.deepEqual(tenue.disque, { besoin: 30 * 400 * MO, disponible: 95 * 1024 * MO, tient: true });
    // Huit vagues de quatre setups, une minute chacune : la dernière part sept minutes après la première.
    assert.deepEqual(tenue.entree, { vagues: 8, dernierMs: 420_000 });
    assert.deepEqual(tenue.setup, { plafondMs: 900_000, tient: true });
    assert.equal(tenue.tient, true);
  });

  test("à une seule vague, le dernier cook part avec le premier", () => {
    assert.deepEqual(tenir(mesure, { ...machine, cooks: 4 }).entree, { vagues: 1, dernierMs: 0 });
  });

  test("trente worktrees qui ne tiennent pas sur le disque : ça ne tient pas", () => {
    const tenue = tenir(mesure, { ...machine, disqueLibre: 16 * 1024 * MO });

    assert.equal(tenue.disque.tient, false);
    assert.equal(tenue.tient, false);
  });

  test("un setup plus long que la moitié du bail ne tient pas : la station l'arrêterait à chaque ticket", () => {
    const tenue = tenir({ ...mesure, dureeMs: 901_000 }, machine);

    assert.equal(tenue.setup.tient, false);
    assert.equal(tenue.tient, false);
  });
});

describe("la désinstallation", () => {
  const refs = (depot: string) => git(depot, "for-each-ref");

  test("sans confirmation, elle dit ce qu'elle retirerait et ne retire rien", (t) => {
    const { env, clone } = projet(t);

    const bilan = desinstaller(env, { confirme: false });

    assert.equal(bilan.retire, false);
    assert.equal(bilan.clone, clone);
    assert.equal(existsSync(clone), true);
  });

  test("confirmée, elle retire le clone réservé et les worktrees — et rien de l'origine ni du journal", (t) => {
    const { env, clone, etat, origine } = projet(t);
    git(clone, "fetch", "-q", "origin");
    git(clone, "worktree", "add", "-q", "-b", "cook/a", join(etat, "worktrees/a"), `origin/${BASE}`);
    writeFileSync(join(etat, "log.db"), "le journal");
    const avant = refs(origine);

    const bilan = desinstaller(env, { confirme: true });

    assert.equal(bilan.retire, true);
    assert.equal(bilan.worktrees, 1);
    assert.equal(existsSync(clone), false);
    assert.equal(existsSync(join(etat, "worktrees")), false);
    assert.equal(readFileSync(join(etat, "log.db"), "utf8"), "le journal");
    assert.equal(refs(origine), avant);
  });

  // Un seul clone pour tout ce qu'il peut porter et que l'origine n'a pas :
  // chaque perte a sa ligne, et une seule suffit à retenir.
  test("tout ce que l'origine n'a pas est nommé à blanc, et retient la désinstallation confirmée", (t) => {
    const { env, clone, etat } = projet(t);
    git(clone, "fetch", "-q", "origin");
    git(clone, "checkout", "-q", "-B", BASE, `origin/${BASE}`);
    git(clone, "commit", "-q", "--allow-empty", "-m", "travail jamais poussé");
    // Une tête détachée, dans un autre worktree que celui d'où la commande regarde.
    git(clone, "worktree", "add", "-q", "--detach", join(etat, "worktrees/b"), `origin/${BASE}`);
    git(join(etat, "worktrees/b"), "commit", "-q", "--allow-empty", "-m", "essai hors branche");
    writeFileSync(join(clone, "LISEZMOI"), "à reprendre\n");
    git(clone, "stash", "push", "-q", "-m", "mis de côté");
    writeFileSync(join(clone, "LISEZMOI"), "en cours\n");
    writeFileSync(join(clone, "brouillon.txt"), "en cours\n");
    git(clone, "worktree", "add", "-q", "-b", "cook/a", join(etat, "worktrees/a"), `origin/${BASE}`);
    writeFileSync(join(etat, "worktrees/a/travail.txt"), "en cours\n");

    const { perdus } = desinstaller(env, { confirme: false });

    const attendus = [/^commit.*travail jamais poussé/, /^commit.*essai hors branche/, /^remise.*mis de côté/, /^non commité.*clone : LISEZMOI/, /^non commité.*brouillon\.txt/, /^non commité.*worktrees\/a : travail\.txt/];
    for (const attendu of attendus) assert.equal(perdus.filter((perdu) => attendu.test(perdu)).length, 1, `${attendu}\n${perdus.join("\n")}`);
    assert.equal(perdus.length, attendus.length, perdus.join("\n"));
    assert.throws(() => desinstaller(env, { confirme: true }), /travail jamais poussé[^]*brouillon\.txt/);
    assert.equal(existsSync(join(clone, "brouillon.txt")), true);
  });

  test("une seule perte suffit à la retenir", (t) => {
    const { env, clone } = projet(t);
    writeFileSync(join(clone, "brouillon.txt"), "en cours\n");

    assert.throws(() => desinstaller(env, { confirme: true }), InstallationRefusee);
    assert.equal(existsSync(clone), true);
  });

  test("un clone à jour de son origine n'a rien à perdre", (t) => {
    const { env, clone } = projet(t);
    git(clone, "fetch", "-q", "origin");
    git(clone, "checkout", "-q", "-B", BASE, `origin/${BASE}`);

    assert.deepEqual(desinstaller(env, { confirme: false }).perdus, []);
  });

  test("le clone déjà parti, les worktrees qui restent sont annoncés à blanc, puis retirés — et c'est dit", (t) => {
    const { env, clone, etat } = projet(t);
    rmSync(clone, { recursive: true });
    mkdirSync(join(etat, "worktrees/a"), { recursive: true });

    const blanc = desinstaller(env, { confirme: false });
    assert.deepEqual({ retire: blanc.retire, clone: blanc.clone, worktrees: blanc.worktrees }, { retire: false, clone: null, worktrees: 1 });
    assert.equal(existsSync(join(etat, "worktrees/a")), true);

    const bilan = desinstaller(env, { confirme: true });
    assert.deepEqual({ retire: bilan.retire, clone: bilan.clone, worktrees: bilan.worktrees }, { retire: true, clone: null, worktrees: 1 });
    assert.equal(existsSync(join(etat, "worktrees")), false);
  });

  test("rejouée, elle ne trouve plus rien à retirer et ne se plaint pas", (t) => {
    const { env } = projet(t);
    desinstaller(env, { confirme: true });

    const bilan = desinstaller(env, { confirme: true });

    assert.equal(bilan.clone, null);
    assert.equal(bilan.retire, false);
  });

  test("tant que le runtime du projet tourne, elle refuse", (t) => {
    const { env, clone, etat } = projet(t);
    const verrou = prendreVerrou(etat);
    t.after(() => verrou.relacher());

    assert.throws(() => desinstaller(env, { confirme: true }), InstallationRefusee);
    assert.equal(existsSync(clone), true);
  });

  test("un répertoire qui n'est pas un clone n'est jamais supprimé", (t) => {
    const { env, racine } = projet(t);
    const ailleurs = join(racine, "documents");
    mkdirSync(ailleurs);
    writeFileSync(join(ailleurs, "important.txt"), "à garder");

    assert.throws(() => desinstaller({ ...env, BRIGADE_REPO_DIR: ailleurs }, { confirme: true }), InstallationRefusee);
    assert.equal(existsSync(join(ailleurs, "important.txt")), true);
  });

  for (const nom of [".brigade-state", "..etat"]) {
    test(`un clone qui contient le répertoire d'état (${nom}) n'est jamais supprimé`, (t) => {
      const { env, clone } = projet(t);
      const etat = join(clone, nom);
      mkdirSync(etat);

      assert.throws(() => desinstaller({ ...env, BRIGADE_STATE_DIR: etat }, { confirme: true }), /dans le clone/);
      assert.equal(existsSync(clone), true);
    });
  }

  test("un clone désigné par un lien n'est pas supprimé s'il contient le répertoire d'état", (t) => {
    const { env, clone, racine } = projet(t);
    const etat = join(clone, ".brigade-state");
    mkdirSync(etat);
    const lien = join(racine, "lien-vers-le-clone");
    symlinkSync(clone, lien);

    assert.throws(() => desinstaller({ ...env, BRIGADE_REPO_DIR: lien, BRIGADE_STATE_DIR: etat }, { confirme: true }), /dans le clone/);
    assert.equal(existsSync(join(clone, ".git")), true);
  });
});

describe("la commande du chef", () => {
  const commande = async (t: TestContext, env: Record<string, string>, ...args: string[]) => {
    const enfant = lancer(t, CLI, args, env);
    return { code: await enfant.fin, sortie: enfant.sortie() };
  };

  test("un projet prêt : elle le dit et sort en 0", async (t) => {
    const { env } = projet(t);

    const { code, sortie } = await commande(t, env);

    assert.match(sortie, new RegExp(`projet « ${PROJET} » : prêt`));
    assert.doesNotMatch(sortie, /MANQUE/);
    assert.equal(code, 0);
  });

  test("un projet mal installé : chaque manque est nommé avec son geste, et elle sort en 1", async (t) => {
    const { env, gh } = projet(t, { gates: null });
    gh.repondre(LABELS_DU_DEPOT, { corps: [] });

    const { code, sortie } = await commande(t, sans(env, "BRIGADE_REVIEWER_MODEL"));

    assert.match(sortie, /MANQUE +BRIGADE_REVIEWER_MODEL n'est pas défini/);
    assert.match(sortie, /MANQUE +`\.claude\/brigade\/gates\.sh`/);
    assert.match(sortie, /MANQUE +labels absents/);
    assert.match(sortie, /→ `npm --prefix runtime run installation -- labels`/);
    assert.match(sortie, /3 manques : aucun cook ne doit être lancé/);
    assert.equal(code, 1);
  });

  test("`labels` crée ce qui manque et le dit", async (t) => {
    const { env, gh } = projet(t);
    gh.repondre(LABELS_DU_DEPOT, { corps: LABELS.slice(2).map(({ name }) => ({ name })) });
    gh.repondre(`repos/${DEPOT}/labels`, { statut: 201, corps: {} });

    const { code, sortie } = await commande(t, env, "labels");

    assert.match(sortie, /2 labels créés sur benomite\/brigade : fire, prio:1/);
    assert.equal(code, 0);
  });

  test("`setup` mesure le setup et dit si un worktree neuf par cook tient", async (t) => {
    const { env } = projet(t);

    const { code, sortie } = await commande(t, env, "setup", "12");

    assert.match(sortie, /setup joué en .* s/);
    assert.match(sortie, /À 12 cooks/);
    assert.match(sortie, /un worktree neuf par cook tient à 12 cooks/);
    assert.equal(code, 0);
  });

  test("`setup` sur un setup en échec sort en 1 avec ce qu'il a dit", async (t) => {
    const { env } = projet(t);
    writeFileSync(env.FAUX_SETUP ?? "", "echec");

    const { code, sortie } = await commande(t, env, "setup");

    assert.match(sortie, /setup en échec/);
    assert.match(sortie, /npm ci a échoué/);
    assert.equal(code, 1);
  });

  test("`desinstaller` ne retire rien sans `--confirmer`, puis dit ce qui reste à la main", async (t) => {
    const { env, clone } = projet(t);

    const blanc = await commande(t, env, "desinstaller");
    assert.match(blanc.sortie, /rien n'est retiré/);
    assert.equal(existsSync(clone), true);
    assert.equal(blanc.code, 0);

    const { code, sortie } = await commande(t, env, "desinstaller", "--confirmer");
    assert.equal(existsSync(clone), false);
    assert.match(sortie, new RegExp(`sudo systemctl disable --now brigade@${PROJET}\\.service`));
    assert.match(sortie, /Le dépôt reste un dépôt ordinaire/);
    assert.equal(code, 0);
  });

  test("une commande inconnue rappelle l'usage et sort en 2", async (t) => {
    const { code, sortie } = await commande(t, {}, "installer");

    assert.match(sortie, /usage :/);
    assert.equal(code, 2);
  });
});
