// Une seule cuisine par projet (#2110) : au lancement de l'app, la station embarquée n'ouvre pas la cuisine
// d'un projet qu'une autre station sert déjà ; elle ouvre celle d'un projet que nul autre ne sert.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { test, type TestContext } from "node:test";
import type { StationAppairee, StationsDuChef } from "../../runtime/src/appairage/stations-du-chef.ts";
import { jusqua, repertoireTemporaire, fauxGh, aArreter } from "../../runtime/test/outils.ts";
import { lectureDesAppairees } from "../../runtime/test/aides/appairees.ts";
import { FICHIER_LOCAL } from "../../runtime/src/appairage/presence.ts";
import type { Canal, Fichiers } from "../../runtime/src/appairage/canal.ts";
import { documentDeDemande, FICHIER_PROJETS, FICHIER_SUIVI, type ProjetDemande, type SuiviDuProjet } from "../../runtime/src/projets/demande.ts";
import { FICHIER_REJOINTES, rejointesLues } from "../../runtime/src/projets/rejoindre.ts";
import { DEBUT, FIN } from "../../runtime/src/projets/bloc.ts";
import { tenirProjetsDeLApp } from "../../runtime/src/projets/tenir.ts";
import { servisPar } from "../src/poste/cuisine-ici.ts";
import { SANS_POSIX } from "./aides/posix.ts";
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

// La vraie préparation des projets de la station (runtime/src/projets/tenir.ts), sur la configuration que le
// garde de l'app a laissée : la ligne du bloc d'un projet qu'une autre station sert n'y est plus, la station
// en rejoint donc la cuisine — elle y cuit —, et n'en ouvre aucune.
const MAINTENANT = Date.parse("2026-11-03T08:00:00Z");
const BRIGADE: ProjetDemande = { nom: "brigade", depot: "acme/brigade", base: "main", principale: true, cooks: 2, manager: { modele: "sonnet", effort: "medium" }, reviewer: { modele: "sonnet", effort: "medium" }, ouvertLe: null, demandeLe: null };
const BOX = { id: "gistbox", nom: "box", sert: { brigade: "acme/brigade" } };
const MAC = { id: "gistmac", nom: "ordi" };

async function reprise(t: TestContext, autres: Parameters<typeof lectureDesAppairees>[1][]) {
  const racine = repertoireTemporaire(t);
  const gh = fauxGh(t);
  writeFileSync(join(racine, FICHIER_LOCAL), JSON.stringify({ gist: MAC.id, appairee: true, code: null, expireLe: null, echus: [] }));
  // Le bloc d'une ouverture d'avant : la cuisine de brigade s'ouvrirait ici à la relecture, sans cette garde.
  writeFileSync(join(racine, "projets"), `${DEBUT}\nbrigade acme/brigade main\n${FIN}\n`);
  const lecture = lectureDesAppairees(MAINTENANT, ...autres, MAC);
  const lignes: string[] = [];
  await garderUneSeuleCuisine({ racine, lire: async () => lecture.etat, soi: () => ({ gist: MAC.id, nom: "ordi" }), dire: (ligne) => lignes.push(ligne) });
  const gist: Fichiers = { [FICHIER_PROJETS]: documentDeDemande([BRIGADE]) };
  const canal: Canal = { creer: async () => assert.fail("aucun gist créé"), ecrire: async (_id, ecrits) => (Object.assign(gist, ecrits), "ecrit"), lire: async (id) => (id === MAC.id ? { ...gist } : null) };
  const projets = tenirProjetsDeLApp({
    racine,
    canal,
    station: "ordi",
    env: { BRIGADE_GH_BIN: gh.bin, HOME: repertoireTemporaire(t) },
    servis: { projets: () => [], refus: () => null },
    apresEcriture: () => {},
    dire: () => {},
    cadenceMs: 3_600_000,
    maintenant: () => MAINTENANT,
    lireLesAppairees: async () => lecture,
    cadenceDesAppareesMs: 0,
    plateforme: "darwin",
  });
  aArreter(t, () => projets.arreter());
  await projets.relire();
  const suivi = (JSON.parse(gist[FICHIER_SUIVI] ?? "null") as { projets: SuiviDuProjet[] } | null)?.projets ?? [];
  return { racine, gh, gist, suivi, lignes };
}

test("un projet que la box sert : la vraie station de cet ordinateur n'ouvre ni cuisine ni tableau pour lui, et en rejoint la cuisine — l'ordinateur y cuit, déclaré comme cook", { skip: SANS_POSIX }, async (t) => {
  const ordi = await reprise(t, [BOX]);
  assert.deepEqual(servisPar(ordi.racine), [], "aucune ligne servie ici");
  assert.equal(existsSync(join(ordi.racine, "etat", "brigade")), false, "ni état ni journal");
  assert.equal(existsSync(join(ordi.racine, "clones", "brigade")), false, "ni clone");
  assert.deepEqual(ordi.gh.appels(), [], "rien sur GitHub, donc aucun tableau publié");
  assert.equal(ordi.suivi[0]?.etat, "secondaire");
  assert.equal(ordi.suivi[0]?.cuitSur, "box");
  assert.deepEqual(rejointesLues(ordi.gist[FICHIER_REJOINTES]), [{ nom: "brigade", depot: "acme/brigade", principale: "box", cooks: 2, fournit: ["code", "raisonnement", "macos"] }]);
  assert.ok(ordi.lignes.some((ligne) => ligne.includes("already served by box")));
});

test("sans autre station qui le serve : la même préparation garde la ligne du bloc, la cuisine s'ouvre ici comme avant", { skip: SANS_POSIX }, async (t) => {
  const ordi = await reprise(t, []);
  assert.deepEqual(servisPar(ordi.racine), ["brigade"]);
  assert.equal(ordi.suivi[0]?.cuitSur ?? null, null);
});
