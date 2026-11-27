// Les chiffres du closer que la vue du projet montrait, retirés par #4224 — l'onglet Agents les remplace : une passe mergée
// de Settings ne dit plus les lignes que sa PR a retirées et ajoutées, et la page du rapport ajouté / retiré de tous les
// projets n'est plus : sa lecture (`closing --json` sur la box de chaque projet) ne part plus, et une fenêtre rechargée
// sur elle ne la rouvre pas.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { PassRead } from "../../src/closer-health.ts";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { commandsOf, TABS, projectsRead, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { whatItARemoved } from "../../src/vue/project/banner-health/Closer.js";
import { FakeStorage, playTheVue, repos } from "../helpers/false-vue.ts";

const pass = (pr: PassRead["pr"]): PassRead => ({ numero: 2477, url: "https://github.com/chef/parade/issues/2477", ouverteLe: "2026-10-08T08:00:00.000Z", ouverte: false, sha: "", candidats: [], restants: 0, derive: [], temps: [], pr });

test("a merged closing pass says its PR merged, without the lines it removed or added", () => {
  assert.deepEqual(whatItARemoved(pass({ numero: 2480, url: "https://github.com/chef/parade/pull/2480", mergee: true, retirees: 1234, ajoutees: 56 })), { retire: true, dit: "its PR merged", precise: "" });
});

test("the added / removed ratio page is gone: `ratios` reads no box and launches no command", () => {
  const projects = [{ nom: "parade", servi: true }, { nom: "ici", ici: true }, { nom: "local" }];
  assert.deepEqual(commandsOf("ratios"), []);
  assert.deepEqual(projectsRead(undefined, projects), []);
});

const reloadedOn = async (page: string) => {
  const session = new FakeStorage();
  session.setItem("brigade.ecran", JSON.stringify({ page }));
  const startup = () => ({
    configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
    palette: PALETTE,
    exemple: EXAMPLE,
    onglets: TABS,
    rubriques: HEADINGS,
    gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
    banniere: BANNER,
    calibrage: { modeles: MODELS, efforts: EFFORTS },
    code: undefined,
  });
  const vue = await playTheVue({ demarrage: startup, espace: () => [] } as never, { session });
  await repos();
  return vue.appels;
};

test("a window reloaded on the ratio page opens on the home, and reads no ratio; reloaded on the autonomy page of all projects, it still reopens it", async () => {
  assert.deepEqual((await reloadedOn("ratios")).filter(({ geste: action, args }) => action === "onglet" && args[1] === "ratios"), [], "aucune lecture de la page des ratios");
  assert.notEqual((await reloadedOn("couts")).filter(({ geste: action }) => action === "lireAutonomie").length, 0, "la page des chiffres d'autonomie de tous les projets, elle, se rouvre et se lit");
});
