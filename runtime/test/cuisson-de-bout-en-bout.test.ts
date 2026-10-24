// Un projet servi de bout en bout par une station, sur la plateforme de la
// machine — Windows compris : le job de CI Windows le joue, et ce fichier n'y
// suppose ni bash ni chemin écrit avec `/`. La station prend le ticket, prépare
// le worktree du cook dans un vrai clone git, sous un répertoire dont le nom
// porte des espaces ; y lance une doublure de `claude` qui se lance comme un
// exécutable (`aides/faux-cook.ts`), nommée elle aussi par un chemin à espaces ;
// le relais du cook écrit sa fin, que la station raconte au journal comme sur
// toute autre station ; la branche est poussée et le worktree rangé. Arrêté, un
// cook ne laisse aucun process derrière lui, et son worktree est rangé : la
// station en prépare un neuf au cook suivant.
import assert from "node:assert/strict";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { argumentsClaude } from "../src/claude.ts";
import { chef, cuisine, fauxGitHub, issue, montre, type Lieux } from "./aides/cuisine.ts";
import { depotGit, git, jusqua, mort, repertoireTemporaire, temporaireDuFichier, vivant } from "./outils.ts";

const rienNeReste = temporaireDuFichier();

const FAUX_COOK = join(import.meta.dirname, "aides/faux-cook.ts");
const SOUS_WINDOWS = process.platform === "win32";

type Lancement = { args: string[]; cwd: string; lisezmoi: string | null };

// Une cuisine sur un vrai dépôt, dont l'état vit sous un répertoire à espaces,
// et dont le `claude` est la doublure exécutable, copiée sous un chemin à
// espaces. Le `git` de la machine y extrait en `\r\n` (`core.autocrlf`, comme
// Git pour Windows le règle par défaut) : la station doit l'en empêcher.
function cuisineDeBoutEnBout(t: TestContext, scenario: "livre" | "attend") {
  const lieux: Lieux = {
    repertoire: join(repertoireTemporaire(t), "dossier de la station"),
    ...depotGit(t),
    gh: fauxGitHub(issue(14)),
    heure: montre(),
  };
  mkdirSync(lieux.repertoire);
  const bin = join(repertoireTemporaire(t), "Program Files", "faux cook.ts");
  mkdirSync(join(bin, ".."));
  copyFileSync(FAUX_COOK, bin);
  chmodSync(bin, 0o755);
  const temoin = join(repertoireTemporaire(t), "temoin");
  const pids = join(repertoireTemporaire(t), "pids");
  mkdirSync(temoin);
  mkdirSync(pids);
  const lieu = cuisine(t, {
    git: true,
    lieux,
    bin,
    sansGates: true,
    env: { FAUX_COOK: scenario, FAUX_COOK_TEMOIN: temoin, FAUX_COOK_PIDS: pids, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.autocrlf", GIT_CONFIG_VALUE_0: "true" },
  });
  const lancements = (): Lancement[] => readdirSync(temoin).map((nom) => JSON.parse(readFileSync(join(temoin, nom), "utf8")) as Lancement);
  const pidsDeLArbre = () => readdirSync(pids).map((nom) => Number(nom.replace(/\.pid$/, "")));
  // Le run d'un lancement : le worktree que le journal lui donne.
  const runs = () => lieu.journal.duTicket(14).flatMap((e) => (e.type === "cook.launched" ? [String(e.payload.worktree).replace(/^worktrees\//, "")] : []));
  return { ...lieu, bin, lancements, pidsDeLArbre, runs };
}

// Les worktrees que le clone porte encore, le sien excepté.
const worktreesDuClone = (clone: string) =>
  git(clone, "worktree", "list", "--porcelain")
    .split("\n")
    .filter((ligne) => ligne.startsWith("worktree "))
    .slice(1);

describe("un projet servi de bout en bout, sur cette plateforme", () => {
  test("la station prépare le worktree, y lance le cook — chemins à espaces, arguments intacts —, reçoit sa fin par le relais, pousse sa branche et range le worktree", async (t) => {
    const { repertoire, origine, clone, etat, lancements, runs, journal } = cuisineDeBoutEnBout(t, "livre");
    await jusqua(() => etat(14) === "pass");
    const [run] = runs();
    assert.ok(run !== undefined, "un cook a été lancé");
    const worktree = join(repertoire, "worktrees", run);

    // Le cook a tourné dans son worktree, sous l'état de la station — sous Windows, un chemin de Windows.
    const [lance, ...autres] = lancements();
    assert.ok(lance !== undefined && autres.length === 0, JSON.stringify(lancements()));
    assert.ok(lance.cwd.endsWith(join("dossier de la station", "worktrees", run)), lance.cwd);
    if (SOUS_WINDOWS) assert.match(lance.cwd, /^[A-Za-z]:\\/);
    // Ses arguments lui sont arrivés tels que la station les a écrits : la consigne sur plusieurs
    // lignes, un argument vide, des espaces, des parenthèses, des astérisques.
    const [drapeau, consigne = ""] = lance.args;
    assert.equal(drapeau, "-p");
    assert.match(consigne, /le ticket #14 du dépôt acme\/brigade — « Ticket 14 »/);
    assert.deepEqual(lance.args, argumentsClaude(consigne, { model: "sonnet", effort: "low" }));
    // Le worktree est extrait dans les fins de ligne du dépôt, malgré `core.autocrlf`.
    assert.equal(lance.lisezmoi, "le projet\n");

    // Le relais a écrit sa fin, de la même forme que partout.
    assert.deepEqual(JSON.parse(readFileSync(join(repertoire, "runs", `${run}.fin.json`), "utf8")), { code: 0, signal: null, erreur: null, masques: 0 });
    // Le journal la raconte comme pour toute station : les mêmes faits, les mêmes valeurs, `/` dans les chemins.
    // Le rangement du worktree suit le passage en pass sans lui être lié : sur une machine lente il est
    // déjà au journal quand on le lit, sur une rapide pas encore — il se vérifie plus bas, en l'attendant.
    const faits = journal.duTicket(14).filter((e) => e.type !== "cook.progressed" && e.type !== "worktree.removed");
    const payload = (type: string): Record<string, unknown> => ({ ...faits.find((e) => e.type === type)?.payload });
    const raconte = JSON.stringify(faits.map((e) => [e.type, e.payload]));
    assert.deepEqual(
      faits.map((e) => e.type),
      ["ticket.arrived", "ticket.taken", "cook.launched", "cook.exited", "ticket.passing", "cook.reported"],
      raconte,
    );
    const { head, ...lancement } = payload("cook.launched");
    assert.match(String(head), /^[0-9a-f]{40}$/);
    assert.deepEqual(lancement, {
      run,
      limits: { turns: 100_000, durationMs: 60_000, tokens: 1_000_000, idleMs: 60_000 },
      stream: `runs/${run}.jsonl`,
      station: "box/claude",
      model: "sonnet",
      effort: "low",
      branch: `cook/${run}`,
      worktree: `worktrees/${run}`,
      lessons: [],
    });
    const { durationMs, ...sorti } = payload("cook.exited");
    assert.equal(typeof durationMs, "number");
    assert.deepEqual(sorti, { run, outcome: "ok", code: 0, signal: null, turns: 1, tokens: 10 });
    const { summary, pr, ...rendu } = payload("cook.reported");
    assert.match(String(summary), /<livrable>/);
    assert.match(String(pr), /\/pull\/\d+$/);
    assert.deepEqual(rendu, { run, ending: "done", reason: null, deliverable: "J'ai ajouté `travail.txt`, commité sur ma branche.", branch: `cook/${run}` });

    // La branche est sur l'origine, avec le commit du cook.
    assert.equal(git(origine, "log", "-1", "--format=%s", `cook/${run}`), "le travail du cook");
    // Le worktree est rangé : ni sur le disque, ni dans le clone.
    await jusqua(() => !existsSync(worktree));
    assert.deepEqual(worktreesDuClone(clone), []);
  });

  test("arrêté, le cook ne laisse aucun process — ni lui, ni son enfant, ni son petit-enfant —, son worktree est rangé, et le cook suivant en reçoit un neuf", async (t) => {
    const { repertoire, clone, dernier, pidsDeLArbre, runs, lancements } = cuisineDeBoutEnBout(t, "attend");
    await jusqua(() => pidsDeLArbre().length === 3);
    const arbre = pidsDeLArbre();
    assert.deepEqual(arbre.filter(vivant), arbre);
    const [premier] = runs();
    assert.ok(premier !== undefined);

    chef(repertoire, "kitchen.stopped");
    await jusqua(() => dernier("cook.exited", 14) !== undefined);
    assert.equal(dernier("cook.exited", 14)?.outcome, "stop");
    for (const pid of arbre) await mort(pid);
    await jusqua(() => !existsSync(join(repertoire, "worktrees", premier)));
    assert.deepEqual(worktreesDuClone(clone), []);

    // La cuisine rouverte, le ticket repart dans un worktree neuf du même clone.
    chef(repertoire, "kitchen.resumed");
    await jusqua(() => runs().length === 2 && lancements().length === 2);
    const second = runs()[1] ?? "";
    assert.notEqual(second, premier);
    assert.ok(lancements().some((lance) => lance.cwd.endsWith(join("worktrees", second))));
  });
});

test("cuisson-de-bout-en-bout.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
