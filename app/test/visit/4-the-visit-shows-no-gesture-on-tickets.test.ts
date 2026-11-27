// Acceptance test (#4087). Criterion 4: in the visit, no gesture acting on tickets is shown, even when the signed-in user
// has write access to benomite/brigade.
import assert from "node:assert/strict";
import { test } from "node:test";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { BANNER } from "../../src/facts.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import type { Opening, StationsOfChef } from "../../src/first-launch.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { Fake, FakeStorage, playTheVue, type Played, repos } from "../helpers/false-vue.ts";

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
const buttons = (vue: Played): Fake[] => vue.poses().filter((p) => p.balise === "button" || p.role === "button");
const wording = (p: Fake) => `${p.textContent} ${p.title} ${p.ariaLabel}`.trim();
const finds = (vue: Played, motive: RegExp): Fake | undefined => buttons(vue).find((p) => !p.hidden && motive.test(wording(p)));

// Create, move, comment, close, launch: the gestures that act on tickets, by the words of the app's labels and gestures.
const ACTION_ON_TICKET = /\b(create|new ticket|move|comment|close|launch|approve|merge)\b/i;
const CALL_WRITTEN = /creer|deplacer|commenter|fermer|lancer|poster|approuver/i;

test("the visit shows no gesture that acts on tickets, with a user who can write to benomite/brigade", async () => {
  const writer = { login: "maintainer", permission: "admin" } as unknown as { login: string };
  const vue = await playTheVue({ demarrage: () => startup([]), stationsDuChef: () => NO, compteGitHub: () => writer, ouvrirDUneStation: () => OPEN, espace: () => [] }, { stockage: new FakeStorage() });
  await repos();
  (finds(vue, /visit a real kitchen/i) ?? assert.fail("no 'visit a real kitchen' choice")).click();
  await repos();
  for (let not = 1; not <= 6; not++) {
    assert.equal(vue.element("visite").hidden, false, `step ${not}: the tour is on`);
    const actions = buttons(vue).filter((p) => !p.hidden && ACTION_ON_TICKET.test(wording(p)));
    assert.deepEqual(actions.map(wording), [], `step ${not}: a gesture on tickets is shown`);
    assert.deepEqual(vue.appels.filter(({ geste: action }) => CALL_WRITTEN.test(action)), [], `step ${not}: a writing call was made`);
    const next = finds(vue, /^next$/i);
    if (next === undefined) break;
    next.click();
    await repos();
  }
});
