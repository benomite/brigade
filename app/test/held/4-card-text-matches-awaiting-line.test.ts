// Critère 4 (#4273) : le texte de la carte est la ligne `awaiting` de `brigade <project> status` : même résumé, même raison.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { poserCartesRetenues } from "../../src/held/cartes-retenues.ts";
import { Faux, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const GESTES = [
  { id: "g1", kind: "split", summary: "split #4129 into 3 tickets", reason: "an epic split is held for the chef", approveCommand: "brigade manager approve g1", heldAt: "2026-11-25T08:00:00Z" },
  { id: "g2", kind: "split", summary: "split #4130 into 2 tickets", reason: "the budget of tickets is nearly spent", approveCommand: "brigade manager approve g2", heldAt: "2026-11-25T08:05:00Z" },
];
const poser = (approuver: (id: string) => Promise<unknown> = async () => undefined, gestes = GESTES) => poserCartesRetenues(doc, gestes, approuver) as Faux[];
const boutons = (carte: Faux) => carte.dessous("button");

// La ligne du bloc `awaiting` (runtime/src/manager-cli.ts) : « <summary> — <reason> ».
describe("la carte dit la ligne awaiting (#4273)", () => {
  test("le résumé et la raison de la carte sont ceux de la ligne awaiting, mot pour mot", () => {
    poser().forEach((carte, i) => {
      const geste = GESTES[i] ?? assert.fail("geste");
      const ligne = `${geste.summary} — ${geste.reason}`;
      const [resume, raison] = ligne.split(" — ");
      assert.ok(carte.textContent.includes(resume ?? ""), "même résumé");
      assert.ok(carte.textContent.includes(raison ?? ""), "même raison");
      assert.ok(carte.textContent.indexOf(resume!) < carte.textContent.indexOf(raison!), "le résumé d'abord, puis la raison");
    });
  });
});
