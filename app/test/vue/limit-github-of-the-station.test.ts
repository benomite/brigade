// Une station que la limite de GitHub retient (#2443), dans l'app : la fenêtre du 5 novembre rejouée. parade-box écrit son
// signe de vie à 14:04:25, GitHub la limite de 14:06 à 14:37, et son enregistrement le dit au moment où ses appels
// s'arrêtent (`heldBy`). À 14:23, le chef ouvre l'app : la station est lue disponible, retenue jusqu'à 14:37
// (`heldUntil`, stations-of-account.ts), et l'app la dit « held by GitHub's limit until 14:37 » — jamais
// « offline » —, sur sa ligne de l'accueil, sur sa page, et sur l'onglet Stations de chacun de ses projets, qu'elle garde.
// L'heure est celle du chef : ce test la pose en UTC, celle du ticket.
process.env.TZ = "UTC";
import assert from "node:assert/strict";
import { test } from "node:test";
import { cookingOf } from "../../src/cooking.ts";
import type { StationRecorded } from "../../src/stations-of-account.ts";
import { stationsOfGithub } from "../../src/vue/cooks/taken.ts";
import { signsOf } from "../../src/vue/cooks/signs-of-life.ts";
import { topOf, servingOf } from "../../src/vue/stations-tab/state.js";
import { setTheTabOfStations } from "../../src/vue/stations-tab/stations-tab.js";
import { OUTSIDE_LINE, lineOfTheRecorded, type ActionsOfAccount } from "../../src/vue/stations-of-account.js";
import { Fake } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise), createElementNS: (_space: string, balise: string) => new Fake(balise) };
const a = (hhmmss: string) => Date.parse(`2026-11-05T${hhmmss}Z`);
const REPOSITORIES = ["benomite/brigade", "benomite/parade", "benomite/site", "benomite/notes"];
const NOTHING: ActionsOfAccount = { ouvrirLaStation() {}, relire() {}, seConnecter() {}, ouvrirLaPage() {}, copier() {} };

// parade-box telle que son gist la dit pendant la fenêtre : son enregistrement écrit à 14:06, quand GitHub l'a limitée, et
// la sélection que le chef vient de lui réécrire. Retenue, elle est disponible jusqu'à la fin de la limite. `retenue` faux :
// l'enregistrement d'avant ce ticket, qui n'en disait rien — deux signes de vie manqués, elle ne l'est plus.
function readA(retainedOne = true): StationRecorded {
  return {
    id: "g-parade-box",
    name: "parade-box",
    platform: "linux",
    machine: "Linux 6.1.0",
    version: "1.4.0",
    account: "benomite",
    available: retainedOne,
    ...(retainedOne ? { heldUntil: "2026-11-05T14:37:00.000Z", heldBy: { limit: "secondary-writes", since: "2026-11-05T14:06:00.000Z", until: "2026-11-05T14:37:00.000Z" } } : {}),
    registeredAt: "2026-11-01T08:00:00.000Z",
    lastSeen: "2026-11-05T14:06:00.000Z",
    stoppedAt: null,
    refreshMs: 120_000,
    selection: REPOSITORIES,
  };
}

// Les cartes de l'onglet Stations d'un projet (#3195), telles que la vue les pose d'après les signes de vie du compte.
function cooksOf(repository: string, station: StationRecorded, instant: number) {
  const signs = signsOf({ state: "listed", stations: [station], unreadable: [] });
  assert.ok("lus" in signs);
  const cooking = cookingOf(stationsOfGithub([], signs.lus, repository, instant), [], new Date(instant).toISOString());
  const servingOnes = servingOf({ projet: repository, lignes: cooking.lignes, maintenant: instant });
  const actions = { choisirQuiCuit() {}, cuireIci() {}, deplacer() {}, versIci() {}, choisir() {}, annuler() {}, arreter() {}, confirmerArret() {}, renoncerArret() {}, basculer() {} };
  const seenOne = { projet: repository, poste: "this Mac", lues: true, haut: topOf({ servantes: servingOnes, deplacement: null, maintenant: instant }), servantes: servingOnes, deplacable: { offert: false, pourquoi: "" }, details: new Map(), ouverts: new Set<string>() };
  return (setTheTabOfStations(doc, seenOne, actions) as Fake).dessous("section").filter(({ className }) => className === "carte-de-station");
}

test("a limit window replayed in the app: at 14:23 the station is held by GitHub's limit until 14:37, never offline, and each of its projects keeps it", () => {
  for (const instant of [a("14:11:00"), a("14:23:00"), a("14:36:59")]) {
    const station = readA();

    // Sa ligne de l'accueil : la limite, puis les projets qu'elle sert.
    const line = lineOfTheRecorded(doc, station, NOTHING) as Fake;
    assert.equal(line.textContent.includes(`held by GitHub's limit until 14:37 · ${REPOSITORIES.join(", ")}`), true, line.textContent);
    assert.equal(line.textContent.includes(OUTSIDE_LINE), false);
    assert.equal(line.dessous("span").find(({ className }) => className === "pastille")?.dataset.ton, "jaune");

    // L'onglet Stations de chacun de ses projets : la station y a sa carte, en ligne et retenue, jamais « nobody ».
    for (const repository of REPOSITORIES) {
      const lines = cooksOf(repository, station, instant);
      assert.equal(lines.length, 1, `${repository}: its station is listed`);
      assert.equal(lines[0]?.dataset.station, "parade-box/claude");
      assert.equal(lines[0]?.dataset.etat, "en-ligne");
      assert.ok(lines[0]?.textContent.includes("held by GitHub's limit until 14:37"), lines[0]?.textContent);
      assert.ok(!lines[0]?.textContent.includes("offline"));
    }
  }
});

test("the same window read from a registration that did not say its limit — before this ticket: offline at 14:23", () => {
  const station = readA(false);
  assert.match((lineOfTheRecorded(doc, station, NOTHING) as Fake).textContent, /offline · benomite\/brigade/);
  const [line] = cooksOf("benomite/parade", station, a("14:23:00"));
  assert.equal(line?.dataset.etat, "hors-ligne");
  assert.ok(line?.textContent.includes("offline"));
});
