// Le plafond des jugements simultanés de la pass est un garde-fou comme les
// autres (#2000) : il se règle par l'environnement du runtime
// (`BRIGADE_MAX_JUDGEMENTS`), s'écrit au journal avec les autres réglages
// (`guard.configured`), et `guardrails` le montre à côté d'eux.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { brancherGardeFous, lireReglages, type Reglages } from "../../src/garde-fous.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { plafondDesJugements } from "../../src/projections/guardrails.ts";
import { ConfigInvalide, demarrer } from "../../src/runtime.ts";
import { repertoireTemporaire } from "../outils.ts";

const REGLAGES: Reglages = { plafonds: { durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 }, seuilDisjoncteur: 3, graceMs: 2000 };

// Un runtime branché sur ses garde-fous, le temps d'écrire ses réglages.
const brancher = (repertoire: string, reglages: Partial<Reglages> = {}) => brancherGardeFous({ ...REGLAGES, ...reglages }, demarrer({ repertoireEtat: repertoire, projet: "brigade" })).arreter("test");

function journal(t: TestContext, repertoire: string) {
  const lu = ouvrirJournal(repertoire, { lectureSeule: true });
  t.after(() => lu.fermer());
  return lu;
}

test("il se règle par BRIGADE_MAX_JUDGEMENTS — trois sans rien régler —, et une valeur illisible refuse le démarrage en nommant la variable", () => {
  assert.equal(lireReglages({}).jugements, 3);
  assert.equal(lireReglages({ BRIGADE_MAX_JUDGEMENTS: "1" }).jugements, 1);
  assert.equal(lireReglages({ BRIGADE_MAX_JUDGEMENTS: "8" }).jugements, 8);
  for (const valeur of ["0", "-2", "2.5", "deux"]) {
    assert.throws(
      () => lireReglages({ BRIGADE_MAX_JUDGEMENTS: valeur }),
      (erreur: unknown) => erreur instanceof ConfigInvalide && erreur.message.includes("BRIGADE_MAX_JUDGEMENTS"),
    );
  }
});

test("il s'écrit au journal avec les autres réglages, et ne s'y réécrit que s'il change", (t) => {
  const repertoire = repertoireTemporaire(t);
  brancher(repertoire);
  brancher(repertoire, { jugements: 3 });
  brancher(repertoire, { jugements: 1 });
  brancher(repertoire, { jugements: 1 });

  const lu = journal(t, repertoire);
  assert.deepEqual(
    lu.tout().filter((e) => e.type === "guard.configured").map((e) => (e.payload as { judgements: number }).judgements),
    [3, 1],
  );
  assert.equal(plafondDesJugements(lu.base), 1);
});

test("un journal écrit par un runtime d'avant ce plafond le dit : la pass y jugeait une livraison à la fois", (t) => {
  const repertoire = repertoireTemporaire(t);
  const ecrit = ouvrirJournal(repertoire);
  ecrit.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "guard.configured", payload: { limits: REGLAGES.plafonds, breakerThreshold: 3 } });
  ecrit.fermer();
  assert.equal(plafondDesJugements(journal(t, repertoire).base), null);
});
