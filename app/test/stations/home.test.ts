// Toutes les stations, la vue jouée — en bas de l'onglet Stations de chaque projet depuis le ticket 2638, de retour sur
// l'accueil depuis le ticket 3195 : une ligne chacune, telle que le process principal l'a dite (home.ts) — un clic ouvre sa page —, et
// « + station », sous la liste, qui ouvre le champ où le chef tape le code qu'une station neuve affiche.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Home } from "../../src/home.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { BANNER } from "../../src/facts.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import type { Pairing, StationVue, SeenOfStations } from "../../src/stations/stations.ts";
import { type Fake, playTheVue, openAllTheStations, repos } from "../helpers/false-vue.ts";

const A = "2026-10-15T12:00:00.000Z";
const BOX: StationVue = { id: "g1", nom: "box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online · version 1.4.0 · 1 project: parade", pannes: [], dit: "online", version: "1.4.0", projets: ["parade"], max: "connectee" };
const HEALTH = { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } as const;
const HOME: Home = {
  projets: [{ nom: "parade", ton: "vert", dit: "#12 cooking", survol: "read at 12:00:00 PM — open it to act" }],
  stations: [
    { id: "g1", nom: "box", ton: "vert", dit: "online · 2 cooks · parade", phrase: "online · 2 cooks running", survol: "Linux 6.1.0 · version 1.4.0" },
    { id: "g2", nom: "Mac", ton: "gris", dit: "offline for 12 min · no project", phrase: "offline for 12 min", survol: "macOS 25.0.0 · version 1.4.0" },
  ],
  sante: HEALTH,
};

const startup = (home?: Home, stations?: SeenOfStations) => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
  ...(stations === undefined ? {} : { stations }),
  ...(home === undefined ? {} : { accueil: home }),
});

// Les lignes de la liste des stations, telles qu'elles se lisent : leur texte et leur survol.
const lines = (section: Fake) => section.dessous("button").filter(({ className }) => className === "ligne").map((line) => ({ texte: line.textContent, survol: line.title, ton: line.children[0]?.dataset.ton }));

async function theHome(home: Home | undefined, pair: (code: string) => Pairing = () => ({ refus: "no station shows this code: check it on the station, it is 8 letters and digits" })) {
  const played = await playTheVue({ demarrage: () => startup(home, { a: A, stations: [BOX] }), appairer: pair, espace: () => [] });
  await openAllTheStations(played);
  const section = () => played.element("toutes-les-stations");
  const button = (text: string) =>
    [...played.element("tous").dessous("button"), ...played.element("rail").dessous("button")].find((candidate) => candidate.textContent === text) ?? assert.fail(`pas de bouton « ${text} »`);
  return { jouee: played, section, bouton: button };
}

test("toutes les stations, le dernier bloc de l'accueil, une ligne chacune : sa pastille, son nom, son état, ce qu'elle fait et ses projets — sa machine et sa version au survol seulement", async () => {
  const { jouee: played, section } = await theHome(HOME);
  // Le dernier bloc de l'accueil, sous la station de cet ordinateur (#3195) : son titre, puis ses lignes.
  assert.equal(played.element("tous").children.at(-1), section());
  assert.equal(section().children[0]?.textContent, "All stations");
  assert.deepEqual(lines(section()), [
    { texte: "boxonline · 2 cooks · parade›", survol: "Linux 6.1.0 · version 1.4.0", ton: "vert" },
    { texte: "Macoffline for 12 min · no project›", survol: "macOS 25.0.0 · version 1.4.0", ton: "gris" },
  ]);
  // Ni la machine ni la version ne s'écrivent à plat sur les lignes : les versions ont leur propre ligne dessous (#2191).
  assert.doesNotMatch(section().children[0]?.textContent ?? "", /Linux|macOS|version/);
  // Relu, l'accueil remplace ses lignes, sous les yeux.
  played.dire("surAccueil", { ...HOME, stations: [{ id: "g1", nom: "box", ton: "jaune", dit: "online · update failed · 2 cooks · parade", phrase: "online · 2 cooks running", survol: "Linux 6.1.0 · version 1.4.0" }] });
  await repos();
  assert.deepEqual(lines(section()).map(({ texte: text }) => text), ["boxonline · update failed · 2 cooks · parade›"]);
});

test("sans station, la liste dit quoi faire ; avant la première lecture, qu'elle est en cours", async () => {
  assert.match((await theHome({ ...HOME, stations: [] })).section().textContent, /^All stationsNo station yet. Install one, then pair it here with “\+ station”/);
  assert.match((await theHome({ projets: [], sante: HEALTH })).section().textContent, /first read on GitHub in progress/);
});

test("un clic sur une station ouvre sa page ; un geste visible ramène à l'accueil", async () => {
  const { jouee: played, section, bouton: button } = await theHome(HOME);
  (section().dessous("button").find(({ textContent }) => textContent.startsWith("box")) ?? assert.fail("pas de ligne « box »")).click();
  await repos();
  const page = played.element("station");
  assert.equal(played.element("tous").children[0], page);
  assert.equal(page.dessous("h2")[0]?.textContent, "box");
  assert.match(page.textContent, /online · 2 cooks running/);
  // « T » reste l'entrée affichée de la barre.
  assert.equal(played.element("projets").children[0]?.ariaCurrent, "true");
  button("‹ All projects").click();
  await repos();
  assert.ok(played.element("tous").children.some(({ id }) => id === "accueil-bloc-projets"));
});

test("« + station » ouvre le champ du code, nulle part ailleurs ; un refus se lit dessous, en une ligne ; appairée, le champ se referme sans rien laisser dire", async () => {
  let rendered: Pairing = { refus: "this code has expired: station box shows a new one in its log — type that one" };
  const { jouee: played, section, bouton: button } = await theHome(HOME, () => rendered);
  const form = section().dessous("form")[0] ?? assert.fail("pas de formulaire");
  assert.equal(form.hidden, true, "le champ n'est pas affiché d'office");
  assert.equal(played.element("rail").dessous("input").filter((field) => !field.parentElement?.hidden).length, 0);

  button("+ station").click();
  await repos();
  assert.equal(form.hidden, false);
  const [field] = form.dessous("input");
  assert.ok(field);
  field.value = "7kq2-m9xd";
  form.declencher("submit");
  await repos();
  await repos();
  assert.deepEqual(played.dernier("appairer"), ["7kq2-m9xd"]);
  assert.equal(form.dessous("p")[0]?.textContent, "this code has expired: station box shows a new one in its log — type that one");
  assert.equal(field.value, "7kq2-m9xd");

  // GitHub qui manque : la ligne le dit, ce qu'il a répondu est au survol.
  rendered = { refus: "nothing was paired: GitHub could not be read or written", detail: "error connecting to api.github.com" };
  form.declencher("submit");
  await repos();
  await repos();
  assert.equal(form.dessous("p")[0]?.textContent, "nothing was paired: GitHub could not be read or written");
  assert.equal(form.dessous("p")[0]?.title, "error connecting to api.github.com");

  rendered = { appairee: "box" };
  form.declencher("submit");
  await repos();
  await repos();
  assert.equal(form.hidden, true);
  assert.equal(field.value, "");
  assert.equal(form.dessous("p")[0]?.textContent, "");
  assert.doesNotMatch(played.element("rail").textContent, /paired/);
  assert.equal(button("+ station").hidden, false);
});
