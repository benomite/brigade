// Le réglage de l'état de la cuisine dans la barre des menus (#3269) : `barreDeMenus` du fichier des projets — absent,
// l'icône est là ; `false`, le chef l'a retirée —, écrit depuis Settings, sous « you ». Le fichier est un vrai fichier
// écrit par le test ; la vue est jouée telle qu'elle est, devant un faux document (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { POWER_UP } from "../src/power-up.ts";
import { forTheBar } from "../src/bar.ts";
import { changeMenuBar, EXAMPLE, readConfiguration, type Project } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNER } from "../src/facts.ts";
import { CONFIRMED, DIRECT } from "../src/actions.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { personal } from "../src/settings-personal/share.ts";
import { followConfiguration } from "../src/tracking.ts";
import { type Fake, type Played, playTheVue, openRead, repos } from "./helpers/false-vue.ts";

function file(t: TestContext, content: unknown): { racine: string; chemin: string } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, "app.json");
  writeFileSync(path, JSON.stringify(content));
  return { racine: root, chemin: path };
}

describe("`barreDeMenus` dans le fichier des projets", () => {
  test("absent, rien n'est dit — l'icône est là ; écrit, il est lu", (t) => {
    const { racine: root, chemin: path } = file(t, { projets: [{ nom: "a", dossier: "/" }] });
    assert.equal(readConfiguration(path, root).barreDeMenus, undefined);
    writeFileSync(path, JSON.stringify({ projets: [], barreDeMenus: false }));
    assert.equal(readConfiguration(path, root).barreDeMenus, false);
  });

  test("une valeur qui n'est ni vrai ni faux : le fichier n'est pas compris, et dit pourquoi", (t) => {
    const { racine: root, chemin: path } = file(t, { projets: [], barreDeMenus: "non" });
    assert.match(readConfiguration(path, root).refus ?? "", /“barreDeMenus” must be true or false/);
  });

  test("l'éteindre l'écrit, et rien d'autre du fichier ; le rallumer aussi ; une valeur qui n'est pas un booléen n'écrit rien", (t) => {
    const { racine: root, chemin: path } = file(t, { projets: [{ nom: "a", dossier: "/", sigle: "A" }], autre: 1 });
    assert.equal(changeMenuBar(path, false, root), undefined);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { projets: [{ nom: "a", dossier: "/", sigle: "A" }], autre: 1, barreDeMenus: false });
    assert.equal(changeMenuBar(path, true, root), undefined);
    assert.equal(JSON.parse(readFileSync(path, "utf8")).barreDeMenus, true);
    assert.match(changeMenuBar(path, "off", root) ?? "", /^nothing was written: .*true or false/);
    assert.equal(JSON.parse(readFileSync(path, "utf8")).barreDeMenus, true);
  });

  test("déjà dans l'état voulu, le fichier n'est pas réécrit", (t) => {
    const { racine: root, chemin: path } = file(t, { projets: [] });
    const before = readFileSync(path, "utf8");
    assert.equal(changeMenuBar(path, true, root), undefined);
    assert.equal(readFileSync(path, "utf8"), before);
  });

  test("un fichier que l'app ne comprend pas n'est pas réécrit", (t) => {
    const { racine: root, chemin: path } = file(t, { projets: "pas une liste" });
    assert.match(changeMenuBar(path, false, root) ?? "", /does not write into a file it has not understood/);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { projets: "pas une liste" });
  });

  test("par le suivi du fichier, comme le process principal l'écrit : la configuration le porte aussitôt, et la vue avec", (t) => {
    const { racine: root, chemin: path } = file(t, { projets: [] });
    const tracked = followConfiguration({ chemin: path, maison: root, surChangement: () => {} });
    t.after(() => tracked.fermer());
    assert.equal(tracked.changerBarreDeMenus(false), undefined);
    assert.equal(tracked.configuration().barreDeMenus, false);
    assert.equal(forTheBar(tracked.configuration()).barreDeMenus, false);
  });

  test("c'est une préférence d'affichage : elle suit le chef d'un appareil à l'autre", () => {
    assert.deepEqual(personal({ projets: [], barreDeMenus: false }), { projets: [], barreDeMenus: false });
  });
});

describe("la ligne de Settings", () => {
  const projects: Project[] = [{ nom: "mirrorlab", dossier: "/tmp/mirrorlab" }];
  const play = (menuBar: boolean | undefined, workstation: { nom: string; mac: boolean }, changeMenuBar: (active: boolean) => string | undefined = () => undefined) =>
    playTheVue({
      demarrage: () => ({
        poste: workstation,
        configuration: forTheBar({ chemin: "/tmp/app.json", projets: projects, ...(menuBar === undefined ? {} : { barreDeMenus: menuBar }) }, () => true),
        palette: PALETTE,
        exemple: EXAMPLE,
        onglets: TABS,
        rubriques: HEADINGS,
        gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
        banniere: BANNER,
        calibrage: { modeles: MODELS, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
      changerBarreDeMenus: changeMenuBar,
    });
  const line = (vue: Played): Fake => vue.element("barre-de-menus").children.find(({ className }) => className === "reglage") ?? assert.fail("pas de ligne de la barre des menus");
  const openSettings = async (vue: Played) => {
    const theCase = vue.element("projets").children.find(({ title }) => title.split(" — ")[0] === "mirrorlab") ?? assert.fail("pas de case");
    theCase.click();
    await repos();
    await openRead(vue, "Settings");
  };
  const toggle = (vue: Played): Fake => line(vue).dessous("button").find(({ role }) => role === "switch") ?? line(vue).dessous("button")[0] ?? assert.fail("pas d'interrupteur");

  test("sur un Mac, « Menu bar », sous toi, montrée par défaut ; l'interrupteur l'éteint", async () => {
    const vue = await play(undefined, { nom: "this Mac", mac: true });
    await openSettings(vue);
    assert.equal(vue.element("barre-de-menus").hidden, false);
    assert.equal(line(vue).dataset.cle, "barre-de-menus");
    assert.match(line(vue).textContent, /^Menu bar.*you.*shown/);
    assert.equal(toggle(vue).ariaChecked, "true");
    toggle(vue).click();
    await repos();
    assert.deepEqual(vue.dernier("changerBarreDeMenus"), [false]);
  });

  test("sous Windows, « Notification area » ; éteinte, elle le dit, et l'interrupteur la rallume", async () => {
    const vue = await play(false, { nom: "this PC", mac: false });
    await openSettings(vue);
    assert.match(line(vue).textContent, /^Notification area.*hidden/);
    assert.equal(toggle(vue).ariaChecked, "false");
    toggle(vue).click();
    await repos();
    assert.deepEqual(vue.dernier("changerBarreDeMenus"), [true]);
  });

  test("un refus se dit sous la ligne", async () => {
    const vue = await play(undefined, { nom: "this Mac", mac: true }, () => "the app does not write to a file it could not re-read — unreadable JSON");
    await openSettings(vue);
    toggle(vue).click();
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
    assert.ok(principal.includes('tell("ouvrirCarte", entry.projet, entry.ticket)'));
    const bridge = readFileSync(join(import.meta.dirname, "../src/preload.cjs"), "utf8");
    assert.ok(bridge.includes('surOuvrirCarte: (receive) => void ipcRenderer.on("ouvrirCarte", (_, project, ticket) => receive(project, ticket)),'));
  });

  test("la vue ouvre le projet, puis la fiche de sa carte", async () => {
    const vue = await playTheVue({
      demarrage: () => ({
        poste: { nom: "this Mac", mac: true },
        configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "brigade", dossier: "/tmp/brigade" }, { nom: "mirrorlab", dossier: "/tmp/mirrorlab" }] }, () => true),
        palette: PALETTE,
        exemple: EXAMPLE,
        onglets: TABS,
        rubriques: HEADINGS,
        gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
        banniere: BANNER,
        calibrage: { modeles: MODELS, efforts: EFFORTS },
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
