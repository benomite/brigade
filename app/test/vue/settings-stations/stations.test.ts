// Les stations contributrices du projet sous Settings (#2936) : chaque station qui a pris un ticket, avec « Refuse » — et
// « Accept again » une fois refusée. Le geste part tout de suite, sans « Save » ; un refus du service se dit en une ligne sur la
// rangée de la station, qui reste ce qu'elle était. La vue est jouée telle qu'elle est, devant un faux document
// (helpers/false-vue.ts), le service derrière le faux pont.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { POWER_UP } from "../../../src/power-up.ts";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { BANNER } from "../../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../../src/actions.ts";
import { TABS, HEADINGS } from "../../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../../src/projects/projects.ts";
import { WORDS, renderedRead, serviceOfBridge, type Station } from "../../../src/vue/settings-stations/stations.js";
import { type Fake, type Played, playTheVue, type Answers, repos } from "../../helpers/false-vue.ts";

const PARADE = "parade";
const STATIONS: Station[] = [
  { station: "bob-pc/claude", login: "bob", refused: false },
  { station: "carol-mac/claude", login: "carol", refused: true },
];
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});

async function open(answers: Answers = {}) {
  const vue = await playTheVue({
    demarrage: startup,
    espace: () => [],
    listerLesStationsContributrices: () => structuredClone(STATIONS),
    refuserUneStationContributrice: () => ({ ok: true }),
    accepterUneStationContributrice: () => ({ ok: true }),
    ...answers,
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  return vue;
}

const section = (vue: Played) => vue.element("stations-contributrices").children[0] ?? assert.fail("pas de bloc des stations");
const rows = (vue: Played) => section(vue).children.filter((pose) => pose.className.split(" ").includes("station-contributrice"));
const row = (vue: Played, station: string) => rows(vue).find((pose) => pose.dataset.station === station) ?? assert.fail(`pas de rangée ${station}`);
const buttons = (pose: Fake) => pose.dessous("button").map((taken) => taken.textContent);
const button = (pose: Fake, wording: string) => pose.dessous("button").find((taken) => taken.textContent === wording) ?? assert.fail(`pas de « ${wording} »`);
const refusal = (pose: Fake) => pose.dessous("p").find((p) => p.className === "refus");

describe("Settings : les stations contributrices du projet", () => {
  test("chaque station est une rangée : « Refuse » tant qu'elle est acceptée, « Accept again » une fois refusée", async () => {
    const vue = await open();
    assert.deepEqual(vue.appels.filter(({ geste: action }) => action === "listerLesStationsContributrices").map(({ args }) => args), [[PARADE]]);
    assert.equal(vue.element("stations-contributrices").hidden, false);
    assert.deepEqual(rows(vue).map((pose) => pose.dataset.station), ["bob-pc/claude", "carol-mac/claude"]);
    assert.deepEqual(buttons(row(vue, "bob-pc/claude")), [WORDS.refuser]);
    assert.deepEqual(buttons(row(vue, "carol-mac/claude")), [WORDS.reaccepter]);
    assert.ok(row(vue, "carol-mac/claude").className.includes("refusee"));
    assert.ok(!row(vue, "bob-pc/claude").className.includes("refusee"));
  });

  test("chaque station est la rangée de réglage de l'app (components/setting, #2920) : son nom, son compte et son état, son geste", async () => {
    const vue = await open();
    const carol = row(vue, "carol-mac/claude");
    assert.equal(carol.className.split(" ")[0], "reglage");
    assert.deepEqual(
      carol.children.map((pose) => [pose.className, pose.textContent]),
      [
        ["nom mono", "carol-mac/claude"],
        ["valeur", "@carolrefused"],
        ["champ", WORDS.reaccepter],
      ],
    );
  });

  test("« Refuse » part tout de suite, sans « Save », et la rangée devient refusée ; « Accept again » la rend", async () => {
    const vue = await open();
    button(row(vue, "bob-pc/claude"), WORDS.refuser).click();
    await repos();
    assert.deepEqual(vue.appels.filter(({ geste: action }) => action === "refuserUneStationContributrice").map(({ args }) => args), [[PARADE, "bob-pc/claude"]]);
    assert.deepEqual(buttons(row(vue, "bob-pc/claude")), [WORDS.reaccepter]);
    button(row(vue, "bob-pc/claude"), WORDS.reaccepter).click();
    await repos();
    assert.deepEqual(vue.appels.filter(({ geste: action }) => action === "accepterUneStationContributrice").map(({ args }) => args), [[PARADE, "bob-pc/claude"]]);
    assert.deepEqual(buttons(row(vue, "bob-pc/claude")), [WORDS.refuser]);
    assert.ok(!buttons(section(vue)).includes("Save"));
  });

  test("un refus du service se dit en une ligne sur la rangée de la station, qui reste ce qu'elle était", async () => {
    const vue = await open({ refuserUneStationContributrice: () => ({ refus: "only the chef may refuse or accept a contributor station (role: review)" }) });
    button(row(vue, "bob-pc/claude"), WORDS.refuser).click();
    await repos();
    assert.match(refusal(row(vue, "bob-pc/claude"))?.textContent ?? "", /only the chef may refuse or accept/);
    assert.deepEqual(buttons(row(vue, "bob-pc/claude")), [WORDS.refuser]);
    assert.equal(refusal(row(vue, "carol-mac/claude")), undefined);
  });

  test("sans station contributrice, une ligne le dit ; une lecture qui échoue se dit en une ligne ; le pont sans le bloc ne le pose pas", async () => {
    assert.equal(section(await open({ listerLesStationsContributrices: () => [] })).dessous("p").find((p) => p.className === "aucune")?.textContent, WORDS.vide);
    const refused = await open({ listerLesStationsContributrices: () => Promise.reject(new Error("gh: HTTP 502")) as unknown as Station[] });
    assert.equal(section(refused).dessous("p").find((p) => p.className === "indisponible")?.dessous("span")[0]?.textContent, WORDS.indisponible);
    const without = await open({ listerLesStationsContributrices: () => ({ sans: "parade has no station: its contributor stations are read where its kitchen runs" }) as unknown as Station[] });
    assert.match(section(without).textContent, /has no station/);
    const silent = await open({ listerLesStationsContributrices: () => undefined as unknown as Station[] });
    assert.equal(silent.element("stations-contributrices").hidden, true);
  });

  test("le service du pont refuse en une ligne quand le pont ne porte pas le geste ; une réponse qui n'est pas « ok » est un refus", async () => {
    assert.deepEqual(await serviceOfBridge({}, PARADE).refuse("x"), { refus: WORDS.rienEnvoye });
    assert.equal(await serviceOfBridge({}, PARADE).list(), undefined);
    assert.deepEqual(renderedRead({ ok: true }), { ok: true });
    assert.deepEqual(renderedRead(undefined), { refus: WORDS.rienEnvoye, detail: "" });
    assert.deepEqual(renderedRead({ pr: "https://x" }), { refus: WORDS.rienEnvoye, detail: '{"pr":"https://x"}' });
  });
});
