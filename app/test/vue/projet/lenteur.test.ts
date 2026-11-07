// Le plus lent du projet, sur sa page (#2351, épique #2337) : la phrase de `nommerLePlusLent` si la station en publie
// une, rien sinon. La vue est jouée contre le faux pont (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Accueil } from "../../../src/accueil.ts";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import type { Panne } from "../../../src/pannes/pannes.ts";
import { calibrageRecommande, EFFORTS, machineProposee, MODELES, type ProjetVu, type VuDesProjets } from "../../../src/projets/projets.ts";
import type { VuDesStations } from "../../../src/stations/stations.ts";
import { poserLaLenteur } from "../../../src/vue/projet/lenteur.js";
import { Faux, jouerLaVue, repos } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const CI = { partie: "ci", phrase: "CI: 7 min median", chiffres: "CI median 7 min over the last 10 tickets" };

describe("la ligne, posée par le module", () => {
  test("une phrase : la ligne la dit telle quelle, les chiffres au survol", () => {
    const ligne = poserLaLenteur(doc, CI) ?? assert.fail("pas de ligne");
    assert.equal(ligne.dataset.partie, "ci");
    assert.match(ligne.textContent ?? "", /^CI: 7 min median/);
  });

  test("pas de phrase, ou vide : pas de ligne", () => {
    assert.equal(poserLaLenteur(doc, null), null);
    assert.equal(poserLaLenteur(doc, undefined), null);
    assert.equal(poserLaLenteur(doc, { partie: "ci", phrase: "  ", chiffres: "" }), null);
  });
});

describe("sur la page du projet", () => {
  const A = "2026-10-22T12:00:00.000Z";
  const BOX = { id: "g1", nom: "box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [] as Panne[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
  const MAC = { ...BOX, id: "g2", nom: "macbook", machine: "macOS 25.0.0" } as const;
  const ACCUEIL: Accueil = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
  const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };

  const vue = (lenteur: object | null | undefined): VuDesProjets => {
    const projet = {
      nom: "parade",
      depot: "benomite/parade",
      base: "main",
      suiviPar: { id: "g1", nom: "box" }, stations: [{ id: "g1", nom: "box", etat: "en-preparation", dit: "", autoriser: [] }],
      servi: null,
      cuitSur: { id: "g1", nom: "box", ici: false },
      ...(lenteur === undefined || lenteur === null ? {} : { lenteur }),
    } as ProjetVu;
    return { a: A, projets: [projet], recommandee: "g1", avertissements: {}, machines: { g1: machineProposee(BOX), g2: machineProposee(MAC) }, calibrage: calibrageRecommande([]) };
  };
  const demarrage = (projetsDesStations: VuDesProjets) => ({
    configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE] }),
    palette: PALETTE,
    exemple: EXEMPLE,
    onglets: ONGLETS,
    rubriques: RUBRIQUES,
    gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
    banniere: BANNIERE,
    calibrage: { modeles: MODELES, efforts: EFFORTS },
    code: undefined,
    stations: { a: A, stations: [BOX, MAC] } satisfies VuDesStations,
    accueil: ACCUEIL,
    projetsDesStations,
  });

  async function laPage(lenteur: object | null | undefined) {
    const jouee = await jouerLaVue({ demarrage: () => demarrage(vue(lenteur)), espace: () => [], autoriserSurGitHub: () => true });
    (jouee.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
    await repos();
    return { jouee, section: jouee.element("lenteur-du-projet") };
  }

  test("un projet avec une phrase : elle s'affiche", async () => {
    const { section } = await laPage(CI);
    assert.equal(section.hidden, false);
    assert.equal(section.dessous("p")[0]?.textContent?.startsWith("CI: 7 min median"), true);
  });

  test("un projet sans donnée : aucune ligne, aucun cadre vide", async () => {
    const { section } = await laPage(undefined);
    assert.equal(section.hidden, true);
    assert.equal(section.dessous("p").length, 0);
    const { section: nulle } = await laPage(null);
    assert.equal(nulle.hidden, true);
    assert.equal(nulle.dessous("p").length, 0);
  });
});
