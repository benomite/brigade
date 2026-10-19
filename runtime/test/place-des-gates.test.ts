// La place des gates : le vrai `.claude/brigade/gates.sh` de ce dépôt, joué deux
// fois de front sur des projets d'essai qui partagent un fichier de place. Les
// projets n'ont ni manifest ni dépôt git, les autres étapes y sont donc rouges —
// seul l'ordre dans lequel leurs suites jouent est regardé ici. Les suites
// d'essai posent des témoins : le test attend des faits, jamais une durée.
import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { aArreter, ENV_ENFANT, jusqua, repertoireTemporaire } from "./outils.ts";

const GATES = join(import.meta.dirname, "../../.claude/brigade/gates.sh");
const sansFlock = spawnSync("sh", ["-c", "command -v flock"]).status !== 0 ? "flock introuvable sur cette machine" : false;

// La suite qui tient la place : elle se dit partie, puis ne finit que libérée.
const TIENT = 'touch "$TEMOINS/a-joue"; while [ ! -e "$TEMOINS/libere" ]; do sleep 0.05; done; touch "$TEMOINS/a-fini"';
// La suite qui vient après : elle dit si celle qui tenait la place avait fini.
const SUIT = 'if [ -e "$TEMOINS/a-fini" ]; then touch "$TEMOINS/b-apres"; else touch "$TEMOINS/b-pendant"; fi';

function projet(t: TestContext, suite: string): string {
  const racine = repertoireTemporaire(t);
  mkdirSync(join(racine, "runtime"));
  writeFileSync(join(racine, "runtime/package.json"), JSON.stringify({ scripts: { test: suite } }));
  writeFileSync(join(racine, "CLAUDE.md"), "## Équipe multi-agents (plugin brigade)\n\n- **Branche d'intégration** : `main`\n");
  return racine;
}

type Passage = { process: ChildProcess; sortie: () => string; fin: Promise<number | null> };
function jouer(racine: string, env: Record<string, string>): Passage {
  const gates = spawn("bash", [GATES, racine], { env: { ...ENV_ENFANT, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let sortie = "";
  gates.stdout.on("data", (morceau: Buffer) => (sortie += morceau.toString()));
  gates.stderr.on("data", (morceau: Buffer) => (sortie += morceau.toString()));
  return { process: gates, sortie: () => sortie, fin: new Promise((resoudre) => gates.on("close", resoudre)) };
}

const ATTEND = "ok    place des gates : d'autres gates de cette machine jouent leurs suites — celles-ci attendent leur tour";

// Chaque test a sa place et ses projets : ils se jouent de front.
describe("la place des gates", { concurrency: 8, skip: sansFlock }, () => {
  // La suite qui tient la place, partie ; libérée en fin de test si le test ne l'a pas fait.
  async function tenir(t: TestContext, place: string) {
    const temoins = repertoireTemporaire(t);
    aArreter(t, () => writeFileSync(join(temoins, "libere"), ""));
    const premier = jouer(projet(t, TIENT), { BRIGADE_GATES_PLACE: place, TEMOINS: temoins });
    await jusqua(() => existsSync(join(temoins, "a-joue")));
    return { temoins, premier };
  }

  test("un second passage attend que le premier ait joué ses suites, et dit qu'il attend puis combien", async (t) => {
    const place = join(repertoireTemporaire(t), "place");
    const { temoins, premier } = await tenir(t, place);

    const second = jouer(projet(t, SUIT), { BRIGADE_GATES_PLACE: place, TEMOINS: temoins });
    await jusqua(() => second.sortie().includes(ATTEND));
    assert.equal(existsSync(join(temoins, "b-pendant")), false, "la suite du second a joué pendant celle du premier");

    writeFileSync(join(temoins, "libere"), "");
    await Promise.all([premier.fin, second.fin]);
    assert.ok(existsSync(join(temoins, "b-apres")), second.sortie());
    assert.match(second.sortie(), /^ok {4}place des gates : \d+ s d'attente$/m);
    assert.doesNotMatch(premier.sortie(), /place des gates/);
  });

  test("des gates tuées rendent la place : ce que leur suite a lancé, qui leur survit, ne la tient pas", async (t) => {
    const place = join(repertoireTemporaire(t), "place");
    const { temoins, premier } = await tenir(t, place);

    premier.process.kill("SIGKILL");
    await premier.fin;
    // La suite du premier tourne encore, orpheline : la place est libre quand même.
    const second = jouer(projet(t, SUIT), { BRIGADE_GATES_PLACE: place, TEMOINS: temoins });
    await second.fin;
    assert.ok(existsSync(join(temoins, "b-pendant")), second.sortie());
    assert.doesNotMatch(second.sortie(), /place des gates/);
    // L'orpheline libérée finit avant que ses répertoires ne partent.
    writeFileSync(join(temoins, "libere"), "");
    await jusqua(() => existsSync(join(temoins, "a-fini")));
  });

  test("une place vide n'est jamais prise : ces gates-là n'attendent personne", async (t) => {
    const place = join(repertoireTemporaire(t), "place");
    const { temoins } = await tenir(t, place);

    const second = jouer(projet(t, SUIT), { BRIGADE_GATES_PLACE: "", TEMOINS: temoins });
    await second.fin;
    assert.ok(existsSync(join(temoins, "b-pendant")), second.sortie());
    assert.doesNotMatch(second.sortie(), /place des gates/);
  });
});
