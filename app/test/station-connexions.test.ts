// La section « Connections » de la page d'une station (ticket 2643, épique 2497) : le compte GitHub et la connexion Max,
// chacun avec la marque de son niveau ; connectée, perdue, et en lecture seule sur une autre station.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { EN_COURS } from "../src/vue/station/page/appliquer.js";
import { AILLEURS, CHANGER, RENOUVELER, RIEN_FAIT, poserSection } from "../src/vue/station/page/sections/connexions.js";
import { poserPageDeStation } from "../src/vue/station/page/StationPage.js";
import { Faux, repos } from "./aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const STATION = { id: "gist-mac", nom: "mac/claude" };

function section(locale: string, connexions: object) {
  return poserPageDeStation(doc, { station: STATION, locale, connexions: connexions as never }).then((page) => (page as Faux).children[1]?.children[1] as Faux);
}
const rangee = (racine: Faux, cle: string) => racine.children.find((une) => une.dataset.cle === cle) as Faux;
// Ce qu'une rangée de réglage (ticket 2920) dit sous elle : après son nom, sa valeur et son contrôle.
const dessous = (une: Faux) => une.children.slice(3);
const boutons = (racine: Faux) => [...racine.descendants()].filter((e) => e.balise === "button" && e.textContent !== "?");

describe("la section Connections", () => {
  test("connectée : le compte GitHub et son geste, l'état de Claude, la date depuis laquelle il tient, son geste — chacun avec le niveau « this computer »", async () => {
    const appels: string[] = [];
    const racine = await section("gist-mac", {
      github: { login: "benomite" },
      claude: { etat: "connectee", depuis: "2026-11-03T08:00:00Z" },
      gestes: { changerGitHub: async () => void appels.push("github"), renouveler: async () => void appels.push("claude") },
    });
    const github = rangee(racine, "github");
    const claude = rangee(racine, "claude");
    assert.match(github.textContent, /benomite/);
    assert.match(claude.textContent, /connected/);
    assert.match(claude.textContent, /since 2026-11-03/);
    for (const une of [github, claude]) assert.equal(une.descendants().find((e) => e.className === "niveau")?.dataset.niveau, "machine");
    assert.deepEqual(boutons(racine).map((b) => b.textContent), [CHANGER, RENOUVELER]);
    boutons(racine).forEach((b) => b.click());
    await repos();
    assert.deepEqual(appels, ["github", "claude"]);
    assert.ok(!racine.descendants().some((e) => e.className === "ailleurs"));
  });

  test("déconnectée : Claude le dit sans date, le renouvellement reste offert ; un compte GitHub absent se dit", async () => {
    const racine = await section("gist-mac", { github: { nonConnecte: true }, claude: { etat: "perdue", depuis: "2026-11-03T08:00:00Z" }, gestes: { changerGitHub: async () => {}, renouveler: async () => "log-in started" } });
    const claude = rangee(racine, "claude");
    assert.match(claude.textContent, /not connected/);
    assert.doesNotMatch(claude.textContent, /since/);
    assert.match(rangee(racine, "github").textContent, /not signed in/);
    boutons(racine)[1]?.click();
    await repos();
    assert.match(racine.textContent, /log-in started/);
  });

  test("un geste qui échoue se dit en une ligne d'erreur sous sa rangée, son message au survol, sans erreur brute en dehors", async () => {
    const racine = await section("gist-mac", { github: { login: "a" }, claude: null, gestes: { changerGitHub: async () => { throw new Error("gh failed"); } } });
    boutons(racine)[0]?.click();
    await repos();
    const [refus] = dessous(rangee(racine, "github"));
    assert.equal(refus?.dataset.ligne, "erreur");
    assert.equal(refus?.children[0]?.textContent, RIEN_FAIT);
    assert.ok(refus?.descendants().some((e) => e.ariaLabel === "gh failed"));
  });

  test("le geste court : son bouton désactivé et « applying… » sous la rangée, puis le refus qu'il rend sous elle", async () => {
    let fini: (rendu: unknown) => void = () => {};
    const racine = await section("gist-mac", { github: { login: "a" }, claude: null, gestes: { changerGitHub: () => new Promise((r) => (fini = r)) } });
    const [changer] = boutons(racine);
    changer?.click();
    await repos();
    assert.equal(changer?.disabled, true);
    assert.equal(dessous(rangee(racine, "github")).map((e) => e.textContent).join(), EN_COURS);
    fini({ refus: "GitHub sign-in could not be started" });
    await repos();
    assert.equal(changer?.disabled, false);
    assert.equal(dessous(rangee(racine, "github"))[0]?.dataset.ligne, "erreur");
    assert.match(rangee(racine, "github").textContent, /GitHub sign-in could not be started/);
    assert.ok(!racine.descendants().some((e) => e.className === "par-pr"), "réglages de la machine : aucune ligne de PR");
  });

  test("sur une autre station : les deux se lisent, aucun geste, une note dit que le changement se fait sur cette machine", async () => {
    const racine = await section("gist-pc", {
      github: { login: "benomite" },
      claude: { etat: "connectee", depuis: "2026-11-03T08:00:00Z" },
      gestes: { changerGitHub: async () => {}, renouveler: async () => {} },
    });
    assert.deepEqual(boutons(racine), []);
    assert.match(racine.textContent, /benomite/);
    assert.match(racine.textContent, /since 2026-11-03/);
    assert.match(racine.textContent, new RegExp(AILLEURS(STATION.nom).replace("/", "\\/")));
    assert.equal(rangee(racine, "claude").descendants().find((e) => e.className === "niveau")?.dataset.niveau, "machine");
  });

  test("une station qui ne dit pas sa connexion : « not said », sans date", () => {
    const racine = poserSection(doc, { station: STATION, ici: true, lectureSeule: false, niveau: () => new Faux("span"), connexions: { claude: null } }) as Faux;
    assert.match(rangee(racine, "claude").textContent, /not said/);
  });
});
