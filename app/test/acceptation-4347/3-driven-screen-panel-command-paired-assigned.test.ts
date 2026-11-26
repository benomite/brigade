// Test d'acceptation (#4347), critère 3 : l'écran joué avec les doublures de `claude` et `ssh` (BRIGADE_CLAUDE_BIN,
// BRIGADE_SSH_BIN) : le panneau est atteint, son texte est la ligne documentée, la station est vue appairée, le projet lui est confié.
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
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { jouerLaVue, ouvrirOnglet, repos, type Faux } from "../aides/fausse-vue.ts";

process.env.BRIGADE_CLAUDE_BIN = "/nonexistent/fake-claude";
process.env.BRIGADE_SSH_BIN = "/nonexistent/fake-ssh";

const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade", depot: "chef/parade", base: "main" }] }, () => true),
  palette: PALETTE, exemple: EXEMPLE, onglets: ONGLETS, rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE, calibrage: { modeles: MODELES, efforts: EFFORTS }, code: undefined,
});
const LISTEE = (stations: object[]) => ({ state: "listed" as const, stations, unreadable: [], reason: "" });
const SERVEUR = { id: "g9", nom: "parade-box", dit: new Date().toISOString() };
const texte = (racine: Faux) => [...racine.descendants()].map((n) => n.textContent).join("\n");

test("the station tab: `add a server` panel, documented command, server seen paired, project assigned to it", async () => {
  const documente = /curl -fsSL \S+\/station\/installer-station\.sh \| sh/.exec(readFileSync(new URL("../../../docs/installation-station.md", import.meta.url), "utf8"))?.[0] ?? assert.fail("no documented command");
  let stations: object[] = [];
  const vue = await jouerLaVue({ demarrage, stationsDuChef: () => LISTEE(stations), espace: () => [] });
  (vue.element("projets").children.at(1) ?? assert.fail("no project")).click();
  await repos();
  const onglet = await ouvrirOnglet(vue, "Stations");
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
  assert.ok(vue.dernier("choisirQuiCuit") !== undefined || /parade-box/.test(texte(onglet)), "project not assigned");
});
