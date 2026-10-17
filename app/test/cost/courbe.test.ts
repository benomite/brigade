// La courbe de l'onglet Cost (vue/cost/courbe.js, #909) : sous les trois chiffres de tête, les tokens
// lancés chaque jour, une série par projet, une légende qui nomme chaque projet, et « not
// communicated » à la place du tracé quand la box ne donne pas la série. Le module est lu seul,
// puis la vue jouée telle qu'elle est (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { EFFORTS, MODELES } from "../../src/installation.ts";
import { GESTES_DU_MANAGER } from "../../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { JOURS, joursDe, poserCourbe, series, TITRE } from "../../src/vue/cost/courbe.js";
import { fenetresDe, LECTURE, NON_COMMUNIQUE } from "../../src/vue/cost/tete.js";
import { Faux, type Jouee, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise), createElementNS: (_espace: string, balise: string) => new Faux(balise) };
const A = "2026-10-17T10:00:00.000Z";
// Un nombre tel que le runtime l'écrit (fr-FR) : séparé d'espaces fines insécables.
const n = (chiffres: string) => chiffres.replaceAll(" ", " ");

// Ce que `station` rend aujourd'hui (runtime/src/montrer-station.ts) : le bloc `consommé`, en cours, 5 h
// et 24 h — et, quand la box communique ses jours, une ligne par jour dans le même bloc.
const station = (jours: string[] = []) =>
  [
    "station               box/claude — moteur claude, fournit : claude",
    "cooks en cours        aucun",
    `consommé              en cours : 1 lancement · 4 tours · ${n("12 000")} tokens`,
    `                      5 h : 1 lancement · 3 tours · ${n("320 000")} tokens`,
    "                      24 h : rien",
    ...jours.map((jour) => `                      ${jour}`),
    "                      ce que ce projet a lancé, pas la consommation du compte : /usage la donne",
    "décisions du chef     `station -- <geste> <valeur>` pour en poser une",
    "  seuil-ticket        non posée — 2026-10-01 : 9 tokens n'est pas un jour du bloc",
  ].join("\n");
const lu = (projet: string, texte: string) => ({ projet, demande: 0, a: A, sorties: [{ commande: "station", texte }] });
const injoignable = (projet: string) => ({ projet, demande: 0, a: A, erreur: "ssh: connect to host box port 22: Connection refused", atteinte: false, cas: "ssh-en-echec" });

const PARADE_JOURS = station([`2026-10-14 : 6 lancements · 214 tours · ${n("1 284 530")} tokens`, "2026-10-15 : rien", `2026-10-16 : 19 lancements, dont 5 relectures · 802 tours · ${n("4 912 044")} tokens`]);
const CANTINE_JOURS = station([`2026-10-15 : 1 lancement · 1 tour · 1 token`, `2026-10-16 : 2 lancements · 61 tours · ${n("318 772")} tokens`]);

describe("ce que `station` dit de chaque jour", () => {
  test("une ligne par jour du bloc `consommé`, par date — « rien » vaut zéro, un token seul se lit", () => {
    assert.deepEqual([...joursDe(PARADE_JOURS)], [
      ["2026-10-14", 1_284_530],
      ["2026-10-15", 0],
      ["2026-10-16", 4_912_044],
    ]);
    assert.deepEqual([...joursDe(CANTINE_JOURS)], [
      ["2026-10-15", 1],
      ["2026-10-16", 318_772],
    ]);
  });

  test("ni les fenêtres, ni ce qui suit le bloc ne sont des jours — et les jours ne sont pas des fenêtres", () => {
    assert.equal(joursDe(station()).size, 0);
    assert.deepEqual([...fenetresDe(PARADE_JOURS)], [
      [5, 320_000],
      [24, 0],
    ]);
  });
});

describe("les séries par projet", () => {
  const projets = [{ nom: "parade", teinte: "#f2994a" }, { nom: "cantine" }];

  test("une série par projet, alignées sur les mêmes jours, du plus ancien au plus récent ; un jour qu'un projet ne dit pas est un trou", () => {
    assert.deepEqual(series(projets, new Map([["cantine", lu("cantine", CANTINE_JOURS)], ["parade", lu("parade", PARADE_JOURS)]])), {
      jours: ["2026-10-14", "2026-10-15", "2026-10-16"],
      series: [
        { projet: { nom: "parade", teinte: "#f2994a" }, points: [1_284_530, 0, 4_912_044] },
        { projet: { nom: "cantine" }, points: [null, 1, 318_772] },
      ],
    });
  });

  test("une box qui ne dit pas ses jours, ou injoignable, ne communique pas sa série ; une box pas encore lue est en lecture", () => {
    const lues = new Map<string, unknown>([["parade", lu("parade", station())], ["cantine", injoignable("cantine")]]);
    assert.deepEqual(series(projets, lues as never), { jours: [], series: [{ projet: projets[0], points: null }, { projet: projets[1], points: null }] });
    assert.deepEqual(series(projets, new Map([["parade", lu("parade", PARADE_JOURS)]])).series.map(({ points }) => points), [[1_284_530, 0, 4_912_044], undefined]);
  });

  test(`les ${JOURS} derniers jours, au plus`, () => {
    const jours = Array.from({ length: 20 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")} : ${i + 1} tokens`);
    const { jours: montres, series: [parade] } = series([{ nom: "parade" }], new Map([["parade", lu("parade", station(jours))]]));
    assert.equal(montres.length, JOURS);
    assert.equal(montres[0], "2026-09-07");
    assert.equal(montres.at(-1), "2026-09-20");
    assert.deepEqual(parade?.points?.slice(0, 2), [7, 8]);
  });
});

describe("la courbe posée", () => {
  const projets = [{ nom: "parade", teinte: "#f2994a" }, { nom: "cantine" }];
  const poser = (lectures: Map<string, unknown>) => poserCourbe(doc, projets, lectures as never) as Faux;
  const legende = (pose: Faux) => pose.dessous("li").map((ligne) => ligne.children.slice(1).map(({ textContent }) => textContent));

  test("un titre court, une ligne par projet dans le tracé, à la teinte de sa pastille, et une légende qui nomme chacun", () => {
    const pose = poser(new Map([["parade", lu("parade", PARADE_JOURS)], ["cantine", lu("cantine", CANTINE_JOURS)]]));
    assert.equal(pose.dessous("h2")[0]?.textContent, TITRE);
    const [svg] = pose.dessous("svg");
    assert.ok(svg !== undefined);
    // Deux tracés par série : sa ligne et ses points.
    const traces = svg.dessous("path");
    assert.equal(traces.length, 4);
    assert.equal(traces[0]?.style.getPropertyValue("--teinte"), "#f2994a");
    // parade : trois jours dits, d'un seul tenant, le plus haut au sommet ; cantine commence au deuxième jour.
    // Le repère fait 1000 × 100 ; le plus haut, 4 912 044, en touche le haut.
    const y = (tokens: number) => 100 - (tokens / 4_912_044) * 100;
    assert.equal(traces[0]?.getAttribute("d"), `M0 ${y(1_284_530)}L500 100L1000 0`);
    assert.equal(traces[1]?.getAttribute("d"), `M0 ${y(1_284_530)}h0M500 100h0M1000 0h0`);
    assert.equal(traces[2]?.getAttribute("d"), `M500 ${y(1)}L1000 ${y(318_772)}`);
    assert.deepEqual(pose.dessous("span").filter(({ className }) => className === "haut").map(({ textContent }) => textContent), ["4.9M"]);
    // Chaque jour sous son point.
    const jours = pose.dessous("div").find(({ className }) => className === "jours")?.children ?? [];
    assert.deepEqual(jours.map(({ textContent }) => textContent), ["Oct 14", "Oct 15", "Oct 16"]);
    assert.deepEqual(jours.map(({ style }) => style.getPropertyValue("left")), ["0%", "50%", "100%"]);
    assert.deepEqual(legende(pose), [["parade"], ["cantine"]]);
    assert.equal(pose.dessous("li")[0]?.children[0]?.style.getPropertyValue("--teinte"), "#f2994a");
    // Ce que chaque projet a lancé un jour se lit au survol de sa colonne, pas à plat.
    assert.deepEqual(svg.dessous("title").map(({ textContent }) => textContent), ["Oct 14 — parade 1,284,530 · cantine not communicated", "Oct 15 — parade 0 · cantine 1", "Oct 16 — parade 4,912,044 · cantine 318,772"]);
  });

  test("un trou coupe la ligne ; un jour seul entre deux trous reste un point", () => {
    const pose = poser(new Map([["parade", lu("parade", station(["2026-10-12 : 10 tokens", "2026-10-14 : 20 tokens", "2026-10-15 : 20 tokens"]))], ["cantine", lu("cantine", station(["2026-10-13 : 20 tokens"]))]]));
    const [ligne, points, ligneCantine, pointsCantine] = pose.dessous("path");
    assert.equal(ligne?.getAttribute("d"), "M666.6666666666666 0L1000 0");
    assert.equal(points?.getAttribute("d"), "M0 50h0M666.6666666666666 0h0M1000 0h0");
    assert.equal(ligneCantine?.getAttribute("d"), "");
    assert.equal(pointsCantine?.getAttribute("d"), "M333.3333333333333 0h0");
  });

  test("une série que la box ne communique pas : le tracé reste celui des autres, la légende le dit sous le nom", () => {
    const pose = poser(new Map<string, unknown>([["parade", lu("parade", PARADE_JOURS)], ["cantine", injoignable("cantine")]]));
    assert.equal(pose.dessous("path").length, 2);
    assert.deepEqual(legende(pose), [["parade"], ["cantine", NON_COMMUNIQUE]]);
    assert.doesNotMatch(pose.textContent, /ssh|refused/);
  });

  test("aucune box ne communique sa série : la zone dit « not communicated », et rien n'est tracé", () => {
    for (const lectures of [new Map([["parade", lu("parade", station())], ["cantine", lu("cantine", station())]]), new Map<string, unknown>([["parade", injoignable("parade")], ["cantine", lu("cantine", station())]])]) {
      const pose = poser(lectures);
      assert.deepEqual(pose.children.map(({ balise, textContent }) => [balise, textContent]), [["h2", TITRE], ["p", NON_COMMUNIQUE]]);
      assert.equal(pose.dessous("svg").length, 0);
    }
    // Avant toute lecture, la zone est en lecture — pas « not communicated ».
    assert.equal(poser(new Map()).children[1]?.textContent, LECTURE);
    assert.equal(poser(new Map([["parade", lu("parade", station())]])).children[1]?.textContent, LECTURE);
  });

  test("aucune phrase d'explication : rien de posé à plat ne dépasse quelques mots", () => {
    const pose = poser(new Map<string, unknown>([["parade", lu("parade", PARADE_JOURS)], ["cantine", injoignable("cantine")]]));
    for (const element of pose.descendants()) {
      if (element.children.length > 0 || element.balise === "title") continue;
      assert.ok(element.textContent.split(/\s+/).length <= 4, `trop long pour un libellé : « ${element.textContent} »`);
    }
  });
});

describe("la courbe, dans l'onglet Cost", () => {
  const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", box: { hote: "box" }, couleurs: { onglet: "#f2994a", accent: "#f2994a" } };
  const CANTINE: Projet = { nom: "cantine", dossier: "/tmp/cantine", box: { hote: "box" } };

  async function ouvrirCost(): Promise<Jouee> {
    const vue = await jouerLaVue({
      demarrage: () => ({
        configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE, CANTINE], hotes: ["box"] }),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS,
        rubriques: RUBRIQUES,
        boutons: BOUTONS,
        gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE,
        calibrage: { modeles: MODELES, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
    });
    (vue.element("projets").children.at(1) ?? assert.fail("pas de case parade")).click();
    await repos();
    (vue.element("onglets").children.find(({ textContent }) => textContent === "Cost") ?? assert.fail("pas d'onglet Cost")).click();
    await repos();
    return vue;
  }
  const courbe = (vue: Jouee) => vue.element("cout").dessous("div").find(({ className }) => className === "courbe-cout") ?? assert.fail("pas de courbe");

  test("sous les chiffres de tête, la courbe lit `station` de chaque box ; sans jours, sa zone dit « not communicated »", async () => {
    const vue = await ouvrirCost();
    const cout = vue.element("cout");
    assert.deepEqual(cout.children.map(({ className }) => className), ["tete-cout", "perdus-cout", "chers-cout", "courbe-cout"]);
    assert.equal(courbe(vue).dessous("p")[0]?.textContent, LECTURE);
    const demande = vue.dernier("onglet")[2] as number;

    vue.dire("surContenu", { ...lu("parade", station()), demande }, undefined, undefined);
    vue.dire("surContenu", { ...lu("cantine", station()), demande }, undefined, undefined);
    await repos();
    assert.equal(courbe(vue).dessous("p")[0]?.textContent, NON_COMMUNIQUE);
    assert.equal(courbe(vue).dessous("svg").length, 0);

    vue.dire("surContenu", { ...lu("parade", PARADE_JOURS), demande }, undefined, undefined);
    vue.dire("surContenu", { ...lu("cantine", CANTINE_JOURS), demande }, undefined, undefined);
    await repos();
    assert.equal(courbe(vue).dessous("path").length, 4);
    assert.deepEqual(courbe(vue).dessous("li").map(({ textContent }) => textContent), ["parade", "cantine"]);
  });
});
