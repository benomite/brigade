import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { Base } from "../src/base.ts";
import { aArreter, repertoireTemporaire } from "./outils.ts";

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

// Une requête est préparée une fois par connexion, puis rejouée (#1650) : ce
// qu'elle rend reste celui du moment où elle est jouée.
test("une requête rejouée lit la base du moment, avec ses paramètres du moment", (t) => {
  const base = new Base(join(repertoireTemporaire(t), "essai.db"));
  aArreter(t, () => base.fermer());
  base.script("CREATE TABLE t (n INTEGER, nom TEXT)");
  const lire = (n: number) => base.lire<{ nom: string }>("SELECT nom FROM t WHERE n = ? ORDER BY nom", n).map(({ nom }) => nom);

  assert.deepEqual(lire(1), []);
  assert.equal(base.executer("INSERT INTO t (n, nom) VALUES (?, ?)", 1, "un").changements, 1);
  assert.equal(base.executer("INSERT INTO t (n, nom) VALUES (?, ?)", 2, "deux").changements, 1);
  assert.deepEqual(lire(1), ["un"]);
  assert.deepEqual(lire(2), ["deux"]);
  base.transaction(() => base.executer("DELETE FROM t WHERE n = ?", 1));
  assert.deepEqual(lire(1), []);
});

test("une requête gardée suit le schéma : la colonne ajoutée depuis est lue", (t) => {
  const base = new Base(join(repertoireTemporaire(t), "essai.db"));
  aArreter(t, () => base.fermer());
  base.script("CREATE TABLE t (n INTEGER)");
  base.executer("INSERT INTO t (n) VALUES (1)");
  assert.deepEqual(base.lire("SELECT * FROM t"), [{ n: 1 }]);

  base.script("ALTER TABLE t ADD COLUMN nom TEXT DEFAULT 'un'");
  assert.deepEqual(base.lire("SELECT * FROM t"), [{ n: 1, nom: "un" }]);
});

test("passé la borne des requêtes gardées, la plus ancienne sort, et se prépare de nouveau quand elle revient", (t) => {
  const base = new Base(join(repertoireTemporaire(t), "essai.db"));
  aArreter(t, () => base.fermer());
  base.script("CREATE TABLE t (n INTEGER)");
  base.executer("INSERT INTO t (n) VALUES (7)");
  // Mille textes différents : bien plus que la connexion n'en garde.
  for (let i = 0; i < 1000; i++) assert.deepEqual(base.lire(`SELECT n + ${i} AS n FROM t`), [{ n: 7 + i }]);
  assert.deepEqual(base.lire("SELECT n + 0 AS n FROM t"), [{ n: 7 }]);
  assert.deepEqual(base.lire("SELECT n + 999 AS n FROM t"), [{ n: 1006 }]);
});

test("rejouée, la version des données voit encore ce qu'une autre connexion a écrit", (t) => {
  const chemin = join(repertoireTemporaire(t), "essai.db");
  const [ecrivain, lecteur] = [new Base(chemin), new Base(chemin)];
  aArreter(t, () => {
    lecteur.fermer();
    ecrivain.fermer();
  });
  ecrivain.script("CREATE TABLE t (n INTEGER)");
  const avant = lecteur.versionDonnees();
  assert.equal(lecteur.versionDonnees(), avant);
  ecrivain.executer("INSERT INTO t (n) VALUES (1)");
  assert.notEqual(lecteur.versionDonnees(), avant);
});
