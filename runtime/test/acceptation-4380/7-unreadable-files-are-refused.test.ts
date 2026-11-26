// Acceptance test (#4380), criterion 7.
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { consignerGeste, OUTCOME } from "../../src/autonomie/agents/gestes.ts";
import { magasinDeNiveaux } from "../../src/autonomie/agents/niveaux.ts";
import { appliquerLaPolitique, NOMBRE_DE_GESTES_PROPRES } from "../../src/autonomie/agents/politique.ts";
import type { Ajout } from "../../src/evenements.ts";
import { lireLesFaits } from "../../src/faits.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { repertoireTemporaire } from "../outils.ts";

const PROJET = "shop";
const MAINTENANT = new Date("2026-11-26T12:00:00.000Z");
const horloge = () => MAINTENANT;

for (const illisible of ["autonomy-gestures.json", "autonomy-levels.json"]) {
  test(`an unreadable ${illisible}: the policy moves nothing, overwrites nothing, and the runtime still answers`, (t) => {
    const repertoire = repertoireTemporaire(t);
    const journal = ouvrirJournal(repertoire);
    journal.ajouter({ project: PROJET, ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "v26.0.0" } } as Ajout);
    journal.fermer();
    // Readable files that hold a promotion history for the closer, then one of them is spoiled.
    for (let n = 1; n <= NOMBRE_DE_GESTES_PROPRES; n++) consignerGeste(repertoire, "closer", { line: `merged #${n}`, reason: `the chef said OK, commit 000000${n}a`, outcome: OUTCOME.HANDED_TO_CHEF }, horloge);
    magasinDeNiveaux(repertoire).poser(PROJET, "pass", "propose");
    const autre = join(repertoire, illisible === "autonomy-gestures.json" ? "autonomy-levels.json" : "autonomy-gestures.json");
    const autreAvant = readFileSync(autre, "utf8");
    writeFileSync(join(repertoire, illisible), "{ not json");
    const reveils: string[] = [];
    try {
      appliquerLaPolitique({ repertoire, projet: PROJET, chiffres: { bugsEchappes: [], reverts: [] }, horloge, reveillerLeChef: (raison: string) => void reveils.push(raison) });
    } catch {
      // Refused as today: a refusal may be an error.
    }
    assert.equal(readFileSync(join(repertoire, illisible), "utf8"), "{ not json");
    assert.ok(existsSync(autre));
    assert.equal(readFileSync(autre, "utf8"), autreAvant, "the readable file is not touched either");
    assert.equal(reveils.length, 0);
    const faits = lireLesFaits({ BRIGADE_STATE_DIR: repertoire, BRIGADE_PROJECT: PROJET }, MAINTENANT);
    assert.ok(faits.equipe !== undefined, "facts still answers");
  });
}
