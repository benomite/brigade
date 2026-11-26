// Le réglage de l'état de la cuisine dans la barre des menus (#3269) : `barreDeMenus` du fichier des projets — absent,
// l'icône est là ; `false`, le chef l'a retirée —, écrit depuis Settings, sous « you ». Le fichier est un vrai fichier
// écrit par le test ; la vue est jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBar } from "../src/bar.ts";
import { changerBarDeMenus, EXEMPLE, lireConfiguration, type Project } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNIERE } from "../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { EFFORTS, MODELES } from "../src/projects/projects.ts";
import { personnelles } from "../src/settings-perso/partage.ts";
import { suivreConfiguration } from "../src/suivi.ts";
import { type Faux, type Jouee, jouerLaVue, ouvrirRead, repos } from "./aides/fausse-vue.ts";

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
    assert.equal(changerBarDeMenus(chemin, false, racine), undefined);
    assert.deepEqual(JSON.parse(readFileSync(chemin, "utf8")), { projets: [{ nom: "a", dossier: "/", sigle: "A" }], autre: 1, barreDeMenus: false });
    assert.equal(changerBarDeMenus(chemin, true, racine), undefined);
    assert.equal(JSON.parse(readFileSync(chemin, "utf8")).barreDeMenus, true);
    assert.match(changerBarDeMenus(chemin, "off", racine) ?? "", /^nothing was written: .*true or false/);
    assert.equal(JSON.parse(readFileSync(chemin, "utf8")).barreDeMenus, true);
  });

  test("déjà dans l'état voulu, le fichier n'est pas réécrit", (t) => {
    const { racine, chemin } = fichier(t, { projets: [] });
    const avant = readFileSync(chemin, "utf8");
    assert.equal(changerBarDeMenus(chemin, true, racine), undefined);
    assert.equal(readFileSync(chemin, "utf8"), avant);
  });

  test("un fichier que l'app ne comprend pas n'est pas réécrit", (t) => {
    const { racine, chemin } = fichier(t, { projets: "pas une liste" });
    assert.match(changerBarDeMenus(chemin, false, racine) ?? "", /does not write into a file it has not understood/);
    assert.deepEqual(JSON.parse(readFileSync(chemin, "utf8")), { projets: "pas une liste" });
  });

  test("par le suivi du fichier, comme le process principal l'écrit : la configuration le porte aussitôt, et la vue avec", (t) => {
    const { racine, chemin } = fichier(t, { projets: [] });
    const suivie = suivreConfiguration({ chemin, maison: racine, surChangement: () => {} });
    t.after(() => suivie.fermer());
    assert.equal(suivie.changerBarreDeMenus(false), undefined);
    assert.equal(suivie.configuration().barreDeMenus, false);
    assert.equal(pourLaBar(suivie.configuration()).barreDeMenus, false);
  });

  test("c'est une préférence d'affichage : elle suit le chef d'un appareil à l'autre", () => {
    assert.deepEqual(personnelles({ projets: [], barreDeMenus: false }), { projets: [], barreDeMenus: false });
  });
});

describe("la ligne de Settings", () => {
  const projects: Project[] = [{ nom: "mirrorlab", dossier: "/tmp/mirrorlab" }];
  const jouer = (barDeMenus: boolean | undefined, workstation: { nom: string; mac: boolean }, changerBarDeMenus: (actif: boolean) => string | undefined = () => undefined) =>
    jouerLaVue({
      demarrage: () => ({
        poste: workstation,
        configuration: pourLaBar({ chemin: "/tmp/app.json", projets: projects, ...(barDeMenus === undefined ? {} : { barreDeMenus: barDeMenus }) }, () => true),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS,
        rubriques: RUBRIQUES,
        gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE,
        calibrage: { modeles: MODELES, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
      changerBarreDeMenus: changerBarDeMenus,
    });
  const line = (vue: Jouee): Faux => vue.element("barre-de-menus").children.find(({ className }) => className === "reglage") ?? assert.fail("pas de ligne de la barre des menus");
  const ouvrirSettings = async (vue: Jouee) => {
    const cas = vue.element("projets").children.find(({ title }) => title.split(" — ")[0] === "mirrorlab") ?? assert.fail("pas de case");
    cas.click();
    await repos();
    await ouvrirRead(vue, "Settings");
  };
  const bascule = (vue: Jouee): Faux => line(vue).dessous("button").find(({ role }) => role === "switch") ?? line(vue).dessous("button")[0] ?? assert.fail("pas d'interrupteur");

  test("sur un Mac, « Menu bar », sous toi, montrée par défaut ; l'interrupteur l'éteint", async () => {
    const vue = await jouer(undefined, { nom: "this Mac", mac: true });
    await ouvrirSettings(vue);
    assert.equal(vue.element("barre-de-menus").hidden, false);
    assert.equal(line(vue).dataset.cle, "barre-de-menus");
    assert.match(line(vue).textContent, /^Menu bar.*you.*shown/);
    assert.equal(bascule(vue).ariaChecked, "true");
    bascule(vue).click();
    await repos();
    assert.deepEqual(vue.dernier("changerBarreDeMenus"), [false]);
  });

  test("sous Windows, « Notification area » ; éteinte, elle le dit, et l'interrupteur la rallume", async () => {
    const vue = await jouer(false, { nom: "this PC", mac: false });
    await ouvrirSettings(vue);
    assert.match(line(vue).textContent, /^Notification area.*hidden/);
    assert.equal(bascule(vue).ariaChecked, "false");
    bascule(vue).click();
    await repos();
    assert.deepEqual(vue.dernier("changerBarreDeMenus"), [true]);
  });

  test("un refus se dit sous la ligne", async () => {
    const vue = await jouer(undefined, { nom: "this Mac", mac: true }, () => "the app does not write to a file it could not re-read — unreadable JSON");
    await ouvrirSettings(vue);
    bascule(vue).click();
    await repos();
    assert.deepEqual(
      line(vue).dessous("p").filter(({ className }) => className === "dit refus").map(({ textContent }) => textContent),
      ["the app does not write to a file it could not re-read — unreadable JSON"],
    );
  });
});

describe("une question cliquée dans le menu", () => {
  test("le process principal l'envoie par `ouvrirCarte`, que le pont donne à `surOuvrirCarte`", () => {
    const principal = readFileSync(join(import.meta.dirname, "../src/main.ts"), "utf8");
    assert.ok(principal.includes('tell("ouvrirCarte", entree.projet, entree.ticket)'));
    const pont = readFileSync(join(import.meta.dirname, "../src/preload.cjs"), "utf8");
    assert.ok(pont.includes('surOuvrirCarte: (recevoir) => void ipcRenderer.on("ouvrirCarte", (_, project, ticket) => recevoir(project, ticket)),'));
  });

  test("la vue ouvre le projet, puis la fiche de sa carte", async () => {
    const vue = await jouerLaVue({
      demarrage: () => ({
        poste: { nom: "this Mac", mac: true },
        configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: "brigade", dossier: "/tmp/brigade" }, { nom: "mirrorlab", dossier: "/tmp/mirrorlab" }] }, () => true),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS,
        rubriques: RUBRIQUES,
        gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
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
