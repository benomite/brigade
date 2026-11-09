// Les projets que sert la station de cet ordinateur, dans Settings (#2359, épique #2356) : une ligne d'en-tête qui dit,
// à l'installation, que cet ordinateur ne sert aucun projet, puis une case par projet de l'app. Cocher un projet
// l'écrit dans la liste de la station, et la ligne « aucun projet » s'en va ; rouvert, l'écran le montre encore coché ;
// décocher le dernier ramène la ligne. L'écran est joué devant un faux document ; derrière son pont, la station lit et
// écrit pour de bon, par `lireProjetsServis`, `ajouterProjetServi` et `retirerProjetServi` du runtime, dans un
// répertoire du test.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { ajouterProjetServi, cheminDesProjetsServis, DepotRefuse, lireProjetsServis, ProjetsServisIllisibles, retirerProjetServi } from "../../../runtime/src/station-ordinateur/projets-servis.ts";
import {
  AUCUN,
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
import { Faux, repos } from "../aides/fausse-vue.ts";

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

// Ce que le process principal fait de la station (main.ts) : lire sa liste, y ajouter ou en retirer un dépôt.
const refusDe = (erreur: unknown): LectureDesProjetsServis => {
  if (erreur instanceof DepotRefuse || erreur instanceof ProjetsServisIllisibles) return { refus: erreur.message };
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
      try {
        return Promise.resolve({ depots: servi ? ajouterProjetServi(station, depot) : retirerProjetServi(station, depot) });
      } catch (erreur) {
        return Promise.resolve(refusDe(erreur));
      }
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
  const ecran = (): Faux => poserLesProjetsServis(doc, { etat: tenue.etat ?? assert.fail("l'écran n'est pas posé"), projets: options.projets ?? PROJETS, ici: ICI }, tenue.gestes);
  return { appels, tenue, ecran };
}

const tete = (ecran: Faux) => ecran.children[0] ?? assert.fail("pas de ligne d'en-tête");
const lignes = (ecran: Faux) => ecran.children.filter((enfant) => enfant.dataset.projet !== undefined);
const ligne = (ecran: Faux, projet: string) => lignes(ecran).find((enfant) => enfant.dataset.projet === projet) ?? assert.fail(`pas de ligne pour ${projet}`);
const caseDe = (racine: Faux) => racine.dessous("input").find((champ) => champ.type === "checkbox") ?? assert.fail("pas de case");
const valeurDe = (racine: Faux) => racine.children[1]?.textContent;
// Cocher ou décocher, comme le chef : la case change, puis son écoute l'apprend.
const cocher = (racine: Faux, cochee: boolean) => {
  const coche = caseDe(racine);
  coche.checked = cochee;
  coche.declencher("change");
};
const ditAucun = (ecran: Faux) => tete(ecran).textContent.includes(AUCUN(ICI));
// Les survols de l'écran : leur texte n'est que dans le nom accessible de leur déclencheur.
const survols = (racine: Faux) => racine.dessous("button").filter((element) => element.className === "aide").map((element) => element.ariaLabel);

describe("à l'installation", () => {
  test("aucun projet n'est choisi : chaque projet de l'app a sa case, décochée, et l'écran dit que ce Mac n'en sert aucun", async () => {
    const racine = station();
    const app = ouvre(racine);
    await app.tenue.lire();
    const ecran = app.ecran();
    assert.ok(ditAucun(ecran), "la ligne « aucun projet » se lit en tête");
    assert.equal(AUCUN(ICI), "this computer serves no project");
    // Les projets offerts sont ceux de l'app, dans son ordre — et rien d'autre.
    assert.deepEqual(lignes(ecran).map((rang) => rang.dataset.projet), ["parade", "cantine", "brouillon"]);
    for (const projet of ["parade", "cantine"]) {
      assert.equal(caseDe(ligne(ecran, projet)).checked, false);
      assert.equal(valeurDe(ligne(ecran, projet)), PAS_SERVI);
    }
    // Rien n'est écrit tant que le chef ne choisit pas : la station n'a toujours pas de liste.
    assert.equal(existsSync(cheminDesProjetsServis(racine)), false);
    assert.deepEqual(app.appels, []);
    // Chaque ligne est la rangée de réglage (#2920) : la case s'applique à son changement, sans « save » ; gardée sur la
    // station, elle ne dit pas de PR. Le dépôt se lit à côté du nom.
    for (const rang of lignes(ecran)) {
      assert.equal(rang.className, "reglage");
      assert.equal(rang.dessous("button").some((bouton) => /save|propose/i.test(bouton.textContent)), false);
      assert.equal(rang.dessous("p").some((p) => p.className === "par-pr"), false);
    }
    assert.equal(ligne(ecran, "parade").children[0]?.textContent, "paradechef/parade");
  });

  test("un projet dont l'app ne connaît pas le dépôt a sa case muette, la raison au survol", async () => {
    const app = ouvre(station());
    await app.tenue.lire();
    const brouillon = ligne(app.ecran(), "brouillon");
    assert.equal(caseDe(brouillon).disabled, true);
    assert.deepEqual(survols(brouillon), [SANS_DEPOT]);
  });
});

describe("choisir un projet", () => {
  test("cocher parade l'écrit dans la liste de la station : la ligne « aucun projet » s'en va, et l'app rouverte le montre coché", async () => {
    const racine = station();
    const app = ouvre(racine);
    await app.tenue.lire();
    cocher(ligne(app.ecran(), "parade"), true);
    assert.equal(valeurDe(ligne(app.ecran(), "parade")), "Saving…", "le geste en route se dit");
    assert.ok(lignes(app.ecran()).every((rang) => caseDe(rang).disabled), "un projet à la fois");
    await repos();
    assert.deepEqual(app.appels, [{ depot: "chef/parade", servi: true }]);
    // La station l'a pour de bon, dans son état local.
    assert.deepEqual(JSON.parse(readFileSync(cheminDesProjetsServis(racine), "utf8")).depots, ["chef/parade"]);
    let ecran = app.ecran();
    assert.equal(ditAucun(ecran), false, "la ligne « aucun projet » est partie");
    assert.ok(tete(ecran).textContent.includes(SERT(1)));
    assert.equal(caseDe(ligne(ecran, "parade")).checked, true);
    assert.equal(valeurDe(ligne(ecran, "parade")), SERVI);
    assert.equal(caseDe(ligne(ecran, "cantine")).checked, false);

    // L'app fermée puis rouverte : un écran neuf, qui relit la station.
    const rouverte = ouvre(racine);
    await rouverte.tenue.lire();
    ecran = rouverte.ecran();
    assert.equal(caseDe(ligne(ecran, "parade")).checked, true);
    assert.equal(valeurDe(ligne(ecran, "parade")), SERVI);
    assert.equal(ditAucun(ecran), false);
  });

  test("décocher le dernier projet servi le retire de la liste, et la ligne « aucun projet » revient", async () => {
    const racine = station();
    ajouterProjetServi(racine, "chef/parade");
    ajouterProjetServi(racine, "chef/cantine");
    const app = ouvre(racine);
    await app.tenue.lire();
    assert.ok(tete(app.ecran()).textContent.includes(SERT(2)));
    cocher(ligne(app.ecran(), "cantine"), false);
    await repos();
    assert.equal(ditAucun(app.ecran()), false, "parade est encore servi");
    cocher(ligne(app.ecran(), "parade"), false);
    await repos();
    assert.deepEqual(lireProjetsServis(racine), []);
    const ecran = app.ecran();
    assert.ok(ditAucun(ecran), "la ligne « aucun projet » est revenue");
    assert.ok(lignes(ecran).every((rang) => caseDe(rang).checked === false));
  });

  test("un dépôt de la liste qu'aucun projet de l'app ne porte garde sa ligne, cochée, et se retire d'un clic", async () => {
    const racine = station();
    ajouterProjetServi(racine, "chef/ailleurs");
    const app = ouvre(racine);
    await app.tenue.lire();
    const ailleurs = ligne(app.ecran(), "chef/ailleurs");
    assert.equal(caseDe(ailleurs).checked, true);
    assert.equal(ditAucun(app.ecran()), false, "ce Mac sert un projet, même hors de l'app");
    cocher(ailleurs, false);
    await repos();
    assert.deepEqual(lireProjetsServis(racine), []);
    assert.equal(lignes(app.ecran()).some((rang) => rang.dataset.projet === "chef/ailleurs"), false);
    assert.ok(ditAucun(app.ecran()));
  });

  test("un dépôt écrit autrement (casse) est reconnu comme celui du projet", async () => {
    const racine = station();
    ajouterProjetServi(racine, "Chef/Parade");
    const app = ouvre(racine);
    await app.tenue.lire();
    assert.equal(caseDe(ligne(app.ecran(), "parade")).checked, true);
    assert.equal(lignes(app.ecran()).length, PROJETS.length);
  });
});

describe("ce qui ne s'écrit pas", () => {
  test("un dépôt que la station refuse : rien n'est écrit, la ligne le dit en une ligne, la suite au survol, la case reste décochée", async () => {
    const racine = station();
    const app = ouvre(racine, { projets: [{ nom: "bizarre", depot: "pas un dépôt" }] });
    await app.tenue.lire();
    cocher(ligne(app.ecran(), "bizarre"), true);
    await repos();
    assert.equal(existsSync(cheminDesProjetsServis(racine)), false);
    const bizarre = ligne(app.ecran(), "bizarre");
    const dit = bizarre.dessous("p").find((element) => element.className === "dit refus") ?? assert.fail("le refus ne se dit pas");
    assert.match(dit.textContent, /^nothing was written: /);
    assert.equal(survols(dit).length, 1, "la suite du refus est au survol");
    assert.equal(caseDe(bizarre).checked, false);
    assert.ok(ditAucun(app.ecran()));
  });

  test("une liste illisible ne se lit pas comme vide : l'écran dit qu'elle est indisponible, sans case ni « aucun projet »", async () => {
    const racine = station();
    writeFileSync(cheminDesProjetsServis(racine), "{ pas du json");
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
