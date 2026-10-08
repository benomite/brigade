import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { Base } from "../src/base.ts";
import { repertoireTemporaire } from "./outils.ts";

test("une transaction déjà annulée par la base laisse remonter l'erreur d'origine", (t) => {
  const base = new Base(join(repertoireTemporaire(t), "essai.db"));
  t.after(() => base.fermer());

  assert.throws(
    () =>
      base.transaction(() => {
        // Ce que fait SQLite de lui-même sur un disque plein ou une erreur d'E/S.
        base.script("ROLLBACK");
        throw new Error("erreur d'origine");
      }),
    /erreur d'origine/,
  );
  // La base reste utilisable : la transaction suivante s'ouvre normalement.
  assert.equal(base.transaction(() => 1), 1);
});
