// La page d'une station (ticket 2641, épique 2497) : la coque pose ses sections dans leur ordre, dit à une autre station
// de se montrer sans se régler, ne montre aucun réglage du projet ; vue.js la monte quand le chef ouvre une station ; et
// la marque du niveau d'un réglage dit chacun des trois niveaux par une étiquette à elle — celle que `niveauDe` pose.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ligneDeStation } from "../src/accueil.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { calibrageRecommande, EFFORTS, MODELES } from "../src/projets/projets.ts";
import type { StationVue } from "../src/stations/stations.ts";
import { NIVEAUX, NIVEAUX_DITS, niveauDe } from "../src/vue/niveaux.js";
import { niveauReglage } from "../src/vue/station/page/NiveauReglage.js";
import { INDISPONIBLE, LIVREES, PAS_ENCORE, poserPageDeStation, SECTIONS } from "../src/vue/station/page/StationPage.js";
import { Faux, jouerLaVue, repos } from "./aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const STATION = { id: "gist-mac", nom: "mac/claude" };
const TITRES = ["Identity", "Connections", "Folders and sandbox", "Capabilities", "Cooks"];

type Contexte = { ici: boolean; lectureSeule: boolean; niveau(cle: string): Faux };

// Un chargeur qui rend, pour chaque section, un élément qui dit ce qu'elle a reçu.
function temoins(recus: Map<string, Contexte>) {
  return async (fichier: string) => ({
    poserSection(fabrique: typeof doc, contexte: Contexte) {
      recus.set(fichier, contexte);
      const corps = fabrique.createElement("p");
      corps.append(contexte.niveau("cooks"));
      return corps;
    },
  });
}

describe("la coque de la page d'une station", () => {
  test("celle de cet ordinateur pose les titres des sections dans l'ordre : identité, connexions, dossiers et bac à sable, capacités, cooks", async () => {
    const page = (await poserPageDeStation(doc, { station: STATION, locale: "gist-mac" })) as Faux;
    assert.equal(page.dataset.ici, "true");
    assert.deepEqual(page.children.map((section) => section.children[0]?.textContent), TITRES);
    assert.deepEqual(page.children.map((section) => section.dataset.section), SECTIONS.map(({ fichier }) => fichier));
  });

  test("une section dont le fichier n'est pas livré garde son titre et dit qu'elle n'est pas encore là, sans rien charger", async () => {
    const demandes: string[] = [];
    const page = (await poserPageDeStation(doc, { station: STATION, locale: "gist-mac", charger: (fichier) => (demandes.push(fichier), undefined) })) as Faux;
    for (const section of page.children) assert.equal(section.children[1]?.textContent, PAS_ENCORE);
    assert.equal(demandes.length, SECTIONS.length);
    // Le chargeur par défaut ne demande que les fichiers livrés : aucun ne l'est encore, la page se pose sans en demander un absent.
    for (const fichier of LIVREES) assert.ok(SECTIONS.some((section) => section.fichier === fichier), `${fichier} n'est pas une section`);
    const parDefaut = (await poserPageDeStation(doc, { station: STATION, locale: "gist-mac" })) as Faux;
    assert.equal(parDefaut.children.filter((section) => section.children[1]?.textContent === PAS_ENCORE).length, SECTIONS.length - LIVREES.size);
  });

  test("une section livrée qui ne se charge pas, ou qui lève, se dit indisponible — son détail au survol — et les autres se posent", async () => {
    const page = (await poserPageDeStation(doc, {
      station: STATION,
      locale: "gist-mac",
      charger: async (fichier) => {
        if (fichier === "identite") throw new SyntaxError("Unexpected token");
        if (fichier === "connexions") return { poserSection: () => { throw new Error("lecture ratée"); } };
        if (fichier === "capacites") return {};
        return temoins(new Map())(fichier);
      },
    })) as Faux;
    const corps = page.children.map((section) => section.children[1]);
    assert.deepEqual(corps.map((ligne) => ligne?.className), ["indisponible", "indisponible", "", "indisponible", ""]);
    assert.equal(corps[0]?.children[0]?.textContent, INDISPONIBLE);
    assert.equal(corps[0]?.children[1]?.children[0]?.ariaLabel, "Unexpected token");
    assert.equal(corps[1]?.children[1]?.children[0]?.ariaLabel, "lecture ratée");
    assert.equal(corps[4]?.children[0]?.dataset.niveau, "machine");
  });

  test("la page d'une autre station passe `lectureSeule` à chaque section ; celle de cet ordinateur, non", async () => {
    const ailleurs = new Map<string, Contexte>();
    await poserPageDeStation(doc, { station: { id: "gist-pc", nom: "pc/claude" }, locale: "gist-mac", charger: temoins(ailleurs) });
    assert.deepEqual([...ailleurs.keys()], SECTIONS.map(({ fichier }) => fichier));
    for (const contexte of ailleurs.values()) assert.deepEqual([contexte.ici, contexte.lectureSeule], [false, true]);
    const ici = new Map<string, Contexte>();
    await poserPageDeStation(doc, { station: STATION, locale: "gist-mac", charger: temoins(ici) });
    for (const contexte of ici.values()) assert.deepEqual([contexte.ici, contexte.lectureSeule], [true, false]);
  });

  test("sans station locale connue, aucune page n'est celle de cet ordinateur", async () => {
    for (const locale of [null, undefined, ""]) assert.equal(((await poserPageDeStation(doc, { station: STATION, locale })) as Faux).dataset.ici, "false");
  });

  test("aucun réglage de niveau projet ne paraît : une section qui en demande un ne se rend pas, les autres si", async () => {
    const page = (await poserPageDeStation(doc, { station: STATION, locale: "gist-mac", charger: temoins(new Map()) })) as Faux;
    assert.deepEqual(page.children.map((section) => section.children[1]?.children[0]?.dataset.niveau), SECTIONS.map(() => "machine"));
    for (const cle of Object.keys(NIVEAUX).filter((une) => NIVEAUX[une] === "project")) {
      const projet = (fichier: string) => (fichier === "cooks" ? Promise.resolve({ poserSection: (_: typeof doc, contexte: Contexte) => contexte.niveau(cle) }) : temoins(new Map())(fichier));
      const rendue = (await poserPageDeStation(doc, { station: STATION, locale: "gist-mac", charger: projet })) as Faux;
      assert.doesNotMatch(rendue.textContent, /\bproject\b(?! setting)/, `${cle} : aucune marque « project »`);
      assert.ok(!rendue.descendants().some((element) => element.dataset.niveau === "project"), cle);
      assert.match(rendue.children[4]?.children[1]?.children[1]?.children[0]?.ariaLabel ?? "", /belongs to the project/);
    }
  });
});

// L'app jouée : la page d'une station ouverte depuis le bloc de la station de l'accueil (#2638) monte la coque — celle de
// cet ordinateur par « Open its page », une autre par sa ligne sous « Your other stations ».
const A = "2026-11-06T12:00:00.000Z";
const MAC: StationVue = { id: "gist-mac", nom: "mac", machine: "macOS 25.0.0", etat: "en-ligne", ligne: "online", pannes: [], dit: "online", version: "1.4.0", projets: ["parade"], max: "connectee" };
const PC: StationVue = { ...MAC, id: "gist-pc", nom: "pc", machine: "Windows 11" };
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  stations: { a: A, stations: [MAC, PC] },
  projetsDesStations: { a: A, projets: [], locale: "gist-mac", recommandee: null, avertissements: {}, machines: {}, calibrage: calibrageRecommande([]) },
  accueil: { projets: [], stations: [ligneDeStation(MAC, 0, false), ligneDeStation(PC, 0, false)], sante: { ton: "vert" as const, dit: "Max ✓  ·  GitHub ✓", survol: "" } },
});

async function ouvrirLaStation(nom: string) {
  const vue = await jouerLaVue({ demarrage, espace: () => [] });
  (vue.element("projets").children.at(0) ?? assert.fail("pas d'entrée « Tous les projets »")).click();
  await repos();
  const boutons = vue.element("accueil-bloc-station").dessous("button");
  const ligne =
    (nom === "mac" ? boutons.find(({ textContent }) => textContent.startsWith("Open its page")) : boutons.find(({ className, textContent }) => className === "ligne" && textContent.startsWith(nom))) ??
    assert.fail(`pas de bouton pour « ${nom} »`);
  ligne.click();
  await repos();
  return vue.element("station").dessous("div").find(({ className }) => className === "page-de-station") ?? assert.fail("pas de sections sur la page");
}

describe("ouvrir une station dans l'app monte la coque", () => {
  test("la page de cet ordinateur pose ses sections dans l'ordre, et se sait ici", async () => {
    const coque = await ouvrirLaStation("mac");
    assert.equal(coque.dataset.ici, "true");
    assert.deepEqual(coque.children.map((section) => section.children[0]?.textContent), TITRES);
  });

  test("la page d'une autre station est en lecture seule", async () => {
    const coque = await ouvrirLaStation("pc");
    assert.equal(coque.dataset.ici, "false");
    assert.deepEqual(coque.children.map((section) => section.children[0]?.textContent), TITRES);
  });
});

describe("la marque du niveau d'un réglage", () => {
  test("chacun des trois niveaux a son étiquette, distincte, et son survol", () => {
    const marques = (["machine", "project", "you"] as const).map((niveau) => niveauReglage(doc, niveau) as Faux);
    assert.deepEqual(marques.map(({ textContent }) => textContent), ["this machine", "project", "you"]);
    assert.equal(new Set(marques.map(({ textContent }) => textContent)).size, 3);
    for (const [i, niveau] of (["machine", "project", "you"] as const).entries()) {
      assert.equal(marques[i]?.className, "niveau");
      assert.equal(marques[i]?.dataset.niveau, niveau);
      assert.equal(marques[i]?.title, NIVEAUX_DITS[niveau].survol);
    }
  });

  test("`niveauDe` pose la même marque, à partir de la clé du réglage", () => {
    for (const [cle, niveau] of Object.entries(NIVEAUX)) {
      const parCle = niveauDe(doc, cle) as Faux;
      const parNiveau = niveauReglage(doc, niveau) as Faux;
      assert.deepEqual([parCle.className, parCle.dataset, parCle.textContent, parCle.title], [parNiveau.className, parNiveau.dataset, parNiveau.textContent, parNiveau.title]);
    }
  });

  test("un niveau inconnu ne se rend pas", () => {
    assert.throws(() => niveauReglage(doc, "ailleurs" as "you"), /unknown setting level/);
  });
});
