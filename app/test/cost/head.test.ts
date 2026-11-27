// La tête de la page des coûts de l'app (vue/cost/head.js, #908, #1022) : trois chiffres — les tokens que brigade a
// lancés sur 5 h, 24 h et 7 jours, tous projets confondus —, la part de chaque projet sous chacun,
// « not communicated » à la place de ce que la box ne donne pas, et une seule ligne pour le quota du
// compte Max. Le module est lu seul, puis la vue jouée telle qu'elle est (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { figures, windowsOf, NOT_COMMUNICATED, setHead } from "../../src/vue/cost/head.js";
import { Fake, type Played, playTheVue, openTheCosts, repos } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const A = "2026-10-17T10:00:00.000Z";
// Un nombre tel que le runtime l'écrit (fr-FR) : séparé d'espaces fines insécables.
const n = (figures: string) => figures.replaceAll(" ", " ");

// Ce que `station` rend, mot pour mot (runtime/src/montrer-station.ts) : ses lignes, puis le bloc `consommé`.
const station = (five: string, twentyFour: string) =>
  [
    "station               box/claude — moteur claude, fournit : claude",
    "cooks en cours        aucun",
    `consommé              en cours : 1 lancement · 4 tours · ${n("12 000")} tokens`,
    `                      5 h : ${five}`,
    `                      24 h : ${twentyFour}`,
    "                      ce que ce projet a lancé, pas la consommation du compte : /usage la donne",
    "décisions du chef     `station -- <geste> <valeur>` pour en poser une",
    `  seuil-ticket        non posée — 5 h : ${n("999 999")} tokens n'est pas une fenêtre`,
  ].join("\n");
const readOne = (project: string, text: string) => ({ projet: project, demande: 0, a: A, sorties: [{ commande: "station", texte: text }] });
const unreachable = (project: string) => ({ projet: project, demande: 0, a: A, erreur: "spawn node ENOENT", atteinte: false, cas: null });

const PARADE_READ = station(`6 lancements, dont 2 relectures · 214 tours · ${n("1 284 530")} tokens`, `19 lancements · 802 tours · ${n("4 912 044")} tokens`);
const CANTINE_READ = station(`1 lancement · 3 tours · ${n("320 000")} tokens`, "rien");

describe("ce que `station` dit de chaque fenêtre", () => {
  test("les fenêtres du bloc `consommé`, par nombre d'heures — « en cours » et ce qui suit le bloc n'en sont pas", () => {
    assert.deepEqual([...windowsOf(PARADE_READ)], [
      [5, 1_284_530],
      [24, 4_912_044],
    ]);
  });

  test("« rien » vaut zéro, un token seul se lit, une fenêtre en jours se compte en heures", () => {
    const text = ["consommé           en cours : rien", "                   5 h : rien", "                   24 h : 1 lancement · 1 tour · 1 token", `                   7 j : 3 lancements · 9 tours · ${n("2 048")} tokens`].join("\n");
    assert.deepEqual([...windowsOf(text)], [
      [5, 0],
      [24, 1],
      [168, 2_048],
    ]);
  });

  test("une sortie sans `consommé` ne communique aucune fenêtre", () => {
    assert.equal(windowsOf("station    box — Debian 12\nquota      tient\n").size, 0);
  });
});

describe("les trois chiffres", () => {
  const projects = [{ nom: "parade" }, { nom: "cantine" }];

  test("chaque fenêtre est la somme des projets, et la part de chacun en est le pourcentage", () => {
    const [five, twentyFour, seven] = figures(projects, new Map([["parade", readOne("parade", PARADE_READ)], ["cantine", readOne("cantine", CANTINE_READ)]]));
    assert.deepEqual(five, {
      dit: "5 h",
      total: 1_604_530,
      partiel: false,
      parts: [
        { projet: { nom: "parade" }, tokens: 1_284_530, part: 80 },
        { projet: { nom: "cantine" }, tokens: 320_000, part: 20 },
      ],
    });
    assert.equal(twentyFour?.total, 4_912_044);
    assert.deepEqual(twentyFour?.parts.map(({ part }) => part), [100, 0]);
    // La box ne donne pas 7 jours : ni la somme, ni la part de personne.
    assert.deepEqual(seven, { dit: "7 d", total: null, partiel: false, parts: projects.map((project) => ({ projet: project, tokens: null, part: undefined })) });
  });

  test("une box injoignable : son projet n'est pas communiqué, la somme des autres est partielle et ne donne pas de part", () => {
    const [five] = figures(projects, new Map<string, unknown>([["parade", readOne("parade", PARADE_READ)], ["cantine", unreachable("cantine")]]) as never);
    assert.deepEqual(five, {
      dit: "5 h",
      total: 1_284_530,
      partiel: true,
      parts: [
        { projet: { nom: "parade" }, tokens: 1_284_530, part: undefined },
        { projet: { nom: "cantine" }, tokens: null, part: undefined },
      ],
    });
  });

  test("une box pas encore lue est en lecture, pas « non communiquée »", () => {
    const [five] = figures(projects, new Map());
    assert.equal(five?.total, undefined);
    assert.deepEqual(five?.parts.map(({ tokens }) => tokens), [undefined, undefined]);
  });
});

describe("la tête posée", () => {
  const head = (readings: Map<string, unknown>) => setHead(doc, [{ nom: "parade", teinte: "#f2994a" }, { nom: "cantine" }], readings as never) as Fake;
  const full = () => head(new Map([["parade", readOne("parade", PARADE_READ)], ["cantine", readOne("cantine", CANTINE_READ)]]));
  const blocks = (pose: Fake) => pose.dessous("div").filter(({ className }) => className === "chiffre");

  test("trois chiffres en tête, 5 h, 24 h, 7 d — et sous chacun une ligne par projet", () => {
    const [five, twentyFour, seven, ...others] = blocks(full());
    assert.equal(others.length, 0);
    assert.deepEqual([five, twentyFour, seven].map((block) => block?.dessous("h3")[0]?.textContent), ["5 h", "24 h", "7 d"]);
    assert.equal(five?.dessous("p")[0]?.textContent, "1,604,530");
    assert.deepEqual(
      five?.dessous("li").map((line) => line.children.map(({ textContent }) => textContent)),
      [
        ["", "parade", "1,284,530", "80 %"],
        ["", "cantine", "320,000", "20 %"],
      ],
    );
    assert.equal(five?.dessous("li")[0]?.children[0]?.style.getPropertyValue("--teinte"), "#f2994a");
  });

  test("une valeur absente des données de la box s'affiche « not communicated » à la place du chiffre", () => {
    const seven = blocks(full())[2];
    const total = seven?.dessous("p")[0];
    assert.equal(total?.textContent, NOT_COMMUNICATED);
    assert.equal(total?.className, "total sans");
    assert.deepEqual(seven?.dessous("li").map((line) => line.children[2]?.textContent), [NOT_COMMUNICATED, NOT_COMMUNICATED]);
    // Une box injoignable, de même : sa part dit « not communicated », la somme des autres est au moins ce qu'elle dit.
    const [five] = blocks(head(new Map<string, unknown>([["parade", readOne("parade", PARADE_READ)], ["cantine", unreachable("cantine")]])));
    assert.equal(five?.dessous("p")[0]?.textContent, "≥ 1,284,530");
    assert.deepEqual(five?.dessous("li").map((line) => line.children.slice(1).map(({ textContent }) => textContent)), [["parade", "1,284,530", ""], ["cantine", NOT_COMMUNICATED, ""]]);
    // Rien de ce que le lancement a répondu n'est écrit.
    assert.doesNotMatch(head(new Map([["cantine", unreachable("cantine")]])).textContent, /ENOENT|spawn/);
  });

  test("aucune phrase d'explication : des libellés courts, des chiffres, et une seule ligne pour le quota", () => {
    const pose = full();
    const quota = pose.dessous("p").filter(({ className }) => className === "quota");
    assert.equal(quota.length, 1);
    assert.equal(quota[0]?.textContent, "Max account quota: /usage");
    // Chaque texte posé tient en quelques mots : rien qui raconte.
    for (const element of pose.descendants()) {
      if (element.children.length > 0) continue;
      assert.ok(element.textContent.split(/\s+/).length <= 4, `trop long pour un libellé : « ${element.textContent} »`);
    }
    assert.equal(pose.dessous("pre").length, 0);
  });
});

describe("la page des coûts de l'app, dans la vue (#1022)", () => {
  const PARADE: Project = { nom: "parade", dossier: "/tmp/parade", couleurs: { onglet: "#f2994a", accent: "#f2994a" } };
  const CANTINE: Project = { nom: "cantine", dossier: "/tmp/cantine" };
  const LOCAL: Project = { nom: "local", dossier: "/tmp/local" };

  async function openThePage(): Promise<Played> {
    const vue = await playTheVue({
      demarrage: () => ({
        configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE, CANTINE, LOCAL] }, (project) => project.nom !== "local"),
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
    await openTheCosts(vue);
    return vue;
  }

  test("sa ligne, sous Health, l'ouvre à la place de l'accueil, et sa tête additionne `station` de chaque box", async () => {
    const vue = await openThePage();
    const cost = vue.element("cout");
    assert.equal(cost.hidden, false);
    // Aucun espace de projet n'est ouvert : la page est à la place de l'accueil, « T » reste l'entrée affichée.
    assert.equal(vue.element("tous").hidden, false);
    assert.equal(vue.element("main").hidden, true);
    assert.equal(vue.element("entree-tous").ariaCurrent, "true");
    // Le seul espace ouvert est celui du projet dont Health porte la ligne « Cost » (#2638) : la page n'en ouvre aucun.
    assert.equal(vue.appels.filter(({ geste: action }) => action === "espace").length, 1);
    const request = vue.dernier("onglet")[2] as number;
    // Sa lecture n'est celle d'aucun projet : le process principal lit `station` sur chaque box.
    assert.deepEqual(vue.dernier("onglet").slice(0, 2), [undefined, "couts"]);
    // Avant toute lecture, les chiffres sont en lecture.
    assert.equal(cost.dessous("p")[0]?.textContent, "Reading…");

    vue.dire("surContenu", { ...readOne("cantine", CANTINE_READ), demande: request }, undefined);
    vue.dire("surContenu", { ...readOne("parade", PARADE_READ), demande: request }, undefined);
    await repos();
    const totals = cost.dessous("p").filter(({ className }) => className.startsWith("total")).map(({ textContent }) => textContent);
    assert.deepEqual(totals, ["1,604,530", "4,912,044", NOT_COMMUNICATED]);
    // Un projet que la station ne lit pas n'a rien lancé : il n'a pas de ligne.
    assert.doesNotMatch(cost.textContent, /local/);
    // Le quota du compte renvoie à `/usage`.
    assert.match(cost.textContent, /Max account quota: \/usage/);
  });

  test("un clic sur le nom d'un projet ouvre son espace", async () => {
    const vue = await openThePage();
    const names = vue.element("cout").dessous("button").filter(({ className }) => className === "projet");
    assert.deepEqual(names.slice(0, 2).map(({ textContent }) => textContent), ["parade", "cantine"]);
    names[1]?.click();
    await repos();
    assert.deepEqual(vue.dernier("espace"), ["cantine"]);
    assert.equal(vue.element("espace").textContent, "cantine");
    assert.equal(vue.element("main").hidden, false);
    // L'espace ouvert, la page des coûts n'est plus lue : l'onglet lu est celui du projet, aucun.
    assert.deepEqual(vue.dernier("onglet").slice(0, 2), ["cantine", undefined]);
  });

  test("une lecture d'une demande passée n'entre pas dans les chiffres ; revenir à l'accueil arrête sa lecture", async () => {
    const vue = await openThePage();
    const page = vue.element("cout");
    const request = vue.dernier("onglet")[2] as number;
    vue.dire("surContenu", { ...readOne("parade", PARADE_READ), demande: request - 1 }, undefined);
    await repos();
    assert.equal(page.dessous("p")[0]?.textContent, "Reading…");

    (page.dessous("button").find(({ textContent }) => textContent === "‹ All projects") ?? assert.fail("pas de retour")).click();
    await repos();
    assert.ok(!vue.element("tous").children.includes(page));
    assert.ok(vue.element("tous").children.some(({ id }) => id === "accueil-bloc-projets"));
    assert.deepEqual(vue.dernier("onglet").slice(0, 2), [undefined, undefined]);
    assert.equal(page.dessous("div").length, 1);
  });
});
