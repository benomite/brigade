// Les chiffres du closer que la vue du projet montrait, retirés par #4224 — l'onglet Agents les remplace : une passe mergée
// de Settings ne dit plus les lignes que sa PR a retirées et ajoutées, et la page du rapport ajouté / retiré de tous les
// projets n'est plus : sa lecture (`closing --json` sur la box de chaque projet) ne part plus, et une fenêtre rechargée
// sur elle ne la rouvre pas.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { PasseLue } from "../../src/closer-sante.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { COUTS, commandesDe, ONGLETS, projetsLus, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { ceQuElleARetire } from "../../src/vue/projet/bandeau-sante/Closer.js";
import { FauxStockage, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const passe = (pr: PasseLue["pr"]): PasseLue => ({ numero: 2477, url: "https://github.com/chef/parade/issues/2477", ouverteLe: "2026-10-08T08:00:00.000Z", ouverte: false, sha: "", candidats: [], restants: 0, derive: [], temps: [], pr });

test("a merged closing pass says its PR merged, without the lines it removed or added", () => {
  assert.deepEqual(ceQuElleARetire(passe({ numero: 2480, url: "https://github.com/chef/parade/pull/2480", mergee: true, retirees: 1234, ajoutees: 56 })), { retire: true, dit: "its PR merged", precise: "" });
});

test("the added / removed ratio page is gone: `ratios` reads no box and launches no command; the cost page still reads each served project", () => {
  const projets = [{ nom: "parade", servi: true }, { nom: "ici", ici: true }, { nom: "local" }];
  assert.deepEqual(commandesDe("ratios"), []);
  assert.deepEqual(projetsLus("ratios", undefined, projets), []);
  assert.deepEqual(projetsLus(COUTS, undefined, projets).map(({ nom }) => nom), ["parade", "ici"]);
});

const rechargeeSur = async (page: string) => {
  const session = new FauxStockage();
  session.setItem("brigade.ecran", JSON.stringify({ page }));
  const demarrage = () => ({
    configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
    palette: PALETTE,
    exemple: EXEMPLE,
    onglets: ONGLETS,
    rubriques: RUBRIQUES,
    gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
    banniere: BANNIERE,
    calibrage: { modeles: MODELES, efforts: EFFORTS },
    code: undefined,
  });
  const vue = await jouerLaVue({ demarrage, espace: () => [] } as never, { session });
  await repos();
  return vue.appels.filter(({ geste, args }) => geste === "onglet" && args[1] === page);
};

test("a window reloaded on the ratio page opens on the home, and reads no ratio; reloaded on the cost page, it still reopens it", async () => {
  assert.deepEqual(await rechargeeSur("ratios"), [], "aucune lecture de la page des ratios");
  assert.notEqual((await rechargeeSur(COUTS)).length, 0, "la page des coûts, elle, se rouvre et se lit");
});
