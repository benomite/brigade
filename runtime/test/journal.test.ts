import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ouvrirJournal } from "../src/journal.ts";
import { faitInconnu, horloge, lancer, repertoireTemporaire } from "./outils.ts";

const TIENT_JOURNAL = join(import.meta.dirname, "aides/tient-journal.ts");

test("un événement ajouté porte séquence, horodatage, projet, ticket, type et auteur", (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge() });
  t.after(() => journal.fermer());

  const evenement = journal.ajouter({
    project: "brigade",
    ticket: 13,
    author: "station:box/claude-sonnet",
    ...faitInconnu("ticket.taken", { depuis: "rail" }),
  });

  assert.deepEqual(evenement, {
    seq: 1,
    at: "2026-10-08T10:00:00.000Z",
    project: "brigade",
    ticket: 13,
    type: "ticket.taken",
    author: "station:box/claude-sonnet",
    payload: { depuis: "rail" },
  });
  assert.deepEqual(journal.tout(), [evenement]);
});

test("le journal vit dans log.db, dans le répertoire d'état", (t) => {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  t.after(() => journal.fermer());

  assert.ok(existsSync(join(repertoire, "log.db")));
});

test("un événement sans ticket se journalise avec un ticket nul", (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => journal.fermer());

  const evenement = journal.ajouter({ project: "brigade", ticket: null, author: "runtime", ...faitInconnu("x.y") });

  assert.equal(evenement?.ticket, null);
});

for (const champ of ["project", "type", "author"] as const) {
  test(`un événement sans ${champ} est refusé`, (t) => {
    const journal = ouvrirJournal(repertoireTemporaire(t));
    t.after(() => journal.fermer());
    const complet = { project: "brigade", ticket: 1, author: "runtime", ...faitInconnu("x.y") };

    assert.throws(() => journal.ajouter({ ...complet, [champ]: "" }));
    assert.deepEqual(journal.tout(), []);
  });
}

test("le journal d'un ticket se relit en entier, dans l'ordre, sans les autres tickets", (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => journal.fermer());
  const ajouter = (ticket: number | null, type: string) =>
    journal.ajouter({ project: "brigade", ticket, author: "runtime", ...faitInconnu(type) });

  ajouter(7, "ticket.arrived");
  ajouter(8, "ticket.arrived");
  ajouter(7, "ticket.taken");
  ajouter(null, "runtime.tick");
  ajouter(7, "pass.verdict");

  assert.deepEqual(
    journal.duTicket(7).map((e) => [e.seq, e.type]),
    [[1, "ticket.arrived"], [3, "ticket.taken"], [5, "pass.verdict"]],
  );
});

test("le journal survit à la fermeture : rouvert, il rend les mêmes événements", (t) => {
  const repertoire = repertoireTemporaire(t);
  const premier = ouvrirJournal(repertoire);
  premier.ajouter({ project: "brigade", ticket: 7, author: "runtime", ...faitInconnu("ticket.arrived") });
  const avant = premier.tout();
  premier.fermer();

  const second = ouvrirJournal(repertoire);
  t.after(() => second.fermer());

  assert.deepEqual(second.tout(), avant);
  assert.equal(second.ajouter({ project: "brigade", ticket: 7, author: "runtime", ...faitInconnu("ticket.taken") })?.seq, 2);
});

test("le journal est en ajout seul : ni modification ni suppression", (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => journal.fermer());
  journal.ajouter({ project: "brigade", ticket: 7, author: "runtime", ...faitInconnu("ticket.arrived") });
  const avant = journal.tout();

  assert.throws(() => journal.base.executer("UPDATE events SET author = 'autre'"), /ajout seul/);
  assert.throws(() => journal.base.executer("DELETE FROM events"), /ajout seul/);
  assert.deepEqual(journal.tout(), avant);
});

test("une clé d'unicité déjà vue est refusée sans erreur et sans doublon", (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => journal.fermer());
  const fait = { project: "brigade", ticket: 7, author: "github", ...faitInconnu("ticket.arrived"), dedupKey: "gh:42" };

  assert.equal(journal.ajouter(fait)?.seq, 1);
  assert.equal(journal.ajouter(fait), null);
  assert.equal(journal.tout().length, 1);
});

test("un consommateur ne voit chaque événement qu'une fois, et son curseur survit à la réouverture", (t) => {
  const repertoire = repertoireTemporaire(t);
  const premier = ouvrirJournal(repertoire);
  const ajouter = (j: typeof premier, type: string) =>
    j.ajouter({ project: "brigade", ticket: 7, author: "runtime", ...faitInconnu(type) });
  ajouter(premier, "a");
  ajouter(premier, "b");
  const vus: string[] = [];

  assert.equal(premier.consommer("rail", (e) => vus.push(e.type)), 2);
  assert.equal(premier.consommer("rail", (e) => vus.push(e.type)), 0);
  premier.fermer();
  const second = ouvrirJournal(repertoire);
  t.after(() => second.fermer());
  ajouter(second, "c");
  second.consommer("rail", (e) => vus.push(e.type));

  assert.deepEqual(vus, ["a", "b", "c"]);
});

test("un consommateur qui échoue en route ne laisse ni curseur avancé ni réaction à moitié écrite", (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => journal.fermer());
  const ajouter = (type: string) =>
    journal.ajouter({ project: "brigade", ticket: 7, author: "runtime", ...faitInconnu(type) });
  ajouter("a");
  ajouter("b");

  assert.throws(() =>
    journal.consommer("rail", (e) => {
      ajouter(`reaction-a-${e.type}`);
      if ((e.type as string) === "b") throw new Error("panne au milieu");
    }), /panne au milieu/);

  assert.deepEqual(journal.tout().map((e) => e.type), ["a", "b"]);
  const revus: string[] = [];
  journal.consommer("rail", (e) => revus.push(e.type));
  assert.deepEqual(revus, ["a", "b"]);
});

test("une lecture seule relit le journal sans rien pouvoir y écrire", (t) => {
  const repertoire = repertoireTemporaire(t);
  const ecrivain = ouvrirJournal(repertoire);
  t.after(() => ecrivain.fermer());
  ecrivain.ajouter({ project: "brigade", ticket: 7, author: "runtime", ...faitInconnu("ticket.arrived") });

  const lecteur = ouvrirJournal(repertoire, { lectureSeule: true });
  t.after(() => lecteur.fermer());

  assert.deepEqual(lecteur.duTicket(7), ecrivain.duTicket(7));
  assert.throws(() =>
    lecteur.ajouter({ project: "brigade", ticket: 7, author: "runtime", ...faitInconnu("ticket.taken") }));
});

test("une lecture seule ne crée pas de journal là où il n'y en a pas", (t) => {
  const repertoire = repertoireTemporaire(t);

  assert.throws(() => ouvrirJournal(repertoire, { lectureSeule: true }), /aucun journal/);
  assert.equal(existsSync(join(repertoire, "log.db")), false);
});

test("une lecture seule attend qu'un journal tenu un instant par un autre process se libère, au lieu d'échouer", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const ecrivain = ouvrirJournal(repertoire);
  ecrivain.ajouter({ project: "brigade", ticket: 7, author: "runtime", ...faitInconnu("ticket.arrived") });
  ecrivain.fermer();
  await lancer(t, TIENT_JOURNAL, [repertoire]).attendre("tenu");

  const lecteur = ouvrirJournal(repertoire, { lectureSeule: true });
  t.after(() => lecteur.fermer());

  assert.deepEqual(lecteur.duTicket(7).map((e) => e.type), ["ticket.arrived"]);
});
