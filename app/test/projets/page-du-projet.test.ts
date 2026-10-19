// Ajouter un projet à l'app, puis confier sa cuisine à une station depuis sa page (#983), la vue
// jouée. L'écran d'ajout ne demande que le dossier, le dépôt et la branche : ni station, ni machine,
// ni nom `ssh`, et rien d'autre que le fichier des projets n'est appelé. La page du projet dit en
// une phrase qu'aucune station ne fait sa cuisine, et offre le geste qui la lui confie ; une fois
// confiée, elle nomme ses stations, et permet d'en ajouter une autre.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { Accueil } from "../../src/accueil.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { GESTES_DU_MANAGER } from "../../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { Panne } from "../../src/pannes/pannes.ts";
import { EFFORTS, MODELES, type Ajout, type VuDesProjets } from "../../src/projets/projets.ts";
import type { VuDesStations } from "../../src/stations/stations.ts";
import { type Faux, type Jouee, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-19T12:00:00.000Z";
const BOX = { id: "g1", nom: "parade-box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [] as Panne[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
const MAC = { id: "g2", nom: "macbook", machine: "macOS 25.0.0", etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [] as Panne[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
const STATIONS: VuDesStations = { a: A, stations: [BOX, MAC] };
const ACCUEIL: Accueil = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
const SANS_PROJET: VuDesProjets = { a: A, projets: [], recommandee: "g1", avertissements: {} };
const CONFIE: VuDesProjets = {
  ...SANS_PROJET,
  projets: [{ nom: "parade", depot: "benomite/parade", base: "main", stations: [{ id: "g1", nom: "parade-box", principale: true, etat: "en-preparation", dit: "cloning benomite/parade", autoriser: [] }], servi: null }],
};
const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };

const demarrage = (projets: Projet[], projetsDesStations: VuDesProjets | undefined) => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  stations: STATIONS,
  accueil: ACCUEIL,
  ...(projetsDesStations === undefined ? {} : { projetsDesStations }),
});

const boutonSous = (ou: Faux, texte: string) => ou.dessous("button").find((candidat) => candidat.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} » sous ${ou.id}`);
const choix = (ou: Faux, type: string) => ou.dessous("input").filter((champ) => champ.type === type && !champ.hidden);
const visibles = (formulaire: Faux, balise: string) => formulaire.children.filter((enfant) => enfant.balise === balise && !enfant.hidden);

// L'espace de « parade », ouvert par sa case de la barre.
async function laPage(projetsDesStations: VuDesProjets | undefined, projet: Projet = PARADE, confier: () => Ajout = () => ({ ajoute: "parade" })) {
  const jouee = await jouerLaVue({
    demarrage: () => demarrage([projet], projetsDesStations),
    confierAUneStation: confier,
    depotsDuChef: () => ({ depots: [{ depot: "benomite/parade", base: "main" }] }),
    espace: () => [],
  });
  (jouee.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  assert.equal(jouee.element("espace").textContent, "parade");
  return { jouee, bloc: jouee.element("stations-du-projet") };
}

test("l'écran d'ajout ne demande que le dossier, le dépôt et la branche : ni station, ni machine, ni nom `ssh`", async () => {
  const jouee = await jouerLaVue({ demarrage: () => demarrage([], SANS_PROJET), espace: () => [] });
  const formulaire = jouee.element("formulaire");
  assert.equal(jouee.element("ajout").hidden, false, "sans projet, l'app s'ouvre sur l'ajout");
  for (const parti of ["hote", "box", "declarer", "nom", "sauvegardes", "manager-modele", "reviewer-effort"]) assert.throws(() => jouee.element(parti), new RegExp(`aucun élément « ${parti} »`), parti);
  // Ce qui se saisit dans l'écran, tel que la page le pose.
  const page = readFileSync(join(import.meta.dirname, "../../src/vue/index.html"), "utf8");
  const ecran = page.slice(page.indexOf('<form id="formulaire"'), page.indexOf("</form>"));
  assert.deepEqual([...ecran.matchAll(/<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"/g)].map(([, id]) => id), ["depot", "base"]);
  assert.doesNotMatch(ecran, /\bbox|\bssh\b|machine/i);
  assert.equal(formulaire.hidden, false);
  assert.match(ecran, /<button type="submit" id="ajouter">Add to the app<\/button>/);
});

test("le dossier choisi propose son dépôt et sa branche ; ajouté, le projet n'appelle que le fichier des projets, et sa page s'ouvre", async () => {
  let jouee: Jouee | undefined;
  jouee = await jouerLaVue({
    demarrage: () => demarrage([], SANS_PROJET),
    espace: () => [],
    choisirDossier: () => "/tmp/parade",
    lireClone: () => ({ depot: "benomite/parade", base: "v2", raisons: {} }),
    ajouter: (saisie) => {
      // Le fichier change d'abord : la liste arrive par `surConfiguration`, comme dans l'app.
      jouee?.dire("surConfiguration", pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: saisie.dossier, depot: saisie.depot, base: saisie.base }] }), []);
      return { etat: "ajoute", nom: "parade" };
    },
  });
  jouee.element("dossier").click();
  await repos();
  await repos();
  assert.equal(jouee.element("depot").value, "benomite/parade");
  assert.equal(jouee.element("base").value, "v2");
  const appelesAvant = jouee.appels.length;
  await Promise.all(jouee.element("formulaire").declencher("submit"));
  await repos();
  await repos();
  assert.deepEqual(jouee.dernier("ajouter"), [{ dossier: "/tmp/parade", depot: "benomite/parade", base: "v2" }]);
  // Ajouter ne lance rien d'autre : aucun geste vers une station, aucune machine jointe.
  assert.deepEqual(
    jouee.appels.slice(appelesAvant).map(({ geste }) => geste).filter((geste) => !["ajouter", "faits", "regarder", "espace", "onglet", "service", "retrait", "ordinaires", "tous"].includes(geste)),
    [],
  );
  assert.equal(jouee.appels.some(({ geste }) => geste === "confierAUneStation" || geste === "ajouterAUneStation"), false);
  assert.equal(jouee.element("espace").textContent, "parade", "sa page s'ouvre");
  assert.match(jouee.element("stations-du-projet").textContent, /^No station cooks parade yet\./);
});

test("sans station, la page le dit en une phrase et offre le geste qui la lui confie, parmi les stations appairées", async () => {
  const { jouee, bloc } = await laPage(SANS_PROJET);
  assert.equal(bloc.hidden, false);
  assert.equal(bloc.children[0]?.textContent, "No station cooks parade yet.");
  const confier = boutonSous(bloc, "entrust it to a station");
  const formulaire = bloc.dessous("form")[0] ?? assert.fail("pas de formulaire");
  assert.equal(formulaire.hidden, true);
  confier.click();
  await repos();
  assert.equal(formulaire.hidden, false);
  assert.equal(confier.hidden, true);
  // Le dépôt et la branche sont ceux du projet : ils ne se redemandent pas.
  assert.equal(visibles(formulaire, "select").some(({ ariaLabel }) => ariaLabel === "repository"), false);
  assert.equal(jouee.appels.some(({ geste }) => geste === "depotsDuChef"), false);
  // Une case par station appairée, et sa principale — le serveur proposé d'office.
  assert.deepEqual(choix(formulaire, "checkbox").map(({ ariaLabel, checked }) => [ariaLabel, checked]), [["serve it on parade-box", true], ["serve it on macbook", false]]);
  assert.deepEqual(choix(formulaire, "radio").map(({ checked }) => checked), [true, false]);
  // Son plafond et son calibrage : c'est sa première station.
  assert.equal(visibles(formulaire, "input").some(({ ariaLabel }) => ariaLabel === "cooks at once"), true);
  assert.equal(visibles(formulaire, "select").length, 4);

  for (const liste of visibles(formulaire, "select")) liste.value = liste.ariaLabel.endsWith("model") ? "sonnet" : "medium";
  const cooks = visibles(formulaire, "input").find(({ ariaLabel }) => ariaLabel === "cooks at once") ?? assert.fail("pas de plafond");
  cooks.value = "2";
  await Promise.all(formulaire.declencher("submit"));
  await repos();
  const [saisie] = jouee.dernier("confierAUneStation") as [Record<string, unknown>];
  assert.deepEqual({ ...saisie, ouvertLe: "…" }, {
    nom: "parade",
    depot: "benomite/parade",
    base: "main",
    stations: ["g1"],
    principale: "g1",
    cooks: "2",
    manager: { modele: "sonnet", effort: "medium" },
    reviewer: { modele: "sonnet", effort: "medium" },
    ouvertLe: "…",
  });
  assert.equal(formulaire.hidden, true);
  assert.match(bloc.textContent, /parade is asked of parade-box: its main station prepares it within a minute/);
});

test("ce qui manque se lit sous le choix, et rien ne se ferme", async () => {
  const { bloc } = await laPage(SANS_PROJET, PARADE, () => ({ signales: { cooks: "How many cooks may the main station run at once for this project?" } }));
  boutonSous(bloc, "entrust it to a station").click();
  await repos();
  const formulaire = bloc.dessous("form")[0] ?? assert.fail("pas de formulaire");
  await Promise.all(formulaire.declencher("submit"));
  await repos();
  assert.equal(formulaire.hidden, false);
  assert.match(formulaire.textContent, /How many cooks may the main station run at once for this project\?/);
});

test("confiée, la page nomme les stations qui font sa cuisine, et « + station » n'offre que les autres, sans principale ni calibrage à redire", async () => {
  const { jouee, bloc } = await laPage(CONFIE);
  const ligne = bloc.children[0] ?? assert.fail("pas de ligne");
  assert.equal(ligne.textContent, "Cooked by parade-box (main)");
  const station = ligne.dessous("button")[0] ?? assert.fail("la station ne s'ouvre pas");
  assert.equal(station.ariaLabel, "parade-box — main — being prepared");
  assert.match(station.title, /cloning benomite\/parade/);

  boutonSous(bloc, "+ station").click();
  await repos();
  const formulaire = bloc.dessous("form")[0] ?? assert.fail("pas de formulaire");
  assert.deepEqual(choix(formulaire, "checkbox").map(({ ariaLabel }) => ariaLabel), ["serve it on macbook"]);
  assert.deepEqual(choix(formulaire, "radio"), []);
  assert.equal(visibles(formulaire, "select").length, 0);
  assert.equal(visibles(formulaire, "input").some(({ ariaLabel }) => ariaLabel === "cooks at once"), false);

  (choix(formulaire, "checkbox")[0] ?? assert.fail("pas de case")).checked = true;
  choix(formulaire, "checkbox")[0]?.declencher("change");
  await Promise.all(formulaire.declencher("submit"));
  await repos();
  const [saisie] = jouee.dernier("confierAUneStation") as [{ stations: string[]; principale: string }];
  assert.deepEqual([saisie.stations, saisie.principale], [["g2"], ""]);
  assert.match(bloc.textContent, /parade is asked of macbook: each prepares it within a minute/);

  // Un clic sur une station ouvre sa page.
  station.click();
  await repos();
  assert.equal(jouee.element("tous").hidden, false);
  assert.equal(jouee.element("station").dessous("h2")[0]?.textContent, "parade-box");
});

test("une station qui sert le projet sans l'app le fait aussi : la page la nomme, et ne dit jamais qu'aucune ne le fait", async () => {
  const jouee = await jouerLaVue({
    demarrage: () => ({ ...demarrage([PARADE], SANS_PROJET), stations: { a: A, stations: [{ ...BOX, projets: ["parade"] }, MAC] } }),
    espace: () => [],
  });
  (jouee.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  assert.equal(jouee.element("stations-du-projet").children[0]?.textContent, "Cooked by parade-box (main)");
  assert.doesNotMatch(jouee.element("stations-du-projet").textContent, /No station/);
});

test("un projet écrit à la main, sans dépôt, choisit le sien parmi ceux du chef au moment de le confier", async () => {
  const { jouee, bloc } = await laPage(SANS_PROJET, { nom: "parade", dossier: "/tmp/parade" });
  boutonSous(bloc, "entrust it to a station").click();
  await repos();
  await repos();
  const formulaire = bloc.dessous("form")[0] ?? assert.fail("pas de formulaire");
  const depot = visibles(formulaire, "select").find(({ ariaLabel }) => ariaLabel === "repository") ?? assert.fail("pas de dépôt à choisir");
  assert.ok(jouee.appels.some(({ geste }) => geste === "depotsDuChef"));
  depot.value = "benomite/parade";
  depot.declencher("change");
  assert.equal(visibles(formulaire, "input").find(({ ariaLabel }) => ariaLabel === "integration branch")?.value, "main");
});

test("tant que les stations ne sont pas lues, la page ne dit pas qu'aucune ne fait sa cuisine", async () => {
  const jouee = await jouerLaVue({ demarrage: () => ({ ...demarrage([PARADE], undefined), stations: undefined }), espace: () => [] });
  (jouee.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  assert.equal(jouee.element("stations-du-projet").children[0]?.textContent, "reading your stations on GitHub…");
  assert.equal(boutonSous(jouee.element("stations-du-projet"), "entrust it to a station").hidden, true);
});
