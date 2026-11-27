// Les onglets de contenu d'un espace : deux, chacun relaie une commande du
// runtime qui existe — et seul celui qui est affiché est lu, par la veille des
// station, contre un faux `node` écrit par le test.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ACTION, openStandby, type Kitchen, type Reading } from "../src/box.ts";
import { commandOf, commandsOf, EVENTS_OF_LOG, TABS, projectsRead, HEADINGS } from "../src/tabs.ts";
import { WITHOUT_POSIX } from "./helpers/posix.ts";

// Un poste d'essai : un faux `node` qui note les mots qu'il reçoit et répond « sortie de … ».
function workstation(root: string): Kitchen {
  const node = join(root, "node");
  writeFileSync(node, `#!/bin/sh\necho "$*" >>'${root}/appels'\necho "sortie de $*"\n`);
  chmodSync(node, 0o755);
  const runtime = join(root, "runtime");
  mkdirSync(runtime);
  return { locale: { node, runtime, racine: root, env: { PATH: process.env.PATH } } };
}

describe("les onglets de contenu d'un espace", () => {
  test("il n'y a que Log — ni Rail ni Manager (#1700), ni Cooks (#2921), ni Grants (#2924)", () => {
    assert.deepEqual(TABS.map(({ titre: title }) => title), ["Log"]);
    assert.deepEqual(HEADINGS.map(({ lectures: readings }) => readings), [["parametres"]]);
  });

  test("chacun relaie une commande du geste de la box", () => {
    assert.deepEqual(TABS.map(({ commande: command }) => command), [`log --last ${EVENTS_OF_LOG}`]);
  });

  test("la vue nomme un onglet, pas une commande : un nom qui n'est pas celui d'un onglet ne lance rien", () => {
    assert.deepEqual(TABS.map(({ id }) => commandOf(id)), ["log --last 200"]);
    // Rail et Manager ne sont plus des onglets (#1700) : leur nom ne lance plus rien.
    for (const other of ["status", "start", "rail; rm -rf /", "", undefined, 3, null, "fiabilite", "cooks", "closer", "rail", "manager", "grants"]) {
      assert.equal(commandOf(other), undefined);
      assert.deepEqual(commandsOf(other), []);
    }
  });

  test("un onglet ne lit que la cuisine de son projet ; aucun onglet n'est Cost (#4509)", () => {
    const projects = [
      { nom: "parade", ici: true },
      { nom: "cantine", ici: true },
      { nom: "local" },
    ];
    assert.deepEqual(projectsRead("parade", projects).map(({ nom: name }) => name), ["parade"]);
    assert.deepEqual(projectsRead(undefined, projects), []);
    assert.equal(commandOf("couts"), undefined);
    assert.ok(!HEADINGS.some(({ titre: title }) => title === "Cost"));
  });

  test("seul l'onglet affiché est lu : une commande du geste, pour cet onglet — pas une par onglet", { skip: WITHOUT_POSIX }, async (t) => {
    const root = mkdtempSync(join(tmpdir(), "brigade-app-onglets-"));
    const kitchen = workstation(root);
    const { promise: first, resolve: onRead } = Promise.withResolvers<Reading>();
    const standby = openStandby({ intervalleMs: 3_600_000, delaiMs: 60_000, cuisine: () => kitchen, surLecture: onRead });
    t.after(() => {
      standby.fermer();
      rmSync(root, { recursive: true, force: true });
    });

    standby.regarder([{ nom: "brigade", dossier: "/projets/brigade" }], [commandOf("log") as string], 1);
    const reading = await first;

    assert.deepEqual("sorties" in reading && reading.sorties.map(({ commande: command }) => command), [`log --last ${EVENTS_OF_LOG}`]);
    assert.deepEqual(readFileSync(join(root, "appels"), "utf8").trim().split("\n"), [`${join(kitchen.locale.runtime, ACTION)} brigade log --last ${EVENTS_OF_LOG}`]);
  });

  test("l'onglet Log ne demande que la fin du journal, et le dit", () => {
    const log = TABS.find(({ id }) => id === "log");
    assert.equal(log?.commande, "log --last 200");
    assert.match(log?.precision ?? "", /latest 200 events/);
  });
});
