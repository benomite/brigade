// Les chiffres du closer que la vue du projet montrait, retirés par #4224 — l'onglet Agents les remplace : une passe mergée
// de Settings ne dit plus les lignes que sa PR a retirées et ajoutées, et la page du rapport ajouté / retiré de tous les
// projets n'est plus : sa lecture (`closing --json` sur la box de chaque projet) ne part plus, et une fenêtre rechargée
// sur elle ne la rouvre pas.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { PassLue } from "../../src/closer-sante.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { COUTS, commandsDe, ONGLETS, projectsLus, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projects/projects.ts";
import { ceQuElleARetire } from "../../src/vue/project/banner-sante/Closer.js";
import { FauxStockage, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const pass = (pr: PassLue["pr"]): PassLue => ({ numero: 2477, url: "https://github.com/chef/parade/issues/2477", ouverteLe: "2026-10-08T08:00:00.000Z", ouverte: false, sha: "", candidats: [], restants: 0, derive: [], temps: [], pr });

test("a merged closing pass says its PR merged, without the lines it removed or added", () => {
  assert.deepEqual(ceQuElleARetire(pass({ numero: 2480, url: "https://github.com/chef/parade/pull/2480", mergee: true, retirees: 1234, ajoutees: 56 })), { retire: true, dit: "its PR merged", precise: "" });
});

test("the added / removed ratio page is gone: `ratios` reads no box and launches no command; the cost page still reads each served project", () => {
  const projects = [{ nom: "parade", servi: true }, { nom: "ici", ici: true }, { nom: "local" }];
  assert.deepEqual(commandsDe("ratios"), []);
  assert.deepEqual(projectsLus("ratios", undefined, projects), []);
  assert.deepEqual(projectsLus(COUTS, undefined, projects).map(({ nom: name }) => name), ["parade", "ici"]);
});

const rechargeeSur = async (page: string) => {
  const session = new FauxStockage();
  session.setItem("brigade.ecran", JSON.stringify({ page }));
  const demarrage = () => ({
    configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
    palette: PALETTE,
    exemple: EXEMPLE,
    onglets: ONGLETS,
    rubriques: RUBRIQUES,
    gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
    banniere: BANNIERE,
    calibrage: { modeles: MODELES, efforts: EFFORTS },
    code: undefined,
  });
  const vue = await jouerLaVue({ demarrage, espace: () => [] } as never, { session });
  await repos();
  return vue.appels.filter(({ geste: action, args }) => action === "onglet" && args[1] === page);
};

test("a window reloaded on the ratio page opens on the home, and reads no ratio; reloaded on the cost page, it still reopens it", async () => {
  assert.deepEqual(await rechargeeSur("ratios"), [], "aucune lecture de la page des ratios");
  assert.notEqual((await rechargeeSur(COUTS)).length, 0, "la page des coûts, elle, se rouvre et se lit");
});
