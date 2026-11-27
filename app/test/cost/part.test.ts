// La part du quota Max d'un ticket (#3254, vue/cost/part.js et expensive.js) : son pourcentage au dixième à côté de ses
// tokens, deux modèles de poids différents, la semaine en cours qui laisse de côté un ticket d'avant son début,
// et la ligne unique quand le quota ne se lit pas.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readConfiguration } from "../../src/config.ts";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { costOfTheWeek, moreExpensive, setExpensive } from "../../src/vue/cost/expensive.js";
import { startOfWeek, UNAVAILABLE, partSaid, quotaRead } from "../../src/vue/cost/part.js";
import { Fake } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const PARADE = { nom: "parade" };
// Mercredi 2026-11-11 : sa semaine de lundi 0 h UTC commence le 2026-11-09.
const NOW = new Date("2026-11-11T12:00:00.000Z");
const QUOTA = { tokens: 10_000_000, poids: { opus: 5 } };

const cook = (ticket: number, end: string, model: string, tokens: number) =>
  `  ${end}  #${ticket}  r-${ticket}  ${model} / medium  done  3 turns · ${tokens.toLocaleString("en-US")} tokens · 1.5 min`;
const readings = (...cooks: string[]) =>
  new Map<string, any>([["parade", { projet: "parade", demande: 0, a: "x", sorties: [{ commande: "station", texte: ["station  x", "latest cooks          ", ...cooks, "consumed  nothing"].join("\n") }] }]]);
const block = (l: Map<string, any>, quota?: unknown) => setExpensive(doc, [PARADE], l, () => "titre", () => {}, quota, NOW);
const texts = (b: Fake, balise: string, classe: string) => b.dessous(balise).filter((e: Fake) => e.className === classe).map((e: Fake) => e.textContent);

describe("la part du quota d'un ticket", () => {
  test("quota 10 000 000, un modèle de poids 1, 200 000 tokens : « 2.0% » à côté de « 200,000 »", () => {
    const b = block(readings(cook(7, "2026-11-10T09:00:00.000Z", "sonnet", 200_000)), QUOTA);
    const line = b.dessous("button")[0] as Fake;
    assert.deepEqual(line.dessous("span").map((s: Fake) => s.textContent).slice(1), ["#7", "titre", "200,000", "2.0%", "1 attempt"]);
  });

  test("deux modèles de poids différents : 100 000 à 1.0 et 100 000 à 5.0 donnent 6.0%", () => {
    const l = readings(cook(7, "2026-11-10T09:00:00.000Z", "sonnet", 100_000), cook(7, "2026-11-10T10:00:00.000Z", "opus", 100_000));
    assert.deepEqual(texts(block(l, QUOTA), "span", "part"), ["6.0%"]);
    assert.equal(moreExpensive([PARADE], l, quotaRead(QUOTA))[0]?.ponderes, 600_000);
  });

  test("un modèle sans poids pèse 1 et a sa part, sans message d'indisponibilité", () => {
    const b = block(readings(cook(7, "2026-11-10T09:00:00.000Z", "haiku", 200_000)), QUOTA);
    assert.deepEqual(texts(b, "span", "part"), ["2.0%"]);
    assert.deepEqual(texts(b, "p", "part-indisponible"), []);
  });

  test("la part arrondit au dixième", () => {
    assert.equal(partSaid(quotaRead(QUOTA), 123_456), "1.2%");
    assert.equal(partSaid(quotaRead(QUOTA), 0), "0.0%");
  });
});

describe("le coût de la semaine en cours", () => {
  test("la semaine commence au lundi 0 h UTC par défaut, ou au jour et à l'heure du réglage", () => {
    assert.equal(new Date(startOfWeek(quotaRead(QUOTA), NOW)).toISOString(), "2026-11-09T00:00:00.000Z");
    assert.equal(new Date(startOfWeek(quotaRead({ tokens: 1, semaine: { jour: "wednesday", heure: 18 } }), NOW)).toISOString(), "2026-11-04T18:00:00.000Z");
  });

  test("somme pondérée des tickets de la semaine ; un ticket servi avant son début est exclu", () => {
    const l = readings(
      cook(7, "2026-11-10T09:00:00.000Z", "sonnet", 200_000),
      cook(8, "2026-11-11T09:00:00.000Z", "opus", 100_000),
      cook(9, "2026-11-08T23:59:59.000Z", "sonnet", 5_000_000),
    );
    assert.deepEqual(costOfTheWeek([PARADE], l, quotaRead(QUOTA), NOW), { ponderes: 700_000, minimum: false });
    assert.deepEqual(texts(block(l, QUOTA), "p", "part-semaine"), ["this week, all projects: 7.0% of the weekly quota"]);
  });

  test("un cook de la semaine sans tokens rend la somme « ≥ »", () => {
    const l = readings(cook(7, "2026-11-10T09:00:00.000Z", "sonnet", 200_000), "  2026-11-10T10:00:00.000Z  #8  r-8  sonnet / medium  interrupted (runtime stopped)");
    assert.deepEqual(texts(block(l, QUOTA), "p", "part-semaine"), ["this week, all projects: ≥ 2.0% of the weekly quota"]);
  });
});

describe("quand le quota ne se lit pas", () => {
  for (const [said, quota] of [["absent", undefined], ["zéro", { tokens: 0 }], ["invalide", { tokens: "beaucoup" }], ["négatif", { tokens: -5 }], ["pas un objet", 12]] as const) {
    test(`quota ${said} : une seule ligne, les tokens restent, ni part de ticket ni part de la semaine`, () => {
      const b = block(readings(cook(7, "2026-11-10T09:00:00.000Z", "sonnet", 200_000)), quota);
      assert.deepEqual(texts(b, "p", "part-indisponible"), [UNAVAILABLE]);
      assert.equal(UNAVAILABLE, "No share: the weekly quota is not configured.");
      assert.deepEqual(texts(b, "p", "part-semaine"), []);
      assert.deepEqual(texts(b, "span", "part"), []);
      assert.deepEqual(texts(b, "span", "tokens"), ["200,000"]);
      assert.equal(partSaid(quotaRead(quota), 200_000), null);
    });
  }

  test("sans ticket à lister, la ligne se dit encore", () => {
    assert.deepEqual(texts(block(readings(), undefined), "p", "part-indisponible"), [UNAVAILABLE]);
  });
});

describe("le réglage `quotaMax` du fichier des projets", () => {
  const read = (content: unknown) => {
    const path = join(mkdtempSync(join(tmpdir(), "quota-")), "app.json");
    writeFileSync(path, JSON.stringify(content));
    return readConfiguration(path);
  };
  test("il arrive tel quel à la vue, et sa lecture donne le quota, la semaine et les poids", () => {
    const { quotaMax, refus: refusal } = read({ projets: [], quotaMax: { tokens: 10_000_000, semaine: { jour: "friday", heure: 6 }, poids: { opus: 5, sonnet: "x" } } });
    assert.equal(refusal, undefined);
    const quota = quotaRead(quotaMax);
    assert.deepEqual([quota.tokens, quota.jour, quota.heure, [...quota.poids]], [10_000_000, 5, 6, [["opus", 5]]]);
  });
  test("absent, il laisse le fichier lu et la vue sans part", () => {
    const readEntry = read({ projets: [] });
    assert.equal(readEntry.refus, undefined);
    assert.equal(quotaRead(readEntry.quotaMax).tokens, null);
  });
});

describe("tant qu'un projet n'est pas lu", () => {
  test("la semaine n'est pas dite : « 0.0% » dirait ce qu'on n'a pas lu", () => {
    assert.deepEqual(texts(block(new Map(), QUOTA), "p", "part-semaine"), []);
  });
});
