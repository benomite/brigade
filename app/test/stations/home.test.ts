// Toutes les stations, la vue jouée — sur l'accueil jusqu'au ticket 2638, en bas de l'onglet Stations de chaque projet
// depuis : une ligne chacune, telle que le process principal l'a dite (accueil.ts) — un clic ouvre sa page —, et
// « + station », sous la liste, qui ouvre le champ où le chef tape le code qu'une station neuve affiche.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Accueil } from "../../src/accueil.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { Appairage, StationVue, VuDesStations } from "../../src/stations/stations.ts";
import { type Faux, jouerLaVue, ouvrirToutesLesStations, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-15T12:00:00.000Z";
const BOX: StationVue = { id: "g1", nom: "box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online · version 1.4.0 · 1 project: parade", pannes: [], dit: "online", version: "1.4.0", projets: ["parade"], max: "connectee" };
const SANTE = { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } as const;
const ACCUEIL: Accueil = {
  projets: [{ nom: "parade", ton: "vert", dit: "#12 cooking", survol: "read at 12:00:00 PM — open it to act" }],
  stations: [
    { id: "g1", nom: "box", ton: "vert", dit: "online · 2 cooks · parade", phrase: "online · 2 cooks running", survol: "Linux 6.1.0 · version 1.4.0" },
    { id: "g2", nom: "Mac", ton: "gris", dit: "offline for 12 min · no project", phrase: "offline for 12 min", survol: "macOS 25.0.0 · version 1.4.0" },
  ],
  sante: SANTE,
};

const demarrage = (accueil?: Accueil, stations?: VuDesStations) => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  ...(stations === undefined ? {} : { stations }),
  ...(accueil === undefined ? {} : { accueil }),
});

// Les lignes de la liste des stations, telles qu'elles se lisent : leur texte et leur survol.
const lignes = (section: Faux) => section.dessous("button").filter(({ className }) => className === "ligne").map((ligne) => ({ texte: ligne.textContent, survol: ligne.title, ton: ligne.children[0]?.dataset.ton }));

async function laHome(accueil: Accueil | undefined, appairer: (code: string) => Appairage = () => ({ refus: "no station shows this code: check it on the station, it is 8 letters and digits" })) {
  const jouee = await jouerLaVue({ demarrage: () => demarrage(accueil, { a: A, stations: [BOX] }), appairer, espace: () => [] });
  await ouvrirToutesLesStations(jouee);
  const section = () => jouee.element("toutes-les-stations");
  const bouton = (texte: string) =>
    [...jouee.element("tous").dessous("button"), ...jouee.element("rail").dessous("button")].find((candidat) => candidat.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);
  return { jouee, section, bouton };
}

test("toutes les stations, en bas de l'onglet Stations, une ligne chacune : sa pastille, son nom, son état, ce qu'elle fait et ses projets — sa machine et sa version au survol seulement", async () => {
  const { jouee, section } = await laHome(ACCUEIL);
  // Le dernier bloc de l'onglet, sous ceux du projet (#2638) : son titre, puis ses lignes.
  assert.equal(jouee.element("rail").children.at(-1), section());
  assert.equal(section().children[0]?.textContent, "All stations");
  assert.deepEqual(lignes(section()), [
    { texte: "boxonline · 2 cooks · parade›", survol: "Linux 6.1.0 · version 1.4.0", ton: "vert" },
    { texte: "Macoffline for 12 min · no project›", survol: "macOS 25.0.0 · version 1.4.0", ton: "gris" },
  ]);
  // Ni la machine ni la version ne s'écrivent à plat sur les lignes : les versions ont leur propre ligne dessous (#2191).
  assert.doesNotMatch(section().children[0]?.textContent ?? "", /Linux|macOS|version/);
  // Relu, l'accueil remplace ses lignes, l'onglet montré.
  jouee.dire("surAccueil", { ...ACCUEIL, stations: [{ id: "g1", nom: "box", ton: "jaune", dit: "online · saturated · 2 cooks · parade", phrase: "saturated", survol: "Linux 6.1.0 · version 1.4.0" }] });
  await repos();
  assert.deepEqual(lignes(section()).map(({ texte }) => texte), ["boxonline · saturated · 2 cooks · parade›"]);
});

test("sans station, la liste dit quoi faire ; avant la première lecture, qu'elle est en cours", async () => {
  assert.match((await laHome({ ...ACCUEIL, stations: [] })).section().textContent, /^All stationsNo station yet. Install one, then pair it here with “\+ station”/);
  assert.match((await laHome({ projets: [], sante: SANTE })).section().textContent, /first read on GitHub in progress/);
});

test("un clic sur une station ouvre sa page ; un geste visible ramène à l'accueil", async () => {
  const { jouee, section, bouton } = await laHome(ACCUEIL);
  (section().dessous("button").find(({ textContent }) => textContent.startsWith("box")) ?? assert.fail("pas de ligne « box »")).click();
  await repos();
  const page = jouee.element("station");
  assert.equal(jouee.element("tous").children[0], page);
  assert.equal(page.dessous("h2")[0]?.textContent, "box");
  assert.match(page.textContent, /online · 2 cooks running/);
  // « T » reste l'entrée affichée de la barre.
  assert.equal(jouee.element("projets").children[0]?.ariaCurrent, "true");
  bouton("‹ All projects").click();
  await repos();
  assert.ok(jouee.element("tous").children.some(({ id }) => id === "accueil-bloc-projets"));
});

test("« + station » ouvre le champ du code, nulle part ailleurs ; un refus se lit dessous, en une ligne ; appairée, le champ se referme sans rien laisser dire", async () => {
  let rendu: Appairage = { refus: "this code has expired: station box shows a new one in its log — type that one" };
  const { jouee, section, bouton } = await laHome(ACCUEIL, () => rendu);
  const formulaire = section().dessous("form")[0] ?? assert.fail("pas de formulaire");
  assert.equal(formulaire.hidden, true, "le champ n'est pas affiché d'office");
  assert.equal(jouee.element("rail").dessous("input").filter((champ) => !champ.parentElement?.hidden).length, 0);

  bouton("+ station").click();
  await repos();
  assert.equal(formulaire.hidden, false);
  const [champ] = formulaire.dessous("input");
  assert.ok(champ);
  champ.value = "7kq2-m9xd";
  formulaire.declencher("submit");
  await repos();
  await repos();
  assert.deepEqual(jouee.dernier("appairer"), ["7kq2-m9xd"]);
  assert.equal(formulaire.dessous("p")[0]?.textContent, "this code has expired: station box shows a new one in its log — type that one");
  assert.equal(champ.value, "7kq2-m9xd");

  // GitHub qui manque : la ligne le dit, ce qu'il a répondu est au survol.
  rendu = { refus: "nothing was paired: GitHub could not be read or written", detail: "error connecting to api.github.com" };
  formulaire.declencher("submit");
  await repos();
  await repos();
  assert.equal(formulaire.dessous("p")[0]?.textContent, "nothing was paired: GitHub could not be read or written");
  assert.equal(formulaire.dessous("p")[0]?.title, "error connecting to api.github.com");

  rendu = { appairee: "box" };
  formulaire.declencher("submit");
  await repos();
  await repos();
  assert.equal(formulaire.hidden, true);
  assert.equal(champ.value, "");
  assert.equal(formulaire.dessous("p")[0]?.textContent, "");
  assert.doesNotMatch(jouee.element("rail").textContent, /paired/);
  assert.equal(bouton("+ station").hidden, false);
});
