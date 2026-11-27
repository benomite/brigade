// Acceptance test (#4087). Criterion 7: the visit can be replayed later from an entry in the app (settings or help area);
// it starts again, read-only and without clone.
import assert from "node:assert/strict";
import { test } from "node:test";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { BANNER } from "../../src/facts.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import type { Opening, StationsOfChef } from "../../src/first-launch.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { FakeStorage, playTheVue, repos } from "../helpers/false-vue.ts";

const PATH = "/home/chef/.config/brigade/app.json";
const startup = (projects: Project[]) => ({
  configuration: forTheBar({ chemin: PATH, projets: projects }, () => false),
  poste: { nom: "this computer", mac: false },
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});
const NO: StationsOfChef = { state: "listed", unreadable: [], stations: [] };
const OPEN: Opening = { state: "open", project: "brigade", repository: "benomite/brigade", folder: "/home/chef/Brigade/brigade", cloned: true };
const MINE: Project = { nom: "mine", dossier: "/home/chef/Brigade/mine", depot: "chef/mine", base: "main" };

test("an entry in the app replays the visit, read-only and without clone", async () => {
  const storage = new FakeStorage();
  storage.setItem("brigade.visite", JSON.stringify({ montree: "2026-11-10T09:00:00.000Z" }));
  const vue = await playTheVue({ demarrage: () => startup([MINE]), stationsDuChef: () => NO, compteGitHub: () => ({ login: "newcomer" }), ouvrirDUneStation: () => OPEN, espace: () => [] }, { stockage: storage });
  await repos();
  assert.equal(vue.element("visite").hidden, true, "the visit is not on");
  const wording = (p: { textContent: string; title: string; ariaLabel: string }) => `${p.textContent} ${p.title} ${p.ariaLabel}`;
  const entry = vue.poses().find((p) => !p.hidden && /replay the visit/i.test(wording(p))) ?? assert.fail("no entry to replay the visit");
  entry.click();
  await repos();
  assert.equal(vue.element("visite").hidden, false, "the visit starts again");
  assert.match(vue.element("visite").textContent, /Tour of a real kitchen · 1 of 6/);
  assert.deepEqual(vue.appels.filter(({ geste: action }) => /ouvrirDUneStation|clone|ajouter/i.test(action)), [], "no clone, no add");
  const actions = vue.poses().filter((p) => (p.balise === "button" || p.role === "button") && !p.hidden && /^(create|new ticket|move|comment|close|launch)\b/i.test(p.textContent));
  assert.deepEqual(actions.map((p) => p.textContent), [], "no gesture on tickets");
});
