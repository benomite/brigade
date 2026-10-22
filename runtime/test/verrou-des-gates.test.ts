// Le tour des gates : le vrai `.claude/brigade/gates.sh` de ce dépôt, joué sur
// des projets d'essai qui partagent un verrou — comme deux worktrees d'une box.
// Seule l'étape des tests est regardée ; les autres y sont rouges, sans dépôt.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "./support/posix.ts";
import { aArreter, ENV_ENFANT, jusqua, repertoireTemporaire } from "./outils.ts";

const GATES = join(import.meta.dirname, "../../.claude/brigade/gates.sh");

function projet(t: TestContext, suite: string): string {
  const racine = repertoireTemporaire(t);
  mkdirSync(join(racine, "runtime"));
  writeFileSync(join(racine, "runtime/package.json"), JSON.stringify({ scripts: { test: suite } }));
  writeFileSync(join(racine, "CLAUDE.md"), "## Équipe multi-agents (plugin brigade)\n\n- **Branche d'intégration** : `main`\n");
  return racine;
}

type Passage = { process: ChildProcess; sortie: () => string; fin: Promise<number | null> };

function jouer(t: TestContext, racine: string, verrou: string): Passage {
  const gates = spawn("bash", [GATES, racine], { env: { ...ENV_ENFANT, BRIGADE_GATES_VERROU: verrou }, stdio: ["ignore", "pipe", "pipe"] });
  let sortie = "";
  gates.stdout.on("data", (morceau: Buffer) => (sortie += morceau.toString()));
  gates.stderr.on("data", (morceau: Buffer) => (sortie += morceau.toString()));
  const fin = new Promise<number | null>((resoudre) => gates.on("close", (code) => resoudre(code)));
  aArreter(t, () => gates.kill("SIGKILL"));
  return { process: gates, sortie: () => sortie, fin };
}

// Une suite qui signale son départ, puis attend qu'on la libère — et dit
// qu'elle l'a vu (`<libere>.vu`) avant de finir.
const suiteRetenue = (signal: string, libere: string) => `touch ${signal}; while [ ! -e ${libere} ]; do sleep 0.1; done; touch ${libere}.vu`;

describe("le tour des gates sur une box", () => {
  test("le second passage n'exécute ses tests qu'une fois le premier fini, et dit combien il a attendu", async (t) => {
    const verrou = join(repertoireTemporaire(t), "verrou");
    const libere = join(repertoireTemporaire(t), "libere");
    const signalA = join(repertoireTemporaire(t), "a");
    const signalB = join(repertoireTemporaire(t), "b");
    const a = projet(t, suiteRetenue(signalA, libere));
    const b = projet(t, `touch ${signalB}`);

    const premier = jouer(t, a, verrou);
    await jusqua(() => existsSync(signalA));
    const second = jouer(t, b, verrou);
    // Le second a eu tout le temps de partir : son verrou est tenu par le premier.
    await jusqua(() => existsSync(join(verrou, "pid")));
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(existsSync(signalB), false, "les tests du second tournent pendant ceux du premier");

    writeFileSync(libere, "");
    await Promise.all([premier.fin, second.fin]);
    assert.equal(existsSync(signalB), true);
    assert.match(second.sortie(), /ok {4}tour des tests : ([1-9][0-9]*) s à attendre son tour, [0-9]+ s d'exécution/);
    assert.match(premier.sortie(), /ok {4}tour des tests : 0 s à attendre son tour/);
    assert.equal(existsSync(verrou), false, "le verrou n'est pas rendu");
  });

  test("un passage tué en cours rend son tour au suivant", async (t) => {
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
});
