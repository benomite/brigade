// Les onglets de contenu d'un espace : deux, chacun relaie une commande du
// runtime qui existe — et seul celui qui est affiché est lu, par la veille des
// station, contre un faux `node` écrit par le test.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ACTION, ouvrirStandby, type Kitchen, type Read } from "../src/box.ts";
import { COMMAND_DES_COUTS, COUTS, commandDe, commandsDe, EVENTS_DU_LOG, ONGLETS, projectsLus, RUBRIQUES } from "../src/onglets.ts";
import { SANS_POSIX } from "./aides/posix.ts";

// Un poste d'essai : un faux `node` qui note les mots qu'il reçoit et répond « sortie de … ».
function workstation(racine: string): Kitchen {
  const node = join(racine, "node");
  writeFileSync(node, `#!/bin/sh\necho "$*" >>'${racine}/appels'\necho "sortie de $*"\n`);
  chmodSync(node, 0o755);
  const runtime = join(racine, "runtime");
  mkdirSync(runtime);
  return { locale: { node, runtime, racine, env: { PATH: process.env.PATH } } };
}

describe("les onglets de contenu d'un espace", () => {
  test("il n'y a que Log — ni Rail ni Manager (#1700), ni Cooks (#2921), ni Grants (#2924)", () => {
    assert.deepEqual(ONGLETS.map(({ titre }) => titre), ["Log"]);
    assert.deepEqual(RUBRIQUES.map(({ lectures }) => lectures), [["parametres"]]);
  });

  test("chacun relaie une commande que le geste de la box accepte : un script du runtime, tel qu'il existe", () => {
    const { scripts } = JSON.parse(readFileSync(join(import.meta.dirname, "../../runtime/package.json"), "utf8")) as { scripts: Record<string, string> };

    assert.deepEqual(ONGLETS.map(({ commande: command }) => command), [`log --last ${EVENTS_DU_LOG}`]);
    for (const { commande: command } of ONGLETS) assert.ok((command.split(" ")[0] as string) in scripts, `« ${command} » n'est pas un script du runtime`);
    // Et ce que lit la page des coûts de l'app (`station`).
    for (const command of [COMMAND_DES_COUTS]) assert.ok((command.split(" ")[0] as string) in scripts, `« ${command} » n'est pas un script du runtime`);
  });

  test("la vue nomme un onglet, pas une commande : un nom qui n'est pas celui d'un onglet ne lance rien", () => {
    assert.deepEqual(ONGLETS.map(({ id }) => commandDe(id)), ["log --last 200"]);
    // Rail et Manager ne sont plus des onglets (#1700) : leur nom ne lance plus rien.
    for (const autre of ["status", "start", "rail; rm -rf /", "", undefined, 3, null, "fiabilite", "cooks", "closer", "rail", "manager", "grants"]) {
      assert.equal(commandDe(autre), undefined);
      assert.deepEqual(commandsDe(autre), []);
    }
    assert.deepEqual(commandsDe(COUTS), [COMMAND_DES_COUTS]);
  });

  test("un onglet ne lit que la cuisine de son projet ; la page des coûts de l'app lit chaque projet qui cuit ici (#1022)", () => {
    const projects = [
      { nom: "parade", ici: true },
      { nom: "cantine", ici: true },
      { nom: "local" },
    ];
    for (const { id } of ONGLETS) assert.deepEqual(projectsLus(id, "parade", projects).map(({ nom: name }) => name), ["parade"], id);
    assert.deepEqual(projectsLus(COUTS, undefined, projects).map(({ nom: name }) => name), ["parade", "cantine"]);
    assert.deepEqual(projectsLus(COUTS, "parade", projects).map(({ nom: name }) => name), ["parade", "cantine"]);
    // Elle lit `station`, une commande du runtime ; elle n'est l'onglet d'aucun projet, et aucun onglet n'est Cost.
    assert.equal(COMMAND_DES_COUTS, "station");
    assert.equal(commandDe(COUTS), undefined);
    assert.ok(!RUBRIQUES.some(({ titre, lectures }) => titre === "Cost" || lectures.includes(COUTS)));
  });

  test("seul l'onglet affiché est lu : une commande du geste, pour cet onglet — pas une par onglet", { skip: SANS_POSIX }, async (t) => {
    const racine = mkdtempSync(join(tmpdir(), "brigade-app-onglets-"));
    const kitchen = workstation(racine);
    const { promise: first, resolve: surRead } = Promise.withResolvers<Read>();
    const standby = ouvrirStandby({ intervalleMs: 3_600_000, delaiMs: 60_000, cuisine: () => kitchen, surLecture: surRead });
    t.after(() => {
      standby.fermer();
      rmSync(racine, { recursive: true, force: true });
    });

    standby.regarder([{ nom: "brigade", dossier: "/projets/brigade" }], [commandDe("log") as string], 1);
    const read = await first;

    assert.deepEqual("sorties" in read && read.sorties.map(({ commande: command }) => command), [`log --last ${EVENTS_DU_LOG}`]);
    assert.deepEqual(readFileSync(join(racine, "appels"), "utf8").trim().split("\n"), [`${join(kitchen.locale.runtime, ACTION)} brigade log --last ${EVENTS_DU_LOG}`]);
  });

  test("l'onglet Log ne demande que la fin du journal, et le dit", () => {
    const log = ONGLETS.find(({ id }) => id === "log");
    assert.equal(log?.commande, "log --last 200");
    assert.match(log?.precision ?? "", /latest 200 events/);
  });
});
