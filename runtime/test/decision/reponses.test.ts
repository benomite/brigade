// The decision's answers and their routes (#4219), on their edge cases: a recommendation that is not an answer, a split
// answer that is not the latest one, a refusal that states no reason.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ligneDeReponse, ordonnerLesReponses, raisonDuRefus, recommandeeDuRefus, reponseQuiDecoupe } from "../../src/decision/reponses.ts";
import { reparerLesLimbes, type LimboTicket } from "../../src/limbo/reparer.ts";

test("each answer gets its route from its first words, and `split` is a `resume` button", () => {
  assert.deepEqual(["Wait for AF", "Split it into tickets", "Ship it", "Close it: out of scope"].map(ligneDeReponse), ["- [wait] Wait for AF", "- [resume] Split it into tickets", "- [resume] Ship it", "- [close] Close it: out of scope"]);
  const reponse = (texte: string) => [`<!-- brigade:reponse gesture=resume -->\n${texte}`];
  assert.deepEqual(["Split it into tickets", "Ship it", "Close it: out of scope"].map((texte) => reponseQuiDecoupe(reponse(texte))), ["Split it into tickets", null, null]);
});

test("the recommended answer goes first; one that is not an answer word for word changes nothing", () => {
  assert.deepEqual(ordonnerLesReponses(["a", "b", "c"], "b"), ["b", "a", "c"]);
  assert.deepEqual(ordonnerLesReponses(["a", "b"], "z"), ["a", "b"]);
  assert.deepEqual(ordonnerLesReponses(["a", "b"], null), ["a", "b"]);
  assert.equal(recommandeeDuRefus(["Q?", "- [resume] a", "", "**Recommended:** a — because"]), "a");
  assert.equal(recommandeeDuRefus(["Q?", "- [resume] a"]), null);
});

test("only the latest answer of the chef routes a split", () => {
  const split = "<!-- brigade:reponse gesture=resume -->\nSplit it into tickets";
  assert.equal(reponseQuiDecoupe(["body", split]), "Split it into tickets");
  assert.equal(reponseQuiDecoupe([split, "<!-- brigade:reponse gesture=resume -->\nShip it"]), null);
  assert.equal(reponseQuiDecoupe(["Split it into tickets"]), null, "a comment that is not an answer to the card");
  assert.equal(reponseQuiDecoupe([]), null);
});

test("a refusal states its reason; a decision, an epic or a refusal with no reason has none", () => {
  const refus = (nature: string, ...suite: string[]) => [`**Manager — not a workable ticket: ${nature}.** Nothing is set, no cook will start.`, "", ...suite];
  assert.equal(raisonDuRefus(refus("an incomplete ticket", "Nothing says how to check it is done.", "", "**What would make it workable.** x")), "Nothing says how to check it is done.");
  assert.equal(raisonDuRefus(refus("a decision issue", "It waits on the chef.")), null);
  assert.equal(raisonDuRefus(refus("an epic", "Three deliverables.")), null);
  assert.equal(raisonDuRefus(refus("an incomplete ticket", "**What would make it workable.** x")), null);
  assert.equal(raisonDuRefus(["**Manager — ticket put on the rail.** Set: `fire`."]), null);
});

test("a `fire` ticket whose refusal states no reason is left as it is: nothing invented in its place", async () => {
  const ticket: LimboTicket = { numero: 7, etat: "open", etiquettes: ["fire"], commentaires: [{ corps: "<!-- brigade:manager -->\n**Manager — not a workable ticket: an incomplete ticket.** Nothing is set.\n\n_Judged by the manager._" }] };
  const ecrits: string[] = [];
  await reparerLesLimbes({
    github: { listerTickets: async () => [ticket], ajouterEtiquette: async (n, nom) => void ecrits.push(`+${nom}`), retirerEtiquette: async () => {}, commenter: async () => void ecrits.push("comment") },
    cartes: { lister: async () => [], poser: async () => void ecrits.push("card") },
  });
  assert.deepEqual(ecrits, []);
});
