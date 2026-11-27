// Essayer une livraison depuis sa carte (#3215, essai.ts) : la déclaration `.brigade/try.json` lue (valable, absente, mal
// formée), le worktree de la livraison hors de la copie de travail du chef — qui n'en bouge pas —, « stop » qui finit la
// commande et tous ses enfants, et l'échec dit en une ligne avec la fin de la sortie. Éprouvé contre le vrai `git`.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { type EtatEssai, FICHIER_DE_L_ESSAI, lireLaDeclaration, lireLeTexte, sEssaie, tenirLesEssais } from "../src/essai.ts";
import { SANS_POSIX } from "./aides/posix.ts";

const ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
const git = (dossier: string, ...args: string[]) => execFileSync("git", ["-C", dossier, "-c", "commit.gpgsign=false", ...args], { encoding: "utf8", env: ENV }).trim();
const jusqua = async (fait: () => boolean, quoi: string) => {
  for (let i = 0; i < 400; i++) {
    if (fait()) return;
    await new Promise((fin) => setTimeout(fin, 5));
  }
  assert.fail(`jamais : ${quoi}`);
};
const vivant = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// Un projet git avec une branche `cook/7-essai` qui porte `version.txt` = « livree », et le chef sur `main`, un fichier modifié non commité.
function projet(declaration: string | undefined) {
  const racine = mkdtempSync(join(tmpdir(), "essai-"));
  const dossier = join(racine, "copie");
  const donnees = join(racine, "donnees");
  mkdirSync(dossier);
  mkdirSync(donnees);
  git(dossier, "init", "-q", "-b", "main");
  writeFileSync(join(dossier, "version.txt"), "main\n");
  if (declaration !== undefined) {
    mkdirSync(join(dossier, ".brigade"));
    writeFileSync(join(dossier, FICHIER_DE_L_ESSAI), declaration);
  }
  git(dossier, "add", ".");
  git(dossier, "commit", "-q", "-m", "base");
  git(dossier, "checkout", "-q", "-b", "cook/7-essai");
  writeFileSync(join(dossier, "version.txt"), "livree\n");
  git(dossier, "commit", "-q", "-am", "livraison");
  git(dossier, "checkout", "-q", "main");
  writeFileSync(join(dossier, "version.txt"), "main, modifiee par le chef\n");
  return { racine, dossier, donnees };
}
function essais(donnees: string) {
  const ouvertes: string[] = [];
  const changements: string[] = [];
  const tenus = tenirLesEssais({ dossierDonnees: donnees, ouvrir: (url) => ouvertes.push(url), surChangement: (nom) => changements.push(nom) });
  return { tenus, ouvertes, changements };
}
const etat = (tenus: ReturnType<typeof essais>["tenus"], dossier: string, ticket: number): EtatEssai | undefined => tenus.vu(dossier, "parade").essais[ticket];

describe("la déclaration .brigade/try.json", () => {
  test("valable : la commande, et l'adresse quand il y en a une", () => {
    assert.deepEqual(lireLeTexte('{"command": "npm install && npm run dev", "url": "http://localhost:5173"}'), { declaration: { command: "npm install && npm run dev", url: "http://localhost:5173" } });
    assert.deepEqual(lireLeTexte('{"command": "make run"}'), { declaration: { command: "make run" } });
  });
  test("absente : dite absente, jamais inventée", () => {
    const { racine, dossier } = projet(undefined);
    assert.deepEqual(lireLaDeclaration(dossier), { absente: true });
    rmSync(racine, { recursive: true, force: true });
  });
  test("mal formée : chaque cas dit pourquoi", () => {
    for (const brut of ["{", "[]", "{}", '{"command": ""}', '{"command": 3}', '{"command": "x", "url": 4}', '{"command": "x", "url": "javascript:alert(1)"}']) {
      const lue = lireLeTexte(brut);
      assert.ok("invalide" in lue, brut);
      assert.match(lue.invalide, /^\.brigade\/try\.json/);
    }
  });
  test("lue du dossier du projet", () => {
    const { racine, dossier } = projet('{"command": "echo"}');
    assert.deepEqual(lireLaDeclaration(dossier), { declaration: { command: "echo" } });
    rmSync(racine, { recursive: true, force: true });
  });
  test("seules les cartes en pass et livrées s'essaient", () => {
    assert.deepEqual(["en pass", "servi", "pris", "en attente", "86", undefined].map(sEssaie), [true, true, false, false, false, false]);
  });
});

describe("essayer une livraison", () => {
  test("le worktree vit sous le dossier de l'app ; la copie du chef, sa branche et ses changements n'en bougent pas", { skip: SANS_POSIX }, async () => {
    const { racine, dossier, donnees } = projet('{"command": "cat version.txt > vu.txt"}');
    const avant = { branche: git(dossier, "rev-parse", "--abbrev-ref", "HEAD"), statut: git(dossier, "status", "--porcelain"), fichier: readFileSync(join(dossier, "version.txt"), "utf8"), arbres: git(dossier, "worktree", "list", "--porcelain") };
    const { tenus } = essais(donnees);
    await tenus.essayer(dossier, "parade", 7);
    const worktree = join(donnees, "essais", "parade", "7");
    await jusqua(() => existsSync(join(worktree, "vu.txt")) && readFileSync(join(worktree, "vu.txt"), "utf8") !== "", "la commande a tourné dans le worktree");
    assert.equal(readFileSync(join(worktree, "vu.txt"), "utf8"), "livree\n", "la version de la livraison, pas celle du chef");
    assert.ok(!existsSync(join(dossier, "vu.txt")));
    assert.equal(git(dossier, "rev-parse", "--abbrev-ref", "HEAD"), avant.branche);
    assert.equal(git(dossier, "status", "--porcelain"), avant.statut);
    assert.equal(readFileSync(join(dossier, "version.txt"), "utf8"), avant.fichier);
    assert.ok(git(dossier, "worktree", "list", "--porcelain").includes(worktree), "git connaît le worktree, hors de la copie");
    assert.ok(!worktree.startsWith(dossier));
    assert.notEqual(avant.arbres, git(dossier, "worktree", "list", "--porcelain"));
    rmSync(racine, { recursive: true, force: true });
  });

  test("essayer deux fois la même livraison recrée son worktree sans erreur", { skip: SANS_POSIX }, async () => {
    const { racine, dossier, donnees } = projet('{"command": "echo passe >> traces.txt; cat traces.txt > vu.txt"}');
    const { tenus } = essais(donnees);
    const worktree = join(donnees, "essais", "parade", "7");
    await tenus.essayer(dossier, "parade", 7);
    await jusqua(() => existsSync(join(worktree, "vu.txt")) && etat(tenus, dossier, 7) === undefined, "le premier essai est fini");
    await tenus.essayer(dossier, "parade", 7);
    await jusqua(() => existsSync(join(worktree, "vu.txt")) && etat(tenus, dossier, 7) === undefined && readFileSync(join(worktree, "vu.txt"), "utf8") === "passe\n", "le second essai est fini, sur un worktree net");
    assert.equal(etat(tenus, dossier, 7), undefined, "aucune erreur");
    rmSync(racine, { recursive: true, force: true });
  });

  test("un dossier de l'app dans la copie de travail : aucun worktree n'y est créé", async () => {
    const { racine, dossier } = projet('{"command": "echo"}');
    const { tenus } = essais(join(dossier, "dedans"));
    await tenus.essayer(dossier, "parade", 7);
    const dit = etat(tenus, dossier, 7);
    assert.ok(dit !== undefined && "echec" in dit);
    assert.match(dit.echec.raison, /inside the working copy/);
    assert.ok(!existsSync(join(dossier, "dedans", "essais")));
    rmSync(racine, { recursive: true, force: true });
  });

  test("avec une adresse : la carte dit où, et elle s'ouvre ; sans adresse, la commande tourne dans sa fenêtre", { skip: SANS_POSIX }, async () => {
    const { racine, dossier, donnees } = projet('{"command": "sleep 30", "url": "http://localhost:5173"}');
    const { tenus, ouvertes } = essais(donnees);
    await tenus.essayer(dossier, "parade", 7);
    assert.deepEqual(etat(tenus, dossier, 7), { enCours: true, url: "http://localhost:5173" });
    assert.deepEqual(ouvertes, ["http://localhost:5173"]);
    await tenus.arreter("parade", 7);
    writeFileSync(join(dossier, FICHIER_DE_L_ESSAI), '{"command": "sleep 30"}');
    await tenus.essayer(dossier, "parade", 7);
    assert.deepEqual(etat(tenus, dossier, 7), { enCours: true });
    assert.equal(ouvertes.length, 1);
    await tenus.arreter("parade", 7);
    rmSync(racine, { recursive: true, force: true });
  });
});

describe("stop", () => {
  test("un clic finit la commande et tous ses enfants ; la carte revient à « try it »", { skip: SANS_POSIX }, async () => {
    const { racine, dossier, donnees } = projet('{"command": "sleep 60 & echo $! > enfant.pid; sleep 60"}');
    const { tenus, changements } = essais(donnees);
    await tenus.essayer(dossier, "parade", 7);
    const fichier = join(donnees, "essais", "parade", "7", "enfant.pid");
    await jusqua(() => existsSync(fichier) && readFileSync(fichier, "utf8").trim() !== "", "l'enfant s'est annoncé");
    const enfant = Number(readFileSync(fichier, "utf8"));
    assert.ok(vivant(enfant));
    await tenus.arreter("parade", 7);
    await jusqua(() => !vivant(enfant), "l'enfant est mort");
    assert.equal(etat(tenus, dossier, 7), undefined);
    assert.ok(changements.length >= 2, "la vue a été prévenue du départ et de l'arrêt");
    rmSync(racine, { recursive: true, force: true });
  });
});

describe("un échec", () => {
  test("code non nul : une ligne de raison, puis la fin de la sortie — pas son début ; rien ne tourne plus", { skip: SANS_POSIX }, async () => {
    const { racine, dossier, donnees } = projet('{"command": "for i in $(seq 1 40); do echo ligne-$i; done; echo boom >&2; exit 3"}');
    const { tenus } = essais(donnees);
    await tenus.essayer(dossier, "parade", 7);
    await jusqua(() => etat(tenus, dossier, 7) !== undefined && !("enCours" in (etat(tenus, dossier, 7) ?? {})), "l'échec est dit");
    const dit = etat(tenus, dossier, 7);
    assert.ok(dit !== undefined && "echec" in dit);
    assert.equal(dit.echec.raison, "the command exited with code 3");
    const lignes = dit.echec.fin.split("\n");
    assert.ok(lignes.length <= 10);
    assert.ok(lignes.includes("ligne-40") && lignes.includes("boom"), dit.echec.fin);
    assert.ok(!lignes.includes("ligne-1"), "la fin, pas le début");
    rmSync(racine, { recursive: true, force: true });
  });

  test("déclaration mal formée, absente ou livraison introuvable : une raison, aucun processus, aucun worktree", async () => {
    for (const [declaration, raison] of [
      ["{", /not valid JSON/],
      [undefined, /no \.brigade\/try\.json/],
      ['{"command": "echo"}', /no branch cook\/9-\* and no merge commit/],
    ] as const) {
      const { racine, dossier, donnees } = projet(declaration);
      const { tenus } = essais(donnees);
      await tenus.essayer(dossier, "parade", declaration === '{"command": "echo"}' ? 9 : 7);
      const dit = etat(tenus, dossier, declaration === '{"command": "echo"}' ? 9 : 7);
      assert.ok(dit !== undefined && "echec" in dit, String(declaration));
      assert.match(dit.echec.raison, raison);
      assert.equal(dit.echec.fin, "");
      assert.ok(!existsSync(join(donnees, "essais")));
      rmSync(racine, { recursive: true, force: true });
    }
  });

  test("un livré dont la branche est partie : son commit de fusion s'essaie", { skip: SANS_POSIX }, async () => {
    const { racine, dossier, donnees } = projet('{"command": "cat version.txt > vu.txt"}');
    git(dossier, "stash", "-q");
    git(dossier, "merge", "-q", "--no-ff", "-m", "Merge pull request #12 from x/cook/7-essai", "cook/7-essai");
    git(dossier, "branch", "-q", "-D", "cook/7-essai");
    const { tenus } = essais(donnees);
    await tenus.essayer(dossier, "parade", 7);
    const vu = join(donnees, "essais", "parade", "7", "vu.txt");
    await jusqua(() => existsSync(vu) && readFileSync(vu, "utf8") !== "", "la commande a tourné sur le commit de fusion");
    assert.equal(readFileSync(vu, "utf8"), "livree\n");
    rmSync(racine, { recursive: true, force: true });
  });

  test("une commande qui ne peut pas démarrer : une raison, et aucun processus", { skip: SANS_POSIX }, async () => {
    const { racine, dossier, donnees } = projet('{"command": "commande-qui-n-existe-pas-3215"}');
    const { tenus } = essais(donnees);
    await tenus.essayer(dossier, "parade", 7);
    await jusqua(() => etat(tenus, dossier, 7) !== undefined && !("enCours" in (etat(tenus, dossier, 7) ?? {})), "l'échec est dit");
    const dit = etat(tenus, dossier, 7);
    assert.ok(dit !== undefined && "echec" in dit);
    assert.match(dit.echec.raison, /code 127/);
    assert.match(dit.echec.fin, /not found/);
    rmSync(racine, { recursive: true, force: true });
  });
});
