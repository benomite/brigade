// Ce qu'un projet a coûté n'est plus sur sa page (#1699) : il était sous Settings → Reliability, à côté de la
// fiabilité de ses cooks (#1022) — ses tokens perdus, ses tickets les plus chers. Quand la fiabilité est devenue une
// section de l'onglet Cooks, il n'y a pas suivi : la page des coûts de l'app porte les mêmes blocs, chaque projet
// nommé (cost/perdus.test.ts), et un second chiffre de tokens perdus, compté autrement, aurait
// côtoyé celui de la fiabilité. Le projet n'a toujours pas d'onglet Cost. La vue est jouée telle qu'elle est
// (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { type Jouee, jouerLaVue, ouvrirOnglet, repos } from "../aides/fausse-vue.ts";

const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade" };
const CANTINE: Projet = { nom: "cantine", dossier: "/tmp/cantine" };

async function ouvrirStations(): Promise<Jouee> {
  const vue = await jouerLaVue({
    demarrage: () => ({
      configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE, CANTINE] }, () => true),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS,
      rubriques: RUBRIQUES,
      gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
    }),
    espace: () => [],
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case parade")).click();
  await repos();
  await ouvrirOnglet(vue, "Stations");
  return vue;
}

describe("le coût d'un projet n'est plus sur sa page (#1699)", () => {
  test("le projet n'a plus d'onglet Cost : son seul onglet est Settings", async () => {
    const vue = await ouvrirStations();
    assert.deepEqual(vue.element("onglets-du-projet").children.map(({ textContent }) => textContent), ["Rail", "Stations", "Settings"]);
  });

  test("Stations ne pose ni ses tokens perdus ni ses tickets les plus chers ; Settings non plus", async () => {
    const vue = await ouvrirStations();
    const poses = vue.poses();
    assert.deepEqual(poses.filter(({ className }) => /^(cout-du-projet|perdus-cout|chers-cout)$/.test(className)), []);
    assert.doesNotMatch(vue.element("rail").textContent, /cost of this project|most expensive|120,000/);
    // Settings — une seule page, sans sous-pages (#1700) — ne les pose pas non plus.
    (vue.element("onglets-du-projet").children.find(({ textContent }) => textContent === "Settings") ?? assert.fail("pas d'onglet Settings")).click();
    await repos();
    assert.deepEqual(vue.poses().filter(({ className }) => /^(cout-du-projet|perdus-cout|chers-cout)$/.test(className)), []);
  });
});
