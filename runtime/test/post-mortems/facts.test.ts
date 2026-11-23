// #4023 : `facts`, ce que l'app lit d'une box, porte les post-mortems du projet avec la fin de leur panne ; un fichier
// illisible les retire des faits sans les faire tomber.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { principal as commande } from "../../src/faits.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { terminerLaPanne } from "../../src/post-mortems/post-mortems.ts";
import { appeler, repertoireTemporaire } from "../outils.ts";

const A = (hhmm: string) => `2026-11-20T${hhmm}:00.000Z`;
const panne = (id: string, debut: string, fin: string) => ({ id, debut, fin, cause: "main was red", detecteeParLeSysteme: debut, signaleeParLeChef: null, corrigePar: null, ticketDuCorrectif: null });

async function faits(repertoire: string) {
  const lancee = appeler(commande, [], { BRIGADE_STATE_DIR: repertoire, BRIGADE_PROJECT: "shop" });
  assert.equal(await lancee.fin, 0);
  return JSON.parse(lancee.sortie().split("\n")[0] ?? "");
}

test("the facts carry the project's post-mortems, each with the end of its outage", async (t) => {
  const repertoire = repertoireTemporaire(t);
  ouvrirJournal(repertoire).fermer();
  assert.equal((await faits(repertoire)).postMortems?.length, 0);
  terminerLaPanne(repertoire, "shop", panne("a", A("10:00"), A("10:40")));
  terminerLaPanne(repertoire, "shop", panne("b", A("12:00"), A("13:00")));
  assert.deepEqual((await faits(repertoire)).postMortems, [
    { cause: "main was red", duree: "40 min", vuEnPremier: "system", corrige: null, ticket: null, fin: A("10:40") },
    { cause: "main was red", duree: "60 min", vuEnPremier: "system", corrige: null, ticket: null, fin: A("13:00") },
  ]);
});

test("a post-mortem file that cannot be read leaves the facts without them, the rest is still said", async (t) => {
  const repertoire = repertoireTemporaire(t);
  ouvrirJournal(repertoire).fermer();
  mkdirSync(join(repertoire, "post-mortems"));
  writeFileSync(join(repertoire, "post-mortems", "shop.json"), "{not json");
  const forme = await faits(repertoire);
  assert.equal("postMortems" in forme, false);
  assert.equal(typeof forme.etat, "string");
});
