// Les onglets de contenu d'un espace : deux, chacun relaie une commande du
// runtime qui existe — et seul celui qui est affiché est lu, par la veille des
// station, contre un faux `node` écrit par le test.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { GESTE, ouvrirVeille, type Cuisine, type Lecture } from "../src/box.ts";
import { COMMANDE_DES_COUTS, COMMANDE_DES_RATIOS, COUTS, commandeDe, commandesDe, EVENEMENTS_DU_LOG, ONGLETS, projetsLus, RATIOS, RUBRIQUES } from "../src/onglets.ts";
import { SANS_POSIX } from "./aides/posix.ts";

// Un poste d'essai : un faux `node` qui note les mots qu'il reçoit et répond « sortie de … ».
function poste(racine: string): Cuisine {
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

    assert.deepEqual(ONGLETS.map(({ commande }) => commande), [`log --last ${EVENEMENTS_DU_LOG}`]);
    for (const { commande } of ONGLETS) assert.ok((commande.split(" ")[0] as string) in scripts, `« ${commande} » n'est pas un script du runtime`);
    // Et ce que lisent les pages de l'app : coûts (`station`) et ratios (`closing --json`).
    for (const commande of [COMMANDE_DES_COUTS, COMMANDE_DES_RATIOS]) assert.ok((commande.split(" ")[0] as string) in scripts, `« ${commande} » n'est pas un script du runtime`);
  });

  test("la vue nomme un onglet, pas une commande : un nom qui n'est pas celui d'un onglet ne lance rien", () => {
    assert.deepEqual(ONGLETS.map(({ id }) => commandeDe(id)), ["log --last 200"]);
    // Rail et Manager ne sont plus des onglets (#1700) : leur nom ne lance plus rien.
    for (const autre of ["status", "start", "rail; rm -rf /", "", undefined, 3, null, "fiabilite", "cooks", "closer", "rail", "manager", "grants"]) {
      assert.equal(commandeDe(autre), undefined);
      assert.deepEqual(commandesDe(autre), []);
    }
    assert.deepEqual(commandesDe(COUTS), [COMMANDE_DES_COUTS]);
  });

  test("un onglet ne lit que la cuisine de son projet ; la page des coûts de l'app lit chaque projet qui cuit ici (#1022)", () => {
    const projets = [
      { nom: "parade", ici: true },
      { nom: "cantine", ici: true },
      { nom: "local" },
    ];
    for (const { id } of ONGLETS) assert.deepEqual(projetsLus(id, "parade", projets).map(({ nom }) => nom), ["parade"], id);
    assert.deepEqual(projetsLus(COUTS, undefined, projets).map(({ nom }) => nom), ["parade", "cantine"]);
    assert.deepEqual(projetsLus(COUTS, "parade", projets).map(({ nom }) => nom), ["parade", "cantine"]);
    // Elle lit `station`, une commande du runtime ; elle n'est l'onglet d'aucun projet, et aucun onglet n'est Cost.
    assert.equal(COMMANDE_DES_COUTS, "station");
    assert.equal(commandeDe(COUTS), undefined);
    assert.ok(!RUBRIQUES.some(({ titre, lectures }) => titre === "Cost" || lectures.includes(COUTS)));
  });

  test("la page des ratios de l'app lit `closing --json` sur les mêmes projets que celle des coûts (#1682)", () => {
    const projets = [
      { nom: "parade", ici: true },
      { nom: "ici", ici: true },
      { nom: "local" },
    ];
    assert.deepEqual(projetsLus(RATIOS, undefined, projets), projetsLus(COUTS, undefined, projets));
    assert.deepEqual(projetsLus(RATIOS, undefined, projets).map(({ nom }) => nom), ["parade", "ici"]);
    assert.equal(COMMANDE_DES_RATIOS, "closing --json");
    assert.equal(commandeDe(RATIOS), undefined);
    assert.deepEqual(commandesDe(RATIOS), [COMMANDE_DES_RATIOS]);
  });

  test("seul l'onglet affiché est lu : une commande du geste, pour cet onglet — pas une par onglet", { skip: SANS_POSIX }, async (t) => {
    const racine = mkdtempSync(join(tmpdir(), "brigade-app-onglets-"));
    const cuisine = poste(racine);
    const { promise: premiere, resolve: surLecture } = Promise.withResolvers<Lecture>();
    const veille = ouvrirVeille({ intervalleMs: 3_600_000, delaiMs: 60_000, cuisine: () => cuisine, surLecture });
    t.after(() => {
      veille.fermer();
      rmSync(racine, { recursive: true, force: true });
    });

    veille.regarder([{ nom: "brigade", dossier: "/projets/brigade" }], [commandeDe("log") as string], 1);
    const lecture = await premiere;

    assert.deepEqual("sorties" in lecture && lecture.sorties.map(({ commande }) => commande), [`log --last ${EVENEMENTS_DU_LOG}`]);
    assert.deepEqual(readFileSync(join(racine, "appels"), "utf8").trim().split("\n"), [`${join(cuisine.locale.runtime, GESTE)} brigade log --last ${EVENEMENTS_DU_LOG}`]);
  });

  test("l'onglet Log ne demande que la fin du journal, et le dit", () => {
    const log = ONGLETS.find(({ id }) => id === "log");
    assert.equal(log?.commande, "log --last 200");
    assert.match(log?.precision ?? "", /latest 200 events/);
  });
});
