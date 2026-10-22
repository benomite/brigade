// Ce qui manque à la station pour les tests d'un projet, sur sa page (#1400, épique 1393) : une carte par besoin
// que sa principale publie en attente — ce qui manque, pourquoi, et ses trois issues, chacune un bouton avec ce qui
// en suit sous lui. Un clic écrit l'issue dans la demande de la principale, que la station relit (#1398) ; la carte
// part. Les choix sont écrits par le runtime lui-même (runtime/src/installation/besoins/), relus par `lireSuivi`
// comme l'app relit le suivi d'une station ; la demande écrite est relue par le runtime ; la vue est jouée contre
// le faux pont (aides/fausse-vue.ts), l'écriture contre un faux GitHub qui tient les gists en mémoire.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { besoinNomme } from "../../../../runtime/src/installation/besoins/catalogue.ts";
import { ACTION_DU_CHOIX, choixPour, selectionsLues } from "../../../../runtime/src/installation/besoins/besoins.ts";
import { lireDemande as demandeDuRuntime } from "../../../../runtime/src/projets/demande.ts";
import type { Accueil } from "../../../src/accueil.ts";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import { BOUTONS } from "../../../src/boutons.ts";
import { EXEMPLE, type Projet } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../../src/grants.ts";
import { GESTES_DU_MANAGER } from "../../../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import type { Panne } from "../../../src/pannes/pannes.ts";
import { type Choix, documentDeDemande, FICHIER_PROJETS, FICHIER_SUIVI, lireDemande, lireSuivi, type ProjetDemande } from "../../../src/projets/demande.ts";
import { calibrageRecommande, type Choisi, EFFORTS, machineProposee, MODELES, type ProjetVu, tenirProjets, type VuDesProjets } from "../../../src/projets/projets.ts";
import type { Fichiers } from "../../../src/stations/github.ts";
import type { StationVue, VuDesStations } from "../../../src/stations/stations.ts";
import { choixEnAttente, EN_COURS, poserChoix, sansLesChoix, titreDesChoix } from "../../../src/vue/projet/choix.js";
import { Faux, jouerLaVue, repos } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };

// Tels que le runtime les écrit : un Postgres et Docker qui manquent à la box, en attente du chef.
const besoin = (id: string) => besoinNomme(id) ?? assert.fail(`aucun besoin « ${id} » au catalogue`);
const enAttente = (id: string, preuves: string[]) => ({ ...choixPour({ besoin: besoin(id), preuves }, { projet: "parade", station: "box", ailleurs: [] }), status: "pending" as const });
const POSTGRES = enAttente("postgres", ["`.claude/brigade/worktree-setup.sh` runs `psql`"]);
const DOCKER = enAttente("docker", ["`apps/api/package.json` depends on `testcontainers`"]);
// Le blocage qui attend chacun, sous la même clé, et un autre blocage, sans choix.
const blocageDu = ({ id, message, cause }: typeof POSTGRES) => ({ id, message, cause, action: ACTION_DU_CHOIX });
const CLONE = { id: "clone", message: "box cannot clone benomite/parade.", cause: "The token does not cover benomite/parade.", link: "https://github.com/settings/personal-access-tokens" };

// Ce que l'app relit du suivi d'une station qui les publie.
const relus = (choix: object[] | undefined, blocages: object[] = []) => lireSuivi(JSON.stringify({ brigade: "projets-suivi", projets: [{ nom: "parade", etat: "servi", ...(choix === undefined ? {} : { choix }), ...(blocages.length === 0 ? {} : { blocages }) }] }))[0];
const choixRelus = (choix: object[] | undefined): Choix[] => relus(choix)?.choix ?? [];

const cartes = (ou: Faux) => ou.dessous("section").filter((s) => s.className === "choix");
const boutons = (ou: Faux) => ou.dessous("button").filter((b) => b.className !== "aide");
const texteDe = (ou: Faux, classe: string) => ou.dessous("p").find((p) => p.className === classe)?.textContent;
const poser = (lu: Parameters<typeof poserChoix>[1]): Faux => poserChoix(doc, lu) ?? assert.fail("aucune section");

describe("les cartes, posées par le module", () => {
  test("un choix de base de données en attente : une carte, le besoin nommé, trois issues et ce qui suit de chacune sous elle", () => {
    const pose = poser({ projet: "parade", choix: choixRelus([POSTGRES]) });
    assert.equal(pose.dessous("h3")[0]?.textContent, titreDesChoix("parade", 1));
    assert.equal(titreDesChoix("parade", 1), "One choice waits for you on parade");
    const [carte, ...autres] = cartes(pose);
    assert.equal(autres.length, 0);
    assert.ok(carte !== undefined);
    assert.equal(carte.dataset.choix, "need:postgres");
    assert.equal(carte.dessous("h4")[0]?.textContent, "The tests of parade need a Postgres database, which box does not have.");
    assert.equal(texteDe(carte, "cause"), POSTGRES.cause);
    const issues = carte.dessous("li").filter((li) => li.className === "issue");
    assert.deepEqual(
      issues.map((li) => [li.dataset.issue, li.children[0]?.balise, li.children[0]?.textContent, li.children[1]?.className]),
      [
        ["cook-elsewhere", "button", "Cook it on a station that has it", "consequence"],
        ["provide-here", "button", "Provide it on box", "consequence"],
        ["adapt-tests", "button", "Adapt the tests", "consequence"],
      ],
    );
    assert.deepEqual(
      issues.map((li) => li.children[1]?.textContent),
      POSTGRES.options.map(({ consequence }) => consequence),
    );
    assert.match(issues[1]?.children[1]?.textContent ?? "", /PostgreSQL server .* is installed on box/);
  });

  test("un clic sur une issue la donne, avec la clé de son choix", () => {
    const choisies: string[][] = [];
    const pose = poser({ projet: "parade", choix: choixRelus([POSTGRES]), choisir: (id, issue) => choisies.push([id, issue]) });
    boutons(pose).find((b) => b.textContent === "Adapt the tests")?.click();
    assert.deepEqual(choisies, [["need:postgres", "adapt-tests"]]);
  });

  test("deux besoins qui manquent : deux cartes, pas une liste fondue", () => {
    const pose = poser({ projet: "parade", choix: choixRelus([POSTGRES, DOCKER]) });
    assert.equal(pose.dessous("h3")[0]?.textContent, "2 choices wait for you on parade");
    assert.deepEqual(cartes(pose).map((c) => c.dataset.choix), ["need:postgres", "need:docker"]);
    for (const carte of cartes(pose)) assert.equal(boutons(carte).length, 3);
  });

  test("aucun choix en attente : aucune section — un choix tranché, ou dont l'app a déjà écrit l'issue, n'en a pas", () => {
    assert.equal(poserChoix(doc, { projet: "parade", choix: [] }), null);
    const tranche = choixRelus([{ ...POSTGRES, status: "chosen", selected: "provide-here", selectedAt: "2026-10-22T12:00:00.000Z" }]);
    assert.equal(tranche[0]?.status, "chosen", "relu tel quel");
    assert.equal(poserChoix(doc, { projet: "parade", choix: tranche }), null);
    assert.equal(poserChoix(doc, { projet: "parade", choix: choixRelus([POSTGRES]), choisis: { "need:postgres": "provide-here" } }), null);
    assert.equal(poserChoix(doc, { projet: "parade", choix: choixRelus([POSTGRES]), retenus: new Set(["need:postgres"]) }), null);
    // Une issue écrite que la station n'offre pas ne tranche rien : la carte reste.
    assert.equal(choixEnAttente(choixRelus([POSTGRES]), { "need:postgres": "pray" }).length, 1);
  });

  test("pendant l'écriture, ses boutons attendent et une ligne le dit ; refusée, une ligne dit pourquoi, le détail au survol", () => {
    const occupee = poser({ projet: "parade", choix: choixRelus([POSTGRES]), enCours: new Set(["need:postgres"]) });
    assert.ok(boutons(occupee).every((b) => b.disabled === true));
    assert.equal(texteDe(occupee, "etat-du-choix"), EN_COURS);
    const refusee = poser({ projet: "parade", choix: choixRelus([POSTGRES]), refus: new Map([["need:postgres", { refus: "the choice could not be recorded: GitHub could not be read or written", detail: "HTTP 502" }]]) });
    assert.ok(boutons(refusee).every((b) => b.disabled !== true));
    const ligne = refusee.dessous("p").find((p) => p.className === "refus-du-choix") ?? assert.fail("pas de ligne de refus");
    assert.equal(ligne.dessous("span")[0]?.textContent, "the choice could not be recorded: GitHub could not be read or written");
    assert.equal(refusee.dessous("button").find((b) => b.className === "aide")?.ariaLabel, "HTTP 502");
  });

  test("le blocage d'un besoin qui a sa carte ne se répète pas en ligne ; les autres restent", () => {
    const blocages = relus([POSTGRES], [blocageDu(POSTGRES), CLONE])?.blocages ?? [];
    assert.equal(blocages.length, 2);
    assert.deepEqual(sansLesChoix(blocages, choixRelus([POSTGRES])).map(({ id }) => id), ["clone"]);
    assert.deepEqual(sansLesChoix(blocages, [], { "need:postgres": "provide-here" }).map(({ id }) => id), ["clone"], "écrit, son blocage attend que la station le lève");
  });
});

describe("le suivi relu par l'app", () => {
  test("chaque choix publié, tel quel ; un illisible, ou une issue illisible, n'est pas montré", () => {
    assert.deepEqual(choixRelus([POSTGRES, DOCKER]), [POSTGRES, DOCKER]);
    const sansCle = { ...POSTGRES, id: "" };
    const sansIssue = { ...DOCKER, options: [{ id: "x", label: "" }] };
    const inconnu = { ...POSTGRES, id: "need:redis", status: "maybe" };
    const uneIllisible = { ...POSTGRES, options: [...POSTGRES.options, { id: "y" }] };
    assert.deepEqual(choixRelus([sansCle, sansIssue, inconnu, uneIllisible]), [POSTGRES]);
    assert.equal(relus(undefined)?.choix, undefined, "rien ne manque, rien de publié");
  });
});

describe("l'issue retenue, écrite dans la demande de la principale", () => {
  const BOX: StationVue = { id: "g1", nom: "box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online", pannes: [], dit: "online", version: "1.4.0", projets: ["parade"], max: null };
  const MAC: StationVue = { ...BOX, id: "g2", nom: "macbook", machine: "macOS 25.0.0" };
  const demande = (principale: boolean): ProjetDemande => ({ nom: "parade", depot: "benomite/parade", base: "main", principale, cooks: 2, manager: { modele: "sonnet", effort: "medium" }, reviewer: { modele: "opus", effort: "high" }, ouvertLe: null, demandeLe: "2026-10-22T11:00:00.000Z" });

  // GitHub, ses gists en mémoire : la box est la principale de parade et publie ses choix, le Mac la seconde.
  function unGitHub(choix: object[]) {
    const gists = new Map<string, Fichiers>([
      ["g1", { [FICHIER_PROJETS]: documentDeDemande([demande(true)]), [FICHIER_SUIVI]: JSON.stringify({ brigade: "projets-suivi", projets: [{ nom: "parade", etat: "servi", choix }] }) }],
      ["g2", { [FICHIER_PROJETS]: documentDeDemande([demande(false)]) }],
    ]);
    const ecrits: string[] = [];
    let panne = false;
    const projets = tenirProjets({
      github: {
        lister: async () => [],
        lire: async (id) => gists.get(id) ?? null,
        ecrire: async (id, fichiers) => {
          if (panne) throw new Error("HTTP 502");
          ecrits.push(id);
          gists.set(id, { ...gists.get(id), ...fichiers });
        },
        supprimer: async () => {},
      },
      stations: () => [BOX, MAC],
      depots: async () => [],
      surLecture: () => {},
    });
    const relue = (id: string) => lireDemande(gists.get(id)?.[FICHIER_PROJETS]);
    return { projets, ecrits, relue, gists, enPanne: () => (panne = true) };
  }

  test("l'issue part dans la demande de la principale seule, sous la clé du choix, telle que le runtime la lit ; la page la sait écrite", async () => {
    const { projets, ecrits, relue, gists } = unGitHub([POSTGRES, DOCKER]);
    await projets.relire();
    assert.deepEqual(await projets.choisir("parade", "need:postgres", "provide-here"), { fait: "“Provide it on box” is recorded: box applies it at its next read" });
    assert.deepEqual(ecrits, ["g1"]);
    assert.deepEqual(relue("g1")?.[0]?.choix, { "need:postgres": "provide-here" });
    assert.equal(relue("g2")?.[0]?.choix, undefined);
    const lu = demandeDuRuntime(gists.get("g1")?.[FICHIER_PROJETS] ?? "");
    assert.deepEqual(lu?.problemes, []);
    assert.deepEqual(selectionsLues(lu?.projets[0]?.choix), { "need:postgres": "provide-here" });
    // Relue, la page sait l'issue écrite : la carte du Postgres ne revient pas, celle de Docker reste.
    const vu = projets.vu()?.projets[0];
    assert.deepEqual(vu?.choisis, { "need:postgres": "provide-here" });
    assert.deepEqual(choixEnAttente(vu?.choix ?? [], vu?.choisis).map(({ id }) => id), ["need:docker"]);
    // Une seconde issue s'ajoute à la première, que tout autre geste réécrit telle quelle.
    await projets.choisir("parade", "need:docker", "adapt-tests");
    assert.deepEqual(relue("g1")?.[0]?.choix, { "need:postgres": "provide-here", "need:docker": "adapt-tests" });
  });

  test("un choix que la page ne montre plus en attente, ou une issue qu'il n'offre pas : rien ne s'écrit ; GitHub muet, le refus le dit", async () => {
    const { projets, ecrits, enPanne } = unGitHub([POSTGRES, { ...DOCKER, status: "chosen", selected: "adapt-tests", selectedAt: "2026-10-22T11:30:00.000Z" }]);
    await projets.relire();
    assert.deepEqual(await projets.choisir("parade", "need:docker", "provide-here"), { refus: "box no longer waits for this choice: nothing was recorded" });
    assert.deepEqual(await projets.choisir("parade", "need:redis", "provide-here"), { refus: "box no longer waits for this choice: nothing was recorded" });
    assert.deepEqual(await projets.choisir("parade", "need:postgres", "pray"), { refus: "box no longer offers this option: nothing was recorded" });
    assert.deepEqual(await projets.choisir("cantine", "need:postgres", "provide-here"), { refus: "cantine cooks on none of your stations: nothing was recorded" });
    assert.deepEqual(ecrits, []);
    enPanne();
    assert.deepEqual(await projets.choisir("parade", "need:postgres", "provide-here"), { refus: "the choice could not be recorded: GitHub could not be read or written", detail: "HTTP 502" });
  });
});

describe("sur la page du projet", () => {
  const A = "2026-10-22T12:00:00.000Z";
  const BOX = { id: "g1", nom: "box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [] as Panne[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
  const ACCUEIL: Accueil = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
  const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };

  const vue = (choix: object[] | undefined, blocages: object[] = [], choisis?: Record<string, string>): VuDesProjets => {
    const lu = relus(choix, blocages);
    const projet: ProjetVu = {
      nom: "parade",
      depot: "benomite/parade",
      base: "main",
      stations: [{ id: "g1", nom: "box", principale: true, etat: "servi", dit: "", autoriser: [] }],
      servi: null,
      cuitSur: { id: "g1", nom: "box", ici: false },
      ...(lu?.choix === undefined ? {} : { choix: lu.choix }),
      ...(lu?.blocages === undefined ? {} : { blocages: lu.blocages }),
      ...(choisis === undefined ? {} : { choisis }),
    };
    return { a: A, projets: [projet], recommandee: "g1", avertissements: {}, machines: { g1: machineProposee(BOX) }, calibrage: calibrageRecommande([]) };
  };
  const demarrage = (projetsDesStations: VuDesProjets) => ({
    configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE] }),
    palette: PALETTE,
    exemple: EXEMPLE,
    onglets: ONGLETS,
    rubriques: RUBRIQUES,
    boutons: BOUTONS,
    gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
    banniere: BANNIERE,
    calibrage: { modeles: MODELES, efforts: EFFORTS },
    code: undefined,
    stations: { a: A, stations: [BOX] } satisfies VuDesStations,
    accueil: ACCUEIL,
    projetsDesStations,
  });

  async function laPage(choix: object[] | undefined, blocages: object[] = [], choisirUneIssue: () => Choisi = () => ({ fait: "recorded" })) {
    const jouee = await jouerLaVue({ demarrage: () => demarrage(vue(choix, blocages)), espace: () => [], choisirUneIssue });
    (jouee.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
    await repos();
    return { jouee, section: jouee.element("choix-du-projet"), blocages: jouee.element("blocages-du-projet") };
  }

  test("un choix en attente : sa carte ; le clic appelle le runtime avec le projet, le choix et l'issue — puis la carte n'est plus là", async () => {
    const { jouee, section } = await laPage([POSTGRES]);
    assert.equal(section.hidden, false);
    assert.equal(cartes(section).length, 1);
    boutons(section).find((b) => b.textContent === "Provide it on box")?.click();
    await repos();
    assert.deepEqual(jouee.dernier("choisirUneIssue"), ["parade", "need:postgres", "provide-here"]);
    assert.equal(section.hidden, true);
    assert.equal(cartes(section).length, 0);
    // La station ne l'a pas encore lue : relue en attente, la carte ne revient pas ; tranchée, rien non plus.
    jouee.dire("surProjetsDesStations", vue([POSTGRES], [], { "need:postgres": "provide-here" }));
    await repos();
    assert.equal(cartes(section).length, 0);
    jouee.dire("surProjetsDesStations", vue([{ ...POSTGRES, status: "chosen", selected: "provide-here", selectedAt: A }]));
    await repos();
    assert.equal(section.hidden, true);
  });

  test("deux besoins : deux cartes ; l'une tranchée, l'autre reste", async () => {
    const { section } = await laPage([POSTGRES, DOCKER]);
    assert.deepEqual(cartes(section).map((c) => c.dataset.choix), ["need:postgres", "need:docker"]);
    const docker = cartes(section)[1] ?? assert.fail();
    boutons(docker).find((b) => b.textContent === "Adapt the tests")?.click();
    await repos();
    assert.deepEqual(cartes(section).map((c) => c.dataset.choix), ["need:postgres"]);
  });

  test("une issue refusée : la carte reste, une ligne dit pourquoi", async () => {
    const { section } = await laPage([POSTGRES], [], () => ({ refus: "box no longer offers this option: nothing was recorded" }));
    boutons(section).find((b) => b.textContent === "Provide it on box")?.click();
    await repos();
    assert.equal(cartes(section).length, 1);
    assert.equal(texteDe(section, "refus-du-choix"), "box no longer offers this option: nothing was recorded");
  });

  test("la carte prend la place du blocage qui l'attend ; les autres blocages restent en lignes", async () => {
    const { section, blocages } = await laPage([POSTGRES], [blocageDu(POSTGRES), CLONE]);
    assert.equal(cartes(section).length, 1);
    assert.deepEqual(
      blocages.dessous("li").filter((li) => li.className === "blocage").map((li) => li.dataset.blocage),
      ["clone"],
    );
  });

  test("aucun choix en attente : aucune carte", async () => {
    const { section, blocages } = await laPage(undefined);
    assert.equal(section.hidden, true);
    assert.equal(section.children.length, 0);
    assert.equal(blocages.hidden, true);
  });
});
