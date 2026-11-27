// La station locale sur l'onglet Stations (#2489, épique #2484) : ses dossiers — le clone du projet et les worktrees de
// ses cooks —, son bac à sable et sa connexion à Claude, chacun avec son niveau. Les autres stations n'ont rien de cela.
// Chaque geste a l'effet qu'il avait ailleurs dans l'app : le bac à sable se règle par le même appel que la ligne des
// tickets ordinaires de Settings (« this computer »), la connexion se refait par le login de la panne de la station. Les
// téléphones appairés n'y sont plus (#2500) : aucune station n'appaire de téléphone. Le module est joué devant une
// fabrique de faux éléments ; la vue entière, contre le faux pont (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { blocDesOrdinaires } from "../../../src/ordinaires.ts";
import type { Panne } from "../../../src/pannes/pannes.ts";
import { calibrageRecommande, EFFORTS, MODELES, type VuDesProjets } from "../../../src/projets/projets.ts";
import type { StationVue, VuDesStations } from "../../../src/stations/stations.ts";
import type { Terminal } from "../../../src/terminaux.ts";
import { NIVEAUX_DITS } from "../../../src/vue/niveaux.js";
import { type EtatDeLaStationLocale, type GestesDeLaStationLocale, lignesDeLaStationLocale } from "../../../src/vue/projet/stations/StationLocale.js";
import { Faux, type Jouee, jouerLaVue, ouvrirLecture, ouvrirOnglet, repos } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
// Les lignes de la station de cet ordinateur, posées dans « Details » de sa carte (#3195) : ici, dans un élément à elles.
const poserBlocStationLocale = (fabrique: typeof doc, etat: EtatDeLaStationLocale, gestes?: GestesDeLaStationLocale) => {
  const bloc = new Faux("div");
  bloc.append(...(lignesDeLaStationLocale(fabrique, etat, gestes) as unknown as Faux[]));
  return bloc;
};
const A = "2026-11-05T21:00:00.000Z";
const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", ordinaires: true, limiteCooks: 2 };
const DOSSIERS = { clone: "/Users/chef/brigade-atelier/clones/parade", worktrees: "/Users/chef/brigade-atelier/worktrees/parade" };
const PERDUE: Panne = { cle: "connexion-max:2026-11-05T20:40:00.000Z", sujet: "connexion-max", ligne: "Max connection lost 20 min ago", survol: "nothing cooks on macbook until you log in", bouton: { libelle: "log in", geste: "login" } };
const station = (id: string, max: StationVue["max"], pannes: Panne[] = []): StationVue => ({ id, nom: id, machine: "", etat: "en-ligne", ligne: "online", pannes, dit: "online", version: "", projets: ["parade"], max });

// Les lignes du bloc : le nom de chaque réglage (son étiquette de niveau comprise), et sa valeur.
const lignes = (bloc: Faux) => bloc.dessous("div").filter(({ className }) => className === "reglage");
const nomDe = (ligne: Faux) => ligne.children[0]?.firstChild;
const valeurDe = (ligne: Faux) => ligne.children[1]?.children[0]?.textContent;
const niveauDe = (ligne: Faux) => [...ligne.descendants()].filter(({ className }) => className === "niveau").map(({ textContent }) => textContent);
const boutons = (bloc: Faux, texte: string) => bloc.dessous("button").filter(({ textContent }) => textContent === texte);

const etat = (plus: Partial<EtatDeLaStationLocale> = {}): EtatDeLaStationLocale => ({
  poste: "this computer",
  projet: "parade",
  station: station("macbook", "connectee"),
  dossiers: DOSSIERS,
  ordinaires: blocDesOrdinaires(PARADE, "darwin", undefined, true) ?? null,
  ...plus,
});

describe("les lignes de la station locale", () => {
  test("ses dossiers, son bac à sable et sa connexion à Claude, chacun avec son niveau — aucun téléphone à appairer", () => {
    const bloc = poserBlocStationLocale(doc, etat()) as unknown as Faux;
    const poses = lignes(bloc);
    assert.deepEqual(
      poses.map((ligne) => [nomDe(ligne), valeurDe(ligne)]),
      [
        ["clone folder", DOSSIERS.clone],
        ["worktrees folder", DOSSIERS.worktrees],
        ["sandbox · ordinary tickets", "taken"],
        ["cooks at once", "2"],
        ["Claude connection", "connected"],
      ],
    );
    // Chaque réglage dit son niveau : tous vivent sur cette machine.
    for (const ligne of poses) assert.deepEqual(niveauDe(ligne), [NIVEAUX_DITS.machine.libelle], String(nomDe(ligne)));
    assert.deepEqual(poses.map(({ dataset }) => dataset.cle), ["dossier", "dossier", "ordinaires", "ordinaires", "claude"]);
    // Connectée, rien à refaire : pas de « log in ». Et rien n'appaire un téléphone.
    assert.deepEqual(boutons(bloc, "log in"), []);
    assert.doesNotMatch(bloc.textContent, /phone/i);
  });

  test("ce qui n'est pas encore lu le dit ; ce qui ne se lit pas, en une ligne, sa raison au survol", () => {
    const enRoute = poserBlocStationLocale(doc, { poste: "this computer", projet: "parade" }) as unknown as Faux;
    assert.deepEqual(lignes(enRoute).map((ligne) => [nomDe(ligne), valeurDe(ligne)]), [
      ["folders", "Reading…"],
      ["sandbox", "Reading…"],
      ["Claude connection", "Reading…"],
    ]);
    const rates = poserBlocStationLocale(doc, etat({ dossiers: { refus: "its folders could not be read", detail: "ENOENT" } })) as unknown as Faux;
    const [dossiers] = lignes(rates);
    assert.equal(dossiers?.children[1]?.children[0]?.children[0]?.textContent, "Folders not reached.");
    assert.ok(rates.dessous("button").some(({ ariaLabel }) => ariaLabel === "its folders could not be read — ENOENT"));
  });

  test("le bac à sable : hors d'un Mac il n'y en a pas, et un projet qui ne cuit pas ici n'en a pas", () => {
    const pc = poserBlocStationLocale(doc, etat({ poste: "this computer", ordinaires: blocDesOrdinaires(PARADE, "win32", undefined, true) ?? null })) as unknown as Faux;
    const bac = lignes(pc).find(({ dataset }) => dataset.cle === "ordinaires") ?? assert.fail("pas de ligne");
    assert.deepEqual([nomDe(bac), valeurDe(bac)], ["sandbox", "none on this computer"]);
    assert.deepEqual(pc.dessous("input"), []);
    const ailleurs = poserBlocStationLocale(doc, etat({ ordinaires: null })) as unknown as Faux;
    assert.equal(valeurDe(lignes(ailleurs).find(({ dataset }) => dataset.cle === "ordinaires") ?? assert.fail("pas de ligne")), "parade does not cook on this computer");
  });

  test("chaque geste appelle le sien : le bac à sable, le login de la panne", () => {
    const faits: unknown[][] = [];
    const bloc = poserBlocStationLocale(doc, etat({ station: station("macbook", "perdue", [PERDUE]) }), {
      regler: (actif, limite, ou) => void faits.push(["regler", actif, limite, ou]),
      seConnecter: (cle) => void faits.push(["seConnecter", cle]),
    }) as unknown as Faux;
    assert.equal(valeurDe(lignes(bloc).find(({ dataset }) => dataset.cle === "claude") ?? assert.fail("pas de ligne")), "lost");
    const limite = bloc.dessous("input")[0] ?? assert.fail("pas de limite");
    interrupteurDe(bloc).click();
    limite.value = "";
    limite.declencher("change");
    const [login] = boutons(bloc, "log in");
    assert.equal(login?.className, "recommande");
    login?.click();
    assert.deepEqual(faits, [["regler", false, 2, "option"], ["regler", false, null, "limite"], ["seConnecter", PERDUE.cle]]);
  });

  test("aucun « Save » ; un changement en route se dit sous sa rangée, les contrôles du bac à sable attendent ; un refus se lit sous la sienne", () => {
    const bloc = poserBlocStationLocale(doc, etat()) as unknown as Faux;
    assert.deepEqual(bloc.dessous("button").filter(({ textContent }) => /^(save|saving…)$/i.test(textContent)), []);
    const ditSous = (pose: Faux) => lignes(pose).map((ligne) => ligne.children.filter(({ className }) => className.startsWith("dit")).map(({ className, textContent }) => [className, textContent]));
    const enRoute = poserBlocStationLocale(doc, etat({ reglageDit: { ou: "limite", dit: { enCours: "applying…" } } })) as unknown as Faux;
    assert.deepEqual(ditSous(enRoute), [[], [], [], [["dit en-cours", "applying…"]], []]);
    assert.ok([...enRoute.dessous("input"), interrupteurDe(enRoute)].every(({ disabled }) => disabled));
    const refuse = poserBlocStationLocale(doc, etat({ reglageDit: { ou: "option", dit: { refus: "nothing was written: EACCES" } } })) as unknown as Faux;
    assert.deepEqual(ditSous(refuse), [[], [], [["dit refus", "nothing was written: EACCES"]], [], []]);
    assert.ok([...refuse.dessous("input"), interrupteurDe(refuse)].every(({ disabled }) => !disabled));
  });
});

// L'interrupteur d'un bloc (composants/interrupteur) : son état se lit sur `aria-checked`, un clic le demande contraire.
const interrupteurDe = (pose: Faux) => pose.dessous("button").find(({ role }) => role === "switch") ?? assert.fail("pas d'interrupteur");

describe("la station locale dans l'onglet Stations", () => {
  const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };
  // La station de ce Mac, et la box — qui a perdu sa connexion : rien d'elle ne doit se lire dans le bloc.
  const STATIONS = (locale: StationVue): VuDesStations => ({ a: A, stations: [locale, station("box", "perdue", [{ ...PERDUE, cle: "connexion-max:box" }])] });
  const PROJETS_DES_STATIONS: VuDesProjets = { a: A, projets: [], locale: "macbook", recommandee: null, avertissements: {}, machines: {}, calibrage: calibrageRecommande([]) };

  const jouer = (locale: StationVue, regler: (...args: unknown[]) => string | undefined = () => undefined) =>
    jouerLaVue({
      demarrage: () => ({
        poste: { nom: "this computer", mac: true },
        configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE] }, () => true, () => true),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS,
        rubriques: RUBRIQUES,
        gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE,
        calibrage: { modeles: MODELES, efforts: EFFORTS },
        code: undefined,
        stations: STATIONS(locale),
        projetsDesStations: PROJETS_DES_STATIONS,
      }),
      espace: () => [SECOND],
      ordinaires: () => blocDesOrdinaires(PARADE, "darwin", undefined, true),
      reglerOrdinaires: regler,
      dossiersDeLaStation: () => DOSSIERS,
      panne: () => ({ fait: "the login page opens in your browser" }),
    });
  const ouvrirLeProjet = async (vue: Jouee) => {
    (vue.element("projets").children.at(1) ?? assert.fail("pas de case")).click();
    await repos();
  };
  // La carte de cet ordinateur sur l'onglet Stations (#3195), et ses lignes, dans « Details ».
  const carteIci = (vue: Jouee) => vue.element("rail").dessous("section").find(({ className, dataset }) => className === "carte-de-station" && dataset.station === "macbook") ?? assert.fail("pas de carte de cet ordinateur");
  const leBloc = (vue: Jouee) => carteIci(vue).dessous("div").find(({ className }) => className === "details-de-station") ?? assert.fail("pas de « Details » de cet ordinateur");

  test("sur Stations, la station de ce Mac montre ses trois réglages, lus pour elle seule — la box n'y est pas", async () => {
    const vue = await jouer(station("macbook", "connectee"));
    await ouvrirLeProjet(vue);
    await ouvrirOnglet(vue, "Stations");
    await repos();
    const bloc = leBloc(vue);
    assert.deepEqual(lignes(bloc).map((ligne) => [nomDe(ligne), valeurDe(ligne)]), [
      ["clone folder", DOSSIERS.clone],
      ["worktrees folder", DOSSIERS.worktrees],
      ["sandbox · ordinary tickets", "taken"],
      ["cooks at once", "2"],
      ["Claude connection", "connected"],
    ]);
    assert.deepEqual(vue.dernier("dossiersDeLaStation"), ["parade"]);
    // La connexion perdue de la box ne s'y lit pas.
    assert.deepEqual(boutons(bloc, "log in"), []);
    assert.doesNotMatch(bloc.textContent, /\bbox\b/);
    // Une seule carte porte ces réglages sur l'onglet, et son « Details » est replié.
    assert.equal(vue.element("rail").dessous("div").filter(({ className, textContent }) => className === "details-de-station" && textContent.includes("clone folder")).length, 1);
    assert.equal((carteIci(vue).dessous("details")[0] as unknown as { open?: boolean } | undefined)?.open, false);
    // Ni « Local station », ni la station locale en pseudo-station à elle.
    assert.doesNotMatch(vue.element("rail").textContent, /Local station/);
  });

  test("un ordinateur dont la station ne sert pas le projet n'a pas de carte : rien de ses réglages ne se lit sur l'onglet", async () => {
    const vue = await jouer({ ...station("macbook", "connectee"), projets: [] });
    await ouvrirLeProjet(vue);
    await ouvrirOnglet(vue, "Stations");
    await repos();
    assert.equal(vue.element("rail").dessous("section").some(({ className, dataset }) => className === "carte-de-station" && dataset.station === "macbook"), false);
    assert.doesNotMatch(vue.element("rail").textContent, /clone folder|worktrees folder|sandbox ·/);
  });

  test("régler le bac à sable sur Stations fait le même appel que la ligne des tickets ordinaires de Settings", async () => {
    const vue = await jouer(station("macbook", "connectee"));
    await ouvrirLeProjet(vue);
    // Dans Settings, sous « this computer » : décocher, puis écrire 4 cooks à la fois.
    await ouvrirLecture(vue, "Settings");
    const limite = vue.element("ordinaires").dessous("input")[0] ?? assert.fail("pas de limite dans Settings");
    interrupteurDe(vue.element("ordinaires")).click();
    await repos();
    limite.value = "4";
    limite.declencher("change");
    await repos();
    const dansSettings = vue.appels.filter(({ geste }) => geste === "reglerOrdinaires").map(({ args }) => args);
    vue.appels.length = 0;
    // Les mêmes gestes sur Stations.
    await ouvrirOnglet(vue, "Stations");
    await repos();
    const combien = leBloc(vue).dessous("input")[0] ?? assert.fail("pas de limite sur Stations");
    interrupteurDe(leBloc(vue)).click();
    await repos();
    combien.value = "4";
    combien.declencher("change");
    await repos();
    const surStations = vue.appels.filter(({ geste }) => geste === "reglerOrdinaires").map(({ args }) => args);
    assert.deepEqual(dansSettings, [["parade", false, 2], ["parade", false, 4]]);
    assert.deepEqual(surStations, dansSettings);
    // Écrit, il est relu : la ligne montre ce que la station a maintenant.
    assert.equal(vue.appels.filter(({ geste }) => geste === "ordinaires").length >= 2, true);
  });

  test("un réglage refusé dit pourquoi, sous sa ligne", async () => {
    const vue = await jouer(station("macbook", "connectee"), () => "nothing was written: EACCES");
    await ouvrirLeProjet(vue);
    await ouvrirOnglet(vue, "Stations");
    await repos();
    interrupteurDe(leBloc(vue)).click();
    await repos();
    await repos();
    assert.deepEqual(leBloc(vue).dessous("p").filter(({ className }) => className === "dit refus").map(({ textContent }) => textContent), ["nothing was written: EACCES"]);
    // Sous la rangée qui a changé, et la case relue revient à la valeur en vigueur.
    const bac = lignes(leBloc(vue)).find(({ dataset }) => dataset.cle === "ordinaires") ?? assert.fail("pas de bac à sable");
    assert.ok(bac.children.some(({ className }) => className === "dit refus"));
    assert.equal(interrupteurDe(leBloc(vue)).ariaChecked, "true");
  });

  test("un changement du bac à sable s'applique aussitôt : « applying… » sous sa rangée tant qu'il est en route", async () => {
    let lacher = (_: string | undefined) => {};
    const vue = await jouer(station("macbook", "connectee"), () => new Promise<string | undefined>((resolu) => (lacher = resolu)) as never);
    await ouvrirLeProjet(vue);
    await ouvrirOnglet(vue, "Stations");
    await repos();
    const limite = leBloc(vue).dessous("input")[0] ?? assert.fail("pas de limite");
    limite.value = "3";
    limite.declencher("change");
    await repos();
    assert.deepEqual(vue.dernier("reglerOrdinaires"), ["parade", true, 3]);
    assert.ok(leBloc(vue).dessous("p").some(({ className, textContent }) => className === "dit en-cours" && textContent === "applying…"));
    assert.ok([...leBloc(vue).dessous("input"), interrupteurDe(leBloc(vue))].every(({ disabled }) => disabled));
    lacher(undefined);
    await repos();
    await repos();
    assert.equal(leBloc(vue).dessous("p").some(({ className }) => className.startsWith("dit en-cours")), false);
    assert.ok([...leBloc(vue).dessous("input"), interrupteurDe(leBloc(vue))].every(({ disabled }) => !disabled));
  });

  test("connexion perdue : « log in » joue le login de la panne de cette station, comme sur sa page, et ce qu'il a rendu se lit dessous", async () => {
    const vue = await jouer(station("macbook", "perdue", [PERDUE]));
    await ouvrirLeProjet(vue);
    await ouvrirOnglet(vue, "Stations");
    await repos();
    const [login] = boutons(leBloc(vue), "log in");
    login?.click();
    await repos();
    await repos();
    assert.deepEqual(vue.dernier("panne"), ["macbook", PERDUE.cle]);
    assert.ok(leBloc(vue).dessous("p").some(({ className, textContent }) => className === "dit" && textContent === "the login page opens in your browser"));
  });
});
