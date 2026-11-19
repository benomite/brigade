// #3761, critère 1 : une phrase de contexte (« Builds on #1908 ») ne fait pas attendre un ticket, même si #1908 a un ticket
// ouvert ; une dépendance explicite sur ce ticket, si.
// Test d'acceptation gelé (#3725) : la lecture du corps que fait la porte de prise (`attendusDuCorps`), sur un faux GitHub.
import assert from "node:assert/strict";
import { test } from "node:test";
import { attendusDuCorps } from "../../src/attente-ticket/attente-ticket.ts";
import { avecListe, rendreListe } from "../../src/epique.ts";

const TICKET = 3734;
const EPIQUE = 1908;
const RESTANT = 1912;
const CONTEXTE = "`Builds on #1908` (newcomer path ...)";

const lire = async (numero: number) => {
  if (numero === EPIQUE) return { state: "open", body: avecListe("The newcomer path.", rendreListe(EPIQUE, [1909, RESTANT].map((ticket) => ({ ticket, title: "part", state: "open", served: false })))) };
  if (numero === RESTANT) return { state: "open", body: "The last ticket of the epic." };
  if (numero === 1909) return { state: "closed", body: "" };
  return null;
};

// brigade:guard
test("a body that only says `Builds on #1908` is claimable and is not held by the remaining tickets of #1908", async () => {
  assert.deepEqual(await attendusDuCorps(TICKET, `## Context\n\n${CONTEXTE}\n\nDo the thing.`, lire), []);
});

// brigade:guard
test("the same body with an explicit dependency on #1908 still waits for its remaining ticket", async () => {
  assert.deepEqual(await attendusDuCorps(TICKET, `## Context\n\n${CONTEXTE}\n\nDepends on #${EPIQUE}\n`, lire), [RESTANT]);
});
