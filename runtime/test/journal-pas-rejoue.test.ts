// Toutes les commandes de lecture tiennent le même langage devant un journal
// que le runtime n'a pas encore rejoué : un conseil, un code d'erreur, pas de trace.
// Chacune se joue dans le process du test : une erreur qu'elle laisserait
// passer, au lieu de la trace que son process imprimerait, fait échouer `fin`.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Commande } from "../src/appel.ts";
import { principal as gardeFous } from "../src/garde-fous-cli.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { principal as montrerPass } from "../src/montrer-pass.ts";
import { principal as montrerRail } from "../src/montrer-rail.ts";
import { principal as montrerStation } from "../src/montrer-station.ts";
import { principal as status } from "../src/status.ts";
import { appeler, repertoireTemporaire } from "./outils.ts";

const COMMANDES: Record<string, Commande> = { status, "montrer-rail": montrerRail, "garde-fous-cli": gardeFous, "montrer-station": montrerStation, "montrer-pass": montrerPass };

for (const [commande, principal] of Object.entries(COMMANDES)) {
  test(`${commande} devant un journal sans projections dit de redémarrer le runtime, sans trace`, async (t) => {
    const repertoire = repertoireTemporaire(t);
    ouvrirJournal(repertoire, { projections: [] }).fermer();

    const enfant = appeler(principal, [], { BRIGADE_STATE_DIR: repertoire });

    assert.equal(await enfant.fin, 1);
    assert.match(enfant.sortie(), commande === "montrer-rail" || commande === "montrer-pass" || commande === "garde-fous-cli" || commande === "montrer-station" ? /restart the runtime/ : /redémarrer le runtime/);
    assert.doesNotMatch(enfant.sortie(), /at .*\.ts/);
  });
}
