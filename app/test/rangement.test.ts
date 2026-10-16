// Ranger les projets dans la barre : une case se glisse et se lâche ailleurs — elle prend cette
// place, et les autres se décalent. Un trait dit où elle atterrira ; l'ordre est celui du fichier
// des projets, que « Tous les projets » suit aussi ; un simple clic ouvre toujours son projet.
// La vue est jouée devant un faux document (aides/fausse-vue.ts) : le glisser du navigateur y est
// rejoué événement par événement, sur la case puis sur la barre, comme ils remontent.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { BOUTONS } from "../src/boutons.ts";
import { EXEMPLE, type Projet } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { EFFORTS, MODELES } from "../src/installation.ts";
import { GESTES_DU_MANAGER } from "../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { type Faux, FauxTransfert, jouerLaVue, type Jouee, repos } from "./aides/fausse-vue.ts";

const projet = (nom: string): Projet => ({ nom, dossier: `/tmp/${nom}` });
const [A, B, C, D] = ["alpha", "bravo", "charlie", "delta"].map(projet) as [Projet, Projet, Projet, Projet];
const affichee = (projets: Projet[]) => pourLaBarre({ chemin: "/tmp/app.json", projets });

const jouer = (projets: Projet[], ranger: (nom: string, rang: number) => string | undefined = () => undefined) =>
  jouerLaVue({
    demarrage: () => ({
      configuration: affichee(projets),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS,
      rubriques: RUBRIQUES,
      boutons: BOUTONS,
      gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
    }),
    espace: () => [],
    ranger,
  });

// La barre : « T », les projets dans l'ordre du fichier, puis « + ».
const barre = (vue: Jouee) => vue.element("projets");
const caseDe = (vue: Jouee, nom: string): Faux => barre(vue).children.find(({ title }) => title === nom) ?? assert.fail(`pas de case « ${nom} »`);
const ordre = (vue: Jouee) => barre(vue).children.map(({ title }) => title);
const traits = (vue: Jouee) =>
  barre(vue).children.flatMap(({ title, classList }) => [...(classList.contains("depot-avant") ? [`avant ${title}`] : []), ...(classList.contains("depot-apres") ? [`après ${title}`] : [])]);
const rangements = (vue: Jouee) => vue.appels.filter(({ geste }) => geste === "ranger").map(({ args }) => args);

// Un événement de glisser, tel qu'il remonte : de la case survolée jusqu'à la barre, à moins
// qu'une écoute ne l'arrête. Rend s'il a été accepté — `preventDefault`, ce qui permet de lâcher.
function remonter(vue: Jouee, type: string, ou: Faux | undefined, transfert: FauxTransfert, relatedTarget: Faux | null = null): boolean {
  let accepte = false;
  let arrete = false;
  const evenement = { dataTransfer: transfert, relatedTarget, preventDefault: () => void (accepte = true), stopPropagation: () => void (arrete = true) };
  for (const element of [...(ou === undefined ? [] : [ou]), barre(vue)]) {
    if (arrete) break;
    element.declencher(type, evenement);
  }
  return accepte;
}

// Le chef prend une case : rend ce qu'elle porte, pour la suite du geste.
function prendre(vue: Jouee, nom: string): FauxTransfert {
  const transfert = new FauxTransfert();
  caseDe(vue, nom).declencher("dragstart", { dataTransfer: transfert });
  return transfert;
}

describe("ranger les projets en les glissant dans la barre", () => {
  test("chaque case de projet se glisse — « Tous les projets » et l'ajout ne bougent pas", async () => {
    const vue = await jouer([A, B, C]);

    assert.deepEqual(
      barre(vue).children.map(({ title, draggable }) => [title, draggable === true]),
      [
        ["All projects", false],
        ["alpha", true],
        ["bravo", true],
        ["charlie", true],
        ["Add a project", false],
      ],
    );
  });

  test("une case glissée vers le haut : un trait avant la case survolée — lâchée, elle prend sa place", async () => {
    const vue = await jouer([A, B, C, D]);
    const transfert = prendre(vue, "charlie");

    assert.equal(caseDe(vue, "charlie").classList.contains("glissee"), true, "la case glissée s'efface à demi");
    assert.equal(remonter(vue, "dragover", caseDe(vue, "bravo"), transfert), true, "la barre accepte la case");
    assert.deepEqual(traits(vue), ["avant bravo"]);
    assert.equal(remonter(vue, "dragover", caseDe(vue, "alpha"), transfert), true);
    assert.deepEqual(traits(vue), ["avant alpha"], "un seul trait à la fois");

    remonter(vue, "drop", caseDe(vue, "alpha"), transfert);
    caseDe(vue, "charlie").declencher("dragend");
    await repos();

    assert.deepEqual(rangements(vue), [["charlie", 0]]);
    assert.deepEqual(traits(vue), []);
    assert.equal(caseDe(vue, "charlie").classList.contains("glissee"), false);
  });

  test("une case glissée vers le bas : le trait est après la case survolée", async () => {
    const vue = await jouer([A, B, C, D]);
    const transfert = prendre(vue, "alpha");

    remonter(vue, "dragover", caseDe(vue, "charlie"), transfert);
    assert.deepEqual(traits(vue), ["après charlie"]);
    remonter(vue, "drop", caseDe(vue, "charlie"), transfert);
    await repos();

    assert.deepEqual(rangements(vue), [["alpha", 2]]);
  });

  test("lâchée entre deux cases, ou sur « T », elle va où le trait le disait", async () => {
    const vue = await jouer([A, B, C]);
    const transfert = prendre(vue, "charlie");

    remonter(vue, "dragover", caseDe(vue, "alpha"), transfert);
    // Au-dessus de la première case : « T », puis l'espace qui les sépare — c'est la barre qui reçoit.
    remonter(vue, "dragover", caseDe(vue, "All projects"), transfert);
    assert.deepEqual(traits(vue), ["avant alpha"]);
    remonter(vue, "drop", undefined, transfert);
    await repos();

    assert.deepEqual(rangements(vue), [["charlie", 0]]);
  });

  test("le nouvel ordre est celui du fichier : la barre et « Tous les projets » le prennent dès qu'il revient", async () => {
    const vue = await jouer([A, B, C]);
    const titres = () => vue.element("accueil-projets").dessous("strong").map(({ textContent }) => textContent);
    assert.deepEqual(titres(), ["alpha", "bravo", "charlie"]);

    vue.dire("surConfiguration", affichee([C, A, B]), []);
    await repos();

    assert.deepEqual(ordre(vue), ["All projects", "charlie", "alpha", "bravo", "Add a project"]);
    assert.deepEqual(titres(), ["charlie", "alpha", "bravo"]);
    // Les cases reposées se rangent encore.
    const transfert = prendre(vue, "bravo");
    remonter(vue, "dragover", caseDe(vue, "charlie"), transfert);
    remonter(vue, "drop", caseDe(vue, "charlie"), transfert);
    await repos();
    assert.deepEqual(rangements(vue), [["bravo", 0]]);
  });

  test("un simple clic ouvre toujours son projet, et ne range rien", async () => {
    const vue = await jouer([A, B, C]);

    caseDe(vue, "bravo").click();
    await repos();

    assert.equal(caseDe(vue, "bravo").ariaCurrent, "true");
    assert.deepEqual(rangements(vue), []);
  });

  test("une case lâchée sur elle-même ne range rien : elle s'ouvre, comme sous un clic", async () => {
    const vue = await jouer([A, B, C]);
    const transfert = prendre(vue, "bravo");

    remonter(vue, "dragover", caseDe(vue, "alpha"), transfert);
    remonter(vue, "dragover", caseDe(vue, "bravo"), transfert);
    assert.deepEqual(traits(vue), [], "aucun trait sur sa propre case");
    remonter(vue, "drop", caseDe(vue, "bravo"), transfert);
    await repos();

    assert.deepEqual(rangements(vue), []);
    assert.equal(caseDe(vue, "bravo").ariaCurrent, "true");
  });

  test("sortie de la barre, le trait s'efface : lâchée dehors, la case reprend sa place", async () => {
    const vue = await jouer([A, B, C]);
    const transfert = prendre(vue, "charlie");

    remonter(vue, "dragover", caseDe(vue, "alpha"), transfert);
    // D'une case à l'autre, le trait reste ; hors de la barre, il part.
    remonter(vue, "dragleave", caseDe(vue, "alpha"), transfert, caseDe(vue, "bravo"));
    assert.deepEqual(traits(vue), ["avant alpha"]);
    remonter(vue, "dragleave", caseDe(vue, "alpha"), transfert, null);
    assert.deepEqual(traits(vue), []);
    caseDe(vue, "charlie").declencher("dragend");
    await repos();

    assert.deepEqual(rangements(vue), []);
    assert.equal(caseDe(vue, "charlie").classList.contains("glissee"), false);
    assert.equal(caseDe(vue, "charlie").ariaCurrent, "false");
  });

  test("ce qui est glissé d'ailleurs — un fichier, un texte — n'est pas reçu par la barre", async () => {
    const vue = await jouer([A, B, C]);
    const fichier = new FauxTransfert();
    fichier.setData("Files", "");

    assert.equal(remonter(vue, "dragover", caseDe(vue, "alpha"), fichier), false);
    assert.deepEqual(traits(vue), []);
    remonter(vue, "drop", caseDe(vue, "alpha"), fichier);
    await repos();

    assert.deepEqual(rangements(vue), []);
  });

  test("un rangement refusé le dit par-dessus l'écran, et la barre garde l'ordre du fichier", async () => {
    const vue = await jouer([A, B, C], () => "the app does not write to a file it could not re-read — unreadable JSON");
    const transfert = prendre(vue, "charlie");

    remonter(vue, "dragover", caseDe(vue, "alpha"), transfert);
    remonter(vue, "drop", caseDe(vue, "alpha"), transfert);
    await repos();

    const avis = vue.element("avis");
    assert.equal(avis.hidden, false);
    assert.match(avis.textContent, /“charlie” was not moved in the bar/);
    assert.match(avis.textContent, /unreadable JSON/);
    assert.deepEqual(ordre(vue), ["All projects", "alpha", "bravo", "charlie", "Add a project"]);
  });
});
