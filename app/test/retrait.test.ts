// Retirer un projet de l'app : un seul geste, « Remove from the app ». Il s'éprouve contre le vrai
// fichier des projets, suivi comme dans l'app : le projet quitte le fichier et la barre, et rien
// d'autre n'a lieu — la station où il reste installé n'est pas touchée. Aucun réseau.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Projet } from "../src/config.ts";
import { RETIRER, tenirRetraits } from "../src/retrait.ts";
import { suivreConfiguration } from "../src/suivi.ts";

// Un essai : le fichier des projets, suivi comme dans l'app, et les retraits, branchés comme dans main.ts.
function essai(t: TestContext) {
  const racine = mkdtempSync(join(tmpdir(), "brigade-app-retrait-"));
  for (const dossier of ["calculus", "parade"]) mkdirSync(join(racine, dossier));
  const chemin = join(racine, "app.json");
  const calculus: Projet = { nom: "calculus", dossier: join(racine, "calculus") };
  const parade: Projet = { nom: "parade", dossier: join(racine, "parade") };
  writeFileSync(chemin, JSON.stringify({ projets: [calculus, parade] }));
  const partis: string[] = [];
  const suivi = suivreConfiguration({ chemin, surChangement: (_, quittes) => void partis.push(...quittes) });
  const retraits = tenirRetraits({ chemin, retirer: suivi.retirer });
  t.after(() => {
    suivi.fermer();
    rmSync(racine, { recursive: true, force: true });
  });
  const declares = () => (JSON.parse(readFileSync(chemin, "utf8")) as { projets: { nom: string }[] }).projets.map(({ nom }) => nom);
  return { chemin, suivi, retraits, calculus, parade, partis, declares };
}

describe("le geste de retrait d'un projet", () => {
  test("un seul geste est proposé, et son libellé dit ce qu'il touche — et ce qu'il laisse en place", (t) => {
    const { retraits, calculus, chemin } = essai(t);

    const { retirer, projet, titre } = retraits.etat(calculus);

    assert.equal(projet, "calculus");
    assert.equal(titre, "Remove this project from the app");
    assert.equal(retirer.libelle, "Remove from the app");
    assert.equal(retirer.libelle, RETIRER);
    assert.ok(retirer.lignes.some((ligne) => ligne.includes(chemin)));
    assert.match(retirer.lignes.join("\n"), /Nothing is sent to its station: the project stays installed there.*with its log intact/);
  });
});

describe("retirer de l'app", () => {
  test("le projet quitte le fichier et la barre, et l'avis dit que sa station n'a rien reçu", (t) => {
    const { retraits, calculus, suivi, partis, declares } = essai(t);

    const rendu = retraits.retirerDeLApp(calculus);

    assert.deepEqual(declares(), ["parade"]);
    assert.deepEqual(suivi.configuration().projets.map(({ nom }) => nom), ["parade"]);
    assert.deepEqual(partis, ["calculus"]);
    assert.ok("avis" in rendu);
    assert.equal(rendu.avis.titre, "“calculus” is removed from the app.");
    assert.match(rendu.avis.lignes.join("\n"), /Nothing was sent to its station: the project is still installed there, and its log was not touched\./);
  });

  test("un autre projet se retire de même, et les autres restent", (t) => {
    const { retraits, parade, declares } = essai(t);

    const rendu = retraits.retirerDeLApp(parade);

    assert.ok("avis" in rendu);
    assert.deepEqual(declares(), ["calculus"]);
  });

  test("un fichier que l'app n'a pas pu relire n'est pas réécrit : le projet n'est pas retiré, et la raison est dite", (t) => {
    const { retraits, calculus, chemin, suivi } = essai(t);
    writeFileSync(chemin, '{ "projets": [');

    const rendu = retraits.retirerDeLApp(calculus);

    assert.ok("refus" in rendu);
    assert.match(rendu.refus, /^Not removed — the app does not write to a file it could not re-read — unreadable JSON: /);
    assert.equal(readFileSync(chemin, "utf8"), '{ "projets": [');
    assert.deepEqual(suivi.configuration().projets.map(({ nom }) => nom), ["calculus", "parade"]);
  });
});
