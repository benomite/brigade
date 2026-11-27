// « Cook it on a station that has it » (#1511, épique #1506), sur la carte d'un besoin que la station n'a pas : le clic
// n'écrit pas le choix, il ouvre sur Stations le formulaire d'une station de ce poste (#1510) avec la capacité qui manque
// offerte, en plus de celles que la station déclare : chaque case s'appliquant dès qu'elle change (#2920), c'est la cocher
// qui la déclare. Les cartes sont écrites par le runtime lui-même, relues comme
// l'app relit le suivi d'une station ; les stations déclarées sont lues par `lireStations` ; la vue est jouée contre le
// faux pont (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { besoinNomme } from "../../../runtime/src/installation/besoins/catalogue.ts";
import { choixPour } from "../../../runtime/src/installation/besoins/besoins.ts";
import type { Home } from "../../src/home.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { BANNER, holdFacts, type Facts } from "../../src/facts.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import type { Outage } from "../../src/outages/outages.ts";
import { readTracking } from "../../src/projects/request.ts";
import { calibrationRecommended, EFFORTS, machineProposed, MODELS, type ProjectSeen, type SeenOfProjects } from "../../src/projects/projects.ts";
import { readStations, type Guide } from "../../src/service.ts";
import type { SeenOfStations } from "../../src/stations/stations.ts";
import { capacityOfNeed } from "../../src/vue/stations-declared.js";
import { Fake, playTheVue, repos } from "../helpers/false-vue.ts";

const A = "2026-10-23T10:04:12.000Z";
const BOX = { id: "g1", nom: "box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [] as Outage[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
const HOME: Home = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
// La cuisine de ce poste tourne avec pc/claude, qui ne fournit que du code.
const PARADE: Project = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };

const DECLARED =
  readStations(
    JSON.stringify({
      etape: { id: "stations", etat: "faite" },
      proposees: [],
      absent: null,
      declarees: [
        { nom: "box/claude", moteur: "claude", fournit: ["code", "raisonnement"], cooks: 3, distante: true },
        { nom: "pc/claude", moteur: "claude", fournit: ["code"], cooks: 2, distante: false },
      ],
    }),
  ) ?? assert.fail("la forme de `installation stations --json` n'est plus lue");
const guide = (stations: typeof DECLARED | undefined): Guide => ({
  projet: "parade",
  deplie: false,
  titre: "parade is installed",
  lecture: { etat: "lue", a: A },
  etapes: [],
  courante: null,
  annonces: { etat: "lues", liste: [] },
  demarrage: { refus: "nothing to start: the station of this computer runs with the app" },
  termine: true,
  ...(stations === undefined ? {} : { controle: { a: A, stations } }),
});

const FACTS: Facts = {
  etat: "ouverte",
  lu: "2026-10-23T10:04:11.000Z",
  dernierTick: "2026-10-23T10:04:02.000Z",
  compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: [],
};

const need = (id: string) => besoinNomme(id) ?? assert.fail(`aucun besoin « ${id} » au catalogue`);
const queued = (id: string) => ({ ...choixPour({ besoin: need(id), preuves: ["the repository asks for it"] }, { projet: "parade", station: "box", ailleurs: [] }), status: "pending" as const });

const vue = (choice: object[]): SeenOfProjects => {
  const readOne = readTracking(JSON.stringify({ brigade: "projets-suivi", projets: [{ nom: "parade", etat: "servi", choix: choice }] }))[0];
  const project: ProjectSeen = {
    nom: "parade",
    depot: "benomite/parade",
    base: "main",
    suiviPar: { id: "g1", nom: "box" }, stations: [{ id: "g1", nom: "box", etat: "servi", dit: "", autoriser: [] }],
    servi: null,
    cuitSur: { id: "g1", nom: "box", ici: false },
    ...(readOne?.choix === undefined ? {} : { choix: readOne.choix }),
  };
  return { a: A, projets: [project], recommandee: "g1", avertissements: {}, machines: { g1: machineProposed(BOX) }, calibrage: calibrationRecommended([]) };
};

const DEFAULTS = { cooks: 4, cooksDit: "from this computer's 10 cores", espaceDeTravail: "/tmp/worktrees", capacites: [{ capacite: "docker", nom: "Docker", detectee: true }] };

async function thePage(choice: object[], stations: typeof DECLARED | null = DECLARED) {
  const sent: unknown[][] = [];
  const played = await playTheVue({
    demarrage: () => ({
      configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE] }, () => true, () => true),
      palette: PALETTE,
      exemple: EXAMPLE,
      onglets: TABS,
      rubriques: HEADINGS,
      gestes: {},
      banniere: BANNER,
      calibrage: { modeles: MODELS, efforts: EFFORTS },
      code: undefined,
      stations: { a: A, stations: [BOX] } satisfies SeenOfStations,
      accueil: HOME,
      projetsDesStations: vue(choice),
    }),
    espace: () => [],
    service: () => guide(stations ?? undefined),
    defautsDeStation: () => DEFAULTS,
    changerUneStation: (...args: unknown[]) => {
      sent.push(args);
      return { fait: "saved" };
    },
  });
  (played.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  for (let tour = 0; tour < 5; tour++) await repos();
  // Les lignes de station (et leur formulaire) se posent d'après la lecture de la cuisine : `facts` y porte ses stations.
  const receivedOne = holdFacts().recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FACTS, stations: [] }) }] });
  played.dire("surFaits", { ...receivedOne, demande: played.dernier("faits")[0] as number });
  for (let tour = 0; tour < 5; tour++) await repos();
  return { jouee: played, envoyes: sent };
}

const clickOnElsewhere = async (played: Awaited<ReturnType<typeof thePage>>["jouee"], id: string) => {
  const card = played.element("choix-du-projet").dessous("section").find((pose) => pose.dataset.choix === `need:${id}`) ?? assert.fail(`pas de carte « ${id} »`);
  (card.dessous("button").find((pose) => pose.textContent === "Cook it on a station that has it") ?? assert.fail("pas de bouton")).click();
  for (let tour = 0; tour < 5; tour++) await repos();
};
// Les réglages de la station, dans « Details » de sa carte sur Stations (#3195) — ouvert, il porte la capacité offerte ;
// replié, ils ne sont pas ouverts.
const form = (played: Awaited<ReturnType<typeof thePage>>["jouee"]) => {
  const card = played.element("rail").dessous("section").find(({ className, dataset }) => className === "carte-de-station" && dataset.station === "pc/claude");
  return card !== undefined && (card.dessous("details")[0] as unknown as { open?: boolean } | undefined)?.open === true ? card.dessous("section").find(({ className }) => className === "station-reglee") : undefined;
};
const ticked = (shape: Fake) => shape.dessous("input").filter(({ type, checked, ariaLabel }) => type === "checkbox" && checked).map(({ ariaLabel }) => ariaLabel);
const caseOf = (shape: Fake, capacity: string) => shape.dessous("input").find(({ type, ariaLabel }) => type === "checkbox" && ariaLabel === capacity) ?? assert.fail(`pas de case « ${capacity} »`);

describe("« Cook it on a station that has it » ouvre, sur Stations, les réglages de la station de ce poste", () => {
  test("un navigateur qui manque : le formulaire de pc/claude, navigateur-headless offert à côté de code, et rien n'est écrit avant qu'il soit coché", async () => {
    const { jouee: played, envoyes: sent } = await thePage([queued("browser")]);
    assert.equal(form(played), undefined);
    await clickOnElsewhere(played, "browser");
    const shape = form(played) ?? assert.fail("le formulaire n'est pas ouvert");
    assert.equal(shape.dataset.station, "pc/claude");
    assert.deepEqual(ticked(shape), ["code"]);
    assert.equal(caseOf(shape, "navigateur-headless").checked, false);
    // Le choix lui-même n'est pas écrit : la carte reste, et rien ne part avant que le chef coche la case.
    assert.throws(() => played.dernier("choisirUneIssue"), /n'a pas appelé/);
    assert.equal(sent.length, 0);
    // Aucun « Save » : la case cochée part aussitôt, la déclaration entière de la station avec elle.
    assert.equal(shape.dessous("button").some(({ textContent }) => textContent === "Save"), false);
    const tick = caseOf(shape, "navigateur-headless");
    tick.checked = true;
    tick.declencher("change");
    for (let tour = 0; tour < 5; tour++) await repos();
    assert.deepEqual(sent[0]?.slice(0, 2), ["parade", "pc/claude"]);
    assert.deepEqual([...((sent[0]?.[2] as { fournit: string[] }).fournit)].sort(), ["code", "navigateur-headless"]);
  });

  test("un autre besoin, Docker : docker est offert, code reste coché, et la case de Docker est celle du catalogue du poste", async () => {
    const { jouee: played } = await thePage([queued("docker")]);
    await clickOnElsewhere(played, "docker");
    const shape = form(played) ?? assert.fail("le formulaire n'est pas ouvert");
    assert.equal(shape.dataset.station, "pc/claude");
    assert.deepEqual(ticked(shape), ["code"]);
    assert.equal(caseOf(shape, "docker").checked, false);
    assert.equal(shape.dessous("input").filter(({ ariaLabel }) => ariaLabel === "docker").length, 1);
  });

  test("une capacité qu'aucune case n'offrait : elle est offerte une seule fois, décochée", async () => {
    const { jouee: played } = await thePage([queued("postgres")]);
    await clickOnElsewhere(played, "postgres");
    const shape = form(played) ?? assert.fail("fermé");
    assert.deepEqual(ticked(shape), ["code"]);
    assert.equal(shape.dessous("input").filter(({ ariaLabel }) => ariaLabel === "postgres").length, 1);
  });

  test("aucune station lue : rien ne s'ouvre, une ligne sous la carte le dit", async () => {
    const { jouee: played } = await thePage([queued("browser")], null);
    await clickOnElsewhere(played, "browser");
    assert.equal(form(played), undefined);
    assert.match(played.element("choix-du-projet").dessous("p").find(({ className }) => className === "refus-du-choix")?.textContent ?? "", /No station of the project read yet/);
  });

  test("la capacité d'un besoin : celle que le runtime déclare en premier au catalogue", () => {
    for (const id of ["browser", "postgres", "mysql", "redis", "docker"]) assert.equal(capacityOfNeed(id), need(id).fourni.capacites[0], id);
    assert.equal(capacityOfNeed("inconnu"), "inconnu");
  });
});
