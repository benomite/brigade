// #3763 : `npm run rail` (montrer-rail.ts), le rail du journal. Sa seule attente appliquée est celle de la fiche
// (`retenue`, rail.ts) : un ticket qu'elle retient la dit avec sa source, `waits for #N — read from the card`, jamais
// `awaiting: nothing` ; un ticket que rien ne retient garde `awaiting: nothing`, comme avant.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ouvrirJournal } from "../../src/journal.ts";
import { principal as montrerRail } from "../../src/montrer-rail.ts";
import { ouvrirRail } from "../aides/rail-du-journal.ts";
import { appeler, horloge, repertoireTemporaire } from "../outils.ts";

test("le rail du journal : la fiche d'un ticket retenu dit son attente et sa source ; un ticket libre dit `awaiting: nothing`", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire, { maintenant: horloge() });
  t.after(() => journal.fermer());
  const rail = ouvrirRail(journal, { projet: "brigade", dureeBailMs: 600_000 });
  const arriver = (ticket: number, waitsFor: number[]) =>
    journal.ajouter({
      project: "brigade",
      ticket,
      author: "github",
      type: "ticket.arrived",
      payload: { title: `Ticket ${ticket}`, priority: null, createdAt: `2026-10-01T00:00:${ticket}Z`, url: `https://exemple.test/${ticket}`, card: { waitsFor, zone: [], problems: [] } },
    });
  arriver(4, []);
  arriver(5, [4]);
  arriver(6, []);
  rail.prendre("box/claude");

  const commande = appeler(montrerRail, [], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await commande.fin, 0);
  const lignes = commande.sortie().trimEnd().split("\n");
  const ficheDe = (ticket: number) => lignes[lignes.findIndex((ligne) => ligne.startsWith(`#${ticket} `)) + 1] ?? "";
  assert.equal(ficheDe(5), "     card — waits for #4 — read from the card · zone: none");
  assert.equal(ficheDe(6), "     card — awaiting: nothing · zone: none");
});
