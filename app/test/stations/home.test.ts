// Les stations sur « Tous les projets », la vue jouée : une ligne chacune, telle que le process
// principal l'a lue sur GitHub, et le champ où le chef tape le code qu'une station neuve affiche.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { EFFORTS, MODELES } from "../../src/installation.ts";
import { GESTES_DU_MANAGER } from "../../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { Panne } from "../../src/pannes/pannes.ts";
import type { Appairage, VuDesStations } from "../../src/stations/stations.ts";
import { type Faux, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-15T12:00:00.000Z";
const BOX = { id: "g1", nom: "box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [] as Panne[] } as const;

const demarrage = (stations?: VuDesStations) => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade", box: { hote: "box" } }], hotes: ["box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  ...(stations === undefined ? {} : { stations }),
});

// Les lignes de la liste, telles qu'elles se lisent.
const lignes = (section: Faux) => (section.children[1]?.children ?? []).map((ligne) => ({ etat: ligne.dataset.etat, texte: ligne.textContent }));

async function laHome(stations: VuDesStations | undefined, appairer: (code: string) => Appairage = () => ({ refus: "no station shows this code: check it on the station, it is 8 letters and digits" })) {
  const jouee = await jouerLaVue({ demarrage: () => demarrage(stations), appairer, espace: () => [] });
  (jouee.element("projets").children.at(0) ?? assert.fail("pas d'entrée « Tous les projets »")).click();
  await repos();
  return { jouee, section: () => jouee.element("stations") };
}

test("la home montre ses stations, une ligne chacune : son nom, sa machine, et ce que GitHub dit d'elle", async () => {
  const { section } = await laHome({ a: A, stations: [BOX] });
  assert.equal(section().children[0]?.textContent, "Stations");
  assert.deepEqual(lignes(section()), [{ etat: "en-ligne", texte: "box — Linux 6.1.0 · online · version 1.4.0 · no project" }]);
});

test("une station éteinte reste dans la liste, hors ligne ; une lecture ratée garde la liste et le dit", async () => {
  const { jouee, section } = await laHome({ a: A, stations: [BOX] });
  jouee.dire("surStations", { a: A, stations: [{ ...BOX, etat: "hors-ligne", ligne: "offline for 3 min · version 1.4.0 · no project" }], sans: "your stations could not be read on GitHub — error connecting to api.github.com" });
  await repos();
  assert.deepEqual(lignes(section()), [
    { etat: "hors-ligne", texte: "box — Linux 6.1.0 · offline for 3 min · version 1.4.0 · no project" },
    { etat: undefined, texte: "your stations could not be read on GitHub — error connecting to api.github.com" },
  ]);
});

test("sans station, la home dit quoi faire ; avant la première lecture, qu'elle est en cours", async () => {
  assert.match(lignes((await laHome({ a: A, stations: [] })).section())[0]?.texte ?? "", /^no station yet: install one, then type here the code it shows$/);
  assert.match(lignes((await laHome(undefined)).section())[0]?.texte ?? "", /first read on GitHub in progress/);
});

test("le code tapé part au process principal ; son refus se lit sous le champ, en une ligne ; appairée, le champ se vide", async () => {
  let rendu: Appairage = { refus: "this code has expired: station box shows a new one in its log — type that one" };
  const { jouee, section } = await laHome({ a: A, stations: [] }, () => rendu);
  const [champ] = section().dessous("input");
  const formulaire = section().dessous("form")[0] ?? assert.fail("pas de formulaire");
  assert.ok(champ);
  champ.value = "7kq2-m9xd";
  formulaire.declencher("submit");
  await repos();
  await repos();
  assert.deepEqual(jouee.dernier("appairer"), ["7kq2-m9xd"]);
  assert.equal(section().children[3]?.textContent, "this code has expired: station box shows a new one in its log — type that one");
  assert.equal(champ.value, "7kq2-m9xd");

  rendu = { appairee: "box" };
  formulaire.declencher("submit");
  await repos();
  await repos();
  assert.equal(section().children[3]?.textContent, "station box is paired with this app");
  assert.equal(champ.value, "");
});
