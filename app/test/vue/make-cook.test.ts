// "Make this computer cook" (#4744) in the vue: the offer shows where no station is installed, its button asks the main
// process to start the install and shows the command; with a station installed, nothing shows.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Home } from "../../src/home.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { BANNER } from "../../src/facts.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { calibrationRecommended, EFFORTS, MODELS, type SeenOfProjects } from "../../src/projects/projects.ts";
import type { SeenOfStations } from "../../src/stations/stations.ts";
import { ACTION, OFFER, PASTE, setMakeCook } from "../../src/vue/make-cook/make-cook.js";
import { Fake, playTheVue, repos } from "../helpers/false-vue.ts";

const COMMAND = "gh release download station --pattern 'brigade-station-*-darwin-arm64.tar.gz' && sudo ./install.sh";
const A = "2026-11-11T10:00:00.000Z";
const HOME: Home = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
const PARADE: Project = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE] }),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
  stations: { a: A, stations: [] } satisfies SeenOfStations,
  accueil: HOME,
  projetsDesStations: { a: A, projets: [], recommandee: null, avertissements: {}, machines: {}, calibrage: calibrationRecommended([]) } satisfies SeenOfProjects,
});
const texts = (root: Fake) => [...root.descendants()].map(({ textContent }) => textContent);

describe("make this computer cook, in the vue", () => {
  test("no station: the offer shows, its button starts the install and shows the command", async () => {
    const played = await playTheVue({
      demarrage: () => startup(),
      espace: () => [],
      offreDeCuisiner: async () => ({ offered: true, command: COMMAND }),
      cuisinerIci: async () => ({ commande: COMMAND }),
    });
    await repos();
    const section = played.element("faire-cuisiner");
    assert.equal(section.hidden, false);
    assert.ok(texts(section).includes(OFFER));
    section.dessous("button").find(({ textContent }) => textContent === ACTION)?.click();
    await repos();
    assert.ok(played.appels.some(({ geste }) => geste === "cuisinerIci"));
    assert.ok(texts(section).includes(PASTE));
    assert.ok(texts(section).includes(COMMAND));
    assert.match(COMMAND, /darwin-arm64.*install\.sh/);
  });

  test("a station installed: no offer", async () => {
    const played = await playTheVue({ demarrage: () => startup(), espace: () => [], offreDeCuisiner: async () => ({ offered: false }) });
    await repos();
    assert.equal(played.element("faire-cuisiner").hidden, true);
  });

  test("a refusal is said", () => {
    const line: Fake = setMakeCook({ createElement: (tag: string) => new Fake(tag) }, { stage: "refused", reason: "nope" }, { make: () => {} });
    assert.ok(texts(line).includes("nope"));
  });
});
