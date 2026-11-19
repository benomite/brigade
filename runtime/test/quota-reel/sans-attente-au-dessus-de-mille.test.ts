// #3833, critère 1 : à 1 000 appels restants ou plus, aucun appel d'aucun projet n'attend un budget ou une part de la station.
import assert from "node:assert/strict";
import { test } from "node:test";
import { etiquetteDe, ouvrirLimite, prendreUnAppel } from "../../src/limite-github.ts";

const DEBUT = Date.UTC(2026, 10, 18, 10, 0, 0);
const lectureDe = (projet: string) => etiquetteDe([`repos/benomite/${projet}/issues`], { projet });
const horloge = () => {
  const h = { instant: DEBUT, maintenant: () => h.instant };
  return h;
};
const faireDesAppels = (limite: ReturnType<typeof ouvrirLimite>, h: { instant: number }, appels: Record<string, number>, pas = 1000) => {
  for (const [projet, n] of Object.entries(appels)) {
    for (let i = 0; i < n; i++) {
      h.instant += pas;
      limite.prendre("cuisine", undefined, lectureDe(projet));
    }
  }
};
// Le délai que la file impose à un appel : 0 s'il part sans attendre, sinon la première attente demandée.
const delaiDe = async (limite: ReturnType<typeof ouvrirLimite>, h: { maintenant: () => number }, projet: string): Promise<number> => {
  const attentes: number[] = [];
  const attendre = (ms: number) => {
    attentes.push(ms);
    return new Promise<void>(() => {});
  };
  let parti = false;
  void prendreUnAppel(limite, { gh: "gh", etiquette: lectureDe(projet), maintenant: h.maintenant, attendre }).then(() => (parti = true));
  await new Promise((suite) => setImmediate(suite));
  return parti ? 0 : (attentes[0] ?? Number.POSITIVE_INFINITY);
};

for (const restant of [1000, 5000]) {
  test(`with ${restant} calls remaining, every project's call goes with zero added delay, however many it made`, async () => {
    const h = horloge();
    const limite = ouvrirLimite({ maintenant: h.maintenant, alerter: () => {} });
    faireDesAppels(limite, h, { brigade: 300, secondes: 100, alpha: 5 });
    limite.noter("gh", { restant, plafond: 5000, reset: h.instant + 40 * 60_000 });
    for (const projet of ["brigade", "secondes", "alpha", "nouveau"]) {
      assert.equal(await delaiDe(limite, h, projet), 0, `${projet} at ${restant} remaining`);
    }
    limite.fermer();
  });
}

test("a project with many calls in the last hour still goes at 5000 remaining", async () => {
  const h = horloge();
  const limite = ouvrirLimite({ maintenant: h.maintenant, alerter: () => {} });
  faireDesAppels(limite, h, { brigade: 4100 }, 800);
  limite.noter("gh", { restant: 5000, plafond: 5000, reset: h.instant + 20 * 60_000 });
  assert.equal(await delaiDe(limite, h, "brigade"), 0);
  limite.fermer();
});
