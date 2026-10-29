// La tendance du rapport ajouté / retiré de chaque projet (vue/closer/tendance/tendance.js, #1682) : lue dans des
// sorties de `closing --json` telles que la box les écrit — un objet sur une ligne (runtime/src/fermeture-lecture/lecture.ts).
// Ses trois fenêtres (20, 50, 100 merges) découpent trois tranches qui se suivent : la tendance compare la plus
// récente à la plus ancienne. Une branche trop jeune le dit au lieu d'en inventer une ; un projet sans closer réglé
// n'a pas de ligne. Le module est lu seul, sur un faux document, puis la vue jouée telle qu'elle est (aides/fausse-vue.ts),
// depuis l'accueil.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import type { Lecture } from "../../../src/box.ts";
import { EXEMPLE, type Projet } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../../src/grants.ts";
import { COMMANDE_DES_RATIOS, ONGLETS, RATIOS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projets/projets.ts";
import { BRANCHE_ILLISIBLE, COMMANDE, ILLISIBLE, lireFermeture } from "../../../src/vue/closer/section.js";
import { AUCUN, LECTURE, PEU, poserTendances, rapportDit, SENS, tendance, tranches } from "../../../src/vue/closer/tendance/tendance.js";
import { Faux, jouerLaVue, repos } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const A = "2026-10-26T12:00:00.000Z";

// Une fenêtre du rapport, comme `closing --json` l'écrit (`reads` : runtime/src/closing/ratio.ts).
const fenetre = (window: number, merges: number, added: number, removed: number) => ({
  window,
  merges,
  added,
  removed,
  ratio: removed === 0 ? null : added / removed,
  reads: removed === 0 ? "nothing removed" : `${(added / removed).toLocaleString("en-US", { maximumFractionDigits: 1 })}:1`,
});
type Fenetre = ReturnType<typeof fenetre>;
// La sortie entière de `closing --json`, un closer réglé et la branche lue, sur ces fenêtres.
const sortie = (ratio: Fenetre[]) =>
  JSON.stringify({
    configured: true,
    closer: { model: "sonnet", effort: "medium", cooksBelow: 1, tokens: 500_000, removedLines: 500 },
    observation: { readable: true, ref: "origin/v2", sha: "48638df", lastMerge: A, mergesSinceCleanup: 120, ratio, duplicates: 2, deadExports: 1, codeFiles: 412, modules: 380, skippedFiles: 0 },
    findings: [],
    request: { state: "none" },
    drift: { declared: false, crossed: false, crossings: [] },
  });
const SANS_CLOSER = JSON.stringify({ configured: false, text: "the closer is not set on this project: no closing pass writes, there is nothing to observe for it" });
const ILLISIBLE_LU = JSON.stringify({ configured: true, closer: { model: "sonnet", effort: "medium", cooksBelow: 1, tokens: 500_000, removedLines: 500 }, observation: { readable: false, error: "git log : fatal: bad revision 'origin/v2'", mergesSinceCleanup: 4 }, findings: [], request: { state: "none" }, drift: { declared: false, crossed: false, crossings: [] } });

// Trois échantillons, un par sens. Les 51–100 merges en arrière, les 21–50, puis les 20 derniers :
// 20:1 → 16:1 → 8:1 ; 4:1 → 4.2:1 → 3.9:1 ; 2:1 → 3:1 → 5:1.
const BAISSE = sortie([fenetre(20, 20, 3_200, 400), fenetre(50, 50, 12_800, 1_000), fenetre(100, 100, 24_800, 1_600)]);
const TIENT = sortie([fenetre(20, 20, 3_900, 1_000), fenetre(50, 50, 10_200, 2_500), fenetre(100, 100, 18_200, 4_500)]);
const MONTE = sortie([fenetre(20, 20, 5_000, 1_000), fenetre(50, 50, 11_000, 3_000), fenetre(100, 100, 17_000, 6_000)]);
// Quatorze merges en tout : les trois fenêtres en voient autant — une seule tranche.
const JEUNE = sortie([fenetre(20, 14, 2_100, 300), fenetre(50, 14, 2_100, 300), fenetre(100, 14, 2_100, 300)]);

const lecture = (projet: string, texte: string): Lecture => ({ projet, demande: 0, a: A, sorties: [{ commande: COMMANDE, texte: `${texte}\n` }] });
// Les fenêtres d'un échantillon, lues comme la page les lit.
const fenetresDe = (texte: string) => {
  const lu = lireFermeture(lecture("parade", texte));
  assert.ok("fermeture" in lu && lu.fermeture.configured && lu.fermeture.observation.readable);
  return lu.fermeture.observation.ratio;
};
const poser = (lectures: Map<string, Lecture>, noms = [...lectures.keys()], ouvrir: (nom: string) => void = () => {}) => poserTendances(doc, noms.map((nom) => ({ nom })), lectures, ouvrir) as unknown as Faux;
const lignes = (page: Faux) => page.dessous("li");
const nomDe = (ligne: Faux) => ligne.dessous("button").find(({ className }) => className === "projet")?.textContent;
const sensDe = (ligne: Faux) => ligne.dessous("span").find(({ className }) => className.split(" ").includes("sens"));

describe("les tranches que les fenêtres de `closing --json` découpent", () => {
  test("trois fenêtres pleines : les merges 51–100, 21–50 et les 20 derniers, la plus ancienne d'abord, chacune ce qu'elle a ajouté et retiré", () => {
    assert.deepEqual(tranches(fenetresDe(BAISSE)), [
      { de: 51, a: 100, merges: 50, added: 12_000, removed: 600 },
      { de: 21, a: 50, merges: 30, added: 9_600, removed: 600 },
      { de: 1, a: 20, merges: 20, added: 3_200, removed: 400 },
    ]);
  });

  test("l'ordre où la box écrit les fenêtres ne compte pas ; une fenêtre qui n'a pas trouvé plus de merges n'ouvre pas de tranche", () => {
    const [vingt, cinquante, cent] = fenetresDe(JEUNE);
    assert.deepEqual(tranches([cent!, vingt!, cinquante!]), [{ de: 1, a: 14, merges: 14, added: 2_100, removed: 300 }]);
  });
});

describe("la tendance, d'après des échantillons de `closing --json`", () => {
  test("le rapport des 20 derniers merges plus bas de plus de 10 % que celui des 51–100 : il baisse", () => {
    const lue = tendance(fenetresDe(BAISSE));
    assert.equal(lue.sens, "down");
    assert.deepEqual(lue.valeurs.map(({ valeur }) => valeur), [20, 16, 8]);
  });

  test("à 10 % près, il tient", () => {
    const lue = tendance(fenetresDe(TIENT));
    assert.equal(lue.sens, "flat");
    assert.deepEqual(lue.valeurs.map(({ valeur }) => rapportDit(valeur)), ["4:1", "4.2:1", "3.9:1"]);
  });

  test("plus haut de plus de 10 % : il monte", () => {
    assert.equal(tendance(fenetresDe(MONTE)).sens, "up");
  });

  test("une tranche récente qui n'a rien retiré compte comme le plus haut des rapports : il monte", () => {
    assert.equal(tendance([fenetre(20, 20, 900, 0), fenetre(50, 50, 4_000, 1_000), fenetre(100, 100, 9_000, 2_000)]).sens, "up");
  });

  test("une seule tranche : pas assez de données — et le nombre de merges que la branche a", () => {
    assert.deepEqual(tendance(fenetresDe(JEUNE)), { sens: "not enough data", valeurs: [{ de: 1, a: 14, merges: 14, added: 2_100, removed: 300, valeur: 7 }], merges: 14 });
  });

  test("une tranche de moins de 10 merges ne compte pas : 25 merges, les 20 derniers et cinq avant — pas assez", () => {
    assert.equal(tendance([fenetre(20, 20, 2_000, 400), fenetre(50, 25, 3_000, 450), fenetre(100, 25, 3_000, 450)]).sens, "not enough data");
    // 30 merges : deux tranches de 20 et 10, la tendance se lit.
    assert.equal(tendance([fenetre(20, 20, 2_000, 400), fenetre(50, 30, 4_000, 600), fenetre(100, 30, 4_000, 600)]).sens, "down");
  });

  test("aucun merge, ou aucune fenêtre : pas assez de données", () => {
    assert.equal(tendance([fenetre(20, 0, 0, 0), fenetre(50, 0, 0, 0), fenetre(100, 0, 0, 0)]).sens, "not enough data");
    assert.equal(tendance([]).sens, "not enough data");
  });
});

describe("la page des ratios, posée seule", () => {
  const lus = new Map([
    ["brigade", lecture("brigade", BAISSE)],
    ["parade", lecture("parade", TIENT)],
    ["cantine", lecture("cantine", MONTE)],
    ["atelier", lecture("atelier", JEUNE)],
    ["espace", lecture("espace", SANS_CLOSER)],
  ]);

  test("une ligne par projet qui a un closer réglé, dans l'ordre donné : un projet sans closer n'y est pas", () => {
    assert.deepEqual(lignes(poser(lus)).map(nomDe), ["brigade", "parade", "cantine", "atelier"]);
  });

  test("chaque ligne dit le rapport actuel, celui de la plus longue fenêtre, dans les mots de `closing`, et ce qu'il compte", () => {
    const [brigade] = lignes(poser(lus));
    assert.ok(brigade !== undefined);
    assert.match(brigade.textContent, /15\.5:1\+24,800 \/ −1,600 · last 100 merges/);
  });

  test("puis son sens, et ses valeurs successives, la plus ancienne d'abord", () => {
    const [brigade, parade, cantine] = lignes(poser(lus));
    assert.deepEqual([brigade, parade, cantine].map((ligne) => sensDe(ligne!)?.textContent), [SENS.down, SENS.flat, SENS.up]);
    assert.deepEqual([brigade, parade, cantine].map((ligne) => sensDe(ligne!)?.dataset.sens), ["down", "flat", "up"]);
    assert.equal(brigade!.dessous("span").find(({ className }) => className === "valeurs")?.textContent, "51–100 merges ago: 20:1 · 21–50 merges ago: 16:1 · last 20 merges: 8:1");
  });

  test("une branche trop jeune dit « not enough data », et pourquoi au survol — ni sens, ni valeurs", () => {
    const atelier = lignes(poser(lus)).find((ligne) => nomDe(ligne) === "atelier");
    assert.ok(atelier !== undefined);
    assert.equal(sensDe(atelier)?.textContent, PEU);
    assert.equal(atelier.dessous("span").find(({ className }) => className === "valeurs"), undefined);
    assert.match(atelier.dessous("button").find(({ className }) => className === "aide")?.ariaLabel ?? "", /at least two spans of 10 merges.*14 merges/);
    // Son rapport actuel reste dit.
    assert.match(atelier.textContent, /7:1/);
  });

  test("une branche illisible, ou une lecture ratée : la ligne le dit en une ligne, le détail au survol", () => {
    const page = poser(new Map([["parade", lecture("parade", ILLISIBLE_LU)], ["cantine", { projet: "cantine", demande: 0, a: A, erreur: "connect to host box port 22: Connection refused", atteinte: false, cas: null } as Lecture]]));
    const [parade, cantine] = lignes(page);
    assert.equal(parade?.dessous("p").find(({ className }) => className === "indisponible")?.dessous("span")[0]?.textContent, BRANCHE_ILLISIBLE);
    assert.equal(cantine?.dessous("p").find(({ className }) => className === "indisponible")?.dessous("span")[0]?.textContent, ILLISIBLE);
    assert.doesNotMatch(page.textContent, /fatal/);
  });

  test("rien de lu : « reading… » ; un projet pas encore lu le dit sous les autres", () => {
    assert.equal(poser(new Map(), ["parade"]).dessous("p")[0]?.textContent, LECTURE);
    const page = poser(new Map([["parade", lecture("parade", TIENT)]]), ["parade", "cantine"]);
    assert.deepEqual(lignes(page).map(nomDe), ["parade"]);
    assert.equal(page.dessous("p").find(({ className }) => className === "sans")?.textContent, `${LECTURE} 1 more project`);
  });

  test("tous lus, aucun closer réglé : la page le dit", () => {
    const page = poser(new Map([["espace", lecture("espace", SANS_CLOSER)]]));
    assert.deepEqual(lignes(page), []);
    assert.equal(page.dessous("p")[0]?.firstChild, AUCUN);
  });

  test("un clic sur le nom d'un projet l'ouvre", () => {
    const ouverts: string[] = [];
    const [, parade] = lignes(poser(lus, undefined, (nom) => ouverts.push(nom)));
    parade?.dessous("button").find(({ className }) => className === "projet")?.click();
    assert.deepEqual(ouverts, ["parade"]);
  });
});

describe("la page des ratios, dans la vue jouée", () => {
  const PROJETS: Projet[] = ["brigade", "parade", "espace"].map((nom) => ({ nom, dossier: `/tmp/${nom}` }));

  test("l'accueil l'ouvre ; elle lit `closing --json` pour chaque projet, et ne montre que ceux qui ont un closer", async () => {
    const vue = await jouerLaVue({
      demarrage: () => ({
        configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: PROJETS }, () => true),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS,
        rubriques: RUBRIQUES,
        gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE,
        calibrage: { modeles: MODELES, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
    });
    vue.element("entree-tous").click();
    await repos();
    const ligne = vue.element("tous").dessous("button").find(({ ariaLabel }) => ariaLabel === "the added / removed ratio of all projects");
    assert.ok(ligne !== undefined, "pas de ligne des ratios sur l'accueil");
    ligne.click();
    await repos();

    // La page tient lieu d'onglet : sa lecture part, sans projet, sous son nom — celui que main.ts lit sur chaque box.
    const [projet, id, demande] = vue.dernier("onglet") as [unknown, unknown, number];
    assert.deepEqual([projet, id], [undefined, RATIOS]);
    assert.equal(COMMANDE_DES_RATIOS, COMMANDE);
    const page = vue.element("ratios");
    assert.equal(page.dessous("p").find(({ className }) => className === "sans")?.textContent, LECTURE);

    for (const [nom, texte] of [["brigade", BAISSE], ["parade", MONTE], ["espace", SANS_CLOSER]] as const) vue.dire("surContenu", { ...lecture(nom, texte), demande }, undefined, undefined, undefined);
    await repos();
    assert.deepEqual(lignes(page).map(nomDe), ["brigade", "parade"]);
    assert.deepEqual(lignes(page).map((ligne) => sensDe(ligne)?.dataset.sens), ["down", "up"]);

    // « ‹ All projects » ramène à l'accueil, et la lecture des box s'arrête.
    page.dessous("button").find(({ className }) => className === "retour")?.click();
    await repos();
    assert.notEqual(vue.dernier("onglet")[1], RATIOS);
  });
});
