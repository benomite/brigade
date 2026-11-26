// Test d'acceptation gelé (#4384), critère 4. Même contrat que le critère 1.
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

test("a matched gesture done at act is logged with reason `risk class <name>`", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const porte = porteDesGestes({ repertoire, projet: PROJET, horloge: HORLOGE, risques: () => [{ name: "billing", paths: ["src/billing/"] }] });
  const passage = await porte.passer({ agent: "cook #12", reglable: "cook" }, dit("pushed cook/12-x", { fichiers: ["src/billing/a.ts"] }), () => 1);
  assert.equal(passage.etat, "done");
  assert.deepEqual(enregistrementDe(repertoire, "cook #12").gestures.map(({ reason }) => reason), ["risk class billing"]);
});

test("a matched gesture held, then approved, is logged with reason `risk class <name>`, and its pending entry says it too", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const porte = porteDesGestes({ repertoire, projet: PROJET, horloge: HORLOGE, risques: () => RISQUES });
  const passage = await porte.passer({ agent: "manager", reglable: "manager" }, dit("published v2", { commande: "gh release create v2" }), () => 1);
  assert.equal(passage.etat, "held");
  assert.equal(gestesEnAttente(repertoire)[0]?.reason, "risk class release");
  await porte.approuver(1);
  assert.deepEqual(enregistrementDe(repertoire, "manager").gestures.map(({ reason }) => reason), ["risk class release"]);
});

test("a gesture no class covers keeps its own reason", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const porte = porteDesGestes({ repertoire, projet: PROJET, horloge: HORLOGE, risques: () => RISQUES });
  await porte.passer({ agent: "manager", reglable: "manager" }, dit("listed", { commande: "gh pr list" }), () => 1);
  assert.deepEqual(enregistrementDe(repertoire, "manager").gestures.map(({ reason }) => reason), ["its own reason"]);
});
