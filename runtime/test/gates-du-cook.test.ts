// Les gates que le cook joue lui-même arrivent au journal : le lanceur que la
// station lui pose joue le script du projet tel quel et laisse un reçu — l'arbre
// jugé, ce qui n'est pas commité compris —, que la station écrit à la fin du cook.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { empreinteDeConfig, passageVert } from "../src/empreinte-des-gates.ts";
import type { FaitGates } from "../src/events/gates.ts";
import { SCRIPT_GATES } from "../src/gates.ts";
import { LANCEUR, lireLesRecus, noterGatesDuCook, poserLeLanceur, RECUS } from "../src/gates-du-cook.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { aArreter, depotGit, git, repertoireTemporaire } from "./outils.ts";
import { posixOnly } from "./support/plateforme.ts";

const PROJET = "espace";
// Des gates qui disent ce qu'elles jugent, et sortent du code qu'on leur donne.
const GATES = '#!/bin/sh\necho "ok    gates jouées sur $1"\nexit "${CODE_DES_GATES:-0}"\n';

// Un clone dont la base porte des gates — ou non —, et le worktree d'un cook.
function cuisson(t: TestContext, avecGates = true) {
  const { clone } = depotGit(t);
  if (avecGates) {
    mkdirSync(join(clone, ".claude/brigade"), { recursive: true });
    writeFileSync(join(clone, SCRIPT_GATES), GATES, { mode: 0o755 });
    git(clone, "add", ".");
    git(clone, "commit", "-q", "-m", "les gates du projet");
  }
  const worktree = join(repertoireTemporaire(t), "17-cook");
  git(clone, "worktree", "add", "-q", "-b", "cook/17-cook", worktree);
  const journal = ouvrirJournal(repertoireTemporaire(t));
  aArreter(t, () => journal.fermer());
  // Le lanceur, joué comme le cook le joue : de son worktree, dans son shell.
  const jouer = (lanceur: string, code = 0) => spawnSync(lanceur, [worktree], { cwd: worktree, env: { ...process.env, CODE_DES_GATES: String(code) }, encoding: "utf8" });
  const passages = () => journal.tout().flatMap((evenement) => (evenement.type === "gates.ran" ? [{ ticket: evenement.ticket, author: evenement.author, ...(evenement.payload as FaitGates["payload"]) }] : []));
  return { clone, worktree, journal, jouer, passages };
}

describe("les gates du cook", { concurrency: 8 }, () => {
  test("le lanceur est posé dans le `.git` du clone, exécutable — sauf pour un projet sans gates, ou hors d'un dépôt git", { skip: posixOnly("plays the gates-du-cook launcher, a bash script the station writes into .git/brigade, which records the paths it was given as Git Bash sees them (long or /c/ form, not the 8.3 path of the test) (this test uses POSIX mode bits); on the Windows job: + '<tmp>\\clone\\.git\\brigade\\gates-du-cook' - '<tmp>\\clone\\.git\\brigade\\gates-du-cook'") }, (t) => {
    const { clone, worktree } = cuisson(t);
    const lanceur = poserLeLanceur(worktree);

    assert.equal(lanceur, join(clone, ".git", LANCEUR));
    accessSync(lanceur, constants.X_OK);
    // Posé à nouveau pour un autre cook : le même chemin.
    assert.equal(poserLeLanceur(worktree), lanceur);

    assert.equal(poserLeLanceur(cuisson(t, false).worktree), null);
    const sansGit = repertoireTemporaire(t);
    mkdirSync(join(sansGit, ".claude/brigade"), { recursive: true });
    writeFileSync(join(sansGit, SCRIPT_GATES), GATES, { mode: 0o755 });
    assert.equal(poserLeLanceur(sansGit), null);
  });

  test("le lanceur joue le script du projet tel quel — sa sortie, son code de sortie — et son reçu porte l'arbre que le cook livrera, ce qui n'était pas commité compris, sans toucher à son index", { skip: posixOnly("plays the gates-du-cook launcher, a bash script the station writes into .git/brigade, which records the paths it was given as Git Bash sees them (long or /c/ form, not the 8.3 path of the test); on the Windows job: + null, + null - 3,") }, (t) => {
    const { worktree, jouer } = cuisson(t);
    const lanceur = poserLeLanceur(worktree)!;
    // Du travail non commité : un fichier suivi modifié, un fichier neuf.
    writeFileSync(join(worktree, "LISEZMOI"), "le projet, changé\n");
    writeFileSync(join(worktree, "neuf.txt"), "neuf\n");
    const etat = git(worktree, "status", "--porcelain");

    const rouges = jouer(lanceur, 3);
    const vertes = jouer(lanceur);

    assert.deepEqual([rouges.status, vertes.status], [3, 0]);
    assert.equal(vertes.stdout, `ok    gates jouées sur ${worktree}\n`);
    assert.equal(git(worktree, "status", "--porcelain"), etat);
    const recus = lireLesRecus(worktree);
    assert.deepEqual(recus.map((recu) => recu.code), [3, 0]);
    for (const recu of recus) {
      assert.ok(Number.isInteger(recu.durationMs) && recu.durationMs >= 0, String(recu.durationMs));
      // Le processeur des gates et de ce qu'elles ont attendu, dit par `times`.
      assert.ok(recu.cpuMs !== null && recu.cpuMs >= 0, String(recu.cpuMs));
    }
    // Commité tel quel, c'est cet arbre-là que la branche porte.
    git(worktree, "add", "--all");
    git(worktree, "commit", "-q", "-m", "le travail du cook");
    assert.deepEqual(new Set(recus.map((recu) => recu.tree)), new Set([git(worktree, "rev-parse", "HEAD^{tree}")]));
  });

  test("à la fin du cook, chaque reçu devient un `gates.ran` du cook, avec son empreinte — que la pass reprend sur le même arbre — puis il est effacé", { skip: posixOnly("plays the gates-du-cook launcher, a bash script the station writes into .git/brigade, which records the paths it was given as Git Bash sees them (long or /c/ form, not the 8.3 path of the test); on the Windows job: 0 !== 2") }, (t) => {
    const { worktree, journal, jouer, passages } = cuisson(t);
    const lanceur = poserLeLanceur(worktree)!;
    jouer(lanceur, 1);
    writeFileSync(join(worktree, "travail.txt"), "le travail du cook\n");
    jouer(lanceur);
    git(worktree, "add", "--all");
    git(worktree, "commit", "-q", "-m", "le travail du cook");

    assert.equal(noterGatesDuCook(journal, { projet: PROJET, ticket: 17, auteur: "station:box/claude", worktree }), 2);

    const config = empreinteDeConfig(worktree);
    const arbre = git(worktree, "rev-parse", "HEAD^{tree}");
    const [rouge, vert] = passages();
    assert.deepEqual(
      [rouge, vert].map((passage) => [passage?.ticket, passage?.author, passage?.runner, passage?.outcome, passage?.config]),
      [
        [17, "station:box/claude", "cook", "red", config],
        [17, "station:box/claude", "cook", "green", config],
      ],
    );
    assert.notEqual(rouge?.tree, arbre);
    assert.equal(vert?.tree, arbre);
    assert.equal(typeof vert?.durationMs, "number");
    assert.equal(passageVert(journal.base, PROJET, 17, { tree: arbre, config })?.runner, "cook");

    // Effacés : un cook repris dans ce worktree ne les compte pas deux fois.
    assert.equal(existsSync(join(git(worktree, "rev-parse", "--absolute-git-dir"), RECUS)), false);
    assert.equal(noterGatesDuCook(journal, { projet: PROJET, ticket: 17, auteur: "station:box/claude", worktree }), 0);
    assert.equal(passages().length, 2);
  });

  test("un reçu illisible ne compte pas, et un nouveau cook dans le worktree repart sans les reçus du précédent", { skip: posixOnly("plays the gates-du-cook launcher, a bash script the station writes into .git/brigade, which records the paths it was given as Git Bash sees them (long or /c/ form, not the 8.3 path of the test); on the Windows job: 0 !== 1") }, (t) => {
    const { worktree, journal, jouer, passages } = cuisson(t);
    const lanceur = poserLeLanceur(worktree)!;
    jouer(lanceur);
    const recus = join(git(worktree, "rev-parse", "--absolute-git-dir"), RECUS);
    writeFileSync(recus, "pas un arbre\t0\t12\t0m0s 0m0s\n", { flag: "a" });
    assert.equal(lireLesRecus(worktree).length, 1);

    poserLeLanceur(worktree);

    assert.equal(noterGatesDuCook(journal, { projet: PROJET, ticket: 17, auteur: "station:box/claude", worktree }), 0);
    assert.deepEqual(passages(), []);
  });
});
