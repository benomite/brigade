// La part du quota Max d'un ticket (#3254, vue/cost/part.js et chers.js) : son pourcentage au dixième à côté de ses
// tokens, deux modèles de poids différents, la semaine en cours qui laisse de côté un ticket d'avant son début,
// et la ligne unique quand le quota ne se lit pas.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { lireConfiguration } from "../../src/config.ts";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { coutDeLaSemaine, plusChers, poserChers } from "../../src/vue/cost/chers.js";
import { debutDeSemaine, INDISPONIBLE, partDite, quotaLu } from "../../src/vue/cost/part.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const PARADE = { nom: "parade" };
// Mercredi 2026-11-11 : sa semaine de lundi 0 h UTC commence le 2026-11-09.
const MAINTENANT = new Date("2026-11-11T12:00:00.000Z");
const QUOTA = { tokens: 10_000_000, poids: { opus: 5 } };

const cook = (ticket: number, fin: string, modele: string, tokens: number) =>
  `  ${fin}  #${ticket}  r-${ticket}  ${modele} / medium  done  3 turns · ${tokens.toLocaleString("en-US")} tokens · 1.5 min`;
const lectures = (...cooks: string[]) =>
  new Map<string, any>([["parade", { projet: "parade", demande: 0, a: "x", sorties: [{ commande: "station", texte: ["station  x", "latest cooks          ", ...cooks, "consumed  nothing"].join("\n") }] }]]);
const bloc = (l: Map<string, any>, quota?: unknown) => poserChers(doc, [PARADE], l, () => "titre", () => {}, quota, MAINTENANT);
const textes = (b: Faux, balise: string, classe: string) => b.dessous(balise).filter((e: Faux) => e.className === classe).map((e: Faux) => e.textContent);

describe("la part du quota d'un ticket", () => {
  test("quota 10 000 000, un modèle de poids 1, 200 000 tokens : « 2.0% » à côté de « 200,000 »", () => {
    const b = bloc(lectures(cook(7, "2026-11-10T09:00:00.000Z", "sonnet", 200_000)), QUOTA);
    const ligne = b.dessous("button")[0] as Faux;
    assert.deepEqual(ligne.dessous("span").map((s: Faux) => s.textContent).slice(1), ["#7", "titre", "200,000", "2.0%", "1 attempt"]);
  });

  test("deux modèles de poids différents : 100 000 à 1.0 et 100 000 à 5.0 donnent 6.0%", () => {
    const l = lectures(cook(7, "2026-11-10T09:00:00.000Z", "sonnet", 100_000), cook(7, "2026-11-10T10:00:00.000Z", "opus", 100_000));
    assert.deepEqual(textes(bloc(l, QUOTA), "span", "part"), ["6.0%"]);
    assert.equal(plusChers([PARADE], l, quotaLu(QUOTA))[0]?.ponderes, 600_000);
  });

  test("un modèle sans poids pèse 1 et a sa part, sans message d'indisponibilité", () => {
    const b = bloc(lectures(cook(7, "2026-11-10T09:00:00.000Z", "haiku", 200_000)), QUOTA);
    assert.deepEqual(textes(b, "span", "part"), ["2.0%"]);
    assert.deepEqual(textes(b, "p", "part-indisponible"), []);
  });

  test("la part arrondit au dixième", () => {
    assert.equal(partDite(quotaLu(QUOTA), 123_456), "1.2%");
    assert.equal(partDite(quotaLu(QUOTA), 0), "0.0%");
  });
});

describe("le coût de la semaine en cours", () => {
  test("la semaine commence au lundi 0 h UTC par défaut, ou au jour et à l'heure du réglage", () => {
    assert.equal(new Date(debutDeSemaine(quotaLu(QUOTA), MAINTENANT)).toISOString(), "2026-11-09T00:00:00.000Z");
    assert.equal(new Date(debutDeSemaine(quotaLu({ tokens: 1, semaine: { jour: "wednesday", heure: 18 } }), MAINTENANT)).toISOString(), "2026-11-04T18:00:00.000Z");
  });

  test("somme pondérée des tickets de la semaine ; un ticket servi avant son début est exclu", () => {
    const l = lectures(
      cook(7, "2026-11-10T09:00:00.000Z", "sonnet", 200_000),
      cook(8, "2026-11-11T09:00:00.000Z", "opus", 100_000),
      cook(9, "2026-11-08T23:59:59.000Z", "sonnet", 5_000_000),
    );
    assert.deepEqual(coutDeLaSemaine([PARADE], l, quotaLu(QUOTA), MAINTENANT), { ponderes: 700_000, minimum: false });
    assert.deepEqual(textes(bloc(l, QUOTA), "p", "part-semaine"), ["this week, all projects: 7.0% of the weekly quota"]);
  });

  test("un cook de la semaine sans tokens rend la somme « ≥ »", () => {
    const l = lectures(cook(7, "2026-11-10T09:00:00.000Z", "sonnet", 200_000), "  2026-11-10T10:00:00.000Z  #8  r-8  sonnet / medium  interrupted (runtime stopped)");
    assert.deepEqual(textes(bloc(l, QUOTA), "p", "part-semaine"), ["this week, all projects: ≥ 2.0% of the weekly quota"]);
  });
});

describe("quand le quota ne se lit pas", () => {
  for (const [dit, quota] of [["absent", undefined], ["zéro", { tokens: 0 }], ["invalide", { tokens: "beaucoup" }], ["négatif", { tokens: -5 }], ["pas un objet", 12]] as const) {
    test(`quota ${dit} : une seule ligne, les tokens restent, ni part de ticket ni part de la semaine`, () => {
      const b = bloc(lectures(cook(7, "2026-11-10T09:00:00.000Z", "sonnet", 200_000)), quota);
      assert.deepEqual(textes(b, "p", "part-indisponible"), [INDISPONIBLE]);
      assert.equal(INDISPONIBLE, "Share unavailable: weekly quota is not configured.");
      assert.deepEqual(textes(b, "p", "part-semaine"), []);
      assert.deepEqual(textes(b, "span", "part"), []);
      assert.deepEqual(textes(b, "span", "tokens"), ["200,000"]);
      assert.equal(partDite(quotaLu(quota), 200_000), null);
    });
  }

  test("sans ticket à lister, la ligne se dit encore", () => {
    assert.deepEqual(textes(bloc(lectures(), undefined), "p", "part-indisponible"), [INDISPONIBLE]);
  });
});

describe("le réglage `quotaMax` du fichier des projets", () => {
  const lire = (contenu: unknown) => {
    const chemin = join(mkdtempSync(join(tmpdir(), "quota-")), "app.json");
    writeFileSync(chemin, JSON.stringify(contenu));
    return lireConfiguration(chemin);
  };
  test("il arrive tel quel à la vue, et sa lecture donne le quota, la semaine et les poids", () => {
    const { quotaMax, refus } = lire({ projets: [], quotaMax: { tokens: 10_000_000, semaine: { jour: "friday", heure: 6 }, poids: { opus: 5, sonnet: "x" } } });
    assert.equal(refus, undefined);
    const quota = quotaLu(quotaMax);
    assert.deepEqual([quota.tokens, quota.jour, quota.heure, [...quota.poids]], [10_000_000, 5, 6, [["opus", 5]]]);
  });
  test("absent, il laisse le fichier lu et la vue sans part", () => {
    const lue = lire({ projets: [] });
    assert.equal(lue.refus, undefined);
    assert.equal(quotaLu(lue.quotaMax).tokens, null);
  });
});
