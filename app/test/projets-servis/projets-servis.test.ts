// Les projets que sert la station de cet ordinateur, dans Settings (#2359, épique #2356) : une ligne d'en-tête qui dit,
// à l'installation, que cet ordinateur ne sert aucun projet, puis une ligne par projet de l'app, `served` ou `not served`.
// La liste ne se change que sur l'onglet Stations d'un projet (#3402) : l'écran la lit, sans case ni bouton. Un projet
// ajouté à la liste s'y lit servi, et la ligne « aucun projet » s'en va ; rouvert, l'écran le montre encore servi ;
// retiré, la ligne revient. L'écran est joué devant un faux document ; derrière son pont, la station lit pour de bon, par
// `lireProjetsServis` du runtime, la liste qu'`ajouterProjetServi` et `retirerProjetServi` écrivent, dans un répertoire du
// test.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { ajouterProjetServi, cheminDesProjetsServis, lireProjetsServis, ProjetsServisIllisibles, retirerProjetServi } from "../../../runtime/src/station-ordinateur/projets-servis.ts";
import {
  AIDE,
  AUCUN,
  HORS_DE_L_APP,
  ILLISIBLE,
  PAS_SERVI,
  poserLesProjetsServis,
  SANS_DEPOT,
  SERT,
  SERVI,
  tenirLesProjetsServis,
  type LectureDesProjetsServis,
  type ProjetDeLApp,
  type PontDesProjetsServis,
} from "../../src/vue/projets-servis/projets-servis.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const ICI = "this computer";
// Les projets de l'app, tels que son fichier des projets les tient : chacun avec son dépôt, sauf un ajouté à la main.
const PROJETS: ProjetDeLApp[] = [
  { nom: "parade", depot: "chef/parade" },
  { nom: "cantine", depot: "chef/cantine" },
  { nom: "brouillon" },
];

const stations: string[] = [];
after(() => {
  for (const station of stations) rmSync(station, { recursive: true, force: true });
});

// Ce que le process principal fait de la station (main.ts) : lire sa liste. Ses écritures, l'onglet Stations les fait.
const refusDe = (erreur: unknown): LectureDesProjetsServis => {
  if (erreur instanceof ProjetsServisIllisibles) return { refus: erreur.message };
  throw erreur;
};
function pontDevant(station: string, appels: { depot: string; servi: boolean }[] = []): PontDesProjetsServis {
  return {
    projetsServis: () => {
      try {
        return Promise.resolve({ depots: lireProjetsServis(station) });
      } catch (erreur) {
        return Promise.resolve(refusDe(erreur));
      }
    },
    servirUnProjet: (depot, servi) => {
      appels.push({ depot, servi });
      return Promise.resolve({ refus: "Settings does not write the list" });
    },
  };
}

// Une station dans un répertoire neuf — une installation neuve : pas de liste —, et l'app ouverte devant elle.
function station() {
  const racine = mkdtempSync(join(tmpdir(), "projets-servis-"));
  stations.push(racine);
  return racine;
}
function ouvre(racine: string, options: { pont?: PontDesProjetsServis; projets?: ProjetDeLApp[] } = {}) {
  const appels: { depot: string; servi: boolean }[] = [];
  const pont = options.pont ?? pontDevant(racine, appels);
  const tenue = tenirLesProjetsServis({ pont, rendre: () => {} });
  const ecran = (): Faux => poserLesProjetsServis(doc, { etat: tenue.etat ?? assert.fail("l'écran n'est pas posé"), projets: options.projets ?? PROJETS, ici: ICI });
  return { appels, tenue, ecran };
}

const tete = (ecran: Faux) => ecran.children[0] ?? assert.fail("pas de ligne d'en-tête");
const lignes = (ecran: Faux) => ecran.children.filter((enfant) => enfant.dataset.projet !== undefined);
const ligne = (ecran: Faux, projet: string) => lignes(ecran).find((enfant) => enfant.dataset.projet === projet) ?? assert.fail(`pas de ligne pour ${projet}`);
// La valeur d'une ligne : son premier mot, sans le survol qui le suit.
const valeurDe = (racine: Faux) => racine.children[1]?.children[0]?.textContent;
const ditAucun = (ecran: Faux) => tete(ecran).textContent.includes(AUCUN(ICI));
// Les survols de l'écran : leur texte n'est que dans le nom accessible de leur déclencheur.
const survols = (racine: Faux) => racine.dessous("button").filter((element) => element.className === "aide").map((element) => element.ariaLabel);
// Ce qui se règle : une case, un champ, un bouton qui n'est pas un survol.
const controles = (racine: Faux) => [...racine.dessous("input"), ...racine.dessous("button").filter((element) => element.className !== "aide")];

describe("à l'installation", () => {
  test("aucun projet n'est servi : chaque projet de l'app a sa ligne, not served, et l'écran dit que ce Mac n'en sert aucun", async () => {
    const racine = station();
    const app = ouvre(racine);
    await app.tenue.lire();
    const ecran = app.ecran();
    assert.ok(ditAucun(ecran), "la ligne « aucun projet » se lit en tête");
    assert.equal(AUCUN(ICI), "this computer serves no project");
    // Les projets offerts sont ceux de l'app, dans son ordre — et rien d'autre.
    assert.deepEqual(lignes(ecran).map((rang) => rang.dataset.projet), ["parade", "cantine", "brouillon"]);
    for (const projet of ["parade", "cantine"]) assert.equal(valeurDe(ligne(ecran, projet)), PAS_SERVI);
    // Lire n'écrit rien : la station n'a toujours pas de liste.
    assert.equal(existsSync(cheminDesProjetsServis(racine)), false);
    assert.deepEqual(app.appels, []);
    // Chaque ligne est la rangée de réglage (#2920), sans « save » ni PR. Le dépôt se lit à côté du nom.
    for (const rang of lignes(ecran)) {
      assert.equal(rang.className, "reglage");
      assert.equal(rang.dessous("button").some((bouton) => /save|propose/i.test(bouton.textContent)), false);
      assert.equal(rang.dessous("p").some((p) => p.className === "par-pr"), false);
    }
    assert.equal(ligne(ecran, "parade").children[0]?.textContent, "paradechef/parade");
  });

  test("un projet dont l'app ne connaît pas le dépôt le dit au survol", async () => {
    const app = ouvre(station());
    await app.tenue.lire();
    const brouillon = ligne(app.ecran(), "brouillon");
    assert.equal(valeurDe(brouillon), "–");
    assert.deepEqual(survols(brouillon), [SANS_DEPOT]);
  });
});

describe("la liste se lit ici, elle se change sur l'onglet Stations (#3402)", () => {
  test("aucune ligne n'a de contrôle : l'aide dit où un projet s'ajoute ou se retire", async () => {
    const racine = station();
    ajouterProjetServi(racine, "chef/parade");
    const app = ouvre(racine);
    await app.tenue.lire();
    const ecran = app.ecran();
    assert.deepEqual(controles(ecran), []);
    assert.deepEqual(survols(tete(ecran)), [AIDE(ICI)]);
    assert.match(AIDE(ICI), /added or removed on its Stations tab/);
    assert.deepEqual(app.appels, []);
  });

  test("parade ajouté à la liste se lit servi : la ligne « aucun projet » s'en va, et l'app rouverte le montre servi", async () => {
    const racine = station();
    const app = ouvre(racine);
    await app.tenue.lire();
    assert.ok(ditAucun(app.ecran()));
    // L'onglet Stations de parade l'ajoute ; l'écran relu le dit.
    ajouterProjetServi(racine, "chef/parade");
    await app.tenue.lire();
    // La station l'a pour de bon, dans sa configuration.
    assert.equal(readFileSync(cheminDesProjetsServis(racine), "utf8"), "parade chef/parade\n");
    let ecran = app.ecran();
    assert.equal(ditAucun(ecran), false, "la ligne « aucun projet » est partie");
    assert.ok(tete(ecran).textContent.includes(SERT(1)));
    assert.equal(valeurDe(ligne(ecran, "parade")), SERVI);
    assert.equal(valeurDe(ligne(ecran, "cantine")), PAS_SERVI);

    // L'app fermée puis rouverte : un écran neuf, qui relit la station.
    const rouverte = ouvre(racine);
    await rouverte.tenue.lire();
    ecran = rouverte.ecran();
    assert.equal(valeurDe(ligne(ecran, "parade")), SERVI);
    assert.equal(ditAucun(ecran), false);
  });

  test("le dernier projet retiré de la liste, la ligne « aucun projet » revient", async () => {
    const racine = station();
    ajouterProjetServi(racine, "chef/parade");
    ajouterProjetServi(racine, "chef/cantine");
    const app = ouvre(racine);
    await app.tenue.lire();
    assert.ok(tete(app.ecran()).textContent.includes(SERT(2)));
    retirerProjetServi(racine, "chef/cantine");
    await app.tenue.lire();
    assert.equal(ditAucun(app.ecran()), false, "parade est encore servi");
    retirerProjetServi(racine, "chef/parade");
    await app.tenue.lire();
    const ecran = app.ecran();
    assert.ok(ditAucun(ecran), "la ligne « aucun projet » est revenue");
    assert.ok(lignes(ecran).every((rang) => valeurDe(rang) !== SERVI));
  });

  test("un dépôt de la liste qu'aucun projet de l'app ne porte garde sa ligne, servi, et dit au survol comment le changer", async () => {
    const racine = station();
    ajouterProjetServi(racine, "chef/ailleurs");
    const app = ouvre(racine);
    await app.tenue.lire();
    const ailleurs = ligne(app.ecran(), "chef/ailleurs");
    assert.equal(valeurDe(ailleurs), SERVI);
    assert.deepEqual(survols(ailleurs), [HORS_DE_L_APP]);
    assert.equal(ditAucun(app.ecran()), false, "ce Mac sert un projet, même hors de l'app");
  });

  test("un dépôt écrit autrement (casse) est reconnu comme celui du projet", async () => {
    const racine = station();
    ajouterProjetServi(racine, "Chef/Parade");
    const app = ouvre(racine);
    await app.tenue.lire();
    assert.equal(valeurDe(ligne(app.ecran(), "parade")), SERVI);
    assert.equal(lignes(app.ecran()).length, PROJETS.length);
  });
});

describe("ce qui ne se lit pas", () => {
  test("une liste illisible ne se lit pas comme vide : l'écran dit qu'elle est indisponible, sans ligne ni « aucun projet »", async () => {
    const racine = station();
    // Un répertoire à la place de la configuration : elle ne se lit pas.
    mkdirSync(cheminDesProjetsServis(racine));
    const app = ouvre(racine);
    await app.tenue.lire();
    const ecran = app.ecran();
    assert.ok(tete(ecran).textContent.includes(ILLISIBLE));
    assert.equal(ditAucun(ecran), false);
    assert.deepEqual(lignes(ecran), []);
  });

  test("un appareil sans station (le téléphone) ne pose rien", async () => {
    const sansPont = tenirLesProjetsServis({ pont: {}, rendre: () => {} });
    await sansPont.lire();
    assert.equal(sansPont.etat, undefined);
    const rienDeRendu = tenirLesProjetsServis({ pont: { projetsServis: () => Promise.resolve(undefined) }, rendre: () => {} });
    await rienDeRendu.lire();
    assert.equal(rienDeRendu.etat, undefined);
  });
});
