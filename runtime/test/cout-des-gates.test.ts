// Ce que coûtent les gates d'un projet : chaque passage écrit au journal, relu
// par `facts` — le dernier, face au budget du projet, et le dernier jour.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { BUDGET_DUREE_PAR_DEFAUT, BUDGET_PROCESSEUR_PAR_DEFAUT, coutDuProjet, lireBudget, noterCoutDesGates } from "../src/cout-des-gates.ts";
import { decisionsPosees, poserDecision, verifierDecision } from "../src/decisions.ts";
import type { FaitGates } from "../src/events/gates.ts";
import { jouerGatesMesurees, processeurDit } from "../src/gates.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { ConfigInvalide } from "../src/runtime.ts";
import { aArreter, appeler, ENV_ENFANT, repertoireTemporaire } from "./outils.ts";
import { posixOnly } from "./support/plateforme.ts";

const PROJET = "espace";
const HEURE_MS = 3_600_000;


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



  test("la tendance tient tant que l'heure reste à moins de 10 % du jour", (t) => {
    const { journal, passage, avancer, maintenant } = journalALHeure(t, new Date(Date.now() - 5 * HEURE_MS));
    passage(1, { runner: "pass", outcome: "green", durationMs: 100_000, cpuMs: 400_000 });
    avancer(2 * HEURE_MS);
    passage(2, { runner: "pass", outcome: "green", durationMs: 120_000, cpuMs: 380_000 });
    // Heure 120 s face à un jour de 110 s, 380 s face à 390 s : moins de 10 % d'écart.
    assert.deepEqual(coutDuProjet(journal.base, PROJET, lireBudget({}), maintenant()).trend, { durationSeconds: "steady", cpuSeconds: "steady" });
  });
});

// Le vrai minuteur, pour attendre de vraies gates pendant que l'horloge du plafond est tenue par le test.
const vraiMinuteur = setTimeout;
const souffler = () => new Promise((resoudre) => vraiMinuteur(resoudre, 5));

// Le plafond tombe à l'horloge du test (#2464). Un seul test à la fois — l'horloge tenue est celle de tout le process.
describe("le coût des gates, à l'horloge du test", () => {
  test("des gates coupées à leur plafond ont une durée, et pas de processeur : il est mort avec elles", { skip: posixOnly("plays gates that sleep 30 s until the test moves its clock past their 200 ms cap, and expects a timeout with a duration but no processor time; on Windows the cap's kill of their process group (a negative pid) fails silently, so the gates sleep to their end, come back green, and their processor time is read") }, async (t) => {
    const parties = join(repertoireTemporaire(t), "parties");
    const racine = worktree(t, `touch '${parties}'; sleep 30`);
    t.mock.timers.enable({ apis: ["setTimeout"] });

    const enCours = jouerGatesMesurees({ worktree: racine, ticket: 17, env: ENV_ENFANT, delaiMs: 200 });
    while (!existsSync(parties)) await souffler();
    t.mock.timers.tick(200);
    const { gates, cout } = await enCours;

    assert.equal(gates.outcome, "timeout");
    // Le plafond court depuis le début du setup, l'horloge des gates depuis leur lancement.
    assert.ok(cout !== null && cout.durationMs > 0 && cout.durationMs < 20_000, `horloge : ${cout?.durationMs}`);
    assert.equal(cout.cpuMs, null);
  });
});
