// Le projet éteint, dit honnêtement (#3454) : la vue du projet — la tête du rail — le dit en une ligne, à côté du bouton qui
// l'allume, le geste de l'interrupteur (`switch on`) ; allumé, ni la ligne ni le bouton. L'onglet Stations ne dit jamais
// « cooks this project » d'un projet éteint : sa ligne du haut dit qu'il est éteint ; allumé, elle dit qui le cuit, comme
// avant. Les deux suivent la bande dès qu'elle dit le projet allumé, sans rien recharger. L'état vient de la bande
// (alertes.ts), lue dans ce que `manager` écrit : la commande du runtime, jouée ici sur un vrai journal.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Fait } from "../../../runtime/src/evenements.ts";
import { ouvrirJournal } from "../../../runtime/src/journal.ts";
import { principal as manager } from "../../../runtime/src/manager-cli.ts";
import type { Accueil } from "../../src/accueil.ts";
import { MANAGER_ETEINT, tenirBandes, type Bande } from "../../src/alertes.ts";
import { ALLUMAGE, dire } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import type { Lecture } from "../../src/box.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { confirmationDe } from "../../src/confirmation.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { Panne } from "../../src/pannes/pannes.ts";
import { calibrageRecommande, EFFORTS, machineProposee, MODELES, type ProjetVu, type VuDesProjets } from "../../src/projets/projets.ts";
import type { StationVue, VuDesStations } from "../../src/stations/stations.ts";
import { ETEINT, hautDe, phraseDuHaut, type Servante } from "../../src/vue/stations-tab/etat.js";
import { AJOUTER } from "../../src/vue/stations-tab/stations-tab.js";
import { type Faux, type Jouee, jouerLaVue, ouvrirOnglet, type Reponses, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-13T10:00:01.000Z";
const CUISINE = { locale: { node: "node", runtime: "/tmp/runtime", racine: "/tmp/station", env: {} } };
const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };
const lecture = (commande: string, texte: string): Lecture => ({ projet: "parade", demande: 1, a: A, sorties: [{ commande, texte }] });

// `manager`, jouée sur un journal où le chef a allumé, ou éteint, le projet à 9 h 25 : sa sortie, telle quelle.
function sortieDeManager(t: TestContext, allume: boolean): string {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-app-manager-eteint-"));
  const journal = ouvrirJournal(repertoire, { maintenant: () => new Date("2026-10-13T09:25:00.000Z") });
  t.after(() => {
    journal.fermer();
    rmSync(repertoire, { recursive: true, force: true });
  });
  const fait: Fait = { type: allume ? "project.switched-on" : "project.switched-off", payload: {} };
  journal.ajouter({ project: "parade", ticket: null, author: "chef", ...fait });
  const lignes: string[] = [];
  void manager({ args: [], env: { BRIGADE_STATE_DIR: repertoire }, dire: (ligne) => void lignes.push(ligne), redire: (ligne) => assert.fail(ligne) });
  return `${lignes.join("\n")}\n`;
}

// La bande que le process principal dirait, `manager` lu — ou pas encore.
function bandeLue(sortie?: string): Bande {
  const bandes = tenirBandes({ etablir: 1, minimum: 0 });
  const [ouverte] = bandes.ouvrir(["parade"]);
  return sortie === undefined ? (ouverte ?? assert.fail("pas de bande")) : bandes.manager(lecture("manager", sortie));
}

const FAITS: Faits = {
  etat: "ouverte",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [{ ticket: 21, etat: "en attente", titre: "L'export du journal", url: "https://github.com/benomite/parade/issues/21", activite: null }],
  cooks: [],
  attend: [],
};

// La box sert parade, en ligne ; ce Mac ne le sert pas.
const BOX: StationVue = { id: "gbox", nom: "parade-box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online", pannes: [] as Panne[], dit: "online", version: "2.4.0", projets: ["parade"], max: "connectee" };
const MAC: StationVue = { id: "gmac", nom: "macbook", machine: "macOS 25.0.0", coeurs: 12, etat: "en-ligne", ligne: "online", pannes: [] as Panne[], dit: "online", version: "2.4.0", projets: [], max: "connectee" };
const ACCUEIL: Accueil = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
const SUR_LA_BOX: ProjetVu = { nom: "parade", depot: "benomite/parade", base: "main", suiviPar: { id: "gbox", nom: "parade-box" }, stations: [{ id: "gbox", nom: "parade-box", etat: "servi", dit: "", autoriser: [] }], servi: null, cuitSur: { id: "gbox", nom: "parade-box", ici: false }, demenagement: null };
const VU: VuDesProjets = { a: A, projets: [SUR_LA_BOX], locale: "gmac", recommandee: "gbox", avertissements: {}, machines: { gbox: machineProposee(BOX), gmac: machineProposee(MAC) }, calibrage: calibrageRecommande([]) };

async function ouvrir(reponses: Reponses = {}, stations: StationVue[] = [BOX, MAC]): Promise<Jouee> {
  const vue = await jouerLaVue({
    demarrage: () => ({
      configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE] }, () => true),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS,
      rubriques: RUBRIQUES,
      gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
      stations: { a: A, stations } satisfies VuDesStations,
      accueil: ACCUEIL,
      projetsDesStations: VU,
    }),
    espace: () => [],
    ...reponses,
  });
  vue.element("projets").children[1]?.click();
  await repos();
  const recue = tenirFaits().recevoir(lecture("facts", JSON.stringify(FAITS)));
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}

const ALLUMER = "switch the project on…";
const teteDuRail = (vue: Jouee): Faux | undefined => vue.element("rail").dessous("p").find(({ className }) => className === "arret-manager");
const allumer = (vue: Jouee): Faux | undefined => vue.element("rail").dessous("button").find(({ textContent }) => textContent === ALLUMER);
const bascule = (vue: Jouee): Faux => vue.element("interrupteur-projet").dessous("button").find(({ className }) => className === "bascule") ?? assert.fail("pas d'interrupteur");
const gestesPartis = (vue: Jouee) => vue.appels.filter(({ geste }) => geste === "geste").map(({ args }) => args);
const onglet = (vue: Jouee) => vue.element("rail").children.find(({ dataset }) => dataset.bloc === "stations-tab") ?? assert.fail("pas d'onglet des stations");
const haut = (vue: Jouee) => onglet(vue).children.find(({ className }) => className === "haut-des-stations") ?? assert.fail("pas de ligne du haut");
const phrase = (vue: Jouee) => haut(vue).dessous("p").find(({ className }) => className === "phrase")?.dessous("strong")[0]?.textContent ?? "";

describe("la vue du projet, le projet éteint : une ligne, et le bouton qui l'allume (#3454)", () => {
  test("éteint : la tête du rail dit qu'il est éteint, et « switch the project on… » est à côté, sur la même ligne", async (t) => {
    const vue = await ouvrir();
    vue.dire("surAlertes", bandeLue(sortieDeManager(t, false)));
    await repos();
    const tete = teteDuRail(vue) ?? assert.fail("la vue du projet ne dit pas le projet éteint");
    assert.equal(tete.dessous("strong")[0]?.textContent, MANAGER_ETEINT);
    const bouton = allumer(vue) ?? assert.fail("pas de bouton qui allume le projet");
    assert.ok(tete.dessous("button").includes(bouton), "le bouton n'est pas sur la ligne qui dit le projet éteint");
    assert.equal(vue.element("rail").dessous("p").filter(({ className }) => className === "arret-manager").length, 1);
    // La ligne `manager` de la box, mot pour mot, au survol de la ligne.
    assert.match(tete.title, /^OFF since 2026-10-13T09:25:00\.000Z \(by chef\)/);
  });

  test("allumé : ni la ligne ni le bouton ; pas encore lu non plus — ce n'est pas « éteint »", async (t) => {
    const vue = await ouvrir();
    vue.dire("surAlertes", bandeLue());
    await repos();
    assert.equal(teteDuRail(vue), undefined);
    assert.equal(allumer(vue), undefined);

    vue.dire("surAlertes", bandeLue(sortieDeManager(t, true)));
    await repos();
    assert.equal(teteDuRail(vue), undefined);
    assert.equal(allumer(vue), undefined);
    assert.doesNotMatch(vue.element("rail").textContent, /project off/);
  });

  test("le bouton l'allume : sa confirmation s'ouvre sous la ligne, « yes » fait partir `switch on`, et la vue passe à allumé sans rien recharger", async (t) => {
    const backlog = { ouvertes: 3, retenues: 0 };
    const vue = await ouvrir({
      confirmer: (_, id) => confirmationDe(id, PARADE, { sans: "pas lus" }, CUISINE),
      compter: () => ({ projet: "parade", a: A, ...backlog, dit: dire(backlog) }),
      geste: () => undefined,
    });
    vue.dire("surAlertes", bandeLue(sortieDeManager(t, false)));
    await repos();

    (allumer(vue) ?? assert.fail("pas de bouton")).click();
    await repos();
    // Le geste de l'interrupteur, le même : rien ne part avant le « oui ».
    assert.deepEqual(vue.dernier("confirmer"), ["parade", "projet-allumer"]);
    assert.deepEqual(gestesPartis(vue), []);
    const ouverte = vue.element("rail").dessous("section").find(({ className }) => className === "confirmation") ?? assert.fail("pas de confirmation sous la ligne");
    assert.match(ouverte.textContent, /it will judge the 3 open issues/);
    (ouverte.dessous("button").find(({ dataset }) => dataset.oui !== undefined) ?? assert.fail("pas de « oui »")).click();
    await repos();
    assert.deepEqual(gestesPartis(vue), [["parade", "projet-allumer", true]]);

    // La bande relue dit le projet allumé : la ligne et le bouton partent, l'interrupteur dit « project on ».
    vue.dire("surAlertes", bandeLue(sortieDeManager(t, true)));
    await repos();
    assert.equal(teteDuRail(vue), undefined);
    assert.equal(allumer(vue), undefined);
    assert.equal(bascule(vue).textContent, "project on");
  });
});

describe("l'onglet Stations, le projet éteint : jamais « cooks this project » (#3454)", () => {
  test("éteint, sa box en ligne : la ligne du haut dit le projet éteint, en gris, et où l'allumer au survol — ni « Cooked by » ni « cooks this project »", async (t) => {
    const vue = await ouvrir();
    vue.dire("surAlertes", bandeLue(sortieDeManager(t, false)));
    await repos();
    await ouvrirOnglet(vue, "Stations");
    assert.equal(phrase(vue), "Project off — nothing new is taken, split or merged");
    assert.equal(haut(vue).dataset.etat, "eteint");
    assert.equal(haut(vue).dataset.ton, "gris");
    assert.doesNotMatch(onglet(vue).textContent, /cooks this project|Cooked by/);
    assert.match(haut(vue).dessous("button").find(({ className }) => className === "aide")?.ariaLabel ?? "", /OFF since[\s\S]*switch the project on/);
    // Ses stations restent à régler : « Add a station », comme quand il cuit.
    assert.deepEqual(haut(vue).dessous("button").filter(({ className }) => className !== "aide").map(({ textContent }) => textContent), [AJOUTER]);
  });

  test("éteint, sa box hors ligne : toujours le projet éteint, jamais « parade-box cooks this project, but… »", async (t) => {
    const vue = await ouvrir({}, [{ ...BOX, etat: "hors-ligne", dit: "offline for 3 h" }, MAC]);
    vue.dire("surAlertes", bandeLue(sortieDeManager(t, false)));
    await repos();
    await ouvrirOnglet(vue, "Stations");
    assert.equal(haut(vue).dataset.etat, "eteint");
    assert.doesNotMatch(onglet(vue).textContent, /cooks this project/);
  });

  test("allumé, ou pas encore lu : « Cooked by parade-box », comme avant ; allumé sous les yeux du chef, l'onglet passe d'éteint à cuit sans rien recharger", async (t) => {
    const vue = await ouvrir();
    vue.dire("surAlertes", bandeLue());
    await repos();
    await ouvrirOnglet(vue, "Stations");
    assert.match(phrase(vue), /^Cooked by parade-box · online/);

    vue.dire("surAlertes", bandeLue(sortieDeManager(t, false)));
    await repos();
    assert.equal(haut(vue).dataset.etat, "eteint");

    vue.dire("surAlertes", bandeLue(sortieDeManager(t, true)));
    await repos();
    assert.equal(haut(vue).dataset.etat, "cuit");
    assert.equal(haut(vue).dataset.ton, "vert");
    assert.match(phrase(vue), /^Cooked by parade-box · online/);
  });

  test("la ligne du haut : éteint l'emporte sur cuit, hors ligne et personne ; un déménagement en route l'emporte sur éteint", () => {
    const servante = (etat: Servante["etat"]): Servante => ({ id: "gbox", nom: "parade-box", ici: false, sorte: "box", etat, dit: etat === "en-ligne" ? "online" : "offline for 3 h", cooks: [], agents: [] });
    const eteint = { dit: MANAGER_ETEINT, releve: "OFF since …" };
    for (const servantes of [[servante("en-ligne")], [servante("hors-ligne")], []]) {
      const sans = hautDe({ servantes, deplacement: null, maintenant: 0 });
      assert.match(phraseDuHaut(sans), /cooks this project|Cooked by/);
      const off = hautDe({ servantes, deplacement: null, maintenant: 0, eteint });
      assert.deepEqual(off, { etat: "eteint", vert: false, dit: MANAGER_ETEINT, releve: "OFF since …", servi: servantes.length > 0 });
      assert.equal(phraseDuHaut(off), ETEINT(MANAGER_ETEINT));
      assert.doesNotMatch(phraseDuHaut(off), /cooks this project|Cooked by/);
    }
    const deplacement = { de: "parade-box", vers: "macbook", depuis: 0, etape: "demandee" as const, dit: "", deEnLigne: true, versEnLigne: true };
    assert.equal(hautDe({ servantes: [servante("en-ligne")], deplacement, maintenant: 0, eteint }).etat, "deplacement");
  });
});
