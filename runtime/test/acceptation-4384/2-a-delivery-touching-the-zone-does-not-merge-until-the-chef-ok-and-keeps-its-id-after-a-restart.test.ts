// Test d'acceptation gelé (#4384), critère 2. Même contrat que le critère 1 ; le merge de la pass passe `fichiers` (ceux de la PR).
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

test("a delivery touching the declared zone is not merged while the class holds it, and goes through once after the chef's OK", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const porte = porteDesGestes({ repertoire, projet: PROJET, horloge: HORLOGE, risques: () => RISQUES });
  const faux = new FauxGitHub();
  faux.feu(1, [...CALIBRE]);
  faux.nonFermees.add(1);
  const touche = () => faux.prs.filter((pr) => pr.issue === 1).forEach((pr) => (pr.fichiers = ["src/billing/invoice.ts"]));
  const box = faux.station("A", {
    porte,
    avertir: () => {},
    cuisiner: async () => (touche(), { branche: brancheDuTicket(1) }),
    juger: async () => (touche(), { verdict: "approve", motif: "" }),
  });
  for (let i = 0; i < 3; i++) {
    await box.tour();
    await box.calme();
  }
  assert.equal(faux.mergee(1), undefined, "not merged while held");
  const [attente] = gestesEnAttente(repertoire);
  assert.equal(attente?.agent, "pass");
  assert.match(attente?.reason ?? "", /risk class billing/);
  await porte.approuver(attente?.id ?? 0);
  assert.notEqual(faux.mergee(1), undefined, "merged after the OK");
  assert.equal(faux.prs.filter((pr) => pr.issue === 1 && pr.merged).length, 1);
  assert.deepEqual(gestesEnAttente(repertoire), []);
});

test("after a restart, the same gesture proposed again keeps its id and its approval, and is done once", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const PASS = { agent: "pass", reglable: "pass" } as const;
  const geste = dit("merge PR #7 of #12", { fichiers: ["src/billing/a.ts"] });
  const ouvrir = () => porteDesGestes({ repertoire, projet: PROJET, horloge: HORLOGE, risques: () => RISQUES });
  const avant = await ouvrir().passer(PASS, geste, () => "x");
  assert.equal(avant.etat, "held");
  const id = avant.etat === "held" ? avant.id : -1;
  approuverGeste(repertoire, id);
  // The restart: a new gate over the same directory.
  const apres = ouvrir();
  let faits = 0;
  const reproposee = await apres.passer(PASS, geste, () => ++faits);
  assert.deepEqual(reproposee, { etat: "held", id });
  assert.equal(gestesEnAttente(repertoire)[0]?.approved, true);
  await apres.relever();
  await apres.relever();
  assert.equal(faits, 1);
  assert.deepEqual(gestesEnAttente(repertoire), []);
});
