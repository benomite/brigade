// Un projet dont la mise en place est mergée et qu'aucune station ne sert (#3400) : l'app demande qui le sert, et
// « this computer » l'ajoute à la liste des projets que sert la station de cet ordinateur — le geste de Settings
// (`ajouterProjetServi`, #2359). Ses tickets `fire` sont alors pris dans les deux minutes : la boucle de la station, à
// son intervalle de production (`INTERVALLE_MS`), relit la liste à chaque tour et ouvre le tour du projet ajouté.
// Ce que fait ce tour d'un ticket — prise, cook, livraison — est prouvé dans station-ordinateur/servir.test.ts.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { lieuxDuProjet } from "../../../src/station/configuration.ts";
import { ajouterProjetServi } from "../../../src/station-ordinateur/projets-servis.ts";
import { INTERVALLE_MS, servirLesProjetsChoisis, type TourDuProjet } from "../../../src/station-ordinateur/servir.ts";
import { ENV_GIT, repertoireTemporaire } from "../../outils.ts";

test("a project added to this computer's served list while the station runs has its fire ticket taken within two minutes", async (t) => {
  const racine = repertoireTemporaire(t);
  // Le clone du projet est déjà là, sa branche d'intégration lisible : seul l'ajout à la liste manque.
  const { clone } = lieuxDuProjet(racine, "secondes", racine);
  mkdirSync(join(clone, ".git"), { recursive: true });
  writeFileSync(join(clone, "CLAUDE.md"), "- **Branche d'intégration** : `main`\n");
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  // Le tour du projet : il prend le ticket fire qui attend, et note l'instant de sa prise.
  const prises: number[] = [];
  const tour: TourDuProjet = { tour: async () => void prises.push(Date.now()), enCuisine: () => [], calme: async () => {} };
  const dits: string[] = [];
  const service = servirLesProjetsChoisis({ racine, station: "mac/claude", env: ENV_GIT, maison: racine, gh: "gh-absent", claude: "claude-absent", dire: (ligne) => void dits.push(ligne), ouvrirLeTour: () => tour });
  t.after(() => service.arreter());
  const fini = async () => {
    for (let i = 0; i < 20; i++) await new Promise((suite) => setImmediate(suite));
  };
  await fini();
  // La station tourne sans rien servir : la liste est vide.
  assert.deepEqual(prises, []);
  assert.match(dits.join("\n"), /no project is chosen for this station: it serves none/);

  // Juste après un tour, le pire moment : le clic sur « this computer » écrit la liste.
  t.mock.timers.tick(1000);
  await fini();
  const clic = Date.now();
  ajouterProjetServi(racine, "chef/secondes");
  for (let s = 0; s < 180 && prises.length === 0; s++) {
    t.mock.timers.tick(1000);
    await fini();
  }
  assert.equal(prises.length, 1, "the project's turn ran");
  assert.ok(prises[0]! - clic <= 120_000, `taken ${(prises[0]! - clic) / 1000} s after the click`);
  assert.ok(INTERVALLE_MS <= 120_000);
  assert.deepEqual(service.servis(), ["chef/secondes"]);
});
