// L'écran « since you were away » dans la vue entière (#3305) : posé avant tout autre écran quand la dernière ouverture date
// de plus de trois jours, avec les résumés lus ; refermé par son bouton unique sur l'accueil quand rien n'attend le chef ;
// et à la réouverture suivante, avec le même stockage, il ne revient pas. Au premier lancement, il n'existe pas.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { resumeDeLaSemaine } from "../../../runtime/src/resume-hebdomadaire/resume.ts";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import type { ResumesOfProject } from "../../src/vue/resume-weekly/resume-kitchen.ts";
import { KEY_OF_THE_LAST_OPENING, CLOSE } from "../../src/vue/absence/absence.js";
import { FakeStorage, playTheVue, repos } from "../helpers/false-vue.ts";

const PROJECT: Project = { nom: "parade", dossier: "/tmp/parade" };
const WEEK = resumeDeLaSemaine({
  project: "parade",
  weekStart: new Date(Date.now() - 9 * 24 * 3600_000).toISOString().slice(0, 10),
  weekEnd: new Date(Date.now() - 3 * 24 * 3600_000).toISOString().slice(0, 10),
  servis: [{ number: 12, title: "Show the rail age on the tile", url: "https://github.com/chef/parade/issues/12", labels: [], epic: null }],
  attentes: [],
});
const READ: ResumesOfProject = { projet: "parade", jour: { jour: "monday", pose: false }, resumes: { resumes: [WEEK], illisibles: [] } };
const open = (storage: FakeStorage) =>
  playTheVue(
    {
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
      lireLesResumesHebdomadaires: () => READ,
    },
    { stockage: storage },
  );

describe("l'écran « since you were away » dans la vue (#3305)", () => {
  test("cinq jours d'absence : l'écran est posé d'abord, son bouton le ferme ; la réouverture ne le remontre pas", async () => {
    const storage = new FakeStorage();
    storage.setItem(KEY_OF_THE_LAST_OPENING, new Date(Date.now() - 5 * 24 * 3600_000).toISOString());
    const vue = await open(storage);
    await repos();
    const screen = vue.element("absence");
    assert.equal(screen.hidden, false);
    assert.match(screen.textContent, /Since you were away/);
    assert.match(screen.textContent, /Nothing is waiting for you/);
    const action = screen.dessous("button").find(({ textContent }) => textContent === CLOSE);
    assert.ok(action !== undefined, "un seul bouton, qui ferme quand rien n'attend");
    action.click();
    assert.equal(vue.element("absence").hidden, true);
    assert.ok(Date.now() - Date.parse(storage.getItem(KEY_OF_THE_LAST_OPENING) ?? "") < 60_000, "la date d'ouverture est celle d'aujourd'hui");
    const reopened = await open(storage);
    await repos();
    assert.equal(reopened.element("absence").hidden, true);
  });

  test("premier lancement : pas d'écran, la date est posée", async () => {
    const storage = new FakeStorage();
    const vue = await open(storage);
    await repos();
    assert.equal(vue.element("absence").hidden, true);
    assert.notEqual(storage.getItem(KEY_OF_THE_LAST_OPENING), null);
  });
});
