// Ajouter un projet à l'app, puis confier sa cuisine à une station depuis sa page (#983), la vue
// jouée. L'écran d'ajout ne demande que le dossier, le dépôt et la branche : ni station, ni machine,
// ni nom `ssh`, et rien d'autre que le fichier des projets n'est appelé. La page du projet dit en
// une phrase qu'aucune station ne fait sa cuisine, et offre le geste qui la lui confie ; une fois
// confiée, elle nomme ses stations, et permet d'en ajouter une autre. Le choix (#1107) dit en une
// phrase ce que le chef fait, propose la machine toujours allumée, puis des renforts facultatifs, et
// arrive rempli : les cooks tirés des cœurs de la principale, le calibrage repris des autres projets,
// chacun avec d'où il vient — on peut lancer sans rien toucher.
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
import { calibrageRecommande, EFFORTS, machineProposee, MODELES, type Ajout, type VuDesProjets } from "../../src/projets/projets.ts";
import type { VuDesStations } from "../../src/stations/stations.ts";
import { type Faux, type Jouee, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-19T12:00:00.000Z";
const BOX = { id: "g1", nom: "parade-box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [] as Panne[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
const MAC = { id: "g2", nom: "macbook", machine: "macOS 25.0.0", coeurs: 12, etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [] as Panne[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
const STATIONS: VuDesStations = { a: A, stations: [BOX, MAC] };
const ACCUEIL: Accueil = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
// Ce que le process principal propose de chaque station, et le calibrage : sans autre projet, la valeur mesurée.
const SANS_PROJET: VuDesProjets = { a: A, projets: [], recommandee: "g1", avertissements: {}, machines: { g1: machineProposee(BOX), g2: machineProposee(MAC) }, calibrage: calibrageRecommande([]) };
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
    .filter((champ) => montre(ou, champ))
    .map((champ) => {
      const ligne = champ.parentElement ?? assert.fail("une case sans libellé");
      return { nom: ligne.dessous("strong")[0]?.textContent, recommandee: ligne.dessous("span").some(({ textContent }) => textContent === "recommended"), dit: ligne.dessous("small")[0]?.textContent, choisie: champ.checked, champ };
    });

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

test("le choix dit en tête ce que le chef fait, puis la machine principale — la toujours allumée proposée —, et ce que chacune implique", async () => {
  const { jouee, bloc } = await laPage(SANS_PROJET);
  boutonSous(bloc, "choose its machine").click();
  await repos();
  const formulaire = bloc.dessous("form")[0] ?? assert.fail("pas de formulaire");
  assert.equal(formulaire.dessous("h3")[0]?.textContent, "Choose the machine that runs parade's kitchen.");
  assert.match(formulaire.textContent, /change what you like, or start as it is/);
  // Le dépôt et la branche sont ceux du projet : ils ne se redemandent pas.
  assert.equal(parLibelle(formulaire, "repository"), undefined);
  assert.equal(jouee.appels.some(({ geste }) => geste === "depotsDuChef"), false);
  // La principale d'abord, un choix simple entre les machines.
  const [principale, renforts] = formulaire.dessous("fieldset");
  assert.equal(principale?.dessous("legend")[0]?.textContent, "Main machine");
  assert.deepEqual(
    machines(principale ?? assert.fail(), "radio").map(({ nom, recommandee, dit, choisie }) => [nom, recommandee, dit, choisie]),
    [
      ["parade-box", true, "always on: it keeps cooking while your computer sleeps · Linux 6.1.0", true],
      ["macbook", false, "stops when you close the app on this computer · macOS 25.0.0", false],
    ],
  );
  // Les renforts ensuite, facultatifs, et ce à quoi ils servent ; la principale n'y est pas.
  assert.equal(renforts?.dessous("legend")[0]?.textContent, "Other stations · optional");
  assert.match(renforts?.textContent ?? "", /All the stations cook the tickets; only the main machine runs the manager and the pass\./);
  assert.deepEqual(machines(renforts ?? assert.fail(), "checkbox").map(({ nom, choisie }) => [nom, choisie]), [["macbook", false]]);
  // L'ancien avertissement jaune n'est plus : ce que choisir un ordinateur implique est sur sa ligne.
  assert.doesNotMatch(formulaire.textContent, /is a computer's app/);
  assert.equal(boutonSous(formulaire, "Start the kitchen on parade-box").type, "submit");
});

test("chaque valeur arrive posée avec d'où elle vient, le calibrage replié sous « advanced settings » : lancer sans rien toucher part tel quel", async () => {
  const { jouee, bloc } = await laPage(SANS_PROJET);
  boutonSous(bloc, "choose its machine").click();
  await repos();
  const formulaire = bloc.dessous("form")[0] ?? assert.fail("pas de formulaire");
  // Les cooks à la fois, tirés des cœurs de la principale : 8 cœurs, 3 cooks.
  const cooks = parLibelle(formulaire, "cooks at once") ?? assert.fail("pas de cooks");
  assert.equal(cooks.value, "3");
  const champ = cooks.parentElement ?? assert.fail();
  assert.equal(champ.dessous("label")[0]?.textContent, "Cooks at once");
  assert.equal(champ.dessous("small")[0]?.textContent, "recommended — from parade-box's 8 cores: two are kept for the kitchen itself, then about two per cook");
  // Le calibrage, replié, dit quand même ce qui partira ; déplié, ce qu'il règle et d'où il vient.
  const avances = formulaire.dessous("details")[0] ?? assert.fail("pas de réglages avancés");
  assert.equal((avances as unknown as { open: boolean }).open, false);
  assert.equal(avances.dessous("summary")[0]?.textContent, "Advanced settingsmanager sonnet / medium · reviewer sonnet / medium");
  assert.match(avances.textContent, /the manager, which judges the tickets and splits the epics, and of the reviewer, which reviews the deliveries — and so the share of your quota they use/);
  assert.match(avances.textContent, /recommended — the starting value measured on brigade's own box, for lack of another project on your stations/);
  assert.deepEqual(avances.dessous("select").map(({ ariaLabel, value }) => [ariaLabel, value]), [
    ["manager model", "sonnet"],
    ["manager effort", "medium"],
    ["reviewer model", "sonnet"],
    ["reviewer effort", "medium"],
  ]);
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
    principale: "g1",
    cooks: "3",
    manager: { modele: "sonnet", effort: "medium" },
    reviewer: { modele: "sonnet", effort: "medium" },
    ouvertLe: "…",
  });
  assert.equal(formulaire.hidden, true);
  assert.match(bloc.textContent, /parade is asked of parade-box: its main station prepares it within a minute/);
});

test("le calibrage proposé est celui qui tourne déjà sur les autres projets, et dit lequel", async () => {
  const calibrage = { manager: { modele: "opus", effort: "medium" }, reviewer: { modele: "sonnet", effort: "high" }, dit: "what cantine runs on, your project most recently given to a station" };
  const { bloc } = await laPage({ ...SANS_PROJET, calibrage });
  boutonSous(bloc, "choose its machine").click();
  await repos();
  const avances = bloc.dessous("details")[0] ?? assert.fail("pas de réglages avancés");
  assert.deepEqual(avances.dessous("select").map(({ value }) => value), ["opus", "medium", "sonnet", "high"]);
  assert.match(avances.textContent, /recommended — what cantine runs on, your project most recently given to a station/);
  assert.equal(avances.dessous("summary")[0]?.textContent, "Advanced settingsmanager opus / medium · reviewer sonnet / high");
});

test("une autre principale : ses cooks suivent ses cœurs, le bouton la nomme ; ce que le chef a changé reste le sien", async () => {
  const { jouee, bloc } = await laPage(SANS_PROJET);
  boutonSous(bloc, "choose its machine").click();
  await repos();
  const formulaire = bloc.dessous("form")[0] ?? assert.fail("pas de formulaire");
  const [principale] = formulaire.dessous("fieldset");
  const mac = machines(principale ?? assert.fail(), "radio")[1]?.champ ?? assert.fail("pas de macbook");
  mac.checked = true;
  mac.declencher("change");
  assert.equal(parLibelle(formulaire, "cooks at once")?.value, "5", "12 cœurs, 5 cooks");
  boutonSous(formulaire, "Start the kitchen on macbook");
  // La nouvelle principale n'est plus un renfort possible ; l'ancienne le devient.
  const [, renforts] = formulaire.dessous("fieldset");
  assert.deepEqual(machines(renforts ?? assert.fail(), "checkbox").map(({ nom }) => nom), ["parade-box"]);
  const renfort = machines(renforts ?? assert.fail(), "checkbox")[0]?.champ ?? assert.fail();
  renfort.checked = true;
  renfort.declencher("change");

  // Le chef tape ses cooks et change un effort : sa valeur reste, et sa provenance ne se dit plus.
  const cooks = parLibelle(formulaire, "cooks at once") ?? assert.fail();
  cooks.value = "2";
  cooks.declencher("input");
  const effort = parLibelle(formulaire, "reviewer effort") ?? assert.fail();
  effort.value = "high";
  effort.declencher("change");
  jouee.dire("surProjetsDesStations", { ...SANS_PROJET, a: "2026-10-19T12:01:00.000Z" });
  await repos();
  assert.equal(parLibelle(formulaire, "cooks at once")?.value, "2");
  assert.equal(parLibelle(formulaire, "reviewer effort")?.value, "high");
  assert.doesNotMatch(formulaire.textContent, /recommended — from/);
  assert.match(formulaire.dessous("summary")[0]?.textContent ?? "", /reviewer sonnet \/ high$/);

  await Promise.all(formulaire.declencher("submit"));
  await repos();
  const [saisie] = jouee.dernier("confierAUneStation") as [{ stations: string[]; principale: string; cooks: string; reviewer: object }];
  assert.deepEqual([saisie.stations, saisie.principale, saisie.cooks, saisie.reviewer], [["g2", "g1"], "g2", "2", { modele: "sonnet", effort: "high" }]);
});

test("ce qui manque se lit sous le choix, et rien ne se ferme", async () => {
  const { bloc } = await laPage(SANS_PROJET, PARADE, () => ({ signales: { cooks: "How many cooks may the main station run at once for this project?" } }));
  boutonSous(bloc, "choose its machine").click();
  await repos();
  const formulaire = bloc.dessous("form")[0] ?? assert.fail("pas de formulaire");
  await Promise.all(formulaire.declencher("submit"));
  await repos();
  assert.equal(formulaire.hidden, false);
  assert.match(formulaire.textContent, /How many cooks may the main station run at once for this project\?/);
});

test("confiée, la page nomme les stations qui font sa cuisine, et « + station » n'offre que des renforts, sans principale ni calibrage à redire", async () => {
  const { jouee, bloc } = await laPage(CONFIE);
  const ligne = bloc.children[0] ?? assert.fail("pas de ligne");
  assert.equal(ligne.textContent, "Cooks on parade-box");
  const station = ligne.dessous("button")[0] ?? assert.fail("la station ne s'ouvre pas");
  assert.equal(station.ariaLabel, "parade-box — main — being prepared");
  assert.match(station.title, /cloning benomite\/parade/);

  boutonSous(bloc, "+ station").click();
  await repos();
  const formulaire = bloc.dessous("form")[0] ?? assert.fail("pas de formulaire");
  assert.equal(formulaire.dessous("h3")[0]?.textContent, "Add a station to parade's kitchen.");
  assert.deepEqual(machines(formulaire, "checkbox").map(({ nom }) => nom), ["macbook"]);
  assert.deepEqual(machines(formulaire, "radio"), []);
  assert.equal(visibles(formulaire, "select").length, 0);
  assert.equal(parLibelle(formulaire, "cooks at once"), undefined);
  assert.equal(visibles(formulaire, "details").length, 0);
  boutonSous(formulaire, "Add to the kitchen");

  const renfort = machines(formulaire, "checkbox")[0]?.champ ?? assert.fail("pas de case");
  renfort.checked = true;
  renfort.declencher("change");
  boutonSous(formulaire, "Add macbook to the kitchen");
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
  assert.equal(jouee.element("stations-du-projet").children[0]?.textContent, "Cooks on parade-box");
  assert.doesNotMatch(jouee.element("stations-du-projet").textContent, /No station/);
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
  assert.equal(jouee.element("stations-du-projet").children[0]?.textContent, "reading your stations on GitHub…");
  assert.equal(boutonSous(jouee.element("stations-du-projet"), "choose its machine").hidden, true);
});

// Un projet monté avant l'app : une station le sert déjà, l'app n'a rien gardé de lui.
const avantLApp = (confier: (appel: number) => Ajout, projet: Projet = PARADE) => {
  let appel = 0;
  return jouerLaVue({
    demarrage: () => ({ ...demarrage([projet], SANS_PROJET), stations: { a: A, stations: [{ ...BOX, projets: ["parade"] }, MAC] } }),
    confierAUneStation: () => confier(appel++),
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
  const renfort = machines(formulaire, "checkbox")[0]?.champ ?? assert.fail("pas de case");
  renfort.checked = true;
  renfort.declencher("change");
  return { bloc, formulaire };
};

test("la page et le formulaire disent que la première station garde le manager et la passe, et que toutes cuisent — sans plus parler de « backup machine »", async () => {
  const jouee = await avantLApp(() => ({ ajoute: "parade" }));
  const { bloc, formulaire } = await ouvrirLAjout(jouee);
  assert.equal(formulaire.dessous("h3")[0]?.textContent, "Add a station to parade's kitchen.");
  const phrase = "The first station keeps the manager and the pass; all the stations cook.";
  assert.equal(formulaire.dessous("p").filter(({ textContent }) => textContent === phrase).length, 1);
  assert.equal(bloc.children.filter(({ textContent, hidden }) => textContent === phrase && !hidden).length, 1);
  assert.doesNotMatch(bloc.textContent, /backup/i);
  const source = readFileSync(join(import.meta.dirname, "../../src/vue/vue.js"), "utf8");
  assert.doesNotMatch(source, /backup machine/i);
});

test("un projet d'avant l'app : cocher une machine et confirmer l'ajoute sans qu'aucun champ soit redit ni montré", async () => {
  const jouee = await avantLApp(() => ({ ajoute: "parade" }));
  const { formulaire } = await ouvrirLAjout(jouee);
  assert.equal(visibles(formulaire, "select").length, 0);
  assert.equal(parLibelle(formulaire, "integration branch"), undefined);
  assert.equal(parLibelle(formulaire, "cooks at once"), undefined);
  await Promise.all(formulaire.declencher("submit"));
  await repos();
  const [saisie] = jouee.dernier("confierAUneStation") as [{ stations: string[]; principale: string; cooks: string }];
  assert.deepEqual([saisie.stations, saisie.principale, saisie.cooks], [["g2"], "", ""]);
  assert.match(jouee.element("stations-du-projet").textContent, /parade is asked of macbook/);
});

test("une valeur que la première station ne dit pas se montre, posée de ce qu'on devine : seuls les champs visibles se demandent", async () => {
  const jouee = await avantLApp(
    (appel) => (appel === 0 ? { signales: { depot: "parade-box does not say which GitHub repository it serves for parade: give the repository.", cooks: "parade-box does not say how many cooks it may run at once for parade: give the cook cap." }, manque: ["depot", "cooks"] } : { ajoute: "parade" }),
    { nom: "parade", dossier: "/tmp/parade", base: "main" },
  );
  const { formulaire } = await ouvrirLAjout(jouee);
  assert.equal(parLibelle(formulaire, "repository"), undefined);
  await Promise.all(formulaire.declencher("submit"));
  await repos();
  await repos();
  assert.match(formulaire.textContent, /does not say which GitHub repository/);
  assert.equal(formulaire.hidden, false);
  // Le dépôt et les cooks se montrent, posés ; la branche, que rien ne demandait, reste cachée.
  const depot = parLibelle(formulaire, "repository") ?? assert.fail("le dépôt ne se montre pas");
  assert.equal(parLibelle(formulaire, "integration branch"), undefined);
  const cooks = parLibelle(formulaire, "cooks at once") ?? assert.fail("les cooks ne se montrent pas");
  assert.notEqual(cooks.value, "");
  depot.value = "benomite/parade";
  cooks.value = "4";
  cooks.declencher("input");
  await Promise.all(formulaire.declencher("submit"));
  await repos();
  const [saisie] = jouee.dernier("confierAUneStation") as [{ depot: string; base: string; cooks: string }];
  assert.deepEqual([saisie.depot, saisie.base, saisie.cooks], ["benomite/parade", "main", "4"]);
});
