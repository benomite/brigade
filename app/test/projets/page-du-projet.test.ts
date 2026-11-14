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
import type { Accueil } from "../../src/accueil.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { Panne } from "../../src/pannes/pannes.ts";
import { calibrageRecommande, EFFORTS, machineProposee, MODELES, stationRecommandee, type Ajout, type DefautsDeLaMachine, type VuDesProjets } from "../../src/projets/projets.ts";
import type { VuDesStations } from "../../src/stations/stations.ts";
import { type Faux, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-19T12:00:00.000Z";
const BOX = { id: "g1", nom: "parade-box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [] as Panne[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
const MAC = { id: "g2", nom: "macbook", machine: "macOS 25.0.0", coeurs: 12, etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [] as Panne[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
const STATIONS: VuDesStations = { a: A, stations: [BOX, MAC] };
const ACCUEIL: Accueil = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
// Ce que le process principal propose de chaque station, et le calibrage : sans autre projet, la valeur mesurée.
const SANS_PROJET: VuDesProjets = { a: A, projets: [], recommandee: "g1", avertissements: {}, machines: { g1: machineProposee(BOX), g2: machineProposee(MAC) }, calibrage: calibrageRecommande([]) };
const CONFIE: VuDesProjets = {
  ...SANS_PROJET,
  projets: [{ nom: "parade", depot: "benomite/parade", base: "main", suiviPar: { id: "g1", nom: "parade-box" }, stations: [{ id: "g1", nom: "parade-box", etat: "en-preparation", dit: "cloning benomite/parade", autoriser: [] }], servi: null }],
};
const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };
// Ce que l'opération du runtime calcule pour cet ordinateur (ticket 1307) : ses cooks, son dossier, ses capacités.
const DEFAUTS: DefautsDeLaMachine = {
  cooks: 5,
  cooksDit: "from this computer's 12 cores: two are kept for the kitchen itself, then about two per cook",
  espaceDeTravail: "/Users/chef/.local/state/brigade/worktrees",
  capacites: [
    { capacite: "navigateur-headless", nom: "a browser", detectee: true },
    { capacite: "android", nom: "the Android SDK", detectee: false },
    { capacite: "docker", nom: "Docker", detectee: true },
  ],
};
// Le même projet confié, quand macbook est la station de cet ordinateur.
const CONFIE_ICI: VuDesProjets = { ...CONFIE, locale: "g2" };

const demarrage = (projets: Projet[], projetsDesStations: VuDesProjets | undefined) => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  stations: STATIONS,
  accueil: ACCUEIL,
  ...(projetsDesStations === undefined ? {} : { projetsDesStations }),
});

const boutonSous = (ou: Faux, texte: string) => ou.dessous("button").find((candidat) => candidat.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} » sous ${ou.id}`);
const choix = (ou: Faux, type: string) => ou.dessous("input").filter((champ) => champ.type === type && !champ.hidden);
// Ce qui se voit sous `ou` : ni lui, ni aucun de ses parents jusqu'à `ou` n'est caché.
const montre = (ou: Faux, element: Faux) => {
  for (let pose: Faux | null = element; pose !== null && pose !== ou; pose = pose.parentElement) if (pose.hidden) return false;
  return true;
};
const visibles = (ou: Faux, balise: string) => ou.dessous(balise).filter((element) => montre(ou, element));
const parLibelle = (ou: Faux, libelle: string) => visibles(ou, "input").concat(visibles(ou, "select")).find(({ ariaLabel }) => ariaLabel === libelle);
// Une machine du choix : le libellé qui la porte, son nom et ce que la choisir implique.
const machines = (ou: Faux, type: string) =>
  choix(ou, type)
    .filter((champ) => montre(ou, champ) && champ.parentElement?.className === "machine")
    .map((champ) => {
      const ligne = champ.parentElement ?? assert.fail("une case sans libellé");
      return { nom: ligne.dessous("strong")[0]?.textContent, recommandee: ligne.dessous("span").some(({ textContent }) => textContent === "recommended"), dit: ligne.dessous("small")[0]?.textContent, choisie: champ.checked, champ };
    });

// Les capacités du formulaire : leur nom, cochée ou non, et ce qui est dit de leur détection.
const capacites = (ou: Faux) =>
  visibles(ou, "label")
    .filter(({ className }) => className === "capacite")
    .map((ligne) => ({ nom: ligne.dessous("span")[0]?.textContent, cochee: ligne.dessous("input")[0]?.checked, dit: ligne.dessous("small")[0]?.textContent }));
// Les champs que le chef voit : leur nom, et leur valeur.
const champsVus = (ou: Faux) => visibles(ou, "input").concat(visibles(ou, "select")).map(({ ariaLabel, type, value, checked }) => `${ariaLabel}=${type === "checkbox" || type === "radio" ? checked : value}`);

// L'espace de « parade », ouvert par sa case de la barre.
async function laPage(projetsDesStations: VuDesProjets | undefined, projet: Projet = PARADE, confier: () => Ajout = () => ({ ajoute: "parade" }), defauts: () => DefautsDeLaMachine = () => DEFAUTS, stations: VuDesStations = STATIONS) {
  const jouee = await jouerLaVue({
    demarrage: () => ({ ...demarrage([projet], projetsDesStations), stations }),
    confierAUneStation: confier,
    defautsDeStation: defauts,
    depotsDuChef: () => ({ depots: [{ depot: "benomite/parade", base: "main" }] }),
    espace: () => [],
  });
  (jouee.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  assert.equal(jouee.element("espace").textContent, "parade");
  return { jouee, bloc: jouee.element("stations-du-projet") };
}

test("l'écran d'ajout ne demande que le dépôt (#3181) : ni station, ni machine, ni dossier, ni branche", async () => {
  const jouee = await jouerLaVue({ demarrage: () => demarrage([], SANS_PROJET), compteGitHub: () => ({ login: "benomite" }), depotsDuChef: () => ({ depots: [{ depot: "benomite/parade", base: "v2" }] }), espace: () => [] });
  // Sans projet, l'app s'ouvre sur les stations du chef (#1434) : l'ajout est au « + » de la barre.
  (jouee.poses().find((pose) => pose.id === "entree-ajout") ?? assert.fail("pas de « + »")).click();
  await repos();
  assert.equal(jouee.element("ajout").hidden, false);
  for (const parti of ["box", "declarer", "nom", "sauvegardes", "manager-modele", "reviewer-effort", "formulaire", "dossier", "depot", "base", "parcours-de-l-ajout"]) assert.throws(() => jouee.element(parti), new RegExp(`aucun élément « ${parti} »`), parti);
  // La page ne pose plus rien dans l'écran : la vue y pose le choix du dépôt (parcours-projet/ajout.js).
  const page = readFileSync(join(import.meta.dirname, "../../src/vue/index.html"), "utf8");
  assert.match(page, /<section id="ajout" aria-label="Add a project" hidden><\/section>/);
  const ecran = jouee.element("ajout");
  assert.deepEqual(ecran.dessous("input").map((champ) => champ.type), ["search", "text"]);
  assert.deepEqual(ecran.dessous("select"), []);
  assert.doesNotMatch(ecran.textContent, /\bbox|machine|station|folder|branch/i);
});

test("un dépôt choisi n'appelle que son ouverture — sa copie, puis le fichier des projets — : aucun geste vers une station, et sa page s'ouvre", async () => {
  let jouee: Jouee | undefined;
  jouee = await jouerLaVue({
    demarrage: () => demarrage([], SANS_PROJET),
    espace: () => [],
    compteGitHub: () => ({ login: "benomite" }),
    depotsDuChef: () => ({ depots: [{ depot: "benomite/parade", base: "v2" }] }),
    ouvrirDUneStation: (nom, depot, base) => {
      // Le fichier change d'abord : la liste arrive par `surConfiguration`, comme dans l'app.
      jouee?.dire("surConfiguration", pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom, dossier: "/tmp/parade", depot, base: base ?? "" }] }), []);
      return { state: "open", project: nom, repository: depot, folder: "/tmp/parade", cloned: false };
    },
  });
  (jouee.poses().find((pose) => pose.id === "entree-ajout") ?? assert.fail("pas de « + »")).click();
  await repos();
  const appelesAvant = jouee.appels.length;
  (jouee.element("ajout").dessous("button").find((bouton) => bouton.textContent === "benomite/parade") ?? assert.fail("pas de dépôt")).click();
  await repos();
  await repos();
  assert.deepEqual(jouee.dernier("ouvrirDUneStation"), ["parade", "benomite/parade", "v2"]);
  // Ajouter ne lance rien d'autre : aucun geste vers une station, aucune machine jointe. Sa page lit le rail que
  // sa station publierait sur GitHub (#1435), et le tableau de la cuisine de son dépôt (#1588) ; l'accueil, les stations du
  // compte GitHub (#1706), les GitHub Apps de la station de cet ordinateur (#2317), les projets qu'elle sert (#2359), ses
  // humains, les stations qui y contribuent et les explications que le chef a vues (#3308) : des lectures, pas des gestes.
  assert.deepEqual(
    jouee.appels.slice(appelesAvant).map(({ geste }) => geste).filter((geste) => !["ouvrirDUneStation", "faits", "regarder", "espace", "onglet", "service", "retrait", "ordinaires", "tous", "railDuProjet", "tableauDuProjet", "stationsDuCompte", "appsDeLaStation", "projetsServis", "listerLesHumains", "listerLesStationsContributrices", "listerLesRecurrents", "lireLesExplications"].includes(geste)),
    [],
  );
  assert.equal(jouee.appels.some(({ geste }) => geste === "confierAUneStation" || geste === "ajouterAUneStation"), false);
  assert.equal(jouee.element("ajout").hidden, true);
  assert.equal(jouee.element("espace").textContent, "parade");
});

test("sans station, la page le dit en une phrase et offre le geste qui la lui confie, parmi les stations appairées", async () => {
  const { bloc } = await laPage(SANS_PROJET);
  assert.equal(bloc.hidden, false);
  assert.equal(bloc.children[0]?.textContent, "No station cooks parade yet.");
  const confier = boutonSous(bloc, "choose its machine");
  const formulaire = bloc.dessous("form")[0] ?? assert.fail("pas de formulaire");
  assert.equal(formulaire.hidden, true);
  confier.click();
  await repos();
  assert.equal(formulaire.hidden, false);
  assert.equal(confier.hidden, true);
});

test("le choix dit en tête ce que le chef fait, puis les machines — la toujours allumée proposée —, et ce que chacune implique", async () => {
  const { jouee, bloc } = await laPage(SANS_PROJET);
  boutonSous(bloc, "choose its machine").click();
  await repos();
  const formulaire = bloc.dessous("form")[0] ?? assert.fail("pas de formulaire");
  assert.equal(formulaire.dessous("h3")[0]?.textContent, "Choose the machine that cooks parade.");
  assert.match(formulaire.textContent, /change what you like, or start as it is/);
  // Le dépôt et la branche sont ceux du projet : ils ne se redemandent pas.
  assert.equal(parLibelle(formulaire, "repository"), undefined);
  assert.equal(jouee.appels.some(({ geste }) => geste === "depotsDuChef"), false);
  // Une machine à choisir, toutes de la même façon ; l'app propose la toujours allumée.
  const [stations] = formulaire.dessous("fieldset");
  assert.equal(stations?.dessous("legend")[0]?.textContent, "Machine");
  assert.doesNotMatch(formulaire.textContent, /main/i);
  assert.deepEqual(
    machines(stations ?? assert.fail(), "radio").map(({ nom, recommandee, dit, choisie }) => [nom, recommandee, dit, choisie]),
    [
      ["parade-box", true, "always on: it keeps cooking while your computer sleeps · Linux 6.1.0", true],
      ["macbook", false, "stops when you close the app on this computer · macOS 25.0.0", false],
    ],
  );
  // L'ancien avertissement jaune n'est plus : ce que choisir un ordinateur implique est sur sa ligne.
  assert.doesNotMatch(formulaire.textContent, /is a computer's app/);
  assert.equal(boutonSous(formulaire, "Start the kitchen on parade-box").type, "submit");
});

test("chaque valeur arrive posée avec d'où elle vient, sans « Advanced settings » : lancer sans rien toucher part tel quel, avec le calibrage recommandé", async () => {
  const { jouee, bloc } = await laPage(SANS_PROJET);
  boutonSous(bloc, "choose its machine").click();
  await repos();
  const formulaire = bloc.dessous("form")[0] ?? assert.fail("pas de formulaire");
  // Les cooks à la fois, tirés des cœurs de la station : 8 cœurs, 3 cooks.
  const cooks = parLibelle(formulaire, "cooks at once") ?? assert.fail("pas de cooks");
  assert.equal(cooks.value, "3");
  const champ = cooks.parentElement ?? assert.fail();
  assert.equal(champ.dessous("label")[0]?.textContent, "Cooks at once");
  assert.equal(champ.dessous("small")[0]?.textContent, "recommended — from parade-box's 8 cores: two are kept for the kitchen itself, then about two per cook");
  // Ni le modèle ni l'effort du manager et du reviewer (#3187) : ils restent dans les réglages du projet.
  assert.deepEqual(formulaire.dessous("details"), []);
  assert.deepEqual(formulaire.dessous("select").filter((liste) => montre(formulaire, liste)), []);
  assert.doesNotMatch(formulaire.textContent, /Advanced settings|manager|reviewer/i);
  // Aucun libellé dans un champ, coupé par sa largeur : chacun est écrit au-dessus du sien, ou à côté.
  for (const saisie of [...formulaire.dessous("input"), ...formulaire.dessous("select")]) assert.equal((saisie as unknown as { placeholder?: string }).placeholder ?? "", "", saisie.ariaLabel);

  await Promise.all(formulaire.declencher("submit"));
  await repos();
  const [saisie] = jouee.dernier("confierAUneStation") as [Record<string, unknown>];
  assert.deepEqual({ ...saisie, ouvertLe: "…" }, {
    nom: "parade",
    depot: "benomite/parade",
    base: "main",
    stations: ["g1"],
    cooks: "3",
    manager: { modele: "sonnet", effort: "medium" },
    reviewer: { modele: "sonnet", effort: "medium" },
    ouvertLe: "…",
  });
  assert.equal(formulaire.hidden, true);
  assert.match(bloc.textContent, /parade is asked of parade-box: it prepares it within a minute/);
});

test("le calibrage qui part est celui qui tourne déjà sur les autres projets, sans qu'il se règle ici", async () => {
  const calibrage = { manager: { modele: "opus", effort: "medium" }, reviewer: { modele: "sonnet", effort: "high" }, dit: "what cantine runs on, your project most recently given to a station" };
  const { jouee, bloc } = await laPage({ ...SANS_PROJET, calibrage });
  boutonSous(bloc, "choose its machine").click();
  await repos();
  const formulaire = bloc.dessous("form")[0] ?? assert.fail("pas de formulaire");
  assert.equal(visibles(formulaire, "select").length, 0);
  await Promise.all(formulaire.declencher("submit"));
  await repos();
  const [saisie] = jouee.dernier("confierAUneStation") as [{ manager: object; reviewer: object }];
  assert.deepEqual([saisie.manager, saisie.reviewer], [calibrage.manager, calibrage.reviewer]);
});

test("une autre machine : ses cooks suivent ses cœurs à elle, le bouton la nomme ; ce que le chef a changé reste le sien", async () => {
  const { jouee, bloc } = await laPage(SANS_PROJET);
  boutonSous(bloc, "choose its machine").click();
  await repos();
  const formulaire = bloc.dessous("form")[0] ?? assert.fail("pas de formulaire");
  const cases = () => machines(formulaire.dessous("fieldset")[0] ?? assert.fail(), "radio");
  // Deux stations, deux nombres de cœurs : chacune ses cooks, jamais ceux de l'autre (#3187).
  const mac = cases()[1]?.champ ?? assert.fail("pas de macbook");
  mac.checked = true;
  mac.declencher("change");
  assert.deepEqual(cases().map(({ nom, choisie }) => [nom, choisie]), [["parade-box", false], ["macbook", true]]);
  assert.equal(parLibelle(formulaire, "cooks at once")?.value, "5", "12 cœurs, 5 cooks");
  assert.match(formulaire.textContent, /recommended — from macbook's 12 cores/);
  boutonSous(formulaire, "Start the kitchen on macbook");
  const retour = cases()[0]?.champ ?? assert.fail();
  retour.checked = true;
  retour.declencher("change");
  assert.equal(parLibelle(formulaire, "cooks at once")?.value, "3", "8 cœurs, 3 cooks");
  assert.match(formulaire.textContent, /recommended — from parade-box's 8 cores/);
  boutonSous(formulaire, "Start the kitchen on parade-box");

  // Le chef tape ses cooks : sa valeur reste d'une relecture à l'autre, et sa provenance ne se dit plus.
  const cooks = parLibelle(formulaire, "cooks at once") ?? assert.fail();
  cooks.value = "2";
  cooks.declencher("input");
  jouee.dire("surProjetsDesStations", { ...SANS_PROJET, a: "2026-10-19T12:01:00.000Z" });
  await repos();
  assert.equal(parLibelle(formulaire, "cooks at once")?.value, "2");
  assert.doesNotMatch(formulaire.textContent, /recommended — from/);
  assert.deepEqual(cases().map(({ nom, choisie }) => [nom, choisie]), [["parade-box", true], ["macbook", false]]);

  await Promise.all(formulaire.declencher("submit"));
  await repos();
  const [saisie] = jouee.dernier("confierAUneStation") as [{ stations: string[]; cooks: string }];
  assert.deepEqual([saisie.stations, saisie.cooks], [["g1"], "2"]);
});

// Ce qui a mené le chef à ne pas pouvoir donner un projet à sa box (#3187) : une station hors ligne cochée et recommandée,
// cet ordinateur nommé par son seul nom d'hôte, ses cooks tirés des cœurs d'une autre.
const HORS_LIGNE = { ...BOX, etat: "hors-ligne", dit: "offline for 22 min", ligne: "offline for 22 min · version 1.4.0 · no project" } as const;
const ICI_ET_BOX_ETEINTE = { ...SANS_PROJET, locale: "g2", recommandee: stationRecommandee([HORS_LIGNE, MAC]) ?? null, machines: { g1: machineProposee(HORS_LIGNE), g2: machineProposee(MAC) } };

test("une station hors ligne n'est ni cochée d'office ni recommandée ; cet ordinateur vient d'abord, nommé « this computer », son nom d'hôte ensuite", async () => {
  const { jouee, bloc } = await laPage(ICI_ET_BOX_ETEINTE, PARADE, undefined, undefined, { a: A, stations: [HORS_LIGNE, MAC] });
  boutonSous(bloc, "choose its machine").click();
  await repos();
  const formulaire = bloc.dessous("form")[0] ?? assert.fail("pas de formulaire");
  const lignes = machines(formulaire, "radio");
  assert.deepEqual(
    lignes.map(({ nom, recommandee, choisie }) => [nom, recommandee, choisie]),
    [
      ["this computer", false, true],
      ["parade-box", false, false],
    ],
  );
  const [ici, box] = lignes;
  assert.deepEqual(ici?.champ.parentElement?.dessous("span").filter(({ className }) => className.includes("hote")).map(({ textContent }) => textContent), ["macbook"]);
  // Hors ligne, une ligne à elle dit depuis quand, et le geste qui la ramène.
  assert.deepEqual(box?.champ.parentElement?.dessous("small").map(({ textContent }) => textContent), [
    "always on: it keeps cooking while your computer sleeps · Linux 6.1.0",
    "Offline for 22 min: switch parade-box on, or start its brigade-station service there: it starts with the machine",
  ]);
  // Les cooks de cet ordinateur, de ses 12 cœurs à lui ; le bouton dit la machine cochée.
  assert.equal(parLibelle(formulaire, "cooks at once")?.value, "5");
  assert.match(formulaire.textContent, /recommended — from macbook's 12 cores/);
  boutonSous(formulaire, "Start the kitchen on this computer");

  // Choisie quand même, la station hors ligne reçoit le projet : la page dit qu'elle le prend à son retour.
  const eteinte = box?.champ ?? assert.fail();
  eteinte.checked = true;
  eteinte.declencher("change");
  assert.equal(parLibelle(formulaire, "cooks at once")?.value, "3", "les cœurs de parade-box, pas ceux de cet ordinateur");
  boutonSous(formulaire, "Start the kitchen on parade-box");
  await Promise.all(formulaire.declencher("submit"));
  await repos();
  const [saisie] = jouee.dernier("confierAUneStation") as [{ stations: string[]; cooks: string }];
  assert.deepEqual([saisie.stations, saisie.cooks], [["g1"], "3"]);
  assert.match(bloc.textContent, /parade-box is offline: it takes parade when it comes back\./);
});

test("aucune station en ligne : aucune n'est cochée d'office, aucune n'est recommandée", async () => {
  const MAC_ETEINT = { ...MAC, etat: "hors-ligne", dit: "offline for 3 min" } as const;
  const { bloc } = await laPage({ ...ICI_ET_BOX_ETEINTE, recommandee: stationRecommandee([HORS_LIGNE, MAC_ETEINT]) ?? null }, PARADE, undefined, undefined, { a: A, stations: [HORS_LIGNE, MAC_ETEINT] });
  boutonSous(bloc, "choose its machine").click();
  await repos();
  const formulaire = bloc.dessous("form")[0] ?? assert.fail("pas de formulaire");
  assert.deepEqual(machines(formulaire, "radio").map(({ recommandee, choisie }) => [recommandee, choisie]), [[false, false], [false, false]]);
  assert.equal(formulaire.dessous("span").some(({ textContent }) => textContent === "recommended"), false);
  assert.doesNotMatch(formulaire.textContent, /recommended — /);
  boutonSous(formulaire, "Start the kitchen");
});

test("ce qui manque se lit sous le choix, et rien ne se ferme", async () => {
  const { bloc } = await laPage(SANS_PROJET, PARADE, () => ({ signales: { cooks: "How many cooks may a station run at once for this project?" } }));
  boutonSous(bloc, "choose its machine").click();
  await repos();
  const formulaire = bloc.dessous("form")[0] ?? assert.fail("pas de formulaire");
  await Promise.all(formulaire.declencher("submit"));
  await repos();
  assert.equal(formulaire.hidden, false);
  assert.match(formulaire.textContent, /How many cooks may a station run at once for this project\?/);
});

test("confiée, Rail ne nomme plus ses stations ni n'offre « + station » : une station s'ajoute depuis l'onglet Stations (#3523)", async () => {
  const { jouee, bloc } = await laPage(CONFIE);
  assert.equal(bloc.hidden, true, "aucune ligne de stations au-dessus des colonnes");
  assert.doesNotMatch(bloc.textContent, /Cooks on/);
  assert.equal(boutonSous(bloc, "+ station").hidden, true);
  await ouvrirOnglet(jouee, "Stations");
  assert.equal(boutonSous(bloc, "+ station").hidden, true);
});

test("ce que le chef décoche ou change part tel quel ; les cases cochées restent d'une relecture à l'autre", async () => {
  const { jouee, bloc } = await laPage(CONFIE_ICI);
  boutonSous(bloc, "+ station").click();
  await repos();
  const formulaire = bloc.dessous("form")[0] ?? assert.fail("pas de formulaire");
  const docker = parLibelle(formulaire, "Docker") ?? assert.fail("pas de case Docker");
  docker.checked = false;
  docker.declencher("change");
  const android = parLibelle(formulaire, "the Android SDK") ?? assert.fail("pas de case Android");
  android.checked = true;
  android.declencher("change");
  const cooks = parLibelle(formulaire, "cooks at once") ?? assert.fail("pas de cooks");
  cooks.value = "2";
  cooks.declencher("input");
  jouee.dire("surProjetsDesStations", { ...CONFIE_ICI, a: "2026-10-19T12:01:00.000Z" });
  await repos();
  assert.deepEqual(capacites(formulaire).map(({ cochee }) => cochee), [true, true, false]);
  await Promise.all(formulaire.declencher("submit"));
  await repos();
  const [saisie] = jouee.dernier("confierAUneStation") as [{ cooks: string; capacites: string[] }];
  assert.deepEqual([saisie.cooks, saisie.capacites], ["2", ["navigateur-headless", "android"]]);
});

test("une autre machine que cet ordinateur : ses cooks suivent ses cœurs, son dossier est le sien, et ses cases partent vides", async () => {
  const { jouee, bloc } = await laPage(CONFIE);
  boutonSous(bloc, "+ station").click();
  await repos();
  const formulaire = bloc.dessous("form")[0] ?? assert.fail("pas de formulaire");
  assert.deepEqual(champsVus(formulaire), ["macbook is the station to add=true", "cooks at once=5", "workspace folder=", "a browser=false", "the Android SDK=false", "Docker=false"]);
  assert.equal(parLibelle(formulaire, "workspace folder")?.placeholder, "chosen on macbook");
  assert.match(formulaire.textContent, /recommended — from macbook's 12 cores/);
  assert.equal(formulaire.dessous("legend").find(({ textContent }) => textContent.startsWith("What"))?.textContent, "What macbook can do");
  assert.deepEqual(new Set(capacites(formulaire).map(({ dit }) => dit)), new Set(["not detectable from this computer"]));
  await Promise.all(formulaire.declencher("submit"));
  await repos();
  const [saisie] = jouee.dernier("confierAUneStation") as [{ cooks: string; capacites: string[] }];
  assert.deepEqual([saisie.cooks, saisie.capacites], ["5", []]);
});

test("cet ordinateur illisible : la raison en une ligne, son détail au survol — et les cooks, le dossier et l'ajout restent", async () => {
  const { jouee, bloc } = await laPage(CONFIE_ICI, PARADE, () => ({ ajoute: "parade" }), () => ({ refus: "this computer could not be read", detail: "EACCES: /Users/chef/.config/brigade/station" }));
  boutonSous(bloc, "+ station").click();
  await repos();
  const formulaire = bloc.dessous("form")[0] ?? assert.fail("pas de formulaire");
  const ligne = visibles(formulaire, "p").find(({ className }) => className === "indisponible") ?? assert.fail("pas de ligne indisponible");
  assert.equal(ligne.dessous("span")[0]?.textContent, "this computer could not be read");
  assert.doesNotMatch(ligne.textContent, /EACCES/);
  assert.match(ligne.dessous("button")[0]?.ariaLabel ?? "", /EACCES/);
  // Ses cœurs publiés donnent les cooks.
  assert.equal(parLibelle(formulaire, "cooks at once")?.value, "5");
  await Promise.all(formulaire.declencher("submit"));
  await repos();
  assert.equal((jouee.dernier("confierAUneStation") as [{ capacites: string[] }])[0].capacites.length, 0);
});

test("une station qui sert le projet sans l'app le fait aussi : l'étiquette la nomme, et la page ne dit jamais qu'aucune ne le fait", async () => {
  const jouee = await jouerLaVue({
    demarrage: () => ({ ...demarrage([PARADE], SANS_PROJET), stations: { a: A, stations: [{ ...BOX, projets: ["parade"] }, MAC] } }),
    espace: () => [],
  });
  (jouee.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  // Le projet est servi : Rail ne dit ni « No station cooks », ni « Cooks on » — l'étiquette de l'onglet Stations dit qui le cuit.
  assert.doesNotMatch(jouee.element("stations-du-projet").textContent, /No station|Cooks on/);
  assert.equal(jouee.element("etiquette-de-station").textContent, "parade-box · cooking");
});

test("un projet écrit à la main, sans dépôt, choisit le sien parmi ceux du chef au moment de le confier", async () => {
  const { jouee, bloc } = await laPage(SANS_PROJET, { nom: "parade", dossier: "/tmp/parade" });
  boutonSous(bloc, "choose its machine").click();
  await repos();
  await repos();
  const formulaire = bloc.dessous("form")[0] ?? assert.fail("pas de formulaire");
  const depot = parLibelle(formulaire, "repository") ?? assert.fail("pas de dépôt à choisir");
  assert.equal(depot.parentElement?.dessous("label")[0]?.textContent, "Its GitHub repository");
  assert.ok(jouee.appels.some(({ geste }) => geste === "depotsDuChef"));
  depot.value = "benomite/parade";
  depot.declencher("change");
  assert.equal(parLibelle(formulaire, "integration branch")?.value, "main");
});

test("tant que les stations ne sont pas lues, la page ne dit pas qu'aucune ne fait sa cuisine", async () => {
  const jouee = await jouerLaVue({ demarrage: () => ({ ...demarrage([PARADE], undefined), stations: undefined }), espace: () => [] });
  (jouee.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  assert.equal(jouee.element("stations-du-projet").children[0]?.textContent, "Reading your stations on GitHub…");
  assert.equal(boutonSous(jouee.element("stations-du-projet"), "choose its machine").hidden, true);
});

// Un projet monté avant l'app : une station le sert déjà, l'app n'a rien gardé de lui.
const avantLApp = (confier: (appel: number) => Ajout, projet: Projet = PARADE) => {
  let appel = 0;
  return jouerLaVue({
    demarrage: () => ({ ...demarrage([projet], SANS_PROJET), stations: { a: A, stations: [{ ...BOX, projets: ["parade"] }, MAC] } }),
    confierAUneStation: () => confier(appel++),
    defautsDeStation: () => DEFAUTS,
    depotsDuChef: () => ({ depots: [{ depot: "benomite/parade", base: "main" }] }),
    espace: () => [],
  });
};
const ouvrirLAjout = async (jouee: Jouee) => {
  (jouee.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  const bloc = jouee.element("stations-du-projet");
  boutonSous(bloc, "+ station").click();
  await repos();
  const formulaire = bloc.dessous("form")[0] ?? assert.fail("pas de formulaire");
  return { bloc, formulaire };
};

test("le formulaire dit que toutes les stations cuisent, sans « première station » ni phrase sur le manager et la passe — sans plus parler de « backup machine »", async () => {
  const jouee = await avantLApp(() => ({ ajoute: "parade" }));
  const { bloc, formulaire } = await ouvrirLAjout(jouee);
  assert.equal(formulaire.dessous("h3")[0]?.textContent, "Add a station to parade's kitchen.");
  const phrase = "Every station cooks, takes, reviews and merges.";
  assert.equal(formulaire.dessous("p").filter(({ textContent }) => textContent === phrase).length, 1);
  assert.equal(bloc.children.filter(({ textContent, hidden }) => /keeps the manager/.test(textContent) && !hidden).length, 0);
  assert.doesNotMatch(bloc.textContent, /backup/i);
  const source = readFileSync(join(import.meta.dirname, "../../src/vue/vue.js"), "utf8");
  assert.doesNotMatch(source, /backup machine/i);
});

test("un projet d'avant l'app : confirmer sans rien toucher l'ajoute, sans dépôt ni branche à redire — avec les cooks de la machine ajoutée", async () => {
  const jouee = await avantLApp(() => ({ ajoute: "parade" }));
  const { formulaire } = await ouvrirLAjout(jouee);
  assert.equal(visibles(formulaire, "select").length, 0);
  assert.equal(parLibelle(formulaire, "repository"), undefined);
  assert.equal(parLibelle(formulaire, "integration branch"), undefined);
  assert.equal(parLibelle(formulaire, "cooks at once")?.value, "5");
  await Promise.all(formulaire.declencher("submit"));
  await repos();
  const [saisie] = jouee.dernier("confierAUneStation") as [{ stations: string[]; cooks: string }];
  assert.deepEqual([saisie.stations, saisie.cooks], [["g2"], "5"]);
  assert.match(jouee.element("stations-du-projet").textContent, /parade is asked of macbook/);
});

test("ce que ni la première station ni le clone ne disent se lit en une phrase : aucun champ ne paraît après le clic", async () => {
  const jouee = await avantLApp(
    (appel) => (appel === 0 ? { signales: { depot: "parade-box does not say which GitHub repository it serves for parade, and neither does its folder on this computer." }, manque: ["depot"] } : { ajoute: "parade" }),
    { nom: "parade", dossier: "/tmp/parade", base: "main" },
  );
  const { formulaire } = await ouvrirLAjout(jouee);
  const avant = champsVus(formulaire);
  await Promise.all(formulaire.declencher("submit"));
  await repos();
  await repos();
  assert.match(formulaire.textContent, /does not say which GitHub repository it serves for parade, and neither does its folder on this computer/);
  assert.equal(formulaire.hidden, false);
  assert.deepEqual(champsVus(formulaire), avant);
  assert.equal(parLibelle(formulaire, "repository"), undefined);
  assert.equal(parLibelle(formulaire, "integration branch"), undefined);
});
