import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ouvrirJournal } from "../src/journal.ts";
import { sessionEnCours } from "../src/projections/sessions.ts";
import { ConfigInvalide, DejaEnCours, demarrer, type CauseReveil } from "../src/runtime.ts";
import { faitInconnu, horloge, repertoireTemporaire } from "./outils.ts";

test("démarrer journalise le démarrage, au nom du runtime et du projet", (t) => {
  const runtime = demarrer({ repertoireEtat: repertoireTemporaire(t), projet: "brigade", maintenant: horloge() });
  t.after(() => runtime.arreter("test"));

  assert.deepEqual(runtime.journal.tout(), [
    {
      seq: 1,
      at: "2026-10-08T10:00:00.000Z",
      project: "brigade",
      ticket: null,
      type: "runtime.started",
      author: "runtime",
      payload: { pid: process.pid, host: hostname(), node: process.version },
    },
  ]);
});

test("arrêter journalise l'arrêt et son signal", (t) => {
  const repertoire = repertoireTemporaire(t);
  demarrer({ repertoireEtat: repertoire, projet: "brigade" }).arreter("SIGTERM");

  const journal = ouvrirJournal(repertoire, { lectureSeule: true });
  t.after(() => journal.fermer());
  assert.deepEqual(
    journal.tout().map((e) => [e.type, e.payload]),
    [["runtime.started", { pid: process.pid, host: hostname(), node: process.version }], ["runtime.stopped", { signal: "SIGTERM" }]],
  );
});

test("arrêté puis redémarré, le runtime retrouve son journal et n'y voit aucune interruption", (t) => {
  const repertoire = repertoireTemporaire(t);
  const premier = demarrer({ repertoireEtat: repertoire, projet: "brigade" });
  premier.journal.ajouter({ project: "brigade", ticket: 7, author: "github", ...faitInconnu("ticket.arrived") });
  premier.arreter("SIGTERM");

  const second = demarrer({ repertoireEtat: repertoire, projet: "brigade" });
  t.after(() => second.arreter("test"));

  assert.deepEqual(
    second.journal.tout().map((e) => e.type),
    ["runtime.started", "ticket.arrived", "runtime.stopped", "runtime.started"],
  );
  assert.equal(sessionEnCours(second.journal.base)?.startedSeq, 4);
});

test("un second runtime sur le même répertoire d'état est refusé, et le refus nomme celui qui tourne", (t) => {
  const repertoire = repertoireTemporaire(t);
  const premier = demarrer({ repertoireEtat: repertoire, projet: "brigade", maintenant: horloge() });
  t.after(() => premier.arreter("test"));

  assert.throws(
    () => demarrer({ repertoireEtat: repertoire, projet: "brigade" }),
    (erreur: unknown) => {
      assert.ok(erreur instanceof DejaEnCours);
      assert.match(erreur.message, /brigade/);
      assert.match(erreur.message, new RegExp(`pid ${process.pid}`));
      assert.match(erreur.message, new RegExp(hostname()));
      assert.match(erreur.message, /2026-10-08T10:00:00\.000Z/);
      return true;
    },
  );
  assert.deepEqual(premier.journal.tout().map((e) => e.type), ["runtime.started"]);
});

for (const projet of ["", "benomite/brigade", "Brigade", "-brigade", "bri gade"]) {
  test(`le nom de projet « ${projet} » est refusé, et rien n'est écrit`, (t) => {
    const repertoire = repertoireTemporaire(t);

    assert.throws(() => demarrer({ repertoireEtat: repertoire, projet }), ConfigInvalide);
    assert.equal(existsSync(join(repertoire, "log.db")), false);
  });
}

test("le répertoire d'état est créé s'il manque", (t) => {
  const repertoire = join(repertoireTemporaire(t), "pas", "encore");
  const runtime = demarrer({ repertoireEtat: repertoire, projet: "brigade" });
  t.after(() => runtime.arreter("test"));

  assert.ok(existsSync(join(repertoire, "log.db")));
});

test("ce qu'un autre process écrit dans le journal réveille le runtime", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const runtime = demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 2, intervalleTickMs: 60_000 });
  t.after(() => runtime.arreter("test"));
  const reveil = new Promise<CauseReveil>((resoudre) => runtime.surReveil(resoudre));

  // Une autre connexion, comme le ferait la CLI depuis son propre process.
  const cli = ouvrirJournal(repertoire);
  cli.ajouter({ project: "brigade", ticket: null, author: "chef", ...faitInconnu("chef.stop") });
  cli.fermer();

  assert.equal(await reveil, "log");
});

test("le tick réveille le runtime même quand rien ne s'écrit", async (t) => {
  const runtime = demarrer({ repertoireEtat: repertoireTemporaire(t), projet: "brigade", intervalleVeilleMs: 60_000, intervalleTickMs: 2 });
  t.after(() => runtime.arreter("test"));

  assert.equal(await new Promise<CauseReveil>((resoudre) => runtime.surReveil(resoudre)), "tick");
});

test("ce que le runtime écrit lui-même ne le réveille pas", async (t) => {
  const runtime = demarrer({ repertoireEtat: repertoireTemporaire(t), projet: "brigade", intervalleVeilleMs: 2, intervalleTickMs: 60_000 });
  t.after(() => runtime.arreter("test"));
  const reveils: CauseReveil[] = [];
  runtime.surReveil((cause) => reveils.push(cause));

  runtime.journal.ajouter({ project: "brigade", ticket: null, author: "runtime", ...faitInconnu("x.y") });
  await new Promise((resoudre) => setTimeout(resoudre, 20));

  assert.deepEqual(reveils, []);
});

test("un écouteur désabonné, ou un runtime arrêté, ne réveille plus personne", async (t) => {
  const runtime = demarrer({ repertoireEtat: repertoireTemporaire(t), projet: "brigade", intervalleVeilleMs: 60_000, intervalleTickMs: 2 });
  const reveils: string[] = [];
  const desabonner = runtime.surReveil(() => reveils.push("désabonné"));
  desabonner();
  await new Promise<void>((resoudre) => runtime.surReveil(() => resoudre()));
  runtime.arreter("test");
  runtime.surReveil(() => reveils.push("après l'arrêt"));
  await new Promise((resoudre) => setTimeout(resoudre, 20));

  assert.deepEqual(reveils, []);
});

test("arrêter deux fois ne journalise qu'un arrêt", (t) => {
  const repertoire = repertoireTemporaire(t);
  const runtime = demarrer({ repertoireEtat: repertoire, projet: "brigade" });
  runtime.arreter("SIGTERM");
  runtime.arreter("SIGINT");

  const journal = ouvrirJournal(repertoire, { lectureSeule: true });
  t.after(() => journal.fermer());
  assert.deepEqual(journal.tout().map((e) => e.type), ["runtime.started", "runtime.stopped"]);
});

test("au démarrage, les projections sont recalculées depuis le journal : une projection absente à l'écriture se retrouve", (t) => {
  const repertoire = repertoireTemporaire(t);
  // Un journal écrit par un runtime qui ne connaissait pas encore la projection
  // des sessions, et mort sans avoir noté son arrêt.
  const ancien = ouvrirJournal(repertoire, { projections: [] });
  ancien.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  ancien.fermer();

  const runtime = demarrer({ repertoireEtat: repertoire, projet: "brigade" });
  t.after(() => runtime.arreter("test"));

  assert.deepEqual(
    runtime.journal.tout().map((e) => e.type),
    ["runtime.started", "runtime.interrupted", "runtime.started"],
  );
});
