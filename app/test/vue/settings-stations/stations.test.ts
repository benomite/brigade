// Les stations contributrices du projet sous Settings (#2936) : chaque station qui a pris un ticket, avec « Refuse » — et
// « Accept again » une fois refusée. Le geste part tout de suite, sans « Save » ; un refus du service se dit en une ligne sur la
// rangée de la station, qui reste ce qu'elle était. La vue est jouée telle qu'elle est, devant un faux document
// (aides/fausse-vue.ts), le service derrière le faux pont.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBar } from "../../../src/bar.ts";
import { EXEMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { BANNIERE } from "../../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projects/projects.ts";
import { MOTS, renduLu, serviceDuPont, type Station } from "../../../src/vue/settings-stations/stations.js";
import { type Faux, type Jouee, jouerLaVue, type Answers, repos } from "../../aides/fausse-vue.ts";

const PARADE = "parade";
const STATIONS: Station[] = [
  { station: "bob-pc/claude", login: "bob", refused: false },
  { station: "carol-mac/claude", login: "carol", refused: true },
];
const demarrage = () => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

async function ouvrir(answers: Answers = {}) {
  const vue = await jouerLaVue({
    demarrage,
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

const section = (vue: Jouee) => vue.element("stations-contributrices").children[0] ?? assert.fail("pas de bloc des stations");
const rangees = (vue: Jouee) => section(vue).children.filter((pose) => pose.className.split(" ").includes("station-contributrice"));
const rangee = (vue: Jouee, station: string) => rangees(vue).find((pose) => pose.dataset.station === station) ?? assert.fail(`pas de rangée ${station}`);
const boutons = (pose: Faux) => pose.dessous("button").map((taken) => taken.textContent);
const button = (pose: Faux, libelle: string) => pose.dessous("button").find((taken) => taken.textContent === libelle) ?? assert.fail(`pas de « ${libelle} »`);
const refusal = (pose: Faux) => pose.dessous("p").find((p) => p.className === "refus");

describe("Settings : les stations contributrices du projet", () => {
  test("chaque station est une rangée : « Refuse » tant qu'elle est acceptée, « Accept again » une fois refusée", async () => {
    const vue = await ouvrir();
    assert.deepEqual(vue.appels.filter(({ geste: action }) => action === "listerLesStationsContributrices").map(({ args }) => args), [[PARADE]]);
    assert.equal(vue.element("stations-contributrices").hidden, false);
    assert.deepEqual(rangees(vue).map((pose) => pose.dataset.station), ["bob-pc/claude", "carol-mac/claude"]);
    assert.deepEqual(boutons(rangee(vue, "bob-pc/claude")), [MOTS.refuser]);
    assert.deepEqual(boutons(rangee(vue, "carol-mac/claude")), [MOTS.reaccepter]);
    assert.ok(rangee(vue, "carol-mac/claude").className.includes("refusee"));
    assert.ok(!rangee(vue, "bob-pc/claude").className.includes("refusee"));
  });

  test("chaque station est la rangée de réglage de l'app (composants/setting, #2920) : son nom, son compte et son état, son geste", async () => {
    const vue = await ouvrir();
    const carol = rangee(vue, "carol-mac/claude");
    assert.equal(carol.className.split(" ")[0], "reglage");
    assert.deepEqual(
      carol.children.map((pose) => [pose.className, pose.textContent]),
      [
        ["nom mono", "carol-mac/claude"],
        ["valeur", "@carolrefused"],
        ["champ", MOTS.reaccepter],
      ],
    );
  });

  test("« Refuse » part tout de suite, sans « Save », et la rangée devient refusée ; « Accept again » la rend", async () => {
    const vue = await ouvrir();
    button(rangee(vue, "bob-pc/claude"), MOTS.refuser).click();
    await repos();
    assert.deepEqual(vue.appels.filter(({ geste: action }) => action === "refuserUneStationContributrice").map(({ args }) => args), [[PARADE, "bob-pc/claude"]]);
    assert.deepEqual(boutons(rangee(vue, "bob-pc/claude")), [MOTS.reaccepter]);
    button(rangee(vue, "bob-pc/claude"), MOTS.reaccepter).click();
    await repos();
    assert.deepEqual(vue.appels.filter(({ geste: action }) => action === "accepterUneStationContributrice").map(({ args }) => args), [[PARADE, "bob-pc/claude"]]);
    assert.deepEqual(boutons(rangee(vue, "bob-pc/claude")), [MOTS.refuser]);
    assert.ok(!boutons(section(vue)).includes("Save"));
  });

  test("un refus du service se dit en une ligne sur la rangée de la station, qui reste ce qu'elle était", async () => {
    const vue = await ouvrir({ refuserUneStationContributrice: () => ({ refus: "only the chef may refuse or accept a contributor station (role: review)" }) });
    button(rangee(vue, "bob-pc/claude"), MOTS.refuser).click();
    await repos();
    assert.match(refusal(rangee(vue, "bob-pc/claude"))?.textContent ?? "", /only the chef may refuse or accept/);
    assert.deepEqual(boutons(rangee(vue, "bob-pc/claude")), [MOTS.refuser]);
    assert.equal(refusal(rangee(vue, "carol-mac/claude")), undefined);
  });

  test("sans station contributrice, une ligne le dit ; une lecture qui échoue se dit en une ligne ; le pont sans le bloc ne le pose pas", async () => {
    assert.equal(section(await ouvrir({ listerLesStationsContributrices: () => [] })).dessous("p").find((p) => p.className === "aucune")?.textContent, MOTS.vide);
    const refusee = await ouvrir({ listerLesStationsContributrices: () => Promise.reject(new Error("gh: HTTP 502")) as unknown as Station[] });
    assert.equal(section(refusee).dessous("p").find((p) => p.className === "indisponible")?.dessous("span")[0]?.textContent, MOTS.indisponible);
    const sans = await ouvrir({ listerLesStationsContributrices: () => ({ sans: "parade has no station: its contributor stations are read where its kitchen runs" }) as unknown as Station[] });
    assert.match(section(sans).textContent, /has no station/);
    const muet = await ouvrir({ listerLesStationsContributrices: () => undefined as unknown as Station[] });
    assert.equal(muet.element("stations-contributrices").hidden, true);
  });

  test("le service du pont refuse en une ligne quand le pont ne porte pas le geste ; une réponse qui n'est pas « ok » est un refus", async () => {
    assert.deepEqual(await serviceDuPont({}, PARADE).refuse("x"), { refus: MOTS.rienEnvoye });
    assert.equal(await serviceDuPont({}, PARADE).list(), undefined);
    assert.deepEqual(renduLu({ ok: true }), { ok: true });
    assert.deepEqual(renduLu(undefined), { refus: MOTS.rienEnvoye, detail: "" });
    assert.deepEqual(renduLu({ pr: "https://x" }), { refus: MOTS.rienEnvoye, detail: '{"pr":"https://x"}' });
  });
});
