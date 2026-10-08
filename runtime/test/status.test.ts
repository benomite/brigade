// La commande par laquelle le chef voit la cuisine : `npm run status`.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Plafonds } from "../src/evenements/garde-fous.ts";
import { brancherGardeFous } from "../src/garde-fous.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { PROJECTIONS } from "../src/projections.ts";
import { demarrer } from "../src/runtime.ts";
import { FAUX_CLAUDE, faitInconnu, lancer, photographier, repertoireTemporaire } from "./outils.ts";

const STATUS = join(import.meta.dirname, "../src/status.ts");
const PLAFONDS: Plafonds = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };

// Un runtime qui tourne, un ticket sur le rail et son cook en cours.
function cuisine(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const runtime = brancherGardeFous(
    { plafonds: PLAFONDS, seuilDisjoncteur: 3, graceMs: 2000 },
    demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 60_000, intervalleTickMs: 20 }),
  );
  t.after(() => runtime.arreter("test"));
  runtime.journal.ajouter({
    project: "brigade",
    ticket: 7,
    author: "github",
    type: "ticket.arrived",
    payload: { title: "Le ticket sept", priority: 1, createdAt: "2026-10-01T00:00:07Z", url: "https://exemple.test/7" },
  });
  const cook = runtime.lancer({ ticket: 7, commande: FAUX_CLAUDE, args: [], env: { PATH: process.env.PATH ?? "", FAUX_CLAUDE: "muet-apres-un-tour" } });
  return { repertoire, runtime, cook };
}

test("pendant qu'un cook tourne, la commande répond et montre le runtime, le rail, le cook et les derniers événements", async (t) => {
  const { repertoire, runtime, cook } = cuisine(t);
  while (!runtime.journal.duTicket(7).some((e) => e.type === "cook.progressed" && e.payload.turns === 1)) {
    await new Promise((resoudre) => setTimeout(resoudre, 5));
  }

  const commande = lancer(t, STATUS, [], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await commande.fin, 0);
  const sortie = commande.sortie();
  assert.match(sortie, /^projet     brigade$/m);
  assert.match(sortie, new RegExp(`^runtime    en marche d'après le journal — pid ${process.pid} sur `, "m"));
  assert.match(sortie, /^           dernier tick il y a \d+ s \(cadence : 0 s\)$/m);
  assert.match(sortie, /^rail       1 en attente$/m);
  assert.match(sortie, /^  #7  en attente  prio:1  depuis \d+ s  Le ticket sept$/m);
  assert.match(sortie, /^cooks      1 en cours$/m);
  assert.match(sortie, new RegExp(`^  #7  ${cook.run}  \\d+ s sur 1 h 00 · 1 tours sur 100 · 10 tokens sur 2\\s000\\s000 \\(relevé il y a \\d+ s\\)$`, "m"));
  assert.match(sortie, /^  \d+  \S+  brigade  #7  cook\.launched  runtime  /m);
  assert.doesNotMatch(sortie, /runtime\.ticked|cook\.progressed/);
});

test("la commande ne modifie ni le journal ni ses projections", async (t) => {
  const repertoire = repertoireTemporaire(t);
  demarrer({ repertoireEtat: repertoire, projet: "brigade" }).arreter("SIGTERM");
  const lire = () => {
    const journal = ouvrirJournal(repertoire, { lectureSeule: true });
    try {
      return [journal.tout(), photographier(journal, PROJECTIONS)];
    } finally {
      journal.fermer();
    }
  };
  const avant = lire();

  const commande = lancer(t, STATUS, [], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await commande.fin, 0);
  assert.match(commande.sortie(), /^runtime    arrêté il y a \d+ s$/m);
  assert.deepEqual(lire(), avant);
});

test("avec `--suivre`, le chef voit la photo puis chaque événement à mesure qu'il s'écrit, jusqu'à Ctrl-C", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  t.after(() => journal.fermer());
  const noter = (ticket: number, type: string) => journal.ajouter({ project: "brigade", ticket, author: "runtime", ...faitInconnu(type) });
  noter(7, "ticket.arrived");

  const commande = lancer(t, STATUS, ["--suivre", "7"], { BRIGADE_STATE_DIR: repertoire });
  await commande.attendre("suivi en direct du ticket #7 — Ctrl-C pour arrêter");
  noter(8, "ticket.taken");
  noter(7, "ticket.taken");
  noter(7, "pass.verdict");
  await commande.attendre("pass.verdict");
  commande.process.kill("SIGINT");

  assert.equal(await commande.fin, 0);
  const suivi = commande.sortie().split("Ctrl-C pour arrêter\n")[1] ?? "";
  assert.deepEqual(suivi.trimEnd().split("\n").map((ligne) => ligne.split("  ").slice(3, 5)), [["#7", "ticket.taken"], ["#7", "pass.verdict"]]);
});

test("sans répertoire d'état, sans journal, ou avec un argument inconnu, la commande échoue en disant pourquoi", async (t) => {
  const sansVariable = lancer(t, STATUS, []);
  const sansJournal = lancer(t, STATUS, [], { BRIGADE_STATE_DIR: repertoireTemporaire(t) });
  const arguments_ = [["7"], ["--suivre", "sept"], ["--suivre", "7", "8"], ["--regarder"]].map((args) =>
    lancer(t, STATUS, args, { BRIGADE_STATE_DIR: repertoireTemporaire(t) }),
  );

  assert.equal(await sansVariable.fin, 2);
  assert.match(sansVariable.sortie(), /BRIGADE_STATE_DIR n'est pas défini/);
  assert.equal(await sansJournal.fin, 1);
  assert.match(sansJournal.sortie(), /aucun journal/);
  for (const commande of arguments_) {
    assert.equal(await commande.fin, 2);
    assert.match(commande.sortie(), /usage/);
  }
});

test("un journal d'avant ces projections le dit, au lieu d'une erreur de base", async (t) => {
  const repertoire = repertoireTemporaire(t);
  ouvrirJournal(repertoire, { projections: [] }).fermer();

  const commande = lancer(t, STATUS, [], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await commande.fin, 1);
  assert.match(commande.sortie(), /redémarrer le runtime/);
});
