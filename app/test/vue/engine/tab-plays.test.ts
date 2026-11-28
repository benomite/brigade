// Le moteur sur la carte, l'app jouée (#3746) : l'onglet Stations d'un projet que ce Mac sert. Sa carte dit le moteur que les
// réglages de sa station gardent (lus par le pont, du vrai magasin de l'app dans un dossier d'essai) ; quand `facts` publie
// que la station cuit sur son secours, la carte dit sur lequel, pourquoi et jusqu'à quand.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import type { Home } from "../../../src/home.ts";
import { putAside } from "../../../src/awaiting.ts";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE, type Project } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { holdFacts } from "../../../src/facts.ts";
import { TABS, HEADINGS } from "../../../src/tabs.ts";
import { calibrationRecommended, EFFORTS, machineProposed, MODELS, type ProjectSeen, type SeenOfProjects } from "../../../src/projects/projects.ts";
import { writeSettingsOfTheStation, readSettingsOfTheStation } from "../../../src/settings-of-the-station.ts";
import type { StationVue, SeenOfStations } from "../../../src/stations/stations.ts";
import { type Played, playTheVue, openTab, repos } from "../../helpers/false-vue.ts";

process.env.TZ = "UTC";
const A = "2026-11-12T10:00:00.000Z";
const REPOSITORY = "benomite/parade";
const MAC: StationVue = { id: "gmac", nom: "macbook", machine: "macOS 25.0.0", coeurs: 12, etat: "en-ligne", ligne: "online", dit: "online", version: "2.4.0", projets: ["parade"], max: "connectee" };
const HOME: Home = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
const PARADE: Project = { nom: "parade", dossier: "/tmp/parade", depot: REPOSITORY, base: "main" };
const ON_THIS_MAC: ProjectSeen = { nom: "parade", depot: REPOSITORY, base: "main", suiviPar: undefined, stations: [], servi: null, cuitSur: null, demenagement: null } as never;
const SEEN: SeenOfProjects = { a: A, projets: [ON_THIS_MAC], locale: "gmac", recommandee: "gmac", avertissements: {}, machines: { gmac: machineProposed(MAC) }, calibrage: calibrationRecommended([]) };
const lineOfMac = { station: "macbook/claude", distante: false, plafond: 2, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: "idle", arreteeDepuis: null, refus: null, presente: true, cooks: [] };
const facts = (line: object) => ({ etat: "ouverte", lu: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, cooks: [], attend: [], livres: [], stations: [line] });

const roots: string[] = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

// Ce Mac sert parade ; ses réglages gardent `engine` ; `facts` publie sa ligne.
async function thePage(engine: string | undefined, line: object) {
  const root = mkdtempSync(join(tmpdir(), "moteur-onglet-"));
  roots.push(root);
  const file = join(root, "station-reglages.json");
  if (engine !== undefined) assert.ok(!("refus" in writeSettingsOfTheStation(file, { engine })));
  const vue = await playTheVue({
    demarrage: () => ({
      configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE] }, () => true, (name) => name === "parade"),
      palette: PALETTE,
      exemple: EXAMPLE,
      onglets: TABS,
      rubriques: HEADINGS,
      gestes: {},
      calibrage: { modeles: MODELS, efforts: EFFORTS },
      stations: { a: A, stations: [MAC] } satisfies SeenOfStations,
      accueil: HOME,
      projetsDesStations: SEEN,
    }),
    espace: () => [],
    projetsServis: () => ({ depots: [REPOSITORY] }),
    lireReglagesDeLaStation: () => readSettingsOfTheStation(file, { clone: "/st/clones", worktrees: "/st/worktrees" }),
  } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  const heldOnes = holdFacts();
  const receivedOne = heldOnes.recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts(line)) }] });
  const drawable = heldOnes.attendre(putAside({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "status", texte: "" }] })) ?? receivedOne;
  vue.dire("surFaits", { ...drawable, demande: vue.dernier("faits")[0] as number });
  await repos();
  await openTab(vue, "Stations");
  for (let tour = 0; tour < 4; tour++) await repos();
  return vue;
}

const card = (vue: Played) => vue.element("rail").dessous("section").find(({ className }) => className === "carte-de-station") ?? assert.fail("pas de carte");
const line = (vue: Played, classe: string) => card(vue).dessous("p").find(({ className }) => className === classe);

describe("le moteur sur la carte de cet ordinateur, l'app jouée (#3746)", () => {
  test("la carte dit le moteur que les réglages de sa station gardent", async () => {
    const vue = await thePage("codex", lineOfMac);
    assert.equal(line(vue, "moteur-de-la-carte")?.textContent, "engine: Codex");
    assert.equal(line(vue, "moteur-en-secours"), undefined);
  });

  test("sans moteur gardé, la carte dit l'abonnement Claude, le moteur par défaut", async () => {
    const vue = await thePage(undefined, lineOfMac);
    assert.equal(line(vue, "moteur-de-la-carte")?.textContent, "engine: Claude subscription");
  });

  test("quand `facts` la dit sur son secours, la carte dit sur lequel et jusqu'à quand", async () => {
    const vue = await thePage("claude-subscription", { ...lineOfMac, engine: { chosen: "claude-subscription", active: "claude-api-key", onFallback: true, blockedUntil: "2026-11-12T18:30:00Z" } });
    assert.equal(line(vue, "moteur-de-la-carte")?.textContent, "engine: Claude subscription");
    assert.equal(line(vue, "moteur-en-secours")?.textContent, "cooking on the API key: the subscription's cap is reached until Nov 12, 06:30 PM");
  });
});
