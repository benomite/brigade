// Le service d'un projet : ce que son dépôt déclare pour être regardé, lu dans
// un worktree. De vrais dépôts git, le vrai setup et la vraie déclaration de ce
// dépôt ; rien n'est lancé ni servi, aucun port n'est ouvert.
import assert from "node:assert/strict";
import { chmodSync, cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ouvrirDepot } from "../src/depot.ts";
import { jouerSetup, SCRIPT_SETUP } from "../src/gates.ts";
import { DECLARATION_SERVICE, lireDeclaration, serviceDuWorktree, toucheInterface, VARIABLE_DU_PORT } from "../src/service.ts";
import { BASE, commiter, depotGit, ENV_GIT, git, repertoireTemporaire } from "./outils.ts";

const RACINE = join(import.meta.dirname, "../..");
const DECLARATION_DE_BRIGADE = readFileSync(join(RACINE, DECLARATION_SERVICE), "utf8");

const DECLARATION = "commande : npm run dev -- --port \"$BRIGADE_PORT\"\ninterface : app/src/vue\ninterface : site\n";

// Un projet dont la base porte sa déclaration de service — ou n'en porte pas.
function projet(t: TestContext, declaration: string | null = DECLARATION) {
  const { origine, clone } = depotGit(t);
  if (declaration !== null) {
    mkdirSync(join(clone, ".claude/brigade"), { recursive: true });
    writeFileSync(join(clone, DECLARATION_SERVICE), declaration);
    git(clone, "add", ".");
    git(clone, "commit", "-q", "-m", "le projet déclare comment il est servi");
    git(clone, "push", "-q", origine, `HEAD:${BASE}`);
  }
  return ouvrirDepot({ clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
}

// Un cook livre ces fichiers sur sa branche.
function livrer(worktree: string, ...fichiers: string[]): void {
  for (const fichier of fichiers) {
    mkdirSync(join(worktree, fichier, ".."), { recursive: true });
    commiter(worktree, fichier);
  }
}

// Chaque test a son dépôt : ils se jouent de front.
describe("le service du projet", { concurrency: 8 }, () => {
  test("le dépôt déclare sa commande de service et ses chemins d'interface, une ligne « clé : valeur » chacun", () => {
    const declaration = lireDeclaration("# comment ce projet se sert\n\ncommande : npm run dev -- --host 127.0.0.1 --port \"$BRIGADE_PORT\"\ninterface : app/src/vue/\n  interface:site/pages  \ninterface : app/src/vue\n");

    // La commande est gardée telle qu'elle s'écrit, deux-points compris.
    assert.deepEqual(declaration, { commande: 'npm run dev -- --host 127.0.0.1 --port "$BRIGADE_PORT"', lancement: null, interface: ["app/src/vue", "site/pages"], problemes: [] });
  });

  test("ce que la déclaration ne dit pas, ou dit mal, est un problème nommé — jamais une commande devinée", () => {
    const { commande, interface: chemins, problemes } = lireDeclaration("commande : npm run dev\ncommande : npm start\nport : 3000\nnpm run preview\ninterface : /srv/site\ninterface : app/**/*.css\ninterface : ../ailleurs\ninterface : .\ninterface :\ncommande :\n");
    assert.equal(commande, "npm run dev");
    assert.deepEqual(chemins, []);
    assert.deepEqual(problemes, [
      'line 2 of `.claude/brigade/service` ("commande : npm start"): the command is already declared on line 1 — only one serves the project',
      'line 3 of `.claude/brigade/service` ("port : 3000"): `port` is not a key — expected "commande: …", "lancement: …" or "interface: …"',
      'line 4 of `.claude/brigade/service` ("npm run preview"): not a "key: value" line — expected "commande: …", "lancement: …" or "interface: …"',
      'line 5 of `.claude/brigade/service` ("interface : /srv/site"): "/srv/site" is not a path of the repository',
      'line 6 of `.claude/brigade/service` ("interface : app/**/*.css"): "app/**/*.css" is a pattern, not a path — a directory already owns everything it contains',
      'line 7 of `.claude/brigade/service` ("interface : ../ailleurs"): "../ailleurs" is not a path of the repository',
      'line 8 of `.claude/brigade/service` ("interface : ."): "." names no path — the whole repository is not an interface',
      'line 9 of `.claude/brigade/service` ("interface :"): the path is missing',
      'line 10 of `.claude/brigade/service` ("commande :"): the command is missing',
      'no interface path in `.claude/brigade/service`: no delivery would be recognised as touching the interface — one "interface: <path>" line per path',
    ]);

    assert.deepEqual(lireDeclaration("# rien encore\ninterface : site\n").problemes, ['no command in `.claude/brigade/service`: nothing says how to serve this project — a "commande: …" line, or "lancement: …" for an app that does not open in a browser']);
  });

  test("une app qui ne s'ouvre pas dans un navigateur déclare son lancement à la place d'une commande : servable sans port, sans serveur", async (t) => {
    const declaration = "# une app Electron\nlancement : npm --prefix app start\ninterface : app/src/vue\n";
    assert.deepEqual(lireDeclaration(declaration), { commande: null, lancement: "npm --prefix app start", interface: ["app/src/vue"], problemes: [] });

    const depot = projet(t, declaration);
    const { worktree } = await depot.preparer("631-electron");
    // Une app lancée n'a pas de port : son absence n'empêche rien.
    const attendu = { servable: true, regard: "lancement", lancement: "npm --prefix app start", interface: ["app/src/vue"] };
    assert.deepEqual(serviceDuWorktree(worktree, {}), attendu);
    assert.deepEqual(serviceDuWorktree(worktree, { [VARIABLE_DU_PORT]: "20631" }), attendu);

    // Un projet web reste un projet web.
    const web = await projet(t).preparer("630-web");
    const served = serviceDuWorktree(web.worktree, { [VARIABLE_DU_PORT]: "20630" });
    assert.deepEqual(served.servable && served.regard, "navigateur");
  });

  test("un projet se sert ou se lance, pas les deux ; un lancement se déclare une fois, et pas vide", () => {
    assert.deepEqual(lireDeclaration("commande : npm run dev\nlancement : npm start\ninterface : app\n").problemes, [
      'line 2 of `.claude/brigade/service` ("lancement : npm start"): a launch while the command is declared on line 1 — a project is served in a browser ("commande") or launched ("lancement"), not both',
    ]);
    assert.deepEqual(lireDeclaration("lancement : npm start\ncommande : npm run dev\nlancement : electron .\nlancement :\ninterface : app\n").problemes, [
      'line 2 of `.claude/brigade/service` ("commande : npm run dev"): a command while the launch is declared on line 1 — a project is served in a browser ("commande") or launched ("lancement"), not both',
      'line 3 of `.claude/brigade/service` ("lancement : electron ."): the launch is already declared on line 1 — only one launches the app',
      'line 4 of `.claude/brigade/service` ("lancement :"): the launch is missing',
    ]);
    // Un lancement sans chemin d'interface ne reconnaîtrait aucune livraison.
    assert.match(lireDeclaration("lancement : npm start\n").problemes.join("\n"), /^no interface path/);
  });

  test("une livraison dont le diff touche un chemin d'interface déclaré touche l'interface, une livraison qui n'en touche aucun ne la touche pas", async (t) => {
    const depot = projet(t);
    const interfaceDe = (worktree: string) => {
      const service = serviceDuWorktree(worktree, { [VARIABLE_DU_PORT]: "20017" });
      assert.equal(service.servable, true);
      return service.servable ? service.interface : [];
    };

    const vue = await depot.preparer("17-vue");
    livrer(vue.worktree, "app/src/vue/vue.css", "runtime/src/service.ts", "site/index.html");
    assert.deepEqual(toucheInterface(interfaceDe(vue.worktree), depot.changes(vue.branche)), ["app/src/vue/vue.css", "site/index.html"]);

    // Ni un voisin du dossier déclaré, ni un fichier dont le nom commence comme lui.
    const moteur = await depot.preparer("18-moteur");
    livrer(moteur.worktree, "runtime/src/service.ts", "app/src/vue.ts", "app/src/vue2/vue.css", "docs/site/index.html");
    assert.deepEqual(toucheInterface(interfaceDe(moteur.worktree), depot.changes(moteur.branche)), []);

    // Un fichier de l'interface supprimé ou déplacé la touche : elle ne se rend plus comme avant.
    const base = await depot.preparer("19-base");
    livrer(base.worktree, "site/index.html");
    git(base.worktree, "push", "-q", "origin", `HEAD:${BASE}`);
    const cleanup = await depot.preparer("20-rangement");
    git(cleanup.worktree, "mv", "site/index.html", "archives.html");
    git(cleanup.worktree, "commit", "-q", "-m", "range la page");
    assert.deepEqual(toucheInterface(interfaceDe(cleanup.worktree), depot.changes(cleanup.branche)), ["site/index.html"]);
  });

  test("un projet sans déclaration le dit — « ce projet ne déclare pas comment il est servi » —, aussitôt et sans lever", async (t) => {
    const depot = projet(t, null);
    const { worktree } = await depot.preparer("17-vue");

    assert.deepEqual(serviceDuWorktree(worktree, { [VARIABLE_DU_PORT]: "20017" }), {
      servable: false,
      declare: false,
      pourquoi: 'this project does not declare how it is served: its repository has no `.claude/brigade/service` — a "commande: …" line (or "lancement: …" for an app that does not open in a browser), and one "interface: <path>" line per path whose change touches the interface',
    });
  });

  test("une déclaration qui a des problèmes ne rend pas le worktree servable, et ses problèmes sont dits", async (t) => {
    const depot = projet(t, "commande : npm run dev\ninterface : app/*\n");
    const { worktree } = await depot.preparer("17-vue");

    const service = serviceDuWorktree(worktree, { [VARIABLE_DU_PORT]: "20017" });
    assert.equal(service.servable, false);
    assert.equal(!service.servable && service.declare, true);
    assert.match(!service.servable ? service.pourquoi : "", /^this project declares badly how it is served — line 2 of `\.claude\/brigade\/service` \("interface : app\/\*"\): "app\/\*" is a pattern/);
  });

  test("une déclaration illisible n'est pas une déclaration absente", (t) => {
    const worktree = repertoireTemporaire(t);
    // Un dossier là où le fichier est attendu.
    mkdirSync(join(worktree, DECLARATION_SERVICE), { recursive: true });

    const service = serviceDuWorktree(worktree, { [VARIABLE_DU_PORT]: "20017" });
    assert.equal(!service.servable && service.declare, true);
    assert.match(!service.servable ? service.pourquoi : "", /^`\.claude\/brigade\/service` is unreadable — EISDIR/);
  });

  test("le port d'un worktree est celui que son setup lui attribue : la déclaration de ce dépôt, sous son vrai setup, sert le ticket 405 sur 20405", async (t) => {
    const depot = projet(t, DECLARATION_DE_BRIGADE);
    const { worktree } = await depot.preparer("405-service");
    // Ce que le setup de ce dépôt exige d'un worktree, sans rien à installer.
    mkdirSync(join(worktree, ".claude-plugin"));
    writeFileSync(join(worktree, ".claude-plugin/plugin.json"), "{}\n");
    cpSync(join(RACINE, SCRIPT_SETUP), join(worktree, SCRIPT_SETUP));
    chmodSync(join(worktree, SCRIPT_SETUP), 0o755);

    const setup = await jouerSetup({ worktree, ticket: 405, env: ENV_GIT, delaiMs: 60_000 });
    assert.equal(setup.pret, true, setup.sortie);
    const service = serviceDuWorktree(worktree, setup.pret ? setup.env : {});

    assert.equal(service.servable, true, service.servable ? "" : service.pourquoi);
    if (!service.servable || service.regard !== "navigateur") return assert.fail("la déclaration de ce dépôt le sert dans un navigateur");
    assert.equal(service.port, 20405);
    assert.deepEqual(service.interface, ["app/src/vue"]);
    // Le port ne s'écrit pas dans la commande : elle le reçoit du setup.
    assert.match(service.commande, /\$\{?BRIGADE_PORT\b/);
    assert.doesNotMatch(service.commande, /\b\d{4,5}\b/);
  });

  test("sans port attribué par le setup, le worktree n'est pas servable et aucun port n'est choisi à sa place", async (t) => {
    const depot = projet(t);
    const { worktree } = await depot.preparer("17-vue");

    assert.deepEqual(serviceDuWorktree(worktree, {}), {
      servable: false,
      declare: true,
      pourquoi: "no port is assigned to this worktree: its setup (`.claude/brigade/worktree-setup.sh`) does not export `BRIGADE_PORT`, and no port is chosen in its place",
    });
    for (const brut of ["0", "70000", "20017.5", "vingt-mille", ""]) {
      const service = serviceDuWorktree(worktree, { [VARIABLE_DU_PORT]: brut });
      assert.equal(service.servable, false, brut);
    }
    assert.match(String(Object.values(serviceDuWorktree(worktree, { [VARIABLE_DU_PORT]: "70000" })).at(-1)), /^`BRIGADE_PORT` is "70000": not a port/);
  });
});
