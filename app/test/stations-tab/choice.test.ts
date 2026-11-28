// Le choix de station (#3195) : une seule pièce pour demander qui cuit un projet — sur l'onglet Stations (« Choose who
// cooks it », « Move to another station »).
// Cet ordinateur d'abord ; une station hors ligne n'est jamais recommandée et dit depuis quand, et comment la ramener (#3187).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { StationVue } from "../../src/stations/stations.ts";
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
const vue = (id: string, name: string, state: StationVue["etat"], machine: string): StationVue => ({ id, nom: name, machine, etat: state, ligne: "", dit: state === "en-ligne" ? "online" : "offline for 22 min", version: "2.4.0", projets: [], max: null });

describe("le choix de station, une seule pièce (#3195)", () => {

  test("un choix qui s'écrit grise les boutons et le dit sur sa ligne ; un refus se dit en une ligne", () => {
    const choice = choiceOfStation({ ici: true,  maintenant: NOW });
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
