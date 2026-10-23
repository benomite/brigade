// « Cook it on a station that has it » (#1511, épique #1506), sur la carte d'un besoin que la station n'a pas : le clic
// n'écrit pas le choix, il ouvre sur Cooks le formulaire d'une station de ce poste (#1510) avec la capacité qui manque
// déjà cochée, en plus de celles que la station déclare. Les cartes sont écrites par le runtime lui-même, relues comme
// l'app relit le suivi d'une station ; les stations déclarées sont lues par `lireStations` ; la vue est jouée contre le
// faux pont (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { besoinNomme } from "../../../runtime/src/installation/besoins/catalogue.ts";
import { choixPour } from "../../../runtime/src/installation/besoins/besoins.ts";
import type { Accueil } from "../../src/accueil.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { Panne } from "../../src/pannes/pannes.ts";
import { lireSuivi } from "../../src/projets/demande.ts";
import { calibrageRecommande, EFFORTS, machineProposee, MODELES, type ProjetVu, type VuDesProjets } from "../../src/projets/projets.ts";
import { lireStations, type Guide } from "../../src/service.ts";
import type { VuDesStations } from "../../src/stations/stations.ts";
import { capaciteDuBesoin } from "../../src/vue/stations-declarees.js";
import { Faux, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-23T10:04:12.000Z";
const BOX = { id: "g1", nom: "box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [] as Panne[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
const ACCUEIL: Accueil = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
// Ce poste joue pc/claude, qui ne fournit que du code.
const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main", box: { hote: "parade-box" }, stations: ["pc/claude"] };

const DECLAREES =
  lireStations(
    JSON.stringify({
      etape: { id: "stations", etat: "faite" },
      proposees: [],
      absent: null,
      declarees: [
        { nom: "box/claude", moteur: "claude", fournit: ["code", "raisonnement"], cooks: 3, distante: false },
        { nom: "pc/claude", moteur: "claude", fournit: ["code"], cooks: 2, distante: true },
      ],
    }),
  ) ?? assert.fail("la forme de `installation stations --json` n'est plus lue");
const guide = (stations: typeof DECLAREES | undefined): Guide => ({
  projet: "parade",
  deplie: false,
  titre: "parade is installed",
  lecture: { etat: "lue", a: A },
  etapes: [],
  courante: null,
  annonces: { etat: "lues", liste: [] },
  demarrage: { commande: "ssh -t parade-box sudo systemctl enable --now brigade@parade.service" },
  termine: true,
  ...(stations === undefined ? {} : { controle: { a: A, stations } }),
});

const besoin = (id: string) => besoinNomme(id) ?? assert.fail(`aucun besoin « ${id} » au catalogue`);
const enAttente = (id: string) => ({ ...choixPour({ besoin: besoin(id), preuves: ["the repository asks for it"] }, { projet: "parade", station: "box", ailleurs: [] }), status: "pending" as const });

const vue = (choix: object[]): VuDesProjets => {
  const lu = lireSuivi(JSON.stringify({ brigade: "projets-suivi", projets: [{ nom: "parade", etat: "servi", choix }] }))[0];
  const projet: ProjetVu = {
    nom: "parade",
    depot: "benomite/parade",
    base: "main",
    stations: [{ id: "g1", nom: "box", principale: true, etat: "servi", dit: "", autoriser: [] }],
    servi: null,
    cuitSur: { id: "g1", nom: "box", ici: false },
    ...(lu?.choix === undefined ? {} : { choix: lu.choix }),
  };
  return { a: A, projets: [projet], recommandee: "g1", avertissements: {}, machines: { g1: machineProposee(BOX) }, calibrage: calibrageRecommande([]) };
};

const DEFAUTS = { cooks: 4, cooksDit: "from this machine's 10 cores", espaceDeTravail: "/tmp/worktrees", capacites: [{ capacite: "docker", nom: "Docker", detectee: true }] };

async function laPage(choix: object[], stations: typeof DECLAREES | null = DECLAREES) {
  const envoyes: unknown[][] = [];
  const jouee = await jouerLaVue({
    demarrage: () => ({
      configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE], hotes: ["parade-box"] }),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS,
      rubriques: RUBRIQUES,
      boutons: BOUTONS,
      gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
      stations: { a: A, stations: [BOX] } satisfies VuDesStations,
      accueil: ACCUEIL,
      projetsDesStations: vue(choix),
    }),
    espace: () => [],
    service: () => guide(stations ?? undefined),
    defautsDeStation: () => DEFAUTS,
    changerUneStation: (...args: unknown[]) => {
      envoyes.push(args);
      return { fait: "saved" };
    },
  });
  (jouee.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  for (let tour = 0; tour < 5; tour++) await repos();
  return { jouee, envoyes };
}

const cliquerSurAilleurs = async (jouee: Awaited<ReturnType<typeof laPage>>["jouee"], id: string) => {
  const carte = jouee.element("choix-du-projet").dessous("section").find((pose) => pose.dataset.choix === `need:${id}`) ?? assert.fail(`pas de carte « ${id} »`);
  (carte.dessous("button").find((pose) => pose.textContent === "Cook it on a station that has it") ?? assert.fail("pas de bouton")).click();
  for (let tour = 0; tour < 5; tour++) await repos();
};
const formulaire = (jouee: Awaited<ReturnType<typeof laPage>>["jouee"]) => jouee.element("rail").dessous("div").find(({ className }) => className === "edition");
const cochees = (forme: Faux) => forme.dessous("input").filter(({ type, checked, ariaLabel }) => type === "checkbox" && checked && !ariaLabel.startsWith("this workstation")).map(({ ariaLabel }) => ariaLabel);

describe("« Cook it on a station that has it » ouvre le formulaire de la station de ce poste", () => {
  test("un navigateur qui manque : le formulaire de pc/claude, navigateur-headless coché en plus de code, et rien n'est écrit", async () => {
    const { jouee, envoyes } = await laPage([enAttente("browser")]);
    assert.equal(formulaire(jouee), undefined);
    await cliquerSurAilleurs(jouee, "browser");
    const forme = formulaire(jouee) ?? assert.fail("le formulaire n'est pas ouvert");
    assert.equal(forme.ariaLabel, "edit pc/claude");
    assert.deepEqual(cochees(forme).sort(), ["code", "navigateur-headless"]);
    // Le choix lui-même n'est pas écrit : la carte reste, le chef enregistre ou non le formulaire.
    assert.throws(() => jouee.dernier("choisirUneIssue"), /n'a pas appelé/);
    // « Save » envoie ce que le formulaire montre.
    (forme.dessous("button").find((pose) => pose.textContent === "Save") ?? assert.fail("pas de « Save »")).click();
    for (let tour = 0; tour < 5; tour++) await repos();
    assert.deepEqual(envoyes[0]?.slice(0, 2), ["parade", "pc/claude"]);
    assert.deepEqual([...((envoyes[0]?.[2] as { fournit: string[] }).fournit)].sort(), ["code", "navigateur-headless"]);
  });

  test("un autre besoin, Docker : docker est coché, code reste coché, et la case de Docker est celle du catalogue du poste", async () => {
    const { jouee } = await laPage([enAttente("docker")]);
    await cliquerSurAilleurs(jouee, "docker");
    const forme = formulaire(jouee) ?? assert.fail("le formulaire n'est pas ouvert");
    assert.equal(forme.ariaLabel, "edit pc/claude");
    assert.deepEqual(cochees(forme).sort(), ["code", "docker"]);
    assert.equal(forme.dessous("input").filter(({ ariaLabel }) => ariaLabel === "docker").length, 1);
  });

  test("une station qui fournit déjà la capacité : elle reste cochée, une seule fois", async () => {
    const { jouee } = await laPage([enAttente("postgres")]);
    await cliquerSurAilleurs(jouee, "postgres");
    assert.deepEqual(cochees(formulaire(jouee) ?? assert.fail("fermé")).sort(), ["code", "postgres"]);
  });

  test("aucune station lue : rien ne s'ouvre, une ligne sous la carte le dit", async () => {
    const { jouee } = await laPage([enAttente("browser")], null);
    await cliquerSurAilleurs(jouee, "browser");
    assert.equal(formulaire(jouee), undefined);
    assert.match(jouee.element("choix-du-projet").dessous("p").find(({ className }) => className === "refus-du-choix")?.textContent ?? "", /no station of the project is read yet/);
  });

  test("la capacité d'un besoin : celle que le runtime déclare en premier au catalogue", () => {
    for (const id of ["browser", "postgres", "mysql", "redis", "docker"]) assert.equal(capaciteDuBesoin(id), besoin(id).fourni.capacites[0], id);
    assert.equal(capaciteDuBesoin("inconnu"), "inconnu");
  });
});
