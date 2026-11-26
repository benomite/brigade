// Test d'acceptation gelé (#4384), critère 3. Il garde un comportement que la base a déjà : sans déclaration, rien ne change.
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

import { brancheDuTicket } from "../../src/brigade-github.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

// brigade:guard
test("with no declaration, a gesture on any file or command is done as before, whatever the level logs, and nothing is said", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const dits: string[] = [];
  let lectures = 0;
  const sans = [undefined, [], { version: 1 }];
  const porte = porteDesGestes({ repertoire, projet: PROJET, horloge: HORLOGE, avertir: (texte) => dits.push(texte), ...({ risques: () => (lectures++, sans[lectures % sans.length]) } as object) });
  const COOK = { agent: "cook #12", reglable: "cook" } as const;
  assert.equal((await porte.passer(COOK, dit("pushed", { fichiers: ["src/billing/a.ts"], commande: "gh release create v2" }), () => 1)).etat, "done");
  assert.deepEqual(enregistrementDe(repertoire, "cook #12").gestures.map(({ reason }) => reason), ["its own reason"]);
  magasinDeNiveaux(repertoire).poser(PROJET, "cook", "propose");
  assert.deepEqual(await porte.passer(COOK, dit("pushed again"), () => 1), { etat: "held", id: 1 });
  assert.deepEqual(dits, []);
});

// brigade:guard
test("with no declaration, a delivery touching any path is merged as before", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const porte = porteDesGestes({ repertoire, projet: PROJET, horloge: HORLOGE });
  const faux = new FauxGitHub();
  faux.feu(1, [...CALIBRE]);
  faux.nonFermees.add(1);
  const touche = () => faux.prs.filter((pr) => pr.issue === 1).forEach((pr) => (pr.fichiers = ["src/billing/invoice.ts"]));
  const box = faux.station("A", { porte, cuisiner: async () => (touche(), { branche: brancheDuTicket(1) }), juger: async () => (touche(), { verdict: "approve", motif: "" }) });
  for (let i = 0; i < 3; i++) {
    await box.tour();
    await box.calme();
  }
  assert.notEqual(faux.mergee(1), undefined);
  assert.deepEqual(gestesEnAttente(repertoire), []);
});
