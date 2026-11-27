// Le choix de station (#3195) : une seule pièce pour demander qui cuit un projet — sur l'onglet Stations (« Choose who
// cooks it », « Move to another station ») et sur la page d'un projet pas encore prêt (« 1 of 2: who cooks it », #3166).
// Cet ordinateur d'abord ; une station hors ligne n'est jamais recommandée et dit depuis quand, et comment la ramener (#3187).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { StationVue } from "../../src/stations/stations.ts";
import { setJourneyFirstProject, progression, seenOfJourney } from "../../src/vue/journey-first-project/journey-first-project.js";
import { choiceOfStation, choiceOfDisplacement, HERE, setTheChoice, type Choice } from "../../src/vue/stations-tab/choice.js";
import { isOneComputer } from "../../src/vue/stations-tab/state.js";
import { Fake } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
// Ce qu'un élément montre, tel quel : sa balise, sa classe, ses données, son texte propre, ses enfants.
type Tree = { balise: string; classe: string; donnees: Record<string, string>; texte: string; enfants: Tree[] };
const tree = (pose: Fake): Tree => ({ balise: pose.balise, classe: pose.className, donnees: { ...pose.dataset }, texte: pose.children.length === 0 ? pose.textContent : "", enfants: pose.children.map(tree) });

const NOW = Date.parse("2026-11-11T12:00:00.000Z");
const recordedOne = (id: string, name: string, available: boolean, platform = "linux") => ({
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
    const choice = choiceOfStation({ ici: true, hote: "macbook", stations: [recordedOne("g1", "parade-box", true), recordedOne("g2", "nas", false)] as never, maintenant: NOW });
    const station = { enCours: "g1" } as const;
    const seenOne = seenOfJourney({ station, second: {} });
    assert.equal(seenOne.etape, "station");
    const page = setJourneyFirstProject(doc as never, { depot: "chef/cantine", vu: seenOne as never, progression: progression(seenOne, { station }), station, choix: choice }, { choisir() {}, relire() {}, preparer() {}, ouvrirLaCarte() {} }) as unknown as Fake;
    const [list] = setTheChoice(doc as never, { choix: choice, enCours: "g1" }, () => {}) as unknown as Fake[];
    const inThePage = page.dessous("ul").find(({ className }) => className === "choix-de-station") ?? assert.fail("pas de liste de choix sur la page");
    assert.deepEqual(tree(inThePage), tree(list ?? assert.fail()));
  });

  test("cet ordinateur d'abord, son nom d'hôte après lui ; la station en ligne recommandée ; une hors ligne dit depuis quand et comment la ramener", () => {
    const choice = choiceOfStation({ ici: true, hote: "macbook", stations: [recordedOne("g2", "nas", false), recordedOne("g1", "parade-box", true)] as never, maintenant: NOW });
    assert.deepEqual(choice.map(({ cle: key, nom: name, recommande: recommended, horsLigne: outsideLine }) => [key, name, recommended, outsideLine]), [[HERE, "this computer", false, false], ["g1", "parade-box", true, false], ["g2", "nas", false, true]]);
    const chosen: Choice[] = [];
    const [list] = setTheChoice(doc as never, { choix: choice }, (oneOf) => chosen.push(oneOf)) as unknown as Fake[];
    const lines = list?.children ?? [];
    assert.deepEqual(lines.map(({ dataset }) => dataset.choix), [HERE, "g1", "g2"]);
    assert.equal(lines[0]?.dessous("span").find(({ className }) => className === "hote mono")?.textContent, "macbook");
    assert.equal(lines[1]?.dessous("button")[0]?.dataset.bouton, "recommande");
    assert.match(lines[2]?.textContent ?? "", /^nasOffline for 22 min: switch nas on, or start its brigade-station service there/);
    lines[2]?.dessous("button")[0]?.click();
    assert.deepEqual(chosen.map(({ cle: key }) => key), ["g2"]);
  });

  test("un choix qui s'écrit grise les boutons et le dit sur sa ligne ; un refus se dit en une ligne", () => {
    const choice = choiceOfStation({ ici: true, stations: [], maintenant: NOW });
    const [list, refusal] = setTheChoice(doc as never, { choix: choice, enCours: HERE, refus: { ligne: "nothing was written: GitHub refused", detail: "403" } }, () => {}) as unknown as Fake[];
    assert.equal(list?.dessous("button")[0]?.disabled, true);
    assert.match(list?.textContent ?? "", /Saving…/);
    assert.match(refusal?.textContent ?? "", /nothing was written: GitHub refused/);
  });

  test("le choix d'un déménagement : cet ordinateur d'abord, recommandé en ligne ; une box hors ligne dit comment la ramener", () => {
    const choice = choiceOfDisplacement([vue("gbox", "nas", "hors-ligne", "Linux 6.1.0"), vue("gpc", "pc", "en-ligne", "Windows 11"), vue("gmac", "macbook", "en-ligne", "macOS 25.0.0")], { locale: "gmac", ordinateur: isOneComputer });
    assert.deepEqual(choice.map(({ cle: key, nom: name, recommande: recommended, hote: host }) => [key, name, recommended, host]), [["gmac", "this computer", true, "macbook"], ["gpc", "pc", false, undefined], ["gbox", "nas", false, undefined]]);
    assert.equal(choice[2]?.absente, "Offline for 22 min: switch nas on, or start its brigade-station service there: it starts with the machine");
  });
});
