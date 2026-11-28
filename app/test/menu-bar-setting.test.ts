// Le réglage de l'état de la cuisine dans la barre des menus (#3269) : `barreDeMenus` du fichier des projets — absent,
// l'icône est là ; `false`, le chef l'a retirée —, écrit depuis Settings, sous « you ». Le fichier est un vrai fichier
// écrit par le test ; la vue est jouée telle qu'elle est, devant un faux document (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { forTheBar } from "../src/bar.ts";
import { changeMenuBar, readConfiguration } from "../src/config.ts";

import { followConfiguration } from "../src/tracking.ts";

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

});


describe("une question cliquée dans le menu", () => {
  test("le process principal l'envoie par `ouvrirCarte`, que le pont donne à `surOuvrirCarte`", () => {
    const principal = readFileSync(join(import.meta.dirname, "../src/main.ts"), "utf8");
    assert.ok(principal.includes('tell("ouvrirCarte", entry.projet, entry.ticket)'));
    const bridge = readFileSync(join(import.meta.dirname, "../src/preload.cjs"), "utf8");
    assert.ok(bridge.includes('surOuvrirCarte: (receive) => void ipcRenderer.on("ouvrirCarte", (_, project, ticket) => receive(project, ticket)),'));
  });

});
