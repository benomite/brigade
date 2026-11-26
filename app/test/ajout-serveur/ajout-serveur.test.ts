// « Add a server » (#4347) : de l'onglet Stations d'un projet qu'aucune station ne cuit, et de la question « Who cooks
// <owner/repo>? » d'un projet neuf, le chef ouvre le panneau, lit la commande d'installation d'une ligne — celle de
// docs/installation-station.md, au caractère près —, voit la station attendue à son premier signe, puis appairée, et lui
// confie le projet par « Choose who cooks it ». La vue est jouée entière contre le faux pont, avec les doublures de
// `claude` et de `ssh` (docs/app.md, « For app developers ») : ni l'une ni l'autre n'est atteinte.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import type { StationAppairee, StationsDuChef } from "../../src/premier-lancement.ts";
import type { StationEnregistree } from "../../src/stations-du-compte.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { calibrageRecommande, EFFORTS, MODELES, type VuDesProjets } from "../../src/projets/projets.ts";
import type { VuDesStations } from "../../src/stations/stations.ts";
import { AJOUTER_UN_SERVEUR, APPAIREE, apresLecture, COMMANDE_DU_SERVEUR, EN_ATTENTE, FERMER, LECTURE, RELIRE, SANS_REPONSE, SUR_UN_MAC, entreeDuServeur } from "../../src/vue/ajout-serveur/ajout-serveur.js";
import { poserParcoursPremierProjet } from "../../src/vue/parcours-premier-projet/parcours-premier-projet.js";
import { CHOISIR } from "../../src/vue/stations-tab/etat.js";
import { poserLOngletDesStations } from "../../src/vue/stations-tab/stations-tab.js";
import { Faux, jouerLaVue, ouvrirOnglet, repos } from "../aides/fausse-vue.ts";

process.env.BRIGADE_CLAUDE_BIN = join(import.meta.dirname, "../aides/faux-claude.sh");
process.env.BRIGADE_SSH_BIN = "/nonexistent/fake-ssh";

const doc = { createElement: (balise: string) => new Faux(balise) };
const texte = (racine: Faux) => [...racine.descendants()].map((n) => n.textContent).join("\n");
const boutons = (racine: Faux, libelle: string) => racine.dessous("button").filter((b) => b.textContent === libelle);
const DOCUMENTEE = /curl -fsSL \S+\/station\/installer-station\.sh \| sh/.exec(readFileSync(new URL("../../../docs/installation-station.md", import.meta.url), "utf8"))?.[0];

const appairee = (id: string, name: string, cooks = true): StationAppairee => ({ id, name, machine: "Linux", kind: null, cooks, version: "2.4.0", online: true, lastSeen: "2026-11-26T10:00:00Z", stoppedAt: null, projects: [] });
const LISTEE = (stations: StationAppairee[]): StationsDuChef => ({ state: "listed", stations, unreadable: [] });
const enregistree = (id: string, name: string): StationEnregistree => ({ id, name, platform: "linux", machine: "Linux", version: "2.4.0", account: "chef", available: true, registeredAt: "2026-11-26T10:00:00Z", lastSeen: new Date().toISOString(), stoppedAt: null, refreshMs: 30_000, selection: null });

const A = "2026-11-26T10:00:00.000Z";
const SANS_STATION: VuDesProjets = {
  a: A,
  projets: [{ nom: "parade", depot: "chef/parade", base: "main", suiviPar: null, stations: [], servi: null, cuitSur: null, demenagement: null }],
  locale: null,
  recommandee: null,
  avertissements: {},
  machines: {},
  calibrage: calibrageRecommande([]),
};

describe("the command of the panel", () => {
  test("is the documented one-liner, character for character", () => {
    assert.equal(COMMANDE_DU_SERVEUR, DOCUMENTEE);
  });
});

describe("apresLecture: where the awaited station stands after a reading of your stations", () => {
  test("the first reading only learns the stations already there: the panel waits", () => {
    const { etat, connues } = apresLecture(undefined, LISTEE([appairee("g1", "laptop")]));
    assert.deepEqual(etat, { lecture: "attente" });
    assert.deepEqual([...(connues ?? [])], ["g1"]);
  });
  test("a station that cooks and was not known is the paired server", () => {
    const { etat } = apresLecture(new Set(["g1"]), LISTEE([appairee("g1", "laptop"), appairee("g9", "parade-box")]));
    assert.deepEqual(etat, { lecture: "appairee", id: "g9", nom: "parade-box" });
  });
  test("a known station, or a new phone, is not: the panel still waits", () => {
    assert.deepEqual(apresLecture(new Set(["g1"]), LISTEE([appairee("g1", "laptop")])).etat, { lecture: "attente" });
    assert.deepEqual(apresLecture(new Set(["g1"]), LISTEE([appairee("g1", "laptop"), appairee("g5", "pixel", false)])).etat, { lecture: "attente" });
  });
  test("a reading that fails says its reason and keeps what was known — never a wait", () => {
    const connues = new Set(["g1"]);
    const echec = apresLecture(connues, { state: "unavailable", cause: "network", reason: "GitHub could not be reached.", detail: "ETIMEDOUT" });
    assert.deepEqual(echec, { etat: { lecture: "illisible", raison: "GitHub could not be reached.", detail: "ETIMEDOUT" }, connues });
    assert.deepEqual(apresLecture(undefined, { state: "unavailable", cause: "github", reason: "No answer." }).etat, { lecture: "illisible", raison: "No answer.", detail: "" });
    const connexion = apresLecture(undefined, { state: "sign-in-required", reason: "Sign in to GitHub first.", action: { id: "github-sign-in", label: "sign in", command: ["gh", "auth", "login"] } });
    assert.deepEqual(connexion, { etat: { lecture: "illisible", raison: "Sign in to GitHub first.", detail: "" }, connues: undefined });
    assert.deepEqual(apresLecture(undefined, undefined), { etat: { lecture: "illisible", raison: SANS_REPONSE, detail: "" }, connues: undefined });
  });
});

describe("the panel", () => {
  const gestes = () => {
    const faits: string[] = [];
    return {
      faits,
      gestes: { ouvrir: () => faits.push("ouvrir"), relire: () => faits.push("relire"), copier: (t: string) => (faits.push(`copier ${t}`), Promise.resolve()), fermer: () => faits.push("fermer"), confier: () => faits.push("confier") },
    };
  };
  test("closed, it is one button; a click lays the panel in its place and tells the view", () => {
    const { faits, gestes: g } = gestes();
    const racine = new Faux("section");
    racine.append(entreeDuServeur(doc, undefined, g));
    (boutons(racine, AJOUTER_UN_SERVEUR)[0] ?? assert.fail("no `Add a server`")).click();
    assert.deepEqual(faits, ["ouvrir"]);
    assert.equal(boutons(racine, AJOUTER_UN_SERVEUR).length, 0);
    assert.ok(texte(racine).includes(COMMANDE_DU_SERVEUR));
    assert.ok(texte(racine).includes(SUR_UN_MAC));
    assert.ok(texte(racine).includes(LECTURE));
  });
  test("waiting, failed, paired: what each says and offers", () => {
    const { faits, gestes: g } = gestes();
    const attente = entreeDuServeur(doc, { lecture: "attente" }, g) as Faux;
    assert.ok(texte(attente).includes(EN_ATTENTE));
    boutons(attente, RELIRE)[0]?.click();
    boutons(attente, FERMER)[0]?.click();
    boutons(attente, "copy")[0]?.click();
    assert.deepEqual(faits, ["relire", "fermer", `copier ${COMMANDE_DU_SERVEUR}`]);
    const echec = entreeDuServeur(doc, { lecture: "illisible", raison: "GitHub could not be reached.", detail: "" }, g) as Faux;
    assert.ok(texte(echec).includes("GitHub could not be reached."));
    assert.equal(boutons(echec, RELIRE).length, 1);
    const paire = entreeDuServeur(doc, { lecture: "appairee", id: "g9", nom: "parade-box" }, g) as Faux;
    assert.ok(texte(paire).includes(APPAIREE("parade-box").slice("parade-box".length)));
    assert.equal(boutons(paire, RELIRE).length, 0);
    boutons(paire, CHOISIR)[0]?.click();
    assert.equal(faits.at(-1), "confier");
    const { confier: _, ...sans } = g;
    assert.equal(boutons(entreeDuServeur(doc, { lecture: "appairee", id: "g9", nom: "parade-box" }, sans) as Faux, CHOISIR).length, 0);
  });
});

describe("where `Add a server` is offered", () => {
  const VIDE = { choisirQuiCuit() {}, deplacer() {}, versIci() {}, cuireIci() {}, choisir() {}, annuler() {}, arreter() {}, confirmerArret() {}, renoncerArret() {}, basculer() {} };
  const ONGLET = { projet: "parade", poste: "this Mac", lues: true, haut: { etat: "personne", vert: false, fire: 0 }, servantes: [], deplacable: { offert: false, pourquoi: "" }, details: new Map(), ouverts: new Set() };
  test("the Stations tab offers it, but not on the narrow screen, which is read without settings", () => {
    const large = poserLOngletDesStations(doc as never, ONGLET as never, VIDE as never) as Faux;
    assert.equal(boutons(large, AJOUTER_UN_SERVEUR).length, 1);
    const etroit = poserLOngletDesStations(doc as never, { ...ONGLET, lecture: true } as never, VIDE as never) as Faux;
    assert.equal(boutons(etroit, AJOUTER_UN_SERVEUR).length, 0);
  });
  test("`Who cooks <owner/repo>?` offers it under its list, and in place of an empty one", () => {
    const serveur = { ouvrir() {}, relire() {}, copier: () => undefined, fermer() {} };
    const geste = { choisir() {}, relire() {}, preparer() {}, ouvrirLaCarte() {}, serveur };
    const choix = [{ cle: "ici", nom: "this computer", horsLigne: false, recommande: true }];
    for (const liste of [choix, []]) {
      const page = poserParcoursPremierProjet(doc as never, { depot: "chef/parade", vu: { etape: "station" }, progression: "1 of 2: who cooks it", station: "a-faire", choix: liste }, geste) as unknown as Faux;
      assert.equal(boutons(page, AJOUTER_UN_SERVEUR).length, 1, `with ${liste.length} choice(s)`);
    }
    const sansPanneau = poserParcoursPremierProjet(doc as never, { depot: "chef/parade", vu: { etape: "station" }, progression: "", station: "a-faire", choix }, { ...geste, serveur: undefined }) as unknown as Faux;
    assert.equal(boutons(sansPanneau, AJOUTER_UN_SERVEUR).length, 0);
  });
});

describe("driven from the Stations tab, against the fake bridge", () => {
  test("panel reached, documented command, server seen paired, project given to it", async () => {
    let chef: StationAppairee[] = [appairee("g1", "laptop")];
    let compte: StationEnregistree[] = [];
    const vue = await jouerLaVue({
      demarrage: () => ({
        configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade", depot: "chef/parade", base: "main" }] }, () => true),
        palette: PALETTE, exemple: EXEMPLE, onglets: ONGLETS, rubriques: RUBRIQUES,
        gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE, calibrage: { modeles: MODELES, efforts: EFFORTS }, code: undefined,
        // Les stations du projet sont lues : aucune ne le cuit.
        stations: { a: A, stations: [] } satisfies VuDesStations,
        projetsDesStations: SANS_STATION,
      }),
      stationsDuChef: () => LISTEE(chef),
      stationsDuCompte: () => ({ state: "listed", stations: compte, unreadable: [] }),
      choisirLesProjets: (_id, depots) => ({ selection: depots }),
      espace: () => [],
    });
    (vue.element("projets").children.at(1) ?? assert.fail("no project")).click();
    await repos();
    await ouvrirOnglet(vue, "Stations");
    const rail = vue.element("rail");
    (boutons(rail, AJOUTER_UN_SERVEUR)[0] ?? assert.fail("no `Add a server` on the Stations tab")).click();
    await repos();
    assert.ok(DOCUMENTEE !== undefined && texte(rail).includes(DOCUMENTEE), "the panel's command differs from the documented one");
    assert.ok(texte(rail).includes(EN_ATTENTE), texte(rail));
    // Rien de neuf : « check again » attend encore — laptop était là avant le panneau.
    (boutons(rail, RELIRE)[0] ?? assert.fail("no `check again`")).click();
    await repos();
    assert.ok(texte(rail).includes(EN_ATTENTE));
    // Le serveur installé signe : il est appairé, et la station du compte est relue pour le choix.
    chef = [...chef, appairee("g9", "parade-box")];
    compte = [enregistree("g9", "parade-box")];
    (boutons(rail, RELIRE)[0] ?? assert.fail("no `check again`")).click();
    await repos();
    await repos();
    assert.ok(texte(rail).includes(APPAIREE("parade-box").slice("parade-box".length)), texte(rail));
    const panneau = rail.dessous("section").find((s) => s.className === "ajout-serveur") ?? assert.fail("no panel");
    (boutons(panneau, CHOISIR)[0] ?? assert.fail("no `Choose who cooks it` in the panel")).click();
    await repos();
    await repos();
    assert.ok(!rail.dessous("section").some((s) => s.className === "ajout-serveur"), "the panel stays open after the choice opened");
    (boutons(rail, "parade-box")[0] ?? assert.fail(`parade-box is not offered: ${texte(rail)}`)).click();
    await repos();
    await repos();
    assert.deepEqual(vue.dernier("choisirLesProjets"), ["g9", ["chef/parade"]]);
    // L'écran le dit : la ligne du dernier geste nomme la station qui l'a reçu.
    const dit = rail.dessous("p").find((p) => p.className === "dit-des-stations")?.textContent ?? "";
    assert.match(dit, /parade-box/, texte(rail));
  });
});
