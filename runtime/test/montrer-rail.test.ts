// La commande par laquelle le chef lit le rail : `npm run rail`.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { ouvrirJournal } from "../src/journal.ts";
import { ouvrirRail } from "../src/rail.ts";
import { horloge, lancer, repertoireTemporaire } from "./outils.ts";

const MONTRER = join(import.meta.dirname, "../src/montrer-rail.ts");

test("le rail se lit ticket par ticket, dans l'ordre de service, chacun avec son état", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire, { maintenant: horloge() });
  t.after(() => journal.fermer());
  const rail = ouvrirRail(journal, { projet: "brigade", dureeBailMs: 600_000, maintenant: () => new Date("2026-10-08T10:30:00.000Z") });
  for (const [ticket, priority] of [[14, 1], [15, 1], [16, 2], [17, 2], [18, null]] as const) {
    journal.ajouter({
      project: "brigade",
      ticket,
      author: "github",
      type: "ticket.arrived",
      payload: { title: `Ticket ${ticket}`, priority, createdAt: `2026-10-01T00:00:${ticket}Z`, url: `https://exemple.test/${ticket}` },
    });
  }
  rail.prendre("box/claude-opus");
  rail.prendre("box/claude-sonnet");
  rail.envoyerEnPass(15, "box/claude-sonnet");
  rail.prendre("mac/claude");
  rail.envoyerEnPass(16, "mac/claude");
  rail.servir(16);
  rail.quatreVingtSix(17, { motif: "quota", retour: new Date("2026-10-08T15:00:00.000Z") });

  const commande = lancer(t, MONTRER, [], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await commande.fin, 0);
  assert.deepEqual(commande.sortie().trimEnd().split("\n"), [
    "#14  pris  prio:1  par box/claude-opus depuis 2026-10-08T10:00:05.000Z, dernier progrès 2026-10-08T10:00:05.000Z, bail jusqu'à 2026-10-08T10:40:00.000Z  Ticket 14",
    "#15  en pass  prio:1  depuis 2026-10-08T10:00:07.000Z, cuisiné par box/claude-sonnet  Ticket 15",
    "#16  servi  prio:2  depuis 2026-10-08T10:00:10.000Z, cuisiné par mac/claude  Ticket 16",
    "#17  86  prio:2  depuis 2026-10-08T10:00:11.000Z (quota), retour à 2026-10-08T15:00:00.000Z  Ticket 17",
    "#18  en attente  -  depuis 2026-10-08T10:00:04.000Z  Ticket 18",
  ]);
});

test("sous chaque ticket qui en porte une, sa fiche : ce qu'il attend, sa zone, et ce que le runtime n'y comprend pas", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire, { maintenant: horloge() });
  t.after(() => journal.fermer());
  const cards = {
    14: { waitsFor: [12, 13], zone: ["runtime/src/rail.ts", "docs/"], problems: [] },
    15: { waitsFor: [], zone: [], problems: [] },
    16: { waitsFor: [14], zone: [], problems: ["clé inconnue « budget » — connues : attend, zone", "zone : « /etc » n'est pas un chemin du dépôt"] },
    17: null,
  };
  for (const [ticket, card] of Object.entries(cards)) {
    const payload = { title: `Ticket ${ticket}`, priority: null, createdAt: `2026-10-01T00:00:${ticket}Z`, url: `https://exemple.test/${ticket}`, card };
    journal.ajouter({ project: "brigade", ticket: Number(ticket), author: "github", type: "ticket.arrived", payload });
  }

  const commande = lancer(t, MONTRER, [], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await commande.fin, 0);
  assert.deepEqual(commande.sortie().trimEnd().split("\n"), [
    "#14  en attente  -  depuis 2026-10-08T10:00:00.000Z  Ticket 14",
    "     fiche — attend : #12, #13 · zone : runtime/src/rail.ts, docs/",
    "#15  en attente  -  depuis 2026-10-08T10:00:01.000Z  Ticket 15",
    "     fiche — attend : rien · zone : aucune",
    "#16  en attente  -  depuis 2026-10-08T10:00:02.000Z  Ticket 16",
    "     fiche — attend : #14 · zone : aucune",
    "     FICHE ILLISIBLE — clé inconnue « budget » — connues : attend, zone",
    "     FICHE ILLISIBLE — zone : « /etc » n'est pas un chemin du dépôt",
    "#17  en attente  -  depuis 2026-10-08T10:00:03.000Z  Ticket 17",
  ]);
});

test("un rail sans ticket le dit", async (t) => {
  const repertoire = repertoireTemporaire(t);
  ouvrirJournal(repertoire).fermer();

  const commande = lancer(t, MONTRER, [], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await commande.fin, 0);
  assert.equal(commande.sortie().trim(), "rail vide");
});

test("sans répertoire d'état, sans journal, ou avec un argument, la commande échoue en disant pourquoi", async (t) => {
  const sansVariable = lancer(t, MONTRER, []);
  const sansJournal = lancer(t, MONTRER, [], { BRIGADE_STATE_DIR: repertoireTemporaire(t) });
  const avecArgument = lancer(t, MONTRER, ["14"], { BRIGADE_STATE_DIR: repertoireTemporaire(t) });

  assert.equal(await sansVariable.fin, 2);
  assert.match(sansVariable.sortie(), /BRIGADE_STATE_DIR n'est pas défini/);
  assert.equal(await sansJournal.fin, 1);
  assert.match(sansJournal.sortie(), /aucun journal/);
  assert.equal(await avecArgument.fin, 2);
  assert.match(avecArgument.sortie(), /usage/);
});

test("un journal dont le rail date d'avant la date de progrès dit de redémarrer le runtime, sans trace", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  journal.base.script("DROP TABLE rail; CREATE TABLE rail (ticket INTEGER PRIMARY KEY, title TEXT) STRICT;");
  journal.fermer();

  const commande = lancer(t, MONTRER, [], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await commande.fin, 1);
  assert.match(commande.sortie(), /redémarrer le runtime/);
  assert.doesNotMatch(commande.sortie(), /at .*\.ts/);
});

test("un journal d'avant le rail dit aussi de redémarrer le runtime", async (t) => {
  const repertoire = repertoireTemporaire(t);
  ouvrirJournal(repertoire, { projections: [] }).fermer();

  const commande = lancer(t, MONTRER, [], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await commande.fin, 1);
  assert.match(commande.sortie(), /redémarrer le runtime/);
  assert.doesNotMatch(commande.sortie(), /at .*\.ts/);
});
