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
import type { Projet } from "../src/config.ts";
import { identite, lireRetard, sansJeton, tenirRetards, type Reglages, type Vu } from "../src/retard.ts";
import type { Terminal } from "../src/terminaux.ts";

const git = (dossier: string, ...args: string[]) => execFileSync("git", ["-C", dossier, "-c", "user.name=essai", "-c", "user.email=essai@example.invalid", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

// Autant de commits de plus, sur la branche courante du dépôt. Le message nomme le dépôt :
// deux commits vides de même parent, de même message et de la même seconde seraient le même commit.
function livrer(depot: string, combien: number): void {
  for (let rang = 0; rang < combien; rang++) git(depot, "commit", "-q", "--allow-empty", "-m", `livraison ${rang} de ${depot}`);
}

// Une origine sur `v2`, avec un dossier `app/` comme celui de ce dépôt, et de quoi la cloner.
function essai(t: TestContext) {
  // Le vrai chemin : c'est celui que `git` rend, et `/tmp` est un lien sur un Mac.
  const racine = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-retard-")));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const origine = join(racine, "origine");
  mkdirSync(join(origine, "app"), { recursive: true });
  execFileSync("git", ["init", "-q", "-b", "v2", origine]);
  writeFileSync(join(origine, "app/package.json"), "{}\n");
  git(origine, "add", ".");
  git(origine, "commit", "-q", "-m", "le premier");
  const jetable = join(racine, "jetable");
  mkdirSync(jetable);
  const reglages: Reglages = { git: "git", delaiMs: 60_000, jetable };
  const cloner = (nom: string) => {
    const clone = join(racine, nom);
    execFileSync("git", ["clone", "-q", origine, clone]);
    return clone;
  };
  return { racine, origine, jetable, reglages, cloner };
}

// Tout ce qu'un dossier contient : chaque fichier par son contenu, sa taille et l'instant
// de sa dernière écriture ; chaque dossier par cet instant. Deux relevés égaux : rien n'y a été écrit.
function releve(dossier: string): string[] {
  return (readdirSync(dossier, { recursive: true, encoding: "utf8" }) as string[]).sort().map((chemin) => {
    const etat = statSync(join(dossier, chemin), { bigint: true });
    return etat.isDirectory() ? `${chemin}/ ${etat.mtimeNs}` : `${chemin} ${etat.size} ${etat.mtimeNs} ${createHash("sha1").update(readFileSync(join(dossier, chemin))).digest("hex")}`;
  });
}

const PARADE = (dossier: string, nom = "parade"): Projet => ({ nom, dossier, box: { hote: "box" } });

// Un registre qui relève ce qu'on lui fait ouvrir, sans rien lancer.
function registre() {
  const ouverts: { projet: string; dossier: string; ecrit: string }[] = [];
  const shell = (projet: Projet, ecrit: string): Terminal => {
    ouverts.push({ projet: projet.nom, dossier: projet.dossier, ecrit });
    return { id: ouverts.length, projet: projet.nom, genre: "shell", titre: `shell ${ouverts.length}`, note: `écrit dans ce shell, sans Entrée : \`${ecrit}\``, arrete: false };
  };
  return { ouverts, shell };
}

// Les lectures dites à la vue, dans l'ordre, et la dernière.
function tenir(reglages: Reglages, app: string, projets: () => readonly Projet[] = () => []) {
  const dites: Vu[] = [];
  const retards = tenirRetards({ reglages, app, projets, surLecture: (vu) => void dites.push(vu) });
  const derniere = (): Vu => {
    const vu = dites.at(-1);
    assert.ok(vu !== undefined, "aucune lecture n'a été dite");
    return vu;
  };
  return { retards, dites, derniere };
}

describe("le retard d'un clone sur son origine", () => {
  test("à jour : zéro commit, lu depuis un dossier du clone — et c'est la branche que le clone suit qui est comparée", async (t) => {
    const { reglages, cloner } = essai(t);
    const clone = cloner("clone");

    const lu = await lireRetard(reglages, join(clone, "app"));

    assert.deepEqual(lu, { racine: clone, branche: "v2", suivie: "origin/v2", tete: git(clone, "rev-parse", "HEAD"), retard: 0, avance: 0 });
  });

  test("en retard de commits que le clone n'a jamais rapatriés : ils sont comptés, et rien n'est écrit dans le clone", async (t) => {
    const { origine, jetable, reglages, cloner } = essai(t);
    // Un clone réglé pour que ses propres `git fetch` élaguent, étiquettent et fassent le ménage,
    // avec une étiquette à lui et une branche suivie que l'origine n'a plus : rien de tout cela ne bouge.
    git(origine, "branch", "partie");
    const clone = cloner("clone");
    git(origine, "branch", "-D", "partie");
    git(origine, "tag", "v-origine");
    git(clone, "tag", "a-moi");
    for (const [cle, valeur] of [["fetch.prune", "true"], ["fetch.pruneTags", "true"], ["fetch.writeCommitGraph", "true"], ["gc.auto", "1"], ["remote.origin.tagOpt", "--tags"]] as const) git(clone, "config", cle, valeur);
    livrer(origine, 39);
    const sommet = git(origine, "rev-parse", "HEAD");
    const avant = releve(clone);
    const suivie = git(clone, "rev-parse", "origin/v2");
    const references = git(clone, "for-each-ref");
    assert.match(references, /refs\/remotes\/origin\/partie/);

    const lu = await lireRetard(reglages, clone);

    assert.ok(!("raison" in lu), JSON.stringify(lu));
    assert.equal(lu.retard, 39);
    assert.equal(lu.avance, 0);
    // Ni objet, ni référence, ni FETCH_HEAD : le clone est tel qu'il était, à l'octet et à l'instant près.
    assert.deepEqual(releve(clone), avant);
    assert.equal(git(clone, "rev-parse", "origin/v2"), suivie);
    assert.equal(git(clone, "for-each-ref"), references);
    assert.throws(() => git(clone, "cat-file", "-e", `${sommet}^{commit}`), "le clone a reçu les commits de l'origine");
    // Ce qui a été rapatrié pour compter l'a été hors du clone, et n'y est plus.
    assert.deepEqual(readdirSync(jetable), []);
  });

  test("le clone a déjà rapatrié l'origine sans s'y mettre (`git fetch`) : compté sur ce qu'il a, sans rien rapatrier", async (t) => {
    const { origine, jetable, reglages, cloner } = essai(t);
    const clone = cloner("clone");
    livrer(origine, 2);
    git(clone, "fetch", "-q");
    const avant = releve(clone);

    const lu = await lireRetard({ ...reglages, jetable: join(jetable, "jamais-cree") }, clone);

    assert.equal("raison" in lu ? lu.raison : lu.retard, 2);
    assert.deepEqual(releve(clone), avant);
  });

  test("des commits que l'origine n'a pas ne cachent pas le retard : les deux nombres sont rendus", async (t) => {
    const { origine, reglages, cloner } = essai(t);
    const clone = cloner("clone");
    livrer(origine, 3);
    livrer(clone, 1);

    const lu = await lireRetard(reglages, clone);

    assert.ok(!("raison" in lu), JSON.stringify(lu));
    assert.deepEqual([lu.retard, lu.avance], [3, 1]);
  });

  test("ce qui ne se lit pas est dit, jamais rendu comme un zéro", async (t) => {
    const { racine, origine, reglages, cloner } = essai(t);
    const raison = async (dossier: string, avec: Reglages = reglages) => {
      const lu = await lireRetard(avec, dossier);
      assert.ok("raison" in lu, `lu comme un nombre : ${JSON.stringify(lu)}`);
      assert.ok(!("retard" in lu));
      return lu.raison;
    };

    // Un dossier qui n'est pas dans un clone.
    const nu = join(racine, "nu");
    mkdirSync(nu);
    assert.match(await raison(nu), /n'est pas dans un clone git/);

    // Un clone qui n'est sur aucune branche.
    const detache = cloner("detache");
    git(detache, "checkout", "-q", "--detach");
    assert.match(await raison(detache), /sur aucune branche/);

    // Une branche qui ne suit rien.
    const seule = cloner("seule");
    git(seule, "checkout", "-q", "-b", "essai");
    assert.match(await raison(seule), /« essai » ne suit aucune branche/);

    // Une origine qui ne répond pas : le clone, lui, se lit — son commit est rendu.
    const coupe = cloner("coupe");
    git(coupe, "remote", "set-url", "origin", join(racine, "partie"));
    const lu = await lireRetard(reglages, coupe);
    assert.ok("raison" in lu);
    assert.match(lu.raison, /^l'origine n'a pas répondu \(`git ls-remote origin refs\/heads\/v2`\) : /);
    assert.equal(lu.tete, git(coupe, "rev-parse", "HEAD"));

    // Une branche que l'origine n'a plus.
    const orpheline = cloner("orpheline");
    git(origine, "branch", "-m", "v3");
    assert.match(await raison(orpheline), /« origin\/v2 » n'existe plus sur l'origine/);

    // `git` lui-même, introuvable.
    assert.match(await raison(orpheline, { ...reglages, git: join(racine, "pas-de-git") }), /n'est pas dans un clone git/);
  });

  test("ce que `git` dit d'une origine est redit sans le jeton de son adresse", () => {
    assert.equal(sansJeton("fatal: unable to access 'https://chef:ghp_secret@github.com/chef/brigade.git/': Could not resolve host"), "fatal: unable to access 'https://…@github.com/chef/brigade.git/': Could not resolve host");
    assert.equal(sansJeton("ssh: Could not resolve hostname github.com"), "ssh: Could not resolve hostname github.com");
  });

  test("deux adresses d'un même dépôt GitHub sont la même origine — pas deux dépôts voisins", () => {
    assert.equal(identite("git@github.com:Benomite/brigade.git\n"), identite("https://jeton@github.com/benomite/brigade"));
    assert.notEqual(identite("git@github.com:benomite/brigade.git"), identite("git@github.com:benomite/brigade-site.git"));
    assert.equal(identite("/srv/git/brigade.git/"), identite("/srv/git/brigade"));
  });
});

describe("ce que l'app dit de son propre code", () => {
  test("à jour : une ligne, avec la branche suivie — et aucune commande à écrire", async (t) => {
    const { reglages, cloner } = essai(t);
    const clone = cloner("clone");
    const { retards, derniere } = tenir(reglages, join(clone, "app"));

    await retards.relire();

    const vu = derniere();
    assert.deepEqual(vu.clones, [{ id: "app", etat: "a-jour", tete: "le code de cette app est à jour avec origin/v2", lignes: [] }]);
    assert.equal(vu.alerte, undefined);
    assert.ok(!Number.isNaN(Date.parse(vu.a)));
    assert.equal(retards.ecrire(registre(), "app"), undefined);
  });

  test("en retard : combien de commits, que ce qu'elle montre peut être périmé, et la commande — qu'elle ne lance pas", async (t) => {
    const { origine, reglages, cloner } = essai(t);
    const clone = cloner("clone");
    livrer(origine, 39);
    const avant = git(clone, "rev-parse", "HEAD");
    const { retards, derniere } = tenir(reglages, join(clone, "app"));

    await retards.relire();

    const [app, ...autres] = derniere().clones;
    assert.deepEqual(autres, []);
    assert.equal(app?.etat, "en-retard");
    assert.equal(app?.tete, "LE CODE DE CETTE APP EST EN RETARD DE 39 COMMITS SUR origin/v2");
    assert.match(app?.lignes.join("\n") ?? "", /Ce que cette app montre peut être périmé/);
    assert.match(app?.lignes.join("\n") ?? "", /relance-la/);
    assert.equal(app?.commande, `git -C ${clone} pull`);
    // La barre le dit aussi, quel que soit l'écran.
    assert.equal(derniere().alerte, "le code de cette app est en retard de 39 commits sur origin/v2");
    // Rien n'est mis à jour : le clone est sur le commit d'avant.
    assert.equal(git(clone, "rev-parse", "HEAD"), avant);
  });

  test("un seul commit de retard se dit au singulier", async (t) => {
    const { origine, reglages, cloner } = essai(t);
    const clone = cloner("clone");
    livrer(origine, 1);
    const { retards, derniere } = tenir(reglages, clone);

    await retards.relire();

    assert.equal(derniere().clones[0]?.tete, "LE CODE DE CETTE APP EST EN RETARD DE 1 COMMIT SUR origin/v2");
  });

  test("le clone mis à jour pendant qu'elle tourne : elle dit qu'elle tourne encore sur le code d'avant, et qu'il faut la relancer", async (t) => {
    const { origine, reglages, cloner } = essai(t);
    const clone = cloner("clone");
    livrer(origine, 4);
    const { retards, derniere } = tenir(reglages, join(clone, "app"));
    await retards.relire();
    assert.equal(derniere().clones[0]?.etat, "en-retard");

    git(clone, "pull", "-q");
    await retards.relire();

    const app = derniere().clones[0];
    assert.equal(app?.etat, "a-relancer");
    assert.equal(app?.tete, "CETTE APP TOURNE SUR UN CODE PLUS ANCIEN QUE CELUI DE SON CLONE");
    assert.match(app?.lignes.join("\n") ?? "", /4 commits de plus/);
    assert.match(app?.lignes.join("\n") ?? "", /relance-la/);
    // Le clone est à jour : il n'y a plus de `git pull` à écrire.
    assert.equal(app?.commande, undefined);
    assert.match(derniere().alerte ?? "", /relancer/);
  });

  test("une origine qui ne répond pas : « pas lu », avec ce que `git` en a dit — jamais « à jour »", async (t) => {
    const { racine, reglages, cloner } = essai(t);
    const clone = cloner("clone");
    git(clone, "remote", "set-url", "origin", join(racine, "partie"));
    const { retards, derniere } = tenir(reglages, clone);

    await retards.relire();

    const app = derniere().clones[0];
    assert.equal(app?.etat, "pas-lu");
    assert.equal(app?.tete, "le retard du code de cette app sur son origine n'a pas été lu");
    assert.match(app?.lignes.join("\n") ?? "", /l'origine n'a pas répondu/);
    assert.match(app?.lignes.join("\n") ?? "", /Rien ne dit donc que ce code est à jour/);
    assert.equal(app?.commande, undefined);
  });

  test("une app qui n'est pas lancée d'un clone le dit, et ne lit aucun projet comme le sien", async (t) => {
    const { racine, reglages, cloner } = essai(t);
    const nu = join(racine, "nu");
    mkdirSync(nu);
    const { retards, derniere } = tenir(reglages, nu, () => [PARADE(cloner("clone"))]);

    await retards.relire();

    assert.deepEqual(derniere().clones.map(({ id, etat }) => [id, etat]), [["app", "pas-lu"]]);
  });
});

describe("le clone d'un projet, quand c'est celui de brigade", () => {
  test("le dossier du projet est le clone de l'app : dit une fois, le projet nommé — et la commande s'écrit dans un shell de son espace, sans être envoyée", async (t) => {
    const { origine, reglages, cloner } = essai(t);
    const clone = cloner("clone");
    const ailleurs = cloner("ailleurs");
    git(ailleurs, "remote", "set-url", "origin", "git@github.com:chef/parade.git");
    livrer(origine, 3);
    const projets = [PARADE(ailleurs), PARADE(clone, "brigade")];
    const { retards, derniere } = tenir(reglages, join(clone, "app"), () => projets);

    await retards.relire();

    const [app, ...autres] = derniere().clones;
    assert.deepEqual(autres, []);
    assert.match(app?.lignes.join("\n") ?? "", /C'est aussi le clone du projet « brigade »/);
    const { ouverts, shell } = registre();
    const rendu = retards.ecrire({ shell }, "app");
    assert.deepEqual(ouverts, [{ projet: "brigade", dossier: clone, ecrit: `git -C ${clone} pull` }]);
    assert.ok(rendu !== undefined && "note" in rendu);
    assert.match(rendu.note, /sans Entrée/);
    // Écrire n'est pas lancer : le clone a toujours ses trois commits de retard.
    await retards.relire();
    assert.equal(derniere().clones[0]?.tete, "LE CODE DE CETTE APP EST EN RETARD DE 3 COMMITS SUR origin/v2");
  });

  test("un autre clone de brigade parmi les projets a sa ligne — pas le projet d'un autre dépôt, ni celui dont le dossier n'est pas là", async (t) => {
    const { racine, origine, reglages, cloner } = essai(t);
    const clone = cloner("clone");
    const second = cloner("second");
    const voisin = cloner("voisin");
    git(voisin, "remote", "set-url", "origin", join(racine, "autre-depot"));
    const sansGit = join(racine, "sans-git");
    mkdirSync(sansGit);
    livrer(origine, 2);
    // L'app, elle, s'est mise à jour : seul le clone du projet est en retard.
    git(clone, "pull", "-q");
    const projets: Projet[] = [PARADE(voisin, "voisin"), PARADE(join(second, "app"), "brigade"), PARADE(sansGit, "sans-git"), { nom: "parti", dossier: second, refus: "dossier introuvable" }];
    const { retards, derniere } = tenir(reglages, clone, () => projets);

    await retards.relire();

    const [app, projet, ...autres] = derniere().clones;
    assert.deepEqual(autres, []);
    assert.equal(app?.etat, "a-jour");
    assert.equal(projet?.id, second);
    assert.equal(projet?.etat, "en-retard");
    assert.equal(projet?.tete, "LE CLONE DE « brigade » EST EN RETARD DE 2 COMMITS SUR origin/v2");
    assert.match(projet?.lignes.join("\n") ?? "", /peut être périmé/);
    assert.equal(projet?.commande, `git -C ${second} pull`);
    assert.equal(derniere().alerte, "le clone de « brigade » est en retard de 2 commits sur origin/v2");
    const { ouverts, shell } = registre();
    retards.ecrire({ shell }, second);
    assert.deepEqual(ouverts, [{ projet: "brigade", dossier: join(second, "app"), ecrit: `git -C ${second} pull` }]);
  });

  test("un chemin que le shell couperait est écrit entre apostrophes ; sans projet qui s'ouvre, rien n'est écrit et la commande se recopie", async (t) => {
    const { origine, reglages, cloner } = essai(t);
    const clone = cloner("le clone du chef");
    livrer(origine, 1);
    const projets: Projet[] = [{ nom: "parti", dossier: "/nulle/part", refus: "dossier introuvable" }];
    const { retards, derniere } = tenir(reglages, clone, () => projets);

    await retards.relire();

    assert.equal(derniere().clones[0]?.commande, `git -C '${clone}' pull`);
    const { ouverts, shell } = registre();
    const rendu = retards.ecrire({ shell }, "app");
    assert.deepEqual(ouverts, []);
    assert.ok(rendu !== undefined && "refus" in rendu);
    assert.match(rendu.refus, /^rien n'est écrit : aucun projet ne s'ouvre/);
    assert.ok(rendu.refus.includes(`git -C '${clone}' pull`));
    // Un nom que la vue invente n'écrit rien non plus.
    assert.equal(retards.ecrire({ shell }, "ailleurs"), undefined);
    assert.equal(retards.ecrire({ shell }, 3), undefined);

    // Dès qu'un projet s'ouvre, c'est dans son espace — la commande nomme son clone, où qu'elle soit écrite.
    projets.push(PARADE("/projets/parade"));
    retards.ecrire({ shell }, "app");
    assert.deepEqual(ouverts, [{ projet: "parade", dossier: "/projets/parade", ecrit: `git -C '${clone}' pull` }]);
  });
});

describe("une lecture à la fois", () => {
  test("revenir trois fois à la fenêtre pendant une lecture n'en lance aucune de plus", async (t) => {
    const { reglages, cloner } = essai(t);
    const clone = cloner("clone");
    const { retards, dites } = tenir(reglages, clone);

    await Promise.all([retards.relire(), retards.relire(), retards.relire(), retards.relire()]);

    assert.equal(dites.length, 1);
    assert.deepEqual(retards.vu(), dites[0]);
    // La suivante, elle, lit de nouveau.
    await retards.relire();
    assert.equal(dites.length, 2);
  });

  test("les projets changent pendant une lecture : une autre la suit, une seule — et elle les voit", async (t) => {
    const { origine, reglages, cloner } = essai(t);
    const clone = cloner("clone");
    const second = cloner("second");
    livrer(origine, 1);
    const projets: Projet[] = [];
    const { retards, dites } = tenir(reglages, clone, () => projets);

    const lecture = retards.relire();
    projets.push(PARADE(second, "brigade"));
    await Promise.all([lecture, retards.relire(true), retards.relire(true)]);

    assert.equal(dites.length, 2);
    assert.deepEqual(dites[1]?.clones.map(({ id }) => id), ["app", second]);
  });

  test("l'app fermée, une lecture en route ne dit plus rien", async (t) => {
    const { reglages, cloner } = essai(t);
    const clone = cloner("clone");
    const { retards, dites } = tenir(reglages, clone);

    const lecture = retards.relire();
    retards.fermer();
    await lecture;

    assert.deepEqual(dites, []);
  });
});
