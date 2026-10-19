// La tête de la page des coûts de l'app (vue/cost/tete.js, #908, #1022) : trois chiffres — les tokens que brigade a
// lancés sur 5 h, 24 h et 7 jours, tous projets confondus —, la part de chaque projet sous chacun,
// « not communicated » à la place de ce que la box ne donne pas, et une seule ligne pour le quota du
// compte Max. Le module est lu seul, puis la vue jouée telle qu'elle est (aides/fausse-vue.ts).
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
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { GESTES_DU_MANAGER } from "../../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { chiffres, fenetresDe, NON_COMMUNIQUE, poserTete } from "../../src/vue/cost/tete.js";
import { Faux, type Jouee, jouerLaVue, ouvrirLesCouts, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const A = "2026-10-17T10:00:00.000Z";
// Un nombre tel que le runtime l'écrit (fr-FR) : séparé d'espaces fines insécables.
const n = (chiffres: string) => chiffres.replaceAll(" ", " ");

// Ce que `station` rend, mot pour mot (runtime/src/montrer-station.ts) : ses lignes, puis le bloc `consommé`.
const station = (cinq: string, vingtQuatre: string) =>
  [
    "station               box/claude — moteur claude, fournit : claude",
    "cooks en cours        aucun",
    `consommé              en cours : 1 lancement · 4 tours · ${n("12 000")} tokens`,
    `                      5 h : ${cinq}`,
    `                      24 h : ${vingtQuatre}`,
    "                      ce que ce projet a lancé, pas la consommation du compte : /usage la donne",
    "décisions du chef     `station -- <geste> <valeur>` pour en poser une",
    `  seuil-ticket        non posée — 5 h : ${n("999 999")} tokens n'est pas une fenêtre`,
  ].join("\n");
const lu = (projet: string, texte: string) => ({ projet, demande: 0, a: A, sorties: [{ commande: "station", texte }] });
const injoignable = (projet: string) => ({ projet, demande: 0, a: A, erreur: "ssh: connect to host box port 22: Connection refused", atteinte: false, cas: "ssh-en-echec" });

const PARADE_LU = station(`6 lancements, dont 2 relectures · 214 tours · ${n("1 284 530")} tokens`, `19 lancements · 802 tours · ${n("4 912 044")} tokens`);
const CANTINE_LU = station(`1 lancement · 3 tours · ${n("320 000")} tokens`, "rien");

describe("ce que `station` dit de chaque fenêtre", () => {
  test("les fenêtres du bloc `consommé`, par nombre d'heures — « en cours » et ce qui suit le bloc n'en sont pas", () => {
    assert.deepEqual([...fenetresDe(PARADE_LU)], [
      [5, 1_284_530],
      [24, 4_912_044],
    ]);
  });

  test("« rien » vaut zéro, un token seul se lit, une fenêtre en jours se compte en heures", () => {
    const texte = ["consommé           en cours : rien", "                   5 h : rien", "                   24 h : 1 lancement · 1 tour · 1 token", `                   7 j : 3 lancements · 9 tours · ${n("2 048")} tokens`].join("\n");
    assert.deepEqual([...fenetresDe(texte)], [
      [5, 0],
      [24, 1],
      [168, 2_048],
    ]);
  });

  test("une sortie sans `consommé` ne communique aucune fenêtre", () => {
    assert.equal(fenetresDe("station    box — Debian 12\nquota      tient\n").size, 0);
  });
});

describe("les trois chiffres", () => {
  const projets = [{ nom: "parade" }, { nom: "cantine" }];

  test("chaque fenêtre est la somme des projets, et la part de chacun en est le pourcentage", () => {
    const [cinq, vingtQuatre, sept] = chiffres(projets, new Map([["parade", lu("parade", PARADE_LU)], ["cantine", lu("cantine", CANTINE_LU)]]));
    assert.deepEqual(cinq, {
      dit: "5 h",
      total: 1_604_530,
      partiel: false,
      parts: [
        { projet: { nom: "parade" }, tokens: 1_284_530, part: 80 },
        { projet: { nom: "cantine" }, tokens: 320_000, part: 20 },
      ],
    });
    assert.equal(vingtQuatre?.total, 4_912_044);
    assert.deepEqual(vingtQuatre?.parts.map(({ part }) => part), [100, 0]);
    // La box ne donne pas 7 jours : ni la somme, ni la part de personne.
    assert.deepEqual(sept, { dit: "7 d", total: null, partiel: false, parts: projets.map((projet) => ({ projet, tokens: null, part: undefined })) });
  });

  test("une box injoignable : son projet n'est pas communiqué, la somme des autres est partielle et ne donne pas de part", () => {
    const [cinq] = chiffres(projets, new Map<string, unknown>([["parade", lu("parade", PARADE_LU)], ["cantine", injoignable("cantine")]]) as never);
    assert.deepEqual(cinq, {
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
    const [cinq] = chiffres(projets, new Map());
    assert.equal(cinq?.total, undefined);
    assert.deepEqual(cinq?.parts.map(({ tokens }) => tokens), [undefined, undefined]);
  });
});

describe("la tête posée", () => {
  const tete = (lectures: Map<string, unknown>) => poserTete(doc, [{ nom: "parade", teinte: "#f2994a" }, { nom: "cantine" }], lectures as never) as Faux;
  const pleine = () => tete(new Map([["parade", lu("parade", PARADE_LU)], ["cantine", lu("cantine", CANTINE_LU)]]));
  const blocs = (pose: Faux) => pose.dessous("div").filter(({ className }) => className === "chiffre");

  test("trois chiffres en tête, 5 h, 24 h, 7 d — et sous chacun une ligne par projet", () => {
    const [cinq, vingtQuatre, sept, ...autres] = blocs(pleine());
    assert.equal(autres.length, 0);
    assert.deepEqual([cinq, vingtQuatre, sept].map((bloc) => bloc?.dessous("h3")[0]?.textContent), ["5 h", "24 h", "7 d"]);
    assert.equal(cinq?.dessous("p")[0]?.textContent, "1,604,530");
    assert.deepEqual(
      cinq?.dessous("li").map((ligne) => ligne.children.map(({ textContent }) => textContent)),
      [
        ["", "parade", "1,284,530", "80 %"],
        ["", "cantine", "320,000", "20 %"],
      ],
    );
    assert.equal(cinq?.dessous("li")[0]?.children[0]?.style.getPropertyValue("--teinte"), "#f2994a");
  });

  test("une valeur absente des données de la box s'affiche « not communicated » à la place du chiffre", () => {
    const sept = blocs(pleine())[2];
    const total = sept?.dessous("p")[0];
    assert.equal(total?.textContent, NON_COMMUNIQUE);
    assert.equal(total?.className, "total sans");
    assert.deepEqual(sept?.dessous("li").map((ligne) => ligne.children[2]?.textContent), [NON_COMMUNIQUE, NON_COMMUNIQUE]);
    // Une box injoignable, de même : sa part dit « not communicated », la somme des autres est au moins ce qu'elle dit.
    const [cinq] = blocs(tete(new Map<string, unknown>([["parade", lu("parade", PARADE_LU)], ["cantine", injoignable("cantine")]])));
    assert.equal(cinq?.dessous("p")[0]?.textContent, "≥ 1,284,530");
    assert.deepEqual(cinq?.dessous("li").map((ligne) => ligne.children.slice(1).map(({ textContent }) => textContent)), [["parade", "1,284,530", ""], ["cantine", NON_COMMUNIQUE, ""]]);
    // Rien de ce que `ssh` a répondu n'est écrit.
    assert.doesNotMatch(tete(new Map([["cantine", injoignable("cantine")]])).textContent, /ssh|refused/);
  });

  test("aucune phrase d'explication : des libellés courts, des chiffres, et une seule ligne pour le quota", () => {
    const pose = pleine();
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
  const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", box: { hote: "box" }, couleurs: { onglet: "#f2994a", accent: "#f2994a" } };
  const CANTINE: Projet = { nom: "cantine", dossier: "/tmp/cantine", box: { hote: "box" } };
  const LOCAL: Projet = { nom: "local", dossier: "/tmp/local" };

  async function ouvrirLaPage(): Promise<Jouee> {
    const vue = await jouerLaVue({
      demarrage: () => ({
        configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE, CANTINE, LOCAL], hotes: ["box"] }),
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
    await ouvrirLesCouts(vue);
    return vue;
  }

  test("elle s'ouvre depuis l'accueil, sans ouvrir aucun projet, et sa tête additionne `station` de chaque box", async () => {
    const vue = await ouvrirLaPage();
    const cout = vue.element("cout");
    assert.equal(cout.hidden, false);
    // Aucun espace de projet n'est ouvert : la page est à la place de l'accueil, « T » reste l'entrée affichée.
    assert.equal(vue.element("tous").hidden, false);
    assert.equal(vue.element("main").hidden, true);
    assert.equal(vue.element("entree-tous").ariaCurrent, "true");
    assert.equal(vue.appels.filter(({ geste }) => geste === "espace").length, 0);
    const demande = vue.dernier("onglet")[2] as number;
    // Sa lecture n'est celle d'aucun projet : le process principal lit `station` sur chaque box.
    assert.deepEqual(vue.dernier("onglet").slice(0, 2), [undefined, "couts"]);
    // Avant toute lecture, les chiffres sont en lecture.
    assert.equal(cout.dessous("p")[0]?.textContent, "reading…");

    vue.dire("surContenu", { ...lu("cantine", CANTINE_LU), demande }, undefined, undefined);
    vue.dire("surContenu", { ...lu("parade", PARADE_LU), demande }, undefined, undefined);
    await repos();
    const totaux = cout.dessous("p").filter(({ className }) => className.startsWith("total")).map(({ textContent }) => textContent);
    assert.deepEqual(totaux, ["1,604,530", "4,912,044", NON_COMMUNIQUE]);
    // Un projet sans box n'a rien lancé : il n'a pas de ligne.
    assert.doesNotMatch(cout.textContent, /local/);
    // Le quota du compte renvoie à `/usage`.
    assert.match(cout.textContent, /Max account quota: \/usage/);
  });

  test("un clic sur le nom d'un projet ouvre son espace", async () => {
    const vue = await ouvrirLaPage();
    const noms = vue.element("cout").dessous("button").filter(({ className }) => className === "projet");
    assert.deepEqual(noms.slice(0, 2).map(({ textContent }) => textContent), ["parade", "cantine"]);
    noms[1]?.click();
    await repos();
    assert.deepEqual(vue.dernier("espace"), ["cantine"]);
    assert.equal(vue.element("espace").textContent, "cantine");
    assert.equal(vue.element("main").hidden, false);
    // L'espace ouvert, la page des coûts n'est plus lue : l'onglet lu est celui du projet, aucun.
    assert.deepEqual(vue.dernier("onglet").slice(0, 2), ["cantine", undefined]);
  });

  test("une lecture d'une demande passée n'entre pas dans les chiffres ; revenir à l'accueil arrête sa lecture", async () => {
    const vue = await ouvrirLaPage();
    const page = vue.element("cout");
    const demande = vue.dernier("onglet")[2] as number;
    vue.dire("surContenu", { ...lu("parade", PARADE_LU), demande: demande - 1 }, undefined, undefined);
    await repos();
    assert.equal(page.dessous("p")[0]?.textContent, "reading…");

    (page.dessous("button").find(({ textContent }) => textContent === "‹ All projects") ?? assert.fail("pas de retour")).click();
    await repos();
    assert.ok(!vue.element("tous").children.includes(page));
    assert.ok(vue.element("tous").children.some(({ id }) => id === "accueil-couts"));
    assert.deepEqual(vue.dernier("onglet").slice(0, 2), [undefined, undefined]);
    assert.equal(page.dessous("div").length, 1);
  });
});
