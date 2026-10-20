// Déménager la cuisine d'un projet depuis l'app (#1095) : l'app lance l'opération du runtime
// (runtime/src/demenagement/demenager.ts) et rend ce qu'elle a répondu — déménagé, ou refusé avec
// sa raison en une phrase, sans jamais échouer en silence. Où cuit chaque projet se lit dans le
// suivi de ses stations, pas dans la demande ; et un déménagement en cours, écrit par le runtime
// dans la demande (`remise`, `reprise`), survit à toute réécriture de l'app.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { documentDeDemande, FICHIER_PROJETS, FICHIER_SUIVI, lireDemande, type ProjetDemande } from "../../src/projets/demande.ts";
import { DEMENAGER, demenageurDuRuntime, lireRendu, type Demenageur } from "../../src/projets/demenagement.ts";
import { tenirProjets, type VuDesProjets } from "../../src/projets/projets.ts";
import type { Fichiers, GitHubDesStations } from "../../src/stations/github.ts";
import type { StationVue } from "../../src/stations/stations.ts";

const BOX: StationVue = { id: "gbox", nom: "parade-box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online", pannes: [], dit: "online", version: "1.4.0", projets: [], max: null };
const MAC: StationVue = { id: "gmac", nom: "macbook", machine: "macOS 25.0.0", etat: "en-ligne", ligne: "online", pannes: [], dit: "online", version: "1.4.0", projets: [], max: null };
const DEMANDE_LE = "2026-10-20T10:00:00.000Z";
const PARADE: ProjetDemande = { nom: "parade", depot: "benomite/parade", base: "main", principale: true, cooks: 2, manager: { modele: "sonnet", effort: "medium" }, reviewer: { modele: "sonnet", effort: "medium" }, ouvertLe: null, demandeLe: DEMANDE_LE };

test("le rendu du runtime : déménagé, refusé avec sa phrase, ou ce qui a manqué — jamais rien", () => {
  assert.deepEqual(lireRendu(0, '{"moved":true,"project":"parade","from":"parade-box","to":"macbook","askedAt":"…"}\n', ""), { demenage: { projet: "parade", de: "parade-box", vers: "macbook" } });
  // Vers cet ordinateur sans bac à sable : la raison du runtime, telle quelle, dit ce qui manque.
  const said = "sandbox-exec is missing on this Mac: the sandbox cannot run";
  assert.deepEqual(lireRendu(1, `${JSON.stringify({ moved: false, said })}\n`, ""), { refus: said });
  // GitHub injoignable, commande mal appelée, sortie illisible : une ligne, le détail à part.
  assert.deepEqual(lireRendu(3, "", "brigade : les stations n'ont pas pu être lues sur GitHub, rien n'est changé — HTTP 502\n"), {
    refus: "GitHub could not be read or written: nothing was changed",
    detail: "brigade : les stations n'ont pas pu être lues sur GitHub, rien n'est changé — HTTP 502",
  });
  assert.equal((lireRendu(2, "", "usage") as { refus: string }).refus, "the runtime did not understand the request: nothing was changed");
  assert.deepEqual(lireRendu(1, "Error: boom\n", ""), { refus: "the runtime gave no answer (exit code 1): nothing was changed", detail: "Error: boom" });
});

// Un faux runtime : son opération rend ce que le test lui fait dire, et note comment elle a été lancée.
function unRuntime(t: TestContext, corps: string) {
  const runtime = mkdtempSync(join(tmpdir(), "brigade-app-demenagement-"));
  t.after(() => rmSync(runtime, { recursive: true, force: true }));
  mkdirSync(join(runtime, "src", "demenagement"), { recursive: true });
  writeFileSync(join(runtime, DEMENAGER), `import { writeFileSync } from "node:fs";\nwriteFileSync("lance.json", JSON.stringify({ args: process.argv.slice(2), station: process.env.BRIGADE_STATION_DIR, cwd: process.cwd() }));\n${corps}\n`);
  const lance = () => JSON.parse(readFileSync(join(runtime, "lance.json"), "utf8")) as { args: string[]; station: string; cwd: string };
  return { runtime, lance };
}

test("l'opération part du runtime de cet ordinateur, avec le répertoire de sa station et les gists de toutes les stations", async (t) => {
  const { runtime, lance } = unRuntime(t, `process.stdout.write(JSON.stringify({ moved: true, project: "parade", from: "parade-box", to: "macbook", askedAt: "x" }) + "\\n");`);
  const demenager = demenageurDuRuntime({ node: process.execPath, runtime, racine: "/tmp/station-du-mac", env: {}, delaiMs: 60_000 });
  assert.deepEqual(await demenager("parade", "gmac", ["gbox", "gmac"]), { demenage: { projet: "parade", de: "parade-box", vers: "macbook" } });
  const { args, station } = lance();
  assert.deepEqual(args, ["parade", "gmac", "gbox"]);
  assert.equal(station, "/tmp/station-du-mac");
});

test("refusée par le runtime — pas de bac à sable sur ce Mac —, l'opération rend sa phrase", async (t) => {
  const said = "la configuration du bac à sable ne tient pas sur ce Mac — sandbox-exec is missing";
  const { runtime } = unRuntime(t, `process.stdout.write(JSON.stringify({ moved: false, said: ${JSON.stringify(said)} }) + "\\n"); process.exit(1);`);
  const demenager = demenageurDuRuntime({ node: process.execPath, runtime, racine: "/tmp/station", env: {}, delaiMs: 60_000 });
  assert.deepEqual(await demenager("parade", "gmac", ["gbox", "gmac"]), { refus: said });
});

test("un runtime qui ne se lance pas se dit aussi, en une ligne", async () => {
  const demenager = demenageurDuRuntime({ node: "/nulle/part/node", runtime: "/nulle/part", racine: "/tmp/station", env: {}, delaiMs: 60_000 });
  const rendu = await demenager("parade", "gmac", ["gbox", "gmac"]);
  assert.ok("refus" in rendu);
  assert.equal(rendu.refus, "the runtime could not be launched on this computer: nothing was changed");
  assert.match(rendu.detail ?? "", /\/nulle\/part\/node/);
});

// GitHub, en mémoire : le gist de chaque station, ses fichiers.
function unGitHub(gists: Record<string, Fichiers>): GitHubDesStations {
  return {
    lister: async () => Object.keys(gists).map((id) => ({ id, misAJour: "", appairee: true })),
    lire: async (id) => (gists[id] === undefined ? null : { ...gists[id] }),
    ecrire: async (id, fichiers) => void (gists[id] = { ...(gists[id] ?? {}), ...fichiers }),
    supprimer: async (id, fichier) => void delete gists[id]?.[fichier],
  };
}
const suivi = (station: { nom: string; locale: boolean }, projets: object[]) => `${JSON.stringify({ brigade: "projets-suivi", format: 1, a: DEMANDE_LE, station, projets })}\n`;
const unSuivi = (projet: object) => ({ nom: "parade", etat: "servi", dit: "", autoriser: [], serviLe: null, cuitSur: null, ici: false, bascule: null, ...projet });

function lesProjets(gists: Record<string, Fichiers>, options: { locale?: string | null; demenager?: Demenageur } = {}) {
  const lectures: VuDesProjets[] = [];
  const projets = tenirProjets({ github: unGitHub(gists), stations: () => [BOX, MAC], depots: async () => [], surLecture: (vu) => lectures.push(vu), ...(options.locale === undefined ? {} : { locale: () => options.locale ?? null }), ...(options.demenager === undefined ? {} : { demenager: options.demenager }) });
  return { projets, lectures };
}

test("où il cuit : la station qui le sert, telle que son suivi le dit — « ici » pour celle de cet ordinateur", async () => {
  const surLaBox = lesProjets({
    gbox: { [FICHIER_PROJETS]: documentDeDemande([PARADE]), [FICHIER_SUIVI]: suivi({ nom: "parade-box", locale: false }, [unSuivi({ cuitSur: "parade-box" })]) },
    gmac: {},
  }, { locale: "gmac" });
  const vu = await surLaBox.projets.relire();
  assert.equal(vu.locale, "gmac");
  assert.deepEqual(vu.projets[0]?.cuitSur, { id: "gbox", nom: "parade-box", ici: false });
  assert.equal(vu.projets[0]?.demenagement, null);

  const surLeMac = lesProjets({
    gbox: { [FICHIER_PROJETS]: documentDeDemande([{ ...PARADE, principale: false }]), [FICHIER_SUIVI]: suivi({ nom: "parade-box", locale: false }, [unSuivi({ etat: "secondaire", cuitSur: "macbook" })]) },
    gmac: { [FICHIER_PROJETS]: documentDeDemande([PARADE]), [FICHIER_SUIVI]: suivi({ nom: "macbook", locale: true }, [unSuivi({ cuitSur: "macbook", ici: true })]) },
  }, { locale: "gmac" });
  assert.deepEqual((await surLeMac.projets.relire()).projets[0]?.cuitSur, { id: "gmac", nom: "macbook", ici: true });
});

test("refusé par la station visée, il cuit toujours là où il cuisait : la demande nomme le Mac, le suivi la box — et la raison suit", async () => {
  const bascule = { de: "parade-box", vers: "macbook", demandeLe: DEMANDE_LE, etape: "refusee" };
  const raison = "la configuration du bac à sable ne tient pas sur ce Mac — sandbox-exec is missing";
  const { projets } = lesProjets({
    gbox: {
      [FICHIER_PROJETS]: documentDeDemande([{ ...PARADE, principale: false, remise: { vers: "macbook", gist: "gmac", demandeLe: DEMANDE_LE } }]),
      [FICHIER_SUIVI]: suivi({ nom: "parade-box", locale: false }, [unSuivi({ dit: `served by parade-box; moving to macbook is refused, so it stays here — ${raison}`, cuitSur: "parade-box", bascule })]),
    },
    gmac: {
      [FICHIER_PROJETS]: documentDeDemande([{ ...PARADE, reprise: { de: "parade-box", gist: "gbox", demandeLe: DEMANDE_LE } }]),
      [FICHIER_SUIVI]: suivi({ nom: "macbook", locale: true }, [unSuivi({ etat: "refuse", dit: raison, cuitSur: "parade-box", bascule })]),
    },
  }, { locale: "gmac" });
  const [parade] = (await projets.relire()).projets;
  assert.deepEqual(parade?.cuitSur, { id: "gbox", nom: "parade-box", ici: false });
  assert.deepEqual(parade?.demenagement, { de: "parade-box", vers: "macbook", demandeLe: DEMANDE_LE, etape: "refusee", dit: raison });
});

test("reçu par la station visée, le déménagement est fini : rien n'en reste à dire", async () => {
  const fini = (etape: string) => ({ de: "parade-box", vers: "macbook", demandeLe: DEMANDE_LE, etape });
  const { projets } = lesProjets({
    gbox: { [FICHIER_PROJETS]: documentDeDemande([{ ...PARADE, principale: false }]), [FICHIER_SUIVI]: suivi({ nom: "parade-box", locale: false }, [unSuivi({ etat: "secondaire", cuitSur: "macbook", bascule: fini("remise") })]) },
    gmac: { [FICHIER_PROJETS]: documentDeDemande([PARADE]), [FICHIER_SUIVI]: suivi({ nom: "macbook", locale: true }, [unSuivi({ cuitSur: "macbook", ici: true, bascule: fini("recue") })]) },
  });
  const [parade] = (await projets.relire()).projets;
  assert.equal(parade?.demenagement, null);
  assert.equal(parade?.cuitSur?.nom, "macbook");
});

test("déménager passe par l'opération du runtime, vers une station appairée, avec les gists de toutes ; puis les projets se relisent", async () => {
  const appels: Array<[string, string, readonly string[]]> = [];
  const { projets, lectures } = lesProjets({ gbox: { [FICHIER_PROJETS]: documentDeDemande([PARADE]) }, gmac: {} }, {
    demenager: async (projet, vers, gists) => {
      appels.push([projet, vers, gists]);
      return { refus: "sandbox-exec is missing on this Mac" };
    },
  });
  assert.deepEqual(await projets.demenager("parade", "gmac"), { refus: "sandbox-exec is missing on this Mac" });
  assert.deepEqual(appels, [["parade", "gmac", ["gbox", "gmac"]]]);
  assert.equal(lectures.length, 1, "les projets sont relus après le geste");
  // Une station qui n'est pas appairée, ou une app sans runtime : refusé, en une phrase, sans rien lancer.
  assert.deepEqual(await projets.demenager("parade", "ailleurs"), { refus: "that station is no longer paired with this app: nothing was changed" });
  assert.deepEqual(await lesProjets({}).projets.demenager("parade", "gmac"), { refus: "this app has no runtime beside it to move a kitchen: nothing was changed" });
  assert.equal(appels.length, 1);
});

test("un déménagement en cours, écrit par le runtime dans la demande, survit à toute réécriture de l'app", async () => {
  const remise = { vers: "macbook", gist: "gmac", demandeLe: DEMANDE_LE };
  const reprise = { de: "parade-box", gist: "gbox", demandeLe: DEMANDE_LE };
  const cantine = { ...PARADE, nom: "cantine", depot: "benomite/cantine" };
  assert.deepEqual(lireDemande(documentDeDemande([{ ...PARADE, principale: false, remise }]))?.[0]?.remise, remise);
  const gists: Record<string, Fichiers> = {
    gbox: { [FICHIER_PROJETS]: documentDeDemande([{ ...PARADE, principale: false, remise }, cantine]) },
    gmac: { [FICHIER_PROJETS]: documentDeDemande([{ ...PARADE, reprise }, cantine]) },
  };
  const { projets } = lesProjets(gists);
  // Retirer un autre projet réécrit les deux demandes : celle de parade y reste telle quelle.
  assert.deepEqual(await projets.retirer("cantine"), { retire: "cantine" });
  assert.deepEqual(lireDemande(gists.gbox?.[FICHIER_PROJETS]), [{ ...PARADE, principale: false, remise }]);
  assert.deepEqual(lireDemande(gists.gmac?.[FICHIER_PROJETS]), [{ ...PARADE, reprise }]);
});
