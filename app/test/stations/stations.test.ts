// Les stations sur la home : appairées par le code qu'elles affichent, lues sur
// GitHub, dites en ligne ou hors ligne en une ligne. Contre une doublure de
// `gh` qui tient les gists du compte dans un répertoire : ni réseau, ni
// GitHub, ni station — c'est le seul canal, et ce test n'en ouvre aucun autre.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { empreinte, FICHIER_APPAIRAGE, FICHIER_STATION, type DocumentStation } from "../../src/stations/document.ts";
import { githubDesStations } from "../../src/stations/github.ts";
import { versionsDansFichier } from "../../src/stations/versions.ts";
import { duree, ligneDe, ligneDeVersion, tenirStations, type VuDesStations } from "../../src/stations/stations.ts";

const FAUX_GH = join(import.meta.dirname, "faux-gh-gists.ts");
const SOURCES = join(import.meta.dirname, "../../src/stations");
const MAINTENANT = Date.parse("2026-10-15T12:00:00Z");
const CODE = "7KQ2-M9XD";

// Ce qu'une station fraîchement installée publie (runtime/src/pairing/presence.ts).
const publie = (champs: Partial<DocumentStation> = {}) => ({
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
  const avant = process.env.FAUX_GISTS;
  process.env.FAUX_GISTS = repertoire;
  t.after(() => {
    if (avant === undefined) delete process.env.FAUX_GISTS;
    else process.env.FAUX_GISTS = avant;
    rmSync(repertoire, { recursive: true, force: true });
  });
  const fichier = (id: string) => join(repertoire, `${id}.gist.json`);
  const gist = (id: string) => JSON.parse(readFileSync(fichier(id), "utf8")) as { files: Record<string, { filename: string; content: string }> };
  // Ce que la station écrit dans son gist.
  const station = (id: string, document: object) => {
    const avant = existsSync(fichier(id)) ? gist(id).files : {};
    writeFileSync(fichier(id), JSON.stringify({ id, description: "brigade — station", public: false, updated_at: new Date().toISOString() + Math.random(), files: { ...avant, [FICHIER_STATION]: { filename: FICHIER_STATION, content: JSON.stringify(document) } } }));
  };
  const appels = () => readFileSync(join(repertoire, "appels"), "utf8").split("\n").filter(Boolean);
  return { repertoire, station, gist, appels, panne: (oui: boolean) => (oui ? writeFileSync(join(repertoire, "panne"), "") : rmSync(join(repertoire, "panne"), { force: true })) };
}

function desStations(t: TestContext, maintenant = () => MAINTENANT) {
  const lectures: VuDesStations[] = [];
  const stations = tenirStations({ github: githubDesStations({ gh: FAUX_GH, delaiMs: 30_000 }), surLecture: (vu) => lectures.push(vu), cadenceMs: 3_600_000, maintenant });
  t.after(() => stations.fermer());
  return { stations, lectures };
}

test("une station en ligne : « online · version X · no project » ; ses projets, quand elle en sert", () => {
  const document = { ...publie(), appairage: null } as DocumentStation;
  assert.deepEqual(ligneDe(document, MAINTENANT), { etat: "en-ligne", ligne: "online · version 1.4.0 · no project" });
  assert.equal(ligneDe({ ...document, projets: ["brigade"] }, MAINTENANT).ligne, "online · version 1.4.0 · 1 project: brigade");
  assert.equal(ligneDe({ ...document, projets: ["brigade", "espace"] }, MAINTENANT).ligne, "online · version 1.4.0 · 2 projects: brigade, espace");
});

test("éteinte d'un coup, elle passe hors ligne dès qu'elle a manqué deux signes de vie, et dit depuis combien de temps", () => {
  const document = { ...publie(), appairage: null } as DocumentStation;
  const signe = Date.parse(document.signeDeVie);
  assert.equal(ligneDe(document, signe + 2 * 60_000).etat, "en-ligne");
  assert.deepEqual(ligneDe(document, signe + 2 * 60_000 + 31_000), { etat: "hors-ligne", ligne: "offline for 2 min · version 1.4.0 · no project" });
  assert.equal(ligneDe(document, signe + 3 * 3_600_000 + 5 * 60_000).ligne, "offline for 3 h 05 · version 1.4.0 · no project");
});

test("arrêtée proprement, elle est hors ligne tout de suite ; redémarrée, de nouveau en ligne", () => {
  const arretee = { ...publie({ arreteeLe: new Date(MAINTENANT - 10_000).toISOString() }), appairage: null } as DocumentStation;
  assert.deepEqual(ligneDe(arretee, MAINTENANT), { etat: "hors-ligne", ligne: "offline for less than a minute · version 1.4.0 · no project" });
  // Un signe de vie postérieur à l'arrêt : elle est repartie.
  assert.equal(ligneDe({ ...arretee, signeDeVie: new Date(MAINTENANT).toISOString(), arreteeLe: null }, MAINTENANT).etat, "en-ligne");
});

test("les durées se disent à la minute", () => {
  assert.equal(duree(59_000), "less than a minute");
  assert.equal(duree(4 * 60_000 + 59_000), "4 min");
  assert.equal(duree(2 * 3_600_000), "2 h");
  assert.equal(duree(3 * 86_400_000), "3 days");
});

test("le code tapé appaire la station : elle apparaît sur la home, « online · version X · no project »", async (t) => {
  const github = unGitHub(t);
  github.station("box1", publie());
  // Un autre gist du compte, qui n'est pas une station : ignoré.
  writeFileSync(join(github.repertoire, "notes.gist.json"), JSON.stringify({ id: "notes", description: "", public: false, updated_at: "", files: { "a.md": { filename: "a.md", content: "rien" } } }));
  const { stations, lectures } = desStations(t);
  // Pas encore appairée : la home ne la montre pas.
  assert.deepEqual((await stations.relire()).stations, []);

  // Le chef tape le code comme il le lit, en minuscules et sans tiret.
  assert.deepEqual(await stations.appairer(" 7kq2 m9xd "), { appairee: "box" });
  const ecrit = JSON.parse(github.gist("box1").files[FICHIER_APPAIRAGE]?.content ?? "null") as { appaireeLe: string; empreinte: string };
  assert.equal(ecrit.empreinte, empreinte(CODE));
  assert.equal(ecrit.appaireeLe, new Date(MAINTENANT).toISOString());
  assert.deepEqual(stations.vu()?.stations, [{ id: "box1", nom: "box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [], dit: "online", version: "1.4.0", projets: [], max: null, versionDit: "up to date" }]);
  assert.deepEqual(lectures.at(-1), stations.vu());
});

test("un code erroné, mal formé ou expiré est refusé en une ligne, et rien n'est écrit sur GitHub", async (t) => {
  const github = unGitHub(t);
  github.station("box1", publie({ appairage: { empreinte: empreinte(CODE), expireLe: new Date(MAINTENANT - 1).toISOString() }, echus: [empreinte("AAAA-BBBB")] }));
  const { stations } = desStations(t);
  const refus = [await stations.appairer("ZZZZ-ZZZZ"), await stations.appairer("12-34"), await stations.appairer(CODE), await stations.appairer("aaaa-bbbb"), await stations.appairer(undefined)];
  for (const rendu of refus) {
    assert.ok("refus" in rendu, JSON.stringify(rendu));
    assert.doesNotMatch(rendu.refus, /\n/);
  }
  assert.match(JSON.stringify(refus[0]), /no station shows this code/);
  assert.match(JSON.stringify(refus[1]), /is not a pairing code/);
  assert.match(JSON.stringify(refus[2]), /this code has expired: station box shows a new one/);
  assert.match(JSON.stringify(refus[3]), /this code has expired/);
  assert.match(JSON.stringify(refus[4]), /is not a pairing code/);
  assert.equal(github.gist("box1").files[FICHIER_APPAIRAGE], undefined);
  assert.ok(!github.appels().some((appel) => appel.includes("PATCH")), github.appels().join("\n"));
  assert.deepEqual((await stations.relire()).stations, []);
});

test("la station éteinte passe hors ligne sans quitter la liste ; GitHub muet, la liste reste et le dit", async (t) => {
  const github = unGitHub(t);
  let instant = MAINTENANT;
  github.station("box1", publie());
  const { stations } = desStations(t, () => instant);
  assert.ok("appairee" in (await stations.appairer(CODE)));

  // Plus aucun signe de vie depuis trois minutes.
  instant += 3 * 60_000;
  assert.deepEqual(
    (await stations.relire()).stations.map(({ etat, ligne }) => ({ etat, ligne })),
    [{ etat: "hors-ligne", ligne: "offline for 3 min · version 1.4.0 · no project" }],
  );
  // Elle revient, appairée : elle ne publie plus de code.
  github.station("box1", { ...publie({ signeDeVie: new Date(instant).toISOString(), projets: ["brigade"] }), appairage: null });
  assert.equal((await stations.relire()).stations[0]?.ligne, "online · version 1.4.0 · 1 project: brigade");

  github.panne(true);
  instant += 10 * 60_000;
  const relue = await stations.relire();
  assert.match(relue.sans ?? "", /^your stations could not be read on GitHub — error connecting to api\.github\.com$/);
  assert.deepEqual(relue.stations.map(({ nom, etat, ligne }) => ({ nom, etat, ligne })), [{ nom: "box", etat: "hors-ligne", ligne: "offline for 10 min · version 1.4.0 · 1 project: brigade" }]);
  github.panne(false);
  assert.equal((await stations.relire()).sans, undefined);
});

test("GitHub qui limite les appels du compte : la lecture le dit, avec l'heure où il les rend, lue sans en dépenser un", async (t) => {
  const github = unGitHub(t);
  github.station("box1", publie({ connexionMax: { etat: "connectee", depuis: null } }));
  const { stations } = desStations(t);
  assert.ok("appairee" in (await stations.appairer(CODE)));
  assert.deepEqual(
    (await stations.relire()).stations.map(({ dit, version, projets, max }) => ({ dit, version, projets, max })),
    [{ dit: "online", version: "1.4.0", projets: [], max: "connectee" }],
  );

  const reprise = Date.parse("2026-10-15T15:16:00Z");
  writeFileSync(join(github.repertoire, "limite"), String(reprise / 1000));
  const limitee = await stations.relire();
  assert.match(limitee.sans ?? "", /rate limit exceeded/);
  assert.deepEqual(limitee.limite, { reprise: new Date(reprise).toISOString() });
  assert.equal(limitee.stations.length, 1, "la liste d'avant reste");

  rmSync(join(github.repertoire, "limite"));
  const rendue = await stations.relire();
  assert.equal(rendue.sans, undefined);
  assert.equal(rendue.limite, undefined);
});

test("l'app ne joint jamais une station : tout passe par `gh api` sur les gists du compte", async (t) => {
  const github = unGitHub(t);
  github.station("box1", publie());
  const { stations } = desStations(t);
  await stations.appairer(CODE);
  await stations.relire();
  assert.ok(github.appels().length > 0);
  for (const appel of github.appels()) assert.match(appel, /^api (-X PATCH )?\/gists(\/[a-z0-9]+|\?per_page=100&page=\d+)( --input -)?$/);
  for (const nom of readdirSync(SOURCES)) {
    const source = readFileSync(join(SOURCES, nom), "utf8");
    for (const interdit of [/node:(net|http|https|dgram|tls)\b/, /\bfetch\(/, /\bWebSocket\b/, /\bssh\b/]) assert.doesNotMatch(source, interdit, `${nom} : ${interdit}`);
  }
});

test("la ligne de mise à jour : « up to date · on this version for 3 days » ; une mise à jour ratée n'y est pas répétée, une station hors ligne n'est dite à jour de rien", () => {
  const depuis = new Date(MAINTENANT - 3 * 24 * 3_600_000).toISOString();
  const document = { ...publie(), appairage: null, miseAJour: null, connexionMax: null } as DocumentStation;
  assert.equal(ligneDeVersion(document, MAINTENANT, depuis), "up to date · on this version for 3 days");
  assert.equal(ligneDeVersion(document, MAINTENANT), "up to date", "sans date publiée, elle ne dit pas depuis quand");
  const ratee = { ...document, miseAJour: { visee: "1.5.0", restauree: "1.4.0", le: new Date(MAINTENANT).toISOString(), retourRate: false } };
  const dite = ligneDeVersion(ratee, MAINTENANT, depuis);
  assert.equal(dite, "on this version for 3 days");
  assert.doesNotMatch(dite, /1\.5\.0|failed|up to date/, "la panne est déjà dite par son propre ticket");
  assert.equal(ligneDeVersion(ratee, MAINTENANT), "");
  assert.equal(ligneDeVersion(document, MAINTENANT + 3_600_000, depuis), "", "hors ligne");
});

test("retirer la station : son appairage quitte son gist, elle n'est plus listée ni lue — et se laisse appairer de nouveau", async (t) => {
  const github = unGitHub(t);
  github.station("box1", publie());
  github.station("box2", publie({ nom: "mac", appairage: { empreinte: empreinte("ABCD-EFGH"), expireLe: new Date(MAINTENANT + 10 * 60_000).toISOString() } }));
  const { stations } = desStations(t);
  assert.ok("appairee" in (await stations.appairer(CODE)));
  assert.ok("appairee" in (await stations.appairer("ABCD-EFGH")));
  assert.deepEqual((await stations.relire()).stations.map(({ nom }) => nom), ["box", "mac"]);

  assert.deepEqual(await stations.retirer("inconnue"), { refus: "this station is no longer paired with this app" });
  assert.deepEqual(await stations.retirer("box1"), { retiree: "box" });
  assert.deepEqual(stations.vu()?.stations.map(({ nom }) => nom), ["mac"]);
  assert.deepEqual(Object.keys(github.gist("box1").files), [FICHIER_STATION], "seul l'appairage est ôté, l'état de la station reste");
  assert.deepEqual(Object.keys(github.gist("box2").files).sort(), [FICHIER_APPAIRAGE, FICHIER_STATION]);
  assert.deepEqual((await stations.relire()).stations.map(({ nom }) => nom), ["mac"], "relue, elle n'est toujours pas là");
});

test("retirer la station, GitHub injoignable : rien n'est retiré, le refus tient en une ligne et son détail à part", async (t) => {
  const github = unGitHub(t);
  github.station("box1", publie());
  const { stations } = desStations(t);
  assert.ok("appairee" in (await stations.appairer(CODE)));
  github.panne(true);
  const rendu = await stations.retirer("box1");
  assert.ok("refus" in rendu);
  assert.equal(rendu.refus, "box was not removed: GitHub could not be written");
  assert.match(rendu.detail ?? "", /api\.github\.com/);
  github.panne(false);
  assert.deepEqual((await stations.relire()).stations.map(({ nom }) => nom), ["box"]);
});

test("depuis quand la station est sur sa version : l'app le déduit du changement qu'elle voit, et le garde d'un lancement à l'autre", async (t) => {
  const github = unGitHub(t);
  github.station("box1", publie());
  const dossier = mkdtempSync(join(tmpdir(), "brigade-app-versions-"));
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  const chemin = join(dossier, "versions-vues.json");
  let instant = MAINTENANT;
  const ouvrir = () => {
    const stations = tenirStations({ github: githubDesStations({ gh: FAUX_GH, delaiMs: 30_000 }), surLecture: () => {}, cadenceMs: 3_600_000, maintenant: () => instant, versions: versionsDansFichier(chemin) });
    t.after(() => stations.fermer());
    return stations;
  };
  const en = (document: object) => github.station("box1", { ...(document as object), appairage: null, signeDeVie: new Date(instant - 5_000).toISOString() });

  const premiere = ouvrir();
  assert.ok("appairee" in (await premiere.appairer(CODE)));
  en(publie());
  assert.equal((await premiere.relire()).stations[0]?.versionDit, "up to date", "à sa première lecture, l'app ne sait pas depuis quand : rien d'inventé");

  instant += 2 * 24 * 3_600_000;
  en(publie({ version: "1.5.0" }));
  assert.equal((await premiere.relire()).stations[0]?.versionDit, "up to date · on this version for less than a minute", "elle a vu la version changer");

  instant += 3 * 24 * 3_600_000;
  en(publie({ version: "1.5.0" }));
  const relancee = ouvrir();
  assert.equal((await relancee.relire()).stations[0]?.versionDit, "up to date · on this version for 3 days", "relancée, elle se souvient");
  assert.deepEqual(JSON.parse(readFileSync(chemin, "utf8")).box1, { version: "1.5.0", depuisLe: new Date(MAINTENANT + 2 * 24 * 3_600_000).toISOString() });
});
