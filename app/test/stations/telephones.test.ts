// « pair a phone » sur la ligne d'une station de l'accueil (#1598), la vue jouée : le bouton est à côté de la ligne —
// qui garde son clic —, il ouvre l'écran à la place de l'accueil, qui tire un code pour cette station, la nomme par son
// gist et lit ses téléphones ; « ‹ All projects » y ramène. Un téléphone appairé, qui ne cuisine pas, n'en a pas.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Accueil } from "../../src/accueil.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { StationVue, VuDesStations } from "../../src/stations/stations.ts";
import { jouerLaVue, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-24T12:00:00.000Z";
const BOX: StationVue = { id: "g1", nom: "box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online · 1 project: parade", pannes: [], dit: "online", version: "1.6.0", projets: ["parade"], max: "connectee" };
const PIXEL: StationVue = { id: "g3", nom: "pixel", machine: "Android 15", cuisine: false, etat: "en-ligne", ligne: "online · does not cook", pannes: [], dit: "online", version: "", projets: [], max: null };
const ACCUEIL: Accueil = {
  projets: [{ nom: "parade", ton: "vert", dit: "#12 cooking", survol: "" }],
  stations: [
    { id: "g1", nom: "box", ton: "vert", dit: "online · parade", phrase: "online · no cook running", survol: "Linux 6.1.0" },
    { id: "g3", nom: "pixel", ton: "vert", dit: "online · does not cook", phrase: "online · does not cook", survol: "Android 15" },
  ],
  sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" },
};
const STATIONS: VuDesStations = { a: A, stations: [BOX, PIXEL] };

async function laHome() {
  const jouee = await jouerLaVue({
    demarrage: () => ({
      configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade", box: { hote: "box" } }], hotes: ["box"] }),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS,
      rubriques: RUBRIQUES,
      boutons: BOUTONS,
      gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
      stations: STATIONS,
      accueil: ACCUEIL,
    }),
    espace: () => [],
    tirerUnCodeDeTelephone: () => ({ tire: { code: "7KQ2-M9XD", expireLe: new Date(Date.now() + 15 * 60_000).toISOString(), qr: "brigade://pair?code=7KQ2-M9XD&url=https%3A%2F%2Fbox.tail1234.ts.net", adresse: "https://box.tail1234.ts.net" } }),
    telephonesDeLaStation: () => ({ telephones: [{ nom: "pixel", machine: "Android 15", appaireLe: "2026-10-20T09:00:00.000Z" }] }),
  });
  (jouee.element("projets").children.at(0) ?? assert.fail("pas d'entrée « Tous les projets »")).click();
  await repos();
  return jouee;
}

test("chaque station qui cuisine a « pair a phone » à côté de sa ligne ; un téléphone appairé n'en a pas", async () => {
  const jouee = await laHome();
  const section = jouee.element("accueil-stations");
  const boutons = section.dessous("button").filter(({ className }) => className === "appairer-un-telephone");
  assert.deepEqual(
    boutons.map(({ textContent, ariaLabel }) => [textContent, ariaLabel]),
    [["pair a phone", "pair a phone with box"]],
  );
  // La ligne garde son clic : elle ouvre toujours la page de la station.
  (section.dessous("button").find(({ className, textContent }) => className === "ligne" && textContent.startsWith("box")) ?? assert.fail("pas de ligne « box »")).click();
  await repos();
  assert.equal(jouee.element("tous").children[0]?.id, "station");
});

test("« pair a phone » ouvre l'écran de cette station : un code et son QR, ses téléphones — et « ‹ All projects » ramène à l'accueil", async () => {
  const jouee = await laHome();
  const appairer = jouee.element("accueil-stations").dessous("button").find(({ className }) => className === "appairer-un-telephone") ?? assert.fail("pas de bouton");
  appairer.click();
  await repos();
  const page = jouee.element("tous").children[0] ?? assert.fail("rien à la place de l'accueil");
  assert.equal(page.id, "telephones-de-station");
  assert.deepEqual(jouee.dernier("tirerUnCodeDeTelephone"), ["g1"]);
  assert.deepEqual(jouee.dernier("telephonesDeLaStation"), ["g1"]);
  assert.match(page.dessous("h2")[0]?.textContent ?? "", /^Pair a phone with box/);
  assert.match(page.textContent, /7KQ2-M9XD/);
  assert.match(page.textContent, /valid for 15:00/);
  assert.ok(page.dessous("img").some(({ className }) => className === "qr"));
  assert.match(page.textContent, /Phones paired with box/);
  // « T » reste l'entrée affichée de la barre.
  assert.equal(jouee.element("projets").children[0]?.ariaCurrent, "true");
  (page.dessous("button").find(({ textContent }) => textContent === "‹ All projects") ?? assert.fail("pas de retour")).click();
  await repos();
  assert.ok(jouee.element("tous").children.some(({ id }) => id === "accueil-stations"));
});
