// Test d'acceptation (#4347), critère 3 : l'écran joué avec les doublures de `claude` et `ssh` (BRIGADE_CLAUDE_BIN,
// BRIGADE_SSH_BIN) : le panneau est atteint, son texte est la ligne documentée, la station est vue appairée, le projet lui est confié.
// Corrigé sur la décision du manager (blocage n=1) : le panneau se cherche dans le rail, où l'onglet se dessine, et non sous
// le bouton du menu d'onglets ; les stations du chef ont la forme `StationAppairee` ; le projet confié se prouve par l'appel
// `choisirLesProjets` qui le donne à la station appairée.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { StationAppairee, StationsDuChef } from "../../src/premier-lancement.ts";
import { calibrageRecommande, EFFORTS, MODELES, type VuDesProjets } from "../../src/projets/projets.ts";
import type { StationEnregistree } from "../../src/stations-du-compte.ts";
import { jouerLaVue, ouvrirOnglet, repos, type Faux } from "../aides/fausse-vue.ts";

process.env.BRIGADE_CLAUDE_BIN = "/nonexistent/fake-claude";
process.env.BRIGADE_SSH_BIN = "/nonexistent/fake-ssh";

const A = "2026-11-26T10:00:00.000Z";
const SANS_STATION: VuDesProjets = {
  a: A,
  projets: [{ nom: "parade", depot: "chef/parade", base: "main", suiviPar: null, stations: [], servi: null, cuitSur: null, demenagement: null }],
  locale: null, recommandee: null, avertissements: {}, machines: {}, calibrage: calibrageRecommande([]),
};
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade", depot: "chef/parade", base: "main" }] }, () => true),
  palette: PALETTE, exemple: EXEMPLE, onglets: ONGLETS, rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE, calibrage: { modeles: MODELES, efforts: EFFORTS }, code: undefined,
  stations: { a: A, stations: [] }, projetsDesStations: SANS_STATION,
});
const LISTEE = (stations: StationAppairee[]): StationsDuChef => ({ state: "listed", stations, unreadable: [] });
const SERVEUR: StationAppairee = { id: "g9", name: "parade-box", machine: "Linux", kind: null, cooks: true, version: "2.4.0", online: true, lastSeen: new Date().toISOString(), stoppedAt: null, projects: [] };
const ENREGISTREE: StationEnregistree = { id: "g9", name: "parade-box", platform: "linux", machine: "Linux", version: "2.4.0", account: "chef", available: true, registeredAt: A, lastSeen: new Date().toISOString(), stoppedAt: null, refreshMs: 30_000, selection: null };
const texte = (racine: Faux) => [...racine.descendants()].map((n) => n.textContent).join("\n");

test("the station tab: `add a server` panel, documented command, server seen paired, project assigned to it", async () => {
  const documente = /curl -fsSL \S+\/station\/installer-station\.sh \| sh/.exec(readFileSync(new URL("../../../docs/installation-station.md", import.meta.url), "utf8"))?.[0] ?? assert.fail("no documented command");
  let stations: StationAppairee[] = [];
  let compte: StationEnregistree[] = [];
  const vue = await jouerLaVue({
    demarrage,
    stationsDuChef: () => LISTEE(stations),
    stationsDuCompte: () => ({ state: "listed", stations: compte, unreadable: [] }),
    choisirLesProjets: (_id, depots) => ({ selection: depots }),
    espace: () => [],
  });
  (vue.element("projets").children.at(1) ?? assert.fail("no project")).click();
  await repos();
  await ouvrirOnglet(vue, "Stations");
  const rail = vue.element("rail");
  const ajouter = rail.dessous("button").find((b) => /add a server/i.test(b.textContent)) ?? assert.fail("panel not reachable: no `add a server`");
  ajouter.click();
  await repos();
  assert.ok(texte(rail).includes(documente), "the panel's command differs from the documented one");
  assert.match(texte(rail), /waiting for its first check-in/i);
  stations = [SERVEUR];
  compte = [ENREGISTREE];
  (rail.dessous("button").find((b) => /check again/i.test(b.textContent)) ?? assert.fail("no `check again`")).click();
  await repos();
  await repos();
  assert.ok(texte(rail).includes("parade-box"), "the paired server is not shown");
  assert.match(texte(rail), /parade-box checked in/i, "the server is not said paired");
  (rail.dessous("button").find((b) => /choose who cooks/i.test(b.textContent)) ?? assert.fail("cannot assign the project")).click();
  await repos();
  await repos();
  (rail.dessous("button").find((b) => b.textContent === "parade-box") ?? assert.fail("parade-box is not offered")).click();
  await repos();
  await repos();
  assert.deepEqual(vue.dernier("choisirLesProjets"), ["g9", ["chef/parade"]], "project not assigned");
});
