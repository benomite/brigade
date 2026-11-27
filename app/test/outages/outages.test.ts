// Les pannes d'une station, dites sur sa ligne de la home : chacune en une ligne, avec un bouton,
// lues dans ce que la station publie sur GitHub — et jamais une commande à taper.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { playOutage, type RenderedOfOutage } from "../../src/outages/actions.ts";
import { readStatesPublished } from "../../src/outages/states.ts";
import { UNREACHABLE_AFTER_MS, outagesOf, type Outage } from "../../src/outages/outages.ts";
import { FILE_PAIRING, FILE_STATION, readDocument, type DocumentStation } from "../../src/stations/document.ts";
import { githubOfStations } from "../../src/stations/github.ts";
import { holdStations } from "../../src/stations/stations.ts";
import { WITHOUT_POSIX } from "../helpers/posix.ts";

const NOW = Date.parse("2026-10-15T12:00:00Z");
const it_y_a = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;

// Ce que la station publie (runtime/src/appairage/presence.ts), en ligne et sans panne.
const document = (fields: Partial<DocumentStation> = {}): DocumentStation => ({
  nom: "box",
  machine: "Linux 6.1.0",
  version: "1.4.0",
  projets: ["brigade"],
  signeDeVie: it_y_a(10_000),
  cadenceMs: 60_000,
  arreteeLe: null,
  appairage: null,
  echus: [],
  miseAJour: null,
  connexionMax: { etat: "connectee", depuis: it_y_a(3 * 3_600_000) },
  ...fields,
});

const OFF = document({ signeDeVie: it_y_a(UNREACHABLE_AFTER_MS) });
const BACK = document({ miseAJour: { visee: "1.5.0", restauree: "1.4.0", le: it_y_a(4 * MIN), retourRate: false } });
const LOST = document({ connexionMax: { etat: "perdue", depuis: it_y_a(12 * MIN) } });

// Ce qui, dans une ligne de l'app, serait une commande à taper dans un terminal.
const COMMANDS = [
  /`/,
  /\$ /,
  /(^|\s)(sudo|systemctl|journalctl|apt|apt-get|dpkg|gh|npm|node|git|curl|bash|sh|runuser|brigade)\s/i,
  /\bclaude\s+(auth|\/login|login|-p)\b/i,
  /\/login\b/,
  /(^|\s)--?[a-z]/,
  /\/(usr|var|etc|opt|home)\//,
  /\|\s*\w/,
];
const withoutCommand = (text: string) => {
  for (const motive of COMMANDS) assert.doesNotMatch(text, motive, `« ${text} » montre une commande`);
};
const textsOf = (outages: Outage[]) => outages.flatMap(({ ligne: line, survol: hover, bouton: button }) => [line, hover, button.libelle]);

test("une station éteinte depuis 10 minutes : « box has given no sign of life for 10 min », avec un bouton qui relit GitHub", () => {
  assert.deepEqual(outagesOf(OFF, NOW), [{ cle: "injoignable", sujet: "injoignable", ligne: "offline for 10 min", survol: "box has given no sign of life for 10 min: the app can only look on GitHub whether it has spoken again", bouton: { libelle: "check again", geste: "relire" } }]);
  // Arrêtée proprement il y a dix minutes : la même panne, comptée depuis son arrêt.
  assert.equal(outagesOf(document({ signeDeVie: it_y_a(11 * MIN), arreteeLe: it_y_a(10 * MIN) }), NOW)[0]?.ligne, "offline for 10 min");
  assert.equal(outagesOf(document({ signeDeVie: it_y_a(3 * 3_600_000 + 5 * MIN) }), NOW)[0]?.ligne, "offline for 3 h 05");
});

test("hors ligne depuis moins de dix minutes — un redémarrage, une mise à jour —, ce n'est pas une panne", () => {
  assert.deepEqual(outagesOf(document({ signeDeVie: it_y_a(UNREACHABLE_AFTER_MS - 1_000) }), NOW), []);
  assert.deepEqual(outagesOf(document({ arreteeLe: it_y_a(5_000) }), NOW), []);
  // Une station qui ne donne signe de vie que toutes les heures n'est pas en retard à dix minutes.
  assert.deepEqual(outagesOf(document({ cadenceMs: 3_600_000, signeDeVie: it_y_a(20 * MIN) }), NOW), []);
  assert.deepEqual(outagesOf(document(), NOW), []);
});

test("une mise à jour ratée et revenue en arrière : « update to version X failed — stayed on version Y », que le bouton écarte", () => {
  assert.deepEqual(outagesOf(BACK, NOW), [{ cle: `mise-a-jour:${it_y_a(4 * MIN)}`, sujet: "mise-a-jour", ligne: "update to version 1.5.0 failed", survol: "box stayed on version 1.4.0; the next version will be tried on its own", bouton: { libelle: "dismiss", geste: "ecarter" } }]);
  const rate = document({ miseAJour: { visee: "1.5.0", restauree: "1.4.0", le: it_y_a(4 * MIN), retourRate: true } });
  assert.equal(outagesOf(rate, NOW)[0]?.survol, "the station is on neither version: check box");
});

test("la connexion Max perdue : une ligne, et un bouton qui lance le login ; hors ligne, la station ne dit plus sa connexion", () => {
  assert.deepEqual(outagesOf(LOST, NOW), [{ cle: `connexion-max:${it_y_a(12 * MIN)}`, sujet: "connexion-max", ligne: "Max connection lost 12 min ago", survol: "nothing cooks on box until you log in", bouton: { libelle: "log in", geste: "login" } }]);
  assert.equal(outagesOf(document({ connexionMax: { etat: "perdue", depuis: null } }), NOW)[0]?.ligne, "Max connection lost");
  assert.deepEqual(outagesOf(document({ connexionMax: { etat: "inconnue", depuis: null } }), NOW), []);
  assert.deepEqual(
    outagesOf({ ...LOST, signeDeVie: it_y_a(UNREACHABLE_AFTER_MS) }, NOW).map(({ sujet: subject }) => subject),
    ["injoignable"],
  );
});

test("ce que la station publie de ses pannes se lit ; d'avant ces champs, ou mal écrit, il n'en est rien dit", () => {
  const raw = { brigade: "station", nom: "box", machine: "Linux 6.1.0", version: "1.4.0", projets: [], signeDeVie: it_y_a(0), cadenceMs: 60_000 };
  const readOne = readDocument(JSON.stringify({ ...raw, miseAJour: { visee: "1.5.0", restauree: "1.4.0", le: it_y_a(0), retourRate: false }, connexionMax: { etat: "perdue", depuis: it_y_a(0) } }));
  assert.ok(!("illisible" in readOne));
  assert.deepEqual({ miseAJour: readOne.miseAJour, connexionMax: readOne.connexionMax }, { miseAJour: { visee: "1.5.0", restauree: "1.4.0", le: it_y_a(0), retourRate: false }, connexionMax: { etat: "perdue", depuis: it_y_a(0) } });
  assert.deepEqual(readStatesPublished(raw), { miseAJour: null, connexionMax: null });
  // Une « version » qui n'en est pas une ne se pose dans aucune ligne.
  assert.equal(readStatesPublished({ miseAJour: { visee: "1.5.0; sudo apt install", restauree: "1.4.0", le: it_y_a(0) } }).miseAJour, null);
  assert.equal(readStatesPublished({ connexionMax: { etat: "fermee", depuis: it_y_a(0) } }).connexionMax, null);
  assert.deepEqual(readStatesPublished({ connexionMax: { etat: "perdue", depuis: "hier" } }).connexionMax, { etat: "perdue", depuis: null });
});

// Les gists du compte, tels que la doublure de `gh` les tient : une station appairée qui publie `doc`.
function oneGitHub(t: TestContext, doc: DocumentStation) {
  const directory = mkdtempSync(join(tmpdir(), "brigade-app-pannes-"));
  writeFileSync(join(directory, "appels"), "");
  const before = process.env.FAUX_GISTS;
  process.env.FAUX_GISTS = directory;
  t.after(() => {
    if (before === undefined) delete process.env.FAUX_GISTS;
    else process.env.FAUX_GISTS = before;
    rmSync(directory, { recursive: true, force: true });
  });
  const files = { [FILE_STATION]: { filename: FILE_STATION, content: JSON.stringify({ brigade: "station", format: 1, ...doc }) }, [FILE_PAIRING]: { filename: FILE_PAIRING, content: "{}" } };
  writeFileSync(join(directory, "box1.gist.json"), JSON.stringify({ id: "box1", description: "brigade — station box", public: false, updated_at: "2026-10-15T11:59:00Z", files }));
  const stations = holdStations({ github: githubOfStations({ gh: join(import.meta.dirname, "../stations/fake-gh-gists.ts"), delaiMs: 30_000 }), surLecture: () => {}, cadenceMs: 3_600_000, maintenant: () => NOW });
  t.after(() => stations.fermer());
  return stations;
}

test("lue sur GitHub, chaque panne est sur la ligne de sa station ; écartée, elle n'y revient pas", { skip: WITHOUT_POSIX }, async (t) => {
  const stations = oneGitHub(t, { ...BACK, connexionMax: LOST.connexionMax });
  const [box] = (await stations.relire()).stations;
  assert.deepEqual(box?.pannes.map(({ sujet: subject }) => subject), ["mise-a-jour", "connexion-max"]);
  stations.ecarter("box1", box?.pannes[0]?.cle ?? "");
  assert.deepEqual(stations.vu()?.stations[0]?.pannes.map(({ sujet: subject }) => subject), ["connexion-max"]);
  assert.deepEqual((await stations.relire()).stations[0]?.pannes.map(({ sujet: subject }) => subject), ["connexion-max"]);
});

test("aucun message de panne n'affiche une commande de terminal : les trois cas, leurs boutons et ce que chacun rend", async () => {
  const theCase = [OFF, BACK, LOST, document({ miseAJour: { visee: "1.5.0", restauree: "1.4.0", le: it_y_a(0), retourRate: true } }), document({ connexionMax: { etat: "perdue", depuis: null } })];
  const outages = theCase.flatMap((doc) => outagesOf(doc, NOW));
  assert.deepEqual([...new Set(outages.map(({ sujet: subject }) => subject))].sort(), ["connexion-max", "injoignable", "mise-a-jour"]);
  for (const text of textsOf(outages)) withoutCommand(text);

  // Et ce que chaque bouton rend, sur chaque station : fait ou refusé, une ligne sans commande.
  const renderedOnes: RenderedOfOutage[] = [];
  for (const doc of theCase) {
    for (const locale of [true, false]) {
      for (const reread of [doc, document()]) {
        const vue = { id: "g1", nom: doc.nom, machine: doc.machine, etat: "en-ligne" as const, ligne: "", pannes: outagesOf(doc, NOW), dit: "online", version: doc.version, projets: doc.projets, max: null };
        const options = {
          stations: {
            vu: () => ({ a: "", stations: [vue] }),
            relire: async () => ({ a: "", stations: [{ ...vue, pannes: outagesOf(reread, NOW) }] }),
            ecarter: () => undefined,
          },
          stationLocale: () => (locale ? "g1" : null),
          login: async () => {
            const { LAUNCHES } = await import("../../src/outages/login.ts");
            return { fait: LAUNCHES };
          },
        };
        for (const outage of vue.pannes) renderedOnes.push(await playOutage(options, "g1", outage.cle));
      }
    }
  }
  renderedOnes.push(await playOutage({ stations: { vu: () => undefined, relire: async () => ({ a: "", stations: [] }), ecarter: () => undefined }, stationLocale: () => null, login: async () => ({ fait: "" }) }, "g1", "injoignable"));
  assert.ok(renderedOnes.length > 10);
  for (const rendered of renderedOnes) withoutCommand("fait" in rendered ? rendered.fait : rendered.refus);
});
