// Les étiquettes d'une carte du rail (ticket 2039) : la station (nom court avant le « / », nom entier au survol) et une
// par capacité demandée. Le module ne touche pas `document` : un faux élément suffit.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { poserEtiquettes } from "../src/vue/etiquettes-de-bon.js";

class Element {
  className = "";
  textContent = "";
  title = "";
  enfants: Element[] = [];
  balise: string;
  constructor(balise: string) {
    this.balise = balise;
  }
  append(...autres: Element[]) {
    this.enfants.push(...autres);
  }
}
const doc = { createElement: (balise: string) => new Element(balise) };
const pose = (carte: { station?: string; requiert?: string[] }, avecStation: boolean) => poserEtiquettes(doc, carte, avecStation) as unknown as Element | null;
const dites = (ligne: Element | null) => (ligne?.enfants ?? []).map((e) => ({ texte: e.textContent, titre: e.title, classe: e.className }));

describe("étiquettes d'une carte", () => {
  test("avec plusieurs stations : le nom court, et le nom entier au survol", () => {
    const [station, ...autres] = dites(pose({ station: "box/claude" }, true));
    assert.equal(station?.texte, "box");
    assert.equal(station?.titre, "box/claude");
    assert.match(station?.classe ?? "", /etiquette-station/);
    assert.deepEqual(autres, []);
    assert.equal(dites(pose({ station: "macbook-air-de-benoit/claude" }, true))[0]?.texte, "macbook-air-de-benoit");
  });

  test("avec une seule station (ou hors Taken et Pass, ou sur Cooks) : pas d'étiquette de station", () => {
    assert.equal(pose({ station: "box/claude" }, false), null);
  });

  test("une étiquette par capacité demandée, distincte de celle de la station", () => {
    const lues = dites(pose({ station: "box/claude", requiert: ["browser", "docker"] }, true));
    assert.deepEqual(lues.map((e) => e.texte), ["box", "browser", "docker"]);
    assert.match(lues[1]?.classe ?? "", /etiquette-capacite/);
    assert.doesNotMatch(lues[0]?.classe ?? "", /etiquette-capacite/);
    // Sans station étiquetée (toute autre colonne), les capacités se posent seules.
    assert.deepEqual(dites(pose({ station: "box/claude", requiert: ["browser", "docker"] }, false)).map((e) => e.texte), ["browser", "docker"]);
  });

  test("un ticket qui ne demande rien : aucune étiquette de capacité", () => {
    assert.equal(pose({}, true), null);
    assert.equal(pose({ requiert: [] }, false), null);
  });

  test("la peau : les deux étiquettes se dessinent hors de `#rail`, la capacité en tireté", () => {
    const css = readFileSync(join(import.meta.dirname, "../src/vue/vue.css"), "utf8");
    assert.match(css, /^\.bon \.etiquette \{/m);
    assert.match(css, /\.bon \.etiquette-capacite \{\s*border-style: dashed;/);
  });
});
