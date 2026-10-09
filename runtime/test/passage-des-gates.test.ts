// Un seul passage de gates à la fois par arbre : le vrai `.claude/brigade/gates.sh`
// de ce dépôt, et son hook d'arrêt, joués sur un projet d'essai dont la suite
// tient tant que le test ne la lâche pas. Le projet n'a pas de manifest, les
// gates y sont donc rouges — c'est le verrou qui est regardé ici.
import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { aArreter, ENV_ENFANT, repertoireTemporaire } from "./outils.ts";

const GATES = join(import.meta.dirname, "../../.claude/brigade/gates.sh");
const HOOK = join(import.meta.dirname, "../../.claude/brigade/gates-hook.sh");

type Essai = { racine: string; dehors: string; env: Record<string, string>; lacher: () => void; jouees: () => number };

// Un dépôt git d'un commit, dont la suite note qu'elle est jouée puis attend
// d'être lâchée.
function projet(t: TestContext): Essai {
  const racine = join(repertoireTemporaire(t), "projet");
  const dehors = repertoireTemporaire(t);
  mkdirSync(join(racine, "runtime"), { recursive: true });
  const suite = `echo jouee >> "$TEMOIN"; while [ ! -e "$LACHE" ]; do sleep 0.1; done`;
  writeFileSync(join(racine, "runtime/package.json"), JSON.stringify({ scripts: { test: suite } }));
  writeFileSync(join(racine, "CLAUDE.md"), "## Équipe multi-agents (plugin brigade)\n\n- **Branche d'intégration** : `main`\n");
  const temoin = join(dehors, "temoin");
  const lache = join(dehors, "lache");
  const env = { ...ENV_ENFANT, HOME: dehors, TEMOIN: temoin, LACHE: lache };
  const git = (...args: string[]) => execFileSync("git", ["-C", racine, "-c", "user.name=essai", "-c", "user.email=essai@exemple.test", ...args], { env });
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-q", "-m", "projet d'essai");
  // Une suite que le test n'a pas lâchée ne doit pas lui survivre.
  const lacher = () => writeFileSync(lache, "");
  aArreter(t, lacher);
  return {
    racine,
    dehors,
    env,
    lacher,
    jouees: () => (existsSync(temoin) ? readFileSync(temoin, "utf8").split("\n").length - 1 : 0),
  };
}

type Passage = { process: ChildProcess; sortie: () => string; fini: Promise<number | null> };

function lancer(commande: string, args: string[], env: Record<string, string>, entree = ""): Passage {
  const lance = spawn(commande, args, { env, stdio: ["pipe", "pipe", "pipe"] });
  let sortie = "";
  lance.stdout.on("data", (morceau: Buffer) => (sortie += morceau.toString()));
  lance.stderr.on("data", (morceau: Buffer) => (sortie += morceau.toString()));
  lance.stdin.end(entree);
  const fini = new Promise<number | null>((resoudre, rejeter) => {
    lance.on("error", rejeter);
    lance.on("close", resoudre);
  });
  return { process: lance, sortie: () => sortie, fini };
}

// Attend un fait, pas une durée : le délai n'est qu'une garde, pour qu'un test
// cassé finisse par le dire.
async function jusqua(fait: () => boolean, quoi: string): Promise<void> {
  const limite = Date.now() + 100_000;
  while (!fait()) {
    assert.ok(Date.now() < limite, `jamais arrivé : ${quoi}`);
    await new Promise((suite) => setTimeout(suite, 20));
  }
}

const ATTEND = "un autre passage joue déjà dans cet arbre";
const REPRIS = "verdict repris du passage";

// Chaque test a son projet : ils se jouent de front.
describe("un seul passage de gates à la fois par arbre", { concurrency: 8 }, () => {
  test("deux tirs simultanés du hook d'arrêt ne jouent qu'une suite, et ne brûlent qu'un réveil", async (t) => {
    const essai = projet(t);
    // Les gates du hook, écoutées : ce qu'elles disent sur stderr pendant
    // qu'elles attendent n'arrive au hook qu'à la fin.
    const ecoute = join(essai.dehors, "ecoute");
    const ecoutees = join(essai.dehors, "gates-ecoutees.sh");
    writeFileSync(ecoutees, `#!/usr/bin/env bash\nexec bash ${JSON.stringify(GATES)} "$@" 2> >(tee -a ${JSON.stringify(ecoute)} >&2)\n`);
    chmodSync(ecoutees, 0o755);
    const env = { ...essai.env, CLAUDE_PROJECT_DIR: essai.racine, BRIGADE_GATES_CMD: ecoutees };
    const tir = (evenement: string) => lancer("bash", [HOOK], env, JSON.stringify({ session_id: "session-d-essai", hook_event_name: evenement }));

    // Le premier tient sa suite tant que le second n'est pas arrêté au verrou.
    const premier = tir("Stop");
    await jusqua(() => essai.jouees() === 1, "la suite du premier tir");
    const second = tir("SubagentStop");
    await jusqua(() => existsSync(ecoute) && readFileSync(ecoute, "utf8").includes(ATTEND), "le second tir au verrou");
    essai.lacher();
    const codes = [await premier.fini, await second.fini];

    assert.equal(essai.jouees(), 1, "les deux tirs ont joué chacun leur suite");
    // Le même verdict rouge pour les deux : l'un réveille, l'autre le sait
    // délivré et se tait — un arrêt qui n'a rien changé ne consomme pas de réveil.
    assert.deepEqual([...codes].sort(), [0, 2], `${premier.sortie()}\n${second.sortie()}`);
    const [reveil, silence] = codes[0] === 2 ? [premier, second] : [second, premier];
    assert.match(reveil.sortie(), /^FAIL {2}absent : \.claude-plugin\/plugin\.json$/m);
    assert.match(reveil.sortie(), /Gates ROUGES \(réveil 1\/2 sur cet échec, 1\/4 au total\)/);
    assert.equal(silence.sortie(), "");
    assert.equal(readFileSync(join(essai.dehors, ".claude/brigade-gates/session-d-essai/total"), "utf8"), "1");
  });

  test("un passage lancé pendant qu'un autre joue l'attend et le dit ; l'arbre ayant changé entre-temps, il joue à son tour", async (t) => {
    const essai = projet(t);

    const premier = lancer("bash", [GATES, essai.racine], essai.env);
    await jusqua(() => essai.jouees() === 1, "la suite du premier passage");
    const second = lancer("bash", [GATES, essai.racine], essai.env);
    await jusqua(() => second.sortie().includes(ATTEND), "le second passage au verrou");
    assert.equal(essai.jouees(), 1, "le second passage a joué sa suite sans attendre");
    writeFileSync(join(essai.racine, "nouveau.txt"), "ce que le premier passage n'a pas jugé\n");
    essai.lacher();

    assert.equal(await premier.fini, 1);
    assert.equal(await second.fini, 1);
    assert.equal(essai.jouees(), 2);
    assert.doesNotMatch(second.sortie(), new RegExp(REPRIS));
    assert.match(second.sortie(), /^ok {4}tests du runtime$/m);
  });

  test("qui a attendu un passage sur le même état de l'arbre reprend sa sortie et son code ; qui n'attend personne rejoue", async (t) => {
    const essai = projet(t);

    const premier = lancer("bash", [GATES, essai.racine], essai.env);
    await jusqua(() => essai.jouees() === 1, "la suite du premier passage");
    const second = lancer("bash", [GATES, essai.racine], essai.env);
    await jusqua(() => second.sortie().includes(ATTEND), "le second passage au verrou");
    essai.lacher();

    assert.equal(await premier.fini, 1);
    assert.equal(await second.fini, 1);
    assert.equal(essai.jouees(), 1);
    // Ce que le second ajoute se dit en `gates : ` — le hook d'arrêt écarte ces
    // lignes du détail qu'il remonte. Le reste est la sortie du premier.
    const sans = (sortie: string) => sortie.split("\n").filter((ligne) => !ligne.includes(ATTEND) && !ligne.includes(REPRIS)).sort();
    assert.deepEqual(sans(second.sortie()), sans(premier.sortie()));
    assert.match(second.sortie(), new RegExp(`^gates : ${REPRIS} \\d+`, "m"));

    // Le même arbre, plus personne devant : les gates se rejouent pour de bon.
    const troisieme = lancer("bash", [GATES, essai.racine], essai.env);
    assert.equal(await troisieme.fini, 1);
    assert.equal(essai.jouees(), 2);
    assert.doesNotMatch(troisieme.sortie(), new RegExp(`${ATTEND}|${REPRIS}`));
  });

  test("un passage tué ne retient pas les suivants", async (t) => {
    const essai = projet(t);

    const tue = lancer("bash", [GATES, essai.racine], essai.env);
    await jusqua(() => essai.jouees() === 1, "la suite du passage à tuer");
    tue.process.kill("SIGKILL");
    await tue.fini;
    // Ce que le tué a laissé derrière lui s'arrête avec la suite du suivant.
    essai.lacher();

    const suivant = lancer("bash", [GATES, essai.racine], essai.env);
    assert.equal(await suivant.fini, 1);
    assert.doesNotMatch(suivant.sortie(), new RegExp(ATTEND));
    assert.match(suivant.sortie(), /^ok {4}tests du runtime$/m);
    assert.equal(essai.jouees(), 2);
  });

  test("le verrou et le verdict gardé vivent à part des journaux de la suite", async (t) => {
    const essai = projet(t);
    essai.lacher();

    assert.equal(await lancer("bash", [GATES, essai.racine], essai.env).fini, 1);

    assert.deepEqual(readdirSync(join(essai.racine, ".brigade-state")).sort(), ["gates", "passage-des-gates"]);
    assert.deepEqual(readdirSync(join(essai.racine, ".brigade-state/gates")), []);
  });
});
