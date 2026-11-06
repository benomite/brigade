// La section « capacités et cooks » de la page d'une station (ticket 2645) : les capacités détectées et déclarées avec un
// moyen d'en déclarer une, le plafond de cooks qui se change, les projets servis avec leur part — et rien d'autre du
// projet ; sur une autre station, tout en lecture seule.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { niveauDe } from "../../../src/vue/niveaux.js";
import { DECLARER, ENREGISTRER, poserSection } from "../../../src/vue/station/page/sections/capacites-et-cuisiniers.js";
import { Faux } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const contexte = (ici: boolean, capacitesEtCooks: object) => ({ station: { id: "gist-mac", nom: "mac/claude" }, ici, lectureSeule: !ici, niveau: (cle: string) => niveauDe(doc, cle), capacitesEtCooks });
const parNom = (racine: Faux, nom: string) => racine.children.flatMap((c) => (c.dataset.reglage === nom ? [c] : c.children.filter((l) => l.dataset.reglage === nom))).find(Boolean) as Faux;
const entrees = (racine: Faux): Faux[] => racine.children.flatMap((c) => [...(c.balise === "input" ? [c] : []), ...entrees(c)]);
const boutons = (racine: Faux): Faux[] => racine.children.flatMap((c) => [...(c.balise === "button" ? [c] : []), ...boutons(c)]);

const DONNEES = (extra: object = {}) => ({
  capacites: { detectees: ["macos", "chrome"], declarees: ["gpu"] },
  plafond: { valeur: 4 },
  projets: [{ nom: "brigade", part: 60 }, { nom: "site", part: 40 }],
  ...extra,
});

describe("la section capacités et cooks de la page d'une station", () => {
  test("cet ordinateur : capacités détectées et déclarées, et une capacité se déclare d'ici", () => {
    const declarees: string[] = [];
    const racine = poserSection(doc, contexte(true, DONNEES({ capacites: { detectees: ["macos", "chrome"], declarees: ["gpu"], declarer: (nom: string) => declarees.push(nom) } }))) as Faux;
    const ligne = parNom(racine, "capabilities");
    assert.equal(ligne.children[1]?.dataset.niveau, "machine");
    assert.deepEqual(ligne.children[2]?.children.map((c) => c.textContent), ["macos (detected)", "chrome (detected)", "gpu (declared)"]);
    const [entree] = entrees(ligne);
    const [bouton] = boutons(ligne);
    assert.equal(bouton?.textContent, DECLARER);
    entree!.value = "chrome";
    bouton!.click();
    entree!.value = "  ";
    bouton!.click();
    assert.deepEqual(declarees, []);
    entree!.value = " docker ";
    bouton!.click();
    assert.deepEqual(declarees, ["docker"]);
  });

  test("cet ordinateur : le plafond de cooks est montré et se change d'ici", () => {
    const voulus: number[] = [];
    const racine = poserSection(doc, contexte(true, DONNEES({ plafond: { valeur: 4, regler: (v: number) => voulus.push(v) } }))) as Faux;
    const ligne = parNom(racine, "cook cap");
    assert.equal(ligne.children[1]?.dataset.niveau, "machine");
    assert.equal(ligne.children[2]?.textContent, "4");
    const [entree] = entrees(ligne);
    const [bouton] = boutons(ligne);
    assert.equal(bouton?.textContent, ENREGISTRER);
    assert.equal(entree?.value, "4");
    bouton!.click();
    entree!.value = "0";
    bouton!.click();
    entree!.value = "6";
    bouton!.click();
    assert.deepEqual(voulus, [6]);
  });

  test("chaque projet servi est listé avec sa part de cooks, et aucun autre réglage du projet", () => {
    const racine = poserSection(doc, contexte(true, DONNEES())) as Faux;
    const servis = racine.children.find((c) => c.className === "projets-servis")!;
    assert.deepEqual(servis.children.map((l) => [l.dataset.projet, l.children[1]?.dataset.niveau, l.children[2]?.textContent]), [
      ["brigade", "machine", "60% of cooks"],
      ["site", "machine", "40% of cooks"],
    ]);
    assert.equal(boutons(servis).length + entrees(servis).length, 0);
    assert.ok(racine.children.flatMap((c) => c.children).every((l) => l.dataset.niveau !== "project" && l.children?.every?.((m) => m.dataset.niveau !== "project")));
  });

  test("une autre station : les mêmes lignes en lecture seule — ni champ ni bouton, même avec les gestes", () => {
    const racine = poserSection(doc, contexte(false, DONNEES({ capacites: { detectees: ["macos"], declarer: () => assert.fail("rien ne se règle d'ici") }, plafond: { valeur: 4, regler: () => assert.fail("rien ne se règle d'ici") } }))) as Faux;
    assert.equal(boutons(racine).length, 0);
    assert.equal(entrees(racine).length, 0);
    assert.equal(parNom(racine, "cook cap").children[2]?.textContent, "4");
    assert.equal(racine.children.find((c) => c.className === "projets-servis")!.children.length, 2);
  });

  test("ce que la station n'a pas dit se dit en une ligne, jamais une case vide", () => {
    const racine = poserSection(doc, contexte(false, {})) as Faux;
    assert.equal(parNom(racine, "capabilities").children[2]?.textContent, "none");
    assert.equal(parNom(racine, "cook cap").children[2]?.textContent, "unknown");
    assert.equal(racine.children.find((c) => c.className === "projets-servis")!.textContent, "none");
  });
});
