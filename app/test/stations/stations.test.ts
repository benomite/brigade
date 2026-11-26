// Les stations sur la home : appairées par le code qu'elles affichent, lues sur
// GitHub, dites en ligne ou hors ligne en une ligne. Contre une doublure de
// `gh` qui tient les gists du compte dans un répertoire : ni réseau, ni
// GitHub, ni station — c'est le seul canal, et ce test n'en ouvre aucun autre.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { empreinte, FICHIER_APPAIRAGE, FICHIER_STATION, lireDocument, type DocumentStation } from "../../src/stations/document.ts";
import { githubDesStations } from "../../src/stations/github.ts";
import { versionsDansFichier } from "../../src/stations/versions.ts";
import { ghDuRepertoire } from "../aides/gh-du-repertoire.ts";
import { repondre } from "./faux-gh-gists.ts";
import { duree, lineDe, lineDeVersion, holdStations, type VuDesStations } from "../../src/stations/stations.ts";
import { SANS_POSIX } from "../aides/posix.ts";
import { ceQueFournitCetOrdinateur } from "../../src/stations/fournit.ts";
import { DESCRIPTION_DU_PHONE, FICHIER_PHONE } from "../../src/phone-connecte.ts";

const SOURCES = join(import.meta.dirname, "../../src/stations");
const MAINTENANT = Date.parse("2026-10-15T12:00:00Z");
const CODE = "7KQ2-M9XD";

// Ce qu'une station fraîchement installée publie (runtime/src/appairage/presence.ts).
const published = (champs: Partial<DocumentStation> = {}) => ({
  brigade: "station",
  format: 1,
  nom: "box",
  machine: "Linux 6.1.0",
  version: "1.4.0",
  projets: [],
  signeDeVie: new Date(MAINTENANT - 10_000).toISOString(),
  cadenceMs: 60_000,
  arreteeLe: null,
  appairage: { empreinte: empreinte(CODE), expireLe: new Date(MAINTENANT + 10 * 60_000).toISOString() },
  echus: [],
  ...champs,
});

// GitHub : les gists du compte, dans un répertoire que la doublure lit et écrit.
function unGitHub(t: TestContext) {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-app-gists-"));
  writeFileSync(join(repertoire, "appels"), "");
  const gh = ghDuRepertoire(repertoire, repondre);
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const fichier = (id: string) => join(repertoire, `${id}.gist.json`);
  const gist = (id: string) => JSON.parse(readFileSync(fichier(id), "utf8")) as { files: Record<string, { filename: string; content: string }> };
  // Ce que la station écrit dans son gist.
  const station = (id: string, document: object) => {
    const avant = existsSync(fichier(id)) ? gist(id).files : {};
    writeFileSync(fichier(id), JSON.stringify({ id, description: "brigade — station", public: false, updated_at: new Date().toISOString() + Math.random(), files: { ...avant, [FICHIER_STATION]: { filename: FICHIER_STATION, content: JSON.stringify(document) } } }));
  };
  const calls = () => readFileSync(join(repertoire, "appels"), "utf8").split("\n").filter(Boolean);
  return { repertoire, gh, station, gist, appels: calls, panne: (oui: boolean) => (oui ? writeFileSync(join(repertoire, "panne"), "") : rmSync(join(repertoire, "panne"), { force: true })) };
}

function desStations(t: TestContext, github: { gh: string }, maintenant = () => MAINTENANT) {
  const lectures: VuDesStations[] = [];
  const stations = holdStations({ github: githubDesStations({ gh: github.gh, delaiMs: 30_000 }), surLecture: (vu) => lectures.push(vu), cadenceMs: 3_600_000, maintenant });
  t.after(() => stations.fermer());
  return { stations, lectures };
}

test("une station en ligne : « online · version X · no project » ; ses projets, quand elle en sert", () => {
  const document = { ...published(), appairage: null } as DocumentStation;
  assert.deepEqual(lineDe(document, MAINTENANT), { etat: "en-ligne", ligne: "online · version 1.4.0 · no project" });
  assert.equal(lineDe({ ...document, projets: ["brigade"] }, MAINTENANT).ligne, "online · version 1.4.0 · 1 project: brigade");
  assert.equal(lineDe({ ...document, projets: ["brigade", "espace"] }, MAINTENANT).ligne, "online · version 1.4.0 · 2 projects: brigade, espace");
});

test("éteinte d'un coup, elle passe hors ligne dès qu'elle a manqué deux signes de vie, et dit depuis combien de temps", () => {
  const document = { ...published(), appairage: null } as DocumentStation;
  const signe = Date.parse(document.signeDeVie);
  assert.equal(lineDe(document, signe + 2 * 60_000).etat, "en-ligne");
  assert.deepEqual(lineDe(document, signe + 2 * 60_000 + 31_000), { etat: "hors-ligne", ligne: "offline for 2 min · version 1.4.0 · no project" });
  assert.equal(lineDe(document, signe + 3 * 3_600_000 + 5 * 60_000).ligne, "offline for 3 h 05 · version 1.4.0 · no project");
});

test("arrêtée proprement, elle est hors ligne tout de suite ; redémarrée, de nouveau en ligne", () => {
  const arretee = { ...published({ arreteeLe: new Date(MAINTENANT - 10_000).toISOString() }), appairage: null } as DocumentStation;
  assert.deepEqual(lineDe(arretee, MAINTENANT), { etat: "hors-ligne", ligne: "offline for less than a minute · version 1.4.0 · no project" });
  // Un signe de vie postérieur à l'arrêt : elle est repartie.
  assert.equal(lineDe({ ...arretee, signeDeVie: new Date(MAINTENANT).toISOString(), arreteeLe: null }, MAINTENANT).etat, "en-ligne");
});

test("les cœurs que la station publie se lisent ; absents ou mal formés, l'app n'en dit rien", () => {
  const lu = (coeurs: unknown) => {
    const document = lireDocument(JSON.stringify({ ...published(), coeurs }));
    return "illisible" in document ? assert.fail(document.illisible) : document.coeurs;
  };
  assert.equal(lu(8), 8);
  for (const mal of [undefined, 0, -2, 2.5, "8", null]) assert.equal(lu(mal), undefined, String(mal));
});

test("un téléphone publie `cuisine: false` ; une station qui n'en dit rien, ou dit autre chose, cuisine", () => {
  const lu = (kitchen: unknown) => {
    const document = lireDocument(JSON.stringify({ ...published(), cuisine: kitchen }));
    return "illisible" in document ? assert.fail(document.illisible) : document.cuisine;
  };
  assert.equal(lu(false), false);
  for (const autre of [undefined, true, null, "non", 0]) assert.equal(lu(autre), undefined, String(autre));
});

test("les durées se disent à la minute", () => {
  assert.equal(duree(59_000), "less than a minute");
  assert.equal(duree(4 * 60_000 + 59_000), "4 min");
  assert.equal(duree(2 * 3_600_000), "2 h");
  assert.equal(duree(3 * 86_400_000), "3 days");
});

describe("les stations lues sur un GitHub de test", { concurrency: 7 }, () => {
  // #4408 : l'app relisait toutes les 30 s chaque gist de station, morte ou vive, et la liste : ~1 100 appels comptés par heure.
  test("a gist and the list read again unchanged are conditional reads (304, not counted); a change is read in full (#4408)", { skip: SANS_POSIX }, async (t) => {
    const github = unGitHub(t);
    const lus = githubDesStations({ gh: github.gh, delaiMs: 30_000 });
    github.station("box", published());
    assert.equal((await lus.lister()).length, 1);
    assert.ok((await lus.lire("box"))?.[FICHIER_STATION]);
    const avant = github.appels().length;
    assert.equal((await lus.lister()).length, 1);
    assert.ok((await lus.lire("box"))?.[FICHIER_STATION]);
    const relus = github.appels().slice(avant);
    assert.equal(relus.length, 2);
    assert.ok(relus.every((call) => call.includes("If-None-Match: ")), `every read again is conditional: ${relus.join(" | ")}`);
    github.station("box", published({ nom: "box-2" }));
    const relu = lireDocument((await lus.lire("box"))?.[FICHIER_STATION] ?? "");
    assert.equal(relu !== undefined && "nom" in relu ? relu.nom : null, "box-2");
  });

  // La trace du téléphone connecté (#3303, phone-connecte.ts), lue par le `gh` du poste.
  test("un gist qui porte la trace du téléphone : connecté ; aucun : non ; un `gh` en panne : lève", { skip: SANS_POSIX }, async (t) => {
    const github = unGitHub(t);
    const lus = githubDesStations({ gh: github.gh, delaiMs: 30_000 });
    github.station("box", published());
    assert.equal(await lus.telephone?.(), false);
    writeFileSync(join(github.repertoire, "t.gist.json"), JSON.stringify({ id: "t", description: DESCRIPTION_DU_PHONE, public: false, updated_at: new Date().toISOString(), files: { [FICHIER_PHONE]: { filename: FICHIER_PHONE, content: "{}" } } }));
    assert.equal(await lus.telephone?.(), true);
    github.panne(true);
    await assert.rejects(lus.telephone?.() ?? Promise.resolve());
  });
  test("le code tapé appaire la station : elle apparaît sur la home, « online · version X · no project »", { skip: SANS_POSIX }, async (t) => {
    const github = unGitHub(t);
    github.station("box1", published());
    // Un autre gist du compte, qui n'est pas une station : ignoré.
    writeFileSync(join(github.repertoire, "notes.gist.json"), JSON.stringify({ id: "notes", description: "", public: false, updated_at: "", files: { "a.md": { filename: "a.md", content: "rien" } } }));
    const { stations, lectures } = desStations(t, github);
    // Pas encore appairée : la home ne la montre pas.
    assert.deepEqual((await stations.relire()).stations, []);

    // Le chef tape le code comme il le lit, en minuscules et sans tiret.
    assert.deepEqual(await stations.appairer(" 7kq2 m9xd "), { appairee: "box" });
    const ecrit = JSON.parse(github.gist("box1").files[FICHIER_APPAIRAGE]?.content ?? "null") as { appaireeLe: string; empreinte: string };
    assert.equal(ecrit.empreinte, empreinte(CODE));
    assert.equal(ecrit.appaireeLe, new Date(MAINTENANT).toISOString());
    assert.deepEqual(stations.vu()?.stations, [{ id: "box1", nom: "box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [], dit: "online", version: "1.4.0", projets: [], max: null, maxDepuis: null, versionDit: "up to date" }]);
    assert.deepEqual(lectures.at(-1), stations.vu());
  });

  test("un code erroné, mal formé ou expiré est refusé en une ligne, et rien n'est écrit sur GitHub", { skip: SANS_POSIX }, async (t) => {
    const github = unGitHub(t);
    github.station("box1", published({ appairage: { empreinte: empreinte(CODE), expireLe: new Date(MAINTENANT - 1).toISOString() }, echus: [empreinte("AAAA-BBBB")] }));
    const { stations } = desStations(t, github);
    const refusal = [await stations.appairer("ZZZZ-ZZZZ"), await stations.appairer("12-34"), await stations.appairer(CODE), await stations.appairer("aaaa-bbbb"), await stations.appairer(undefined)];
    for (const rendu of refusal) {
      assert.ok("refus" in rendu, JSON.stringify(rendu));
      assert.doesNotMatch(rendu.refus, /\n/);
    }
    assert.match(JSON.stringify(refusal[0]), /no station shows this code/);
    assert.match(JSON.stringify(refusal[1]), /is not a pairing code/);
    assert.match(JSON.stringify(refusal[2]), /this code has expired: station box shows a new one/);
    assert.match(JSON.stringify(refusal[3]), /this code has expired/);
    assert.match(JSON.stringify(refusal[4]), /is not a pairing code/);
    assert.equal(github.gist("box1").files[FICHIER_APPAIRAGE], undefined);
    assert.ok(!github.appels().some((call) => call.includes("PATCH")), github.appels().join("\n"));
    assert.deepEqual((await stations.relire()).stations, []);
  });

  test("la station éteinte passe hors ligne sans quitter la liste ; GitHub muet, la liste reste et le dit", { skip: SANS_POSIX }, async (t) => {
    const github = unGitHub(t);
    let instant = MAINTENANT;
    github.station("box1", published());
    const { stations } = desStations(t, github, () => instant);
    assert.ok("appairee" in (await stations.appairer(CODE)));

    // Plus aucun signe de vie depuis trois minutes.
    instant += 3 * 60_000;
    assert.deepEqual(
      (await stations.relire()).stations.map(({ etat: state, ligne: line }) => ({ etat: state, ligne: line })),
      [{ etat: "hors-ligne", ligne: "offline for 3 min · version 1.4.0 · no project" }],
    );
    // Elle revient, appairée : elle ne publie plus de code.
    github.station("box1", { ...published({ signeDeVie: new Date(instant).toISOString(), projets: ["brigade"] }), appairage: null });
    assert.equal((await stations.relire()).stations[0]?.ligne, "online · version 1.4.0 · 1 project: brigade");

    github.panne(true);
    instant += 10 * 60_000;
    const relue = await stations.relire();
    assert.match(relue.sans ?? "", /^your stations could not be read on GitHub — error connecting to api\.github\.com$/);
    assert.deepEqual(relue.stations.map(({ nom: name, etat: state, ligne: line }) => ({ nom: name, etat: state, ligne: line })), [{ nom: "box", etat: "hors-ligne", ligne: "offline for 10 min · version 1.4.0 · 1 project: brigade" }]);
    github.panne(false);
    assert.equal((await stations.relire()).sans, undefined);
  });

  test("GitHub qui limite les appels du compte : la lecture le dit, avec l'heure où il les rend, lue sans en dépenser un", { skip: SANS_POSIX }, async (t) => {
    const github = unGitHub(t);
    github.station("box1", published({ connexionMax: { etat: "connectee", depuis: null } }));
    const { stations } = desStations(t, github);
    assert.ok("appairee" in (await stations.appairer(CODE)));
    assert.deepEqual(
      (await stations.relire()).stations.map(({ dit, version, projets: projects, max }) => ({ dit, version, projets: projects, max })),
      [{ dit: "online", version: "1.4.0", projets: [], max: "connectee" }],
    );

    const resumption = Date.parse("2026-10-15T15:16:00Z");
    writeFileSync(join(github.repertoire, "limite"), String(resumption / 1000));
    const limitee = await stations.relire();
    assert.match(limitee.sans ?? "", /rate limit exceeded/);
    assert.deepEqual(limitee.limite, { reprise: new Date(resumption).toISOString() });
    assert.equal(limitee.stations.length, 1, "la liste d'avant reste");

    rmSync(join(github.repertoire, "limite"));
    const rendue = await stations.relire();
    assert.equal(rendue.sans, undefined);
    assert.equal(rendue.limite, undefined);
  });

  test("l'app ne joint jamais une station : tout passe par `gh api` sur les gists du compte", { skip: SANS_POSIX }, async (t) => {
    const github = unGitHub(t);
    github.station("box1", published());
    const { stations } = desStations(t, github);
    await stations.appairer(CODE);
    await stations.relire();
    assert.ok(github.appels().length > 0);
    for (const call of github.appels()) assert.match(call, /^api (-X PATCH |-i (-H If-None-Match: \S+ )?)?\/gists(\/[a-z0-9]+|\?per_page=100&page=\d+)( --input -)?$/);
    for (const name of readdirSync(SOURCES)) {
      const source = readFileSync(join(SOURCES, name), "utf8");
      for (const interdit of [/node:(net|http|https|dgram|tls)\b/, /\bfetch\(/, /\bWebSocket\b/]) assert.doesNotMatch(source, interdit, `${name} : ${interdit}`);
    }
  });
});

test("la ligne de mise à jour : « up to date · on this version for 3 days » ; une mise à jour ratée n'y est pas répétée, une station hors ligne n'est dite à jour de rien", () => {
  const depuis = new Date(MAINTENANT - 3 * 24 * 3_600_000).toISOString();
  const document = { ...published(), appairage: null, miseAJour: null, connexionMax: null } as DocumentStation;
  assert.equal(lineDeVersion(document, MAINTENANT, depuis), "up to date · on this version for 3 days");
  assert.equal(lineDeVersion(document, MAINTENANT), "up to date", "sans date publiée, elle ne dit pas depuis quand");
  const ratee = { ...document, miseAJour: { visee: "1.5.0", restauree: "1.4.0", le: new Date(MAINTENANT).toISOString(), retourRate: false } };
  const dite = lineDeVersion(ratee, MAINTENANT, depuis);
  assert.equal(dite, "on this version for 3 days");
  assert.doesNotMatch(dite, /1\.5\.0|failed|up to date/, "la panne est déjà dite par son propre ticket");
  assert.equal(lineDeVersion(ratee, MAINTENANT), "");
  assert.equal(lineDeVersion(document, MAINTENANT + 3_600_000, depuis), "", "hors ligne");
});

describe("les stations retirées, et leur version lue d'un lancement à l'autre", { concurrency: 7 }, () => {
  test("retirer la station : son appairage quitte son gist, elle n'est plus listée ni lue — et se laisse appairer de nouveau", { skip: SANS_POSIX }, async (t) => {
    const github = unGitHub(t);
    github.station("box1", published());
    github.station("box2", published({ nom: "mac", appairage: { empreinte: empreinte("ABCD-EFGH"), expireLe: new Date(MAINTENANT + 10 * 60_000).toISOString() } }));
    const { stations } = desStations(t, github);
    assert.ok("appairee" in (await stations.appairer(CODE)));
    assert.ok("appairee" in (await stations.appairer("ABCD-EFGH")));
    assert.deepEqual((await stations.relire()).stations.map(({ nom: name }) => name), ["box", "mac"]);

    assert.deepEqual(await stations.retirer("inconnue"), { refus: "this station is no longer paired with this app" });
    assert.deepEqual(await stations.retirer("box1"), { retiree: "box" });
    assert.deepEqual(stations.vu()?.stations.map(({ nom: name }) => name), ["mac"]);
    assert.deepEqual(Object.keys(github.gist("box1").files), [FICHIER_STATION], "seul l'appairage est ôté, l'état de la station reste");
    assert.deepEqual(Object.keys(github.gist("box2").files).sort(), [FICHIER_APPAIRAGE, FICHIER_STATION]);
    assert.deepEqual((await stations.relire()).stations.map(({ nom: name }) => name), ["mac"], "relue, elle n'est toujours pas là");
  });

  test("l'appairage d'une station de Mac dit qu'elle fournit `macos`, et ce que l'installation y a détecté (#1757)", { skip: SANS_POSIX }, async (t) => {
    const github = unGitHub(t);
    github.station("mac1", published({ nom: "macbook-air-de-benoit", machine: "macOS 15.1" }));
    const { stations } = desStations(t, github);
    const detectees = [
      { capacite: "navigateur-headless", nom: "a browser", detectee: true },
      { capacite: "android", nom: "the Android SDK", detectee: false },
    ];
    assert.ok("appairee" in (await stations.appairer(CODE, ceQueFournitCetOrdinateur("darwin", detectees))));
    const ecrit = JSON.parse(github.gist("mac1").files[FICHIER_APPAIRAGE]?.content ?? "null") as { empreinte: string; fournit: string[] };
    assert.equal(ecrit.empreinte, empreinte(CODE));
    assert.deepEqual(ecrit.fournit, ["macos", "navigateur-headless"]);
    assert.deepEqual(stations.vu()?.stations[0]?.fournit, ["macos", "navigateur-headless"]);
    // Une autre machine ne fournit que ce qu'on y détecte ; rien de détecté, l'appairage n'en dit rien.
    assert.deepEqual(ceQueFournitCetOrdinateur("linux", detectees), ["navigateur-headless"]);
    assert.deepEqual(ceQueFournitCetOrdinateur("win32", []), []);
  });

  test("une station appairée avant que l'app n'écrive ce qu'elle fournit : son appairage le prend, une fois, l'empreinte gardée (#1757)", { skip: SANS_POSIX }, async (t) => {
    const github = unGitHub(t);
    github.station("mac1", published({ nom: "macbook" }));
    const { stations } = desStations(t, github);
    assert.ok("appairee" in (await stations.appairer(CODE)));
    const avant = JSON.parse(github.gist("mac1").files[FICHIER_APPAIRAGE]?.content ?? "null") as Record<string, unknown>;
    assert.equal("fournit" in avant, false);
    assert.equal(stations.vu()?.stations[0]?.fournit, undefined);
    assert.equal(await stations.tenirCeQuElleFournit("mac1", ["macos"]), true);
    assert.deepEqual(JSON.parse(github.gist("mac1").files[FICHIER_APPAIRAGE]?.content ?? "null"), { ...avant, fournit: ["macos"] });
    assert.deepEqual(stations.vu()?.stations[0]?.fournit, ["macos"]);
    assert.equal(await stations.tenirCeQuElleFournit("mac1", ["macos"]), false, "déjà dit : rien n'est réécrit");
    assert.equal(await stations.tenirCeQuElleFournit("inconnue", ["macos"]), false);
  });

  test("retirer la station, GitHub injoignable : rien n'est retiré, le refus tient en une ligne et son détail à part", { skip: SANS_POSIX }, async (t) => {
    const github = unGitHub(t);
    github.station("box1", published());
    const { stations } = desStations(t, github);
    assert.ok("appairee" in (await stations.appairer(CODE)));
    github.panne(true);
    const rendu = await stations.retirer("box1");
    assert.ok("refus" in rendu);
    assert.equal(rendu.refus, "box was not removed: GitHub could not be written");
    assert.match(rendu.detail ?? "", /api\.github\.com/);
    github.panne(false);
    assert.deepEqual((await stations.relire()).stations.map(({ nom: name }) => name), ["box"]);
  });

  test("depuis quand la station est sur sa version : l'app le déduit du changement qu'elle voit, et le garde d'un lancement à l'autre", { skip: SANS_POSIX }, async (t) => {
    const github = unGitHub(t);
    github.station("box1", published());
    const dossier = mkdtempSync(join(tmpdir(), "brigade-app-versions-"));
    t.after(() => rmSync(dossier, { recursive: true, force: true }));
    const chemin = join(dossier, "versions-vues.json");
    let instant = MAINTENANT;
    const ouvrir = () => {
      const stations = holdStations({ github: githubDesStations({ gh: github.gh, delaiMs: 30_000 }), surLecture: () => {}, cadenceMs: 3_600_000, maintenant: () => instant, versions: versionsDansFichier(chemin) });
      t.after(() => stations.fermer());
      return stations;
    };
    const en = (document: object) => github.station("box1", { ...(document as object), appairage: null, signeDeVie: new Date(instant - 5_000).toISOString() });

    const first = ouvrir();
    assert.ok("appairee" in (await first.appairer(CODE)));
    en(published());
    assert.equal((await first.relire()).stations[0]?.versionDit, "up to date", "à sa première lecture, l'app ne sait pas depuis quand : rien d'inventé");

    instant += 2 * 24 * 3_600_000;
    en(published({ version: "1.5.0" }));
    assert.equal((await first.relire()).stations[0]?.versionDit, "up to date · on this version for less than a minute", "elle a vu la version changer");

    instant += 3 * 24 * 3_600_000;
    en(published({ version: "1.5.0" }));
    const relancee = ouvrir();
    assert.equal((await relancee.relire()).stations[0]?.versionDit, "up to date · on this version for 3 days", "relancée, elle se souvient");
    assert.deepEqual(JSON.parse(readFileSync(chemin, "utf8")).box1, { version: "1.5.0", depuisLe: new Date(MAINTENANT + 2 * 24 * 3_600_000).toISOString() });
  });
});
