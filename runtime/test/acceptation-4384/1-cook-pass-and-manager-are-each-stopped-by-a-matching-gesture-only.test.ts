// Test d'acceptation gelé (#4384), critère 1. Le contrat que ce test fixe, parce que le ticket le laisse ouvert :
// `porteDesGestes` reçoit `risques?: () => unknown` (la ligne `risks` de la fiche, relue à chaque geste) ; un geste dit ses fichiers
// (`fichiers`) ou sa commande (`commande`) ; une classe `paths` correspond quand un fichier est sous un de ses chemins, une classe
// `command` quand la commande commence par la sienne.
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

const AGENTS = [
  { qui: { agent: "cook #12", reglable: "cook" }, zone: "pushed cook/12-x to origin", commande: "git push origin cook/12-x" },
  { qui: { agent: "pass", reglable: "pass" }, zone: "merge PR #7 of #12", commande: "gh pr merge 7" },
  { qui: { agent: "manager", reglable: "manager" }, zone: "set `fire` on #13", commande: "gh issue edit 13" },
] as const;

for (const { qui, zone } of AGENTS) {
  test(`${qui.agent}: a gesture touching the declared zone is stopped, one that touches none is done`, async (t) => {
    const repertoire = repertoireTemporaire(t);
    const porte = porteDesGestes({ repertoire, projet: PROJET, horloge: HORLOGE, risques: () => RISQUES });
    let faits = 0;
    const faire = () => ++faits;
    const arrete = await porte.passer(qui, dit(zone, { fichiers: ["src/billing/invoice.ts", "README.md"] }), faire);
    assert.equal(arrete.etat, "held");
    assert.equal(faits, 0);
    assert.equal(gestesEnAttente(repertoire).length, 1);
    const libre = await porte.passer(qui, dit(`${zone} (docs)`, { fichiers: ["docs/a.md"] }), faire);
    assert.equal(libre.etat, "done");
    assert.equal(faits, 1);
  });

  test(`${qui.agent}: a command gesture matching the declared shape is stopped, another command is done`, async (t) => {
    const repertoire = repertoireTemporaire(t);
    const porte = porteDesGestes({ repertoire, projet: PROJET, horloge: HORLOGE, risques: () => RISQUES });
    let faits = 0;
    const faire = () => ++faits;
    assert.equal((await porte.passer(qui, dit("publish v2", { commande: "gh release create v2" }), faire)).etat, "held");
    assert.equal(faits, 0);
    assert.equal((await porte.passer(qui, dit("list prs", { commande: "gh pr list" }), faire)).etat, "done");
    assert.equal(faits, 1);
  });
}
