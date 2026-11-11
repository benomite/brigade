// Le réglage de l'état de la cuisine dans la barre des menus (#3269) : `barreDeMenus` du fichier des projets — absent,
// l'icône est là ; `false`, le chef l'a retirée —, écrit depuis Settings, sous « you ». Le fichier est un vrai fichier
// écrit par le test ; la vue est jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { changerBarreDeMenus, EXEMPLE, lireConfiguration, type Projet } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE } from "../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { personnelles } from "../src/reglages-perso/partage.ts";
import { suivreConfiguration } from "../src/suivi.ts";
import { type Faux, type Jouee, jouerLaVue, ouvrirLecture, repos } from "./aides/fausse-vue.ts";

function fichier(t: TestContext, contenu: unknown): { racine: string; chemin: string } {
  const racine = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-")));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const chemin = join(racine, "app.json");
  writeFileSync(chemin, JSON.stringify(contenu));
  return { racine, chemin };
}

describe("`barreDeMenus` dans le fichier des projets", () => {
  test("absent, rien n'est dit — l'icône est là ; écrit, il est lu", (t) => {
    const { racine, chemin } = fichier(t, { projets: [{ nom: "a", dossier: "/" }] });
    assert.equal(lireConfiguration(chemin, racine).barreDeMenus, undefined);
    writeFileSync(chemin, JSON.stringify({ projets: [], barreDeMenus: false }));
    assert.equal(lireConfiguration(chemin, racine).barreDeMenus, false);
  });

  test("une valeur qui n'est ni vrai ni faux : le fichier n'est pas compris, et dit pourquoi", (t) => {
    const { racine, chemin } = fichier(t, { projets: [], barreDeMenus: "non" });
    assert.match(lireConfiguration(chemin, racine).refus ?? "", /“barreDeMenus” must be true or false/);
  });

  test("l'éteindre l'écrit, et rien d'autre du fichier ; le rallumer aussi ; une valeur qui n'est pas un booléen n'écrit rien", (t) => {
    const { racine, chemin } = fichier(t, { projets: [{ nom: "a", dossier: "/", sigle: "A" }], autre: 1 });
    assert.equal(changerBarreDeMenus(chemin, false, racine), undefined);
    assert.deepEqual(JSON.parse(readFileSync(chemin, "utf8")), { projets: [{ nom: "a", dossier: "/", sigle: "A" }], autre: 1, barreDeMenus: false });
    assert.equal(changerBarreDeMenus(chemin, true, racine), undefined);
    assert.equal(JSON.parse(readFileSync(chemin, "utf8")).barreDeMenus, true);
    assert.match(changerBarreDeMenus(chemin, "off", racine) ?? "", /^nothing was written: .*true or false/);
    assert.equal(JSON.parse(readFileSync(chemin, "utf8")).barreDeMenus, true);
  });

  test("déjà dans l'état voulu, le fichier n'est pas réécrit", (t) => {
    const { racine, chemin } = fichier(t, { projets: [] });
    const avant = readFileSync(chemin, "utf8");
    assert.equal(changerBarreDeMenus(chemin, true, racine), undefined);
    assert.equal(readFileSync(chemin, "utf8"), avant);
  });

  test("un fichier que l'app ne comprend pas n'est pas réécrit", (t) => {
    const { racine, chemin } = fichier(t, { projets: "pas une liste" });
    assert.match(changerBarreDeMenus(chemin, false, racine) ?? "", /does not write into a file it has not understood/);
    assert.deepEqual(JSON.parse(readFileSync(chemin, "utf8")), { projets: "pas une liste" });
  });

  test("par le suivi du fichier, comme le process principal l'écrit : la configuration le porte aussitôt, et la vue avec", (t) => {
    const { racine, chemin } = fichier(t, { projets: [] });
    const suivie = suivreConfiguration({ chemin, maison: racine, surChangement: () => {} });
    t.after(() => suivie.fermer());
    assert.equal(suivie.changerBarreDeMenus(false), undefined);
    assert.equal(suivie.configuration().barreDeMenus, false);
    assert.equal(pourLaBarre(suivie.configuration()).barreDeMenus, false);
  });

  test("c'est une préférence d'affichage : elle suit le chef d'un appareil à l'autre", () => {
    assert.deepEqual(personnelles({ projets: [], barreDeMenus: false }), { projets: [], barreDeMenus: false });
  });
});

describe("la ligne de Settings", () => {
  const projets: Projet[] = [{ nom: "mirrorlab", dossier: "/tmp/mirrorlab" }];
  const jouer = (barreDeMenus: boolean | undefined, poste: { nom: string; mac: boolean }, changerBarreDeMenus: (actif: boolean) => string | undefined = () => undefined) =>
    jouerLaVue({
      demarrage: () => ({
        poste,
        configuration: pourLaBarre({ chemin: "/tmp/app.json", projets, ...(barreDeMenus === undefined ? {} : { barreDeMenus }) }, () => true),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS,
        rubriques: RUBRIQUES,
        gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE,
        calibrage: { modeles: MODELES, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
      changerBarreDeMenus,
    });
  const ligne = (vue: Jouee): Faux => vue.element("barre-de-menus").children.find(({ className }) => className === "reglage") ?? assert.fail("pas de ligne de la barre des menus");
  const ouvrirReglages = async (vue: Jouee) => {
    const cas = vue.element("projets").children.find(({ title }) => title.split(" — ")[0] === "mirrorlab") ?? assert.fail("pas de case");
    cas.click();
    await repos();
    await ouvrirLecture(vue, "Settings");
  };
  const bascule = (vue: Jouee): Faux => ligne(vue).dessous("button").find(({ role }) => role === "switch") ?? ligne(vue).dessous("button")[0] ?? assert.fail("pas d'interrupteur");

  test("sur un Mac, « Menu bar », sous toi, montrée par défaut ; l'interrupteur l'éteint", async () => {
    const vue = await jouer(undefined, { nom: "this Mac", mac: true });
    await ouvrirReglages(vue);
    assert.equal(vue.element("barre-de-menus").hidden, false);
    assert.equal(ligne(vue).dataset.cle, "barre-de-menus");
    assert.match(ligne(vue).textContent, /^Menu bar.*you.*shown/);
    assert.equal(bascule(vue).ariaChecked, "true");
    bascule(vue).click();
    await repos();
    assert.deepEqual(vue.dernier("changerBarreDeMenus"), [false]);
  });

  test("sous Windows, « Notification area » ; éteinte, elle le dit, et l'interrupteur la rallume", async () => {
    const vue = await jouer(false, { nom: "this PC", mac: false });
    await ouvrirReglages(vue);
    assert.match(ligne(vue).textContent, /^Notification area.*hidden/);
    assert.equal(bascule(vue).ariaChecked, "false");
    bascule(vue).click();
    await repos();
    assert.deepEqual(vue.dernier("changerBarreDeMenus"), [true]);
  });

  test("un refus se dit sous la ligne", async () => {
    const vue = await jouer(undefined, { nom: "this Mac", mac: true }, () => "the app does not write to a file it could not re-read — unreadable JSON");
    await ouvrirReglages(vue);
    bascule(vue).click();
    await repos();
    assert.deepEqual(
      ligne(vue).dessous("p").filter(({ className }) => className === "dit refus").map(({ textContent }) => textContent),
      ["the app does not write to a file it could not re-read — unreadable JSON"],
    );
  });
});

describe("une question cliquée dans le menu", () => {
  test("le process principal l'envoie par `ouvrirCarte`, que le pont donne à `surOuvrirCarte`", () => {
    const principal = readFileSync(join(import.meta.dirname, "../src/main.ts"), "utf8");
    assert.ok(principal.includes('dire("ouvrirCarte", entree.projet, entree.ticket)'));
    const pont = readFileSync(join(import.meta.dirname, "../src/preload.cjs"), "utf8");
    assert.ok(pont.includes('surOuvrirCarte: (recevoir) => void ipcRenderer.on("ouvrirCarte", (_, projet, ticket) => recevoir(projet, ticket)),'));
  });

  test("la vue ouvre le projet, puis la fiche de sa carte", async () => {
    const vue = await jouerLaVue({
      demarrage: () => ({
        poste: { nom: "this Mac", mac: true },
        configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "brigade", dossier: "/tmp/brigade" }, { nom: "mirrorlab", dossier: "/tmp/mirrorlab" }] }, () => true),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS,
        rubriques: RUBRIQUES,
        gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE,
        calibrage: { modeles: MODELES, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
    });
    assert.equal(vue.element("fiche").hidden, true);
    vue.dire("surOuvrirCarte", "mirrorlab", 7);
    await repos();
    assert.equal(vue.element("espace").textContent, "mirrorlab");
    assert.equal(vue.element("fiche").hidden, false);
    assert.match(vue.element("fiche").textContent, /#7/);
  });
});
