// Le même ticket renvoyé deux fois de suite pour le même résultat n'est pas relancé une troisième fois de la même façon (#3814) :
// il est parqué, ou il est mis de côté avec sa raison en une ligne.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MIS_DE_COTE } from "../../src/github.ts";
import { LABEL_PARKED } from "../../src/github-etat/etats.ts";
import { FauxGitHub } from "../faux-github.ts";

const MOTIF = "Too early: this can only be done from 2026-11-25.";

test("a ticket handed back twice with the same result is not relaunched a third time: parked, or set aside with its reason on one line", async () => {
  const faux = new FauxGitHub();
  faux.feu(7);
  const a = faux.station("A", { juger: async () => ({ verdict: "request-changes", motif: MOTIF }), avertir: () => {}, maintenant: () => new Date("2026-11-18T09:00:00Z") });
  for (let tour = 0; tour < 12; tour += 1) {
    await a.tour();
    await a.calme();
  }
  const cuissons = faux.cuissons.filter(({ issue }) => issue === 7).length;
  assert.ok(cuissons <= 2, `the cook ran ${cuissons} times for the same result`);
  const labels = [...faux.ticket(7).labels];
  const ecarte = labels.some((label) => (MIS_DE_COTE as readonly string[]).includes(label) || label === LABEL_PARKED);
  const enAttente = labels.includes(LABEL_PARKED);
  assert.ok(ecarte || enAttente, `the ticket is parked or set aside, not left on the rail: ${labels.join(", ")}`);
  if (ecarte && !enAttente) {
    const mots = (faux.commentaires.get(7) ?? []).map((c) => c.body).filter((corps) => corps.includes("2026-11-25"));
    assert.ok(mots.length > 0, "a comment gives the reason, the same result");
  }
});
