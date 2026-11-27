// La page des résumés hebdomadaires (#3263) : un résumé par projet, ses thèmes en intertitres et chaque ligne le lien de
// son ticket ; l'autonomie quand elle a été comptée, puis ce qui attend le chef, dans cet ordre ; le jour du résumé, lundi
// sans réglage, et un autre jour choisi qui se propose ; « Publish as release notes », qui demande un tag puis publie une
// fois. Les résumés sont ceux qu'écrit le runtime (runtime/src/resume-hebdomadaire/resume.ts), joués devant un faux
// document ; puis la vue entière, la page ouverte par sa ligne parmi celles de tous les projets.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { JOURS_DU_RESUME } from "../../../runtime/src/resume-hebdomadaire/jour.ts";
import { resumeDeLaSemaine, TITRE_ATTENTE, TITRE_AUTONOMIE } from "../../../runtime/src/resume-hebdomadaire/resume.ts";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import type { RenderedOfThePublication, RenderedOfDay, ResumeWeekly, ResumesOfProject } from "../../src/vue/resume-weekly/resume-kitchen.ts";
import { WAIT, AUTONOMY, SEND, DAYS, PUBLISH, TAG, holdTheResumesWeekly } from "../../src/vue/resume-weekly/resume-weekly.js";
import { Fake, playTheVue, openRead, repos } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const url = (repository: string, n: number) => `https://github.com/${repository}/issues/${n}`;

// « parade » : deux épiques et une correction, ses chiffres d'autonomie comptés, une carte qui attend le chef.
const PARADE = resumeDeLaSemaine({
  project: "parade",
  weekStart: "2026-11-02",
  weekEnd: "2026-11-08",
  servis: [
    { number: 12, title: "feat(#12): show the rail age on the tile", url: url("chef/parade", 12), labels: [], epic: { number: 3, title: "The rail at a glance" } },
    { number: 14, title: "Keep the tile colours", url: url("chef/parade", 14), labels: [], epic: { number: 3, title: "The rail at a glance" } },
    { number: 15, title: "fix: the log no longer stops at 200 events", url: url("chef/parade", 15), labels: ["bug"], epic: null },
  ],
  autonomie: { tickets: 3, sansHumain: 2, partSansHumain: 2 / 3, delaiMedianMs: 5 * 3600_000, renvoyes: 1, partRenvoyee: 1 / 3, avecHumain: [] } as never,
  attentes: [{ ticket: 21, ligne: "Keep or drop the old route?", url: url("chef/parade", 21) }],
});
// « cantine » : sans chiffres d'autonomie, rien n'attend le chef.
const CANTINE = resumeDeLaSemaine({
  project: "cantine",
  weekStart: "2026-11-02",
  weekEnd: "2026-11-08",
  servis: [{ number: 6, title: "Menu of the week", url: url("chef/cantine", 6), labels: [], epic: null }],
  attentes: [],
});
const READ: Record<string, ResumesOfProject> = {
  parade: { projet: "parade", jour: { jour: "monday", pose: false }, resumes: { resumes: [PARADE], illisibles: [] } },
  cantine: { projet: "cantine", jour: { jour: "monday", pose: false }, resumes: { resumes: [CANTINE], illisibles: [] } },
};

type Options = { changerJour?: (project: string, day: string) => Promise<RenderedOfDay>; publier?: (project: string, resume: ResumeWeekly, tag: string) => Promise<RenderedOfThePublication> };
function hold({ changerJour: changeDay = async () => ({ fait: "unchanged" }), publier: publish = async () => ({ refus: "not here" }) }: Options = {}) {
  const openOnes: string[] = [];
  const held = holdTheResumesWeekly(doc, { lire: async (project) => READ[project] as ResumesOfProject, changerJour: changeDay, publier: publish, ouvrir: (address) => openOnes.push(address) });
  return { ouverts: openOnes, poser: (projects: string[]) => held.poser(projects) as Fake };
}
const ofProject = (block: Fake, project: string) => block.dessous("section").find(({ dataset }) => dataset.projet === project) as Fake;
const subheadings = (section: Fake) => section.dessous("h4").map(({ textContent }) => textContent);
const buttonNamed = (block: Fake, wording: string) => block.dessous("button").find(({ textContent }) => textContent === wording);

describe("la page des résumés hebdomadaires (#3263)", () => {
  test("ses jours et ses titres sont ceux du runtime", () => {
    assert.deepEqual([...DAYS], [...JOURS_DU_RESUME]);
    assert.equal(WAIT, TITRE_ATTENTE);
    assert.equal(AUTONOMY, TITRE_AUTONOMIE);
  });

  test("deux projets : un résumé chacun, ses thèmes en intertitres, chaque ligne le lien de son ticket", async () => {
    const { ouverts: openOnes, poser: set } = hold();
    const block = set(["parade", "cantine"]);
    assert.match(block.textContent, /Reading the weekly summaries/);
    await repos();
    const parade = ofProject(block, "parade");
    const cantine = ofProject(block, "cantine");
    assert.equal(parade.dessous("article").length, 1);
    assert.equal(cantine.dessous("article").length, 1);
    assert.match(parade.textContent, /Week of 2026-11-02 to 2026-11-08/);
    assert.deepEqual(subheadings(parade).slice(0, 2), ["The rail at a glance", "Fixes"]);
    assert.deepEqual(subheadings(cantine)[0], "Improvements");
    const lines = parade.dessous("ul").find(({ className }) => className === "lignes")?.dessous("li") ?? [];
    assert.deepEqual(
      lines.map((li) => li.textContent),
      ["Show the rail age on the tile#12", "Keep the tile colours#14"],
    );
    for (const [rank, number] of [12, 14].entries()) {
      lines[rank]?.dessous("button")[0]?.click();
      assert.equal(openOnes.at(-1), url("chef/parade", number));
    }
    // Ce qui attend le chef, de même.
    parade.dessous("button").find(({ dataset }) => dataset.ticket === "21")?.click();
    assert.equal(openOnes.at(-1), url("chef/parade", 21));
  });

  test("sans chiffres d'autonomie, pas de section ; avec, l'autonomie puis ce qui attend le chef, en dernier", async () => {
    const { poser: set } = hold();
    const block = set(["parade", "cantine"]);
    await repos();
    const cantine = subheadings(ofProject(block, "cantine"));
    assert.ok(!cantine.includes(AUTONOMY));
    assert.equal(cantine.at(-1), WAIT);
    assert.match(ofProject(block, "cantine").textContent, /Nothing is waiting for you\./);
    const parade = subheadings(ofProject(block, "parade"));
    assert.deepEqual(parade.slice(-2), [AUTONOMY, WAIT]);
    const autonomy = ofProject(block, "parade").dessous("ul").find(({ className }) => className === "autonomie");
    assert.deepEqual(
      autonomy?.dessous("li").map(({ textContent }) => textContent),
      ["served without a human2 of 3 (67 %)", "lead time5 h (median)", "send-back rate1 of 3 (33 %)"],
    );
  });

  test("le jour dit lundi sans réglage ; jeudi choisi propose weeklySummaryDay = thursday, et la PR se dit", async () => {
    const requests: [string, string][] = [];
    const { poser: set } = hold({ changerJour: async (project, day) => (requests.push([project, day]), { pr: "https://github.com/chef/parade/pull/40", numero: 40, jour: "thursday" }) });
    const block = set(["parade"]);
    await repos();
    const list = block.dessous("select")[0] as Fake;
    assert.equal(list.value, "monday");
    const row = block.dessous("div").find(({ className }) => className.includes("jour-du-resume")) as Fake;
    assert.match(row.textContent, /Monday \(default\)/);
    list.value = "thursday";
    list.declencher("change");
    assert.match(block.textContent, /proposing…/);
    await repos();
    assert.deepEqual(requests, [["parade", "thursday"]]);
    assert.match(block.textContent, /Thursday proposed in.*pull request #40/);
  });

  test("un jour qui ne se lit pas ne vaut pas lundi : la ligne le dit, la liste ne choisit rien", async () => {
    const held = holdTheResumesWeekly(doc, {
      lire: async () => ({ projet: "parade", jour: { sans: "summary day unavailable", detail: "HTTP 500" }, resumes: { sans: "weekly summaries unavailable: the summary day was not read" } }),
      changerJour: async () => ({ fait: "" }),
      publier: async () => ({ refus: "" }),
      ouvrir: () => undefined,
    });
    const block = held.poser(["parade"]) as Fake;
    await repos();
    assert.equal((block.dessous("select")[0] as Fake).value, "");
    assert.match(block.textContent, /summary day unavailable/);
    assert.doesNotMatch(block.textContent, /Monday \(default\)/);
  });

  // La publication, jusqu'à ce que le faux geste rende `rendu`. Rend le bloc, et les appels du geste.
  async function publish(rendered: RenderedOfThePublication) {
    const calls: [string, ResumeWeekly, string][] = [];
    const { poser: set } = hold({ publier: async (project, resume, tag) => (calls.push([project, resume, tag]), rendered) });
    const block = set(["parade"]);
    await repos();
    buttonNamed(block, PUBLISH)?.click();
    const field = block.dessous("input").find(({ ariaLabel }) => ariaLabel === TAG) as Fake;
    assert.ok(field !== undefined, "le tag est demandé");
    assert.equal(calls.length, 0);
    field.value = "v1.4.0";
    field.declencher("input");
    buttonNamed(block, SEND)?.click();
    assert.match(block.textContent, /Publishing…/);
    await repos();
    return { bloc: block, appels: calls };
  }

  test("« Publish as release notes » demande un tag, publie une fois le markdown du résumé, puis dit la release", async () => {
    const { bloc: block, appels: calls } = await publish({ publiee: "published as the release notes of v1.4.0", url: "https://github.com/chef/parade/releases/tag/v1.4.0" });
    assert.equal(calls.length, 1);
    const [project, resume, tag] = calls[0] as [string, ResumeWeekly, string];
    assert.deepEqual([project, tag, resume.markdown], ["parade", "v1.4.0", PARADE.markdown]);
    const said = block.dessous("p").find(({ className }) => className === "publiee");
    assert.match(said?.textContent ?? "", /published as the release notes of v1\.4\.0/);
    assert.ok(buttonNamed(block, "open the release") !== undefined);
    assert.equal(buttonNamed(block, PUBLISH), undefined);
  });

  test("déjà publiée : la phrase le dit, pas de succès", async () => {
    const { bloc: block, appels: calls } = await publish({ dejaPubliee: "v1.4.0 already has its release notes — nothing was changed", url: "https://github.com/chef/parade/releases/tag/v1.4.0" });
    assert.equal(calls.length, 1);
    assert.equal(block.dessous("p").find(({ className }) => className === "publiee"), undefined);
    assert.match(block.dessous("p").find(({ className }) => className === "deja-publiee")?.textContent ?? "", /already has its release notes/);
  });

  test("refusée : la phrase du refus, son détail au survol, et le bouton pour réessayer", async () => {
    const { bloc: block, appels: calls } = await publish({ refus: "The tag v1.4.0 does not exist on the repository: nothing was published.", detail: "$ node … release-notes v1.4.0" });
    assert.equal(calls.length, 1);
    const refusal = block.dessous("p").find(({ className }) => className === "refus");
    assert.match(refusal?.textContent ?? "", /does not exist on the repository/);
    assert.equal(block.dessous("p").find(({ className }) => className === "publiee"), undefined);
    assert.ok(buttonNamed(block, PUBLISH) !== undefined);
  });

  test("un geste qui lève se dit comme un refus", async () => {
    const { poser: set } = hold({ publier: async () => Promise.reject(new Error("the bridge broke")) });
    const block = set(["parade"]);
    await repos();
    buttonNamed(block, PUBLISH)?.click();
    const field = block.dessous("input")[0] as Fake;
    field.value = "v2";
    field.declencher("keydown", { key: "Enter" });
    await repos();
    assert.match(block.dessous("p").find(({ className }) => className === "refus")?.textContent ?? "", /nothing was published/);
  });
});

describe("la page des résumés dans la vue (#3263)", () => {
  const PROJECT: Project = { nom: "parade", dossier: "/tmp/parade" };

  test("la ligne « Weekly summary » de tous les projets ouvre la page, qui lit chaque projet", async () => {
    const readOnes: string[] = [];
    const vue = await playTheVue({
      demarrage: () => ({
        configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PROJECT] }, () => true),
        palette: PALETTE,
        exemple: EXAMPLE,
        onglets: TABS,
        rubriques: HEADINGS,
        gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
        banniere: BANNER,
        calibrage: { modeles: MODELS, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
      lireLesResumesHebdomadaires: (project) => (readOnes.push(project), READ.parade as ResumesOfProject),
    });
    vue.element("projets").children[1]?.click();
    await repos();
    await openRead(vue, "Settings");
    const line = vue.element("de-tous-les-projets").dessous("button").find(({ ariaLabel }) => ariaLabel === "the weekly summaries of all projects");
    assert.ok(line !== undefined, "la ligne est parmi celles de tous les projets");
    line.click();
    await repos();
    const page = vue.element("resumes");
    assert.deepEqual(readOnes, ["parade"]);
    assert.match(page.textContent, /Weekly summary/);
    assert.deepEqual(subheadings(page), ["The rail at a glance", "Fixes", AUTONOMY, WAIT]);
  });
});
