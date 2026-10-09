// Les gestes git de la station, sur un vrai dépôt local : le worktree d'un
// cook, ce qu'il a commité, et la branche poussée.
import assert from "node:assert/strict";
import { appendFileSync, chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { environnementReseau, lireALaBase, ouvrirDepot } from "../src/depot.ts";
import { identifiantsLivres } from "../src/identifiants.ts";
import { ConfigInvalide } from "../src/runtime.ts";
import { BASE, commiter, depotGit, ENV_GIT, git, repertoireTemporaire } from "./outils.ts";

function projet(t: TestContext) {
  const { origine, clone } = depotGit(t);
  const worktrees = join(repertoireTemporaire(t), "worktrees");
  return { origine, clone, worktrees, depot: ouvrirDepot({ clone, base: BASE, worktrees, env: ENV_GIT }) };
}

// Ce qu'un humain pousse sur la branche d'un cook, depuis son propre clone :
// une mise à jour de branche, un correctif à la main. Rend son commit.
function pousserALaMain(t: TestContext, origine: string, branche: string, fichier: string): string {
  const sien = join(repertoireTemporaire(t), "chef");
  git(dirname(sien), "clone", "-q", "--branch", branche, origine, sien);
  writeFileSync(join(sien, fichier), "du chef\n");
  git(sien, "add", ".");
  git(sien, "commit", "-q", "-m", `le chef écrit ${fichier}`);
  git(sien, "push", "-q", "origin", branche);
  return git(sien, "rev-parse", "HEAD");
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

  test("ce qu'un push publierait se lit en entier : un fichier binaire, un fichier que le cook a dit de ne pas lire, la résolution d'un merge", async (t) => {
    const { depot } = projet(t);
    const { worktree, branche } = await depot.preparer("15-abc");
    const commit = (message: string) => (git(worktree, "add", "-A"), git(worktree, "commit", "-q", "-m", message));
    // Un octet nul : git tient le fichier pour binaire.
    writeFileSync(join(worktree, "dev.sqlite"), Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from("valeur-dans-un-binaire"), Buffer.from([0])]));
    commit("une base de dev");
    // Un attribut que le cook écrit lui-même.
    writeFileSync(join(worktree, ".gitattributes"), "*.cache -diff\n*.bin binary\n");
    writeFileSync(join(worktree, "a.cache"), "valeur-sous-attribut-diff\n");
    writeFileSync(join(worktree, "a.bin"), "valeur-sous-attribut-binary\n");
    commit("un cache, dit dans le message : valeur-dans-un-message");
    // Un merge dont la résolution introduit ce qu'aucun de ses parents ne porte.
    git(worktree, "checkout", "-q", "-b", "cote", "HEAD~2");
    commiter(worktree, "voisin.txt");
    git(worktree, "checkout", "-q", branche);
    git(worktree, "merge", "-q", "--no-ff", "--no-commit", "cote");
    writeFileSync(join(worktree, "voisin.txt"), "valeur-dans-une-resolution\n");
    commit("merge de cote");

    const ajouts = depot.ajouts(branche);

    for (const valeur of ["valeur-dans-un-binaire", "valeur-sous-attribut-diff", "valeur-sous-attribut-binary", "valeur-dans-un-message", "valeur-dans-une-resolution"]) {
      assert.ok(ajouts.includes(valeur), valeur);
    }
  });

  test("ce qu'un push publierait ne compte pas ce que l'origine a déjà reçu de la branche, et la branche y revient", async (t) => {
    const { depot } = projet(t);
    const { worktree, branche } = await depot.preparer("15-abc");
    commiter(worktree, "livre.txt");
    depot.pousser(branche);
    const livre = git(worktree, "rev-parse", "HEAD");
    commiter(worktree, "fautif.txt");

    assert.ok(depot.ajouts(branche).includes("fautif.txt"));
    assert.equal(depot.ajouts(branche).includes("livre.txt"), false);

    depot.revenir(worktree, branche);
    assert.equal(git(worktree, "rev-parse", "HEAD"), livre);
    assert.equal(existsSync(join(worktree, "fautif.txt")), false);
    assert.equal(depot.ajouts(branche), "");
  });

  test("ce qu'un push publierait dit le fichier écrit sous les préfixes `a/` et `b/`, quoi que règle la config git de la station", async (t) => {
    const { clone, depot } = projet(t);
    git(clone, "config", "diff.noprefix", "true");
    git(clone, "config", "diff.mnemonicPrefix", "true");
    const { worktree, branche } = await depot.preparer("15-abc");
    // Un blanc dans le chemin : git termine alors la ligne par une tabulation.
    mkdirSync(join(worktree, "my backup"));
    writeFileSync(join(worktree, "my backup/.credentials.json"), "{}\n");
    git(worktree, "add", "-A");
    git(worktree, "commit", "-q", "-m", "une copie");

    assert.ok(depot.ajouts(branche).includes("--- /dev/null\n+++ b/my backup/.credentials.json\t\n"));
    assert.deepEqual(identifiantsLivres(depot.ajouts(branche)), ["name"]);
  });

  test("les identifiants de Claude se reconnaissent dans ce que la branche ajoute, pas dans ce que la base portait déjà", async (t) => {
    const { origine, depot } = projet(t);
    // Un jeton fabriqué, assemblé ici : sa forme n'est écrite en clair nulle part.
    const jeton = ["sk", "ant", "oat01", "A".repeat(90)].join("-");
    // La base porte déjà un exemple de pleine longueur, et un `.credentials.json` à elle.
    const semis = join(repertoireTemporaire(t), "semis");
    git(join(semis, ".."), "clone", "-q", origine, semis);
    writeFileSync(join(semis, "exemple.md"), `avant\nun exemple : ${jeton}\naprès\n`);
    writeFileSync(join(semis, ".credentials.json"), '{"service":"du projet"}\n');
    git(semis, "add", "-A");
    git(semis, "commit", "-q", "-m", "un exemple et un fichier du projet");
    git(semis, "push", "-q", "origin", BASE);
    const { worktree, branche } = await depot.preparer("15-abc");
    const commit = (message: string) => (git(worktree, "add", "-A"), git(worktree, "commit", "-q", "-m", message));
    const signes = () => identifiantsLivres(depot.ajouts(branche));

    // Modifier la ligne voisine d'un jeton déjà publié : il n'est que du contexte.
    writeFileSync(join(worktree, "exemple.md"), `avant, retouché\nun exemple : ${jeton}\naprès\n`);
    commit("retouche la ligne voisine");
    assert.deepEqual(signes(), []);
    // Le tronquer — le remède que la doc prescrit : il n'est que retiré.
    writeFileSync(join(worktree, "exemple.md"), `avant, retouché\nun exemple : ${jeton.slice(0, 20)}…\naprès\n`);
    commit("tronque l'exemple");
    assert.deepEqual(signes(), []);
    // Modifier le fichier du projet : il n'est pas créé.
    writeFileSync(join(worktree, ".credentials.json"), '{"service":"du projet","port":1}\n');
    commit("règle le service");
    assert.deepEqual(signes(), []);
    depot.pousser(branche);

    // Écrit puis retiré dans la branche : le commit qui l'ajoute serait poussé.
    writeFileSync(join(worktree, "notes.txt"), `${jeton}\n`);
    commit("des notes");
    rmSync(join(worktree, "notes.txt"));
    commit("retire les notes");
    assert.deepEqual(signes(), ["shape"]);
    depot.revenir(worktree, branche);

    // Un message de commit qui se déguise en patch ne cache rien.
    commiter(worktree, "travail.txt");
    git(worktree, "commit", "-q", "--amend", "-m", `le travail\n\ndiff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,3 +0,0 @@\n-${jeton}\n ${jeton}`);
    assert.deepEqual(signes(), ["shape"]);
  });

  test("une branche jamais poussée revient à la base", async (t) => {
    const { clone, depot } = projet(t);
    const { worktree, branche } = await depot.preparer("15-abc");
    commiter(worktree, "fautif.txt");

    depot.revenir(worktree, branche);

    assert.equal(git(worktree, "rev-parse", "HEAD"), git(clone, "rev-parse", `origin/${BASE}`));
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

  test("un commit poussé à la main sur la branche entre deux cooks survit au renvoi : le cook repart de ce que l'origine porte, et son push ne l'écrase pas", async (t) => {
    const { origine, depot } = projet(t);
    const { worktree, branche } = await depot.preparer("15-abc");
    commiter(worktree);
    depot.pousser(branche);
    await depot.ranger(worktree, branche);
    const duChef = pousserALaMain(t, origine, branche, "du-chef.txt");

    const repris = await depot.reprendre("15-def", branche);

    assert.equal(depot.tete(branche), duChef);
    assert.deepEqual([existsSync(join(repris, "travail.txt")), existsSync(join(repris, "du-chef.txt"))], [true, true]);
    // Un cook de renvoi qui ne change rien : la branche repart telle quelle.
    depot.pousser(branche);
    assert.equal(git(origine, "rev-parse", branche), duChef);
    // Et celui qui commite livre par-dessus.
    commiter(repris, "correctif.txt");
    depot.pousser(branche);
    assert.equal(git(origine, "rev-parse", `${branche}~1`), duChef);
  });

  test("un commit poussé à la main pendant que le cook travaille n'est pas écrasé : le push échoue en le disant, et le cook suivant repart des deux", async (t) => {
    const { origine, depot } = projet(t);
    const { worktree, branche } = await depot.preparer("15-abc");
    commiter(worktree);
    depot.pousser(branche);
    const duChef = pousserALaMain(t, origine, branche, "du-chef.txt");
    commiter(worktree, "correctif.txt");
    // Un cook qui rapatrie tout l'origine met à jour la branche de suivi : ce
    // n'est pas elle qui dit ce que la station a poussé.
    git(worktree, "fetch", "-q", "origin", "+refs/heads/*:refs/remotes/origin/*");

    assert.throws(() => depot.pousser(branche), /^Error: git push : l'origine porte sur `cook\/15-abc` des commits que la station n'y a pas poussés .* rien n'est écrasé/);
    assert.equal(git(origine, "rev-parse", branche), duChef);

    await depot.ranger(worktree, branche);
    const repris = await depot.reprendre("15-def", branche);
    assert.deepEqual([existsSync(join(repris, "correctif.txt")), existsSync(join(repris, "du-chef.txt"))], [true, true]);
    depot.pousser(branche);
    assert.equal(git(origine, "rev-parse", branche), depot.tete(branche));
    assert.equal(git(origine, "merge-base", "--is-ancestor", duChef, branche), "");
  });

  test("une branche que l'origine et le clone ont changée au même endroit ne se reprend pas : l'échec le dit, sans worktree ni rien d'écrasé", async (t) => {
    const { origine, worktrees, depot } = projet(t);
    const { worktree, branche } = await depot.preparer("15-abc");
    commiter(worktree);
    depot.pousser(branche);
    // Un cook raté laisse sa récolte sur la branche locale ; le chef écrit le même fichier.
    writeFileSync(join(worktree, "dispute.txt"), "du cook\n");
    await depot.ranger(worktree, branche);
    const duCook = depot.tete(branche);
    const duChef = pousserALaMain(t, origine, branche, "dispute.txt");

    await assert.rejects(depot.reprendre("15-def", branche), /^Error: la branche `cook\/15-abc` a divergé de ce que l'origine en porte, en conflit .* à réconcilier à la main/);

    assert.equal(existsSync(join(worktrees, "15-def")), false);
    assert.equal(depot.tete(branche), duCook);
    assert.equal(git(origine, "rev-parse", branche), duChef);
  });

  test("une branche qu'un humain a réécrite sur l'origine entre deux cooks est adoptée telle quelle : l'ancien historique de la station n'y revient pas", async (t) => {
    const { origine, depot } = projet(t);
    const { worktree, branche } = await depot.preparer("15-abc");
    commiter(worktree);
    commiter(worktree, "suite.txt");
    depot.pousser(branche);
    await depot.ranger(worktree, branche);
    const ancienne = depot.tete(branche);
    // Le chef réécrit les deux commits en un, et force.
    const sien = join(repertoireTemporaire(t), "chef");
    git(dirname(sien), "clone", "-q", "--branch", branche, origine, sien);
    git(sien, "reset", "-q", "--soft", "HEAD~2");
    git(sien, "commit", "-q", "-m", "les deux commits du cook, en un");
    git(sien, "push", "-q", "--force", "origin", branche);
    const reecrite = git(sien, "rev-parse", "HEAD");

    await depot.reprendre("15-def", branche);

    assert.equal(depot.tete(branche), reecrite);
    depot.pousser(branche);
    assert.equal(git(origine, "rev-parse", branche), reecrite);
    assert.throws(() => git(origine, "merge-base", "--is-ancestor", ancienne, branche));
  });

  test("une branche rebasée par un renvoi dont le push a échoué se reprend telle que le cook l'a laissée : l'origine ne porte rien d'étranger, rien n'est fusionné", async (t) => {
    const { origine, depot } = projet(t);
    const { worktree, branche } = await depot.preparer("15-abc");
    commiter(worktree);
    depot.pousser(branche);
    // Le cook de renvoi réécrit son commit ; le push n'a pas lieu (réseau, jeton).
    writeFileSync(join(worktree, "travail.txt"), "le même travail, réécrit\n");
    git(worktree, "commit", "-q", "-a", "--amend", "-m", "le même travail, rebasé");
    await depot.ranger(worktree, branche);
    const rebasee = depot.tete(branche);

    await depot.reprendre("15-def", branche);

    assert.equal(depot.tete(branche), rebasee);
    depot.pousser(branche);
    assert.equal(git(origine, "rev-parse", branche), rebasee);
  });

  test("une branche poussée avant que la station ne retienne ses pushs se pousse encore : ce qu'elle en sait se lit alors sur sa branche de suivi", async (t) => {
    const { origine, clone, depot } = projet(t);
    const { worktree, branche } = await depot.preparer("15-abc");
    commiter(worktree);
    depot.pousser(branche);
    git(clone, "update-ref", "-d", `refs/brigade/origine/${branche}`);
    git(worktree, "commit", "-q", "--amend", "-m", "le même travail, rebasé");

    depot.pousser(branche);

    assert.equal(git(origine, "rev-parse", branche), depot.tete(branche));
  });

  test("une branche que l'origine n'a plus se reprend telle que le clone la porte, et se pousse à nouveau", async (t) => {
    const { origine, depot } = projet(t);
    const { worktree, branche } = await depot.preparer("15-abc");
    commiter(worktree);
    depot.pousser(branche);
    await depot.ranger(worktree, branche);
    git(origine, "update-ref", "-d", `refs/heads/${branche}`);

    const repris = await depot.reprendre("15-def", branche);

    assert.equal(existsSync(join(repris, "travail.txt")), true);
    depot.pousser(branche);
    assert.equal(git(origine, "rev-parse", branche), depot.tete(branche));
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

  test("chaque rapatriement de la base se signale, une fois la base du clone à jour : à la prise d'un ticket, à sa reprise, à la demande", async (t) => {
    const { origine, clone } = depotGit(t);
    const racine = repertoireTemporaire(t);
    // Ce que la base rapatriée porte, lu au moment du signal.
    const lus: Array<string | null> = [];
    const depot = ouvrirDepot({ clone, base: BASE, worktrees: join(racine, "worktrees"), env: ENV_GIT, apresRapatriement: () => void lus.push(lireALaBase({ clone, base: BASE }, "reseau", ENV_GIT)) });
    const merger = (contenu: string) => {
      const travail = join(racine, `travail-${lus.length}`);
      git(racine, "clone", "-q", origine, travail);
      writeFileSync(join(travail, "reseau"), contenu);
      git(travail, "add", ".");
      git(travail, "commit", "-q", "-m", "déclare un hôte");
      git(travail, "push", "-q", "origin", `HEAD:${BASE}`);
    };

    merger("un\n");
    const { worktree, branche } = await depot.preparer("15-abc");
    assert.deepEqual(lus, ["un\n"]);

    merger("deux\n");
    git(clone, "worktree", "remove", "--force", worktree);
    await depot.reprendre("15-abc", branche);
    assert.deepEqual(lus, ["un\n", "deux\n"]);

    merger("trois\n");
    await depot.rapatrier();
    assert.deepEqual(lus, ["un\n", "deux\n", "trois\n"]);
  });

  test("un signal de rapatriement qui lève ne retient pas le ticket", async (t) => {
    const { clone } = depotGit(t);
    const depot = ouvrirDepot({ clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT, apresRapatriement: () => { throw new Error("journal fermé"); } });

    const { worktree } = await depot.preparer("15-abc");

    assert.equal(existsSync(join(worktree, "LISEZMOI")), true);
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
    // Avec elle part ce que la station retenait de son dernier push.
    assert.equal(git(clone, "for-each-ref", "refs/brigade"), "");
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

// Le runtime lance `git` dans le worktree d'un cook hors de toute cloison. Or
// ce worktree désigne lui-même son dépôt, par des fichiers que le cook écrit :
// rien de ce qu'ils désignent ne doit être lu comme une configuration.
describe("un worktree que son cook a détourné", { concurrency: 8 }, () => {
  // Ce que le cook plante : une commande que `git` lancerait à chaque statut
  // (`core.fsmonitor`) et à chaque fichier relu (un filtre `clean`), et qui
  // laisse un témoin.
  function piege(t: TestContext) {
    const racine = repertoireTemporaire(t);
    const temoin = join(racine, "temoin");
    const commande = join(racine, "commande.sh");
    writeFileSync(commande, `#!/bin/sh\n: >>'${temoin}'\ncat\n`);
    chmodSync(commande, 0o755);
    return {
      racine,
      // Ajoute la commande à une configuration, et la fait appeler pour tout
      // fichier de l'arbre.
      planter(config: string, arbre: string) {
        appendFileSync(config, `[core]\n\tfsmonitor = ${commande}\n[filter "piege"]\n\tclean = ${commande}\n`);
        writeFileSync(join(arbre, ".gitattributes"), "* filter=piege\n");
      },
      execute: () => existsSync(temoin),
    };
  }
  // Le worktree d'un cook qui a commité, puis laissé un fichier suivi réécrit
  // et un fichier neuf : de quoi récolter.
  async function cookAuTravail(t: TestContext) {
    const lieu = projet(t);
    const { worktree, branche } = await lieu.depot.preparer("15-abc");
    commiter(worktree);
    writeFileSync(join(worktree, "travail.txt"), "réécrit\n");
    writeFileSync(join(worktree, "brouillon.txt"), "jamais commité\n");
    return { ...lieu, worktree, branche };
  }

  test("un clone nommé dans une autre casse que celle du disque reste le sien : ses worktrees ne passent pas pour détournés", async (t) => {
    const { clone, worktrees } = projet(t);
    const autreCasse = join(dirname(clone), basename(clone).toUpperCase());
    // Un volume qui distingue la casse n'a pas ce clone-là.
    if (!existsSync(autreCasse)) return t.skip("le volume distingue la casse");
    const depot = ouvrirDepot({ clone: autreCasse, base: BASE, worktrees, env: ENV_GIT });
    const { worktree, branche } = await depot.preparer("15-abc");
    commiter(worktree);
    writeFileSync(join(worktree, "brouillon.txt"), "jamais commité\n");

    depot.empreinte(worktree);
    assert.equal(depot.surSaBranche(worktree, branche), true);
    const recolte = depot.recolter(worktree, branche);
    assert.equal(depot.tete(branche), recolte);
    assert.equal(depot.intact(worktree), true);
  });

  test("son fichier `.git` réécrit vers un dépôt à lui : rien de ce dépôt n'est lu, ni au tick ni à la récolte, et le refus nomme le fichier", async (t) => {
    const { depot, worktree, branche } = await cookAuTravail(t);
    const { racine, planter, execute } = piege(t);
    git(racine, "init", "-q", "a-lui");
    planter(join(racine, "a-lui/.git/config"), worktree);
    writeFileSync(join(worktree, ".git"), `gitdir: ${join(racine, "a-lui/.git")}\n`);

    const refus = /« .*15-abc » ne désigne plus son dépôt dans le clone \(fichier `\.git` réécrit\)/;
    assert.throws(() => depot.empreinte(worktree), refus);
    assert.throws(() => depot.surSaBranche(worktree, branche), refus);
    assert.throws(() => depot.recolter(worktree, branche), refus);
    assert.throws(() => depot.intact(worktree), refus);
    assert.throws(() => depot.revenir(worktree, branche), refus);
    await assert.rejects(depot.ranger(worktree, branche), refus);

    assert.equal(execute(), false);
    // Rien n'est perdu : le worktree reste, avec ce que le cook y a laissé.
    assert.equal(readFileSync(join(worktree, "brouillon.txt"), "utf8"), "jamais commité\n");
  });

  test("son `.git` remplacé par un dépôt entier : le worktree n'est plus celui du clone, et rien de ce dépôt n'est lu", async (t) => {
    const { depot, worktree, branche } = await cookAuTravail(t);
    const { planter, execute } = piege(t);
    rmSync(join(worktree, ".git"));
    git(worktree, "init", "-q");
    planter(join(worktree, ".git/config"), worktree);

    const refus = /ne désigne plus son dépôt dans le clone/;
    assert.throws(() => depot.empreinte(worktree), refus);
    assert.throws(() => depot.recolter(worktree, branche), refus);
    await assert.rejects(depot.ranger(worktree, branche), refus);

    assert.equal(execute(), false);
  });

  test("le `commondir` de son répertoire d'administration réécrit : ni la configuration ni les références de ce qu'il désigne ne sont lues, et le refus nomme le fichier", async (t) => {
    const { clone, depot, worktree, branche } = await cookAuTravail(t);
    const { racine, planter, execute } = piege(t);
    // Une copie du `.git` du clone, objets et références compris : tout y
    // marche, sous une configuration qui est celle du cook — et la récolte y
    // serait commitée sur une branche que personne ne pousse.
    cpSync(join(clone, ".git"), join(racine, "commun"), { recursive: true });
    planter(join(racine, "commun/config"), worktree);
    writeFileSync(join(clone, ".git/worktrees/15-abc/commondir"), `${join(racine, "commun")}\n`);
    const tete = depot.tete(branche);

    const refus = /« .*15-abc » ne désigne plus son dépôt dans le clone \(`commondir` réécrit\)/;
    assert.throws(() => depot.empreinte(worktree), refus);
    assert.throws(() => depot.surSaBranche(worktree, branche), refus);
    assert.throws(() => depot.recolter(worktree, branche), refus);
    assert.throws(() => depot.intact(worktree), refus);
    assert.throws(() => depot.revenir(worktree, branche), refus);
    await assert.rejects(depot.ranger(worktree, branche), refus);

    assert.equal(execute(), false);
    assert.equal(depot.tete(branche), tete);
    assert.equal(git(join(racine, "commun"), "rev-parse", branche), tete);
    assert.equal(readFileSync(join(worktree, "brouillon.txt"), "utf8"), "jamais commité\n");
  });

  test("le `gitdir` de son répertoire d'administration réécrit vers un dépôt à lui : rien n'en est lu, la récolte se fait, et le rangement qui échoue le dit", async (t) => {
    const { clone, depot, worktree, branche } = await cookAuTravail(t);
    const { racine, planter, execute } = piege(t);
    git(racine, "init", "-q", "a-lui");
    planter(join(racine, "a-lui/.git/config"), join(racine, "a-lui"));
    writeFileSync(join(clone, ".git/worktrees/15-abc/gitdir"), `${join(racine, "a-lui/.git")}\n`);

    depot.empreinte(worktree);
    const recolte = depot.recolter(worktree, branche);
    assert.equal(depot.tete(branche), recolte);
    await assert.rejects(depot.ranger(worktree, branche), /git worktree/);

    assert.equal(execute(), false);
    assert.equal(existsSync(worktree), true);
  });

  test("un sous-module dont la configuration est à lui : `git` n'y descend pas, ni au tick ni à la récolte, et le reste du worktree est récolté", async (t) => {
    const { clone, depot, worktree, branche } = await cookAuTravail(t);
    const { planter, execute } = piege(t);
    const module = join(worktree, "module");
    git(worktree, "init", "-q", "module");
    commiter(module, "dedans.txt");
    git(worktree, "add", "module");
    git(worktree, "commit", "-q", "-m", "un sous-module");
    // Suivi et à jour : c'est là qu'un statut ordinaire descend voir.
    planter(join(module, ".git/config"), module);
    writeFileSync(join(module, "dedans.txt"), "réécrit\n");

    depot.empreinte(worktree);
    assert.equal(depot.surSaBranche(worktree, branche), true);
    assert.equal(depot.intact(worktree), false);
    const recolte = depot.recolter(worktree, branche);
    assert.equal(depot.intact(worktree), true);
    depot.revenir(worktree, branche);

    assert.equal(execute(), false);
    assert.deepEqual(git(clone, "show", "--format=", "--name-status", String(recolte)).split("\n"), ["A\tbrouillon.txt", "M\ttravail.txt"]);
  });
});

// Sous une identité de rôle, les deux gestes réseau de la station — rapatrier
// et pousser — partent avec son jeton.
describe("le dépôt sous une identité", { concurrency: 8 }, () => {
  const ENTETE = `Authorization: Basic ${Buffer.from("x-access-token:ghs_cook_secret").toString("base64")}`;

  test("le jeton n'atteint git que par son environnement : un en-tête pour github.com, et rien de la connexion du compte", () => {
    const env = environnementReseau({ PATH: "/bin" }, "ghs_cook_secret");

    assert.deepEqual(env, {
      PATH: "/bin",
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_COUNT: "4",
      GIT_CONFIG_KEY_0: "credential.helper",
      GIT_CONFIG_VALUE_0: "",
      GIT_CONFIG_KEY_1: "http.https://github.com/.extraheader",
      GIT_CONFIG_VALUE_1: ENTETE,
      // Un clone fait en SSH pousse quand même sous l'identité du rôle.
      GIT_CONFIG_KEY_2: "url.https://github.com/.insteadOf",
      GIT_CONFIG_VALUE_2: "git@github.com:",
      GIT_CONFIG_KEY_3: "url.https://github.com/.insteadOf",
      GIT_CONFIG_VALUE_3: "ssh://git@github.com/",
    });
  });

  test("ce que l'environnement réglait déjà pour git est gardé", () => {
    const env = environnementReseau({ GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "user.name", GIT_CONFIG_VALUE_0: "brigade" }, "ghs_cook_secret");

    assert.deepEqual([env.GIT_CONFIG_COUNT, env.GIT_CONFIG_KEY_0, env.GIT_CONFIG_KEY_1, env.GIT_CONFIG_KEY_4], ["5", "user.name", "credential.helper", "url.https://github.com/.insteadOf"]);
  });

  function sousIdentite(t: TestContext, jeton: { frais(): Promise<string>; courant(): string }) {
    const { origine, clone } = depotGit(t);
    const racine = repertoireTemporaire(t);
    const temoin = join(racine, "env-du-push");
    // Le crochet tourne dans le process de `git push` : il en voit l'environnement et les arguments.
    const crochet = join(clone, ".git/hooks/pre-push");
    mkdirSync(join(clone, ".git/hooks"), { recursive: true });
    writeFileSync(crochet, `#!/bin/sh\n{ env | grep '^GIT_CONFIG_'; echo "args: $*"; } > '${temoin}'\n`);
    chmodSync(crochet, 0o755);
    return { origine, clone, temoin, depot: ouvrirDepot({ clone, base: BASE, worktrees: join(racine, "worktrees"), env: ENV_GIT, jeton }) };
  }

  test("la branche d'un cook est poussée avec le jeton courant, qui n'est dans aucun argument", async (t) => {
    const demandes: string[] = [];
    const { origine, temoin, depot } = sousIdentite(t, {
      frais: async () => (demandes.push("frais"), "ghs_cook_secret"),
      courant: () => (demandes.push("courant"), "ghs_cook_secret"),
    });
    const { worktree, branche } = await depot.preparer("15-abc");
    commiter(worktree);

    depot.pousser(branche);

    assert.equal(git(origine, "rev-parse", branche), git(worktree, "rev-parse", "HEAD"));
    const vu = readFileSync(temoin, "utf8");
    assert.ok(vu.includes(`GIT_CONFIG_VALUE_1=${ENTETE}`), vu);
    assert.ok(!(vu.split("\n").find((ligne) => ligne.startsWith("args:")) ?? "").includes("ghs_"));
    // Rapatrier attend un jeton frais ; pousser, qui ne peut pas attendre, prend le courant.
    assert.deepEqual(demandes, ["frais", "courant"]);
  });

  test("sans jeton vivant, rien n'est poussé, et l'échec le dit", async (t) => {
    let vivant = true;
    const { origine, depot } = sousIdentite(t, {
      frais: async () => "ghs_cook_secret",
      courant: () => {
        if (vivant) return "ghs_cook_secret";
        throw new Error("jeton de l'identité « cook » indisponible");
      },
    });
    const { worktree, branche } = await depot.preparer("15-abc");
    commiter(worktree);
    vivant = false;

    assert.throws(() => depot.pousser(branche), /git push : jeton de l'identité « cook » indisponible/);
    assert.throws(() => git(origine, "rev-parse", "--verify", branche));
  });

  test("un push que GitHub refuse faute du droit `workflows` se lit comme tel : le motif nomme le droit manquant", async (t) => {
    const { origine, depot } = sousIdentite(t, { frais: async () => "ghs_cook_secret", courant: () => "ghs_cook_secret" });
    // GitHub, côté serveur : il refuse le push et dit pourquoi.
    const refus = join(origine, "hooks/pre-receive");
    mkdirSync(join(origine, "hooks"), { recursive: true });
    writeFileSync(refus, "#!/bin/sh\necho 'refusing to allow a GitHub App to create or update workflow `.github/workflows/ci.yml` without `workflows` permission' >&2\nexit 1\n");
    chmodSync(refus, 0o755);
    const { worktree, branche } = await depot.preparer("15-abc");
    commiter(worktree);

    assert.throws(() => depot.pousser(branche), /^Error: git push : droit `workflows` manquant — la livraison touche `\.github\/workflows\/`/);
  });

  test("sans jeton frais, la base n'est pas rapatriée", async (t) => {
    const { depot } = sousIdentite(t, {
      frais: async () => {
        throw new Error("identité « cook » : GitHub injoignable");
      },
      courant: () => "",
    });

    await assert.rejects(depot.rapatrier(), /identité « cook » : GitHub injoignable/);
    await assert.rejects(depot.preparer("15-abc"), /GitHub injoignable/);
  });
});
