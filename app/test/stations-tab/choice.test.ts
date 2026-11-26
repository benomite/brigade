// Le choix de station (#3195) : une seule pièce pour demander qui cuit un projet — sur l'onglet Stations (« Choose who
// cooks it », « Move to another station ») et sur la page d'un projet pas encore prêt (« 1 of 2: who cooks it », #3166).
// Cet ordinateur d'abord ; une station hors ligne n'est jamais recommandée et dit depuis quand, et comment la ramener (#3187).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { StationVue } from "../../src/stations/stations.ts";
import { poserJourneyFirstProject, progression, vuDuJourney } from "../../src/vue/journey-first-project/journey-first-project.js";
import { choiceDeStation, choiceDuDeplacement, ICI, poserLesChoice, type Choice } from "../../src/vue/stations-tab/choice.js";
import { estUnOrdinateur } from "../../src/vue/stations-tab/state.js";
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
const vue = (id: string, name: string, state: StationVue["etat"], machine: string): StationVue => ({ id, nom: name, machine, etat: state, ligne: "", pannes: [], dit: state === "en-ligne" ? "online" : "offline for 22 min", version: "2.4.0", projets: [], max: null });

describe("le choix de station, une seule pièce (#3195)", () => {
  test("la question « who cooks it » d'un projet pas encore prêt (#3166) pose exactement la liste du choix de l'onglet", () => {
    const choice = choiceDeStation({ ici: true, hote: "macbook", stations: [enregistree("g1", "parade-box", true), enregistree("g2", "nas", false)] as never, maintenant: MAINTENANT });
    const station = { enCours: "g1" } as const;
    const vu = vuDuJourney({ station, second: {} });
    assert.equal(vu.etape, "station");
    const page = poserJourneyFirstProject(doc as never, { depot: "chef/cantine", vu: vu as never, progression: progression(vu, { station }), station, choix: choice }, { choisir() {}, relire() {}, preparer() {}, ouvrirLaCarte() {} }) as unknown as Faux;
    const [liste] = poserLesChoice(doc as never, { choix: choice, enCours: "g1" }, () => {}) as unknown as Faux[];
    const dansLaPage = page.dessous("ul").find(({ className }) => className === "choix-de-station") ?? assert.fail("pas de liste de choix sur la page");
    assert.deepEqual(arbre(dansLaPage), arbre(liste ?? assert.fail()));
  });

  test("cet ordinateur d'abord, son nom d'hôte après lui ; la station en ligne recommandée ; une hors ligne dit depuis quand et comment la ramener", () => {
    const choice = choiceDeStation({ ici: true, hote: "macbook", stations: [enregistree("g2", "nas", false), enregistree("g1", "parade-box", true)] as never, maintenant: MAINTENANT });
    assert.deepEqual(choice.map(({ cle, nom: name, recommande, horsLigne: outsideLine }) => [cle, name, recommande, outsideLine]), [[ICI, "this computer", false, false], ["g1", "parade-box", true, false], ["g2", "nas", false, true]]);
    const choisis: Choice[] = [];
    const [liste] = poserLesChoice(doc as never, { choix: choice }, (un) => choisis.push(un)) as unknown as Faux[];
    const lines = liste?.children ?? [];
    assert.deepEqual(lines.map(({ dataset }) => dataset.choix), [ICI, "g1", "g2"]);
    assert.equal(lines[0]?.dessous("span").find(({ className }) => className === "hote mono")?.textContent, "macbook");
    assert.equal(lines[1]?.dessous("button")[0]?.dataset.bouton, "recommande");
    assert.match(lines[2]?.textContent ?? "", /^nasOffline for 22 min: switch nas on, or start its brigade-station service there/);
    lines[2]?.dessous("button")[0]?.click();
    assert.deepEqual(choisis.map(({ cle }) => cle), ["g2"]);
  });

  test("un choix qui s'écrit grise les boutons et le dit sur sa ligne ; un refus se dit en une ligne", () => {
    const choice = choiceDeStation({ ici: true, stations: [], maintenant: MAINTENANT });
    const [liste, refusal] = poserLesChoice(doc as never, { choix: choice, enCours: ICI, refus: { ligne: "nothing was written: GitHub refused", detail: "403" } }, () => {}) as unknown as Faux[];
    assert.equal(liste?.dessous("button")[0]?.disabled, true);
    assert.match(liste?.textContent ?? "", /Saving…/);
    assert.match(refusal?.textContent ?? "", /nothing was written: GitHub refused/);
  });

  test("le choix d'un déménagement : cet ordinateur d'abord, recommandé en ligne ; une box hors ligne dit comment la ramener", () => {
    const choice = choiceDuDeplacement([vue("gbox", "nas", "hors-ligne", "Linux 6.1.0"), vue("gpc", "pc", "en-ligne", "Windows 11"), vue("gmac", "macbook", "en-ligne", "macOS 25.0.0")], { locale: "gmac", ordinateur: estUnOrdinateur });
    assert.deepEqual(choice.map(({ cle, nom: name, recommande, hote }) => [cle, name, recommande, hote]), [["gmac", "this computer", true, "macbook"], ["gpc", "pc", false, undefined], ["gbox", "nas", false, undefined]]);
    assert.equal(choice[2]?.absente, "Offline for 22 min: switch nas on, or start its brigade-station service there: it starts with the machine");
  });
});
