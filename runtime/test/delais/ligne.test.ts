// La ligne de `brigade <project> status` (#4299), sur le clone du projet : la part en 10 minutes ou moins et la médiane sur 24 heures.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { direLeDelai, ligneDuDelaiDePrise } from "../../src/delais/ligne.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { photoDuProjet } from "../../src/status.ts";
import { repertoireTemporaire } from "../outils.ts";
import { ENREGISTREMENTS, MAINTENANT } from "./jeu.ts";

const A = new Date(MAINTENANT);

function clone(t: TestContext, contenu?: string): string {
  const depot = repertoireTemporaire(t);
  if (contenu !== undefined) {
    mkdirSync(join(depot, ".claude", "brigade"), { recursive: true });
    writeFileSync(join(depot, ".claude", "brigade", "temps-tickets.json"), contenu);
  }
  return depot;
}

test("the line says the share, how many, and the median, rounded to the tenth", () => {
  assert.equal(direLeDelai({ nombre: 2, part: 0.5, medianeMin: 16.5 }), "taken→merged 24 h: 50% in 10 min or less (1 of 2), median 16.5 min");
  assert.equal(direLeDelai({ nombre: 3, part: 2 / 3, medianeMin: 7.04 }), "taken→merged 24 h: 67% in 10 min or less (2 of 3), median 7 min");
  assert.equal(direLeDelai({ nombre: 0, part: null, medianeMin: null }), "taken→merged 24 h: no merged ticket in the last 24 h");
});

test("`status` prints the line from the ticket times of the clone", (ctx) => {
  const etat = repertoireTemporaire(ctx);
  const journal = ouvrirJournal(etat, { maintenant: () => A });
  journal.ajouter({ project: "parade", ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  journal.fermer();
  const depot = clone(ctx, JSON.stringify({ tickets: ENREGISTREMENTS }));
  const lignes = photoDuProjet({ BRIGADE_STATE_DIR: etat, BRIGADE_REPO_DIR: depot }, { maintenant: A }).filter((l) => l.startsWith("taken→merged"));
  ctx.diagnostic(lignes.join(" | "));
  assert.deepEqual(lignes, ["taken→merged 24 h: 50% in 10 min or less (1 of 2), median 16.5 min"]);
});

test("no file of times: no merged ticket; an unreadable file or no clone: not known, never a made-up figure", (ctx) => {
  assert.equal(ligneDuDelaiDePrise(clone(ctx), A), "taken→merged 24 h: no merged ticket in the last 24 h");
  assert.equal(ligneDuDelaiDePrise(clone(ctx, "{ not json"), A), "taken→merged 24 h: not known — the ticket times of the clone cannot be read");
  assert.equal(ligneDuDelaiDePrise(clone(ctx, '{ "autre": 1 }'), A), "taken→merged 24 h: not known — the ticket times of the clone cannot be read");
  assert.equal(ligneDuDelaiDePrise(undefined, A), "taken→merged 24 h: not known — the ticket times of the clone cannot be read");
});
