// Les stations sur la home : appairées par le code qu'elles affichent, lues sur
// GitHub, dites en ligne ou hors ligne en une ligne. Contre une doublure de
// `gh` qui tient les gists du compte dans un répertoire : ni réseau, ni
// GitHub, ni station — c'est le seul canal, et ce test n'en ouvre aucun autre.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { fingerprint, FILE_PAIRING, FILE_STATION, readDocument, type DocumentStation } from "../../src/stations/document.ts";
import { githubOfStations } from "../../src/stations/github.ts";
import { versionsInFile } from "../../src/stations/versions.ts";
import { ghOfDirectory } from "../helpers/gh-of-directory.ts";
import { reply } from "./fake-gh-gists.ts";
import { duration, lineOf, lineOfVersion, holdStations, type SeenOfStations } from "../../src/stations/stations.ts";
import { WITHOUT_POSIX } from "../helpers/posix.ts";
import { whatProvidesThisComputer } from "../../src/stations/provides.ts";
import { DESCRIPTION_OF_PHONE, FILE_PHONE } from "../../src/phone-connected.ts";

const SOURCES = join(import.meta.dirname, "../../src/stations");
const NOW = Date.parse("2026-10-15T12:00:00Z");
const CODE = "7KQ2-M9XD";

// Ce qu'une station fraîchement installée publie (runtime/src/appairage/presence.ts).
const published = (fields: Partial<DocumentStation> = {}) => ({
  brigade: "station",
  format: 1,
  nom: "box",
  machine: "Linux 6.1.0",
  version: "1.4.0",
  projets: [],
  signeDeVie: new Date(NOW - 10_000).toISOString(),
  cadenceMs: 60_000,
  arreteeLe: null,
  appairage: { empreinte: fingerprint(CODE), expireLe: new Date(NOW + 10 * 60_000).toISOString() },
  echus: [],
  ...fields,
});

// GitHub : les gists du compte, dans un répertoire que la doublure lit et écrit.
function oneGitHub(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "brigade-app-gists-"));
  writeFileSync(join(directory, "appels"), "");
  const gh = ghOfDirectory(directory, reply);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = (id: string) => join(directory, `${id}.gist.json`);
  const gist = (id: string) => JSON.parse(readFileSync(file(id), "utf8")) as { files: Record<string, { filename: string; content: string }> };
  // Ce que la station écrit dans son gist.
  const station = (id: string, document: object) => {
    const before = existsSync(file(id)) ? gist(id).files : {};
    writeFileSync(file(id), JSON.stringify({ id, description: "brigade — station", public: false, updated_at: new Date().toISOString() + Math.random(), files: { ...before, [FILE_STATION]: { filename: FILE_STATION, content: JSON.stringify(document) } } }));
  };
  const calls = () => readFileSync(join(directory, "appels"), "utf8").split("\n").filter(Boolean);
  return { repertoire: directory, gh, station, gist, appels: calls, panne: (yes: boolean) => (yes ? writeFileSync(join(directory, "panne"), "") : rmSync(join(directory, "panne"), { force: true })) };
}

function ofStations(t: TestContext, github: { gh: string }, now = () => NOW) {
  const readings: SeenOfStations[] = [];
  const stations = holdStations({ github: githubOfStations({ gh: github.gh, delaiMs: 30_000 }), surLecture: (seenOne) => readings.push(seenOne), cadenceMs: 3_600_000, maintenant: now });
  t.after(() => stations.fermer());
  return { stations, lectures: readings };
}

test("une station en ligne : « online · version X · no project » ; ses projets, quand elle en sert", () => {
  const document = { ...published(), appairage: null } as DocumentStation;
  assert.deepEqual(lineOf(document, NOW), { etat: "en-ligne", ligne: "online · version 1.4.0 · no project" });
  assert.equal(lineOf({ ...document, projets: ["brigade"] }, NOW).ligne, "online · version 1.4.0 · 1 project: brigade");
  assert.equal(lineOf({ ...document, projets: ["brigade", "espace"] }, NOW).ligne, "online · version 1.4.0 · 2 projects: brigade, espace");
});

test("éteinte d'un coup, elle passe hors ligne dès qu'elle a manqué deux signes de vie, et dit depuis combien de temps", () => {
  const document = { ...published(), appairage: null } as DocumentStation;
  const sign = Date.parse(document.signeDeVie);
  assert.equal(lineOf(document, sign + 2 * 60_000).etat, "en-ligne");
  assert.deepEqual(lineOf(document, sign + 2 * 60_000 + 31_000), { etat: "hors-ligne", ligne: "offline for 2 min · version 1.4.0 · no project" });
  assert.equal(lineOf(document, sign + 3 * 3_600_000 + 5 * 60_000).ligne, "offline for 3 h 05 · version 1.4.0 · no project");
});

test("arrêtée proprement, elle est hors ligne tout de suite ; redémarrée, de nouveau en ligne", () => {
  const stopped = { ...published({ arreteeLe: new Date(NOW - 10_000).toISOString() }), appairage: null } as DocumentStation;
  assert.deepEqual(lineOf(stopped, NOW), { etat: "hors-ligne", ligne: "offline for less than a minute · version 1.4.0 · no project" });
  // Un signe de vie postérieur à l'arrêt : elle est repartie.
  assert.equal(lineOf({ ...stopped, signeDeVie: new Date(NOW).toISOString(), arreteeLe: null }, NOW).etat, "en-ligne");
});

test("les cœurs que la station publie se lisent ; absents ou mal formés, l'app n'en dit rien", () => {
  const readOne = (cores: unknown) => {
    const document = readDocument(JSON.stringify({ ...published(), coeurs: cores }));
    return "illisible" in document ? assert.fail(document.illisible) : document.coeurs;
  };
  assert.equal(readOne(8), 8);
  for (const badly of [undefined, 0, -2, 2.5, "8", null]) assert.equal(readOne(badly), undefined, String(badly));
});

test("un téléphone publie `cuisine: false` ; une station qui n'en dit rien, ou dit autre chose, cuisine", () => {
  const readOne = (kitchen: unknown) => {
    const document = readDocument(JSON.stringify({ ...published(), cuisine: kitchen }));
    return "illisible" in document ? assert.fail(document.illisible) : document.cuisine;
  };
  assert.equal(readOne(false), false);
  for (const other of [undefined, true, null, "non", 0]) assert.equal(readOne(other), undefined, String(other));
});

test("les durées se disent à la minute", () => {
  assert.equal(duration(59_000), "less than a minute");
  assert.equal(duration(4 * 60_000 + 59_000), "4 min");
  assert.equal(duration(2 * 3_600_000), "2 h");
  assert.equal(duration(3 * 86_400_000), "3 days");
});

describe("les stations lues sur un GitHub de test", { concurrency: 7 }, () => {
  // #4408 : l'app relisait toutes les 30 s chaque gist de station, morte ou vive, et la liste : ~1 100 appels comptés par heure.
  test("a gist and the list read again unchanged are conditional reads (304, not counted); a change is read in full (#4408)", { skip: WITHOUT_POSIX }, async (t) => {
    const github = oneGitHub(t);
    const readOnes = githubOfStations({ gh: github.gh, delaiMs: 30_000 });
    github.station("box", published());
    assert.equal((await readOnes.lister()).length, 1);
    assert.ok((await readOnes.lire("box"))?.[FILE_STATION]);
    const before = github.appels().length;
    assert.equal((await readOnes.lister()).length, 1);
    assert.ok((await readOnes.lire("box"))?.[FILE_STATION]);
    const rereadOnes = github.appels().slice(before);
    assert.equal(rereadOnes.length, 2);
    assert.ok(rereadOnes.every((call) => call.includes("If-None-Match: ")), `every read again is conditional: ${rereadOnes.join(" | ")}`);
    github.station("box", published({ nom: "box-2" }));
    const reread = readDocument((await readOnes.lire("box"))?.[FILE_STATION] ?? "");
    assert.equal(reread !== undefined && "nom" in reread ? reread.nom : null, "box-2");
  });

  // La trace du téléphone connecté (#3303, phone-connected.ts), lue par le `gh` du poste.
  test("un gist qui porte la trace du téléphone : connecté ; aucun : non ; un `gh` en panne : lève", { skip: WITHOUT_POSIX }, async (t) => {
    const github = oneGitHub(t);
    const readOnes = githubOfStations({ gh: github.gh, delaiMs: 30_000 });
    github.station("box", published());
    assert.equal(await readOnes.telephone?.(), false);
    writeFileSync(join(github.repertoire, "t.gist.json"), JSON.stringify({ id: "t", description: DESCRIPTION_OF_PHONE, public: false, updated_at: new Date().toISOString(), files: { [FILE_PHONE]: { filename: FILE_PHONE, content: "{}" } } }));
    assert.equal(await readOnes.telephone?.(), true);
    github.panne(true);
    await assert.rejects(readOnes.telephone?.() ?? Promise.resolve());
  });
  test("le code tapé appaire la station : elle apparaît sur la home, « online · version X · no project »", { skip: WITHOUT_POSIX }, async (t) => {
    const github = oneGitHub(t);
    github.station("box1", published());
    // Un autre gist du compte, qui n'est pas une station : ignoré.
    writeFileSync(join(github.repertoire, "notes.gist.json"), JSON.stringify({ id: "notes", description: "", public: false, updated_at: "", files: { "a.md": { filename: "a.md", content: "rien" } } }));
    const { stations, lectures: readings } = ofStations(t, github);
    // Pas encore appairée : la home ne la montre pas.
    assert.deepEqual((await stations.relire()).stations, []);

    // Le chef tape le code comme il le lit, en minuscules et sans tiret.
    assert.deepEqual(await stations.appairer(" 7kq2 m9xd "), { appairee: "box" });
    const written = JSON.parse(github.gist("box1").files[FILE_PAIRING]?.content ?? "null") as { appaireeLe: string; empreinte: string };
    assert.equal(written.empreinte, fingerprint(CODE));
    assert.equal(written.appaireeLe, new Date(NOW).toISOString());
    assert.deepEqual(stations.vu()?.stations, [{ id: "box1", nom: "box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [], dit: "online", version: "1.4.0", projets: [], max: null, maxDepuis: null, versionDit: "up to date" }]);
    assert.deepEqual(readings.at(-1), stations.vu());
  });

  test("un code erroné, mal formé ou expiré est refusé en une ligne, et rien n'est écrit sur GitHub", { skip: WITHOUT_POSIX }, async (t) => {
    const github = oneGitHub(t);
    github.station("box1", published({ appairage: { empreinte: fingerprint(CODE), expireLe: new Date(NOW - 1).toISOString() }, echus: [fingerprint("AAAA-BBBB")] }));
    const { stations } = ofStations(t, github);
    const refusal = [await stations.appairer("ZZZZ-ZZZZ"), await stations.appairer("12-34"), await stations.appairer(CODE), await stations.appairer("aaaa-bbbb"), await stations.appairer(undefined)];
    for (const rendered of refusal) {
      assert.ok("refus" in rendered, JSON.stringify(rendered));
      assert.doesNotMatch(rendered.refus, /\n/);
    }
    assert.match(JSON.stringify(refusal[0]), /no station shows this code/);
    assert.match(JSON.stringify(refusal[1]), /is not a pairing code/);
    assert.match(JSON.stringify(refusal[2]), /this code has expired: station box shows a new one/);
    assert.match(JSON.stringify(refusal[3]), /this code has expired/);
    assert.match(JSON.stringify(refusal[4]), /is not a pairing code/);
    assert.equal(github.gist("box1").files[FILE_PAIRING], undefined);
    assert.ok(!github.appels().some((call) => call.includes("PATCH")), github.appels().join("\n"));
    assert.deepEqual((await stations.relire()).stations, []);
  });

  test("la station éteinte passe hors ligne sans quitter la liste ; GitHub muet, la liste reste et le dit", { skip: WITHOUT_POSIX }, async (t) => {
    const github = oneGitHub(t);
    let instant = NOW;
    github.station("box1", published());
    const { stations } = ofStations(t, github, () => instant);
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
    const rereadOne = await stations.relire();
    assert.match(rereadOne.sans ?? "", /^your stations could not be read on GitHub — error connecting to api\.github\.com$/);
    assert.deepEqual(rereadOne.stations.map(({ nom: name, etat: state, ligne: line }) => ({ nom: name, etat: state, ligne: line })), [{ nom: "box", etat: "hors-ligne", ligne: "offline for 10 min · version 1.4.0 · 1 project: brigade" }]);
    github.panne(false);
    assert.equal((await stations.relire()).sans, undefined);
  });

  test("GitHub qui limite les appels du compte : la lecture le dit, avec l'heure où il les rend, lue sans en dépenser un", { skip: WITHOUT_POSIX }, async (t) => {
    const github = oneGitHub(t);
    github.station("box1", published({ connexionMax: { etat: "connectee", depuis: null } }));
    const { stations } = ofStations(t, github);
    assert.ok("appairee" in (await stations.appairer(CODE)));
    assert.deepEqual(
      (await stations.relire()).stations.map(({ dit: said, version, projets: projects, max }) => ({ dit: said, version, projets: projects, max })),
      [{ dit: "online", version: "1.4.0", projets: [], max: "connectee" }],
    );

    const resumption = Date.parse("2026-10-15T15:16:00Z");
    writeFileSync(join(github.repertoire, "limite"), String(resumption / 1000));
    const limited = await stations.relire();
    assert.match(limited.sans ?? "", /rate limit exceeded/);
    assert.deepEqual(limited.limite, { reprise: new Date(resumption).toISOString() });
    assert.equal(limited.stations.length, 1, "la liste d'avant reste");

    rmSync(join(github.repertoire, "limite"));
    const renderedOne = await stations.relire();
    assert.equal(renderedOne.sans, undefined);
    assert.equal(renderedOne.limite, undefined);
  });

  test("l'app ne joint jamais une station : tout passe par `gh api` sur les gists du compte", { skip: WITHOUT_POSIX }, async (t) => {
    const github = oneGitHub(t);
    github.station("box1", published());
    const { stations } = ofStations(t, github);
    await stations.appairer(CODE);
    await stations.relire();
    assert.ok(github.appels().length > 0);
    for (const call of github.appels()) assert.match(call, /^api (-X PATCH |-i (-H If-None-Match: \S+ )?)?\/gists(\/[a-z0-9]+|\?per_page=100&page=\d+)( --input -)?$/);
    for (const name of readdirSync(SOURCES)) {
      const source = readFileSync(join(SOURCES, name), "utf8");
      for (const forbidden of [/node:(net|http|https|dgram|tls)\b/, /\bfetch\(/, /\bWebSocket\b/]) assert.doesNotMatch(source, forbidden, `${name} : ${forbidden}`);
    }
  });
});

test("la ligne de mise à jour : « up to date · on this version for 3 days » ; une mise à jour ratée n'y est pas répétée, une station hors ligne n'est dite à jour de rien", () => {
  const since = new Date(NOW - 3 * 24 * 3_600_000).toISOString();
  const document = { ...published(), appairage: null, miseAJour: null, connexionMax: null } as DocumentStation;
  assert.equal(lineOfVersion(document, NOW, since), "up to date · on this version for 3 days");
  assert.equal(lineOfVersion(document, NOW), "up to date", "sans date publiée, elle ne dit pas depuis quand");
  const missed = { ...document, miseAJour: { visee: "1.5.0", restauree: "1.4.0", le: new Date(NOW).toISOString(), retourRate: false } };
  const saidOne = lineOfVersion(missed, NOW, since);
  assert.equal(saidOne, "on this version for 3 days");
  assert.doesNotMatch(saidOne, /1\.5\.0|failed|up to date/, "la panne est déjà dite par son propre ticket");
  assert.equal(lineOfVersion(missed, NOW), "");
  assert.equal(lineOfVersion(document, NOW + 3_600_000, since), "", "hors ligne");
});

describe("les stations retirées, et leur version lue d'un lancement à l'autre", { concurrency: 7 }, () => {
  test("retirer la station : son appairage quitte son gist, elle n'est plus listée ni lue — et se laisse appairer de nouveau", { skip: WITHOUT_POSIX }, async (t) => {
    const github = oneGitHub(t);
    github.station("box1", published());
    github.station("box2", published({ nom: "mac", appairage: { empreinte: fingerprint("ABCD-EFGH"), expireLe: new Date(NOW + 10 * 60_000).toISOString() } }));
    const { stations } = ofStations(t, github);
    assert.ok("appairee" in (await stations.appairer(CODE)));
    assert.ok("appairee" in (await stations.appairer("ABCD-EFGH")));
    assert.deepEqual((await stations.relire()).stations.map(({ nom: name }) => name), ["box", "mac"]);

    assert.deepEqual(await stations.retirer("inconnue"), { refus: "this station is no longer paired with this app" });
    assert.deepEqual(await stations.retirer("box1"), { retiree: "box" });
    assert.deepEqual(stations.vu()?.stations.map(({ nom: name }) => name), ["mac"]);
    assert.deepEqual(Object.keys(github.gist("box1").files), [FILE_STATION], "seul l'appairage est ôté, l'état de la station reste");
    assert.deepEqual(Object.keys(github.gist("box2").files).sort(), [FILE_PAIRING, FILE_STATION]);
    assert.deepEqual((await stations.relire()).stations.map(({ nom: name }) => name), ["mac"], "relue, elle n'est toujours pas là");
  });

  test("l'appairage d'une station de Mac dit qu'elle fournit `macos`, et ce que l'installation y a détecté (#1757)", { skip: WITHOUT_POSIX }, async (t) => {
    const github = oneGitHub(t);
    github.station("mac1", published({ nom: "macbook-air-de-benoit", machine: "macOS 15.1" }));
    const { stations } = ofStations(t, github);
    const detected = [
      { capacite: "navigateur-headless", nom: "a browser", detectee: true },
      { capacite: "android", nom: "the Android SDK", detectee: false },
    ];
    assert.ok("appairee" in (await stations.appairer(CODE, whatProvidesThisComputer("darwin", detected))));
    const written = JSON.parse(github.gist("mac1").files[FILE_PAIRING]?.content ?? "null") as { empreinte: string; fournit: string[] };
    assert.equal(written.empreinte, fingerprint(CODE));
    assert.deepEqual(written.fournit, ["macos", "navigateur-headless"]);
    assert.deepEqual(stations.vu()?.stations[0]?.fournit, ["macos", "navigateur-headless"]);
    // Une autre machine ne fournit que ce qu'on y détecte ; rien de détecté, l'appairage n'en dit rien.
    assert.deepEqual(whatProvidesThisComputer("linux", detected), ["navigateur-headless"]);
    assert.deepEqual(whatProvidesThisComputer("win32", []), []);
  });

  test("une station appairée avant que l'app n'écrive ce qu'elle fournit : son appairage le prend, une fois, l'empreinte gardée (#1757)", { skip: WITHOUT_POSIX }, async (t) => {
    const github = oneGitHub(t);
    github.station("mac1", published({ nom: "macbook" }));
    const { stations } = ofStations(t, github);
    assert.ok("appairee" in (await stations.appairer(CODE)));
    const before = JSON.parse(github.gist("mac1").files[FILE_PAIRING]?.content ?? "null") as Record<string, unknown>;
    assert.equal("fournit" in before, false);
    assert.equal(stations.vu()?.stations[0]?.fournit, undefined);
    assert.equal(await stations.tenirCeQuElleFournit("mac1", ["macos"]), true);
    assert.deepEqual(JSON.parse(github.gist("mac1").files[FILE_PAIRING]?.content ?? "null"), { ...before, fournit: ["macos"] });
    assert.deepEqual(stations.vu()?.stations[0]?.fournit, ["macos"]);
    assert.equal(await stations.tenirCeQuElleFournit("mac1", ["macos"]), false, "déjà dit : rien n'est réécrit");
    assert.equal(await stations.tenirCeQuElleFournit("inconnue", ["macos"]), false);
  });

  test("retirer la station, GitHub injoignable : rien n'est retiré, le refus tient en une ligne et son détail à part", { skip: WITHOUT_POSIX }, async (t) => {
    const github = oneGitHub(t);
    github.station("box1", published());
    const { stations } = ofStations(t, github);
    assert.ok("appairee" in (await stations.appairer(CODE)));
    github.panne(true);
    const rendered = await stations.retirer("box1");
    assert.ok("refus" in rendered);
    assert.equal(rendered.refus, "box was not removed: GitHub could not be written");
    assert.match(rendered.detail ?? "", /api\.github\.com/);
    github.panne(false);
    assert.deepEqual((await stations.relire()).stations.map(({ nom: name }) => name), ["box"]);
  });

  test("depuis quand la station est sur sa version : l'app le déduit du changement qu'elle voit, et le garde d'un lancement à l'autre", { skip: WITHOUT_POSIX }, async (t) => {
    const github = oneGitHub(t);
    github.station("box1", published());
    const folder = mkdtempSync(join(tmpdir(), "brigade-app-versions-"));
    t.after(() => rmSync(folder, { recursive: true, force: true }));
    const path = join(folder, "versions-vues.json");
    let instant = NOW;
    const open = () => {
      const stations = holdStations({ github: githubOfStations({ gh: github.gh, delaiMs: 30_000 }), surLecture: () => {}, cadenceMs: 3_600_000, maintenant: () => instant, versions: versionsInFile(path) });
      t.after(() => stations.fermer());
      return stations;
    };
    const within = (document: object) => github.station("box1", { ...(document as object), appairage: null, signeDeVie: new Date(instant - 5_000).toISOString() });

    const first = open();
    assert.ok("appairee" in (await first.appairer(CODE)));
    within(published());
    assert.equal((await first.relire()).stations[0]?.versionDit, "up to date", "à sa première lecture, l'app ne sait pas depuis quand : rien d'inventé");

    instant += 2 * 24 * 3_600_000;
    within(published({ version: "1.5.0" }));
    assert.equal((await first.relire()).stations[0]?.versionDit, "up to date · on this version for less than a minute", "elle a vu la version changer");

    instant += 3 * 24 * 3_600_000;
    within(published({ version: "1.5.0" }));
    const relaunched = open();
    assert.equal((await relaunched.relire()).stations[0]?.versionDit, "up to date · on this version for 3 days", "relancée, elle se souvient");
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")).box1, { version: "1.5.0", depuisLe: new Date(NOW + 2 * 24 * 3_600_000).toISOString() });
  });
});
