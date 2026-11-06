// La page d'une station (ticket 2641, épique 2497) : la coque pose ses sections dans leur ordre, dit à une autre station
// de se montrer sans se régler, ne montre aucun réglage du projet ; et la marque du niveau d'un réglage dit chacun des
// trois niveaux par une étiquette à elle.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { NIVEAUX_DITS } from "../src/vue/niveaux.js";
import { niveauReglage } from "../src/vue/station/page/NiveauReglage.js";
import { PAS_ENCORE, poserPageDeStation, SECTIONS } from "../src/vue/station/page/StationPage.js";
import { Faux } from "./aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const STATION = { id: "gist-mac", nom: "mac/claude" };

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

describe("la page d'une station", () => {
  test("celle de cet ordinateur pose les titres des sections dans l'ordre : identité, connexions, dossiers et bac à sable, capacités, cooks", async () => {
    const page = (await poserPageDeStation(doc, { station: STATION, locale: "gist-mac" })) as Faux;
    assert.equal(page.dataset.ici, "true");
    assert.deepEqual(
      page.children.map((section) => section.children[0]?.textContent),
      ["Identity", "Connections", "Folders and sandbox", "Capabilities", "Cooks"],
    );
    assert.deepEqual(page.children.map((section) => section.dataset.section), SECTIONS.map(({ fichier }) => fichier));
  });

  test("une section dont le fichier manque garde son titre et dit qu'elle n'est pas encore là", async () => {
    const page = (await poserPageDeStation(doc, { station: STATION, locale: "gist-mac", charger: async () => Promise.reject(new Error("absent")) })) as Faux;
    for (const section of page.children) assert.equal(section.children[1]?.textContent, PAS_ENCORE);
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

  test("aucun réglage de niveau projet ne paraît : une section qui en demande un ne se rend pas", async () => {
    const page = (await poserPageDeStation(doc, { station: STATION, locale: "gist-mac", charger: temoins(new Map()) })) as Faux;
    const marques = page.children.map((section) => section.children[1]?.children[0]);
    assert.deepEqual(marques.map((marque) => marque?.dataset.niveau), SECTIONS.map(() => "machine"));
    const projet = async () => ({ poserSection: (_: typeof doc, contexte: Contexte) => contexte.niveau("branche") });
    await assert.rejects(poserPageDeStation(doc, { station: STATION, locale: "gist-mac", charger: projet }), /belongs to the project/);
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

  test("un niveau inconnu ne se rend pas", () => {
    assert.throws(() => niveauReglage(doc, "ailleurs" as "you"), /unknown setting level/);
  });
});
