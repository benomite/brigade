// #4039: a cook taking its ticket and the pass merging a green delivery go through the gate of their autonomy level,
// on a station of a fake GitHub. Held, nothing is taken or merged until the chef's approval; observed, never. The
// cook and the review are fakes; the clock is given; no `claude` is launched.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { enregistrementDe, OUTCOME } from "../../../src/autonomie/agents/gestes.ts";
import { magasinDeNiveaux, type Niveau } from "../../../src/autonomie/agents/niveaux.ts";
import { gestesEnAttente, porteDesGestes } from "../../../src/autonomie/agents/porte.ts";
import { priseDeLaStation } from "../../../src/brigade-github.ts";
import { FauxGitHub } from "../../faux-github.ts";
import { repertoireTemporaire } from "../../outils.ts";

const PROJET = "porte-station";
const A9 = () => new Date("2026-11-23T09:00:00.000Z");

// A station of a fake GitHub with ticket #1 on the rail, the cook and the pass at the levels given.
function station(t: TestContext, niveaux: { cook?: Niveau; pass?: Niveau }) {
  const repertoire = repertoireTemporaire(t);
  const magasin = magasinDeNiveaux(repertoire);
  for (const [reglable, niveau] of Object.entries(niveaux)) magasin.poser(PROJET, reglable as "cook" | "pass", niveau);
  const porte = porteDesGestes({ repertoire, projet: PROJET, horloge: A9 });
  const faux = new FauxGitHub();
  faux.feu(1);
  // GitHub does not close the ticket of a merged PR: the station closes it once it knows the merge done.
  faux.nonFermees.add(1);
  const sauts: string[] = [];
  const avertissements: string[] = [];
  const box = faux.station("A", { porte, sauter: (_ticket, ligne) => void sauts.push(ligne), avertir: (texte) => void avertissements.push(texte) });
  const tours = async (n: number) => {
    for (let i = 0; i < n; i++) {
      await box.tour();
      await box.calme();
    }
  };
  return { repertoire, porte, faux, sauts, avertissements, box, tours };
}

test("a cook on propose takes no ticket until the chef's approval, then takes and cooks it once, and logs it", async (t) => {
  const { repertoire, porte, faux, sauts, tours } = station(t, { cook: "propose", pass: "observe" });
  await tours(2);
  assert.deepEqual(faux.cuissons, []);
  assert.deepEqual(faux.pris(), []);
  assert.ok(sauts.some((ligne) => ligne.includes("its cook waits for the chef's OK — `brigade <projet> manager approve 1`")), sauts.join("\n"));
  assert.deepEqual(gestesEnAttente(repertoire).map(({ id, agent, line }) => ({ id, agent, line })), [{ id: 1, agent: "cook #1", line: "take #1 and cook it" }]);
  assert.deepEqual(enregistrementDe(repertoire, "cook #1").gestures, []);

  assert.equal((await porte.approuver(1))?.etat, "done");
  assert.deepEqual(faux.cuissons.map(({ issue }) => issue), [1]);
  assert.deepEqual(enregistrementDe(repertoire, "cook #1").gestures, [{ at: A9().toISOString(), line: "took #1 and cooks it", reason: "it is cookable, at sonnet / medium", outcome: OUTCOME.FIXED_BY_SELF }]);
  assert.equal(await porte.approuver(1), null);
  assert.equal(faux.cuissons.length, 1);
});

test("a cook on observe never takes the ticket, and logs it once as not done", async (t) => {
  const { repertoire, faux, sauts, tours } = station(t, { cook: "observe" });
  await tours(2);
  assert.deepEqual(faux.cuissons, []);
  assert.ok(sauts.some((ligne) => ligne.includes("the cooks observe: no cook takes it")), sauts.join("\n"));
  assert.deepEqual(enregistrementDe(repertoire, "cook #1").gestures.map(({ line, outcome }) => ({ line, outcome })), [{ line: "take #1 and cook it", outcome: OUTCOME.NOT_DONE }]);
  assert.deepEqual(gestesEnAttente(repertoire), []);
});

test("a cook on act — its default — takes and cooks at once, and logs it", async (t) => {
  const { repertoire, faux, sauts, tours } = station(t, { pass: "observe" });
  await tours(1);
  assert.deepEqual(faux.cuissons.map(({ issue }) => issue), [1]);
  assert.deepEqual(sauts.filter((ligne) => /chef's OK|observe/.test(ligne)), []);
  assert.deepEqual(enregistrementDe(repertoire, "cook #1").gestures.map(({ line }) => line), ["took #1 and cooks it"]);
});

test("the pass on propose merges no green delivery until the chef's approval, then merges it once, and logs it", async (t) => {
  const { repertoire, porte, faux, avertissements, tours } = station(t, { pass: "propose" });
  await tours(3);
  assert.equal(faux.cuissons.length, 1);
  assert.equal(faux.mergee(1), undefined);
  // Held as a delivery the chef validates: never said refused by GitHub.
  assert.deepEqual(avertissements.filter((texte) => /refused by GitHub/.test(texte)), []);
  const [attente] = gestesEnAttente(repertoire);
  assert.equal(attente?.agent, "pass");
  assert.match(attente?.line ?? "", /^merge PR #\d+ of #1$/);
  assert.deepEqual(enregistrementDe(repertoire, "pass").gestures, []);

  await porte.approuver(attente?.id ?? 0);
  assert.notEqual(faux.mergee(1), undefined);
  assert.deepEqual(enregistrementDe(repertoire, "pass").gestures.map(({ line, outcome }) => ({ line, outcome })), [{ line: attente?.line.replace("merge", "merged"), outcome: OUTCOME.FIXED_BY_SELF }]);
  assert.equal(await porte.approuver(attente?.id ?? 0), null);
});

test("the pass on observe never merges, and logs it as not done; on act — its default — it merges and logs it", async (t) => {
  const observe = station(t, { pass: "observe" });
  await observe.tours(3);
  assert.equal(observe.faux.mergee(1), undefined);
  assert.deepEqual(enregistrementDe(observe.repertoire, "pass").gestures.map(({ outcome }) => outcome), [OUTCOME.NOT_DONE]);

  const agit = station(t, {});
  await agit.tours(3);
  assert.notEqual(agit.faux.mergee(1), undefined);
  // Merged through the gate, the delivery is served: its ticket closed.
  assert.equal(agit.faux.ticket(1).state, "closed");
  assert.match(enregistrementDe(agit.repertoire, "pass").gestures.map(({ line }) => line).join("\n"), /^merged PR #\d+ of #1$/);
});

test("a cook's gate that cannot be read does not stop the turn: the ticket is not taken, and it is said", async (t) => {
  const { repertoire, faux, avertissements, box } = station(t, {});
  writeFileSync(join(repertoire, "autonomy-levels.json"), "{not json");
  await box.tour();
  await box.calme();
  assert.deepEqual(faux.cuissons, []);
  assert.ok(avertissements.some((texte) => /#1 on A — .*autonomy-levels\.json cannot be read/.test(texte)), avertissements.join("\n"));
});

test("a cook taken on an unreadable gesture log is cooked, and its log that failed is said", async (t) => {
  const { repertoire, faux, avertissements, box } = station(t, { pass: "observe" });
  writeFileSync(join(repertoire, "autonomy-gestures.json"), "{not json");
  await box.tour();
  await box.calme();
  assert.deepEqual(faux.cuissons.map(({ issue }) => issue), [1]);
  assert.ok(avertissements.some((texte) => /#1 on A — its gesture was done but not logged \(took #1 and cooks it\)/.test(texte)), avertissements.join("\n"));
});

test("a take that GitHub refuses through the gate stops the turn, as without it", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(1);
  faux.prise = (github, nom) => ({
    ...priseDeLaStation(github, nom),
    prendre: async () => {
      throw new Error("GitHub is down");
    },
  });
  const box = faux.station("A", { porte: porteDesGestes({ repertoire: repertoireTemporaire(t), projet: PROJET, horloge: A9 }), avertir: () => {} });
  await assert.rejects(box.tour(), /GitHub is down/);
  assert.deepEqual(faux.cuissons, []);
});
