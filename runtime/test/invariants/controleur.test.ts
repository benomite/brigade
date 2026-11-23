// Le contrôleur des invariants du rail (#4026) : chaque contrôle une fois par
// tour ; un contrôle qui échoue est dit, sans retenir les autres ni le tour ; une
// base rouge relancée retient les autres réparations jusqu'à son résultat.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Invariant } from "../../src/invariants/invariants.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

test("a check that fails is said, and neither the other checks nor the tick stop", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, CALIBRE);
  const avertis: string[] = [];
  let suivant = 0;
  const invariants: Invariant[] = [
    async () => {
      throw new Error("GitHub said 502");
    },
    async () => void (suivant += 1),
  ];
  const a = faux.station("A", { places: 1, sauter: () => {}, avertir: (texte) => avertis.push(texte), cuisiner: async () => ({ echec: "not the point" }), invariants });
  await a.tour();
  await a.calme();
  assert.equal(suivant, 1);
  assert.match(avertis.join("\n"), /an invariant of the rail could not be checked on A, checked again next turn — GitHub said 502/);
  assert.equal(faux.cuissons.length, 1);
});

test("while the red base's rerun has no result, no other invariant is repaired", async () => {
  const faux = new FauxGitHub();
  faux.base = "red";
  faux.feu(1, [...CALIBRE, "waiting"]);
  const a = faux.station("A", { places: 1, sauter: () => {}, avertir: () => {}, relancerLaBase: async () => {} });
  await a.tour();
  await a.calme();
  assert.deepEqual(faux.commentaires.get(1) ?? [], [], "nothing written before the rerun's result");
  await a.tour();
  await a.calme();
  assert.match((faux.commentaires.get(1) ?? []).map((c) => c.body).join("\n"), /Invariant 3 broke/);
});

test("a repair says whether it repaired: not when the tick is held, not twice in one tick, not when the ticket already says it, not when its gesture fails", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, CALIBRE);
  faux.poster(1, "A", "<!-- brigade:invariant n=3 deja -->");
  const rendus: Record<string, boolean> = {};
  const gestes: string[] = [];
  const reparation = (cle: string, geste: () => Promise<string | null> = async () => (gestes.push(cle), "did it")) => ({ invariant: 3 as const, ticket: 1, cle, casse: "it broke", geste });
  const invariants: Invariant[] = [
    async (tour) => {
      rendus.premier = await tour.reparer(reparation("neuf"));
      rendus.second = await tour.reparer(reparation("neuf"));
      rendus.dit = await tour.reparer(reparation("deja"));
      rendus.echoue = await tour.reparer(reparation("echoue", async () => { throw new Error("GitHub said 502"); }));
      tour.retenir();
      rendus.retenu = await tour.reparer(reparation("retenu"));
    },
  ];
  const a = faux.station("A", { places: 1, sauter: () => {}, avertir: () => {}, cuisiner: async () => ({ echec: "not the point" }), invariants });
  await a.tour();
  await a.calme();
  assert.deepEqual(rendus, { premier: true, second: false, dit: false, echoue: false, retenu: false });
  assert.deepEqual(gestes, ["neuf"], "the held tick and the already said break make no gesture");
});
