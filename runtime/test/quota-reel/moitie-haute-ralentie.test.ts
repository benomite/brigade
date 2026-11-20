// #3833, critère 2 : sous 1 000 restants, seule la moitié haute (arrondie au-dessus, un au moins) des projets classés par appels de l'heure est ralentie.
import assert from "node:assert/strict";
import { test } from "node:test";
import { etiquetteDe, FENETRE_MS, ouvrirLimite, prendreUnAppel } from "../../src/limite-github.ts";

const DEBUT = Date.UTC(2026, 10, 18, 10, 0, 0);
const lectureDe = (projet: string) => etiquetteDe([`repos/benomite/${projet}/issues`], { projet });
const horloge = () => {
  const h = { instant: DEBUT, maintenant: () => h.instant };
  return h;
};
const faireDesAppels = (limite: ReturnType<typeof ouvrirLimite>, h: { instant: number }, appels: Record<string, number>) => {
  for (const [projet, n] of Object.entries(appels)) {
    for (let i = 0; i < n; i++) {
      h.instant += 1000;
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

test("below 1000 remaining, the top half of the projects by calls in the last 60 minutes is delayed: the busiest waits, the least busy goes", async () => {
  const h = horloge();
  const limite = ouvrirLimite({ maintenant: h.maintenant, alerter: () => {} });
  faireDesAppels(limite, h, { brigade: 30, secondes: 20, alpha: 10 });
  limite.noter("gh", { restant: 500, plafond: 5000, reset: h.instant + 40 * 60_000 });
  assert.ok((await delaiDe(limite, h, "brigade")) > 0, "the busiest is delayed");
  assert.ok((await delaiDe(limite, h, "secondes")) > 0, "the second of three is in the top half (3 rounded up: 2)");
  assert.equal(await delaiDe(limite, h, "alpha"), 0, "the least busy is not delayed");
  limite.fermer();
});

test("with a single project, it is the top half (at least one): it is delayed below 1000 remaining", async () => {
  const h = horloge();
  const limite = ouvrirLimite({ maintenant: h.maintenant, alerter: () => {} });
  faireDesAppels(limite, h, { seul: 3 });
  limite.noter("gh", { restant: 200, plafond: 5000, reset: h.instant + 40 * 60_000 });
  assert.ok((await delaiDe(limite, h, "seul")) > 0);
  limite.fermer();
});

test("calls older than 60 minutes do not rank a project", async () => {
  const h = horloge();
  const limite = ouvrirLimite({ maintenant: h.maintenant, alerter: () => {} });
  faireDesAppels(limite, h, { ancien: 50 });
  h.instant += FENETRE_MS + 1000;
  faireDesAppels(limite, h, { recent: 5, moyen: 3 });
  limite.noter("gh", { restant: 500, plafond: 5000, reset: h.instant + 40 * 60_000 });
  assert.equal(await delaiDe(limite, h, "ancien"), 0, "its 50 calls are out of the hour: it is the least busy");
  assert.ok((await delaiDe(limite, h, "recent")) > 0);
  limite.fermer();
});
