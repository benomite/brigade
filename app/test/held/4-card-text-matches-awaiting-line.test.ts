// Critère 4 (#4273) : le texte de la carte est la ligne `awaiting` de `brigade <project> status` : même résumé, même raison.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { poserCardsRetenues } from "../../src/held/cards-retenues.ts";
import { Faux, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const ACTIONS = [
  { id: "g1", kind: "split", summary: "split #4129 into 3 tickets", reason: "an epic split is held for the chef", approveCommand: "brigade manager approve g1", heldAt: "2026-11-25T08:00:00Z" },
  { id: "g2", kind: "split", summary: "split #4130 into 2 tickets", reason: "the budget of tickets is nearly spent", approveCommand: "brigade manager approve g2", heldAt: "2026-11-25T08:05:00Z" },
];
const poser = (approuver: (id: string) => Promise<unknown> = async () => undefined, actions = ACTIONS) => poserCardsRetenues(doc, actions, approuver) as Faux[];
const boutons = (card: Faux) => card.dessous("button");

// La ligne du bloc `awaiting` (runtime/src/manager-cli.ts) : « <summary> — <reason> ».
describe("la carte dit la ligne awaiting (#4273)", () => {
  test("le résumé et la raison de la carte sont ceux de la ligne awaiting, mot pour mot", () => {
    poser().forEach((card, i) => {
      const action = ACTIONS[i] ?? assert.fail("geste");
      const line = `${action.summary} — ${action.reason}`;
      const [resume, raison] = line.split(" — ");
      assert.ok(card.textContent.includes(resume ?? ""), "même résumé");
      assert.ok(card.textContent.includes(raison ?? ""), "même raison");
      assert.ok(card.textContent.indexOf(resume!) < card.textContent.indexOf(raison!), "le résumé d'abord, puis la raison");
    });
  });
});
