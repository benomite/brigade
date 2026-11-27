// Le temps de la pass sur 7 jours (#3512), dans la section de Settings du projet, à côté de ses chiffres d'autonomie :
// tel que la station le publie (`passe`, runtime/src/temps-ticket/passe.ts), jamais recalculé. Le bloc est joué avec le
// faux élément de l'app ; la vue entière, contre le faux pont (aides/fausse-vue.ts), une station qui le publie.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Accueil } from "../../../src/accueil.ts";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { calibrageRecommande, EFFORTS, machineProposee, MODELES, type ProjetVu, type VuDesProjets } from "../../../src/projets/projets.ts";
import type { Panne } from "../../../src/pannes/pannes.ts";
import type { VuDesStations } from "../../../src/stations/stations.ts";
import { poserBlocTempsDeLaPasse } from "../../../src/vue/projet/bandeau-sante/TempsDeLaPasse.js";
import { Faux, jouerLaVue, ouvrirLecture, repos } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };

const part = (cle: string, nom: string, livraisons: number, medianeS: number | null, p75S: number | null, totalS: number) => ({ cle, nom, livraisons, medianeS, p75S, totalS, partPct: null });
const PASSE = {
  jours: 7,
  livraisons: 12,
  parts: [
    part("attente", "waiting for the pass", 12, 120, 300, 2400),
    part("gates", "gates", 12, 0, 0, 0),
    part("revue", "review", 12, 240, 420, 3600),
    part("ci", "CI", 12, 1500, 1800, 19_800),
    part("merge", "merge", 12, 10, 20, 150),
    part("ciAttente", "CI waiting for runners", 9, 1200, 1680, 16_200),
    part("ciCourse", "CI running", 9, 420, 540, 4000),
  ],
  phaseLaPlusLourde: { nom: "CI", totalS: 19_800 },
  partLaPlusLourde: { nom: "CI waiting for runners", partPct: 62 },
  relancees: 4,
  renvoyees: 2,
  passesRenvoyeesS: 1500,
};
const TEMPS = { enregistrements: [], lostTimeMaxMin: 2, passe: PASSE };

const parClasse = (racine: Faux, classe: string) => [...racine.descendants()].filter((pose) => pose.className.split(" ").includes(classe));
const texteDe = (racine: Faux, classe: string) => parClasse(racine, classe).map(({ textContent }) => textContent);
// Chaque rangée : son nom, puis ce qu'elle dit.
const rangees = (bloc: Faux) => bloc.dessous("li").map((li) => [texteDe(li, "nom")[0], texteDe(li, "valeur")[0]]);

describe("le temps de la pass, dans Settings", () => {
  test("en une ligne, la part qui pèse le plus sur le temps de pass de la semaine ; chaque phase et chaque part de la CI, sa médiane et son p75", () => {
    const bloc = poserBlocTempsDeLaPasse(doc, TEMPS);
    assert.equal(bloc.dataset.bloc, "temps-de-la-passe");
    assert.deepEqual(texteDe(bloc, "plus-lourde"), ["CI waiting for runners: 62% of pass time · last 7 days, 12 deliveries, each of their passes counted"]);
    assert.deepEqual(rangees(bloc), [
      ["Waiting for the pass", "median 2 min · p75 5 min"],
      ["Gates", "none"],
      ["Review", "median 4 min · p75 7 min"],
      ["CI", "median 25 min · p75 30 min"],
      ["Merge", "median 10 s · p75 20 s"],
      ["CI waiting for runners", "median 20 min · p75 28 min"],
      ["CI running", "median 7 min · p75 9 min"],
    ]);
    assert.deepEqual(texteDe(bloc, "note"), ["Heaviest stage in total: CI, 5 h 30 min.", "CI runs restarted because the branch moved: 4.", "Sent back: 2 deliveries, 25 min in the passes sent back."]);
  });

  test("une mesure qui manque se dit « no measure yet », jamais zéro", () => {
    const sansCi = { ...PASSE, parts: PASSE.parts.map((p) => (p.cle === "ciAttente" || p.cle === "ciCourse" ? { ...p, livraisons: 0, medianeS: null, p75S: null, totalS: 0 } : p)), relancees: null, renvoyees: 0 };
    const bloc = poserBlocTempsDeLaPasse(doc, { ...TEMPS, passe: sansCi });
    assert.deepEqual(rangees(bloc).slice(5), [
      ["CI waiting for runners", "No measure yet."],
      ["CI running", "No measure yet."],
    ]);
    assert.deepEqual(texteDe(bloc, "note").slice(1), ["CI runs restarted because the branch moved: no measure yet.", "No delivery sent back."]);
    assert.doesNotMatch(bloc.textContent, /median 0|moved: 0/);
  });

  test("sans temps de la pass publié ou lisible : « no measure yet », aucune phase ni aucun zéro — le même temps lisible les pose", () => {
    // Le témoin : le temps de la pass lisible pose ses phases — sans lui, ce test ne prouverait rien.
    assert.equal(rangees(poserBlocTempsDeLaPasse(doc, TEMPS)).length, 7);
    for (const temps of [undefined, { enregistrements: [] }, { passe: null }, { passe: { ...PASSE, livraisons: 0 } }, { passe: { ...PASSE, partLaPlusLourde: null } }, { passe: "x" }]) {
      const bloc = poserBlocTempsDeLaPasse(doc, temps);
      assert.deepEqual(texteDe(bloc, "sans-mesure"), ["No measure yet. No delivery merged in the last 7 days has its pass measured."], JSON.stringify(temps));
      assert.deepEqual(rangees(bloc), []);
      assert.doesNotMatch(bloc.textContent, /\b0\b/);
    }
  });
});

describe("dans la vue, ce que la station publie", () => {
  const A = "2026-10-22T12:00:00.000Z";
  const BOX = { id: "g1", nom: "box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [] as Panne[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
  const ACCUEIL: Accueil = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
  const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };
  const projets = (temps: object): VuDesProjets => {
    const projet = {
      nom: "parade",
      depot: "benomite/parade",
      base: "main",
      suiviPar: { id: "g1", nom: "box" },
      stations: [{ id: "g1", nom: "box", etat: "en-preparation", dit: "", autoriser: [] }],
      servi: null,
      cuitSur: { id: "g1", nom: "box", ici: false },
      temps,
    } as ProjetVu;
    return { a: A, projets: [projet], recommandee: "g1", avertissements: {}, machines: { g1: machineProposee(BOX) }, calibrage: calibrageRecommande([]) };
  };
  const demarrage = () => ({
    configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE] }),
    palette: PALETTE,
    exemple: EXEMPLE,
    onglets: ONGLETS,
    rubriques: RUBRIQUES,
    gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
    banniere: BANNIERE,
    calibrage: { modeles: MODELES, efforts: EFFORTS },
    code: undefined,
    stations: { a: A, stations: [BOX] } satisfies VuDesStations,
    accueil: ACCUEIL,
    projetsDesStations: projets(TEMPS),
  });

  test("le temps de la pass que la station publie se lit dans Settings, avant les chiffres d'autonomie", async () => {
    const vue = await jouerLaVue({ demarrage, espace: () => [], autoriserSurGitHub: () => true });
    (vue.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
    await repos();
    await ouvrirLecture(vue, "Settings");
    const blocs = vue.element("bandeau-sante").children;
    const bloc = blocs.find(({ dataset }) => dataset.bloc === "temps-de-la-passe") ?? assert.fail("pas de temps de la pass");
    assert.equal(blocs[blocs.indexOf(bloc) + 1]?.dataset.bloc, "chiffres-autonomie");
    assert.deepEqual(texteDe(bloc, "plus-lourde").map((t) => t.split(" · ")[0]), ["CI waiting for runners: 62% of pass time"]);
    assert.equal(rangees(bloc).length, 7);
  });
});
