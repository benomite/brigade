// Le tour des gates : le vrai `.claude/brigade/gates.sh` de ce dépôt, joué sur
// des projets d'essai qui partagent un verrou — comme deux worktrees d'une box.
// Seule l'étape des tests est regardée ; les autres y sont rouges, sans dépôt.
import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { aArreter, ENV_ENFANT, jusqua, repertoireTemporaire } from "./outils.ts";
import { linuxOnly, posixOnly } from "./support/plateforme.ts";

const GATES = join(import.meta.dirname, "../../.claude/brigade/gates.sh");

function projet(t: TestContext, suite: string): string {
  const racine = repertoireTemporaire(t);
  mkdirSync(join(racine, "runtime"));
  writeFileSync(join(racine, "runtime/package.json"), JSON.stringify({ scripts: { test: suite } }));
  writeFileSync(join(racine, "CLAUDE.md"), "## Équipe multi-agents (plugin brigade)\n\n- **Branche d'intégration** : `main`\n");
  return racine;
}

type Passage = { process: ChildProcess; sortie: () => string; fin: Promise<number | null> };

function jouer(t: TestContext, racine: string, verrou: string, env: Record<string, string> = {}): Passage {
  // Son propre groupe de process : la garde d'horloge des gates (un `sleep` de 300 s dans un sous-shell) survit
  // à un SIGKILL du passage, et la fin du test l'arrête avec lui au lieu de la laisser cinq minutes (#2464).
  const gates = spawn("bash", [GATES, racine], { env: { ...ENV_ENFANT, BRIGADE_GATES_VERROU: verrou, ...env }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let sortie = "";
  gates.stdout.on("data", (morceau: Buffer) => (sortie += morceau.toString()));
  gates.stderr.on("data", (morceau: Buffer) => (sortie += morceau.toString()));
  const fin = new Promise<number | null>((resoudre) => gates.on("close", (code) => resoudre(code)));
  aArreter(t, () => {
    try {
      process.kill(-gates.pid!, "SIGKILL");
    } catch {}
  });
  return { process: gates, sortie: () => sortie, fin };
}

// Une suite qui signale son départ, puis attend qu'on la libère — et dit
// qu'elle l'a vu (`<libere>.vu`) avant de finir.
// Une horloge injectée dans les gates par `BASH_ENV`, que bash lit avant le script : le `sleep 0.5` de
// l'attente du tour note qu'il attend dans `vu`, avance `SECONDS` — dont les gates tirent l'attente qu'elles
// disent — d'une seconde, et ne dort que 20 ms. Tout autre `sleep` reste le vrai (#2464).
function horlogeDuTour(t: TestContext, vu: string): Record<string, string> {
  const fichier = join(repertoireTemporaire(t), "horloge.sh");
  writeFileSync(fichier, `sleep() { if [ "$*" = 0.5 ]; then touch '${vu}'; SECONDS=$((SECONDS + 1)); command sleep 0.02; else command sleep "$@"; fi; }\n`);
  return { BASH_ENV: fichier };
}

const suiteRetenue = (signal: string, libere: string) => `touch ${signal}; while [ ! -e ${libere} ]; do sleep 0.1; done; touch ${libere}.vu`;

describe("le tour des gates sur une box", () => {
  test("le second passage n'exécute ses tests qu'une fois le premier fini, et dit combien il a attendu", { skip: posixOnly("plays the real gates.sh twice on projects sharing one turn lock and expects the second suite to wait for the first, then say how long it waited; on Windows npm runs each project's `test` script through cmd.exe, which cannot run the test's `touch`/`while` shell loop, so the first suite never signals its start") }, async (t) => {
    const verrou = join(repertoireTemporaire(t), "verrou");
    const libere = join(repertoireTemporaire(t), "libere");
    const signalA = join(repertoireTemporaire(t), "a");
    const signalB = join(repertoireTemporaire(t), "b");
    const a = projet(t, suiteRetenue(signalA, libere));
    const b = projet(t, `touch ${signalB}`);

    const premier = jouer(t, a, verrou);
    await jusqua(() => existsSync(signalA));
    const attend = join(repertoireTemporaire(t), "attend");
    const second = jouer(t, b, verrou, horlogeDuTour(t, attend));
    // Le second attend son tour, que le premier tient.
    await jusqua(() => existsSync(attend));
    assert.equal(existsSync(signalB), false, "les tests du second tournent pendant ceux du premier");

    writeFileSync(libere, "");
    await Promise.all([premier.fin, second.fin]);
    assert.equal(existsSync(signalB), true);
    assert.match(second.sortie(), /ok {4}tour des tests : ([1-9][0-9]*) s à attendre son tour, [0-9]+ s d'exécution/);
    assert.match(premier.sortie(), /ok {4}tour des tests : 0 s à attendre son tour/);
    assert.equal(existsSync(verrou), false, "le verrou n'est pas rendu");
  });

  test("un passage tué en cours rend son tour au suivant", { skip: posixOnly("kills the first gates run with SIGKILL while its suite holds the turn lock, and expects the next run to take the lock over from the dead pid; on Windows npm runs the held suite's `touch`/`while` loop through cmd.exe, which cannot run it, so that suite never signals its start") }, async (t) => {
    const verrou = join(repertoireTemporaire(t), "verrou");
    const signalA = join(repertoireTemporaire(t), "a");
    const signalB = join(repertoireTemporaire(t), "b");
    const libere = join(repertoireTemporaire(t), "libere");
    // La suite du passage tué lui survit : on la libère en fin de test, et on
    // attend qu'elle l'ait vu. Sans quoi le répertoire de `libere` peut
    // disparaître avant son prochain coup d'œil, et elle sonde pour toujours.
    aArreter(t, async () => {
      writeFileSync(libere, "");
      if (existsSync(signalA)) await jusqua(() => existsSync(`${libere}.vu`));
    });
    const a = projet(t, suiteRetenue(signalA, libere));
    const b = projet(t, `touch ${signalB}`);

    const premier = jouer(t, a, verrou);
    await jusqua(() => existsSync(signalA));
    // SIGKILL : aucun piège ne passe, le verrou reste là, signé d'un pid mort.
    premier.process.kill("SIGKILL");
    await premier.fin;
    assert.equal(readFileSync(join(verrou, "pid"), "utf8").trim(), String(premier.process.pid));

    const second = jouer(t, b, verrou);
    assert.equal(await second.fin, 1, "rouge faute de dépôt, mais les tests ont couru");
    assert.equal(existsSync(signalB), true, "le tour n'a pas été rendu");
  });

  // Chaque cook joue ses gates dans sa cloison (`bwrap --unshare-pid`), `/tmp`
  // partagé : le pid qui signe le verrou est celui d'une autre cloison. Sa vie
  // se lit au `flock` que son passage tient sur le fichier `pid` (#2551).
  const sansFlock = linuxOnly("the turn lock reads its holder's life from a flock(1) on its pid file, which macOS does not ship") || (spawnSync("flock", ["--version"]).error ? "flock(1) is not installed" : false);
  // Un pid qu'aucun process n'a ici : celui d'un passage vivant, vu d'une autre cloison.
  const PID_D_AILLEURS = "99999999";
  const signerLeVerrou = (verrou: string, pid: string) => {
    mkdirSync(verrou);
    writeFileSync(join(verrou, "pid"), `${pid}\n`);
  };

  test("le passage vivant d'une autre cloison garde son tour, même si son pid n'existe pas ici", { skip: sansFlock }, async (t) => {
    const verrou = join(repertoireTemporaire(t), "verrou");
    const tenu = join(repertoireTemporaire(t), "tenu");
    const libere = join(repertoireTemporaire(t), "libere");
    const signalB = join(repertoireTemporaire(t), "b");
    signerLeVerrou(verrou, PID_D_AILLEURS);
    // Le passage de l'autre cloison : il tient le fichier `pid` de son verrou.
    const ailleurs = spawn("flock", [join(verrou, "pid"), "sh", "-c", `touch ${tenu}; while [ ! -e ${libere} ]; do sleep 0.1; done`], { stdio: "ignore" });
    aArreter(t, () => ailleurs.kill("SIGKILL"));
    await jusqua(() => existsSync(tenu));

    const second = jouer(t, projet(t, `touch ${signalB}`), verrou);
    // Le miroir jugé, le passage en est au tour : avant #2551, il le volait sur-le-champ.
    await jusqua(() => /miroir invérifiable/.test(second.sortie()));
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(existsSync(signalB), false, "le tour d'un passage vivant a été volé");

    writeFileSync(libere, "");
    // Son passage fini sans rendre le tour, le verrou ne tient plus : il se reprend.
    await new Promise((r) => ailleurs.on("close", r));
    assert.equal(await second.fin, 1, "rouge faute de dépôt, mais les tests ont couru");
    assert.equal(existsSync(signalB), true);
  });

  test("un verrou que personne ne tient se reprend, même signé d'un pid vivant ici", { skip: sansFlock }, async (t) => {
    const verrou = join(repertoireTemporaire(t), "verrou");
    const signalB = join(repertoireTemporaire(t), "b");
    // Le pid 2 d'une cloison est le `claude` du cook : le passage tué qui l'y
    // portait a laissé un verrou signé d'un pid toujours vivant, vu de là.
    signerLeVerrou(verrou, String(process.pid));

    const second = jouer(t, projet(t, `touch ${signalB}`), verrou);
    await jusqua(() => existsSync(signalB));
    assert.equal(await second.fin, 1, "rouge faute de dépôt, mais les tests ont couru");
    assert.equal(existsSync(verrou), false, "le verrou n'est pas rendu");
  });
});
