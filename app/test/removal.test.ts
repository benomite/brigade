// Retirer un projet de l'app : un seul geste, « Remove from the app ». Il s'éprouve contre le vrai
// fichier des projets, suivi comme dans l'app : le projet quitte le fichier et la barre, le plugin
// de l'app son dossier, et rien d'autre n'a lieu — la station où il reste installé n'est pas
// touchée. Aucun réseau.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Project } from "../src/config.ts";
import { REMOVE, holdRemovals } from "../src/removal.ts";
import { followConfiguration } from "../src/tracking.ts";

// Un essai : le fichier des projets, suivi comme dans l'app, et les retraits, branchés comme dans main.ts.
function trial(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "brigade-app-retrait-"));
  for (const folder of ["calculus", "parade"]) mkdirSync(join(root, folder));
  const path = join(root, "app.json");
  const calculus: Project = { nom: "calculus", dossier: join(root, "calculus") };
  const parade: Project = { nom: "parade", dossier: join(root, "parade") };
  writeFileSync(path, JSON.stringify({ projets: [calculus, parade] }));
  const gone: string[] = [];
  const tracking = followConfiguration({ chemin: path, surChangement: (_, quittes) => void gone.push(...quittes) });
  const uninstalled: string[] = [];
  const removals = holdRemovals({ chemin: path, retirer: tracking.retirer, desinstaller: ({ dossier: folder }) => void uninstalled.push(folder) });
  t.after(() => {
    tracking.fermer();
    rmSync(root, { recursive: true, force: true });
  });
  const declares = () => (JSON.parse(readFileSync(path, "utf8")) as { projets: { nom: string }[] }).projets.map(({ nom: name }) => name);
  return { chemin: path, suivi: tracking, retraits: removals, calculus, parade, partis: gone, declares, desinstalles: uninstalled };
}

describe("le geste de retrait d'un projet", () => {
  test("un seul geste est proposé, et son libellé dit ce qu'il touche — et ce qu'il laisse en place", (t) => {
    const { retraits: removals, calculus, chemin: path } = trial(t);

    const { retirer: remove, projet: project, titre: title } = removals.etat(calculus);

    assert.equal(project, "calculus");
    assert.equal(title, "Remove this project from the app");
    assert.equal(remove.libelle, "Remove from the app");
    assert.equal(remove.libelle, REMOVE);
    assert.ok(remove.lignes.some((line) => line.includes(path)));
    assert.match(remove.lignes.join("\n"), /Nothing is sent to its station: the project stays installed there.*with its log intact/);
    assert.match(remove.lignes.join("\n"), /uninstalls the app's plugin \(\/brigade:dev, \/brigade:ask\) from its folder's local Claude Code settings — nothing else/);
    assert.match(remove.lignes.join("\n"), /a brigade plugin you installed yourself stays/);
  });
});

describe("retirer de l'app", () => {
  test("le projet quitte le fichier et la barre, et l'avis dit que sa station n'a rien reçu", (t) => {
    const { retraits: removals, calculus, suivi: tracking, partis: gone, declares, desinstalles: uninstalled } = trial(t);

    const rendered = removals.retirerDeLApp(calculus);

    assert.deepEqual(declares(), ["parade"]);
    // Le plugin de l'app quitte le dossier du projet retiré, et de lui seul (plugin-app.ts).
    assert.deepEqual(uninstalled, [calculus.dossier]);
    assert.deepEqual(tracking.configuration().projets.map(({ nom: name }) => name), ["parade"]);
    assert.deepEqual(gone, ["calculus"]);
    assert.ok("avis" in rendered);
    assert.equal(rendered.avis.titre, "“calculus” is removed from the app.");
    assert.match(rendered.avis.lignes.join("\n"), /Nothing was sent to its station: the project is still installed there, and its log was not touched\./);
  });

  test("un autre projet se retire de même, et les autres restent", (t) => {
    const { retraits: removals, parade, declares } = trial(t);

    const rendered = removals.retirerDeLApp(parade);

    assert.ok("avis" in rendered);
    assert.deepEqual(declares(), ["calculus"]);
  });

  test("un fichier que l'app n'a pas pu relire n'est pas réécrit : le projet n'est pas retiré, et la raison est dite", (t) => {
    const { retraits: removals, calculus, chemin: path, suivi: tracking, desinstalles: uninstalled } = trial(t);
    writeFileSync(path, '{ "projets": [');

    const rendered = removals.retirerDeLApp(calculus);

    assert.ok("refus" in rendered);
    assert.match(rendered.refus, /^Not removed — the app does not write to a file it could not re-read — unreadable JSON: /);
    assert.equal(readFileSync(path, "utf8"), '{ "projets": [');
    assert.deepEqual(tracking.configuration().projets.map(({ nom: name }) => name), ["calculus", "parade"]);
    // Pas retiré, il garde le plugin de l'app.
    assert.deepEqual(uninstalled, []);
  });
});
