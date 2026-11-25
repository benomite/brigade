// Invariant 3 du rail (#4026) : un ticket mis de côté ou parqué (`parked`, #4129) a
// une raison nommée et une date pour le revoir.
import assert from "node:assert/strict";
import { test } from "node:test";
import { attenteDeLIssue } from "../../src/attente-github/marque.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const JOUR = 24 * 3_600_000;
const T = Date.parse("2026-11-10T08:00:00.000Z");

test("the reason and the date the supervisor adds to a parked ticket are the ones the rail reads, and the ticket comes back on its date", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, [...CALIBRE, "parked"]);
  let maintenant = T;
  const a = faux.station("A", { places: 1, sauter: () => {}, avertir: () => {}, cuisiner: async () => ({ echec: "not the point" }), maintenant: () => new Date(maintenant) });
  await a.tour();
  await a.calme();
  const attente = attenteDeLIssue(faux.commentaires.get(1) ?? []);
  assert.deepEqual(attente, { what: "no reason was written when it got `parked`", who: "the supervisor", followUp: new Date(T + 7 * JOUR).toISOString() });
  assert.match((faux.commentaires.get(1) ?? []).at(-1)?.body ?? "", /^<!-- brigade:parked /);
  assert.ok(faux.ticket(1).labels.has("parked"), "still parked: its date is to come");
  maintenant = T + 8 * JOUR;
  await a.tour();
  await a.calme();
  assert.equal(faux.ticket(1).labels.has("parked"), false, "woken on its date");
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
  assert.deepEqual(attenteDeLIssue(faux.commentaires.get(1) ?? []), { what: raison, who: "the supervisor", followUp: new Date(T + 7 * JOUR).toISOString() });
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

test("a ticket set aside whose date someone else set is not woken past it: that someone keeps the hand", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, [...CALIBRE, "set-aside:failures"]);
  faux.poster(1, "A", "<!-- brigade:echec n=3 -->\nStation `A`: the cook stopped without a delivery — tests red");
  // Depuis la mise de côté, le chef a dit ce qu'il attend, et jusqu'à quand : sa date, passée, n'est pas celle de l'invariant.
  faux.poster(1, "A", `<!-- brigade:parked ${JSON.stringify({ what: "the signed quote", who: "the client", followUp: "2026-11-01T00:00:00.000Z" })} -->`);
  const a = faux.station("A", { places: 1, sauter: () => {}, avertir: () => {}, cuisiner: async () => ({ echec: "not the point" }), maintenant: () => new Date(T + 8 * JOUR) });
  await a.tour();
  await a.calme();
  assert.ok(faux.ticket(1).labels.has("set-aside:failures"), "not woken: the date is the client's");
  assert.equal((faux.commentaires.get(1) ?? []).length, 2, "nothing written");
});

// Une carte du chef (`chef-todo`), même parquée pour un autre (`parked`), n'est pas datée par l'invariant : sa carte dit
// ce qu'elle attend.
test("a chef's card (`chef-todo`), even parked, with no marked comment gets no repair: its card says what it waits for; parked alone, it does", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, [...CALIBRE, "parked", "chef-todo"]);
  faux.feu(2, [...CALIBRE, "parked"]);
  const a = faux.station("A", { places: 1, sauter: () => {}, avertir: () => {}, cuisiner: async () => ({ echec: "not the point" }), maintenant: () => new Date(T) });
  await a.tour();
  await a.calme();
  assert.deepEqual(faux.commentaires.get(1) ?? [], [], "nothing written on the chef's ticket");
  assert.deepEqual([...faux.ticket(1).labels].sort(), [...CALIBRE, "chef-todo", "parked"].sort());
  assert.deepEqual(attenteDeLIssue(faux.commentaires.get(2) ?? []), { what: "no reason was written when it got `parked`", who: "the supervisor", followUp: new Date(T + 7 * JOUR).toISOString() });
  assert.match((faux.commentaires.get(2) ?? []).map((c) => c.body).join("\n"), /\*\*Invariant 3 broke\*\* — #2 carries `parked` with no named reason and no date/);
});
