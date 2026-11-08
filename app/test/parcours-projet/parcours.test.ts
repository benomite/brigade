// Le parcours d'ajout d'un projet (#2475, épique #2473) : un seul écran, ses étapes dans l'ordre, une par fichier
// sous parcours-projet/. Le premier lancement et l'écran d'ajout (#ajout) le montent tous deux : même écran, mêmes
// étapes, mêmes mots — le premier lancement n'y ajoute que sa phrase d'accueil. Aucun champ n'y demande un login
// GitHub, et l'exemple `your-github-login` a quitté les sources de l'app. La vue est jouée telle qu'elle est, devant
// un faux document et un faux pont (aides/fausse-vue.ts) : ni Electron, ni navigateur.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import type { CompteGitHub } from "../../src/connexion-github.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { CHANGER_DE_COMPTE, connecteEnTantQue, etapeDuCompte, SE_CONNECTER } from "../../src/vue/parcours-projet/compte.js";
import { etapeDuRecap } from "../../src/vue/parcours-projet/etape-recap.js";
import { BIENVENUE, ETAPES, poserParcoursProjet, TITRE, type Etape } from "../../src/vue/parcours-projet/parcours.js";
import { Faux, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const SANS_GESTE = { seConnecter: () => {}, changerDeCompte: () => {}, relireLeCompte: () => {}, ouvrirLaPage: () => {} };
const SRC = join(import.meta.dirname, "../../src");

describe("le squelette : des étapes ordonnées, une par fichier", () => {
  test("le compte est la première étape inscrite, la station suit (#2477) ; chaque étape est numérotée, sous « Add a project »", () => {
    assert.deepEqual(ETAPES.map((etape) => etape.id), ["compte", "station", "recap"]);
    assert.equal(ETAPES[0], etapeDuCompte);
    assert.equal(ETAPES.at(-1), etapeDuRecap);
    const ecran = poserParcoursProjet(doc, { compte: { login: "octo-chef" } }, SANS_GESTE) as Faux;
    assert.equal(ecran.dessous("h2")[0]?.textContent, TITRE);
    assert.equal(TITRE, "Add a project");
    assert.deepEqual(
      ecran.dessous("li").map((ligne) => [ligne.dataset.etape, ligne.dessous("span")[0]?.textContent, ligne.dessous("strong")[0]?.textContent]),
      [
        ["compte", "1", "Your GitHub account"],
        ["station", "2", "The station that cooks it"],
        ["recap", "3", "Ready"],
      ],
    );
    // Sans `bienvenue`, aucune phrase d'accueil.
    assert.equal(ecran.dessous("p").some((pose) => pose.textContent === BIENVENUE), false);
  });

  test("le parcours finit sur le récap : le projet, sa station et la suite `fire` — jamais un projet nu", () => {
    const ecran = poserParcoursProjet(doc, { compte: { login: "octo-chef" }, depot: "chef/parade", station: "this Mac" }, SANS_GESTE) as Faux;
    const fin = ecran.dessous("li").at(-1)!;
    assert.deepEqual([fin.dataset.etape, fin.dataset.etat], ["recap", "courante"]);
    const texte = [...fin.descendants()].map((element) => element.textContent).join(" ");
    assert.match(texte, /chef\/parade/);
    assert.match(texte, /this Mac/);
    assert.equal(fin.dessous("code")[0]?.textContent, "fire");
  });

  test("les étapes suivantes s'inscrivent à la suite : la première qui n'est pas faite est la courante, les autres sont à venir et repliées", () => {
    const suivante = (id: string): Etape => ({ id, titre: id, faite: () => false, poser: (fabrique) => [fabrique.createElement("p")] });
    const etapes = [etapeDuCompte, suivante("projet"), suivante("station")];
    const etats = (compte: CompteGitHub) =>
      (poserParcoursProjet(doc, { compte }, SANS_GESTE, { etapes }) as Faux).dessous("li").map((ligne) => [ligne.dataset.etape, ligne.dataset.etat, ligne.dessous("div").length]);
    assert.deepEqual(etats({ login: "octo-chef" }), [
      ["compte", "faite", 1],
      ["projet", "courante", 1],
      ["station", "a-venir", 0],
    ]);
    assert.deepEqual(etats({ nonConnecte: true }), [
      ["compte", "courante", 1],
      ["projet", "a-venir", 0],
      ["station", "a-venir", 0],
    ]);
  });
});

describe("aucun login GitHub à taper", () => {
  test("`your-github-login` a quitté les sources de l'app", () => {
    const fichiers = (readdirSync(SRC, { recursive: true }) as string[]).filter((fichier) => /\.(js|ts|cjs|html|css)$/.test(fichier));
    assert.ok(fichiers.length > 100);
    assert.deepEqual(fichiers.filter((fichier) => readFileSync(join(SRC, fichier), "utf8").includes("your-github-login")), []);
  });
});

// La vue jouée entière, sur un PC neuf puis sur un PC qui a déjà ses projets.
const demarrage = (projets: Projet[]) => ({
  configuration: pourLaBarre({ chemin: "C:\\Users\\chef\\.config\\brigade\\app.json", projets }),
  poste: { nom: "this PC", mac: false },
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
const PARADE: Projet = { nom: "parade", dossier: "C:\\code\\parade", depot: "benomite/parade", base: "main" };
const AUCUNE = { state: "listed" as const, stations: [], unreadable: [], reason: "No station is paired with this GitHub account yet." };

// Le parcours monté dans un écran, tel qu'il se lit : chaque élément, sa balise, sa classe et son texte — la phrase
// d'accueil mise à part.
const parcoursDans = (racine: Faux) => racine.dessous("section").find((section) => section.className === "parcours-projet carte") ?? assert.fail("pas de parcours");
const forme = (parcours: Faux) => [...parcours.descendants()].filter((pose) => pose.className !== "bienvenue").map((pose) => [pose.balise, pose.className, pose.children.length === 0 ? pose.textContent : ""]);

async function lesDeuxEcrans(compte: () => CompteGitHub) {
  const premier = await jouerLaVue({ demarrage: () => demarrage([]), stationsDuChef: () => AUCUNE, compteGitHub: compte, espace: () => [] });
  const ajout = await jouerLaVue({ demarrage: () => demarrage([PARADE]), compteGitHub: compte, espace: () => [] });
  (ajout.poses().find((pose) => pose.id === "entree-ajout") ?? assert.fail("pas de « + »")).click();
  await repos();
  assert.equal(ajout.element("ajout").hidden, false);
  return { premier, ajout, auPremier: parcoursDans(premier.element("tous")), aLAjout: parcoursDans(ajout.element("parcours-de-l-ajout")) };
}

describe("le premier lancement et l'écran d'ajout montent le même parcours", () => {
  for (const [cas, compte] of [
    ["connecté", { login: "octo-chef" }],
    ["sans compte", { nonConnecte: true }],
  ] as const) {
    test(`${cas} : mêmes étapes, mêmes mots — seule la phrase d'accueil du premier lancement les distingue`, async () => {
      const { auPremier, aLAjout } = await lesDeuxEcrans(() => compte);
      assert.deepEqual(forme(auPremier), forme(aLAjout));
      assert.equal(auPremier.children[0]?.textContent, BIENVENUE);
      assert.equal(aLAjout.dessous("p").some((pose) => pose.textContent === BIENVENUE), false);
      for (const parcours of [auPremier, aLAjout]) assert.deepEqual([...parcours.dessous("input"), ...parcours.dessous("label")], []);
    });
  }

  test("le compte connecté sur cet ordinateur se dit dans les deux, lu une fois par `compteGitHub`", async () => {
    const { premier, ajout, auPremier, aLAjout } = await lesDeuxEcrans(() => ({ login: "octo-chef" }));
    for (const parcours of [auPremier, aLAjout]) {
      assert.ok(parcours.dessous("p").some((pose) => pose.textContent === connecteEnTantQue("octo-chef")));
      assert.ok(parcours.dessous("button").some((bouton) => bouton.textContent === CHANGER_DE_COMPTE));
    }
    for (const vue of [premier, ajout]) assert.equal(vue.appels.filter(({ geste }) => geste === "compteGitHub").length, 1);
  });

  test("sur l'écran d'ajout, changer de compte lance la connexion ; au bout, le compte est relu", async () => {
    let lectures = 0;
    const vue = await jouerLaVue({
      demarrage: () => demarrage([PARADE]),
      compteGitHub: () => (++lectures === 1 ? { login: "octo-chef" } : { login: "autre-chef" }),
      seConnecterAGitHub: () => ({ code: "A1B2-C3D4", page: "https://github.com/login/device" }),
      espace: () => [],
    });
    (vue.poses().find((pose) => pose.id === "entree-ajout") ?? assert.fail()).click();
    await repos();
    const parcours = () => parcoursDans(vue.element("parcours-de-l-ajout"));
    (parcours().dessous("button").find((bouton) => bouton.textContent === CHANGER_DE_COMPTE) ?? assert.fail("pas de changement de compte")).click();
    await repos();
    assert.equal(vue.appels.filter(({ geste }) => geste === "seConnecterAGitHub").length, 1);
    assert.equal(parcours().dessous("p").find((pose) => pose.className === "code-de-connexion")?.dessous("strong")[0]?.textContent, "A1B2-C3D4");
    vue.dire("surConnexionGitHub", { connecte: true });
    await repos();
    assert.equal(lectures, 2);
    assert.ok(parcours().dessous("p").some((pose) => pose.textContent === connecteEnTantQue("autre-chef")));
  });

  test("sans compte, au premier lancement, « connect to GitHub » connecte ; au bout, l'étape dit le compte", async () => {
    let lectures = 0;
    const vue = await jouerLaVue({
      demarrage: () => demarrage([]),
      stationsDuChef: () => AUCUNE,
      compteGitHub: () => (++lectures === 1 ? { nonConnecte: true } : { login: "octo-chef" }),
      seConnecterAGitHub: () => ({ connecte: true }),
      espace: () => [],
    });
    (parcoursDans(vue.element("tous")).dessous("button").find((bouton) => bouton.textContent === SE_CONNECTER) ?? assert.fail()).click();
    await repos();
    assert.equal(lectures, 2);
    assert.ok(parcoursDans(vue.element("tous")).dessous("p").some((pose) => pose.textContent === connecteEnTantQue("octo-chef")));
  });
});
