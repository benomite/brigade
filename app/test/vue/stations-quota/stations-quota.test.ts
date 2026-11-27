// La jauge du quota GitHub de l'onglet Stations (ticket 3483) : trois états — normal à 40 %, avertissement à 90 %, illisible —,
// le détail par station et projet du plus gros au plus petit, la ligne « no data » d'un détail vide, et le chemin des faits
// du runtime jusqu'à l'onglet posé.
process.env.TZ = "UTC";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { quotaRead, type QuotaGithub } from "../../../src/vue/stations-quota/quota-read.ts";
import { readOfQuota, linesOfTheUsage, setTheQuota, WITHOUT_DATA, UNREADABLE } from "../../../src/vue/stations-quota/stations-quota.js";
import { setTheTabOfStations } from "../../../src/vue/stations-tab/stations-tab.js";
import { Fake } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise), createElementNS: (_space: string, balise: string) => new Fake(balise) };
const finds = (n: Fake, classe: string): Fake | undefined => (n.className.split(" ").includes(classe) ? n : n.children.map((c: Fake) => finds(c, classe)).find((c) => c !== undefined));
const quota = (utilise: number, calls: QuotaGithub["parStationEtProjet"] = []): QuotaGithub => ({ limite: "ecriture", pauseJusqua: null, utilise, maximum: 100, renouvellement: "2026-11-13T18:00:00.000Z", parStationEtProjet: calls });
const CALLS = [
  { station: "Linux box", projet: "parade", typeAppel: "reads on pull requests", nombre: 5 },
  { station: "Mac station", projet: "secondes", typeAppel: "writes on issues", nombre: 39 },
  { station: "Mac station", projet: "parade", typeAppel: "writes on comments", nombre: 12 },
];

describe("la jauge du quota GitHub", () => {
  test("à 40 % : ton normal, utilisé sur limite et heure de renouvellement", () => {
    const gauge = setTheQuota(doc, quota(40));
    assert.equal(gauge.dataset.ton, "normal");
    assert.match(finds(gauge, "quota-ligne")!.textContent, /40 \/ 100 calls used \(writes\).*renews around 18:00/);
    assert.equal(finds(gauge, "quota-rempli")!.style.getPropertyValue("--part"), "40%");
  });

  test("à 90 % : ton d'avertissement, ni le jaune de la pause ni le rouge", () => {
    const gauge = setTheQuota(doc, quota(90));
    assert.equal(gauge.dataset.ton, "alerte");
    assert.equal(setTheQuota(doc, quota(79)).dataset.ton, "normal");
    assert.equal(setTheQuota(doc, quota(80)).dataset.ton, "alerte");
  });

  test("le détail liste les appels en mots, du plus gros utilisateur au plus petit", () => {
    assert.deepEqual(linesOfTheUsage(CALLS), ["Mac station, secondes: 39 writes on issues", "Mac station, parade: 12 writes on comments", "Linux box, parade: 5 reads on pull requests"]);
    const gauge = setTheQuota(doc, quota(40, CALLS));
    const lines = finds(gauge, "quota-usage")!.children[0]!.children.map((li: Fake) => li.textContent);
    assert.equal(lines[0], "Mac station, secondes: 39 writes on issues");
    assert.ok(finds(gauge, "replie"), "le détail est replié derrière la jauge");
  });

  test("un détail vide dit qu'il n'y a pas de données, pas une boîte vide", () => {
    const empty = finds(setTheQuota(doc, quota(40)), "quota-sans-donnees")!;
    assert.equal(empty.textContent, WITHOUT_DATA);
    assert.equal(empty.dataset.ligne, "vide");
  });

  test("un compte illisible se dit sans chiffre inventé", () => {
    for (const bad of [{ ...quota(40), maximum: 0 }, { ...quota(40), utilise: Number.NaN }, { ...quota(40), maximum: Number.NaN }]) {
      assert.equal(readOfQuota(bad).lisible, false);
      const gauge = setTheQuota(doc, bad);
      assert.equal(gauge.dataset.ton, "illisible");
      assert.equal(finds(gauge, "quota-illisible")!.textContent, UNREADABLE);
      assert.equal(finds(gauge, "quota-rempli"), undefined);
    }
    assert.match(readOfQuota({ ...quota(40), renouvellement: "n'importe quoi" }).renouvellement!, /unknown/);
  });
});

describe("le quota des faits", () => {
  test("absent ou pas un objet : pas de jauge ; mal formé : lu, la jauge le dit illisible", () => {
    assert.deepEqual(quotaRead(undefined), {});
    assert.deepEqual(quotaRead([]), {});
    const readOne = quotaRead({ limite: "core", utilise: "beaucoup", maximum: 5000, parStationEtProjet: [{ station: "x" }, ...CALLS] }).quotaGithub!;
    assert.equal(readOne.parStationEtProjet.length, 3);
    assert.equal(readOfQuota(readOne).lisible, false);
    assert.equal(quotaRead({ limite: "core", utilise: 4500, maximum: 5000, renouvellement: "2026-11-13T18:00:00Z", parStationEtProjet: [] }).quotaGithub!.utilise, 4500);
  });

  test("l'onglet Stations pose la jauge quand le quota est lu, et pas sans", () => {
    const base = { projet: "parade", poste: "this Mac", lues: true, haut: { etat: "personne", vert: false } as never, servantes: [], deplacable: { offert: false, pourquoi: "" }, details: new Map<string, never[]>(), ouverts: new Set<string>() };
    const actions = {} as never;
    const withIt = setTheTabOfStations(doc, { ...base, quota: quota(90, CALLS) }, actions);
    assert.equal(finds(withIt, "quota-github")!.dataset.ton, "alerte");
    assert.equal(finds(setTheTabOfStations(doc, base, actions), "quota-github"), undefined);
  });
});
