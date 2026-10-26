// Les stations enregistrées sous un compte, lues comme l'app les lit (#1705) :
// le `gh` de l'ordinateur — ici une doublure qui tient les gists du compte
// dans un répertoire. Les stations s'y enregistrent par leur vraie tenue
// (`enregistrer.ts`), sur le vrai canal.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { canalGitHub } from "../../src/appairage/canal.ts";
import { FICHIER_STATION } from "../../src/appairage/document.ts";
import { FICHIER_ENREGISTREMENT, FICHIER_SELECTION } from "../../src/enregistrement-station/contrat.ts";
import { tenirEnregistrement } from "../../src/enregistrement-station/enregistrer.ts";
import { lireLesStationsDuCompte, principal, type StationsDuCompte } from "../../src/enregistrement-station/stations-du-compte.ts";
import { sansMotFrancais } from "../aides/glossaire.ts";
import { appeler, jusqua, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";
import { FAUX_GH_GISTS as FAUX_GH } from "../appairage/doublure-des-gists.ts";

const rienNeReste = temporaireDuFichier();

type Gist = { id: string; files: Record<string, { filename: string; content: string }> };

// GitHub : un répertoire, où la doublure range les gists du compte.
function unGitHub(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const avant = process.env.FAUX_GISTS;
  process.env.FAUX_GISTS = repertoire;
  t.after(() => (avant === undefined ? delete process.env.FAUX_GISTS : (process.env.FAUX_GISTS = avant)));
  const fichier = (id: string) => join(repertoire, `${id}.gist.json`);
  const gist = (id: string) => JSON.parse(readFileSync(fichier(id), "utf8")) as Gist;
  // Ajoute ces fichiers au gist, comme l'app les y écrit.
  const ajouter = (id: string, fichiers: Record<string, string>) => {
    const lu = gist(id);
    for (const [nom, content] of Object.entries(fichiers)) lu.files[nom] = { filename: nom, content };
    writeFileSync(fichier(id), JSON.stringify(lu));
  };
  const creer = (id: string, fichiers: Record<string, string>) =>
    writeFileSync(fichier(id), JSON.stringify({ id, description: "", public: false, updated_at: new Date().toISOString(), files: Object.fromEntries(Object.entries(fichiers).map(([nom, content]) => [nom, { filename: nom, content }])) }));
  return {
    repertoire,
    gist,
    ajouter,
    creer,
    tomber: (comment: "panne" | "deconnecte" | "jeton-refuse" | "limite") => writeFileSync(join(repertoire, comment), ""),
    env: () => ({ PATH: process.env.PATH ?? "", FAUX_GISTS: repertoire }),
  };
}

// Une station qui s'enregistre sur ce GitHub, par sa vraie tenue. Rend son gist et de quoi l'arrêter.
async function uneStation(t: TestContext, nom: string, plateforme: string) {
  const racine = join(repertoireTemporaire(t), nom);
  mkdirSync(racine);
  const tenue = tenirEnregistrement({
    racine,
    canal: canalGitHub({ gh: FAUX_GH }),
    identite: { nom, machine: `${nom === "mac" ? "macOS 24.1.0" : "Linux 6.1.0"}`, version: "1.4.0" },
    plateforme,
    dire: () => {},
    // Aucun minuteur : seule sa première écriture, et son arrêt.
    apres: () => () => {},
  });
  await jusqua(() => tenue.gist() !== null);
  return { id: tenue.gist() ?? "", arreter: () => tenue.arreter() };
}

const listees = (etat: StationsDuCompte) => {
  assert.equal(etat.state, "listed", JSON.stringify(etat));
  return etat.state === "listed" ? etat : assert.fail();
};

test("les stations enregistrées sous le compte sont listées, disponibles, sans appairage — les autres gists du compte écartés", async (t) => {
  const github = unGitHub(t);
  const box = await uneStation(t, "box", "linux");
  const mac = await uneStation(t, "mac", "darwin");
  // La présence d'une station appairée, et un gist qui n'a rien de brigade : ce ne sont pas des enregistrements.
  github.creer("presence", { [FICHIER_STATION]: JSON.stringify({ brigade: "station", nom: "vieille" }) });
  github.creer("notes", { "notes.md": "#" });

  const lu = listees(await lireLesStationsDuCompte({ gh: FAUX_GH }));
  assert.deepEqual(lu.unreadable, []);
  assert.equal(lu.reason, undefined);
  assert.deepEqual(
    lu.stations.map(({ id, name, platform, machine, version, account, available, stoppedAt, refreshMs, selection }) => ({ id, name, platform, machine, version, account, available, stoppedAt, refreshMs, selection })),
    [
      { id: box.id, name: "box", platform: "linux", machine: "Linux 6.1.0", version: "1.4.0", account: null, available: true, stoppedAt: null, refreshMs: 120_000, selection: null },
      { id: mac.id, name: "mac", platform: "macos", machine: "macOS 24.1.0", version: "1.4.0", account: null, available: true, stoppedAt: null, refreshMs: 120_000, selection: null },
    ],
  );
  const station = lu.stations[0] ?? assert.fail();
  assert.equal(station.registeredAt, station.lastSeen);
});

test("le compte, la sélection que l'app a écrite, et la disponibilité jugée à l'instant de la lecture", async (t) => {
  const github = unGitHub(t);
  const box = await uneStation(t, "box", "linux");
  // GitHub dit le propriétaire du gist : le compte sous lequel la station est enregistrée.
  const lu = github.gist(box.id);
  writeFileSync(join(github.repertoire, `${box.id}.gist.json`), JSON.stringify({ ...lu, owner: { login: "benomite" } }));
  github.ajouter(box.id, { [FICHIER_SELECTION]: JSON.stringify({ brigade: "station-selection", format: 1, repositories: ["acme/shop"], updatedAt: new Date().toISOString() }) });

  const vue = Date.parse(JSON.parse(github.gist(box.id).files[FICHIER_ENREGISTREMENT]?.content ?? "{}").lastSeen);
  const maintenant = listees(await lireLesStationsDuCompte({ gh: FAUX_GH, maintenant: () => vue + 270_000 })).stations[0];
  assert.equal(maintenant?.account, "benomite");
  assert.deepEqual(maintenant?.selection, ["acme/shop"]);
  assert.equal(maintenant?.available, true);
  // Éteinte d'un coup : deux signes de vie manqués et la marge, elle est indisponible.
  const plusTard = listees(await lireLesStationsDuCompte({ gh: FAUX_GH, maintenant: () => vue + 270_001 })).stations[0];
  assert.equal(plusTard?.available, false);
  assert.equal(plusTard?.stoppedAt, null);
});

test("arrêtée proprement, elle est indisponible à la lecture suivante ; sa sélection reste", async (t) => {
  const github = unGitHub(t);
  const box = await uneStation(t, "box", "linux");
  github.ajouter(box.id, { [FICHIER_SELECTION]: JSON.stringify({ brigade: "station-selection", format: 1, repositories: ["acme/shop"], updatedAt: new Date().toISOString() }) });
  await box.arreter();
  const station = listees(await lireLesStationsDuCompte({ gh: FAUX_GH })).stations[0];
  assert.equal(station?.available, false);
  assert.ok(station?.stoppedAt);
  assert.deepEqual(station?.selection, ["acme/shop"]);
});

test("un enregistrement illisible est écarté, en disant pourquoi ; aucune station, la liste dit pourquoi", async (t) => {
  const github = unGitHub(t);
  const vide = listees(await lireLesStationsDuCompte({ gh: FAUX_GH }));
  assert.deepEqual(vide.stations, []);
  assert.equal(vide.reason, "No station is registered under this GitHub account yet: install brigade's station on a machine, and sign it in to this account.");

  github.creer("casse", { [FICHIER_ENREGISTREMENT]: "{" });
  const casse = listees(await lireLesStationsDuCompte({ gh: FAUX_GH }));
  assert.deepEqual(casse.unreadable, [{ id: "casse", reason: "its registration is not JSON" }]);
  assert.equal(casse.reason, "1 station registered under this GitHub account publishes a registration brigade cannot read, so no station can be listed.");

  await uneStation(t, "box", "linux");
  const une = listees(await lireLesStationsDuCompte({ gh: FAUX_GH }));
  assert.equal(une.stations.length, 1);
  assert.equal(une.unreadable.length, 1);
  assert.equal(une.reason, undefined);
  sansMotFrancais([vide.reason ?? "", casse.reason ?? "", ...casse.unreadable.map((illisible) => illisible.reason)]);
});

test("un `gh` connecté à aucun compte demande la connexion ; un GitHub injoignable est indisponible", async (t) => {
  const github = unGitHub(t);
  github.tomber("deconnecte");
  const deconnecte = await lireLesStationsDuCompte({ gh: FAUX_GH });
  assert.equal(deconnecte.state, "sign-in-required");
  assert.ok(deconnecte.state === "sign-in-required");
  assert.equal(deconnecte.reason, "This computer is not signed in to GitHub, so brigade cannot read the stations registered under your account.");
  assert.deepEqual(deconnecte.action.command, [FAUX_GH, "auth", "login", "--hostname", "github.com", "--web", "--git-protocol", "https"]);
  sansMotFrancais([deconnecte.reason]);

  const ailleurs = unGitHub(t);
  ailleurs.tomber("panne");
  const panne = await lireLesStationsDuCompte({ gh: FAUX_GH });
  assert.equal(panne.state, "unavailable");
  assert.ok(panne.state === "unavailable");
  assert.equal(panne.cause, "network");
});

test("la commande rend l'état en une ligne JSON : code 0 quand les stations sont listées, 1 sinon", async (t) => {
  const github = unGitHub(t);
  const box = await uneStation(t, "box", "linux");
  const liste = appeler(principal, [], { ...github.env(), BRIGADE_GH_BIN: FAUX_GH });
  assert.equal(await liste.fin, 0);
  const lu = JSON.parse(liste.sortie()) as StationsDuCompte;
  assert.deepEqual(listees(lu).stations.map((station) => station.id), [box.id]);

  github.tomber("deconnecte");
  const refus = appeler(principal, [], { ...github.env(), BRIGADE_GH_BIN: FAUX_GH });
  assert.equal(await refus.fin, 1);
  assert.equal((JSON.parse(refus.sortie()) as StationsDuCompte).state, "sign-in-required");
});

test("stations-du-compte.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
