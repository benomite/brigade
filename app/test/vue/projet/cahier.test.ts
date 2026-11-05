// Kitchen > Cooks (#2493) : le cahier de leçons du projet, en lecture seule, entrée par entrée, et sa ligne quand il est vide.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { poserBlocCahier, VIDE } from "../../../src/vue/projet/cuisine/cuisiniers/Cahier.js";
import { Faux } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const progres = { avant: null, apres: null };
const lecon = (id: string, texte: string, statut: "provisoire" | "promue", date = "2026-10-01") => ({
  id,
  texte,
  statut,
  date,
  tickets: [12],
  origine: { kind: "retro" as const },
  cooks: 2,
  progres,
});
const parClasse = (racine: Faux, classe: string) => [...racine.descendants()].filter((pose) => pose.className.split(" ").includes(classe));

describe("le cahier de leçons, sur Cooks", () => {
  test("rempli : chaque leçon promue est une entrée, avec son identifiant, son texte et son jour — rien ne se clique", () => {
    const bloc = poserBlocCahier(doc, [
      lecon("L-1", "Run the app tests, not the whole suite", "promue"),
      lecon("L-2", "Still provisional", "provisoire"),
      lecon("L-3", "Keep the zone", "promue", "2026-10-15"),
    ]) as unknown as Faux;
    assert.equal(bloc.dataset.bloc, "cahier");
    const entrees = parClasse(bloc, "cahier-entree");
    assert.equal(entrees.length, 2);
    assert.deepEqual(entrees.map((e) => parClasse(e, "id")[0]?.textContent), ["L-1", "L-3"]);
    assert.equal(parClasse(entrees[0]!, "texte")[0]?.textContent, "Run the app tests, not the whole suite");
    assert.equal(parClasse(entrees[1]!, "depuis")[0]?.textContent, "since 10/15/2026");
    assert.equal(parClasse(bloc, "cahier-vide").length, 0);
    assert.equal([...bloc.descendants()].filter((pose) => pose.balise === "button").length, 0);
  });

  test("vide, sans leçon promue ou faits non lus : une ligne le dit, jamais une zone blanche", () => {
    for (const lecons of [[], [lecon("L-2", "Still provisional", "provisoire")], undefined]) {
      const bloc = poserBlocCahier(doc, lecons) as unknown as Faux;
      assert.deepEqual(parClasse(bloc, "cahier-vide").map((p) => p.textContent), [VIDE]);
      assert.equal(parClasse(bloc, "cahier-entree").length, 0);
    }
  });
});
