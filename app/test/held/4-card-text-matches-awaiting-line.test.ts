// Critère 4 (#4273) : le texte de la carte est la ligne `awaiting` de `brigade <project> status` : même résumé, même raison.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { setCardsHeld } from "../../src/held/cards-held.ts";
import { Fake, repos } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const ACTIONS = [
  { id: "g1", kind: "split", summary: "split #4129 into 3 tickets", reason: "an epic split is held for the chef", approveCommand: "brigade manager approve g1", heldAt: "2026-11-25T08:00:00Z" },
  { id: "g2", kind: "split", summary: "split #4130 into 2 tickets", reason: "the budget of tickets is nearly spent", approveCommand: "brigade manager approve g2", heldAt: "2026-11-25T08:05:00Z" },
];
const set = (approve: (id: string) => Promise<unknown> = async () => undefined, actions = ACTIONS) => setCardsHeld(doc, actions, approve) as Fake[];
const buttons = (card: Fake) => card.dessous("button");

// La ligne du bloc `awaiting` (runtime/src/manager-cli.ts) : « <summary> — <reason> ».
describe("la carte dit la ligne awaiting (#4273)", () => {
  test("le résumé et la raison de la carte sont ceux de la ligne awaiting, mot pour mot", () => {
    set().forEach((card, i) => {
      const action = ACTIONS[i] ?? assert.fail("geste");
      const line = `${action.summary} — ${action.reason}`;
      const [resume, reason] = line.split(" — ");
      assert.ok(card.textContent.includes(resume ?? ""), "même résumé");
      assert.ok(card.textContent.includes(reason ?? ""), "même raison");
      assert.ok(card.textContent.indexOf(resume!) < card.textContent.indexOf(reason!), "le résumé d'abord, puis la raison");
    });
  });
});
