// « Stop cooking here » (#3402, projet/stations/ArretStation.js) : le geste qui arrête chaque sorte de station, et ce que la
// ligne en dit — le projet retiré, ou pourquoi rien n'a changé. Et la carte de cet ordinateur, que sa liste fait aller et
// venir (stations-tab/etat.js, `servantesDe`).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { StationVue } from "../../../src/stations/stations.ts";
import { arreter, ECHEC, ENCORE_SERVI, gesteDArret, RETIRE, type GestesDeLArret } from "../../../src/vue/projet/stations/ArretStation.js";
import { PAS_ANNONCEE, servantesDe } from "../../../src/vue/stations-tab/etat.js";

const DEPOT = "chef/parade";
// Des gestes qui notent ce qu'on leur demande ; `listeApres` : ce que la station rend de sa liste.
function gestes(options: { listeApres?: string[]; refusIci?: string; refusSelection?: string } = {}) {
  const appels: string[] = [];
  const faits: GestesDeLArret = {
    retirerIci: async (depot) => {
      appels.push(`ici ${depot}`);
      return options.refusIci === undefined ? { depots: options.listeApres ?? [] } : { refus: options.refusIci };
    },
    choisir: async (id, depots) => {
      appels.push(`selection ${id} ${depots.join(",")}`);
      return options.refusSelection === undefined ? { selection: depots } : { refus: options.refusSelection };
    },
    retirerDeclaree: async (nom) => {
      appels.push(`declaree ${nom}`);
      return {};
    },
  };
  return { appels, faits };
}
const joue = async (geste: ReturnType<typeof gesteDArret>) => (geste === undefined || "seule" in geste ? assert.fail("aucun geste") : arreter(geste));

describe("arrêter cet ordinateur", () => {
  test("sa liste le porte : il en est retiré, et la ligne dit que la station ne prend plus ses tickets", async () => {
    const { appels, faits } = gestes({ listeApres: ["chef/autre"] });
    const dit = await joue(gesteDArret({ projet: "parade", depot: DEPOT, station: { nom: "macbook", ici: true }, liste: [DEPOT, "chef/autre"] }, faits));
    assert.deepEqual(appels, [`ici ${DEPOT}`]);
    assert.deepEqual(dit, { texte: RETIRE("macbook", "parade"), refus: false, detail: "" });
  });

  test("la sélection que l'app tient pour sa station le porte aussi : il en est retiré d'abord, sans quoi la station réécrirait sa ligne", async () => {
    const { appels, faits } = gestes();
    await joue(gesteDArret({ projet: "parade", depot: DEPOT, station: { nom: "macbook", ici: true }, liste: [DEPOT], selection: { id: "gmac", depots: ["Chef/Parade", "chef/autre"] } }, faits));
    assert.deepEqual(appels, ["selection gmac chef/autre", `ici ${DEPOT}`]);
  });

  test("la sélection refuse : la liste n'est pas touchée, et la ligne dit pourquoi", async () => {
    const { appels, faits } = gestes({ refusSelection: "not saved: GitHub refused the gist — 403" });
    const dit = await joue(gesteDArret({ projet: "parade", depot: DEPOT, station: { nom: "macbook", ici: true }, liste: [DEPOT], selection: { id: "gmac", depots: [DEPOT] } }, faits));
    assert.deepEqual(appels, ["selection gmac "]);
    assert.equal(dit.refus, true);
    assert.match(dit.texte, /^nothing was changed: GitHub refused the gist/);
  });

  test("la liste relue le porte encore : rien n'a changé, et la ligne le dit", async () => {
    const { faits } = gestes({ listeApres: [DEPOT] });
    const dit = await joue(gesteDArret({ projet: "parade", depot: DEPOT, station: { nom: "macbook", ici: true }, liste: [DEPOT] }, faits));
    assert.deepEqual(dit, { texte: ENCORE_SERVI("macbook", "parade"), refus: true, detail: "" });
  });

  test("le geste lève : l'app a échoué, son détail au survol", async () => {
    const faits: GestesDeLArret = { ...gestes().faits, retirerIci: () => Promise.reject(new Error("ipc closed")) };
    const dit = await joue(gesteDArret({ projet: "parade", depot: DEPOT, station: { nom: "macbook", ici: true }, liste: [DEPOT] }, faits));
    assert.deepEqual(dit, { texte: `nothing was changed: ${ECHEC}`, refus: true, detail: "ipc closed" });
  });

  test("sa liste ne le porte pas : il le sert par une déclaration du projet, qui se retire — sauf la seule", async () => {
    const { appels, faits } = gestes();
    await joue(gesteDArret({ projet: "parade", depot: DEPOT, station: { nom: "macbook", ici: true }, liste: [], declaree: { nom: "macbook", seule: false } }, faits));
    assert.deepEqual(appels, ["declaree macbook"]);
    assert.deepEqual(gesteDArret({ projet: "parade", depot: DEPOT, station: { nom: "macbook", ici: true }, liste: [], declaree: { nom: "macbook", seule: true } }, faits), { seule: true });
    assert.equal(gesteDArret({ projet: "parade", depot: DEPOT, station: { nom: "macbook", ici: true }, liste: [] }, faits), undefined);
  });
});

test("une station du compte : sa sélection, sans le dépôt", async () => {
  const { appels, faits } = gestes();
  const dit = await joue(gesteDArret({ projet: "parade", depot: DEPOT, station: { nom: "parade-box", ici: false }, selection: { id: "gbox", depots: [DEPOT, "chef/autre"] } }, faits));
  assert.deepEqual(appels, ["selection gbox chef/autre"]);
  assert.deepEqual(dit, { texte: RETIRE("parade-box", "parade"), refus: false, detail: "" });
});

describe("la carte de cet ordinateur suit sa liste", () => {
  const MAC: StationVue = { id: "gmac", nom: "macbook", machine: "macOS 25.0.0", etat: "en-ligne", ligne: "online", pannes: [], dit: "online", version: "", projets: ["parade"], max: null };
  const BOX: StationVue = { ...MAC, id: "gbox", nom: "parade-box", machine: "Linux 6.1.0" };
  const base = { projet: "parade", stations: [MAC, BOX], locale: "gmac", maintenant: 0 };

  test("sans la liste lue, ce que les stations publient", () => {
    assert.deepEqual(servantesDe(base).map(({ nom, ici }) => [nom, ici]), [["macbook", true], ["parade-box", false]]);
  });

  test("retiré de la liste, cet ordinateur n'a plus de carte, même s'il publie encore le servir", () => {
    assert.deepEqual(servantesDe({ ...base, iciSert: false }).map(({ nom }) => nom), ["parade-box"]);
  });

  test("ajouté à la liste, il a sa carte avant de publier le servir ; sans station lue, sous le nom de cet ordinateur", () => {
    const sansLui = [{ ...MAC, projets: [] }, BOX];
    assert.deepEqual(servantesDe({ ...base, stations: sansLui, iciSert: true }).map(({ nom, ici, etat }) => [nom, ici, etat]), [["macbook", true, "en-ligne"], ["parade-box", false, "en-ligne"]]);
    const inconnue = servantesDe({ ...base, stations: [BOX], locale: null, iciSert: true, hote: "this Mac" });
    assert.deepEqual(inconnue.map(({ nom, ici, dit }) => [nom, ici, dit]), [["this Mac", true, PAS_ANNONCEE], ["parade-box", false, "online"]]);
  });
});
