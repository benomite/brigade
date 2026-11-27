// La note « sur place » (ticket 2646, épique 2497) : sur la page d'une autre station, un réglage qui ne se change que sur
// la machine montre la note à la place de son geste ; un réglage qui se change à distance garde le sien.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { actionOrNote, NOTE_ON_SITE, noteOnSite } from "../src/vue/station/page/OnSiteNote.js";
import { PUT_A_DAY, setSection } from "../src/vue/station/page/sections/identity.js";
import { Fake } from "./helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const level = () => new Fake("span");
const station = { id: "gist-pc", nom: "pc/claude" };

describe("la note sur place", () => {
  test("elle dit que le réglage ne se change que sur la machine, son détail au survol", () => {
    const note = noteOnSite(doc) as Fake;
    assert.equal(note.textContent, NOTE_ON_SITE);
    assert.match(note.title, /only be changed on that machine/);
  });

  test("vue d'une autre station, un réglage de la machine montre la note, un réglage modifiable à distance garde son bouton", () => {
    let actions = 0;
    const action = () => { actions++; };
    const onSite = actionOrNote(doc, { lectureSeule: true }, { libelle: "Update now", geste: action }) as Fake;
    assert.equal(onSite.className, "note-sur-place");
    const aDistance = actionOrNote(doc, { lectureSeule: true }, { libelle: "Set cooks", geste: action, aDistance: true }) as Fake;
    assert.equal(aDistance.textContent, "Set cooks");
    aDistance.children[0]?.click();
    assert.equal(actions, 1);
    const here = actionOrNote(doc, { lectureSeule: false }, { libelle: "Update now", geste: action }) as Fake;
    assert.equal(here.textContent, "Update now");
  });

  test("la section identité d'une autre station en retard montre la note, jamais le bouton ; celle de cet ordinateur, le bouton", () => {
    const identity = { enRetard: true, derniere: "1.5.0", mettreAJour: () => {} };
    const elsewhere = setSection(doc, { station, identite: identity, lectureSeule: true, niveau: level }) as Fake;
    const text = elsewhere.textContent;
    assert.ok(text.includes(NOTE_ON_SITE));
    assert.ok(!text.includes(PUT_A_DAY));
    const here = setSection(doc, { station, identite: identity, lectureSeule: false, niveau: level }) as Fake;
    assert.ok(here.textContent.includes(PUT_A_DAY));
    assert.ok(!here.textContent.includes(NOTE_ON_SITE));
  });
});
