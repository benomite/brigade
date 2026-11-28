// La page d'un projet qui cuit sur cet ordinateur (#1124) : quand la station de cet ordinateur ne
// tourne pas, rien n'en est lu, et la page le dit en une ligne au lieu de rester vide. Dès que la
// station tourne, le rail, la file et les cartes reprennent la place de cette ligne, sans
// redémarrer l'app. Un projet servi par une autre station ne la porte jamais.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { forTheBar } from "../src/bar.ts";

import type { Terminal } from "../src/terminals.ts";
import { type Played } from "./helpers/false-vue.ts";

const LINE = "this computer's station is not running";
const CONFIGURATION = { chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }, { nom: "cantine", dossier: "/tmp/cantine" }] };
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const served = (project: { nom: string }) => project.nom === "cantine";
const here = (name: string) => name === "parade";

describe("la station de cet ordinateur ne tourne pas : la barre le marque sur les projets qui cuisent ici", () => {
  test("seul un projet qui cuit ici porte « sansStation » — pas celui d'une autre station, pas quand la station tourne", () => {
    const stopped = forTheBar(CONFIGURATION, served, here, () => false).projets;
    assert.equal(stopped[0]?.sansStation, true);
    assert.equal(stopped[1]?.sansStation, undefined);
    const runs = forTheBar(CONFIGURATION, served, here, () => true).projets;
    assert.equal(runs[0]?.sansStation, undefined);
    // Sans rien dire de la station (la barre d'avant), personne n'est marqué.
    assert.equal(forTheBar(CONFIGURATION, undefined, here).projets[0]?.sansStation, undefined);
  });
});



// Ce que la page de l'espace dit au centre : le rail, ou la ligne qui le remplace.
const center = (vue: Played) => vue.element("rail");

describe("la page d'un projet qui cuit ici, station arrêtée", () => {



});
