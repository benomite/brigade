// #3763 : la carte d'un ticket et la porte de prise attendent les mêmes tickets d'un même corps. Un corps qui nomme son
// propre ticket et un autre ticket ouvert : la carte dit l'attente de l'autre, avec sa source, et ne nomme pas le ticket ;
// la porte (`attendusDuCorps`) attend le même ticket — le ticket ne s'attend pas lui-même ni sur l'une ni sur l'autre.
import assert from "node:assert/strict";
import { test } from "node:test";
import { attendusDuCorps } from "../../src/attente-ticket/attente-ticket.ts";
import { attentesDuTicket } from "../../src/carte-attente/carte-attente.ts";

test("un corps qui nomme son ticket et un autre : la carte et la porte attendent l'autre, jamais le ticket", async () => {
  const corps = "Restyle the screen.\nDepends on #20\nDepends on #12";
  const lire = async () => ({ state: "open", body: "" });
  const { attentes } = attentesDuTicket({ ticket: 20, corps, commentaires: [] });
  assert.deepEqual(attentes.map(({ ticket, source }) => ({ ticket, source })), [{ ticket: 12, source: "corps" }]);
  assert.deepEqual(await attendusDuCorps(20, corps, lire), attentes.map(({ ticket }) => ticket));
});
