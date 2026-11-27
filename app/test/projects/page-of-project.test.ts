// Ajouter un projet à l'app, puis confier sa cuisine à une station depuis sa page (#983), la vue
// jouée. L'écran d'ajout ne demande que le dépôt (#3181) : ni station, ni machine, ni dossier, et rien
// d'autre que son ouverture — sa copie, puis le fichier des projets — n'est appelé. La page du projet dit en
// une phrase qu'aucune station ne fait sa cuisine, et offre le geste qui la lui confie ; une fois
// confiée, elle nomme ses stations, et permet d'en ajouter une autre. Le choix (#1107) dit en une
// phrase ce que le chef fait, propose une machine en ligne — cet ordinateur en tête, une station hors ligne jamais
// cochée d'office (#3187) —, et arrive rempli : les cooks tirés des cœurs de la machine choisie, avec d'où ils
// viennent — on peut lancer sans rien toucher. Le calibrage n'y est pas : il part tel que l'app le recommande.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { Home } from "../../src/home.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { BANNER } from "../../src/facts.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import type { Outage } from "../../src/outages/outages.ts";
import { calibrationRecommended, EFFORTS, machineProposed, MODELS, stationRecommended, type Addition, type DefaultsOfTheMachine, type SeenOfProjects } from "../../src/projects/projects.ts";
import type { SeenOfStations } from "../../src/stations/stations.ts";
import { type Fake, type Played, playTheVue, openTab, repos } from "../helpers/false-vue.ts";

const A = "2026-10-19T12:00:00.000Z";
const BOX = { id: "g1", nom: "parade-box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [] as Outage[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
const MAC = { id: "g2", nom: "macbook", machine: "macOS 25.0.0", coeurs: 12, etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [] as Outage[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
const STATIONS: SeenOfStations = { a: A, stations: [BOX, MAC] };
const HOME: Home = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
// Ce que le process principal propose de chaque station, et le calibrage : sans autre projet, la valeur mesurée.
const WITHOUT_PROJECT: SeenOfProjects = { a: A, projets: [], recommandee: "g1", avertissements: {}, machines: { g1: machineProposed(BOX), g2: machineProposed(MAC) }, calibrage: calibrationRecommended([]) };
const ENTRUSTED: SeenOfProjects = {
  ...WITHOUT_PROJECT,
  projets: [{ nom: "parade", depot: "benomite/parade", base: "main", suiviPar: { id: "g1", nom: "parade-box" }, stations: [{ id: "g1", nom: "parade-box", etat: "en-preparation", dit: "cloning benomite/parade", autoriser: [] }], servi: null }],
};
const PARADE: Project = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };
// Ce que l'opération du runtime calcule pour cet ordinateur (ticket 1307) : ses cooks, son dossier, ses capacités.
const DEFAULTS: DefaultsOfTheMachine = {
  cooks: 5,
  cooksDit: "from this computer's 7 cores: two are kept for the kitchen itself, then about one per cook",
  espaceDeTravail: "/Users/chef/.local/state/brigade/worktrees",
  capacites: [
    { capacite: "navigateur-headless", nom: "a browser", detectee: true },
    { capacite: "android", nom: "the Android SDK", detectee: false },
    { capacite: "docker", nom: "Docker", detectee: true },
  ],
};
// Le même projet confié, quand macbook est la station de cet ordinateur.
const ENTRUSTED_HERE: SeenOfProjects = { ...ENTRUSTED, locale: "g2" };

const startup = (projects: Project[], projectsOfStations: SeenOfProjects | undefined) => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: projects }),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
  stations: STATIONS,
  accueil: HOME,
  ...(projectsOfStations === undefined ? {} : { projetsDesStations: projectsOfStations }),
});

const buttonUnder = (or: Fake, text: string) => or.dessous("button").find((candidate) => candidate.textContent === text) ?? assert.fail(`pas de bouton « ${text} » sous ${or.id}`);
const choice = (or: Fake, type: string) => or.dessous("input").filter((field) => field.type === type && !field.hidden);
// Ce qui se voit sous `ou` : ni lui, ni aucun de ses parents jusqu'à `ou` n'est caché.
const shows = (or: Fake, element: Fake) => {
  for (let pose: Fake | null = element; pose !== null && pose !== or; pose = pose.parentElement) if (pose.hidden) return false;
  return true;
};
const visible = (or: Fake, balise: string) => or.dessous(balise).filter((element) => shows(or, element));
const byWording = (or: Fake, wording: string) => visible(or, "input").concat(visible(or, "select")).find(({ ariaLabel }) => ariaLabel === wording);
// Une machine du choix : le libellé qui la porte, son nom et ce que la choisir implique.
const machines = (or: Fake, type: string) =>
  choice(or, type)
    .filter((field) => shows(or, field) && field.parentElement?.className === "machine")
    .map((field) => {
      const line = field.parentElement ?? assert.fail("une case sans libellé");
      return { nom: line.dessous("strong")[0]?.textContent, recommandee: line.dessous("span").some(({ textContent }) => textContent === "recommended"), dit: line.dessous("small")[0]?.textContent, choisie: field.checked, champ: field };
    });

// Les capacités du formulaire : leur nom, cochée ou non, et ce qui est dit de leur détection.
const capacities = (or: Fake) =>
  visible(or, "label")
    .filter(({ className }) => className === "capacite")
    .map((line) => ({ nom: line.dessous("span")[0]?.textContent, cochee: line.dessous("input")[0]?.checked, dit: line.dessous("small")[0]?.textContent }));
// Les champs que le chef voit : leur nom, et leur valeur.
const fieldsSeen = (or: Fake) => visible(or, "input").concat(visible(or, "select")).map(({ ariaLabel, type, value, checked }) => `${ariaLabel}=${type === "checkbox" || type === "radio" ? checked : value}`);

// L'espace de « parade », ouvert par sa case de la barre.
async function thePage(projectsOfStations: SeenOfProjects | undefined, project: Project = PARADE, entrust: () => Addition = () => ({ ajoute: "parade" }), defaults: () => DefaultsOfTheMachine = () => DEFAULTS, stations: SeenOfStations = STATIONS) {
  const played = await playTheVue({
    demarrage: () => ({ ...startup([project], projectsOfStations), stations }),
    confierAUneStation: entrust,
    defautsDeStation: defaults,
    depotsDuChef: () => ({ depots: [{ depot: "benomite/parade", base: "main" }] }),
    espace: () => [],
  });
  (played.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  assert.equal(played.element("espace").textContent, "parade");
  return { jouee: played, bloc: played.element("stations-du-projet") };
}

test("l'écran d'ajout ne demande que le dépôt (#3181) : ni station, ni machine, ni dossier, ni branche", async () => {
  const played = await playTheVue({ demarrage: () => startup([], WITHOUT_PROJECT), compteGitHub: () => ({ login: "benomite" }), depotsDuChef: () => ({ depots: [{ depot: "benomite/parade", base: "v2" }] }), espace: () => [] });
  // Sans projet, l'app s'ouvre sur les stations du chef (#1434) : l'ajout est au « + » de la barre.
  (played.poses().find((pose) => pose.id === "entree-ajout") ?? assert.fail("pas de « + »")).click();
  await repos();
  assert.equal(played.element("ajout").hidden, false);
  for (const gone of ["box", "declarer", "nom", "sauvegardes", "manager-modele", "reviewer-effort", "formulaire", "dossier", "depot", "base", "parcours-de-l-ajout"]) assert.throws(() => played.element(gone), new RegExp(`aucun élément « ${gone} »`), gone);
  // La page ne pose plus rien dans l'écran : la vue y pose le choix du dépôt (journey-project/addition.js).
  const page = readFileSync(join(import.meta.dirname, "../../src/vue/index.html"), "utf8");
  assert.match(page, /<section id="ajout" aria-label="Add a project" hidden><\/section>/);
  const screen = played.element("ajout");
  assert.deepEqual(screen.dessous("input").map((field) => field.type), ["search", "text"]);
  assert.deepEqual(screen.dessous("select"), []);
  assert.doesNotMatch(screen.textContent, /\bbox|machine|station|folder|branch/i);
});

test("un dépôt choisi n'appelle que son ouverture — sa copie, puis le fichier des projets — : aucun geste vers une station, et sa page s'ouvre", async () => {
  let played: Played | undefined;
  played = await playTheVue({
    demarrage: () => startup([], WITHOUT_PROJECT),
    espace: () => [],
    compteGitHub: () => ({ login: "benomite" }),
    depotsDuChef: () => ({ depots: [{ depot: "benomite/parade", base: "v2" }] }),
    ouvrirDUneStation: (name, repository, base) => {
      // Le fichier change d'abord : la liste arrive par `surConfiguration`, comme dans l'app.
      played?.dire("surConfiguration", forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: name, dossier: "/tmp/parade", depot: repository, base: base ?? "" }] }), []);
      return { state: "open", project: name, repository: repository, folder: "/tmp/parade", cloned: false };
    },
  });
  (played.poses().find((pose) => pose.id === "entree-ajout") ?? assert.fail("pas de « + »")).click();
  await repos();
  const calledBefore = played.appels.length;
  (played.element("ajout").dessous("button").find((button) => button.textContent === "benomite/parade") ?? assert.fail("pas de dépôt")).click();
  await repos();
  await repos();
  assert.deepEqual(played.dernier("ouvrirDUneStation"), ["parade", "benomite/parade", "v2"]);
  // Ajouter ne lance rien d'autre : aucun geste vers une station, aucune machine jointe. Sa page lit le rail que
  // sa station publierait sur GitHub (#1435), et le tableau de la cuisine de son dépôt (#1588) ; l'accueil, les stations du
  // compte GitHub (#1706), les GitHub Apps de la station de cet ordinateur (#2317), les projets qu'elle sert (#2359), ses
  // humains, les stations qui y contribuent, ses agents (#4029), les outils
  // que son clone demande (#4059), sa fiche (#4240), ce qui a changé depuis sa dernière ouverture (#4649) : des lectures, pas des gestes.
  assert.deepEqual(
    played.appels.slice(calledBefore).map(({ geste: action }) => action).filter((action) => !["ouvrirDUneStation", "faits", "regarder", "espace", "onglet", "retrait", "ordinaires", "tous", "tableauDuProjet", "stationsDuCompte", "appsDeLaStation", "projetsServis", "lireLesAgents", "outilsManquants", "lireUnFichierDuProjet", "sinceYouLastLooked"].includes(action)),
    [],
  );
  assert.equal(played.appels.some(({ geste: action }) => action === "confierAUneStation" || action === "ajouterAUneStation"), false);
  assert.equal(played.element("ajout").hidden, true);
  assert.equal(played.element("espace").textContent, "parade");
});

test("sans station, la page le dit en une phrase et offre le geste qui la lui confie, parmi les stations appairées", async () => {
  const { bloc: block } = await thePage(WITHOUT_PROJECT);
  assert.equal(block.hidden, false);
  assert.equal(block.children[0]?.textContent, "No station cooks parade yet.");
  const entrust = buttonUnder(block, "choose its machine");
  const form = block.dessous("form")[0] ?? assert.fail("pas de formulaire");
  assert.equal(form.hidden, true);
  entrust.click();
  await repos();
  assert.equal(form.hidden, false);
  assert.equal(entrust.hidden, true);
});

test("le choix dit en tête ce que le chef fait, puis les machines — la toujours allumée proposée —, et ce que chacune implique", async () => {
  const { jouee: played, bloc: block } = await thePage(WITHOUT_PROJECT);
  buttonUnder(block, "choose its machine").click();
  await repos();
  const form = block.dessous("form")[0] ?? assert.fail("pas de formulaire");
  assert.equal(form.dessous("h3")[0]?.textContent, "Choose the machine that cooks parade.");
  assert.match(form.textContent, /change what you like, or start as it is/);
  // Le dépôt et la branche sont ceux du projet : ils ne se redemandent pas.
  assert.equal(byWording(form, "repository"), undefined);
  assert.equal(played.appels.some(({ geste: action }) => action === "depotsDuChef"), false);
  // Une machine à choisir, toutes de la même façon ; l'app propose la toujours allumée.
  const [stations] = form.dessous("fieldset");
  assert.equal(stations?.dessous("legend")[0]?.textContent, "Machine");
  assert.doesNotMatch(form.textContent, /main/i);
  assert.deepEqual(
    machines(stations ?? assert.fail(), "radio").map(({ nom: name, recommandee: recommended, dit: said, choisie: chosenOne }) => [name, recommended, said, chosenOne]),
    [
      ["parade-box", true, "always on: it keeps cooking while your computer sleeps · Linux 6.1.0", true],
      ["macbook", false, "stops when you close the app on this computer · macOS 25.0.0", false],
    ],
  );
  // L'ancien avertissement jaune n'est plus : ce que choisir un ordinateur implique est sur sa ligne.
  assert.doesNotMatch(form.textContent, /is a computer's app/);
  assert.equal(buttonUnder(form, "Start the kitchen on parade-box").type, "submit");
});

test("chaque valeur arrive posée avec d'où elle vient, sans « Advanced settings » : lancer sans rien toucher part tel quel, avec le calibrage recommandé", async () => {
  const { jouee: played, bloc: block } = await thePage(WITHOUT_PROJECT);
  buttonUnder(block, "choose its machine").click();
  await repos();
  const form = block.dessous("form")[0] ?? assert.fail("pas de formulaire");
  // Les cooks à la fois, tirés des cœurs de la station : 8 cœurs, 6 cooks (#3560).
  const cooks = byWording(form, "cooks at once") ?? assert.fail("pas de cooks");
  assert.equal(cooks.value, "6");
  const field = cooks.parentElement ?? assert.fail();
  assert.equal(field.dessous("label")[0]?.textContent, "Cooks at once");
  assert.equal(field.dessous("small")[0]?.textContent, "recommended — from parade-box's 8 cores: two are kept for the kitchen itself, then about one per cook");
  // Ni le modèle ni l'effort du manager et du reviewer (#3187) : ils restent dans les réglages du projet.
  assert.deepEqual(form.dessous("details"), []);
  assert.deepEqual(form.dessous("select").filter((list) => shows(form, list)), []);
  assert.doesNotMatch(form.textContent, /Advanced settings|manager|reviewer/i);
  // Aucun libellé dans un champ, coupé par sa largeur : chacun est écrit au-dessus du sien, ou à côté.
  for (const input of [...form.dessous("input"), ...form.dessous("select")]) assert.equal((input as unknown as { placeholder?: string }).placeholder ?? "", "", input.ariaLabel);

  await Promise.all(form.declencher("submit"));
  await repos();
  const [input] = played.dernier("confierAUneStation") as [Record<string, unknown>];
  assert.deepEqual({ ...input, ouvertLe: "…" }, {
    nom: "parade",
    depot: "benomite/parade",
    base: "main",
    stations: ["g1"],
    cooks: "6",
    manager: { modele: "sonnet", effort: "medium" },
    reviewer: { modele: "sonnet", effort: "medium" },
    ouvertLe: "…",
  });
  assert.equal(form.hidden, true);
  assert.match(block.textContent, /parade is asked of parade-box: it prepares it within a minute/);
});

test("le calibrage qui part est celui qui tourne déjà sur les autres projets, sans qu'il se règle ici", async () => {
  const calibration = { manager: { modele: "opus", effort: "medium" }, reviewer: { modele: "sonnet", effort: "high" }, dit: "what cantine runs on, your project most recently given to a station" };
  const { jouee: played, bloc: block } = await thePage({ ...WITHOUT_PROJECT, calibrage: calibration });
  buttonUnder(block, "choose its machine").click();
  await repos();
  const form = block.dessous("form")[0] ?? assert.fail("pas de formulaire");
  assert.equal(visible(form, "select").length, 0);
  await Promise.all(form.declencher("submit"));
  await repos();
  const [input] = played.dernier("confierAUneStation") as [{ manager: object; reviewer: object }];
  assert.deepEqual([input.manager, input.reviewer], [calibration.manager, calibration.reviewer]);
});

test("une autre machine : ses cooks suivent ses cœurs à elle, le bouton la nomme ; ce que le chef a changé reste le sien", async () => {
  const { jouee: played, bloc: block } = await thePage(WITHOUT_PROJECT);
  buttonUnder(block, "choose its machine").click();
  await repos();
  const form = block.dessous("form")[0] ?? assert.fail("pas de formulaire");
  const cases = () => machines(form.dessous("fieldset")[0] ?? assert.fail(), "radio");
  // Deux stations, deux nombres de cœurs : chacune ses cooks, jamais ceux de l'autre (#3187).
  const mac = cases()[1]?.champ ?? assert.fail("pas de macbook");
  mac.checked = true;
  mac.declencher("change");
  assert.deepEqual(cases().map(({ nom: name, choisie: chosenOne }) => [name, chosenOne]), [["parade-box", false], ["macbook", true]]);
  assert.equal(byWording(form, "cooks at once")?.value, "10", "12 cœurs, 10 cooks");
  assert.match(form.textContent, /recommended — from macbook's 12 cores/);
  buttonUnder(form, "Start the kitchen on macbook");
  const back = cases()[0]?.champ ?? assert.fail();
  back.checked = true;
  back.declencher("change");
  assert.equal(byWording(form, "cooks at once")?.value, "6", "8 cœurs, 6 cooks");
  assert.match(form.textContent, /recommended — from parade-box's 8 cores/);
  buttonUnder(form, "Start the kitchen on parade-box");

  // Le chef tape ses cooks : sa valeur reste d'une relecture à l'autre, et sa provenance ne se dit plus.
  const cooks = byWording(form, "cooks at once") ?? assert.fail();
  cooks.value = "2";
  cooks.declencher("input");
  played.dire("surProjetsDesStations", { ...WITHOUT_PROJECT, a: "2026-10-19T12:01:00.000Z" });
  await repos();
  assert.equal(byWording(form, "cooks at once")?.value, "2");
  assert.doesNotMatch(form.textContent, /recommended — from/);
  assert.deepEqual(cases().map(({ nom: name, choisie: chosenOne }) => [name, chosenOne]), [["parade-box", true], ["macbook", false]]);

  await Promise.all(form.declencher("submit"));
  await repos();
  const [input] = played.dernier("confierAUneStation") as [{ stations: string[]; cooks: string }];
  assert.deepEqual([input.stations, input.cooks], [["g1"], "2"]);
});

// Ce qui a mené le chef à ne pas pouvoir donner un projet à sa box (#3187) : une station hors ligne cochée et recommandée,
// cet ordinateur nommé par son seul nom d'hôte, ses cooks tirés des cœurs d'une autre.
const OUTSIDE_LINE = { ...BOX, etat: "hors-ligne", dit: "offline for 22 min", ligne: "offline for 22 min · version 1.4.0 · no project" } as const;
const HERE_AND_BOX_OFF = { ...WITHOUT_PROJECT, locale: "g2", recommandee: stationRecommended([OUTSIDE_LINE, MAC]) ?? null, machines: { g1: machineProposed(OUTSIDE_LINE), g2: machineProposed(MAC) } };

test("une station hors ligne n'est ni cochée d'office ni recommandée ; cet ordinateur vient d'abord, nommé « this computer », son nom d'hôte ensuite", async () => {
  const { jouee: played, bloc: block } = await thePage(HERE_AND_BOX_OFF, PARADE, undefined, undefined, { a: A, stations: [OUTSIDE_LINE, MAC] });
  buttonUnder(block, "choose its machine").click();
  await repos();
  const form = block.dessous("form")[0] ?? assert.fail("pas de formulaire");
  const lines = machines(form, "radio");
  assert.deepEqual(
    lines.map(({ nom: name, recommandee: recommended, choisie: chosenOne }) => [name, recommended, chosenOne]),
    [
      ["this computer", false, true],
      ["parade-box", false, false],
    ],
  );
  const [here, box] = lines;
  assert.deepEqual(here?.champ.parentElement?.dessous("span").filter(({ className }) => className.includes("hote")).map(({ textContent }) => textContent), ["macbook"]);
  // Hors ligne, une ligne à elle dit depuis quand, et le geste qui la ramène.
  assert.deepEqual(box?.champ.parentElement?.dessous("small").map(({ textContent }) => textContent), [
    "always on: it keeps cooking while your computer sleeps · Linux 6.1.0",
    "Offline for 22 min: switch parade-box on, or start its brigade-station service there: it starts with the machine",
  ]);
  // Les cooks de cet ordinateur, de ses 12 cœurs à lui ; le bouton dit la machine cochée.
  assert.equal(byWording(form, "cooks at once")?.value, "10");
  assert.match(form.textContent, /recommended — from macbook's 12 cores/);
  buttonUnder(form, "Start the kitchen on this computer");

  // Choisie quand même, la station hors ligne reçoit le projet : la page dit qu'elle le prend à son retour.
  const off = box?.champ ?? assert.fail();
  off.checked = true;
  off.declencher("change");
  assert.equal(byWording(form, "cooks at once")?.value, "6", "les cœurs de parade-box, pas ceux de cet ordinateur");
  buttonUnder(form, "Start the kitchen on parade-box");
  await Promise.all(form.declencher("submit"));
  await repos();
  const [input] = played.dernier("confierAUneStation") as [{ stations: string[]; cooks: string }];
  assert.deepEqual([input.stations, input.cooks], [["g1"], "6"]);
  assert.match(block.textContent, /parade-box is offline: it takes parade when it comes back\./);
});

test("aucune station en ligne : aucune n'est cochée d'office, aucune n'est recommandée", async () => {
  const MAC_OFF = { ...MAC, etat: "hors-ligne", dit: "offline for 3 min" } as const;
  const { bloc: block } = await thePage({ ...HERE_AND_BOX_OFF, recommandee: stationRecommended([OUTSIDE_LINE, MAC_OFF]) ?? null }, PARADE, undefined, undefined, { a: A, stations: [OUTSIDE_LINE, MAC_OFF] });
  buttonUnder(block, "choose its machine").click();
  await repos();
  const form = block.dessous("form")[0] ?? assert.fail("pas de formulaire");
  assert.deepEqual(machines(form, "radio").map(({ recommandee: recommended, choisie: chosenOne }) => [recommended, chosenOne]), [[false, false], [false, false]]);
  assert.equal(form.dessous("span").some(({ textContent }) => textContent === "recommended"), false);
  assert.doesNotMatch(form.textContent, /recommended — /);
  buttonUnder(form, "Start the kitchen");
});

test("ce qui manque se lit sous le choix, et rien ne se ferme", async () => {
  const { bloc: block } = await thePage(WITHOUT_PROJECT, PARADE, () => ({ signales: { cooks: "How many cooks may a station run at once for this project?" } }));
  buttonUnder(block, "choose its machine").click();
  await repos();
  const form = block.dessous("form")[0] ?? assert.fail("pas de formulaire");
  await Promise.all(form.declencher("submit"));
  await repos();
  assert.equal(form.hidden, false);
  assert.match(form.textContent, /How many cooks may a station run at once for this project\?/);
});

test("confiée, Rail ne nomme plus ses stations ni n'offre « + station » : une station s'ajoute depuis l'onglet Stations (#3523)", async () => {
  const { jouee: played, bloc: block } = await thePage(ENTRUSTED);
  assert.equal(block.hidden, true, "aucune ligne de stations au-dessus des colonnes");
  assert.doesNotMatch(block.textContent, /Cooks on/);
  assert.equal(buttonUnder(block, "+ station").hidden, true);
  await openTab(played, "Stations");
  assert.equal(buttonUnder(block, "+ station").hidden, true);
});

test("ce que le chef décoche ou change part tel quel ; les cases cochées restent d'une relecture à l'autre", async () => {
  const { jouee: played, bloc: block } = await thePage(ENTRUSTED_HERE);
  buttonUnder(block, "+ station").click();
  await repos();
  const form = block.dessous("form")[0] ?? assert.fail("pas de formulaire");
  const docker = byWording(form, "Docker") ?? assert.fail("pas de case Docker");
  docker.checked = false;
  docker.declencher("change");
  const android = byWording(form, "the Android SDK") ?? assert.fail("pas de case Android");
  android.checked = true;
  android.declencher("change");
  const cooks = byWording(form, "cooks at once") ?? assert.fail("pas de cooks");
  cooks.value = "2";
  cooks.declencher("input");
  played.dire("surProjetsDesStations", { ...ENTRUSTED_HERE, a: "2026-10-19T12:01:00.000Z" });
  await repos();
  assert.deepEqual(capacities(form).map(({ cochee: tickedOne }) => tickedOne), [true, true, false]);
  await Promise.all(form.declencher("submit"));
  await repos();
  const [input] = played.dernier("confierAUneStation") as [{ cooks: string; capacites: string[] }];
  assert.deepEqual([input.cooks, input.capacites], ["2", ["navigateur-headless", "android"]]);
});

test("une autre machine que cet ordinateur : ses cooks suivent ses cœurs, son dossier est le sien, et ses cases partent vides", async () => {
  const { jouee: played, bloc: block } = await thePage(ENTRUSTED);
  buttonUnder(block, "+ station").click();
  await repos();
  const form = block.dessous("form")[0] ?? assert.fail("pas de formulaire");
  assert.deepEqual(fieldsSeen(form), ["macbook is the station to add=true", "cooks at once=10", "workspace folder=", "a browser=false", "the Android SDK=false", "Docker=false"]);
  assert.equal(byWording(form, "workspace folder")?.placeholder, "chosen on macbook");
  assert.match(form.textContent, /recommended — from macbook's 12 cores/);
  assert.equal(form.dessous("legend").find(({ textContent }) => textContent.startsWith("What"))?.textContent, "What macbook can do");
  assert.deepEqual(new Set(capacities(form).map(({ dit: said }) => said)), new Set(["not detectable from this computer"]));
  await Promise.all(form.declencher("submit"));
  await repos();
  const [input] = played.dernier("confierAUneStation") as [{ cooks: string; capacites: string[] }];
  assert.deepEqual([input.cooks, input.capacites], ["10", []]);
});

test("cet ordinateur illisible : la raison en une ligne, son détail au survol — et les cooks, le dossier et l'ajout restent", async () => {
  const { jouee: played, bloc: block } = await thePage(ENTRUSTED_HERE, PARADE, () => ({ ajoute: "parade" }), () => ({ refus: "this computer could not be read", detail: "EACCES: /Users/chef/.config/brigade/station" }));
  buttonUnder(block, "+ station").click();
  await repos();
  const form = block.dessous("form")[0] ?? assert.fail("pas de formulaire");
  const line = visible(form, "p").find(({ className }) => className === "indisponible") ?? assert.fail("pas de ligne indisponible");
  assert.equal(line.dessous("span")[0]?.textContent, "this computer could not be read");
  assert.doesNotMatch(line.textContent, /EACCES/);
  assert.match(line.dessous("button")[0]?.ariaLabel ?? "", /EACCES/);
  // Ses cœurs publiés donnent les cooks.
  assert.equal(byWording(form, "cooks at once")?.value, "10");
  await Promise.all(form.declencher("submit"));
  await repos();
  assert.equal((played.dernier("confierAUneStation") as [{ capacites: string[] }])[0].capacites.length, 0);
});

test("une station qui sert le projet sans l'app le fait aussi : l'étiquette la nomme, et la page ne dit jamais qu'aucune ne le fait", async () => {
  const played = await playTheVue({
    demarrage: () => ({ ...startup([PARADE], WITHOUT_PROJECT), stations: { a: A, stations: [{ ...BOX, projets: ["parade"] }, MAC] } }),
    espace: () => [],
  });
  (played.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  // Le projet est servi : Rail ne dit ni « No station cooks », ni « Cooks on » — l'étiquette de l'onglet Stations dit qui le cuit.
  assert.doesNotMatch(played.element("stations-du-projet").textContent, /No station|Cooks on/);
  assert.equal(played.element("etiquette-de-station").textContent, "parade-box · cooking");
});

test("un projet écrit à la main, sans dépôt, choisit le sien parmi ceux du chef au moment de le confier", async () => {
  const { jouee: played, bloc: block } = await thePage(WITHOUT_PROJECT, { nom: "parade", dossier: "/tmp/parade" });
  buttonUnder(block, "choose its machine").click();
  await repos();
  await repos();
  const form = block.dessous("form")[0] ?? assert.fail("pas de formulaire");
  const repository = byWording(form, "repository") ?? assert.fail("pas de dépôt à choisir");
  assert.equal(repository.parentElement?.dessous("label")[0]?.textContent, "Its GitHub repository");
  assert.ok(played.appels.some(({ geste: action }) => action === "depotsDuChef"));
  repository.value = "benomite/parade";
  repository.declencher("change");
  assert.equal(byWording(form, "integration branch")?.value, "main");
});

test("tant que les stations ne sont pas lues, la page ne dit pas qu'aucune ne fait sa cuisine", async () => {
  const played = await playTheVue({ demarrage: () => ({ ...startup([PARADE], undefined), stations: undefined }), espace: () => [] });
  (played.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  assert.equal(played.element("stations-du-projet").children[0]?.textContent, "Reading your stations on GitHub…");
  assert.equal(buttonUnder(played.element("stations-du-projet"), "choose its machine").hidden, true);
});

// Un projet monté avant l'app : une station le sert déjà, l'app n'a rien gardé de lui.
const beforeTheApp = (entrust: (call: number) => Addition, project: Project = PARADE) => {
  let call = 0;
  return playTheVue({
    demarrage: () => ({ ...startup([project], WITHOUT_PROJECT), stations: { a: A, stations: [{ ...BOX, projets: ["parade"] }, MAC] } }),
    confierAUneStation: () => entrust(call++),
    defautsDeStation: () => DEFAULTS,
    depotsDuChef: () => ({ depots: [{ depot: "benomite/parade", base: "main" }] }),
    espace: () => [],
  });
};
const openTheAddition = async (played: Played) => {
  (played.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  const block = played.element("stations-du-projet");
  buttonUnder(block, "+ station").click();
  await repos();
  const form = block.dessous("form")[0] ?? assert.fail("pas de formulaire");
  return { bloc: block, formulaire: form };
};

test("le formulaire dit que toutes les stations cuisent, sans « première station » ni phrase sur le manager et la passe — sans plus parler de « backup machine »", async () => {
  const played = await beforeTheApp(() => ({ ajoute: "parade" }));
  const { bloc: block, formulaire: form } = await openTheAddition(played);
  assert.equal(form.dessous("h3")[0]?.textContent, "Add a station to parade's kitchen.");
  const sentence = "Every station cooks, takes, reviews and merges.";
  assert.equal(form.dessous("p").filter(({ textContent }) => textContent === sentence).length, 1);
  assert.equal(block.children.filter(({ textContent, hidden }) => /keeps the manager/.test(textContent) && !hidden).length, 0);
  assert.doesNotMatch(block.textContent, /backup/i);
  const source = readFileSync(join(import.meta.dirname, "../../src/vue/vue.js"), "utf8");
  assert.doesNotMatch(source, /backup machine/i);
});

test("un projet d'avant l'app : confirmer sans rien toucher l'ajoute, sans dépôt ni branche à redire — avec les cooks de la machine ajoutée", async () => {
  const played = await beforeTheApp(() => ({ ajoute: "parade" }));
  const { formulaire: form } = await openTheAddition(played);
  assert.equal(visible(form, "select").length, 0);
  assert.equal(byWording(form, "repository"), undefined);
  assert.equal(byWording(form, "integration branch"), undefined);
  assert.equal(byWording(form, "cooks at once")?.value, "10");
  await Promise.all(form.declencher("submit"));
  await repos();
  const [input] = played.dernier("confierAUneStation") as [{ stations: string[]; cooks: string }];
  assert.deepEqual([input.stations, input.cooks], [["g2"], "10"]);
  assert.match(played.element("stations-du-projet").textContent, /parade is asked of macbook/);
});

test("ce que ni la première station ni le clone ne disent se lit en une phrase : aucun champ ne paraît après le clic", async () => {
  const played = await beforeTheApp(
    (call) => (call === 0 ? { signales: { depot: "parade-box does not say which GitHub repository it serves for parade, and neither does its folder on this computer." }, manque: ["depot"] } : { ajoute: "parade" }),
    { nom: "parade", dossier: "/tmp/parade", base: "main" },
  );
  const { formulaire: form } = await openTheAddition(played);
  const before = fieldsSeen(form);
  await Promise.all(form.declencher("submit"));
  await repos();
  await repos();
  assert.match(form.textContent, /does not say which GitHub repository it serves for parade, and neither does its folder on this computer/);
  assert.equal(form.hidden, false);
  assert.deepEqual(fieldsSeen(form), before);
  assert.equal(byWording(form, "repository"), undefined);
  assert.equal(byWording(form, "integration branch"), undefined);
});
