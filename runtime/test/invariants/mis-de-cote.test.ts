// Invariant 3 du rail (#4026) : un ticket mis de côté, parqué ou en WAITING a
// une raison nommée et une date pour le revoir.
import assert from "node:assert/strict";
import { test } from "node:test";
import { attenteDeLIssue } from "../../src/attente-github/marque.ts";
import { corpsDeLaReparation } from "../../src/invariants/invariants.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const JOUR = 24 * 3_600_000;
const T = Date.parse("2026-11-10T08:00:00.000Z");

test("the reason and the date the supervisor adds to a WAITING ticket are the ones the rail reads, and the ticket comes back on its date", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, [...CALIBRE, "waiting"]);
  let maintenant = T;
  const a = faux.station("A", { places: 1, sauter: () => {}, avertir: () => {}, cuisiner: async () => ({ echec: "not the point" }), maintenant: () => new Date(maintenant) });
  await a.tour();
  await a.calme();
  const attente = attenteDeLIssue(faux.commentaires.get(1) ?? []);
  assert.deepEqual(attente, { what: "no reason was written when it got `waiting`", who: "the supervisor", followUp: new Date(T + 7 * JOUR).toISOString(), backOnFollowUp: true });
  maintenant = T + 8 * JOUR;
  await a.tour();
  await a.calme();
  assert.equal(faux.ticket(1).labels.has("waiting"), false, "woken on its date");
});

test("a ticket set aside gets the reason of its set-aside and a date, then is woken once the date has passed", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, [...CALIBRE, "set-aside:failures"]);
  // Une attente d'avant, passée, puis la mise de côté : l'attente d'avant ne la date pas.
  faux.poster(1, "A", `<!-- brigade:waiting ${JSON.stringify({ what: "an old wait", who: "the client", followUp: "2026-11-01T00:00:00.000Z", backOnFollowUp: true })} -->`);
  faux.poster(1, "A", "<!-- brigade:echec n=3 -->\nStation `A`: the cook stopped without a delivery — tests red");
  let maintenant = T;
  const a = faux.station("A", { places: 1, sauter: () => {}, avertir: () => {}, cuisiner: async () => ({ echec: "not the point" }), maintenant: () => new Date(maintenant) });
  await a.tour();
  await a.calme();
  const raison = "Station `A`: the cook stopped without a delivery — tests red";
  assert.deepEqual(attenteDeLIssue(faux.commentaires.get(1) ?? []), { what: raison, who: "the supervisor", followUp: new Date(T + 7 * JOUR).toISOString(), backOnFollowUp: true });
  assert.ok(faux.ticket(1).labels.has("set-aside:failures"), "not woken: its date is to come");
  maintenant = T + JOUR;
  await a.tour();
  await a.calme();
  assert.ok(faux.ticket(1).labels.has("set-aside:failures"), "not woken the next day");
  maintenant = T + 8 * JOUR;
  await a.tour();
  await a.calme();
  assert.equal(faux.ticket(1).labels.has("set-aside:failures"), false, "woken past its date");
  const reveil = (faux.commentaires.get(1) ?? []).at(-1)?.body ?? "";
  assert.match(reveil, /\*\*Invariant 3 broke\*\* — #1 carries `set-aside:failures` past its date to look at it again[\s\S]*woke it: put #1 back on the rail \(`set-aside:failures` removed\)/);
});

test("the comment of a repair opens with the WAITING mark when it carries one", () => {
  const corps = corpsDeLaReparation({ invariant: 3, cle: "k", casse: "broke.", entete: "<!-- brigade:waiting {} -->" }, "added", "A");
  assert.ok(corps.startsWith("<!-- brigade:waiting {} -->\n\n<!-- brigade:invariant n=3 k -->\n**Invariant 3 broke** — broke."));
});
