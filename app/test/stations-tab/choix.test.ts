// Le choix de station (#3195) : une seule pièce pour demander qui cuit un projet — sur l'onglet Stations (« Choose who
// cooks it », « Move to another station ») et sur la page d'un projet pas encore prêt (« 1 of 2: who cooks it », #3166).
// Cet ordinateur d'abord ; une station hors ligne n'est jamais recommandée et dit depuis quand, et comment la ramener (#3187).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { StationVue } from "../../src/stations/stations.ts";
import { poserParcoursPremierProjet, progression, vuDuParcours } from "../../src/vue/parcours-premier-projet/parcours-premier-projet.js";
import { choixDeStation, choixDuDeplacement, ICI, poserLesChoix, type Choix } from "../../src/vue/stations-tab/choix.js";
import { estUnOrdinateur } from "../../src/vue/stations-tab/etat.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
// Ce qu'un élément montre, tel quel : sa balise, sa classe, ses données, son texte propre, ses enfants.
type Arbre = { balise: string; classe: string; donnees: Record<string, string>; texte: string; enfants: Arbre[] };
const arbre = (pose: Faux): Arbre => ({ balise: pose.balise, classe: pose.className, donnees: { ...pose.dataset }, texte: pose.children.length === 0 ? pose.textContent : "", enfants: pose.children.map(arbre) });

const MAINTENANT = Date.parse("2026-11-11T12:00:00.000Z");
const enregistree = (id: string, name: string, available: boolean, platform = "linux") => ({
  id,
  name,
  platform,
  machine: "",
  version: "2.4.0",
  registeredAt: "2026-10-01T08:00:00.000Z",
  lastSeen: "2026-11-11T11:38:00.000Z",
  refreshMs: 120_000,
  stoppedAt: null,
  available,
  selection: [],
});
const vue = (id: string, nom: string, etat: StationVue["etat"], machine: string): StationVue => ({ id, nom, machine, etat, ligne: "", pannes: [], dit: etat === "en-ligne" ? "online" : "offline for 22 min", version: "2.4.0", projets: [], max: null });

describe("le choix de station, une seule pièce (#3195)", () => {
  test("la question « who cooks it » d'un projet pas encore prêt (#3166) pose exactement la liste du choix de l'onglet", () => {
    const choix = choixDeStation({ ici: true, hote: "macbook", stations: [enregistree("g1", "parade-box", true), enregistree("g2", "nas", false)] as never, maintenant: MAINTENANT });
    const station = { enCours: "g1" } as const;
    const vu = vuDuParcours({ station, second: {} });
    assert.equal(vu.etape, "station");
    const page = poserParcoursPremierProjet(doc as never, { depot: "chef/cantine", vu: vu as never, progression: progression(vu, { station }), station, choix }, { choisir() {}, relire() {}, preparer() {}, ouvrirLaCarte() {} }) as unknown as Faux;
    const [liste] = poserLesChoix(doc as never, { choix, enCours: "g1" }, () => {}) as unknown as Faux[];
    const dansLaPage = page.dessous("ul").find(({ className }) => className === "choix-de-station") ?? assert.fail("pas de liste de choix sur la page");
    assert.deepEqual(arbre(dansLaPage), arbre(liste ?? assert.fail()));
  });

  test("cet ordinateur d'abord, son nom d'hôte après lui ; la station en ligne recommandée ; une hors ligne dit depuis quand et comment la ramener", () => {
    const choix = choixDeStation({ ici: true, hote: "macbook", stations: [enregistree("g2", "nas", false), enregistree("g1", "parade-box", true)] as never, maintenant: MAINTENANT });
    assert.deepEqual(choix.map(({ cle, nom, recommande, horsLigne }) => [cle, nom, recommande, horsLigne]), [[ICI, "this computer", false, false], ["g1", "parade-box", true, false], ["g2", "nas", false, true]]);
    const choisis: Choix[] = [];
    const [liste] = poserLesChoix(doc as never, { choix }, (un) => choisis.push(un)) as unknown as Faux[];
    const lignes = liste?.children ?? [];
    assert.deepEqual(lignes.map(({ dataset }) => dataset.choix), [ICI, "g1", "g2"]);
    assert.equal(lignes[0]?.dessous("span").find(({ className }) => className === "hote mono")?.textContent, "macbook");
    assert.equal(lignes[1]?.dessous("button")[0]?.dataset.bouton, "recommande");
    assert.match(lignes[2]?.textContent ?? "", /^nasOffline for 22 min: switch nas on, or start its brigade-station service there/);
    lignes[2]?.dessous("button")[0]?.click();
    assert.deepEqual(choisis.map(({ cle }) => cle), ["g2"]);
  });

  test("un choix qui s'écrit grise les boutons et le dit sur sa ligne ; un refus se dit en une ligne", () => {
    const choix = choixDeStation({ ici: true, stations: [], maintenant: MAINTENANT });
    const [liste, refus] = poserLesChoix(doc as never, { choix, enCours: ICI, refus: { ligne: "nothing was written: GitHub refused", detail: "403" } }, () => {}) as unknown as Faux[];
    assert.equal(liste?.dessous("button")[0]?.disabled, true);
    assert.match(liste?.textContent ?? "", /Saving…/);
    assert.match(refus?.textContent ?? "", /nothing was written: GitHub refused/);
  });

  test("le choix d'un déménagement : cet ordinateur d'abord, recommandé en ligne ; une box hors ligne dit comment la ramener", () => {
    const choix = choixDuDeplacement([vue("gbox", "nas", "hors-ligne", "Linux 6.1.0"), vue("gpc", "pc", "en-ligne", "Windows 11"), vue("gmac", "macbook", "en-ligne", "macOS 25.0.0")], { locale: "gmac", ordinateur: estUnOrdinateur });
    assert.deepEqual(choix.map(({ cle, nom, recommande, hote }) => [cle, nom, recommande, hote]), [["gmac", "this computer", true, "macbook"], ["gpc", "pc", false, undefined], ["gbox", "nas", false, undefined]]);
    assert.equal(choix[2]?.absente, "Offline for 22 min: switch nas on, or start its brigade-station service there: it starts with the machine");
  });
});
