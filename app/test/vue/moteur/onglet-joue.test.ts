// Le moteur sur la carte, l'app jouée (#3746) : l'onglet Stations d'un projet que ce Mac sert. Sa carte dit le moteur que les
// réglages de sa station gardent (lus par le pont, du vrai magasin de l'app dans un dossier d'essai) ; quand `facts` publie
// que la station cuit sur son secours, la carte dit sur lequel, pourquoi et jusqu'à quand.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { ajouterProjetServi, lireProjetsServis } from "../../../../runtime/src/station-ordinateur/projets-servis.ts";
import type { Accueil } from "../../../src/accueil.ts";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { mettreAPart } from "../../../src/attend.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE, tenirFaits } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import type { Panne } from "../../../src/pannes/pannes.ts";
import { calibrageRecommande, EFFORTS, machineProposee, MODELES, type ProjetVu, type VuDesProjets } from "../../../src/projets/projets.ts";
import { ecrireReglagesDeLaStation, lireReglagesDeLaStation } from "../../../src/reglages-de-la-station.ts";
import type { StationVue, VuDesStations } from "../../../src/stations/stations.ts";
import { type Jouee, jouerLaVue, ouvrirOnglet, repos } from "../../aides/fausse-vue.ts";

process.env.TZ = "UTC";
const A = "2026-11-12T10:00:00.000Z";
const DEPOT = "benomite/parade";
const MAC: StationVue = { id: "gmac", nom: "macbook", machine: "macOS 25.0.0", coeurs: 12, etat: "en-ligne", ligne: "online", pannes: [] as Panne[], dit: "online", version: "2.4.0", projets: ["parade"], max: "connectee" };
const ACCUEIL: Accueil = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", depot: DEPOT, base: "main" };
const SUR_CE_MAC: ProjetVu = { nom: "parade", depot: DEPOT, base: "main", suiviPar: undefined, stations: [], servi: null, cuitSur: null, demenagement: null } as never;
const VU: VuDesProjets = { a: A, projets: [SUR_CE_MAC], locale: "gmac", recommandee: "gmac", avertissements: {}, machines: { gmac: machineProposee(MAC) }, calibrage: calibrageRecommande([]) };
const ligneDuMac = { station: "macbook/claude", distante: false, plafond: 2, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: "idle", arreteeDepuis: null, refus: null, presente: true, cooks: [] };
const faits = (ligne: object) => ({ etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [], livres: [], stations: [ligne] });

const racines: string[] = [];
after(() => {
  for (const racine of racines) rmSync(racine, { recursive: true, force: true });
});

// Ce Mac sert parade ; ses réglages gardent `engine` ; `facts` publie sa ligne.
async function laPage(engine: string | undefined, ligne: object) {
  const racine = mkdtempSync(join(tmpdir(), "moteur-onglet-"));
  racines.push(racine);
  ajouterProjetServi(racine, DEPOT);
  const fichier = join(racine, "station-reglages.json");
  if (engine !== undefined) assert.ok(!("refus" in ecrireReglagesDeLaStation(fichier, { engine })));
  const vue = await jouerLaVue({
    demarrage: () => ({
      configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE] }, () => true, (nom) => nom === "parade"),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS,
      rubriques: RUBRIQUES,
      gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
      stations: { a: A, stations: [MAC] } satisfies VuDesStations,
      accueil: ACCUEIL,
      projetsDesStations: VU,
    }),
    espace: () => [],
    projetsServis: () => ({ depots: lireProjetsServis(racine) }),
    lireReglagesDeLaStation: () => lireReglagesDeLaStation(fichier, { clone: "/st/clones", worktrees: "/st/worktrees" }),
  } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  const tenus = tenirFaits();
  const recue = tenus.recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits(ligne)) }] });
  const dessinable = tenus.attendre(mettreAPart({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "status", texte: "" }] })) ?? recue;
  vue.dire("surFaits", { ...dessinable, demande: vue.dernier("faits")[0] as number });
  await repos();
  await ouvrirOnglet(vue, "Stations");
  for (let tour = 0; tour < 4; tour++) await repos();
  return vue;
}

const carte = (vue: Jouee) => vue.element("rail").dessous("section").find(({ className }) => className === "carte-de-station") ?? assert.fail("pas de carte");
const ligne = (vue: Jouee, classe: string) => carte(vue).dessous("p").find(({ className }) => className === classe);

describe("le moteur sur la carte de cet ordinateur, l'app jouée (#3746)", () => {
  test("la carte dit le moteur que les réglages de sa station gardent", async () => {
    const vue = await laPage("codex", ligneDuMac);
    assert.equal(ligne(vue, "moteur-de-la-carte")?.textContent, "engine: Codex");
    assert.equal(ligne(vue, "moteur-en-secours"), undefined);
  });

  test("sans moteur gardé, la carte dit l'abonnement Claude, le moteur par défaut", async () => {
    const vue = await laPage(undefined, ligneDuMac);
    assert.equal(ligne(vue, "moteur-de-la-carte")?.textContent, "engine: Claude subscription");
  });

  test("quand `facts` la dit sur son secours, la carte dit sur lequel et jusqu'à quand", async () => {
    const vue = await laPage("claude-subscription", { ...ligneDuMac, engine: { chosen: "claude-subscription", active: "claude-api-key", onFallback: true, blockedUntil: "2026-11-12T18:30:00Z" } });
    assert.equal(ligne(vue, "moteur-de-la-carte")?.textContent, "engine: Claude subscription");
    assert.equal(ligne(vue, "moteur-en-secours")?.textContent, "cooking on the API key: the subscription's cap is reached until Nov 12, 06:30 PM");
  });
});
