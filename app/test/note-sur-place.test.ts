// La note « sur place » (ticket 2646, épique 2497) : sur la page d'une autre station, un réglage qui ne se change que sur
// la machine montre la note à la place de son geste ; un réglage qui se change à distance garde le sien.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { actionOuNote, NOTE_SUR_PLACE, noteSurPlace } from "../src/vue/station/page/NoteSurPlace.js";
import { METTRE_A_DAY, poserSection } from "../src/vue/station/page/sections/identity.js";
import { Faux } from "./aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const niveau = () => new Faux("span");
const station = { id: "gist-pc", nom: "pc/claude" };

describe("la note sur place", () => {
  test("elle dit que le réglage ne se change que sur la machine, son détail au survol", () => {
    const note = noteSurPlace(doc) as Faux;
    assert.equal(note.textContent, NOTE_SUR_PLACE);
    assert.match(note.title, /only be changed on that machine/);
  });

  test("vue d'une autre station, un réglage de la machine montre la note, un réglage modifiable à distance garde son bouton", () => {
    let actions = 0;
    const action = () => { actions++; };
    const surPlace = actionOuNote(doc, { lectureSeule: true }, { libelle: "Update now", geste: action }) as Faux;
    assert.equal(surPlace.className, "note-sur-place");
    const aDistance = actionOuNote(doc, { lectureSeule: true }, { libelle: "Set cooks", geste: action, aDistance: true }) as Faux;
    assert.equal(aDistance.textContent, "Set cooks");
    aDistance.children[0]?.click();
    assert.equal(actions, 1);
    const ici = actionOuNote(doc, { lectureSeule: false }, { libelle: "Update now", geste: action }) as Faux;
    assert.equal(ici.textContent, "Update now");
  });

  test("la section identité d'une autre station en retard montre la note, jamais le bouton ; celle de cet ordinateur, le bouton", () => {
    const identity = { enRetard: true, derniere: "1.5.0", mettreAJour: () => {} };
    const ailleurs = poserSection(doc, { station, identite: identity, lectureSeule: true, niveau }) as Faux;
    const texte = ailleurs.textContent;
    assert.ok(texte.includes(NOTE_SUR_PLACE));
    assert.ok(!texte.includes(METTRE_A_DAY));
    const ici = poserSection(doc, { station, identite: identity, lectureSeule: false, niveau }) as Faux;
    assert.ok(ici.textContent.includes(METTRE_A_DAY));
    assert.ok(!ici.textContent.includes(NOTE_SUR_PLACE));
  });
});
