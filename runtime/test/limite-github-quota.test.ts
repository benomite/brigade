// Le compteur pris sans la file (#3833) : sous 1 000 restants, un appel de la cuisine du projet
// le plus actif de l'heure lève `CuisineRalentie` jusqu'au délai linéaire, sans être compté ;
// le même appel qui a déjà attendu son délai (`sansRetard`) part, et un geste du chef aussi.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CuisineRalentie, etiquetteDe, ouvrirLimite } from "../src/limite-github.ts";

test("below 1000 remaining, a kitchen call of the busiest project taken straight from the counter is slowed by the linear delay, unless it already waited it", (t) => {
  const h = { instant: Date.UTC(2026, 10, 18, 10, 0, 0) };
  const limite = ouvrirLimite({ maintenant: () => h.instant, alerter: () => {} });
  t.after(() => limite.fermer());
  const lecture = (projet: string) => etiquetteDe([`repos/o/${projet}/issues`], { projet });
  for (const [projet, n] of [["a", 10], ["b", 2]] as const) {
    for (let i = 0; i < n; i += 1) {
      h.instant += 1000;
      limite.prendre("cuisine", undefined, lecture(projet));
    }
  }
  const reste = 40 * 60_000;
  limite.noter("gh", { restant: 500, plafond: 5000, reset: h.instant + reste });
  const avant = limite.repartition().parProjet.find(({ nom }) => nom === "a")?.appels;

  assert.throws(
    () => limite.prendre("cuisine", undefined, lecture("a")),
    (erreur: unknown) => erreur instanceof CuisineRalentie && erreur.projet === "a" && erreur.jusqua === h.instant + reste / 2,
  );
  assert.equal(limite.repartition().parProjet.find(({ nom }) => nom === "a")?.appels, avant, "a slowed call is not counted");

  // Le délai attendu, il part ; un geste du chef du même projet part sans délai.
  assert.equal(typeof limite.prendre("cuisine", undefined, lecture("a"), true), "number");
  assert.equal(typeof limite.prendre("geste", undefined, lecture("a")), "number");
  // Le projet de la moitié basse part aussi.
  assert.equal(typeof limite.prendre("cuisine", undefined, lecture("b")), "number");
});
