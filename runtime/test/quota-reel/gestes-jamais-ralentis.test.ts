// #3833, critère 4 : les appels des gestes du chef ne sont jamais ralentis, même à 0 restant.
import assert from "node:assert/strict";
import { test } from "node:test";
import { etiquetteDe, ouvrirLimite, prendreUnAppel } from "../../src/limite-github.ts";

const DEBUT = Date.UTC(2026, 10, 18, 10, 0, 0);
const lectureDe = (projet: string, usage: "cuisine" | "geste") => etiquetteDe([`repos/benomite/${projet}/issues`], { projet, usage });
const horloge = () => {
  const h = { instant: DEBUT, maintenant: () => h.instant };
  return h;
};
const faireDesAppels = (limite: ReturnType<typeof ouvrirLimite>, h: { instant: number }, projet: string, n: number) => {
  for (let i = 0; i < n; i++) {
    h.instant += 1000;
    limite.prendre("cuisine", undefined, lectureDe(projet, "cuisine"));
  }
};
// Le délai que la file impose à un appel : 0 s'il part sans attendre, sinon la première attente demandée.
const delaiDe = async (limite: ReturnType<typeof ouvrirLimite>, h: { maintenant: () => number }, projet: string, usage: "cuisine" | "geste"): Promise<number> => {
  const attentes: number[] = [];
  const attendre = (ms: number) => {
    attentes.push(ms);
    return new Promise<void>(() => {});
  };
  let parti = false;
  void prendreUnAppel(limite, { gh: "gh", usage, etiquette: lectureDe(projet, usage), maintenant: h.maintenant, attendre }).then(() => (parti = true));
  await new Promise((suite) => setImmediate(suite));
  return parti ? 0 : (attentes[0] ?? Number.POSITIVE_INFINITY);
};

for (const restant of [999, 500, 100, 0]) {
  test(`with ${restant} calls remaining, the chef's gestures are never delayed, even for the busiest project`, async () => {
    const h = horloge();
    const limite = ouvrirLimite({ maintenant: h.maintenant, alerter: () => {} });
    faireDesAppels(limite, h, "brigade", 30);
    faireDesAppels(limite, h, "secondes", 5);
    limite.noter("gh", { restant, plafond: 5000, reset: h.instant + 40 * 60_000 });
    assert.equal(await delaiDe(limite, h, "brigade", "geste"), 0);
    assert.equal(await delaiDe(limite, h, "secondes", "geste"), 0);
    assert.ok((await delaiDe(limite, h, "brigade", "cuisine")) > 0, "while the kitchen's call of the same project is slowed");
    limite.fermer();
  });
}
