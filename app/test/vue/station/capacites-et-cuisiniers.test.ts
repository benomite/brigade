// La section « capacités et cooks » de la page d'une station (ticket 2645) : les capacités détectées et déclarées avec un
// moyen d'en déclarer une, le plafond de cooks qui se change, les projets servis avec leur part — et rien d'autre du
// projet ; sur une autre station, tout en lecture seule. Chaque réglage est une rangée de réglage (ticket 2920) : un champ
// s'applique dès qu'il change, sans « Save », et un refus se dit sous sa rangée.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { niveauDe } from "../../../src/vue/niveaux.js";
import { EN_COURS } from "../../../src/vue/station/page/appliquer.js";
import { PLAFOND_ENTIER, poserSection } from "../../../src/vue/station/page/sections/capacites-et-cuisiniers.js";
import { Faux, repos } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const contexte = (ici: boolean, capacitesEtCooks: object) => ({ station: { id: "gist-mac", nom: "mac/claude" }, ici, lectureSeule: !ici, niveau: (cle: string) => niveauDe(doc, cle), capacitesEtCooks });
const parNom = (racine: Faux, nom: string) => racine.children.flatMap((c) => (c.dataset.cle === nom ? [c] : c.children.filter((l) => l.dataset.cle === nom))).find(Boolean) as Faux;
// Une rangée : son nom et la marque de son niveau, sa valeur, son contrôle, puis ce que le dernier changement a rendu.
const niveau = (ligne: Faux) => ligne.children[0]?.children[0]?.dataset.niveau;
const valeur = (ligne: Faux) => ligne.children[1]?.textContent;
const dessous = (ligne: Faux) => ligne.children.slice(3);
const changer = (entree: Faux, saisi: string) => {
  entree.value = saisi;
  entree.declencher("change");
};
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
    assert.equal(niveau(ligne), "machine");
    assert.deepEqual(ligne.children[1]?.children.map((c) => c.textContent), ["macos (detected)", "chrome (detected)", "gpu (declared)"]);
    const [entree] = entrees(ligne);
    assert.equal(boutons(ligne).length, 0, "pas de bouton : le champ s'applique dès qu'il change");
    changer(entree!, "chrome");
    changer(entree!, "  ");
    assert.deepEqual(declarees, []);
    changer(entree!, " docker ");
    assert.deepEqual(declarees, ["docker"]);
  });

  test("cet ordinateur : le plafond de cooks est montré et se change d'ici", () => {
    const voulus: number[] = [];
    const racine = poserSection(doc, contexte(true, DONNEES({ plafond: { valeur: 4, regler: (v: number) => voulus.push(v) } }))) as Faux;
    const ligne = parNom(racine, "cook cap");
    assert.equal(niveau(ligne), "machine");
    assert.equal(valeur(ligne), "4");
    const [entree] = entrees(ligne);
    assert.equal(entree?.value, "4");
    changer(entree!, "4");
    changer(entree!, "0");
    assert.deepEqual(voulus, [], "ni la même valeur ni un plafond nul ne s'envoient");
    changer(entree!, "6");
    assert.deepEqual(voulus, [6]);
  });

  test("aucun bouton « Save » : rien ne s'envoie avant que le champ change, et un changement s'applique aussitôt", async () => {
    const voulus: number[] = [];
    let fini: (rendu: unknown) => void = () => {};
    const racine = poserSection(doc, contexte(true, DONNEES({ plafond: { valeur: 4, regler: (v: number) => (voulus.push(v), new Promise((r) => (fini = r))) } }))) as Faux;
    assert.equal([...racine.descendants()].filter((n) => n.balise === "button").length, 0);
    const ligne = parNom(racine, "cook cap");
    const [entree] = entrees(ligne);
    entree!.value = "6";
    assert.deepEqual(voulus, [], "saisir n'envoie rien");
    entree!.declencher("change");
    assert.deepEqual(voulus, [6]);
    assert.equal(entree!.disabled, true, "le champ attend que le changement soit fait");
    assert.equal(dessous(ligne).map((n) => n.textContent).join(), EN_COURS);
    fini(undefined);
    await repos();
    assert.equal(entree!.disabled, false);
    assert.deepEqual(dessous(ligne), []);
  });

  test("un refus se dit sous la rangée — celui de la station comme une saisie qui ne se règle pas", async () => {
    const racine = poserSection(doc, contexte(true, DONNEES({ plafond: { valeur: 4, regler: async () => ({ refus: "the station refused the cap", detail: "it is busy" }) } }))) as Faux;
    const ligne = parNom(racine, "cook cap");
    const [entree] = entrees(ligne);
    changer(entree!, "0");
    assert.equal(dessous(ligne)[0]?.dataset.ligne, "erreur");
    assert.ok([...dessous(ligne)[0]!.descendants()].some((n) => n.ariaLabel === PLAFOND_ENTIER));
    changer(entree!, "8");
    await repos();
    const [refus] = dessous(ligne);
    assert.equal(refus?.dataset.ligne, "erreur");
    assert.match(refus!.textContent, /the station refused the cap/);
    assert.ok([...refus!.descendants()].some((n) => n.ariaLabel === "it is busy"), "le détail au survol");
    assert.equal(entree!.disabled, false);
  });

  test("chaque projet servi est listé avec sa part de cooks, et aucun autre réglage du projet", () => {
    const racine = poserSection(doc, contexte(true, DONNEES())) as Faux;
    const servis = racine.children.find((c) => c.className === "projets-servis")!;
    assert.deepEqual(servis.children.map((l) => [l.dataset.projet, niveau(l), valeur(l)]), [
      ["brigade", "machine", "60% of cooks"],
      ["site", "machine", "40% of cooks"],
    ]);
    assert.equal(boutons(servis).length + entrees(servis).length, 0);
    assert.ok([...racine.descendants()].every((n) => n.dataset.niveau !== "project"));
    assert.ok([...racine.descendants()].every((n) => n.className !== "par-pr"), "rien n'est gardé dans le dépôt : aucune ligne de PR");
  });

  test("une autre station : les mêmes lignes en lecture seule — ni champ ni bouton, même avec les gestes", () => {
    const racine = poserSection(doc, contexte(false, DONNEES({ capacites: { detectees: ["macos"], declarer: () => assert.fail("rien ne se règle d'ici") }, plafond: { valeur: 4, regler: () => assert.fail("rien ne se règle d'ici") } }))) as Faux;
    assert.equal(boutons(racine).length, 0);
    assert.equal(entrees(racine).length, 0);
    assert.equal(valeur(parNom(racine, "cook cap")), "4");
    assert.equal(racine.children.find((c) => c.className === "projets-servis")!.children.length, 2);
  });

  test("ce que la station n'a pas dit se dit en une ligne, jamais une case vide", () => {
    const racine = poserSection(doc, contexte(false, {})) as Faux;
    assert.equal(valeur(parNom(racine, "capabilities")), "none");
    assert.equal(valeur(parNom(racine, "cook cap")), "unknown");
    assert.equal(racine.children.find((c) => c.className === "projets-servis")!.textContent, "none");
  });
});
