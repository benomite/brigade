// Essayer une livraison depuis sa carte (#3215, trial.ts) : la déclaration `.brigade/try.json` lue (valable, absente, mal
// formée), le worktree de la livraison hors de la copie de travail du chef — qui n'en bouge pas —, « stop » qui finit la
// commande et tous ses enfants, et l'échec dit en une ligne avec la fin de la sortie. Éprouvé contre le vrai `git`.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { type StateTrial, FILE_OF_THE_TRIAL, readTheDeclaration, readTheText, sTries, holdTheTrials } from "../src/trial.ts";
import { WITHOUT_POSIX } from "./helpers/posix.ts";

const ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
const git = (folder: string, ...args: string[]) => execFileSync("git", ["-C", folder, "-c", "commit.gpgsign=false", ...args], { encoding: "utf8", env: ENV }).trim();
const until = async (done: () => boolean, what: string) => {
  for (let i = 0; i < 400; i++) {
    if (done()) return;
    await new Promise((end) => setTimeout(end, 5));
  }
  assert.fail(`jamais : ${what}`);
};
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// Un projet git avec une branche `cook/7-essai` qui porte `version.txt` = « livree », et le chef sur `main`, un fichier modifié non commité.
function project(declaration: string | undefined) {
  const root = mkdtempSync(join(tmpdir(), "essai-"));
  const folder = join(root, "copie");
  const data = join(root, "donnees");
  mkdirSync(folder);
  mkdirSync(data);
  git(folder, "init", "-q", "-b", "main");
  writeFileSync(join(folder, "version.txt"), "main\n");
  if (declaration !== undefined) {
    mkdirSync(join(folder, ".brigade"));
    writeFileSync(join(folder, FILE_OF_THE_TRIAL), declaration);
  }
  git(folder, "add", ".");
  git(folder, "commit", "-q", "-m", "base");
  git(folder, "checkout", "-q", "-b", "cook/7-essai");
  writeFileSync(join(folder, "version.txt"), "livree\n");
  git(folder, "commit", "-q", "-am", "livraison");
  git(folder, "checkout", "-q", "main");
  writeFileSync(join(folder, "version.txt"), "main, modifiee par le chef\n");
  return { racine: root, dossier: folder, donnees: data };
}
function trials(data: string) {
  const openEntries: string[] = [];
  const changes: string[] = [];
  const heldOnes = holdTheTrials({ dossierDonnees: data, ouvrir: (url) => openEntries.push(url), surChangement: (name) => changes.push(name) });
  return { tenus: heldOnes, ouvertes: openEntries, changements: changes };
}
const state = (heldOnes: ReturnType<typeof trials>["tenus"], folder: string, ticket: number): StateTrial | undefined => heldOnes.vu(folder, "parade").essais[ticket];

describe("la déclaration .brigade/try.json", () => {
  test("valable : la commande, et l'adresse quand il y en a une", () => {
    assert.deepEqual(readTheText('{"command": "npm install && npm run dev", "url": "http://localhost:5173"}'), { declaration: { command: "npm install && npm run dev", url: "http://localhost:5173" } });
    assert.deepEqual(readTheText('{"command": "make run"}'), { declaration: { command: "make run" } });
  });
  test("absente : dite absente, jamais inventée", () => {
    const { racine: root, dossier: folder } = project(undefined);
    assert.deepEqual(readTheDeclaration(folder), { absente: true });
    rmSync(root, { recursive: true, force: true });
  });
  test("mal formée : chaque cas dit pourquoi", () => {
    for (const raw of ["{", "[]", "{}", '{"command": ""}', '{"command": 3}', '{"command": "x", "url": 4}', '{"command": "x", "url": "javascript:alert(1)"}']) {
      const readEntry = readTheText(raw);
      assert.ok("invalide" in readEntry, raw);
      assert.match(readEntry.invalide, /^\.brigade\/try\.json/);
    }
  });
  test("lue du dossier du projet", () => {
    const { racine: root, dossier: folder } = project('{"command": "echo"}');
    assert.deepEqual(readTheDeclaration(folder), { declaration: { command: "echo" } });
    rmSync(root, { recursive: true, force: true });
  });
  test("seules les cartes en pass et livrées s'essaient", () => {
    assert.deepEqual(["en pass", "servi", "pris", "en attente", "86", undefined].map(sTries), [true, true, false, false, false, false]);
  });
});

describe("essayer une livraison", () => {
  test("le worktree vit sous le dossier de l'app ; la copie du chef, sa branche et ses changements n'en bougent pas", { skip: WITHOUT_POSIX }, async () => {
    const { racine: root, dossier: folder, donnees: data } = project('{"command": "cat version.txt > vu.txt"}');
    const before = { branche: git(folder, "rev-parse", "--abbrev-ref", "HEAD"), statut: git(folder, "status", "--porcelain"), fichier: readFileSync(join(folder, "version.txt"), "utf8"), arbres: git(folder, "worktree", "list", "--porcelain") };
    const { tenus: heldOnes } = trials(data);
    await heldOnes.essayer(folder, "parade", 7);
    const worktree = join(data, "essais", "parade", "7");
    await until(() => existsSync(join(worktree, "vu.txt")) && readFileSync(join(worktree, "vu.txt"), "utf8") !== "", "la commande a tourné dans le worktree");
    assert.equal(readFileSync(join(worktree, "vu.txt"), "utf8"), "livree\n", "la version de la livraison, pas celle du chef");
    assert.ok(!existsSync(join(folder, "vu.txt")));
    assert.equal(git(folder, "rev-parse", "--abbrev-ref", "HEAD"), before.branche);
    assert.equal(git(folder, "status", "--porcelain"), before.statut);
    assert.equal(readFileSync(join(folder, "version.txt"), "utf8"), before.fichier);
    assert.ok(git(folder, "worktree", "list", "--porcelain").includes(worktree), "git connaît le worktree, hors de la copie");
    assert.ok(!worktree.startsWith(folder));
    assert.notEqual(before.arbres, git(folder, "worktree", "list", "--porcelain"));
    rmSync(root, { recursive: true, force: true });
  });

  test("essayer deux fois la même livraison recrée son worktree sans erreur", { skip: WITHOUT_POSIX }, async () => {
    const { racine: root, dossier: folder, donnees: data } = project('{"command": "echo passe >> traces.txt; cat traces.txt > vu.txt"}');
    const { tenus: heldOnes } = trials(data);
    const worktree = join(data, "essais", "parade", "7");
    await heldOnes.essayer(folder, "parade", 7);
    await until(() => existsSync(join(worktree, "vu.txt")) && state(heldOnes, folder, 7) === undefined, "le premier essai est fini");
    await heldOnes.essayer(folder, "parade", 7);
    await until(() => existsSync(join(worktree, "vu.txt")) && state(heldOnes, folder, 7) === undefined && readFileSync(join(worktree, "vu.txt"), "utf8") === "passe\n", "le second essai est fini, sur un worktree net");
    assert.equal(state(heldOnes, folder, 7), undefined, "aucune erreur");
    rmSync(root, { recursive: true, force: true });
  });

  test("un dossier de l'app dans la copie de travail : aucun worktree n'y est créé", async () => {
    const { racine: root, dossier: folder } = project('{"command": "echo"}');
    const { tenus: heldOnes } = trials(join(folder, "dedans"));
    await heldOnes.essayer(folder, "parade", 7);
    const said = state(heldOnes, folder, 7);
    assert.ok(said !== undefined && "echec" in said);
    assert.match(said.echec.raison, /inside the working copy/);
    assert.ok(!existsSync(join(folder, "dedans", "essais")));
    rmSync(root, { recursive: true, force: true });
  });

  test("avec une adresse : la carte dit où, et elle s'ouvre ; sans adresse, la commande tourne dans sa fenêtre", { skip: WITHOUT_POSIX }, async () => {
    const { racine: root, dossier: folder, donnees: data } = project('{"command": "sleep 30", "url": "http://localhost:5173"}');
    const { tenus: heldOnes, ouvertes: openEntries } = trials(data);
    await heldOnes.essayer(folder, "parade", 7);
    assert.deepEqual(state(heldOnes, folder, 7), { enCours: true, url: "http://localhost:5173" });
    assert.deepEqual(openEntries, ["http://localhost:5173"]);
    await heldOnes.arreter("parade", 7);
    writeFileSync(join(folder, FILE_OF_THE_TRIAL), '{"command": "sleep 30"}');
    await heldOnes.essayer(folder, "parade", 7);
    assert.deepEqual(state(heldOnes, folder, 7), { enCours: true });
    assert.equal(openEntries.length, 1);
    await heldOnes.arreter("parade", 7);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("stop", () => {
  test("un clic finit la commande et tous ses enfants ; la carte revient à « try it »", { skip: WITHOUT_POSIX }, async () => {
    const { racine: root, dossier: folder, donnees: data } = project('{"command": "sleep 60 & echo $! > enfant.pid; sleep 60"}');
    const { tenus: heldOnes, changements: changes } = trials(data);
    await heldOnes.essayer(folder, "parade", 7);
    const file = join(data, "essais", "parade", "7", "enfant.pid");
    await until(() => existsSync(file) && readFileSync(file, "utf8").trim() !== "", "l'enfant s'est annoncé");
    const child = Number(readFileSync(file, "utf8"));
    assert.ok(alive(child));
    await heldOnes.arreter("parade", 7);
    await until(() => !alive(child), "l'enfant est mort");
    assert.equal(state(heldOnes, folder, 7), undefined);
    assert.ok(changes.length >= 2, "la vue a été prévenue du départ et de l'arrêt");
    rmSync(root, { recursive: true, force: true });
  });
});

describe("un échec", () => {
  test("code non nul : une ligne de raison, puis la fin de la sortie — pas son début ; rien ne tourne plus", { skip: WITHOUT_POSIX }, async () => {
    const { racine: root, dossier: folder, donnees: data } = project('{"command": "for i in $(seq 1 40); do echo ligne-$i; done; echo boom >&2; exit 3"}');
    const { tenus: heldOnes } = trials(data);
    await heldOnes.essayer(folder, "parade", 7);
    await until(() => state(heldOnes, folder, 7) !== undefined && !("enCours" in (state(heldOnes, folder, 7) ?? {})), "l'échec est dit");
    const said = state(heldOnes, folder, 7);
    assert.ok(said !== undefined && "echec" in said);
    assert.equal(said.echec.raison, "the command exited with code 3");
    const lines = said.echec.fin.split("\n");
    assert.ok(lines.length <= 10);
    assert.ok(lines.includes("ligne-40") && lines.includes("boom"), said.echec.fin);
    assert.ok(!lines.includes("ligne-1"), "la fin, pas le début");
    rmSync(root, { recursive: true, force: true });
  });

  test("déclaration mal formée, absente ou livraison introuvable : une raison, aucun processus, aucun worktree", async () => {
    for (const [declaration, reason] of [
      ["{", /not valid JSON/],
      [undefined, /no \.brigade\/try\.json/],
      ['{"command": "echo"}', /no branch cook\/9-\* and no merge commit/],
    ] as const) {
      const { racine: root, dossier: folder, donnees: data } = project(declaration);
      const { tenus: heldOnes } = trials(data);
      await heldOnes.essayer(folder, "parade", declaration === '{"command": "echo"}' ? 9 : 7);
      const said = state(heldOnes, folder, declaration === '{"command": "echo"}' ? 9 : 7);
      assert.ok(said !== undefined && "echec" in said, String(declaration));
      assert.match(said.echec.raison, reason);
      assert.equal(said.echec.fin, "");
      assert.ok(!existsSync(join(data, "essais")));
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("un livré dont la branche est partie : son commit de fusion s'essaie", { skip: WITHOUT_POSIX }, async () => {
    const { racine: root, dossier: folder, donnees: data } = project('{"command": "cat version.txt > vu.txt"}');
    git(folder, "stash", "-q");
    git(folder, "merge", "-q", "--no-ff", "-m", "Merge pull request #12 from x/cook/7-essai", "cook/7-essai");
    git(folder, "branch", "-q", "-D", "cook/7-essai");
    const { tenus: heldOnes } = trials(data);
    await heldOnes.essayer(folder, "parade", 7);
    const seenOne = join(data, "essais", "parade", "7", "vu.txt");
    await until(() => existsSync(seenOne) && readFileSync(seenOne, "utf8") !== "", "la commande a tourné sur le commit de fusion");
    assert.equal(readFileSync(seenOne, "utf8"), "livree\n");
    rmSync(root, { recursive: true, force: true });
  });

  test("une commande qui ne peut pas démarrer : une raison, et aucun processus", { skip: WITHOUT_POSIX }, async () => {
    const { racine: root, dossier: folder, donnees: data } = project('{"command": "commande-qui-n-existe-pas-3215"}');
    const { tenus: heldOnes } = trials(data);
    await heldOnes.essayer(folder, "parade", 7);
    await until(() => state(heldOnes, folder, 7) !== undefined && !("enCours" in (state(heldOnes, folder, 7) ?? {})), "l'échec est dit");
    const said = state(heldOnes, folder, 7);
    assert.ok(said !== undefined && "echec" in said);
    assert.match(said.echec.raison, /code 127/);
    assert.match(said.echec.fin, /not found/);
    rmSync(root, { recursive: true, force: true });
  });
});
