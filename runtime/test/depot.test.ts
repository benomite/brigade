// Les gestes git de la station, sur un vrai dépôt local : le worktree d'un
// cook, ce qu'il a commité, et la branche poussée.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ouvrirDepot } from "../src/depot.ts";
import { ConfigInvalide } from "../src/runtime.ts";
import { BASE, commiter, depotGit, ENV_GIT, git, repertoireTemporaire } from "./outils.ts";

function projet(t: TestContext) {
  const { origine, clone } = depotGit(t);
  const worktrees = join(repertoireTemporaire(t), "worktrees");
  return { origine, clone, worktrees, depot: ouvrirDepot({ clone, base: BASE, worktrees, env: ENV_GIT }) };
}

// Chaque test a son origine et son clone : ils se jouent de front.
describe("le dépôt de la station", { concurrency: 8 }, () => {
  test("un répertoire qui n'est pas un dépôt git est refusé à l'ouverture", (t) => {
    const pasUnDepot = repertoireTemporaire(t);

    assert.throws(
      () => ouvrirDepot({ clone: pasUnDepot, base: BASE, worktrees: join(pasUnDepot, "w"), env: ENV_GIT }),
      (erreur) => erreur instanceof ConfigInvalide && /BRIGADE_REPO_DIR/.test(erreur.message),
    );
  });

  test("le worktree d'un cook est une branche neuve, partie de la base", async (t) => {
    const { clone, worktrees, depot } = projet(t);

    const { worktree, branche } = await depot.preparer("15-abc");

    assert.equal(worktree, join(worktrees, "15-abc"));
    assert.equal(branche, "cook/15-abc");
    assert.equal(git(worktree, "rev-parse", "--abbrev-ref", "HEAD"), "cook/15-abc");
    assert.equal(git(worktree, "rev-parse", "HEAD"), git(clone, "rev-parse", `origin/${BASE}`));
  });

  test("les fichiers suivis de la base se lisent sans worktree, tels que le clone les connaît", async (t) => {
    const { depot } = projet(t);
    assert.deepEqual(depot.fichiers(), ["LISEZMOI"]);

    // Ce qui arrive sur la base se lit une fois connu du clone.
    const { worktree, branche } = await depot.preparer("15-abc");
    mkdirSync(join(worktree, "docs"));
    // Un nom non ASCII se lit tel qu'il s'écrit, pas échappé.
    commiter(worktree, "docs/épique.md");
    git(worktree, "push", "-q", "origin", `${branche}:${BASE}`);

    assert.deepEqual(depot.fichiers(), ["LISEZMOI", "docs/épique.md"]);
  });

  test("un worktree retiré ne laisse ni répertoire ni branche, et son run se prépare à nouveau", async (t) => {
    const { clone, depot } = projet(t);
    const { worktree, branche } = await depot.preparer("15-abc");
    writeFileSync(join(worktree, "reste-du-setup.txt"), "à moitié installé\n");

    depot.retirer(worktree, branche);

    assert.equal(existsSync(worktree), false);
    assert.equal(git(clone, "branch", "--list", branche), "");
    await depot.preparer("15-abc");
  });

  test("un répertoire de worktrees relatif se lit depuis le répertoire du process, pas depuis le clone", async (t) => {
    const { clone } = depotGit(t);
    const absolu = join(repertoireTemporaire(t), "etat", "worktrees");
    const depot = ouvrirDepot({ clone, base: BASE, worktrees: relative(process.cwd(), absolu), env: ENV_GIT });

    const { worktree, branche } = await depot.preparer("15-abc");

    assert.equal(worktree, join(absolu, "15-abc"));
    assert.equal(existsSync(join(absolu, "15-abc", "LISEZMOI")), true);
    assert.equal(depot.commits(branche), 0);
  });

  test("le worktree part de la base telle qu'elle est sur l'origine, pas telle que le clone l'a connue", async (t) => {
    const { origine, depot } = projet(t);
    const ailleurs = join(repertoireTemporaire(t), "ailleurs");
    git(repertoireTemporaire(t), "clone", "-q", origine, ailleurs);
    commiter(ailleurs, "recent.txt");
    git(ailleurs, "push", "-q", "origin", BASE);

    const { worktree } = await depot.preparer("15-abc");

    assert.equal(git(worktree, "rev-parse", "HEAD"), git(ailleurs, "rev-parse", "HEAD"));
  });

  test("l'arbre principal du dépôt n'est jamais touché", async (t) => {
    const { clone, depot } = projet(t);
    const avant = [git(clone, "rev-parse", "HEAD"), git(clone, "rev-parse", "--abbrev-ref", "HEAD"), git(clone, "status", "--porcelain")];

    const { worktree, branche } = await depot.preparer("15-abc");
    commiter(worktree);
    depot.pousser(branche);

    assert.deepEqual([git(clone, "rev-parse", "HEAD"), git(clone, "rev-parse", "--abbrev-ref", "HEAD"), git(clone, "status", "--porcelain")], avant);
    assert.equal(existsSync(join(clone, "travail.txt")), false);
  });

  test("les commits d'un cook se comptent depuis la base", async (t) => {
    const { depot } = projet(t);
    const { worktree, branche } = await depot.preparer("15-abc");

    assert.equal(depot.commits(branche), 0);
    commiter(worktree, "un.txt");
    commiter(worktree, "deux.txt");
    assert.equal(depot.commits(branche), 2);
  });

  test("la branche poussée arrive sur l'origine, et la base n'y bouge pas", async (t) => {
    const { origine, depot } = projet(t);
    const base = git(origine, "rev-parse", BASE);
    const { worktree, branche } = await depot.preparer("15-abc");
    commiter(worktree);

    depot.pousser(branche);

    assert.equal(git(origine, "rev-parse", "cook/15-abc"), git(worktree, "rev-parse", "HEAD"));
    assert.equal(git(origine, "rev-parse", BASE), base);
  });

  test("un push impossible lève, avec ce que git en dit", async (t) => {
    const { origine, depot } = projet(t);
    const { worktree, branche } = await depot.preparer("15-abc");
    commiter(worktree);
    rmSync(origine, { recursive: true });

    assert.throws(() => depot.pousser(branche), /git push/);
  });

  test("une origine injoignable fait échouer la préparation, sans laisser de worktree", async (t) => {
    const { origine, worktrees, depot } = projet(t);
    rmSync(origine, { recursive: true });

    await assert.rejects(depot.preparer("15-abc"), /git fetch/);
    assert.equal(existsSync(join(worktrees, "15-abc")), false);
  });

  test("un fichier renommé ou supprimé compte parmi les changements, à son ancien chemin", async (t) => {
    const { origine, clone, depot } = projet(t);
    // La base porte un workflow et des gates.
    for (const fichier of [".github/workflows/ci.yml", ".claude/brigade/gates.sh"]) {
      mkdirSync(join(clone, fichier, ".."), { recursive: true });
      commiter(clone, fichier);
    }
    git(clone, "push", "-q", origine, `HEAD:${BASE}`);
    const { worktree, branche } = await depot.preparer("15-abc");

    git(worktree, "mv", ".github/workflows/ci.yml", "ci-off.yml");
    git(worktree, "rm", "-q", ".claude/brigade/gates.sh");
    git(worktree, "commit", "-q", "-m", "plus de juges");

    assert.deepEqual(depot.changes(branche), [".claude/brigade/gates.sh", ".github/workflows/ci.yml", "ci-off.yml"]);
  });

  test("un fichier au nom non ASCII, ou avec une espace, se lit tel qu'il s'écrit dans ce qu'une livraison change", async (t) => {
    const { depot } = projet(t);
    const { worktree, branche } = await depot.preparer("15-abc");
    mkdirSync(join(worktree, "docs"), { recursive: true });
    commiter(worktree, "docs/équipe.md");
    commiter(worktree, "docs/notes du chef.md");

    assert.deepEqual(depot.changes(branche), ["docs/notes du chef.md", "docs/équipe.md"]);
  });

  test("une branche de cook rebasée par un renvoi se pousse quand même : elle n'appartient qu'à la station", async (t) => {
    const { origine, depot } = projet(t);
    const { worktree, branche } = await depot.preparer("15-abc");
    commiter(worktree);
    depot.pousser(branche);

    // Le cook de renvoi réécrit son commit : la branche n'avance plus, elle diverge.
    git(worktree, "commit", "-q", "--amend", "-m", "le même travail, rebasé");
    depot.pousser(branche);

    assert.equal(git(origine, "rev-parse", "cook/15-abc"), depot.tete(branche));
  });

  test("la pass lit d'une branche son commit, ce qu'elle change depuis la base, et ce qu'elle porte — sans worktree", async (t) => {
    const { clone, depot } = projet(t);
    const { worktree, branche } = await depot.preparer("15-abc");
    commiter(worktree);
    mkdirSync(join(worktree, ".claude/brigade"), { recursive: true });
    commiter(worktree, ".claude/brigade/gates.sh");
    const tete = git(worktree, "rev-parse", "HEAD");
    git(clone, "worktree", "remove", "--force", worktree);

    assert.equal(depot.connait(branche), true);
    assert.equal(depot.tete(branche), tete);
    assert.deepEqual(depot.changes(branche), [".claude/brigade/gates.sh", "travail.txt"]);
    assert.match(depot.diff(branche), /^\+travail\.txt$/m);
    assert.deepEqual(depot.liste(branche, ".claude/brigade"), ["gates.sh"]);
    // Un répertoire que la branche ne porte pas, une branche que le clone ne connaît pas.
    assert.deepEqual(depot.liste(branche, ".github/workflows"), []);
    assert.equal(depot.connait("cook/16-def"), false);
  });

  test("un worktree dit s'il est intact : un fichier suivi modifié ou un fichier neuf, non ; ce que le projet ignore, oui", async (t) => {
    const { depot } = projet(t);
    const { worktree } = await depot.preparer("15-abc");
    writeFileSync(join(worktree, ".gitignore"), "*.log\n");
    commiter(worktree);
    writeFileSync(join(worktree, "outil.log"), "une ligne\n");
    assert.equal(depot.intact(worktree), true);

    writeFileSync(join(worktree, "brouillon.txt"), "pas commité\n");
    assert.equal(depot.intact(worktree), false);
  });

  test("l'empreinte d'un worktree ne change pas tant que rien n'y bouge", async (t) => {
    const { depot } = projet(t);
    const { worktree } = await depot.preparer("47-abc");

    assert.equal(depot.empreinte(worktree), depot.empreinte(worktree));
  });

  test("l'empreinte change à chaque progrès : un commit, un fichier suivi modifié puis réécrit, un fichier neuf, un fichier supprimé", async (t) => {
    const { depot } = projet(t);
    const { worktree } = await depot.preparer("47-abc");
    const vues = [depot.empreinte(worktree)];
    const progres = (faire: () => void) => {
      faire();
      vues.push(depot.empreinte(worktree));
    };

    progres(() => commiter(worktree));
    progres(() => writeFileSync(join(worktree, "LISEZMOI"), "le projet, retouché\n"));
    progres(() => writeFileSync(join(worktree, "LISEZMOI"), "le projet, retouché une seconde fois\n"));
    progres(() => writeFileSync(join(worktree, "brouillon.txt"), "pas encore suivi\n"));
    progres(() => writeFileSync(join(worktree, "brouillon.txt"), "pas encore suivi, mais réécrit\n"));
    progres(() => rmSync(join(worktree, "travail.txt")));

    assert.equal(new Set(vues).size, vues.length);
  });

  test("ce que le projet ignore ne fait pas bouger l'empreinte : ni dépendances, ni logs", async (t) => {
    const { depot } = projet(t);
    const { worktree } = await depot.preparer("47-abc");
    writeFileSync(join(worktree, ".gitignore"), "node_modules/\n*.log\n");
    const avant = depot.empreinte(worktree);

    mkdirSync(join(worktree, "node_modules/paquet"), { recursive: true });
    writeFileSync(join(worktree, "node_modules/paquet/index.js"), "");
    writeFileSync(join(worktree, "outil.log"), "une ligne de plus\n");

    assert.equal(depot.empreinte(worktree), avant);
  });

  test("un worktree chargé de fichiers neufs se lit quand même : plus d'un mégaoctet de statut", async (t) => {
    const { depot } = projet(t);
    const { worktree } = await depot.preparer("47-abc");
    // Des chemins longs : le statut dépasse le tampon par défaut de Node sans
    // qu'il faille écrire des dizaines de milliers de fichiers.
    const long = (lettre: string) => lettre.repeat(200);
    const fond = join(worktree, long("a"), long("b"), long("c"));
    mkdirSync(fond, { recursive: true });
    for (let i = 0; i < 1500; i++) writeFileSync(join(fond, `${long("d")}-${i}`), "");

    const avant = depot.empreinte(worktree);
    writeFileSync(join(fond, `${long("d")}-0`), "réécrit\n");

    assert.notEqual(depot.empreinte(worktree), avant);
  });

  test("lire l'empreinte n'écrit pas l'index : un commit du cook au même instant ne bute pas sur son verrou", async (t) => {
    const { depot } = projet(t);
    const { worktree } = await depot.preparer("47-abc");
    const index = join(git(worktree, "rev-parse", "--absolute-git-dir"), "index");
    // Même contenu, date neuve : un `status` ordinaire rafraîchirait l'index.
    utimesSync(join(worktree, "LISEZMOI"), new Date(), new Date(Date.now() + 5000));
    const avant = readFileSync(index);

    depot.empreinte(worktree);

    assert.deepEqual(readFileSync(index), avant);
  });

  test("la base qui avance sous une livraison se voit : d'où part la branche, de combien elle est dépassée, et ce que la base a reçu", async (t) => {
    const { clone, depot } = projet(t);
    const [livree, voisine] = [await depot.preparer("15-abc"), await depot.preparer("16-def")];
    commiter(livree.worktree, "a.txt");
    const depart = git(clone, "rev-parse", `origin/${BASE}`);
    assert.equal(await depot.rapatrier(), depart);
    assert.deepEqual(depot.retard(livree.branche), { depart, commits: 0 });

    // La voisine est mergée : la base reçoit son fichier.
    commiter(voisine.worktree, "docs é.md");
    git(voisine.worktree, "push", "-q", "origin", `${voisine.branche}:${BASE}`);
    const tete = await depot.rapatrier();

    assert.equal(tete, git(voisine.worktree, "rev-parse", "HEAD"));
    assert.deepEqual(depot.retard(livree.branche), { depart, commits: 1 });
    assert.deepEqual(depot.arrives(depart), ["docs é.md"]);
    assert.deepEqual(depot.arrives(tete), []);
    // Ce que la livraison change se lit toujours depuis son point de départ.
    assert.deepEqual(depot.changes(livree.branche), ["a.txt"]);
  });

  test("un worktree jetable porte le résultat du merge sans toucher à aucune branche, et ne laisse rien une fois jeté", async (t) => {
    const { clone, worktrees, depot } = projet(t);
    const [livree, voisine] = [await depot.preparer("15-abc"), await depot.preparer("16-def")];
    commiter(livree.worktree, "a.txt");
    commiter(voisine.worktree, "b.txt");
    git(voisine.worktree, "push", "-q", "origin", `${voisine.branche}:${BASE}`);
    const tete = await depot.rapatrier();
    const branches = git(clone, "for-each-ref", "refs/heads", "refs/remotes");

    const essai = await depot.essayer("rencontre-15", git(livree.worktree, "rev-parse", "HEAD"));

    assert.equal(essai, join(worktrees, ".essais", "rencontre-15"));
    assert.deepEqual([existsSync(join(String(essai), "a.txt")), existsSync(join(String(essai), "b.txt"))], [true, true]);
    assert.equal(git(String(essai), "rev-parse", "--abbrev-ref", "HEAD"), "HEAD");
    // Sans `sha`, c'est la base seule.
    const seule = await depot.essayer("base");
    assert.equal(git(String(seule), "rev-parse", "HEAD"), tete);
    assert.equal(git(clone, "for-each-ref", "refs/heads", "refs/remotes"), branches);

    depot.jeter("rencontre-15");
    assert.equal(existsSync(String(essai)), false);
    // Jeter ce qui n'existe pas n'est pas une erreur ; sans nom, tout ce qui reste part.
    depot.jeter("rencontre-15");
    depot.jeter();
    assert.equal(existsSync(String(seule)), false);
    assert.doesNotMatch(git(clone, "worktree", "list"), /\.essais/);
    // Le même nom se reprend.
    assert.notEqual(await depot.essayer("base"), null);
  });

  test("un worktree jetable qui ne se crée pas lève, avec ce que git en dit : ce n'est pas un conflit, et rien n'est rendu", async (t) => {
    const { worktrees, depot } = projet(t);
    await depot.rapatrier();
    // Un fichier là où git doit créer le répertoire des essais.
    mkdirSync(worktrees, { recursive: true });
    writeFileSync(join(worktrees, ".essais"), "");

    await assert.rejects(depot.essayer("base"), /^Error: git worktree : \S/);
  });

  test("un merge qui ne se fait pas ne rend pas de worktree, et n'en laisse pas", async (t) => {
    const { worktrees, depot } = projet(t);
    const [livree, voisine] = [await depot.preparer("15-abc"), await depot.preparer("16-def")];
    writeFileSync(join(livree.worktree, "LISEZMOI"), "la livraison\n");
    git(livree.worktree, "commit", "-q", "-am", "réécrit");
    writeFileSync(join(voisine.worktree, "LISEZMOI"), "la voisine\n");
    git(voisine.worktree, "commit", "-q", "-am", "réécrit aussi");
    git(voisine.worktree, "push", "-q", "origin", `${voisine.branche}:${BASE}`);
    await depot.rapatrier();

    assert.equal(await depot.essayer("rencontre-15", git(livree.worktree, "rev-parse", "HEAD")), null);
    assert.equal(existsSync(join(worktrees, ".essais", "rencontre-15")), false);
    // Seul un conflit en est un : un merge qui échoue pour une autre raison est une panne, et se dit.
    await assert.rejects(depot.essayer("rencontre-15", "f".repeat(40)), /git/);
    assert.equal(existsSync(join(worktrees, ".essais", "rencontre-15")), false);
  });

  test("ce qui traîne dans un worktree est commité sur sa branche, sous le nom de la brigade — jamais ce que le projet ignore", async (t) => {
    const { depot } = projet(t);
    const { worktree, branche } = await depot.preparer("15-abc");
    writeFileSync(join(worktree, ".gitignore"), "node_modules/\n.env\n");
    commiter(worktree);
    assert.equal(depot.recolter(worktree, branche), null);
    assert.deepEqual(depot.recoltes(branche), []);

    writeFileSync(join(worktree, "LISEZMOI"), "réécrit\n");
    writeFileSync(join(worktree, "brouillon.txt"), "jamais commité\n");
    rmSync(join(worktree, "travail.txt"));
    mkdirSync(join(worktree, "node_modules/paquet"), { recursive: true });
    writeFileSync(join(worktree, "node_modules/paquet/index.js"), "");
    writeFileSync(join(worktree, ".env"), "JETON=secret\n");

    const recolte = depot.recolter(worktree, branche);

    assert.equal(recolte, git(worktree, "rev-parse", "HEAD"));
    assert.equal(depot.tete(branche), recolte);
    assert.equal(depot.commits(branche), 2);
    assert.deepEqual(git(worktree, "show", "--format=", "--name-status", "HEAD").split("\n"), ["M\tLISEZMOI", "A\tbrouillon.txt", "D\ttravail.txt"]);
    assert.equal(git(worktree, "log", "-1", "--format=%an <%ae> | %s"), "brigade <brigade@localhost> | brigade : récolte — ce que le cook avait laissé non commité dans son worktree");
    // Le reviewer saura quels commits ne sont pas du cook.
    assert.deepEqual(depot.recoltes(branche), [recolte]);
    assert.equal(depot.intact(worktree), true);
    // Rien de plus à récolter.
    assert.equal(depot.recolter(worktree, branche), null);
  });

  test("un worktree qui n'est plus sur sa branche n'est pas récolté : le commit n'irait nulle part", async (t) => {
    const { depot } = projet(t);
    const { worktree, branche } = await depot.preparer("15-abc");
    commiter(worktree);
    git(worktree, "checkout", "-q", "--detach");
    writeFileSync(join(worktree, "brouillon.txt"), "jamais commité\n");

    assert.throws(() => depot.recolter(worktree, branche), /n'est plus sur sa branche `cook\/15-abc`/);
    await assert.rejects(depot.ranger(worktree, branche), /n'est plus sur sa branche/);
    assert.equal(readFileSync(join(worktree, "brouillon.txt"), "utf8"), "jamais commité\n");
  });

  test("ce qui est livré d'une branche est ce que l'origine en a reçu : une récolte posée après le push n'en fait pas partie", async (t) => {
    const { depot } = projet(t);
    const { worktree, branche } = await depot.preparer("15-abc");
    commiter(worktree);
    // Jamais poussée, la branche n'a rien livré d'autre qu'elle-même.
    assert.equal(depot.livree(branche), branche);

    depot.pousser(branche);
    const pousse = depot.tete(branche);
    writeFileSync(join(worktree, "brouillon.txt"), "écrit après le push\n");
    const recolte = await depot.ranger(worktree, branche);

    const livree = depot.livree(branche);
    assert.equal(livree, `origin/${branche}`);
    assert.deepEqual([depot.tete(livree), depot.tete(branche)], [pousse, recolte]);
    assert.deepEqual([depot.commits(livree), depot.changes(livree), depot.recoltes(livree)], [1, ["travail.txt"], []]);
    assert.deepEqual(depot.retard(livree), { depart: depot.retard(branche).depart, commits: 0 });
    // Le worktree jetable de la pass se pose sur ce qui est livré.
    const essai = await depot.poser("jugement-15", livree);
    assert.deepEqual([git(essai, "rev-parse", "HEAD"), existsSync(join(essai, "brouillon.txt"))], [pousse, false]);
  });

  test("un worktree dit s'il est encore sur sa branche : ni sur une autre, ni en tête détachée", async (t) => {
    const { depot } = projet(t);
    const { worktree, branche } = await depot.preparer("15-abc");
    assert.equal(depot.surSaBranche(worktree, branche), true);

    git(worktree, "checkout", "-q", "-b", "ailleurs");
    assert.equal(depot.surSaBranche(worktree, branche), false);
    git(worktree, "checkout", "-q", "--detach");
    assert.equal(depot.surSaBranche(worktree, branche), false);
  });

  test("un worktree se range : ce qui traîne est commité, le worktree part avec ce que le projet ignore, la branche reste — rien n'est poussé", async (t) => {
    const { origine, clone, depot } = projet(t);
    const { worktree, branche } = await depot.preparer("15-abc");
    writeFileSync(join(worktree, ".gitignore"), "node_modules/\n");
    commiter(worktree);
    mkdirSync(join(worktree, "node_modules/paquet"), { recursive: true });
    writeFileSync(join(worktree, "node_modules/paquet/index.js"), "");
    writeFileSync(join(worktree, "brouillon.txt"), "jamais commité\n");

    const recolte = await depot.ranger(worktree, branche);

    assert.equal(existsSync(worktree), false);
    assert.equal(git(clone, "worktree", "list").split("\n").length, 1);
    assert.equal(git(clone, "rev-parse", branche), recolte);
    assert.equal(git(clone, "show", `${branche}:brouillon.txt`), "jamais commité");
    assert.throws(() => git(origine, "rev-parse", "--verify", "--quiet", branche));
    // Sans rien qui traîne, il part sans commit ; déjà absent, ce n'est pas un échec.
    const propre = await depot.preparer("16-def");
    assert.equal(await depot.ranger(propre.worktree, propre.branche), null);
    assert.equal(await depot.ranger(propre.worktree, propre.branche), null);
    assert.equal(depot.connait(propre.branche), true);
  });

  test("ranger ne touche pas ce qui n'est pas le worktree d'un cook : un répertoire resté là avec des fichiers lève, un chemin hors des worktrees aussi", async (t) => {
    const { clone, worktrees, depot } = projet(t);
    mkdirSync(join(worktrees, "15-abc"), { recursive: true });
    writeFileSync(join(worktrees, "15-abc", "reste.txt"), "ce qu'un cook a écrit\n");

    await assert.rejects(depot.ranger(join(worktrees, "15-abc"), "cook/15-abc"), /n'est plus un worktree git, et qui n'est pas vide/);
    assert.equal(existsSync(join(worktrees, "15-abc", "reste.txt")), true);
    await assert.rejects(depot.ranger(clone, BASE), /hors du répertoire des worktrees/);
    assert.equal(existsSync(join(clone, "LISEZMOI")), true);
    // Un retrait à moitié fait : le répertoire est resté, vide. Il part.
    mkdirSync(join(worktrees, "16-def"));
    assert.equal(await depot.ranger(join(worktrees, "16-def"), "cook/16-def"), null);
    assert.equal(existsSync(join(worktrees, "16-def")), false);
  });

  test("une branche rangée se reprend dans un worktree neuf : le renvoi y retrouve le travail, récolte comprise", async (t) => {
    const { worktrees, depot } = projet(t);
    const { worktree, branche } = await depot.preparer("15-abc");
    commiter(worktree);
    writeFileSync(join(worktree, "brouillon.txt"), "jamais commité\n");
    await depot.ranger(worktree, branche);

    const repris = await depot.reprendre("15-def", branche);

    assert.equal(repris, join(worktrees, "15-def"));
    assert.equal(git(repris, "rev-parse", "--abbrev-ref", "HEAD"), branche);
    assert.deepEqual([existsSync(join(repris, "travail.txt")), existsSync(join(repris, "brouillon.txt"))], [true, true]);
    // Retiré sans sa branche : un setup en échec ne défait pas la livraison.
    depot.retirer(repris);
    assert.equal(existsSync(repris), false);
    assert.equal(depot.connait(branche), true);
  });

  test("la pass pose un worktree jetable sur une branche : détaché, il ne la retient pas, et part une fois jeté", async (t) => {
    const { worktrees, depot } = projet(t);
    const { worktree, branche } = await depot.preparer("15-abc");
    commiter(worktree);
    await depot.ranger(worktree, branche);

    const essai = await depot.poser("jugement-15", branche);

    assert.equal(essai, join(worktrees, ".essais", "jugement-15"));
    assert.equal(git(essai, "rev-parse", "HEAD"), depot.tete(branche));
    assert.equal(git(essai, "rev-parse", "--abbrev-ref", "HEAD"), "HEAD");
    // La branche reste libre : un renvoi peut la reprendre pendant ce temps.
    await depot.reprendre("15-def", branche);
    depot.jeter("jugement-15");
    assert.equal(existsSync(essai), false);
  });

  test("une branche locale s'élague une fois tout sur l'origine ; avec des commits qui n'y sont pas, elle reste — la branche distante n'est jamais touchée", async (t) => {
    const { origine, clone, depot } = projet(t);
    const [poussee, gardee] = [await depot.preparer("15-abc"), await depot.preparer("16-def")];
    commiter(poussee.worktree);
    // Un autre fichier : le même, commité dans la seconde, serait le même commit.
    commiter(gardee.worktree, "autre.txt");
    depot.pousser(poussee.branche);
    for (const { worktree, branche } of [poussee, gardee]) await depot.ranger(worktree, branche);

    assert.equal(await depot.elaguer(poussee.branche), true);
    assert.equal(git(clone, "branch", "--list", poussee.branche), "");
    assert.notEqual(git(origine, "rev-parse", poussee.branche), "");
    assert.equal(await depot.elaguer(gardee.branche), false);
    assert.notEqual(git(clone, "branch", "--list", gardee.branche), "");
    // Déjà partie : il n'y a rien à faire, et ce n'est pas une erreur.
    assert.equal(await depot.elaguer(poussee.branche), true);
  });

  test("ranger passe à son tour sur le clone : des rangements et une préparation demandés ensemble aboutissent tous", async (t) => {
    const { worktrees, depot } = projet(t);
    const anciens = [await depot.preparer("15-abc"), await depot.preparer("16-def")];

    const [neuf] = await Promise.all([depot.preparer("17-fff"), ...anciens.map(({ worktree, branche }) => depot.ranger(worktree, branche))]);

    assert.equal(neuf.worktree, join(worktrees, "17-fff"));
    assert.equal(existsSync(join(neuf.worktree, ".git")), true);
    assert.deepEqual(anciens.map(({ worktree }) => existsSync(worktree)), [false, false]);
  });
});
