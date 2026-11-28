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
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";

import { TABS, HEADINGS } from "../../src/tabs.ts";
import { calibrationRecommended, EFFORTS, MODELS, type SeenOfProjects } from "../../src/projects/projects.ts";
import type { SeenOfStations } from "../../src/stations/stations.ts";
import type { StationRecorded, StationsOfAccount } from "../../src/stations-of-account.ts";
import { playTheVue, openTab, repos, type Fake } from "../helpers/false-vue.ts";

// Les doublures de « For app developers » (docs/app.md) : le faux `claude` du dépôt ; et, pour `ssh`, `false` — un appel
// échouerait sans rien joindre.
process.env.BRIGADE_CLAUDE_BIN = fileURLToPath(new URL("../helpers/fake-claude.sh", import.meta.url));
process.env.BRIGADE_SSH_BIN = "false";

const A = new Date().toISOString();
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade", depot: "chef/parade", base: "main" }] }, () => true),
  palette: PALETTE, exemple: EXAMPLE, onglets: TABS, rubriques: HEADINGS,
  gestes: {},
  calibrage: { modeles: MODELS, efforts: EFFORTS }, stations: { a: A, stations: [] } satisfies SeenOfStations,
  projetsDesStations: { a: A, projets: [], locale: null, recommandee: null, avertissements: {}, machines: {}, calibrage: calibrationRecommended([]) } satisfies SeenOfProjects,
});
const LISTED = (stations: StationRecorded[]): StationsOfAccount => ({ state: "listed", stations, unreadable: [] });
const SERVER: StationRecorded = { id: "g9", name: "parade-box", platform: "linux", machine: "Debian 12", version: "1.4.0", account: "chef", available: true, registeredAt: A, lastSeen: A, stoppedAt: null, refreshMs: 120_000, selection: null };
const text = (root: Fake) => [...root.descendants()].map((n) => n.textContent).join("\n");

test("the station tab: `add a server` panel, documented command, server seen paired, project assigned to it", async () => {
  const documented = /curl -fsSL \S+\/station\/installer-station\.sh \| sh/.exec(readFileSync(new URL("../../../docs/installation-station.md", import.meta.url), "utf8"))?.[0] ?? assert.fail("no documented command");
  assert.ok(existsSync(process.env.BRIGADE_CLAUDE_BIN ?? ""), "the fake claude of the repo is missing");
  let stations: StationRecorded[] = [];
  const vue = await playTheVue({ demarrage: startup, stationsDuCompte: () => LISTED(stations), choisirLesProjets: (_id, repositories) => ({ selection: repositories }), espace: () => [] });
  (vue.element("projets").children.at(1) ?? assert.fail("no project")).click();
  await repos();
  await openTab(vue, "Stations");
  const tab = vue.element("rail");
  const add = tab.dessous("button").find((b) => /add a server/i.test(b.textContent)) ?? assert.fail("panel not reachable: no `add a server`");
  add.click();
  await repos();
  assert.ok(text(tab).includes(documented), "the panel's command differs from the documented one");
  assert.match(text(tab), /waiting for its first check-in/i);
  stations = [SERVER];
  (tab.dessous("button").find((b) => /check again/i.test(b.textContent)) ?? assert.fail("no `check again`")).click();
  await repos();
  assert.ok(text(tab).includes("parade-box"), "the paired server is not shown");
  (tab.dessous("button").find((b) => /choose who cooks/i.test(b.textContent) || b.textContent === "parade-box") ?? assert.fail("cannot assign the project")).click();
  await repos();
  assert.deepEqual(vue.dernier("choisirLesProjets"), ["g9", ["chef/parade"]], "project not assigned to the server");
  assert.match(text(tab), /parade-box was given parade/, "the screen does not say the project was given to the server");
});
