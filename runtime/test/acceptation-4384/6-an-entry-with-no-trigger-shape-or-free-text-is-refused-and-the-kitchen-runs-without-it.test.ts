// Test d'acceptation gelé (#4384), critère 6. Le contrat que ce test fixe : `runtime/src/autonomie/risque.ts` exporte
// `lireLesClasses(risks)` -> `{ classes, refus }` (`refus` : un message en anglais par entrée refusée, qui nomme l'entrée) ; la porte
// dit chaque refus par `avertir` et tourne sans l'entrée refusée.
import assert from "node:assert/strict";
import { test } from "node:test";
import { enregistrementDe, OUTCOME } from "../../src/autonomie/agents/gestes.ts";
import { magasinDeNiveaux } from "../../src/autonomie/agents/niveaux.ts";
import { approuverGeste, gestesEnAttente, porteDesGestes } from "../../src/autonomie/agents/porte.ts";
import { repertoireTemporaire } from "../outils.ts";

const PROJET = "shop";
const HORLOGE = () => new Date("2026-11-26T09:00:00.000Z");
// The declaration, as the `risks` line of the project sheet holds it: one entry per class, a name and exactly one trigger
// shape — `paths` (a path zone) or `command` (a command or API gesture); `hold: true` holds the gesture even at `act`.
const RISQUES = [
  { name: "billing", paths: ["src/billing/"], hold: true },
  { name: "release", command: "gh release", hold: true },
];
const dit = (line: string, plus: { fichiers?: string[]; commande?: string } = {}) => ({ line, reason: "its own reason", outcome: OUTCOME.FIXED_BY_SELF, ...plus });

import { lireLesClasses } from "../../src/autonomie/risque.ts";

const SANS_FORME = { name: "oops" };
const TEXTE_LIBRE = "anything touching money";

test("an entry with no trigger shape, or a free text where a class is expected, is refused with a message naming it", () => {
  const lu = lireLesClasses([SANS_FORME, TEXTE_LIBRE, ...RISQUES]);
  assert.deepEqual(lu.classes.map(({ name }) => name), ["billing", "release"]);
  assert.equal(lu.refus.length, 2);
  assert.match(lu.refus[0] ?? "", /oops/);
  assert.match(lu.refus[1] ?? "", /anything touching money/);
});

test("an entry with two trigger shapes is refused as well", () => {
  const lu = lireLesClasses([{ name: "both", paths: ["a/"], command: "gh release" }]);
  assert.deepEqual(lu.classes, []);
  assert.match(lu.refus[0] ?? "", /both/);
});

test("the gate says each refusal and runs without the refused entry: nothing is guessed", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const dits: string[] = [];
  const porte = porteDesGestes({ repertoire, projet: PROJET, horloge: HORLOGE, avertir: (texte) => dits.push(texte), risques: () => [SANS_FORME, TEXTE_LIBRE, RISQUES[0]] });
  const COOK = { agent: "cook #12", reglable: "cook" } as const;
  assert.equal((await porte.passer(COOK, dit("pushed", { fichiers: ["README.md", "money.ts"] }), () => 1)).etat, "done");
  assert.ok(dits.some((texte) => /oops/.test(texte)), dits.join("\n"));
  assert.ok(dits.some((texte) => /anything touching money/.test(texte)), dits.join("\n"));
  // The valid class beside them still holds.
  assert.equal((await porte.passer(COOK, dit("pushed billing", { fichiers: ["src/billing/a.ts"] }), () => 1)).etat, "held");
});
