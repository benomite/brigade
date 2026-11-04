// La pass ne rejoue pas les gates que le cook vient de passer vertes sur le
// code qu'elle juge : un vrai dépôt git, un cook qui les joue par le lanceur de
// la station, et la pass qui juge sa livraison.
import assert from "node:assert/strict";
import { appendFileSync, copyFileSync, cpSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { before, describe, test, type TestContext } from "node:test";
import { coutDuProjet, lireBudget } from "../src/cout-des-gates.ts";
import type { FaitGates } from "../src/events/gates.ts";
import type { Gates } from "../src/events/pass.ts";
import { cuisine, fauxGitHub, issue, montre, type Options } from "./aides/cuisine.ts";
import { BASE, depotGit, git, jusqua, repertoireDuFichier, repertoireTemporaire } from "./outils.ts";
import { posixOnly } from "./support/plateforme.ts";

// Le projet porte ses gates sur sa base : la doublure, par un lien. `copie` :
// un lien vers une copie à lui, que le test peut changer sans toucher à l'arbre.
function lieuxDuProjet(t: TestContext, copie = false) {
  const { origine, clone } = depotGit(t);
  const doublure = join(import.meta.dirname, "aides/fausses-gates.sh");
  const script = copie ? join(repertoireTemporaire(t), "gates-du-projet.sh") : doublure;
  if (copie) copyFileSync(doublure, script);
  mkdirSync(join(clone, ".claude/brigade"), { recursive: true });
  symlinkSync(script, join(clone, ".claude/brigade/gates.sh"));
  git(clone, "add", ".");
  git(clone, "commit", "-q", "-m", "les gates du projet");
  git(clone, "push", "-q", "origin", BASE);
  return { lieux: { repertoire: repertoireTemporaire(t), origine, clone, gh: fauxGitHub(issue(17)), heure: montre() }, script };
}

// Le projet dont les gates sont la doublure même, fabriqué une fois pour le
// fichier : chaque test en reçoit une copie, qui coûte bien moins que les
// `git` qui le font. L'adresse de l'origine y est réécrite pour la copie.
const ORIGINE_DU_MODELE = "@ORIGINE@";
let modele: string | undefined;
function fabriquerLeModele(): string {
  const racine = repertoireDuFichier("brigade-reprise-des-gates-");
  const [origine, clone] = [join(racine, "origine.git"), join(racine, "clone")];
  mkdirSync(join(clone, ".claude/brigade"), { recursive: true });
  git(clone, "init", "-q", `--initial-branch=${BASE}`);
  writeFileSync(join(clone, "LISEZMOI"), "le projet\n");
  symlinkSync(join(import.meta.dirname, "aides/fausses-gates.sh"), join(clone, ".claude/brigade/gates.sh"));
  git(clone, "add", ".");
  git(clone, "commit", "-q", "-m", "le projet et ses gates");
  git(racine, "clone", "-q", "--bare", clone, origine);
  git(clone, "remote", "add", "origin", ORIGINE_DU_MODELE);
  git(clone, "update-ref", `refs/remotes/origin/${BASE}`, "HEAD");
  return racine;
}
function copieDuModele(t: TestContext) {
  modele ??= fabriquerLeModele();
  const racine = repertoireTemporaire(t);
  cpSync(modele, racine, { recursive: true, verbatimSymlinks: true });
  const [origine, clone] = [join(racine, "origine.git"), join(racine, "clone")];
  const config = join(clone, ".git/config");
  writeFileSync(config, readFileSync(config, "utf8").replaceAll(ORIGINE_DU_MODELE, origine.replaceAll("\\", "/")));
  return { lieux: { repertoire: repertoireTemporaire(t), origine, clone, gh: fauxGitHub(issue(17)), heure: montre() } };
}

function service(t: TestContext, options: Options) {
  const lieu = cuisine(t, { tickMs: 25, git: true, sansSync: true, ...options });
  const { journal, repertoire } = lieu;
  const verdict = () => lieu.dernier("pass.judged", 17) as { verdict: string; gates: Gates } | undefined;
  const passages = () => journal.tout().flatMap((evenement) => (evenement.type === "gates.ran" ? [{ seq: evenement.seq, ticket: evenement.ticket, ...(evenement.payload as FaitGates["payload"]) }] : []));
  const jugement = join(repertoire, "worktrees", ".essais", "jugement-17");
  // Les gates que la pass a jouées : celles du worktree où elle juge.
  const parLaPass = () => lieu.gates.appels().filter((worktree) => worktree === jugement);
  return { ...lieu, verdict, passages, parLaPass };
}

describe("la pass reprend les gates du cook", { concurrency: 3 }, () => {
  before(() => void (modele ??= fabriquerLeModele()));

  test("le cook a passé les gates vertes sur ce qu'il livre, la base n'a pas bougé : la pass ne lance aucune gate, son verdict nomme le passage du cook qu'elle reprend, et rien ne s'ajoute au coût", { skip: posixOnly("a cook whose green launcher run covers what it delivers lets the pass reuse it without playing any gates; on Windows the brief names the launcher with backslashes, which neither the test's regular expression nor the fake claude's grep for `/brigade/gates-du-cook` matches, so the cook never plays its gates") }, async (t) => {
    const { lieux } = copieDuModele(t);
    const { verdict, passages, parLaPass, gates, cooks, journal, heure, types } = service(t, { lieux, pass: true, scenario: "livre-apres-ses-gates" });
    // Deux faits l'un après l'autre : la livraison du cook, puis le verdict.
    await jusqua(() => types(17).includes("ticket.passing"));
    await jusqua(() => verdict() !== undefined);

    // La consigne du cook nomme le lanceur, et il l'a joué : une fois.
    assert.match(cooks()[0]?.args[1] ?? "", /joue-les par `[^`]*\/\.git\/brigade\/gates-du-cook <ton worktree>`/);
    assert.equal(gates.appels().length, 1);
    assert.deepEqual(parLaPass(), []);
    const [duCook, ...autres] = passages();
    assert.deepEqual([duCook?.runner, duCook?.outcome, autres], ["cook", "green", []]);
    const { verdict: vert, gates: jugees } = verdict()!;
    assert.equal(vert, "green");
    assert.deepEqual(jugees.reused, { seq: duCook?.seq, runner: "cook", ticket: 17, at: journal.tout().find((e) => e.seq === duCook?.seq)?.at });
    assert.match(jugees.tail, new RegExp(`^gates non rejouées : le cook les a déjà passées vertes sur le même arbre, avec la même configuration — passage ${duCook?.seq} du journal \\(#17, `));
    // Le coût du projet ne compte que le passage du cook.
    assert.equal(coutDuProjet(journal.base, "brigade", lireBudget({}), heure.maintenant()).lastDay.runs, 1);
  });

  test("la configuration des gates a changé entre le cook et la pass, sur le même arbre : la pass les joue en entier", { skip: posixOnly("the gates script behind the link changes between a cook's green launcher run and the pass, which must replay them on the same tree; on Windows the fake claude's grep for `/brigade/gates-du-cook` misses the backslashed launcher path of the brief, so there is no cook run to compare with") }, async (t) => {
    const { lieux, script } = lieuxDuProjet(t, true);
    // Une première vie sans pass : le cook passe ses gates vertes et livre.
    const premiere = service(t, { lieux, scenario: "livre-apres-ses-gates" });
    await jusqua(() => premiere.types(17).includes("worktree.removed"));
    premiere.runtime.arreter("test");
    // Le script que le lien désigne change : pas l'arbre.
    appendFileSync(script, "# réglé autrement\n");

    const { verdict, passages, parLaPass } = service(t, { lieux, pass: true });
    await jusqua(() => verdict() !== undefined);

    assert.equal(parLaPass().length, 1);
    const [duCook, deLaPass] = passages();
    assert.deepEqual([duCook?.runner, deLaPass?.runner], ["cook", "pass"]);
    assert.equal(duCook?.tree, deLaPass?.tree);
    assert.notEqual(duCook?.config, deLaPass?.config);
    assert.equal(verdict()?.gates.reused, undefined);
  });
});
