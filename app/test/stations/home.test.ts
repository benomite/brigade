// Les stations sur l'accueil, la vue jouée : une ligne chacune, telle que le process principal l'a
// dite (accueil.ts) — un clic ouvre sa page —, et « + station », sous la liste, qui ouvre le champ où
// le chef tape le code qu'une station neuve affiche.
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
import type { Appairage, StationVue, VuDesStations } from "../../src/stations/stations.ts";
import { type Faux, jouerLaVue, repos } from "../aides/fausse-vue.ts";

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
  ...(stations === undefined ? {} : { stations }),
  ...(accueil === undefined ? {} : { accueil }),
});

// Les lignes de la liste des stations, telles qu'elles se lisent : leur texte et leur survol.
const lignes = (section: Faux) => section.dessous("button").filter(({ className }) => className === "ligne").map((ligne) => ({ texte: ligne.textContent, survol: ligne.title, ton: ligne.children[0]?.dataset.ton }));

async function laHome(accueil: Accueil | undefined, appairer: (code: string) => Appairage = () => ({ refus: "no station shows this code: check it on the station, it is 8 letters and digits" })) {
  const jouee = await jouerLaVue({ demarrage: () => demarrage(accueil, { a: A, stations: [BOX] }), appairer, espace: () => [] });
  (jouee.element("projets").children.at(0) ?? assert.fail("pas d'entrée « Tous les projets »")).click();
  await repos();
  const section = () => jouee.element("accueil-stations");
  const bouton = (texte: string) => jouee.element("tous").dessous("button").find((candidat) => candidat.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);
  return { jouee, section, bouton };
}

test("l'accueil liste ses stations sous ses projets, une ligne chacune : sa pastille, son nom, son état, ce qu'elle fait et ses projets — sa machine et sa version au survol seulement", async () => {
  const { jouee, section } = await laHome(ACCUEIL);
  assert.deepEqual(
    jouee.element("tous").children.map(({ balise, id, textContent }) => (balise === "h2" ? textContent : id)),
    // Puis la ligne qui ouvre le coût de tous les projets (#1022), au niveau de l'app, et la version qui tourne (#1014).
    ["Projects", "accueil-projets", "Stations", "accueil-stations", "Cost", "accueil-couts", "App", "accueil-app", "sante"],
  );
  assert.deepEqual(lignes(section()), [
    { texte: "boxonline · 2 cooks · parade›", survol: "Linux 6.1.0 · version 1.4.0", ton: "vert" },
    { texte: "Macoffline for 12 min · no project›", survol: "macOS 25.0.0 · version 1.4.0", ton: "gris" },
  ]);
  // Ni la machine ni la version ne s'écrivent à plat.
  assert.doesNotMatch(section().textContent, /Linux|macOS|version/);
  // Relu, l'accueil remplace ses lignes.
  jouee.dire("surAccueil", { ...ACCUEIL, stations: [{ id: "g1", nom: "box", ton: "jaune", dit: "online · saturated · 2 cooks · parade", phrase: "saturated", survol: "Linux 6.1.0 · version 1.4.0" }] });
  await repos();
  assert.deepEqual(lignes(section()).map(({ texte }) => texte), ["boxonline · saturated · 2 cooks · parade›"]);
});

test("sans station, l'accueil dit quoi faire ; avant la première lecture, qu'elle est en cours", async () => {
  assert.match((await laHome({ ...ACCUEIL, stations: [] })).section().textContent, /^no station yet: install one, then pair it here with “\+ station”/);
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
  assert.ok(jouee.element("tous").children.some(({ id }) => id === "accueil-stations"));
});

test("« + station » ouvre le champ du code, nulle part ailleurs ; un refus se lit dessous, en une ligne ; appairée, le champ se referme sans rien laisser dire", async () => {
  let rendu: Appairage = { refus: "this code has expired: station box shows a new one in its log — type that one" };
  const { jouee, section, bouton } = await laHome(ACCUEIL, () => rendu);
  const formulaire = section().dessous("form")[0] ?? assert.fail("pas de formulaire");
  assert.equal(formulaire.hidden, true, "le champ n'est pas affiché d'office");
  assert.equal(jouee.element("tous").dessous("input").filter((champ) => !champ.parentElement?.hidden).length, 0);

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
  assert.doesNotMatch(jouee.element("tous").textContent, /paired/);
  assert.equal(bouton("+ station").hidden, false);
});
