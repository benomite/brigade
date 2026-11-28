// « Stop cooking here » (#3402, project/stations/StopStation.js) : le geste qui arrête chaque sorte de station, et ce que la
// ligne en dit — le projet retiré, ou pourquoi rien n'a changé. Et la carte de cet ordinateur, que sa liste fait aller et
// venir (stations-tab/state.js, `servantesDe`).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { StationVue } from "../../../src/stations/stations.ts";
import { haltStation, FAILURE, STILL_SERVED, actionOfStop, REMOVED, type ActionsOfTheStop } from "../../../src/vue/project/stations/StopStation.js";
import { NOT_ANNOUNCED, servingOf } from "../../../src/vue/stations-tab/state.js";

const REPOSITORY = "chef/parade";
// Des gestes qui notent ce qu'on leur demande ; `listeApres` : ce que la station rend de sa liste.
function actions(options: { listeApres?: string[]; refusIci?: string; refusSelection?: string } = {}) {
  const calls: string[] = [];
  const facts: ActionsOfTheStop = {
    retirerIci: async (repository) => {
      calls.push(`ici ${repository}`);
      return options.refusIci === undefined ? { depots: options.listeApres ?? [] } : { refus: options.refusIci };
    },
    choisir: async (id, repositories) => {
      calls.push(`selection ${id} ${repositories.join(",")}`);
      return options.refusSelection === undefined ? { selection: repositories } : { refus: options.refusSelection };
    },
  };
  return { appels: calls, faits: facts };
}
const plays = async (action: ReturnType<typeof actionOfStop>) => (action === undefined ? assert.fail("aucun geste") : haltStation(action));

describe("arrêter cet ordinateur", () => {
  test("sa liste le porte : il en est retiré, et la ligne dit que la station ne prend plus ses tickets", async () => {
    const { appels: calls, faits: facts } = actions({ listeApres: ["chef/autre"] });
    const said = await plays(actionOfStop({ projet: "parade", depot: REPOSITORY, station: { nom: "macbook", ici: true }, liste: [REPOSITORY, "chef/autre"] }, facts));
    assert.deepEqual(calls, [`ici ${REPOSITORY}`]);
    assert.deepEqual(said, { texte: REMOVED("macbook", "parade"), refus: false, detail: "" });
  });

  test("la sélection que l'app tient pour sa station le porte aussi : il en est retiré d'abord, sans quoi la station réécrirait sa ligne", async () => {
    const { appels: calls, faits: facts } = actions();
    await plays(actionOfStop({ projet: "parade", depot: REPOSITORY, station: { nom: "macbook", ici: true }, liste: [REPOSITORY], selection: { id: "gmac", depots: ["Chef/Parade", "chef/autre"] } }, facts));
    assert.deepEqual(calls, ["selection gmac chef/autre", `ici ${REPOSITORY}`]);
  });

  test("la sélection refuse : la liste n'est pas touchée, et la ligne dit pourquoi", async () => {
    const { appels: calls, faits: facts } = actions({ refusSelection: "not saved: GitHub refused the gist — 403" });
    const said = await plays(actionOfStop({ projet: "parade", depot: REPOSITORY, station: { nom: "macbook", ici: true }, liste: [REPOSITORY], selection: { id: "gmac", depots: [REPOSITORY] } }, facts));
    assert.deepEqual(calls, ["selection gmac "]);
    assert.equal(said.refus, true);
    assert.match(said.texte, /^nothing was changed: GitHub refused the gist/);
  });

  test("la liste relue le porte encore : rien n'a changé, et la ligne le dit", async () => {
    const { faits: facts } = actions({ listeApres: [REPOSITORY] });
    const said = await plays(actionOfStop({ projet: "parade", depot: REPOSITORY, station: { nom: "macbook", ici: true }, liste: [REPOSITORY] }, facts));
    assert.deepEqual(said, { texte: STILL_SERVED("macbook", "parade"), refus: true, detail: "" });
  });

  test("le geste lève : l'app a échoué, son détail au survol", async () => {
    const facts: ActionsOfTheStop = { ...actions().faits, retirerIci: () => Promise.reject(new Error("ipc closed")) };
    const said = await plays(actionOfStop({ projet: "parade", depot: REPOSITORY, station: { nom: "macbook", ici: true }, liste: [REPOSITORY] }, facts));
    assert.deepEqual(said, { texte: `nothing was changed: ${FAILURE}`, refus: true, detail: "ipc closed" });
  });

  test("sa liste ne le porte pas, et rien d'autre : l'app n'a aucun geste pour l'arrêter", () => {
    const { faits: facts } = actions();
    assert.equal(actionOfStop({ projet: "parade", depot: REPOSITORY, station: { nom: "macbook", ici: true }, liste: [] }, facts), undefined);
  });
});

test("une station du compte : sa sélection, sans le dépôt", async () => {
  const { appels: calls, faits: facts } = actions();
  const said = await plays(actionOfStop({ projet: "parade", depot: REPOSITORY, station: { nom: "parade-box", ici: false }, selection: { id: "gbox", depots: [REPOSITORY, "chef/autre"] } }, facts));
  assert.deepEqual(calls, ["selection gbox chef/autre"]);
  assert.deepEqual(said, { texte: REMOVED("parade-box", "parade"), refus: false, detail: "" });
});

describe("la carte de cet ordinateur suit sa liste", () => {
  const MAC: StationVue = { id: "gmac", nom: "macbook", machine: "macOS 25.0.0", etat: "en-ligne", ligne: "online", dit: "online", version: "", projets: ["parade"], max: null };
  const BOX: StationVue = { ...MAC, id: "gbox", nom: "parade-box", machine: "Linux 6.1.0" };
  const base = { projet: "parade", stations: [MAC, BOX], locale: "gmac", maintenant: 0 };

  test("sans la liste lue, ce que les stations publient", () => {
    assert.deepEqual(servingOf(base).map(({ nom: name, ici: here }) => [name, here]), [["macbook", true], ["parade-box", false]]);
  });

  test("retiré de la liste, cet ordinateur n'a plus de carte, même s'il publie encore le servir", () => {
    assert.deepEqual(servingOf({ ...base, iciSert: false }).map(({ nom: name }) => name), ["parade-box"]);
  });

  test("ajouté à la liste, il a sa carte avant de publier le servir ; sans station lue, sous le nom de cet ordinateur", () => {
    const withoutIt = [{ ...MAC, projets: [] }, BOX];
    assert.deepEqual(servingOf({ ...base, stations: withoutIt, iciSert: true }).map(({ nom: name, ici: here, etat: state }) => [name, here, state]), [["macbook", true, "en-ligne"], ["parade-box", false, "en-ligne"]]);
    const unknown = servingOf({ ...base, stations: [BOX], locale: null, iciSert: true, hote: "this Mac" });
    assert.deepEqual(unknown.map(({ nom: name, ici: here, dit: said }) => [name, here, said]), [["this Mac", true, NOT_ANNOUNCED], ["parade-box", false, "online"]]);
  });
});
