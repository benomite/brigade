// Ce que coûtent les gates d'un projet : chaque passage écrit au journal, relu
// par `facts` — le dernier, face au budget du projet, et le dernier jour.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { BUDGET_DUREE_PAR_DEFAUT, BUDGET_PROCESSEUR_PAR_DEFAUT, coutDuProjet, lireBudget, noterCoutDesGates } from "../src/cout-des-gates.ts";
import { decisionsPosees, poserDecision, verifierDecision } from "../src/decisions.ts";
import type { FaitGates } from "../src/events/gates.ts";
import { principal as faits } from "../src/faits.ts";
import { jouerGatesMesurees, processeurDit } from "../src/gates.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { ConfigInvalide } from "../src/runtime.ts";
import { cuisine, issue } from "./aides/cuisine.ts";
import { aArreter, appeler, ENV_ENFANT, jusqua, repertoireTemporaire } from "./outils.ts";

const PROJET = "espace";
const HEURE_MS = 3_600_000;

// Ce que `facts` rend des gates du projet.
async function lireFaits(repertoire: string, projet = PROJET) {
  const lancee = appeler(faits, [], { BRIGADE_STATE_DIR: repertoire, BRIGADE_PROJECT: projet });
  assert.equal(await lancee.fin, 0, lancee.sortie());
  return JSON.parse(lancee.sortie()).coutDesGates;
}

// Un journal dont l'horloge se règle à la main.
function journalALHeure(t: TestContext, depart = new Date("2026-10-22T08:00:00Z")) {
  const repertoire = repertoireTemporaire(t);
  let heure = depart.getTime();
  const journal = ouvrirJournal(repertoire, { maintenant: () => new Date(heure) });
  // Fermé avant que son répertoire soit retiré : sous Windows, un fichier ouvert ne s'efface pas.
  aArreter(t, () => journal.fermer());
  const avancer = (ms: number) => void (heure += ms);
  // Un passage des gates, écrit comme la pass l'écrit.
  const passage = (ticket: number | null, payload: FaitGates["payload"], projet = PROJET) => journal.ajouter({ project: projet, ticket, author: "pass", type: "gates.ran", payload });
  return { repertoire, journal, avancer, passage, maintenant: () => new Date(heure) };
}

function worktree(t: TestContext, gates: string) {
  const racine = repertoireTemporaire(t);
  mkdirSync(join(racine, ".claude/brigade"), { recursive: true });
  writeFileSync(join(racine, ".claude/brigade/gates.sh"), `#!/usr/bin/env bash\n${gates}\n`);
  chmodSync(join(racine, ".claude/brigade/gates.sh"), 0o755);
  return racine;
}

// Une seconde de processeur, brûlée par un process à part.
const BRULE = `node -e "while (process.cpuUsage().user < 1e6) for (let i = 0; i < 1e6; i++);"`;

describe("le coût des gates", { concurrency: 8 }, () => {
  test("le processeur des process que les gates lancent compte dans leur coût, même lancés de proche en proche, et le passage se relit par `facts`", async (t) => {
    // Les gates ne calculent rien elles-mêmes : un shell qu'elles lancent en
    // lance un autre, qui brûle.
    const racine = worktree(t, `bash -c '${BRULE}'\necho "gates : VERT"`);
    const { repertoire, journal } = journalALHeure(t, new Date());

    const { gates, cout } = await jouerGatesMesurees({ worktree: racine, ticket: 17, env: ENV_ENFANT, delaiMs: 120_000 });
    noterCoutDesGates(journal, { projet: PROJET, ticket: 17, coureur: "pass", auteur: "pass", gates, cout });

    assert.equal(gates.outcome, "green");
    assert.ok(cout !== null && cout.cpuMs !== null && cout.cpuMs >= 1000, `processeur : ${cout?.cpuMs}`);
    assert.ok(cout.durationMs > 0);
    const { latest } = await lireFaits(repertoire);
    assert.deepEqual(
      { ...latest, at: undefined },
      { project: PROJET, ticket: 17, runner: "pass", outcome: "green", durationSeconds: Math.round(cout.durationMs / 100) / 10, cpuSeconds: Math.round(cout.cpuMs / 100) / 10, at: undefined },
    );
    assert.ok(!Number.isNaN(Date.parse(latest.at)));
  });

  test("des gates coupées à leur plafond ont une durée, et pas de processeur : il est mort avec elles", async (t) => {
    const racine = worktree(t, "sleep 30");

    const { gates, cout } = await jouerGatesMesurees({ worktree: racine, ticket: 17, env: ENV_ENFANT, delaiMs: 200 });

    assert.equal(gates.outcome, "timeout");
    // Le plafond court depuis le début du setup, l'horloge des gates depuis leur lancement.
    assert.ok(cout !== null && cout.durationMs > 0 && cout.durationMs < 20_000, `horloge : ${cout?.durationMs}`);
    assert.equal(cout.cpuMs, null);
  });

  test("un setup en échec ne lance pas les gates : rien n'est écrit", async (t) => {
    const racine = worktree(t, "exit 0");
    writeFileSync(join(racine, ".claude/brigade/worktree-setup.sh"), "#!/usr/bin/env bash\nexit 3\n");
    chmodSync(join(racine, ".claude/brigade/worktree-setup.sh"), 0o755);
    const { journal } = journalALHeure(t);

    const { gates, cout } = await jouerGatesMesurees({ worktree: racine, ticket: 17, env: ENV_ENFANT, delaiMs: 60_000 });
    noterCoutDesGates(journal, { projet: PROJET, ticket: 17, coureur: "pass", auteur: "pass", gates, cout });

    assert.equal(cout, null);
    assert.equal(journal.tout().filter((evenement) => evenement.type === "gates.ran").length, 0);
  });

  test("`times` se lit avec un point ou une virgule ; un shell mort avant de le dire ne dit rien", () => {
    assert.equal(processeurDit("0m0.002s 0m0.000s\n0m1.374s 0m0.020s\n"), 1394);
    assert.equal(processeurDit("0m0,002s 0m0,000s\n1m2,500s 0m0,500s\n"), 63_000);
    assert.equal(processeurDit(""), null);
  });

  test("sans budget posé, le projet a le défaut — 100 s d'horloge, 400 s de processeur ; posé par le chef, le sien", async (t) => {
    const { repertoire, journal } = journalALHeure(t);

    assert.deepEqual([BUDGET_DUREE_PAR_DEFAUT, BUDGET_PROCESSEUR_PAR_DEFAUT], [100, 400]);
    assert.deepEqual((await lireFaits(repertoire)).budget, { durationSeconds: 100, cpuSeconds: 400, parLeChef: { durationSeconds: false, cpuSeconds: false } });

    poserDecision(journal, { projet: PROJET, nom: "BRIGADE_GATES_BUDGET_SECONDS", valeur: "60", auteur: "chef" });
    assert.deepEqual((await lireFaits(repertoire)).budget, { durationSeconds: 60, cpuSeconds: 400, parLeChef: { durationSeconds: true, cpuSeconds: false } });

    poserDecision(journal, { projet: PROJET, nom: "BRIGADE_GATES_BUDGET_CPU_SECONDS", valeur: "250.5", auteur: "chef" });
    assert.deepEqual((await lireFaits(repertoire)).budget, { durationSeconds: 60, cpuSeconds: 250.5, parLeChef: { durationSeconds: true, cpuSeconds: true } });
    assert.deepEqual(lireBudget(decisionsPosees(journal.base)).parLeChef, { durationSeconds: true, cpuSeconds: true });
  });

  test("un budget qui n'est pas un nombre de secondes positif est refusé avant d'être posé", () => {
    for (const valeur of ["0", "-5", "beaucoup", "Infinity"]) {
      for (const nom of ["BRIGADE_GATES_BUDGET_SECONDS", "BRIGADE_GATES_BUDGET_CPU_SECONDS"]) {
        assert.throws(() => verifierDecision(nom, valeur), (erreur) => erreur instanceof ConfigInvalide && erreur.message.includes(`${nom} invalid`), `${nom}=${valeur}`);
      }
    }
  });

  test("le dernier passage dépasse le budget quand sa durée ou son processeur le dépasse ; seul le dernier compte", (t) => {
    const { journal, passage, maintenant } = journalALHeure(t);
    const budget = lireBudget({});
    const lire = () => coutDuProjet(journal.base, PROJET, budget, maintenant());

    assert.equal(lire().overBudget, false);
    const cas: Array<[FaitGates["payload"], boolean]> = [
      [{ runner: "pass", outcome: "green", durationMs: 100_000, cpuMs: 400_000 }, false],
      [{ runner: "cook", outcome: "green", durationMs: 100_100, cpuMs: 10_000 }, true],
      [{ runner: "pass", outcome: "red", durationMs: 20_000, cpuMs: 400_100 }, true],
      [{ runner: "pass", outcome: "timeout", durationMs: 150_000, cpuMs: null }, true],
      [{ runner: "pass", outcome: "green", durationMs: 30_000, cpuMs: null }, false],
    ];
    for (const [payload, depasse] of cas) {
      passage(17, payload);
      assert.equal(lire().overBudget, depasse, JSON.stringify(payload));
    }
    // Un budget posé plus haut : le même passage n'est plus de trop.
    passage(18, { runner: "pass", outcome: "green", durationMs: 150_000, cpuMs: 500_000 });
    assert.equal(lire().overBudget, true);
    assert.equal(coutDuProjet(journal.base, PROJET, lireBudget({ BRIGADE_GATES_BUDGET_SECONDS: "200", BRIGADE_GATES_BUDGET_CPU_SECONDS: "600" }), maintenant()).overBudget, false);
  });

  test("le dernier jour compte les passages, leur horloge et leur processeur ; un passage de plus de 24 h, ou d'un autre projet, n'y est pas", async (t) => {
    const { repertoire, journal, passage, avancer, maintenant } = journalALHeure(t, new Date(Date.now() - 30 * HEURE_MS));
    passage(1, { runner: "pass", outcome: "green", durationMs: 50_000, cpuMs: 200_000 });
    avancer(5 * HEURE_MS);
    passage(2, { runner: "cook", outcome: "red", durationMs: 40_000, cpuMs: 150_000 });
    avancer(2 * HEURE_MS);
    passage(3, { runner: "pass", outcome: "green", durationMs: 30_500, cpuMs: 120_300 });
    passage(4, { runner: "pass", outcome: "green", durationMs: 99_000, cpuMs: 999_000 }, "autre");
    avancer(10 * HEURE_MS);
    passage(null, { runner: "pass", outcome: "timeout", durationMs: 60_000, cpuMs: null });
    // La lecture, 24 h pile après le deuxième passage : il est hors du jour.
    avancer(12 * HEURE_MS);

    const cout = coutDuProjet(journal.base, PROJET, lireBudget({}), maintenant());
    // Le passage de la base (sans ticket) a son budget : il n'entre ni dans le jour ni dans le dernier passage d'un ticket.
    assert.deepEqual(cout.lastDay, { runs: 1, durationSeconds: 30.5, cpuSeconds: 120.3 });
    assert.equal(cout.latest?.ticket, 3);
    assert.deepEqual({ ...cout.base.latest, at: undefined }, { project: PROJET, ticket: null, runner: "pass", outcome: "timeout", durationSeconds: 60, cpuSeconds: null, at: undefined });

    // Lu par `facts`, à l'heure de la machine : le même jour.
    const lus = await lireFaits(repertoire);
    assert.deepEqual(lus.lastDay, { runs: 1, durationSeconds: 30.5, cpuSeconds: 120.3 });
    assert.equal(lus.latest.ticket, 3);
    assert.equal(lus.base.latest.ticket, null);
    assert.deepEqual((await lireFaits(repertoire, "autre")).lastDay, { runs: 1, durationSeconds: 99, cpuSeconds: 999 });
  });

  test("la dernière heure et le dernier jour : leurs totaux, ce que coûte un passage en moyenne, et la tendance de l'heure face au jour", async (t) => {
    // Le départ est réglé pour que la lecture par `facts`, à l'heure de la machine, tombe sur la même heure.
    const { repertoire, journal, passage, avancer, maintenant } = journalALHeure(t, new Date(Date.now() - 3.5 * HEURE_MS));
    const lire = () => coutDuProjet(journal.base, PROJET, lireBudget({}), maintenant());
    // Sans passage : des fenêtres à zéro, aucune moyenne, aucune tendance — jamais NaN.
    assert.deepEqual(lire().averages, { lastHour: { durationSeconds: null, cpuSeconds: null }, lastDay: { durationSeconds: null, cpuSeconds: null } });
    assert.deepEqual(lire().trend, { durationSeconds: null, cpuSeconds: null });

    // Deux passages il y a plus d'une heure.
    passage(1, { runner: "pass", outcome: "green", durationMs: 100_000, cpuMs: 400_000 });
    passage(2, { runner: "cook", outcome: "green", durationMs: 100_000, cpuMs: 400_000 });
    avancer(3 * HEURE_MS);
    // Rien dans la dernière heure : la moyenne du jour, pas celle de l'heure, ni de tendance.
    assert.deepEqual(lire().lastHour, { runs: 0, durationSeconds: 0, cpuSeconds: 0 });
    assert.deepEqual(lire().averages.lastDay, { durationSeconds: 100, cpuSeconds: 400 });
    assert.deepEqual(lire().trend, { durationSeconds: null, cpuSeconds: null });

    // Dans la dernière heure, deux passages plus lents ; l'un coupé, sans processeur.
    passage(3, { runner: "pass", outcome: "green", durationMs: 250_000, cpuMs: 1_000_000 });
    passage(4, { runner: "pass", outcome: "timeout", durationMs: 300_000, cpuMs: null });
    avancer(30 * 60_000);
    const cout = lire();
    assert.deepEqual(cout.lastHour, { runs: 2, durationSeconds: 550, cpuSeconds: 1000 });
    assert.deepEqual(cout.lastDay, { runs: 4, durationSeconds: 750, cpuSeconds: 1800 });
    // Le processeur se moyenne sur les passages qui l'ont dit.
    assert.deepEqual(cout.averages, { lastHour: { durationSeconds: 275, cpuSeconds: 1000 }, lastDay: { durationSeconds: 187.5, cpuSeconds: 600 } });
    assert.deepEqual(cout.trend, { durationSeconds: "up", cpuSeconds: "up" });
    // Lu par `facts`, à l'heure de la machine : les mêmes fenêtres.
    const lus = await lireFaits(repertoire);
    assert.deepEqual([lus.lastHour, lus.averages, lus.trend], [cout.lastHour, cout.averages, cout.trend]);

    // Une heure plus tard, des passages rapides : la moyenne de l'heure descend sous celle du jour.
    avancer(HEURE_MS);
    passage(5, { runner: "pass", outcome: "green", durationMs: 50_000, cpuMs: 200_000 });
    assert.deepEqual(lire().trend, { durationSeconds: "down", cpuSeconds: "down" });
  });

  test("la tendance tient tant que l'heure reste à moins de 10 % du jour", (t) => {
    const { journal, passage, avancer, maintenant } = journalALHeure(t, new Date(Date.now() - 5 * HEURE_MS));
    passage(1, { runner: "pass", outcome: "green", durationMs: 100_000, cpuMs: 400_000 });
    avancer(2 * HEURE_MS);
    passage(2, { runner: "pass", outcome: "green", durationMs: 120_000, cpuMs: 380_000 });
    // Heure 120 s face à un jour de 110 s, 380 s face à 390 s : moins de 10 % d'écart.
    assert.deepEqual(coutDuProjet(journal.base, PROJET, lireBudget({}), maintenant()).trend, { durationSeconds: "steady", cpuSeconds: "steady" });
  });

  test("la pass écrit le coût des gates qu'elle joue : projet, ticket, `pass`, horloge et processeur se relisent par `facts`", async (t) => {
    const { journal, repertoire } = cuisine(t, { pass: true, issues: [issue(17)] });

    await jusqua(() => journal.tout().some((evenement) => evenement.type === "gates.ran" && evenement.ticket === 17));

    const { latest } = await lireFaits(repertoire, "brigade");
    assert.equal(latest.project, "brigade");
    assert.equal(latest.ticket, 17);
    assert.equal(latest.runner, "pass");
    assert.equal(latest.outcome, "green");
    assert.ok(latest.durationSeconds >= 0 && latest.cpuSeconds >= 0, JSON.stringify(latest));
  });
});
