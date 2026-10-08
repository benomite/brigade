// La commande par laquelle le chef relit le journal : `npm run journal -- <ticket>`.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { demarrer } from "../src/runtime.ts";
import { faitInconnu, horloge, lancer, repertoireTemporaire } from "./outils.ts";

const RELIRE = join(import.meta.dirname, "../src/relire.ts");

// Un runtime qui tourne, et deux tickets qui traversent la cuisine.
function cuisine(repertoire: string) {
  const runtime = demarrer({ repertoireEtat: repertoire, projet: "brigade", maintenant: horloge() });
  const ajouter = (ticket: number, author: string, type: string, payload = {}) =>
    runtime.journal.ajouter({ project: "brigade", ticket, author, ...faitInconnu(type, payload) });
  ajouter(7, "github", "ticket.arrived");
  ajouter(8, "github", "ticket.arrived");
  ajouter(7, "station:box/claude-sonnet", "ticket.taken", { branche: "fix/7" });
  ajouter(7, "pass", "pass.verdict", { vert: true });
  return runtime;
}

test("le journal d'un ticket se relit en entier et dans l'ordre, pendant que le runtime tourne", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const runtime = cuisine(repertoire);
  t.after(() => runtime.arreter("test"));

  const commande = lancer(t, RELIRE, ["7"], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await commande.fin, 0);
  assert.deepEqual(commande.sortie().trimEnd().split("\n"), [
    '2  2026-10-08T10:00:01.000Z  brigade  #7  ticket.arrived  github  {}',
    '4  2026-10-08T10:00:03.000Z  brigade  #7  ticket.taken  station:box/claude-sonnet  {"branche":"fix/7"}',
    '5  2026-10-08T10:00:04.000Z  brigade  #7  pass.verdict  pass  {"vert":true}',
  ]);
});

test("sans numéro de ticket, tout le journal se relit", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const runtime = cuisine(repertoire);
  t.after(() => runtime.arreter("test"));

  const commande = lancer(t, RELIRE, [], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await commande.fin, 0);
  const lignes = commande.sortie().trimEnd().split("\n");
  assert.equal(lignes.length, 5);
  assert.match(lignes[0] ?? "", /^1  2026-10-08T10:00:00\.000Z  brigade  -  runtime\.started  runtime  \{/);
});

test("un ticket sans événement le dit, sans passer pour une erreur", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const runtime = cuisine(repertoire);
  t.after(() => runtime.arreter("test"));

  const commande = lancer(t, RELIRE, ["99"], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await commande.fin, 0);
  assert.match(commande.sortie(), /aucun événement pour le ticket 99/);
});

test("relire ne modifie pas le journal", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const runtime = cuisine(repertoire);
  t.after(() => runtime.arreter("test"));
  const avant = runtime.journal.tout();

  await lancer(t, RELIRE, ["7"], { BRIGADE_STATE_DIR: repertoire }).fin;

  assert.deepEqual(runtime.journal.tout(), avant);
});

test("sans journal dans le répertoire d'état, la commande échoue et le dit", async (t) => {
  const repertoire = repertoireTemporaire(t);

  const commande = lancer(t, RELIRE, ["7"], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await commande.fin, 1);
  assert.match(commande.sortie(), /aucun journal/);
});

test("sans BRIGADE_STATE_DIR, la commande échoue et nomme la variable", async (t) => {
  const commande = lancer(t, RELIRE, ["7"]);

  assert.equal(await commande.fin, 2);
  assert.match(commande.sortie(), /BRIGADE_STATE_DIR/);
});

test("un argument qui n'est pas un numéro de ticket est refusé avec l'usage", async (t) => {
  const commande = lancer(t, RELIRE, ["sept"], { BRIGADE_STATE_DIR: repertoireTemporaire(t) });

  assert.equal(await commande.fin, 2);
  assert.match(commande.sortie(), /usage/);
});
