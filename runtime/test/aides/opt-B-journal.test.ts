// Le relecteur des tests qui sondent le journal d'un autre process.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ouvrirJournal } from "../../src/journal.ts";
import { relecteur } from "./opt-B-journal.ts";

for (const garder of [true, false]) {
  test(`${garder ? "gardée" : "rouverte à chaque lecture"}, la connexion rend ce qu'un autre a écrit depuis la dernière lecture`, () => {
    const repertoire = mkdtempSync(join(tmpdir(), "brigade-test-relecteur-"));
    const lecteur = relecteur(garder);
    try {
      const ecrivain = ouvrirJournal(repertoire);
      const types = () => lecteur.lire(repertoire, "types", (journal) => journal.tout().map((e) => e.type));
      ecrivain.ajouter({ project: "brigade", ticket: null, author: "chef", type: "grant.activated", payload: { action: "merge" } });
      assert.deepEqual(types(), ["grant.activated"]);
      ecrivain.ajouter({ project: "brigade", ticket: null, author: "chef", type: "grant.revoked", payload: { action: "merge" } });
      assert.deepEqual(types(), ["grant.activated", "grant.revoked"]);
      ecrivain.fermer();
      if (!garder) {
        // Rien n'est gardé ouvert : sous Windows aussi, le répertoire s'efface avant `fermer`.
        rmSync(repertoire, { recursive: true });
        assert.equal(existsSync(repertoire), false);
      }
    } finally {
      lecteur.fermer();
      rmSync(repertoire, { recursive: true, force: true });
    }
  });
}

