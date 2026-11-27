// Le retard d'un clone sur son origine : combien de commits, lus sans rien écrire dans le
// clone — et ce que l'app en dit en tête de « Tous les projets », pour son propre code et
// pour le clone d'un projet qui est celui de brigade. Contre le vrai `git`, sur des dépôts
// d'essai dont l'origine est un dossier voisin : ni réseau, ni GitHub.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Project } from "../src/config.ts";
import { identity, readDelay, withoutToken, holdDelays, type Settings, type Seen } from "../src/delay.ts";
import type { Terminal } from "../src/terminals.ts";
import { WITHOUT_POSIX } from "./helpers/posix.ts";

const git = (folder: string, ...args: string[]) => execFileSync("git", ["-C", folder, "-c", "user.name=essai", "-c", "user.email=essai@example.invalid", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

// Autant de commits de plus, sur la branche courante du dépôt. Le message nomme le dépôt :
// deux commits vides de même parent, de même message et de la même seconde seraient le même commit.
function deliver(repository: string, howMany: number): void {
  for (let rank = 0; rank < howMany; rank++) git(repository, "commit", "-q", "--allow-empty", "-m", `livraison ${rank} de ${repository}`);
}

// Une origine sur `v2`, avec un dossier `app/` comme celui de ce dépôt, et de quoi la cloner.
function trial(t: TestContext) {
  // Le vrai chemin : c'est celui que `git` rend, et `/tmp` est un lien sur un Mac.
  const root = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-retard-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const origin = join(root, "origine");
  mkdirSync(join(origin, "app"), { recursive: true });
  execFileSync("git", ["init", "-q", "-b", "v2", origin]);
  writeFileSync(join(origin, "app/package.json"), "{}\n");
  git(origin, "add", ".");
  git(origin, "commit", "-q", "-m", "le premier");
  const disposable = join(root, "jetable");
  mkdirSync(disposable);
  const settings: Settings = { git: "git", delaiMs: 60_000, jetable: disposable };
  const cloneRepo = (name: string) => {
    const clone = join(root, name);
    execFileSync("git", ["clone", "-q", origin, clone]);
    return clone;
  };
  return { racine: root, origine: origin, jetable: disposable, reglages: settings, cloner: cloneRepo };
}

// Tout ce qu'un dossier contient : chaque fichier par son contenu, sa taille et l'instant de sa
// dernière écriture ; chaque dossier par son nom. Deux relevés égaux : rien n'y a été écrit.
// Les `*.lock` (`maintenance.lock`, `gc.pid`…) que la maintenance automatique de git pose et retire en
// tâche de fond ne comptent pas, ni l'instant d'un dossier où l'un d'eux a passé : ce n'est pas un écrit
// de la lecture, et ils peuvent disparaître entre le parcours et le `stat`. Un fichier ajouté, retiré
// ou réécrit, lui, change toujours le relevé.
function reading(folder: string): string[] {
  return (readdirSync(folder, { recursive: true, encoding: "utf8" }) as string[]).filter((path) => !path.endsWith(".lock")).sort().flatMap((path) => {
    try {
      const state = statSync(join(folder, path), { bigint: true });
      return [state.isDirectory() ? `${path}/` : `${path} ${state.size} ${state.mtimeNs} ${createHash("sha1").update(readFileSync(join(folder, path))).digest("hex")}`];
    } catch (error) {
      // Un fichier de maintenance qui part entre le parcours et le `stat` (hors `*.lock`, ex. un `tmp_*`) n'est pas non plus un écrit.
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && /(^|\/)(tmp_[^/]*|[^/]*\.tmp)$/.test(path)) return [];
      throw error;
    }
  });
}

const PARADE = (folder: string, name = "parade"): Project => ({ nom: name, dossier: folder });

// Un registre qui relève ce qu'on lui fait ouvrir, sans rien lancer.
function registry() {
  const openOnes: { projet: string; dossier: string; ecrit: string }[] = [];
  const shell = (project: Project, written: string): Terminal => {
    openOnes.push({ projet: project.nom, dossier: project.dossier, ecrit: written });
    return { id: openOnes.length, projet: project.nom, genre: "shell", titre: `shell ${openOnes.length}`, note: `écrit dans ce shell, sans Entrée : \`${written}\``, arrete: false };
  };
  return { ouverts: openOnes, shell };
}

// Les lectures dites à la vue, dans l'ordre, et la dernière.
function hold(settings: Settings, app: string | undefined, projects: () => readonly Project[] = () => []) {
  const saidEntries: Seen[] = [];
  const delays = holdDelays({ reglages: settings, app, projets: projects, surLecture: (seenOne) => void saidEntries.push(seenOne) });
  const last = (): Seen => {
    const seenOne = saidEntries.at(-1);
    assert.ok(seenOne !== undefined, "aucune lecture n'a été dite");
    return seenOne;
  };
  return { retards: delays, dites: saidEntries, derniere: last };
}

describe("le retard d'un clone sur son origine", () => {
  test("à jour : zéro commit, lu depuis un dossier du clone — et c'est la branche que le clone suit qui est comparée", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings, cloner: cloneRepo } = trial(t);
    const clone = cloneRepo("clone");

    const readOne = await readDelay(settings, join(clone, "app"));

    assert.deepEqual(readOne, { racine: clone, branche: "v2", suivie: "origin/v2", tete: git(clone, "rev-parse", "HEAD"), retard: 0, avance: 0 });
  });

  test("en retard de commits que le clone n'a jamais rapatriés : ils sont comptés, et rien n'est écrit dans le clone", async (t) => {
    const { origine: origin, jetable: disposable, reglages: settings, cloner: cloneRepo } = trial(t);
    // Un clone réglé pour que ses propres `git fetch` élaguent, étiquettent et fassent le ménage,
    // avec une étiquette à lui et une branche suivie que l'origine n'a plus : rien de tout cela ne bouge.
    git(origin, "branch", "partie");
    const clone = cloneRepo("clone");
    git(origin, "branch", "-D", "partie");
    git(origin, "tag", "v-origine");
    git(clone, "tag", "a-moi");
    for (const [key, value] of [["fetch.prune", "true"], ["fetch.pruneTags", "true"], ["fetch.writeCommitGraph", "true"], ["gc.auto", "1"], ["remote.origin.tagOpt", "--tags"]] as const) git(clone, "config", key, value);
    deliver(origin, 39);
    const top = git(origin, "rev-parse", "HEAD");
    const before = reading(clone);
    const tracked = git(clone, "rev-parse", "origin/v2");
    const references = git(clone, "for-each-ref");
    assert.match(references, /refs\/remotes\/origin\/partie/);

    const readOne = await readDelay(settings, clone);

    assert.ok(!("raison" in readOne), JSON.stringify(readOne));
    assert.equal(readOne.retard, 39);
    assert.equal(readOne.avance, 0);
    // Ni objet, ni référence, ni FETCH_HEAD : le clone est tel qu'il était, à l'octet et à l'instant près.
    assert.deepEqual(reading(clone), before);
    assert.equal(git(clone, "rev-parse", "origin/v2"), tracked);
    assert.equal(git(clone, "for-each-ref"), references);
    assert.throws(() => git(clone, "cat-file", "-e", `${top}^{commit}`), "le clone a reçu les commits de l'origine");
    // Ce qui a été rapatrié pour compter l'a été hors du clone, et n'y est plus.
    assert.deepEqual(readdirSync(disposable), []);
  });

  test("le clone a déjà rapatrié l'origine sans s'y mettre (`git fetch`) : compté sur ce qu'il a, sans rien rapatrier", async (t) => {
    const { origine: origin, jetable: disposable, reglages: settings, cloner: cloneRepo } = trial(t);
    const clone = cloneRepo("clone");
    deliver(origin, 2);
    git(clone, "fetch", "-q");
    const before = reading(clone);

    const readOne = await readDelay({ ...settings, jetable: join(disposable, "jamais-cree") }, clone);

    assert.equal("raison" in readOne ? readOne.raison : readOne.retard, 2);
    assert.deepEqual(reading(clone), before);
  });

  test("des commits que l'origine n'a pas ne cachent pas le retard : les deux nombres sont rendus", async (t) => {
    const { origine: origin, reglages: settings, cloner: cloneRepo } = trial(t);
    const clone = cloneRepo("clone");
    deliver(origin, 3);
    deliver(clone, 1);

    const readOne = await readDelay(settings, clone);

    assert.ok(!("raison" in readOne), JSON.stringify(readOne));
    assert.deepEqual([readOne.retard, readOne.avance], [3, 1]);
  });

  test("ce qui ne se lit pas est dit, jamais rendu comme un zéro", async (t) => {
    const { racine: root, origine: origin, reglages: settings, cloner: cloneRepo } = trial(t);
    const reason = async (folder: string, withIt: Settings = settings) => {
      const readOne = await readDelay(withIt, folder);
      assert.ok("raison" in readOne, `lu comme un nombre : ${JSON.stringify(readOne)}`);
      assert.ok(!("retard" in readOne));
      return readOne.raison;
    };

    // Un dossier qui n'est pas dans un clone.
    const bare = join(root, "nu");
    mkdirSync(bare);
    assert.match(await reason(bare), /is not in a git clone the app can read/);

    // Un clone qui n'est sur aucune branche.
    const detached = cloneRepo("detache");
    git(detached, "checkout", "-q", "--detach");
    assert.match(await reason(detached), /is on no branch/);

    // Une branche qui ne suit rien.
    const only = cloneRepo("seule");
    git(only, "checkout", "-q", "-b", "essai");
    assert.match(await reason(only), /the branch “essai” follows no branch of an origin/);

    // Une origine qui ne répond pas : le clone, lui, se lit — son commit est rendu.
    const cut = cloneRepo("coupe");
    git(cut, "remote", "set-url", "origin", join(root, "partie"));
    const readOne = await readDelay(settings, cut);
    assert.ok("raison" in readOne);
    assert.match(readOne.raison, /^the origin did not answer \(`git ls-remote origin refs\/heads\/v2`\): /);
    assert.equal(readOne.tete, git(cut, "rev-parse", "HEAD"));

    // Une branche que l'origine n'a plus.
    const orphan = cloneRepo("orpheline");
    git(origin, "branch", "-m", "v3");
    assert.match(await reason(orphan), /“origin\/v2” no longer exists on the origin/);

    // `git` lui-même, introuvable.
    assert.match(await reason(orphan, { ...settings, git: join(root, "pas-de-git") }), /is not in a git clone the app can read/);
  });

  test("ce que `git` dit d'une origine est redit sans le jeton de son adresse", () => {
    assert.equal(withoutToken("fatal: unable to access 'https://chef:ghp_secret@github.com/chef/brigade.git/': Could not resolve host"), "fatal: unable to access 'https://…@github.com/chef/brigade.git/': Could not resolve host");
    assert.equal(withoutToken("fatal: Could not resolve hostname github.com"), "fatal: Could not resolve hostname github.com");
  });

  test("deux adresses d'un même dépôt GitHub sont la même origine — pas deux dépôts voisins", () => {
    assert.equal(identity("git@github.com:Benomite/brigade.git\n"), identity("https://jeton@github.com/benomite/brigade"));
    assert.notEqual(identity("git@github.com:benomite/brigade.git"), identity("git@github.com:benomite/brigade-site.git"));
    assert.equal(identity("/srv/git/brigade.git/"), identity("/srv/git/brigade"));
  });
});

describe("ce que l'app dit de son propre code", () => {
  test("installée depuis le .dmg, elle n'a pas de clone : rien ne se dit de son code — ni « pas lu », ni bouton, ni alerte", async (t) => {
    const { origine: origin, reglages: settings, cloner: cloneRepo } = trial(t);
    // Un projet sur un clone de brigade en retard : sans clone de l'app, rien ne le reconnaît comme tel.
    const clone = cloneRepo("clone");
    deliver(origin, 3);
    const { retards: delays, derniere: last } = hold(settings, undefined, () => [PARADE(clone, "brigade")]);

    await delays.relire();

    assert.deepEqual(last().clones, []);
    assert.equal(last().alerte, undefined);
    assert.equal(delays.ecrire(registry(), "app"), undefined);
  });

  test("à jour : une ligne, avec la branche suivie — et aucune commande à écrire", async (t) => {
    const { reglages: settings, cloner: cloneRepo } = trial(t);
    const clone = cloneRepo("clone");
    const { retards: delays, derniere: last } = hold(settings, join(clone, "app"));

    await delays.relire();

    const seenOne = last();
    assert.deepEqual(seenOne.clones, [{ id: "app", etat: "a-jour", tete: "this app's code is up to date with origin/v2", lignes: [] }]);
    assert.equal(seenOne.alerte, undefined);
    assert.ok(!Number.isNaN(Date.parse(seenOne.a)));
    assert.equal(delays.ecrire(registry(), "app"), undefined);
  });

  test("en retard : combien de commits, que ce qu'elle montre peut être périmé, et le bouton qui la passe à la nouvelle version — la lecture, elle, ne touche à rien", async (t) => {
    const { origine: origin, reglages: settings, cloner: cloneRepo } = trial(t);
    const clone = cloneRepo("clone");
    deliver(origin, 39);
    const before = git(clone, "rev-parse", "HEAD");
    const { retards: delays, derniere: last } = hold(settings, join(clone, "app"));

    await delays.relire();

    const [app, ...others] = last().clones;
    assert.deepEqual(others, []);
    assert.equal(app?.etat, "en-retard");
    assert.equal(app?.tete, "THIS APP'S CODE IS 39 COMMITS BEHIND origin/v2");
    assert.match(app?.lignes.join("\n") ?? "", /What this app shows may be out of date/);
    assert.match(app?.lignes.join("\n") ?? "", /One click updates it and relaunches it on the new version — no terminal, nothing to copy\. Without a click, it switches to the new version the next time it is opened\./);
    assert.equal(app?.bouton, "update and relaunch the app");
    // Plus de commande à recopier pour son propre code.
    assert.equal(app?.commande, undefined);
    assert.equal(delays.ecrire(registry(), "app"), undefined);
    // La barre le dit aussi, quel que soit l'écran.
    assert.equal(last().alerte, "this app's code is 39 commits behind origin/v2");
    // Rien n'est mis à jour : le clone est sur le commit d'avant.
    assert.equal(git(clone, "rev-parse", "HEAD"), before);
  });

  test("un seul commit de retard se dit au singulier", async (t) => {
    const { origine: origin, reglages: settings, cloner: cloneRepo } = trial(t);
    const clone = cloneRepo("clone");
    deliver(origin, 1);
    const { retards: delays, derniere: last } = hold(settings, clone);

    await delays.relire();

    assert.equal(last().clones[0]?.tete, "THIS APP'S CODE IS 1 COMMIT BEHIND origin/v2");
  });

  test("le clone mis à jour pendant qu'elle tourne : elle dit qu'elle tourne encore sur le code d'avant, et qu'il faut la relancer", async (t) => {
    const { origine: origin, reglages: settings, cloner: cloneRepo } = trial(t);
    const clone = cloneRepo("clone");
    deliver(origin, 4);
    const { retards: delays, derniere: last } = hold(settings, join(clone, "app"));
    await delays.relire();
    assert.equal(last().clones[0]?.etat, "en-retard");

    git(clone, "pull", "-q");
    await delays.relire();

    const app = last().clones[0];
    assert.equal(app?.etat, "a-relancer");
    assert.equal(app?.tete, "THIS APP IS RUNNING OLDER CODE THAN ITS CLONE");
    assert.match(app?.lignes.join("\n") ?? "", /4 commits more/);
    assert.match(app?.lignes.join("\n") ?? "", /one click relaunches it/);
    // Le clone est à jour : il n'y a plus de `git pull` à écrire — un clic la relance.
    assert.equal(app?.commande, undefined);
    assert.equal(app?.bouton, "relaunch the app");
    assert.match(last().alerte ?? "", /relaunch/);
  });

  test("une origine qui ne répond pas : « pas lu », avec ce que `git` en a dit — jamais « à jour »", async (t) => {
    const { racine: root, reglages: settings, cloner: cloneRepo } = trial(t);
    const clone = cloneRepo("clone");
    git(clone, "remote", "set-url", "origin", join(root, "partie"));
    const { retards: delays, derniere: last } = hold(settings, clone);

    await delays.relire();

    const app = last().clones[0];
    assert.equal(app?.etat, "pas-lu");
    assert.equal(app?.tete, "how far this app's code is behind its origin was not read");
    assert.match(app?.lignes.join("\n") ?? "", /the origin did not answer/);
    assert.match(app?.lignes.join("\n") ?? "", /So nothing says this code is up to date/);
    assert.equal(app?.commande, undefined);
    assert.equal(app?.bouton, undefined);
  });

  test("une app qui n'est pas lancée d'un clone le dit, et ne lit aucun projet comme le sien", async (t) => {
    const { racine: root, reglages: settings, cloner: cloneRepo } = trial(t);
    const bare = join(root, "nu");
    mkdirSync(bare);
    const { retards: delays, derniere: last } = hold(settings, bare, () => [PARADE(cloneRepo("clone"))]);

    await delays.relire();

    assert.deepEqual(last().clones.map(({ id, etat: state }) => [id, state]), [["app", "pas-lu"]]);
  });
});

describe("le clone d'un projet, quand c'est celui de brigade", () => {
  test("le dossier du projet est le clone de l'app : dit une fois, le projet nommé — et c'est le bouton de l'app qui le met à jour, rien ne s'écrit dans un shell", async (t) => {
    const { origine: origin, reglages: settings, cloner: cloneRepo } = trial(t);
    const clone = cloneRepo("clone");
    const elsewhere = cloneRepo("ailleurs");
    git(elsewhere, "remote", "set-url", "origin", "git@github.com:chef/parade.git");
    deliver(origin, 3);
    const projects = [PARADE(elsewhere), PARADE(clone, "brigade")];
    const { retards: delays, derniere: last } = hold(settings, join(clone, "app"), () => projects);

    await delays.relire();

    const [app, ...others] = last().clones;
    assert.deepEqual(others, []);
    assert.match(app?.lignes.join("\n") ?? "", /It is also the clone of the project “brigade”/);
    assert.equal(app?.bouton, "update and relaunch the app");
    const { ouverts: openOnes, shell } = registry();
    assert.equal(delays.ecrire({ shell }, "app"), undefined);
    assert.deepEqual(openOnes, []);
    // Lire n'est pas mettre à jour : le clone a toujours ses trois commits de retard.
    await delays.relire();
    assert.equal(last().clones[0]?.tete, "THIS APP'S CODE IS 3 COMMITS BEHIND origin/v2");
  });

  test("son clone a des commits à lui : il ne peut pas simplement avancer — pas de bouton, la commande s'écrit dans un shell de l'espace du projet dont c'est le dossier, sans être envoyée", { skip: WITHOUT_POSIX }, async (t) => {
    const { origine: origin, reglages: settings, cloner: cloneRepo } = trial(t);
    const clone = cloneRepo("clone");
    deliver(origin, 3);
    deliver(clone, 1);
    const projects = [PARADE("/projets/parade"), PARADE(clone, "brigade")];
    const { retards: delays, derniere: last } = hold(settings, join(clone, "app"), () => projects);

    await delays.relire();

    const app = last().clones[0];
    assert.equal(app?.etat, "en-retard");
    assert.equal(app?.bouton, undefined);
    assert.equal(app?.commande, `git -C ${clone} pull`);
    assert.match(app?.lignes.join("\n") ?? "", /It cannot simply move forward, so it does not update itself\./);
    const { ouverts: openOnes, shell } = registry();
    const rendered = delays.ecrire({ shell }, "app");
    assert.deepEqual(openOnes, [{ projet: "brigade", dossier: clone, ecrit: `git -C ${clone} pull` }]);
    assert.ok(rendered !== undefined && "note" in rendered);
    assert.match(rendered.note, /sans Entrée/);
  });

  test("un autre clone de brigade parmi les projets a sa ligne — pas le projet d'un autre dépôt, ni celui dont le dossier n'est pas là", { skip: WITHOUT_POSIX }, async (t) => {
    const { racine: root, origine: origin, reglages: settings, cloner: cloneRepo } = trial(t);
    const clone = cloneRepo("clone");
    const second = cloneRepo("second");
    const neighbor = cloneRepo("voisin");
    git(neighbor, "remote", "set-url", "origin", join(root, "autre-depot"));
    const withoutGit = join(root, "sans-git");
    mkdirSync(withoutGit);
    deliver(origin, 2);
    // L'app, elle, s'est mise à jour : seul le clone du projet est en retard.
    git(clone, "pull", "-q");
    const projects: Project[] = [PARADE(neighbor, "voisin"), PARADE(join(second, "app"), "brigade"), PARADE(withoutGit, "sans-git"), { nom: "parti", dossier: second, refus: "dossier introuvable" }];
    const { retards: delays, derniere: last } = hold(settings, clone, () => projects);

    await delays.relire();

    const [app, project, ...others] = last().clones;
    assert.deepEqual(others, []);
    assert.equal(app?.etat, "a-jour");
    assert.equal(project?.id, second);
    assert.equal(project?.etat, "en-retard");
    assert.equal(project?.tete, "THE CLONE OF THE PROJECT “brigade” IS 2 COMMITS BEHIND origin/v2");
    assert.match(project?.lignes.join("\n") ?? "", /may be out of date/);
    assert.equal(project?.commande, `git -C ${second} pull`);
    assert.equal(last().alerte, "the clone of the project “brigade” is 2 commits behind origin/v2");
    const { ouverts: openOnes, shell } = registry();
    delays.ecrire({ shell }, second);
    assert.deepEqual(openOnes, [{ projet: "brigade", dossier: join(second, "app"), ecrit: `git -C ${second} pull` }]);
  });

  test("un chemin que le shell couperait est écrit entre apostrophes ; sans projet qui s'ouvre, rien n'est écrit et la commande se recopie", { skip: WITHOUT_POSIX }, async (t) => {
    const { origine: origin, reglages: settings, cloner: cloneRepo } = trial(t);
    const clone = cloneRepo("le clone du chef");
    deliver(origin, 1);
    // Des commits à lui : c'est la commande qui le met à jour, pas le bouton.
    deliver(clone, 1);
    const projects: Project[] = [{ nom: "parti", dossier: "/nulle/part", refus: "dossier introuvable" }];
    const { retards: delays, derniere: last } = hold(settings, clone, () => projects);

    await delays.relire();

    assert.equal(last().clones[0]?.commande, `git -C '${clone}' pull`);
    const { ouverts: openOnes, shell } = registry();
    const rendered = delays.ecrire({ shell }, "app");
    assert.deepEqual(openOnes, []);
    assert.ok(rendered !== undefined && "refus" in rendered);
    assert.match(rendered.refus, /^nothing is written: no project opens here/);
    assert.ok(rendered.refus.includes(`git -C '${clone}' pull`));
    // Un nom que la vue invente n'écrit rien non plus.
    assert.equal(delays.ecrire({ shell }, "ailleurs"), undefined);
    assert.equal(delays.ecrire({ shell }, 3), undefined);

    // Dès qu'un projet s'ouvre, c'est dans son espace — la commande nomme son clone, où qu'elle soit écrite.
    projects.push(PARADE("/projets/parade"));
    delays.ecrire({ shell }, "app");
    assert.deepEqual(openOnes, [{ projet: "parade", dossier: "/projets/parade", ecrit: `git -C '${clone}' pull` }]);
  });
});

describe("une lecture à la fois", () => {
  test("revenir trois fois à la fenêtre pendant une lecture n'en lance aucune de plus", async (t) => {
    const { reglages: settings, cloner: cloneRepo } = trial(t);
    const clone = cloneRepo("clone");
    const { retards: delays, dites: saidEntries } = hold(settings, clone);

    await Promise.all([delays.relire(), delays.relire(), delays.relire(), delays.relire()]);

    assert.equal(saidEntries.length, 1);
    assert.deepEqual(delays.vu(), saidEntries[0]);
    // La suivante, elle, lit de nouveau.
    await delays.relire();
    assert.equal(saidEntries.length, 2);
  });

  test("les projets changent pendant une lecture : une autre la suit, une seule — et elle les voit", { skip: WITHOUT_POSIX }, async (t) => {
    const { origine: origin, reglages: settings, cloner: cloneRepo } = trial(t);
    const clone = cloneRepo("clone");
    const second = cloneRepo("second");
    deliver(origin, 1);
    const projects: Project[] = [];
    const { retards: delays, dites: saidEntries } = hold(settings, clone, () => projects);

    const readOut = delays.relire();
    projects.push(PARADE(second, "brigade"));
    await Promise.all([readOut, delays.relire(true), delays.relire(true)]);

    assert.equal(saidEntries.length, 2);
    assert.deepEqual(saidEntries[1]?.clones.map(({ id }) => id), ["app", second]);
  });

  test("l'app fermée, une lecture en route ne dit plus rien", async (t) => {
    const { reglages: settings, cloner: cloneRepo } = trial(t);
    const clone = cloneRepo("clone");
    const { retards: delays, dites: saidEntries } = hold(settings, clone);

    const readOut = delays.relire();
    delays.fermer();
    await readOut;

    assert.deepEqual(saidEntries, []);
  });
});
