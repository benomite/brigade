// Ce qui bloque un projet, sur sa page (#1399, épique 1393) : chaque blocage que sa principale publie (#1394) en
// une ligne — ce qui est bloqué en une phrase, et pourquoi ; le geste en bouton quand l'app sait le faire, la page
// de GitHub où le faire en lien qui la nomme ; ce qu'une commande a dit, replié derrière « details », jamais en
// message. Aucun blocage, aucune section. Les blocages sont écrits dans la forme même du runtime
// (runtime/src/installation/blocages/), assainis par lui, et relus par `lireSuivi` comme l'app relit le suivi
// d'une station ; la vue est jouée contre le faux pont (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { blocage as duRuntime } from "../../../../runtime/src/installation/blocages/blocages.ts";
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
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import type { Panne } from "../../../src/pannes/pannes.ts";
import { type Blocage, lireSuivi } from "../../../src/projets/demande.ts";
import { calibrageRecommande, EFFORTS, machineProposee, MODELES, type ProjetVu, type VuDesProjets } from "../../../src/projets/projets.ts";
import type { VuDesStations } from "../../../src/stations/stations.ts";
import { DETAILS, lieuDe, poserBlocages, SANS_GESTE, titreDesBlocages } from "../../../src/vue/projet/blocages.js";
import { Faux, jouerLaVue, repos } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const JETONS = "https://github.com/settings/personal-access-tokens";
const SORTIE = "GraphQL: Could not resolve to a Repository with the name 'benomite/parade'.\nfailed to run git: exit status 128";

// Tels que le runtime les écrit : l'un avec la page où le lever, l'autre avec le geste de l'app ; et un troisième
// dont le producteur n'a donné que la sortie de git pour message — le runtime l'a assaini.
const TOKEN = duRuntime({ id: "clone", message: "box cannot clone benomite/parade: the GitHub account brigade-cook does not see this repository.", cause: "A fine-grained token only covers the repositories chosen for it.", link: JETONS, detail: SORTIE });
const POSTGRES = duRuntime({ id: "need:postgres", message: "The tests of parade need a Postgres that box does not have.", cause: "The worktree setup runs psql against a local database.", action: "choose-station" });
const BRUT = duRuntime({ id: "setup", message: "fatal: could not read Username for 'https://github.com'", cause: "exit status 128" });

// Ce que l'app relit du suivi d'une station qui les publie.
const relus = (blocages: object[] | undefined): Blocage[] => lireSuivi(JSON.stringify({ brigade: "projets-suivi", projets: [{ nom: "parade", etat: "en-preparation", ...(blocages === undefined ? {} : { blocages }) }] }))[0]?.blocages ?? [];

const visible = (ou: Faux, element: Faux) => {
  for (let pose: Faux | null = element; pose !== null && pose !== ou; pose = pose.parentElement) if (pose.hidden) return false;
  return true;
};
const lignes = (ou: Faux) => ou.dessous("li").filter((li) => li.className === "blocage" && visible(ou, li));
const texteDe = (ou: Faux, classe: string) => ou.dessous("p").find((p) => p.className === classe)?.textContent;
const ouvert = (details: Faux) => Reflect.get(details, "open") === true;
// La section que le module pose — il rend ce que la fabrique crée : ici, des faux.
const poser = (lu: Parameters<typeof poserBlocages>[1]): Faux => poserBlocages(doc, lu) ?? assert.fail("aucune section");

describe("la section, posée par le module", () => {
  test("deux blocages : deux lignes, chacune sa phrase et sa cause, sous la phrase qui dit combien le bloquent", () => {
    const pose = poser({ projet: "parade", blocages: relus([TOKEN, POSTGRES]) });
    assert.equal(pose.dessous("h3")[0]?.textContent, "2 things block parade");
    assert.equal(lignes(pose).length, 2);
    const [premiere = assert.fail(), seconde = assert.fail()] = lignes(pose);
    assert.equal(texteDe(premiere, "message"), TOKEN.message);
    assert.equal(texteDe(premiere, "cause"), TOKEN.cause);
    assert.equal(texteDe(seconde, "message"), POSTGRES.message);
    assert.equal(texteDe(seconde, "cause"), POSTGRES.cause);
    assert.equal(titreDesBlocages("parade", 1), "One thing blocks parade");
  });

  test("un blocage dont l'app sait le geste : un bouton, recommandé, qui le fait", () => {
    const faits: string[] = [];
    const pose = poser({ projet: "parade", blocages: relus([POSTGRES]), gestes: { "choose-station": { libelle: "choose another station", faire: () => faits.push("choisir") } } });
    const [bouton, ...autres] = pose.dessous("button").filter((b) => b.className !== "aide");
    assert.equal(autres.length, 0);
    assert.equal(bouton?.textContent, "choose another station");
    assert.equal(bouton?.className, "recommande");
    bouton?.click();
    assert.deepEqual(faits, ["choisir"]);
    assert.equal(pose.dessous("a").length, 0, "sans lien publié, aucun lien");
  });

  test("un geste que l'app ne connaît pas : pas de bouton qui ne ferait rien — une ligne le dit, l'identifiant au survol", () => {
    const pose = poser({ projet: "parade", blocages: relus([POSTGRES]) });
    assert.equal(pose.dessous("button").filter((b) => b.className !== "aide").length, 0);
    assert.ok(pose.dessous("span").some((s) => s.className === "sans-geste" && s.textContent === SANS_GESTE));
    assert.match(pose.dessous("button").find((b) => b.className === "aide")?.ariaLabel ?? "", /“choose-station”/);
  });

  test("un blocage avec un lien : un lien qui nomme la page exacte et l'ouvre, sans naviguer dans l'app", () => {
    const ouverts: string[] = [];
    const pose = poser({ projet: "parade", blocages: relus([TOKEN]), ouvrir: (url) => ouverts.push(url) });
    const [lien, ...autres] = pose.dessous("a");
    assert.equal(autres.length, 0);
    assert.equal(lien?.textContent, "open github.com/settings/personal-access-tokens");
    assert.equal(Reflect.get(lien ?? assert.fail(), "href"), JETONS);
    let empeche = false;
    lien.declencher("click", { preventDefault: () => (empeche = true) });
    assert.ok(empeche, "le clic ne navigue pas dans la fenêtre de l'app");
    assert.deepEqual(ouverts, [JETONS]);
    assert.equal(lieuDe("https://github.com/organizations/BOBL-tech/settings/installations/?tab=all"), "github.com/organizations/BOBL-tech/settings/installations");
  });

  test("le détail brut est replié derrière « details », jamais le message — un message brut a été assaini par le runtime", () => {
    const pose = poser({ projet: "parade", blocages: relus([TOKEN, BRUT]) });
    const [token, brut] = lignes(pose);
    for (const ligne of [token, brut]) {
      const details = ligne?.dessous("details")[0] ?? assert.fail("pas de détail replié");
      assert.equal(ouvert(details), false, "replié par défaut");
      assert.equal(details.dessous("summary")[0]?.textContent, DETAILS);
      const message = texteDe(ligne ?? assert.fail(), "message") ?? "";
      assert.doesNotMatch(message, /exit status|fatal:|GraphQL/);
      assert.ok(!details.dessous("pre")[0]?.textContent.includes(message) || message === "", "le message n'est pas la sortie");
    }
    assert.equal(token?.dessous("pre")[0]?.textContent, SORTIE);
    assert.match(brut?.dessous("pre")[0]?.textContent ?? "", /fatal: could not read Username/);
  });

  test("déplié par le chef, le détail le reste d'une pose à l'autre ; replié, il se replie", () => {
    const deplies = new Set<string>();
    const deplier = (id: string, voulu: boolean) => void (voulu ? deplies.add(id) : deplies.delete(id));
    const premiere = poser({ projet: "parade", blocages: relus([TOKEN]), deplies, deplier });
    const details = premiere.dessous("details")[0] ?? assert.fail();
    Reflect.set(details, "open", true);
    details.declencher("toggle");
    assert.deepEqual([...deplies], ["clone"]);
    const seconde = poser({ projet: "parade", blocages: relus([TOKEN]), deplies, deplier });
    assert.equal(ouvert(seconde.dessous("details")[0] ?? assert.fail()), true);
  });

  test("une phrase donnée pour message et cause ne se dit qu'une fois", () => {
    const meme = duRuntime({ id: "clone", message: "box cannot clone benomite/parade.", cause: "box cannot clone benomite/parade." });
    const pose = poser({ projet: "parade", blocages: relus([meme]) });
    assert.equal(pose.dessous("p").filter((p) => p.textContent === meme.message).length, 1);
  });

  test("aucun blocage : aucune section", () => {
    assert.equal(poserBlocages(doc, { projet: "parade", blocages: [] }), null);
  });
});

describe("le suivi relu par l'app", () => {
  test("chaque blocage publié, avec ce qu'il porte ; un illisible n'est pas montré ; une page hors de GitHub n'est pas un lien", () => {
    assert.deepEqual(relus([TOKEN, POSTGRES]), [TOKEN, POSTGRES]);
    assert.deepEqual(relus([{ id: "x", message: "", cause: "why" }, { message: "No id.", cause: "why" }, { ...POSTGRES, link: "https://ailleurs.example/piege" }]), [POSTGRES]);
    assert.deepEqual(relus(undefined), []);
    assert.equal(lireSuivi(JSON.stringify({ brigade: "projets-suivi", projets: [{ nom: "parade", etat: "servi" }] }))[0]?.blocages, undefined, "rien de bloqué, rien de publié");
  });
});

describe("sur la page du projet", () => {
  const A = "2026-10-22T12:00:00.000Z";
  const BOX = { id: "g1", nom: "box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [] as Panne[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
  const MAC = { ...BOX, id: "g2", nom: "macbook", machine: "macOS 25.0.0" } as const;
  const ACCUEIL: Accueil = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
  const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };

  // `seule` : la box est la seule station appairée — aucune autre ne peut le reprendre.
  let seule = false;
  const vue = (blocages: object[] | undefined): VuDesProjets => {
    const lus = relus(blocages);
    const projet: ProjetVu = {
      nom: "parade",
      depot: "benomite/parade",
      base: "main",
      stations: [{ id: "g1", nom: "box", principale: true, etat: "en-preparation", dit: "", autoriser: [] }],
      servi: null,
      cuitSur: { id: "g1", nom: "box", ici: false },
      ...(lus.length === 0 ? {} : { blocages: lus }),
    };
    return { a: A, projets: [projet], recommandee: "g1", avertissements: {}, machines: { g1: machineProposee(BOX), g2: machineProposee(MAC) }, calibrage: calibrageRecommande([]) };
  };
  const demarrage = (projetsDesStations: VuDesProjets) => ({
    configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE] }),
    palette: PALETTE,
    exemple: EXEMPLE,
    onglets: ONGLETS,
    rubriques: RUBRIQUES,
    boutons: BOUTONS,
    gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
    banniere: BANNIERE,
    calibrage: { modeles: MODELES, efforts: EFFORTS },
    code: undefined,
    stations: { a: A, stations: seule ? [BOX] : [BOX, MAC] } satisfies VuDesStations,
    accueil: ACCUEIL,
    projetsDesStations,
  });

  async function laPage(blocages: object[] | undefined, { seuleStation = false } = {}) {
    seule = seuleStation;
    const jouee = await jouerLaVue({ demarrage: () => demarrage(vue(blocages)), espace: () => [], autoriserSurGitHub: () => true });
    (jouee.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
    await repos();
    return { jouee, section: jouee.element("blocages-du-projet") };
  }

  test("deux blocages : la section, deux lignes ; le lien part par le process principal, le bouton ouvre le choix de la machine", async () => {
    const { jouee, section } = await laPage([TOKEN, POSTGRES]);
    assert.equal(section.hidden, false);
    assert.equal(lignes(section).length, 2);
    const lien = section.dessous("a")[0] ?? assert.fail("pas de lien");
    lien.click();
    await repos();
    assert.deepEqual(jouee.dernier("autoriserSurGitHub"), [JETONS]);
    const bouton = section.dessous("button").find((b) => b.textContent === "choose another station") ?? assert.fail("pas de bouton");
    bouton.click();
    await repos();
    const stations = jouee.element("stations-du-projet");
    assert.equal(stations.hidden, false, "le choix de la machine est ouvert, en vue");
    assert.ok(stations.dessous("section").some((d) => d.className === "demenagement" && visible(stations, d)), "le choix de la machine pour le déménagement");
  });

  test("aucune autre station ne peut le reprendre : pas de bouton qui ne ferait rien, une ligne dit pourquoi", async () => {
    const { section } = await laPage([POSTGRES], { seuleStation: true });
    assert.equal(section.dessous("button").some((b) => b.textContent === "choose another station"), false);
    assert.ok(section.dessous("span").some((s) => s.className === "sans-geste" && s.textContent === "no other station can take it right now"));
  });

  test("le détail déplié le reste à la relecture ; un blocage levé quitte la page ; aucun, la section disparaît", async () => {
    const { jouee, section } = await laPage([TOKEN, POSTGRES]);
    const details = section.dessous("details")[0] ?? assert.fail();
    Reflect.set(details, "open", true);
    details.declencher("toggle");
    jouee.dire("surProjetsDesStations", vue([TOKEN, POSTGRES]));
    await repos();
    assert.equal(ouvert(section.dessous("details")[0] ?? assert.fail()), true);
    jouee.dire("surProjetsDesStations", vue([POSTGRES]));
    await repos();
    assert.deepEqual(lignes(section).map((li) => li.dataset.blocage), ["need:postgres"]);
    jouee.dire("surProjetsDesStations", vue(undefined));
    await repos();
    assert.equal(section.hidden, true);
    assert.equal(section.children.length, 0);
  });

  test("un projet sans blocage : aucune section", async () => {
    const { section } = await laPage(undefined);
    assert.equal(section.hidden, true);
    assert.equal(section.children.length, 0);
  });
});
