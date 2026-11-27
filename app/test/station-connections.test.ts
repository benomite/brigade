// La section « Connections » de la page d'une station (ticket 2643, épique 2497) : le compte GitHub et la connexion Max,
// chacun avec la marque de son niveau ; connectée, perdue, et en lecture seule sur une autre station.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { IN_PROGRESS } from "../src/vue/station/page/apply.js";
import { ELSEWHERE, CHANGE, RENEW, NOTHING_DONE, setSection } from "../src/vue/station/page/sections/connections.js";
import { setPageOfStation } from "../src/vue/station/page/StationPage.js";
import { Fake, repos } from "./helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const STATION = { id: "gist-mac", nom: "mac/claude" };

function section(locale: string, connections: object) {
  return setPageOfStation(doc, { station: STATION, locale, connexions: connections as never }).then((page) => (page as Fake).children[1]?.children[1] as Fake);
}
const row = (root: Fake, key: string) => root.children.find((one) => one.dataset.cle === key) as Fake;
// Ce qu'une rangée de réglage (ticket 2920) dit sous elle : après son nom, sa valeur et son contrôle.
const below = (one: Fake) => one.children.slice(3);
const buttons = (root: Fake) => [...root.descendants()].filter((e) => e.balise === "button" && e.textContent !== "?");

describe("la section Connections", () => {
  test("connectée : le compte GitHub et son geste, l'état de Claude, la date depuis laquelle il tient, son geste — chacun avec le niveau « this computer »", async () => {
    const calls: string[] = [];
    const root = await section("gist-mac", {
      github: { login: "benomite" },
      claude: { etat: "connectee", depuis: "2026-11-03T08:00:00Z" },
      gestes: { changerGitHub: async () => void calls.push("github"), renouveler: async () => void calls.push("claude") },
    });
    const github = row(root, "github");
    const claude = row(root, "claude");
    assert.match(github.textContent, /benomite/);
    assert.match(claude.textContent, /connected/);
    assert.match(claude.textContent, /since 2026-11-03/);
    for (const one of [github, claude]) assert.equal(one.descendants().find((e) => e.className === "niveau")?.dataset.niveau, "machine");
    assert.deepEqual(buttons(root).map((b) => b.textContent), [CHANGE, RENEW]);
    buttons(root).forEach((b) => b.click());
    await repos();
    assert.deepEqual(calls, ["github", "claude"]);
    assert.ok(!root.descendants().some((e) => e.className === "ailleurs"));
  });

  test("déconnectée : Claude le dit sans date, le renouvellement reste offert ; un compte GitHub absent se dit", async () => {
    const root = await section("gist-mac", { github: { nonConnecte: true }, claude: { etat: "perdue", depuis: "2026-11-03T08:00:00Z" }, gestes: { changerGitHub: async () => {}, renouveler: async () => "log-in started" } });
    const claude = row(root, "claude");
    assert.match(claude.textContent, /not connected/);
    assert.doesNotMatch(claude.textContent, /since/);
    assert.match(row(root, "github").textContent, /not signed in/);
    buttons(root)[1]?.click();
    await repos();
    assert.match(root.textContent, /log-in started/);
  });

  test("un geste qui échoue se dit en une ligne d'erreur sous sa rangée, son message au survol, sans erreur brute en dehors", async () => {
    const root = await section("gist-mac", { github: { login: "a" }, claude: null, gestes: { changerGitHub: async () => { throw new Error("gh failed"); } } });
    buttons(root)[0]?.click();
    await repos();
    const [refusal] = below(row(root, "github"));
    assert.equal(refusal?.dataset.ligne, "erreur");
    assert.equal(refusal?.children[0]?.textContent, NOTHING_DONE);
    assert.ok(refusal?.descendants().some((e) => e.ariaLabel === "gh failed"));
  });

  test("le geste court : son bouton désactivé et « applying… » sous la rangée, puis le refus qu'il rend sous elle", async () => {
    let finished: (rendered: unknown) => void = () => {};
    const root = await section("gist-mac", { github: { login: "a" }, claude: null, gestes: { changerGitHub: () => new Promise((r) => (finished = r)) } });
    const [change] = buttons(root);
    change?.click();
    await repos();
    assert.equal(change?.disabled, true);
    assert.equal(below(row(root, "github")).map((e) => e.textContent).join(), IN_PROGRESS);
    finished({ refus: "GitHub sign-in could not be started" });
    await repos();
    assert.equal(change?.disabled, false);
    assert.equal(below(row(root, "github"))[0]?.dataset.ligne, "erreur");
    assert.match(row(root, "github").textContent, /GitHub sign-in could not be started/);
    assert.ok(!root.descendants().some((e) => e.className === "par-pr"), "réglages de la machine : aucune ligne de PR");
  });

  test("sur une autre station : les deux se lisent, aucun geste, une note dit que le changement se fait sur cette machine", async () => {
    const root = await section("gist-pc", {
      github: { login: "benomite" },
      claude: { etat: "connectee", depuis: "2026-11-03T08:00:00Z" },
      gestes: { changerGitHub: async () => {}, renouveler: async () => {} },
    });
    assert.deepEqual(buttons(root), []);
    assert.match(root.textContent, /benomite/);
    assert.match(root.textContent, /since 2026-11-03/);
    assert.match(root.textContent, new RegExp(ELSEWHERE(STATION.nom).replace("/", "\\/")));
    assert.equal(row(root, "claude").descendants().find((e) => e.className === "niveau")?.dataset.niveau, "machine");
  });

  test("une station qui ne dit pas sa connexion : « not said », sans date", () => {
    const root = setSection(doc, { station: STATION, ici: true, lectureSeule: false, niveau: () => new Fake("span"), connexions: { claude: null } }) as Fake;
    assert.match(row(root, "claude").textContent, /not said/);
  });
});
