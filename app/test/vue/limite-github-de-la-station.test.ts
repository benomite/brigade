// Une station que la limite de GitHub retient (#2443), dans l'app : la fenêtre du 5 novembre rejouée. parade-box écrit son
// signe de vie à 14:04:25, GitHub la limite de 14:06 à 14:37, et son enregistrement le dit au moment où ses appels
// s'arrêtent (`heldBy`, runtime/src/enregistrement-station/enregistrer.ts). À 14:23, le chef ouvre l'app : la station est
// lue par le lecteur même du runtime (`stationDuGist`), et l'app la dit « held by GitHub's limit until 14:37 » — jamais
// « offline » —, sur sa ligne de l'accueil, sur sa page, et sur l'onglet Cooks de chacun de ses projets, qu'elle garde.
// L'heure est celle du chef : ce test la pose en UTC, celle du ticket.
process.env.TZ = "UTC";
import assert from "node:assert/strict";
import { test } from "node:test";
import * as contrat from "../../../runtime/src/enregistrement-station/contrat.ts";
import { stationDuGist } from "../../../runtime/src/enregistrement-station/stations-du-compte.ts";
import { cuissonDe } from "../../src/cuisson.ts";
import type { StationEnregistree } from "../../src/stations-du-compte.ts";
import { stationsDeGithub } from "../../src/vue/cooks/prises.ts";
import { signesDe } from "../../src/vue/cooks/signes-de-vie.ts";
import { ATTEINTE, poserLesStationsSurGithub } from "../../src/vue/cooks/stations-github.js";
import { EN_SA_RETENUE, EN_SON_ABSENCE, HORS_LIGNE, ligneDeLEnregistree, projetsDe, type GestesDuCompte } from "../../src/vue/stations-du-compte.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise), createElementNS: (_espace: string, balise: string) => new Faux(balise) };
const a = (hhmmss: string) => Date.parse(`2026-11-05T${hhmmss}Z`);
const DEPOTS = ["benomite/brigade", "benomite/parade", "benomite/site", "benomite/notes"];
const RIEN: GestesDuCompte = { ouvrirLaStation() {}, choisir() {}, chercher() {}, ajouter() {}, relire() {}, seConnecter() {}, ouvrirLaPage() {}, copier() {} };

// Le gist de parade-box à 14:23 : son enregistrement écrit à 14:06, quand GitHub l'a limitée, et la sélection que le chef
// vient de lui réécrire. `retenue` faux : l'enregistrement d'avant ce ticket, qui n'en disait rien.
function lueA(instant: number, retenue = true): StationEnregistree {
  const enregistrement = {
    brigade: "station-registration",
    format: 1,
    name: "parade-box",
    platform: "linux",
    machine: "Linux 6.1.0",
    version: "1.4.0",
    registeredAt: "2026-11-01T08:00:00.000Z",
    lastSeen: "2026-11-05T14:06:00.000Z",
    refreshMs: contrat.RAFRAICHI_MS,
    stoppedAt: null,
    ...(retenue ? { heldBy: { limit: "secondary-writes", since: "2026-11-05T14:06:00.000Z", until: "2026-11-05T14:37:00.000Z" } } : {}),
  };
  const selection = { brigade: "station-selection", format: 1, repositories: DEPOTS, updatedAt: "2026-11-05T14:23:00.000Z" };
  const station = stationDuGist("g-parade-box", { [contrat.FICHIER_ENREGISTREMENT]: JSON.stringify(enregistrement), [contrat.FICHIER_SELECTION]: JSON.stringify(selection) }, "benomite", instant);
  return "illisible" in station ? assert.fail(station.illisible) : station;
}

// L'onglet Cooks d'un projet, tel que la vue le pose d'après les signes de vie du compte.
function cooksDe(depot: string, station: StationEnregistree, instant: number) {
  const signes = signesDe({ state: "listed", stations: [station], unreadable: [] });
  assert.ok("lus" in signes);
  const cuisson = cuissonDe(stationsDeGithub([], signes.lus, depot, instant), [], new Date(instant).toISOString());
  const pastille = (mot: string, ton: string | undefined) => Object.assign(new Faux("span"), { title: `${mot} ${ton ?? ""}` });
  return poserLesStationsSurGithub(doc, { cuisson: { ...cuisson, surGithub: { illisible: null } }, pastille }) as Faux;
}

test("a limit window replayed in the app: at 14:23 the station is held by GitHub's limit until 14:37, never offline, and each of its projects keeps it, with the limit line", () => {
  for (const instant of [a("14:11:00"), a("14:23:00"), a("14:36:59")]) {
    const station = lueA(instant);
    assert.equal(station.available, true);
    assert.equal(station.heldUntil, "2026-11-05T14:37:00.000Z");

    // Sa ligne de l'accueil : la limite, puis les projets qu'elle sert.
    const ligne = ligneDeLEnregistree(doc, station, RIEN) as Faux;
    assert.equal(ligne.textContent.includes(`held by GitHub's limit until 14:37 · ${DEPOTS.join(", ")}`), true, ligne.textContent);
    assert.equal(ligne.textContent.includes(HORS_LIGNE), false);
    assert.equal(ligne.dessous("span").find(({ className }) => className === "pastille")?.dataset.ton, "jaune");

    // Sa page : ses projets restent cochés, et ce que le chef vient de choisir sera lu à la fin de la limite.
    const page = projetsDe(doc, station, { depots: { depots: DEPOTS.map((depot) => ({ depot, base: "main" })) } }, RIEN) as Faux;
    const textes = page.dessous("p").map(({ textContent }) => textContent);
    assert.ok(textes.includes(EN_SA_RETENUE), textes.join(" | "));
    assert.ok(!textes.includes(EN_SON_ABSENCE));
    assert.deepEqual(page.dessous("input").filter(({ checked }) => checked).map(({ ariaLabel }) => ariaLabel), DEPOTS);

    // L'onglet Cooks de chacun de ses projets : la station y est, atteinte et retenue, jamais « no station ».
    for (const depot of DEPOTS) {
      const cooks = cooksDe(depot, station, instant);
      const lignes = cooks.dessous("li").filter(({ className }) => className === "station-de-cuisson");
      assert.equal(lignes.length, 1, `${depot}: its station is listed`);
      assert.equal(lignes[0]?.dataset.station, "parade-box/claude");
      assert.equal(lignes[0]?.dataset.etat, "idle");
      assert.ok(lignes[0]?.textContent.includes("held by GitHub's limit until 14:37"), lignes[0]?.textContent);
      assert.ok(!lignes[0]?.textContent.includes(ATTEINTE.non));
    }
  }
});

test("the same window read from a registration that did not say its limit — before this ticket: offline at 14:23, and not reached", () => {
  const station = lueA(a("14:23:00"), false);
  assert.equal(station.available, false);
  assert.match((ligneDeLEnregistree(doc, station, RIEN) as Faux).textContent, /offline · benomite\/brigade/);
  const ligne = cooksDe("benomite/parade", station, a("14:23:00")).dessous("li").find(({ className }) => className === "station-de-cuisson");
  assert.equal(ligne?.dataset.etat, "silent");
  assert.ok(ligne?.textContent.includes(ATTEINTE.non));
});
