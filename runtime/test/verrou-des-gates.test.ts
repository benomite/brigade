// Le tour des gates : le vrai `.claude/brigade/gates.sh` de ce dépôt, joué sur
// des projets d'essai qui partagent un verrou — comme deux worktrees d'une box.
// Seule l'étape des tests est regardée ; les autres y sont rouges, sans dépôt.
import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { aArreter, ENV_ENFANT, jusqua, repertoireTemporaire } from "./outils.ts";
import { posixOnly } from "./support/plateforme.ts";

const GATES = join(import.meta.dirname, "../../.claude/brigade/gates.sh");

function projet(t: TestContext, suite: string): string {
  const racine = repertoireTemporaire(t);
  mkdirSync(join(racine, "runtime"));
  writeFileSync(join(racine, "runtime/package.json"), JSON.stringify({ scripts: { test: suite } }));
  writeFileSync(join(racine, "CLAUDE.md"), "## Équipe multi-agents (plugin brigade)\n\n- **Branche d'intégration** : `main`\n");
  return racine;
}

type Passage = { process: ChildProcess; sortie: () => string; fin: Promise<number | null>; tuer: () => void };

// Un passage a son groupe de process : tué, il part avec la garde d'horloge
// qu'il a lancée — sans quoi elle et son `sleep` lui survivraient cinq minutes.
// Sa suite, partie dans un groupe à elle, lui survit comme sur une box.
function jouer(t: TestContext, racine: string, verrou: string, env: NodeJS.ProcessEnv = {}): Passage {
  const gates = spawn("bash", [GATES, racine], { env: { ...ENV_ENFANT, BRIGADE_GATES_VERROU: verrou, ...env }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let sortie = "";
  gates.stdout.on("data", (morceau: Buffer) => (sortie += morceau.toString()));
  gates.stderr.on("data", (morceau: Buffer) => (sortie += morceau.toString()));
  const fin = new Promise<number | null>((resoudre) => gates.on("close", (code) => resoudre(code)));
  const tuer = () => {
    // Sans pid, rien n'est parti : `-0` serait le groupe du test lui-même.
    if (gates.pid === undefined) return;
    try {
      process.kill(-gates.pid, "SIGKILL");
    } catch {
      // Le groupe n'est plus : le passage a fini, et sa garde avec lui.
    }
  };
  aArreter(t, tuer);
  return { process: gates, sortie: () => sortie, fin, tuer };
}

// Une suite qui signale son départ, puis attend qu'on la libère — et dit
// qu'elle l'a vu (`<libere>.vu`) avant de finir.
const suiteRetenue = (signal: string, libere: string) => `touch ${signal}; while [ ! -e ${libere} ]; do sleep 0.1; done; touch ${libere}.vu`;

// Un `sleep` d'essai, mis devant le vrai dans le PATH d'un passage : il pose
// `<repertoire>/attend` à son premier appel — le passage est dans la boucle
// de son tour, son attente déjà comptée —, et ramène la demi-seconde de cette
// boucle à 50 ms. Les autres délais vont au vrai `sleep`.
function sleepQuiSignale(repertoire: string): string {
  const vrai = execFileSync("bash", ["-c", "command -v sleep"], { encoding: "utf8" }).trim();
  writeFileSync(join(repertoire, "sleep"), `#!/bin/sh\n: >"${join(repertoire, "attend")}"\n[ "$1" = 0.5 ] && set -- 0.05\nexec "${vrai}" "$@"\n`);
  chmodSync(join(repertoire, "sleep"), 0o755);
  return join(repertoire, "attend");
}

describe("le tour des gates sur une box", () => {
  test("le second passage n'exécute ses tests qu'une fois le premier fini, et dit combien il a attendu", { skip: posixOnly("plays the real gates.sh twice on projects sharing one turn lock and expects the second suite to wait for the first, then say how long it waited; on Windows npm runs each project's `test` script through cmd.exe, which cannot run the test's `touch`/`while` shell loop, so the first suite never signals its start") }, async (t) => {
    const verrou = join(repertoireTemporaire(t), "verrou");
    const libere = join(repertoireTemporaire(t), "libere");
    const signalA = join(repertoireTemporaire(t), "a");
    const signalB = join(repertoireTemporaire(t), "b");
    const a = projet(t, suiteRetenue(signalA, libere));
    const b = projet(t, `touch ${signalB}`);

    const outils = repertoireTemporaire(t);
    const attend = sleepQuiSignale(outils);

    const premier = jouer(t, a, verrou);
    // Le premier tient le tour : le second part.
    await jusqua(() => existsSync(join(verrou, "pid")));
    const second = jouer(t, b, verrou, { PATH: `${outils}:${ENV_ENFANT.PATH ?? process.env.PATH ?? ""}` });
    // Le second est dans la boucle de son tour, que le premier tient.
    await jusqua(() => existsSync(attend));
    // Son attente se compte en secondes entières de l'horloge : le premier ne
    // rend son tour qu'une fois la seconde changée.
    const seconde = Math.floor(Date.now() / 1000);
    await jusqua(() => Math.floor(Date.now() / 1000) > seconde);
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
    premier.tuer();
    await premier.fin;
    assert.equal(readFileSync(join(verrou, "pid"), "utf8").trim(), String(premier.process.pid));

    const second = jouer(t, b, verrou);
    assert.equal(await second.fin, 1, "rouge faute de dépôt, mais les tests ont couru");
    assert.equal(existsSync(signalB), true, "le tour n'a pas été rendu");
  });
});
