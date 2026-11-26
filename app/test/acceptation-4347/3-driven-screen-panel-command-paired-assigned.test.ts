// Test d'acceptation (#4347), critère 3 : l'écran joué avec les doublures de `claude` et `ssh` (BRIGADE_CLAUDE_BIN,
// BRIGADE_SSH_BIN) : le panneau est atteint, son texte est la ligne documentée, la station est vue appairée, le projet lui est confié.
// Corrigé après le gel (réponse du manager au blocage, #4347) : le panneau se cherche dans le contenu de l'onglet
// (`rail`), pas sous le bouton de son menu, qui ne porte que son titre ; les stations sont typées. Un serveur neuf
// s'enregistre seul sous le compte, sans code (runtime/src/enregistrement-station/README.md) : il arrive par la lecture
// que « Choose who cooks it » propose, `stationsDuCompte` (StationEnregistree), pas par celle des stations appairées par
// code (`stationsDuChef`). L'app a lu ses stations et leurs projets, comme à chaque démarrage — aucune ne sert parade :
// sans ces lectures, l'onglet ne dit que « Reading your stations on GitHub… ». Le projet confié se prouve par l'écriture de sa sélection (`choisirLesProjets`) et la ligne
// qui le dit, plus par un `||` lâche.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { calibrageRecommande, EFFORTS, MODELES, type VuDesProjets } from "../../src/projets/projets.ts";
import type { VuDesStations } from "../../src/stations/stations.ts";
import type { StationEnregistree, StationsDuCompte } from "../../src/stations-du-compte.ts";
import { jouerLaVue, ouvrirOnglet, repos, type Faux } from "../aides/fausse-vue.ts";

// Les doublures de « For app developers » (docs/app.md) : le faux `claude` du dépôt ; et, pour `ssh`, `false` — un appel
// échouerait sans rien joindre.
process.env.BRIGADE_CLAUDE_BIN = fileURLToPath(new URL("../aides/faux-claude.sh", import.meta.url));
process.env.BRIGADE_SSH_BIN = "false";

const A = new Date().toISOString();
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade", depot: "chef/parade", base: "main" }] }, () => true),
  palette: PALETTE, exemple: EXEMPLE, onglets: ONGLETS, rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE, calibrage: { modeles: MODELES, efforts: EFFORTS }, code: undefined,
  stations: { a: A, stations: [] } satisfies VuDesStations,
  projetsDesStations: { a: A, projets: [], locale: null, recommandee: null, avertissements: {}, machines: {}, calibrage: calibrageRecommande([]) } satisfies VuDesProjets,
});
const LISTEE = (stations: StationEnregistree[]): StationsDuCompte => ({ state: "listed", stations, unreadable: [] });
const SERVEUR: StationEnregistree = { id: "g9", name: "parade-box", platform: "linux", machine: "Debian 12", version: "1.4.0", account: "chef", available: true, registeredAt: A, lastSeen: A, stoppedAt: null, refreshMs: 120_000, selection: null };
const texte = (racine: Faux) => [...racine.descendants()].map((n) => n.textContent).join("\n");

test("the station tab: `add a server` panel, documented command, server seen paired, project assigned to it", async () => {
  const documente = /curl -fsSL \S+\/station\/installer-station\.sh \| sh/.exec(readFileSync(new URL("../../../docs/installation-station.md", import.meta.url), "utf8"))?.[0] ?? assert.fail("no documented command");
  assert.ok(existsSync(process.env.BRIGADE_CLAUDE_BIN ?? ""), "the fake claude of the repo is missing");
  let stations: StationEnregistree[] = [];
  const vue = await jouerLaVue({ demarrage, stationsDuCompte: () => LISTEE(stations), choisirLesProjets: (_id, depots) => ({ selection: depots }), espace: () => [] });
  (vue.element("projets").children.at(1) ?? assert.fail("no project")).click();
  await repos();
  await ouvrirOnglet(vue, "Stations");
  const onglet = vue.element("rail");
  const ajouter = onglet.dessous("button").find((b) => /add a server/i.test(b.textContent)) ?? assert.fail("panel not reachable: no `add a server`");
  ajouter.click();
  await repos();
  assert.ok(texte(onglet).includes(documente), "the panel's command differs from the documented one");
  assert.match(texte(onglet), /waiting for its first check-in/i);
  stations = [SERVEUR];
  (onglet.dessous("button").find((b) => /check again/i.test(b.textContent)) ?? assert.fail("no `check again`")).click();
  await repos();
  assert.ok(texte(onglet).includes("parade-box"), "the paired server is not shown");
  (onglet.dessous("button").find((b) => /choose who cooks/i.test(b.textContent) || b.textContent === "parade-box") ?? assert.fail("cannot assign the project")).click();
  await repos();
  assert.deepEqual(vue.dernier("choisirLesProjets"), ["g9", ["chef/parade"]], "project not assigned to the server");
  assert.match(texte(onglet), /parade-box was given parade/, "the screen does not say the project was given to the server");
});
