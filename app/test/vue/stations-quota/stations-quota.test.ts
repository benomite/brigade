// La jauge du quota GitHub de l'onglet Stations (ticket 3483) : trois états — normal à 40 %, avertissement à 90 %, illisible —,
// le détail par station et projet du plus gros au plus petit, la ligne « no data » d'un détail vide, et le chemin des faits
// du runtime jusqu'à l'onglet posé.
process.env.TZ = "UTC";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { quotaLu, type QuotaGithub } from "../../../src/vue/stations-quota/quota-lu.ts";
import { jaugeDe, lignesDeLUsage, poserLaJauge, SANS_DONNEES, ILLISIBLE } from "../../../src/vue/stations-quota/stations-quota.js";
import { poserLOngletDesStations } from "../../../src/vue/stations-tab/stations-tab.js";
import { Faux } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise), createElementNS: (_espace: string, balise: string) => new Faux(balise) };
const trouve = (n: Faux, classe: string): Faux | undefined => (n.className.split(" ").includes(classe) ? n : n.children.map((c: Faux) => trouve(c, classe)).find((c) => c !== undefined));
const quota = (utilise: number, appels: QuotaGithub["parStationEtProjet"] = []): QuotaGithub => ({ limite: "ecriture", pauseJusqua: null, utilise, maximum: 100, renouvellement: "2026-11-13T18:00:00.000Z", parStationEtProjet: appels });
const APPELS = [
  { station: "Linux box", projet: "parade", typeAppel: "reads on pull requests", nombre: 5 },
  { station: "Mac station", projet: "secondes", typeAppel: "writes on issues", nombre: 39 },
  { station: "Mac station", projet: "parade", typeAppel: "writes on comments", nombre: 12 },
];

describe("la jauge du quota GitHub", () => {
  test("à 40 % : ton normal, utilisé sur limite et heure de renouvellement", () => {
    const jauge = poserLaJauge(doc, quota(40));
    assert.equal(jauge.dataset.ton, "normal");
    assert.match(trouve(jauge, "quota-ligne")!.textContent, /40 \/ 100 calls used \(writes\).*renews around 18:00/);
    assert.equal(trouve(jauge, "quota-rempli")!.style.getPropertyValue("--part"), "40%");
  });

  test("à 90 % : ton d'avertissement, ni le jaune de la pause ni le rouge", () => {
    const jauge = poserLaJauge(doc, quota(90));
    assert.equal(jauge.dataset.ton, "alerte");
    assert.equal(poserLaJauge(doc, quota(79)).dataset.ton, "normal");
    assert.equal(poserLaJauge(doc, quota(80)).dataset.ton, "alerte");
  });

  test("le détail liste les appels en mots, du plus gros utilisateur au plus petit", () => {
    assert.deepEqual(lignesDeLUsage(APPELS), ["Mac station, secondes: 39 writes on issues", "Mac station, parade: 12 writes on comments", "Linux box, parade: 5 reads on pull requests"]);
    const jauge = poserLaJauge(doc, quota(40, APPELS));
    const lignes = trouve(jauge, "quota-usage")!.children[0]!.children.map((li: Faux) => li.textContent);
    assert.equal(lignes[0], "Mac station, secondes: 39 writes on issues");
    assert.ok(trouve(jauge, "replie"), "le détail est replié derrière la jauge");
  });

  test("un détail vide dit qu'il n'y a pas de données, pas une boîte vide", () => {
    const vide = trouve(poserLaJauge(doc, quota(40)), "quota-sans-donnees")!;
    assert.equal(vide.textContent, SANS_DONNEES);
    assert.equal(vide.dataset.ligne, "vide");
  });

  test("un compte illisible se dit sans chiffre inventé", () => {
    for (const mauvais of [{ ...quota(40), maximum: 0 }, { ...quota(40), utilise: Number.NaN }, { ...quota(40), maximum: Number.NaN }]) {
      assert.equal(jaugeDe(mauvais).lisible, false);
      const jauge = poserLaJauge(doc, mauvais);
      assert.equal(jauge.dataset.ton, "illisible");
      assert.equal(trouve(jauge, "quota-illisible")!.textContent, ILLISIBLE);
      assert.equal(trouve(jauge, "quota-rempli"), undefined);
    }
    assert.match(jaugeDe({ ...quota(40), renouvellement: "n'importe quoi" }).renouvellement!, /unknown/);
  });
});

describe("le quota des faits", () => {
  test("absent ou pas un objet : pas de jauge ; mal formé : lu, la jauge le dit illisible", () => {
    assert.deepEqual(quotaLu(undefined), {});
    assert.deepEqual(quotaLu([]), {});
    const lu = quotaLu({ limite: "core", utilise: "beaucoup", maximum: 5000, parStationEtProjet: [{ station: "x" }, ...APPELS] }).quotaGithub!;
    assert.equal(lu.parStationEtProjet.length, 3);
    assert.equal(jaugeDe(lu).lisible, false);
    assert.equal(quotaLu({ limite: "core", utilise: 4500, maximum: 5000, renouvellement: "2026-11-13T18:00:00Z", parStationEtProjet: [] }).quotaGithub!.utilise, 4500);
  });

  test("l'onglet Stations pose la jauge quand le quota est lu, et pas sans", () => {
    const base = { projet: "parade", poste: "this Mac", lues: true, haut: { etat: "personne", vert: false } as never, servantes: [], deplacable: { offert: false, pourquoi: "" }, details: new Map<string, never[]>(), ouverts: new Set<string>() };
    const gestes = {} as never;
    const avec = poserLOngletDesStations(doc, { ...base, quota: quota(90, APPELS) }, gestes);
    assert.equal(trouve(avec, "jauge-du-quota")!.dataset.ton, "alerte");
    assert.equal(trouve(poserLOngletDesStations(doc, base, gestes), "jauge-du-quota"), undefined);
  });
});
