// La pass ne rejoue pas les gates que le cook vient de passer vertes sur le
// code qu'elle juge : un vrai dépôt git, un cook qui les joue par le lanceur de
// la station, et la pass qui juge sa livraison.
import assert from "node:assert/strict";
import { appendFileSync, copyFileSync, mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { coutDuProjet, lireBudget } from "../src/cout-des-gates.ts";
import type { FaitGates } from "../src/events/gates.ts";
import type { Gates } from "../src/events/pass.ts";
import { cuisine, fauxGitHub, issue, montre, type Options } from "./aides/cuisine.ts";
import { BASE, depotGit, git, jusqua, repertoireTemporaire } from "./outils.ts";
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

function service(t: TestContext, options: Options) {
  const lieu = cuisine(t, { git: true, ...options });
  const { journal, repertoire } = lieu;
  const verdict = () => lieu.dernier("pass.judged", 17) as { verdict: string; gates: Gates } | undefined;
  const passages = () => journal.tout().flatMap((evenement) => (evenement.type === "gates.ran" ? [{ seq: evenement.seq, ticket: evenement.ticket, ...(evenement.payload as FaitGates["payload"]) }] : []));
  const jugement = join(repertoire, "worktrees", ".essais", "jugement-17");
  // Les gates que la pass a jouées : celles du worktree où elle juge.
  const parLaPass = () => lieu.gates.appels().filter((worktree) => worktree === jugement);
  return { ...lieu, verdict, passages, parLaPass };
}

describe("la pass reprend les gates du cook", { concurrency: 8 }, () => {
  test("le cook a passé les gates vertes sur ce qu'il livre, la base n'a pas bougé : la pass ne lance aucune gate, son verdict nomme le passage du cook qu'elle reprend, et rien ne s'ajoute au coût", { skip: posixOnly("runs a cook (the fake claude, a bash script) that plays its gates through the gates-du-cook launcher, a bash script the station writes into .git/brigade; on the Windows job: no match: 'Tu es un cook de la brigade : tu exécutes un seul ticket, le ticket #17 du dépôt acme/brigade — « Ticket 17 ».\\n' + '\\n' + \"Les gates d…") }, async (t) => {
    const { lieux } = lieuxDuProjet(t);
    const { verdict, passages, parLaPass, gates, cooks, journal, heure } = service(t, { lieux, pass: true, scenario: "livre-apres-ses-gates" });
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

  test("le cook a passé les gates avant son dernier changement : l'arbre n'est plus le même, la pass les joue en entier", { skip: posixOnly("runs a cook (the fake claude, a bash script) that plays its gates through the gates-du-cook launcher, a bash script the station writes into .git/brigade; on the Windows job: 1 !== 2") }, async (t) => {
    const { lieux } = lieuxDuProjet(t);
    const { verdict, passages, parLaPass, gates } = service(t, { lieux, pass: true, scenario: "livre-avant-ses-gates" });
    await jusqua(() => verdict() !== undefined);

    assert.equal(gates.appels().length, 2);
    assert.equal(parLaPass().length, 1);
    assert.deepEqual(
      passages().map((passage) => [passage.runner, passage.outcome]),
      [
        ["cook", "green"],
        ["pass", "green"],
      ],
    );
    assert.notEqual(passages()[0]?.tree, passages()[1]?.tree);
    assert.equal(verdict()?.gates.reused, undefined);
  });

  test("les gates du cook étaient rouges : la pass les joue en entier", { skip: posixOnly("runs a cook (the fake claude, a bash script) that plays its gates through the gates-du-cook launcher, a bash script the station writes into .git/brigade; on the Windows job: - 'cook', - 'red'") }, async (t) => {
    const { lieux } = lieuxDuProjet(t);
    const lieu = service(t, { lieux, pass: true, scenario: "livre-apres-ses-gates" });
    lieu.gates.regler("rouge");
    await jusqua(() => lieu.verdict() !== undefined);

    assert.equal(lieu.parLaPass().length, 1);
    // Ceux du ticket : la pass a joué ensuite celles de la base seule, pour savoir à qui est le rouge.
    const duTicket = lieu.passages().filter((passage) => passage.ticket === 17);
    assert.deepEqual(
      duTicket.map((passage) => [passage.runner, passage.outcome]),
      [
        ["cook", "red"],
        ["pass", "red"],
      ],
    );
    // Le même arbre : seul le verdict du cook l'a écarté.
    assert.equal(duTicket[0]?.tree, duTicket[1]?.tree);
    assert.equal(lieu.verdict()?.gates.reused, undefined);
  });

  test("la configuration des gates a changé entre le cook et la pass, sur le même arbre : la pass les joue en entier", { skip: posixOnly("runs a cook (the fake claude, a bash script) that plays its gates through the gates-du-cook launcher, a bash script the station writes into .git/brigade; on the Windows job: - 'cook', 'pass', + undefined") }, async (t) => {
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
