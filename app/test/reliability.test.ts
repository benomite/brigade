// La dérive de la fiabilité des cooks, dans `status` (#987) : l'app en lit les lignes `drift`, écrites ici par les
// fonctions mêmes du runtime — elle lit ce que la box écrit, pas une copie de sa forme. La vue ne pose plus la
// section de fiabilité (#2921, la page Cooks est supprimée).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { direJaugeEn } from "../../runtime/src/mesures.ts";
import { lineOfProject, type ReadFacts } from "../src/home.ts";
import type { Facts } from "../src/facts.ts";
import { driftOf } from "../src/reliability.ts";
import { POWER_UP } from "../src/power-up.ts";
import { forTheBar } from "../src/bar.ts";
import { EXAMPLE } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNER } from "../src/facts.ts";
import { CONFIRMED, DIRECT } from "../src/actions.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import { playTheVue, repos } from "./helpers/false-vue.ts";

const A = "2026-10-19T10:00:00.000Z";

describe("la dérive, dans `status`, et l'accueil", () => {
  const drift = (line: string) => `${"drift".padEnd(11)}${line} — \`brigade parade measures\``;
  const LOST_DRIFT = drift([{ measure: "gates_s", observed: 150, limit: 100 }, { measure: "tokens_perdus", observed: 842_809, limit: 400_000 }].map(direJaugeEn).join(" · "));
  const COST_ONLY = drift(direJaugeEn({ measure: "tokens_ticket", observed: 1_038_705, limit: 400_000 }));

  test("les tokens perdus au-delà de leur seuil sont la fiabilité ; les autres seuils non", () => {
    assert.deepEqual(driftOf(["project    parade", COST_ONLY, LOST_DRIFT].join("\n")), [
      "tokens lost over the last 10 merges 842,809 for a threshold of 400,000",
    ]);
    assert.deepEqual(driftOf(["project    parade", COST_ONLY].join("\n")), []);
  });

  const FACTS: Facts = { etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [] };
  const readOnes: ReadFacts = { a: A, faits: FACTS };
  const PROJECT = { nom: "parade", servi: true };

  test("la ligne d'un projet dont la fiabilité a dérivé le dit d'un mot, et le détail au survol ; sa pastille ne change pas", () => {
    const line = lineOfProject(PROJECT, readOnes, { texte: ["project    parade", LOST_DRIFT].join("\n") });
    assert.equal(line.dit, "nothing cooking, nothing waits for you · drifting");
    assert.equal(line.ton, "vert");
    assert.match(line.survol, /reliability drifting: tokens lost over the last 10 merges 842,809 for a threshold of 400,000/);
    assert.doesNotMatch(line.survol, /`/);
  });

  test("sans dérive, ou sans `status` lu, rien n'est dit", () => {
    assert.equal(lineOfProject(PROJECT, readOnes, { texte: ["project    parade", COST_ONLY].join("\n") }).dit, "nothing cooking, nothing waits for you");
    assert.equal(lineOfProject(PROJECT, readOnes, undefined).dit, "nothing cooking, nothing waits for you");
  });
});

describe("la fiabilité des cooks n'est plus une page de Settings ni de la vue (#1699, #2921)", () => {
  test("Settings n'a plus de page Reliability : ni sous-pages (#1700), ni section de fiabilité", async () => {
    const vue = await playTheVue({
      demarrage: () => ({
        configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
        palette: PALETTE,
        exemple: EXAMPLE,
        onglets: TABS,
        rubriques: HEADINGS,
        gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
        banniere: BANNER,
        calibrage: { modeles: MODELS, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
    });
    (vue.element("projets").children.at(1) ?? assert.fail("pas de case parade")).click();
    await repos();
    (vue.element("onglets-du-projet").children.find(({ textContent }) => textContent === "Settings") ?? assert.fail("pas d'onglet Settings")).click();
    await repos();
    assert.throws(() => vue.element("parametres-onglets"), /aucun élément « parametres-onglets »/);
    assert.ok(!vue.element("etat").dessous("button").some(({ textContent }) => textContent === "Reliability"));
    // La vue ne pose plus de section de fiabilité : ni sur Settings, ni sur aucun autre onglet.
    assert.throws(() => vue.element("fiabilite-du-projet"), /aucun élément « fiabilite-du-projet »/);
  });
});
