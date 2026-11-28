// The project view has an Agents tab (#4224), which shows the agents at work the bridge reads (#4569): the main process answers `agentsAtWork`
// from GitHub and the station (team-of-the-box.ts). The tab is a title of the menu `onglets-du-projet`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";

import { HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { playTheVue, repos, type Fake, type Played, type Answers } from "../helpers/false-vue.ts";

const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  rubriques: HEADINGS,
  gestes: {},
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  });

// The bridge's `agentsAtWork`, which the main process answers from GitHub and the station (team-of-the-box.ts): what it says.
const reading = (agents: unknown[] = [{ agent: "cook", ticket: 41, since: "2026-10-01T00:00:00.000Z", station: "box" }]) => ({ agents });

async function open(answers: Partial<Answers> = {}): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }], ...answers } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
const tabAgents = (vue: Played): Fake => vue.element("onglets-du-projet").children.find((pose) => pose.textContent.trim() === "Agents") ?? assert.fail("pas d'onglet Agents");
async function openAgents(vue: Played): Promise<void> {
  tabAgents(vue).click();
  for (let i = 0; i < 4; i++) await repos();
}

const visible = (node: Fake): boolean => {
  for (let pose: Fake | null = node; pose !== null; pose = pose.parentElement) if (pose.hidden) return false;
  return true;
};
const shows = (node: Fake): string => (node.hidden ? "" : [...node.descendants()].some((threads) => threads.hidden) ? node.children.map(shows).join(" ") : node.textContent);
const textShows = (vue: Played): string =>
  vue
    .poses()
    .filter((pose) => pose.parentElement === null && !pose.hidden)
    .map(shows)
    .join("\n");

// #4224, critère 1 : la vue du projet a un onglet Agents, à côté de Rail, Stations et Settings.
test("the project view has an Agents tab next to Rail, Stations and Settings, and it shows the agents at work the bridge reads", async () => {
  const asked: string[] = [];
  const vue = await open({ agentsAtWork: async (project: string) => (asked.push(project), reading()) } as never);
  const titles = vue.element("onglets-du-projet").children.map((pose) => pose.textContent.trim());
  for (const title of ["Rail", "Stations", "Settings", "Agents"]) assert.ok(titles.includes(title), `l'onglet « ${title} » est dans le menu`);
  const place = titles.indexOf("Agents");
  const neighbors = ["Rail", "Stations", "Settings"].map((title) => titles.indexOf(title));
  assert.ok(Math.abs(place - Math.min(...neighbors)) <= 3 && Math.abs(place - Math.max(...neighbors)) <= 3, "à côté des trois autres, dans le même menu");
  tabAgents(vue).click();
  for (let i = 0; i < 4; i++) await repos();
  assert.deepEqual(asked, ["parade"]);
  assert.match(textShows(vue), /cook · #41 · since .* · on box/);
});
