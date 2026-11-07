// Une seule cuisine par projet (#2110) : au lancement de l'app, la station embarquée n'ouvre pas la cuisine
// d'un projet qu'une autre station sert déjà ; elle ouvre celle d'un projet que nul autre ne sert.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { StationAppairee, StationsDuChef } from "../../runtime/src/appairage/stations-du-chef.ts";
import { jusqua, repertoireTemporaire } from "../../runtime/test/outils.ts";
import { tenirStationLocale } from "../src/poste/station.ts";
import { garderUneSeuleCuisine } from "../src/station-embarquee-cuisine-unique.ts";

const station = (id: string, name: string, depots: string[], cooks = true): StationAppairee => ({
  id,
  name,
  machine: name,
  kind: "station" as StationAppairee["kind"],
  cooks,
  version: "1.0.0",
  online: true,
  lastSeen: "2026-11-03T08:00:00.000Z",
  stoppedAt: null,
  projects: depots.map((depot) => ({ name: depot.split("/")[1] ?? depot, repository: depot })),
});
const lues = (...stations: StationAppairee[]): StationsDuChef => ({ state: "listed", stations, unreadable: [] });

const CONFIGURATION = "# projets\nbrigade acme/brigade main\nshop acme/shop main BRIGADE_X=1\n";

// Une station de cet ordinateur dont la configuration est écrite, et dont le point d'entrée, doublure, écrit
// ce qu'il lit de sa configuration au moment où la station part : ce que la vraie station ouvrirait.
function unOrdinateur(t: TestContext, configuration: string) {
  const dossier = repertoireTemporaire(t);
  const racine = join(dossier, "station");
  mkdirSync(racine);
  writeFileSync(join(racine, "projets"), configuration);
  const vu = join(dossier, "vu");
  const principal = join(dossier, "main.ts");
  writeFileSync(principal, `import { readFileSync, writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(vu)}, readFileSync(${JSON.stringify(join(racine, "projets"))}, "utf8"));\n`);
  return { racine, principal, vu };
}

async function lancer(t: TestContext, ordi: ReturnType<typeof unOrdinateur>, autres: StationsDuChef) {
  const lignes: string[] = [];
  const dire = (ligne: string) => lignes.push(ligne);
  const locale = tenirStationLocale({
    node: process.execPath,
    principal: ordi.principal,
    racine: ordi.racine,
    env: { ...process.env },
    dire,
    appairer: async () => ({ refus: "no" }),
    avantLancement: () => garderUneSeuleCuisine({ racine: ordi.racine, lire: async () => autres, soi: () => ({ gist: "moi", nom: "ordi" }), dire }),
  });
  t.after(() => locale.arreter());
  await jusqua(() => {
    try {
      readFileSync(ordi.vu);
      return true;
    } catch {
      return false;
    }
  });
  return { lignes, vu: readFileSync(ordi.vu, "utf8") };
}

test("un projet qu'une autre station sert déjà : la station de cet ordinateur ne lit pas sa ligne — aucune cuisine, aucun tableau —, et le dit avec le nom de l'autre", async (t) => {
  const ordi = unOrdinateur(t, CONFIGURATION);
  const { vu, lignes } = await lancer(t, ordi, lues(station("box1", "box", ["acme/brigade"]), station("moi", "ordi", [])));
  assert.doesNotMatch(vu, /^brigade /m);
  assert.match(vu, /^shop acme\/shop main BRIGADE_X=1$/m);
  assert.ok(lignes.some((ligne) => ligne.includes("brigade (acme/brigade) is already served by box") && ligne.includes("starts no kitchen")));
  // La ligne n'est pas perdue : en commentaire, avec la station qui sert le projet.
  assert.match(readFileSync(join(ordi.racine, "projets"), "utf8"), /^# held-back \(served by box\): brigade acme\/brigade main$/m);
});

test("un projet que nulle autre station ne sert : sa cuisine s'ouvre comme avant, la configuration n'est pas touchée", async (t) => {
  const ordi = unOrdinateur(t, CONFIGURATION);
  const { vu, lignes } = await lancer(t, ordi, lues(station("box1", "box", ["acme/autre"]), station("moi", "ordi", ["acme/brigade"]), station("tel", "phone", ["acme/shop"], false)));
  assert.equal(vu, CONFIGURATION);
  assert.deepEqual(lignes, []);
});

test("une lecture des stations qui échoue ne change rien : la station part avec sa configuration", async (t) => {
  const ordi = unOrdinateur(t, CONFIGURATION);
  const { vu } = await lancer(t, ordi, { state: "unavailable", cause: "network", reason: "offline" });
  assert.equal(vu, CONFIGURATION);
});

test("l'autre station ne sert plus le projet : sa ligne est remise telle quelle au lancement suivant", async (t) => {
  const ordi = unOrdinateur(t, CONFIGURATION);
  const dire = () => {};
  const garder = (autres: StationsDuChef) => garderUneSeuleCuisine({ racine: ordi.racine, lire: async () => autres, soi: () => ({ gist: "moi", nom: "ordi" }), dire });
  await garder(lues(station("box1", "box", ["acme/brigade"])));
  assert.match(readFileSync(join(ordi.racine, "projets"), "utf8"), /# held-back/);
  await garder(lues(station("box1", "box", ["acme/brigade"])));
  assert.equal(readFileSync(join(ordi.racine, "projets"), "utf8").match(/# held-back/g)?.length, 1);
  await garder(lues(station("box1", "box", [])));
  assert.equal(readFileSync(join(ordi.racine, "projets"), "utf8"), CONFIGURATION);
});
