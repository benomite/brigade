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
import { duree, ligneDe, tenirStations, type VuDesStations } from "../../src/stations/stations.ts";

const FAUX_GH = join(import.meta.dirname, "faux-gh-gists.ts");
const SOURCES = join(import.meta.dirname, "../../src/stations");
const MAINTENANT = Date.parse("2026-10-15T12:00:00Z");
const CODE = "7KQ2-M9XD";

// Ce qu'une station fraîchement installée publie (runtime/src/appairage/presence.ts).
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
  assert.deepEqual(stations.vu()?.stations, [{ id: "box1", nom: "box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [] }]);
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
