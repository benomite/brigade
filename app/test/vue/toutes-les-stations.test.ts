// Sur l'onglet Cooks, « Its stations » liste toutes les stations qui servent le projet, chacune une fois (#1786) : celles
// que `facts` donne, celles que la principale déclare sans qu'elles s'y soient annoncées, et celles que l'app lui a
// ajoutées et qui n'en sont pas encore. La principale — le manager et la pass — vient d'abord, marquée, avec « move the
// kitchen » ; chacune dit si elle est atteinte, ce qu'elle fournit (le bloc « what each station provides » y est fondu),
// ses cooks à la fois avec « set the cap », ce qu'elle cuit, et pourquoi elle ne cuit pas. La vue jouée telle qu'elle est,
// devant un faux document (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Faits as FaitsDuRuntime } from "../../../runtime/src/etat.ts";
import type { Accueil } from "../../src/accueil.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { Panne } from "../../src/pannes/pannes.ts";
import { calibrageRecommande, EFFORTS, machineProposee, MODELES, type ProjetVu, type VuDesProjets } from "../../src/projets/projets.ts";
import { lireStations, type Guide, type StationsLues } from "../../src/service.ts";
import type { VuDesStations } from "../../src/stations/stations.ts";
import { ABSENTE } from "../../src/cuisson.ts";
import { ATTEINTE, CHANGER_LA_PRINCIPALE, FOURNIT_PAS_DIT, PAS_ANNONCEE, POSER_LE_PLAFOND, RELIRE, ROLES, stationsDuBloc } from "../../src/vue/stations-de-cuisson.js";
import { TITRE as TITRE_DES_DECLAREES } from "../../src/vue/stations-declarees.js";
import { type Faux, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-27T10:04:12.000Z";
const PARADE = "parade";

// Les stations appairées du compte : la box, qui sert parade, ce Mac et un PC.
const appairee = (id: string, nom: string, projets: string[] = []) => ({ id, nom, machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online", pannes: [] as Panne[], dit: "online", version: "1.4.0", projets, max: null }) as const;
const BOX = appairee("gbox", "box", [PARADE]);
const MAC = appairee("gmac", "macbook");
const PC = appairee("gpc", "pc");
const STATIONS: VuDesStations = { a: A, stations: [BOX, MAC, PC] };
const ACCUEIL: Accueil = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };

// parade cuit sur la box ; l'app lui a ajouté ce Mac, que la box dit atteint, et le PC, qui n'a pas encore lu la demande.
const SUR_LA_BOX: ProjetVu = {
  nom: PARADE,
  depot: "benomite/parade",
  base: "main",
  stations: [
    { id: "gbox", nom: "box", principale: true, etat: "servi", dit: "served by box", autoriser: [] },
    { id: "gmac", nom: "macbook", principale: false, etat: "secondaire", dit: "not its main station", autoriser: [], atteinte: { oui: true, dit: "reached: it is online on GitHub", station: "macbook/claude" } },
    { id: "gpc", nom: "pc", principale: false, etat: "attendu", dit: "pc has not read it yet", autoriser: [] },
  ],
  servi: null,
  cuitSur: { id: "gbox", nom: "box", ici: false },
  demenagement: null,
};
const vuDes = (...projets: ProjetVu[]): VuDesProjets => ({ a: A, projets, locale: "gmac", recommandee: "gbox", avertissements: {}, machines: { gbox: machineProposee(BOX), gmac: machineProposee(MAC), gpc: machineProposee(PC) }, calibrage: calibrageRecommande([]) });

type DuRuntime = FaitsDuRuntime["stations"][number];
const station = (nom: string, plus: Partial<DuRuntime> = {}): DuRuntime => ({ station: nom, distante: false, plafond: 3, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: "cooking", arreteeDepuis: null, refus: null, cooks: [], ...plus });
const COOK_14 = { ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" };
// `facts` de la box : elle seule s'y est annoncée — le Mac, déclaré, ne l'a pas encore fait.
const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-10-27T10:04:11.000Z",
  dernierTick: "2026-10-27T10:04:02.000Z",
  compteurs: { rail: 0, auTravail: 1, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [{ ticket: 14, etat: "pris", titre: COOK_14.titre, url: "https://github.com/benomite/parade/issues/14", activite: null }],
  cooks: [COOK_14],
  attend: [],
};
const STATIONS_DES_FAITS = [station("box/claude", { cooks: [COOK_14] })];

// Ce que la box déclare (`installation stations --json`) : elle-même, et ce Mac que l'app lui a ajouté.
const DECLAREES =
  lireStations(
    JSON.stringify({
      etape: { id: "stations", etat: "faite" },
      proposees: [],
      absent: null,
      declarees: [
        { nom: "box/claude", moteur: "claude", fournit: ["code", "raisonnement"], cooks: 3, distante: false },
        { nom: "macbook/claude", moteur: "claude", fournit: ["code", "raisonnement", "navigateur-headless"], cooks: 2, distante: true },
      ],
    }),
  ) ?? assert.fail("la forme de `installation stations --json` n'est plus lue");

const guide = (stations: StationsLues): Guide => ({
  projet: PARADE,
  deplie: false,
  titre: "parade is installed",
  lecture: { etat: "lue", a: A },
  etapes: [],
  courante: null,
  annonces: { etat: "lues", liste: [] },
  demarrage: { commande: "ssh -t box sudo systemctl enable --now brigade@parade.service" },
  termine: true,
  controle: { a: A, stations },
});

const PROJET: Projet = { nom: PARADE, dossier: "/tmp/parade", box: { hote: "box" }, depot: "benomite/parade", base: "main" };
const demarrage = (vu: VuDesProjets) => () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PROJET], hotes: ["box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  stations: STATIONS,
  accueil: ACCUEIL,
  projetsDesStations: vu,
});

async function ouvrir(vu: VuDesProjets = vuDes(SUR_LA_BOX), stations: DuRuntime[] = STATIONS_DES_FAITS, declarees: StationsLues = DECLAREES): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage: demarrage(vu), espace: () => [], service: () => guide(declarees), defautsDeStation: () => ({ refus: "pas ici" }) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FAITS, stations }) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  await ouvrirOnglet(vue, "Cooks");
  return vue;
}

const lignes = (vue: Jouee) => vue.element("rail").dessous("li").filter((li) => li.className === "station-de-cuisson");
const ligne = (vue: Jouee, nom: string) => lignes(vue).find((li) => li.dataset.station === nom) ?? assert.fail(`pas de ligne pour ${nom}`);
const role = (pose: Faux) => pose.dessous("small").find(({ className }) => className === "role")?.textContent;
const atteinte = (pose: Faux) => pose.dessous("span").find(({ className }) => className === "pilule atteinte");
const fournit = (pose: Faux) => pose.dessous("div").find(({ className }) => className === "fournit-de-station");
const retenue = (pose: Faux) => pose.dessous("p").find(({ className }) => className === "retenue-de-cuisson");
const boutonDe = (pose: Faux, texte: string) => pose.dessous("button").find(({ textContent }) => textContent === texte) ?? assert.fail(`pas de « ${texte} » sous ${pose.dataset.station}`);

describe("« Its stations » liste toutes les stations du projet (#1786)", () => {
  test("chacune une fois, la principale d'abord : celle de `facts`, celle que la box déclare sans qu'elle s'y soit annoncée, celle que l'app a ajoutée", async () => {
    const vue = await ouvrir();
    assert.deepEqual(lignes(vue).map(({ dataset }) => dataset.station), ["box/claude", "macbook/claude", "pc"]);
    assert.deepEqual(lignes(vue).map(role), [ROLES.principale.mot, ROLES.cuisson.mot, ROLES.cuisson.mot]);
    assert.match(ligne(vue, "box/claude").dessous("small").find(({ className }) => className === "role")?.title ?? "", /manager and its pass/);
    // Atteinte ou non : la box l'est, le Mac aussi — la box le dit —, le PC ne l'est pas.
    assert.deepEqual(lignes(vue).map((pose) => [atteinte(pose)?.textContent, atteinte(pose)?.dataset.ton]), [
      [ATTEINTE.oui, "vert"],
      [ATTEINTE.oui, "vert"],
      [ATTEINTE.non, "gris"],
    ]);
    assert.match(atteinte(ligne(vue, "macbook/claude"))?.title ?? "", /it is online on GitHub/);
    // Ce que chacune fournit, dans sa ligne : le bloc à part n'est plus posé.
    assert.deepEqual(lignes(vue).map((pose) => fournit(pose)?.textContent), ["Providescoderaisonnementedit", "Providescoderaisonnementnavigateur-headlessedit", `Provides${FOURNIT_PAS_DIT}`]);
    assert.equal(vue.element("rail").textContent.includes(TITRE_DES_DECLAREES), false);
    // Ce qu'elle cuit : la box #14 ; les autres, rien.
    assert.match(ligne(vue, "box/claude").textContent, /#14/);
    assert.match(ligne(vue, "pc").textContent, /no cook running/);
    // Ses cooks à la fois, et « set the cap ».
    assert.match(ligne(vue, "macbook/claude").textContent, /Cooks at once: 2/);
    boutonDe(ligne(vue, "macbook/claude"), POSER_LE_PLAFOND);
  });

  test("une station qui ne peut pas cuire dit pourquoi en une ligne : déclarée sans s'être annoncée, ajoutée sans avoir lu la demande — « check again » relit GitHub", async () => {
    const vue = await ouvrir();
    assert.equal(retenue(ligne(vue, "box/claude")), undefined);
    const mac = retenue(ligne(vue, "macbook/claude")) ?? assert.fail("le Mac ne dit pas pourquoi il ne cuit pas");
    assert.equal(mac.textContent, PAS_ANNONCEE.pourquoi);
    const pc = retenue(ligne(vue, "pc")) ?? assert.fail("le PC ne dit pas pourquoi il ne cuit pas");
    assert.equal(pc.textContent, `not received by the station${RELIRE.libelle}`);
    assert.match(pc.dessous("span")[0]?.title ?? "", /open Brigade on pc's computer/);
    boutonDe(pc, RELIRE.libelle).click();
    await repos();
    assert.deepEqual(vue.dernier("panne"), ["gpc", "relire-la-station"]);
    // Le Mac s'annonce : il cuit, et ne dit plus rien.
    const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FAITS, stations: [...STATIONS_DES_FAITS, station("macbook/claude", { distante: true })] }) }] });
    vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
    await repos();
    assert.equal(retenue(ligne(vue, "macbook/claude")), undefined);
    assert.equal(lignes(vue).filter(({ dataset }) => dataset.station === "macbook/claude").length, 1);
  });

  test("la principale porte « move the kitchen » : il ouvre le choix de la machine, en tête de la page", async () => {
    const vue = await ouvrir();
    assert.equal(ligne(vue, "macbook/claude").dessous("button").some(({ textContent }) => textContent === CHANGER_LA_PRINCIPALE.libelle), false);
    const deplacer = boutonDe(ligne(vue, "box/claude"), CHANGER_LA_PRINCIPALE.libelle);
    assert.equal(deplacer.disabled, false);
    deplacer.click();
    await repos();
    const choix = vue.element("stations-du-projet").dessous("section").find(({ className }) => className === "demenagement") ?? assert.fail("pas de choix");
    assert.equal(choix.hidden, false);
    assert.match(choix.textContent, /Move parade's kitchen from box to:/);
  });

  test("« set the cap » d'une station ouvre son formulaire dans sa ligne, son plafond prêt à changer", async () => {
    const vue = await ouvrir();
    boutonDe(ligne(vue, "macbook/claude"), POSER_LE_PLAFOND).click();
    await repos();
    const champ = ligne(vue, "macbook/claude").dessous("input").find(({ ariaLabel }) => ariaLabel === "how many cooks macbook/claude runs at once") ?? assert.fail("pas de formulaire ouvert dans la ligne");
    assert.equal(champ.value, "2");
  });
});

describe("« Its stations » dit chaque station telle que la principale la voit (#1830)", () => {
  // mirrorscreen : la box déclare le Mac — distante+ensemble, macos, un navigateur — mais il ne s'est jamais manifesté à
  // elle ; l'app, elle, le lit en ligne sur GitHub. Aucune déclaration lue par `installation stations --json`.
  const SANS_DECLARATION = lireStations(JSON.stringify({ etape: { id: "stations", etat: "faite" }, proposees: [], absent: null, declarees: [] })) ?? assert.fail("la forme de `installation stations --json` n'est plus lue");
  const LA_BOX = station("box/claude", { cooks: [COOK_14], fournit: ["code", "raisonnement"], presente: true, vueLe: null });
  const LE_MAC = station("macbook/claude", { distante: true, ensemble: true, fournit: ["code", "raisonnement", "navigateur-headless", "macos"], presente: false, vueLe: null });
  const pilule = (pose: Faux) => pose.dessous("span").find(({ className }) => className === "pilule")?.textContent;

  test("absent pour la box, le Mac se lit « absent · not cooking » — jamais « reached · cooking », même en ligne sur GitHub —, et ce que chacune fournit vient de la box", async () => {
    const vue = await ouvrir(vuDes(SUR_LA_BOX), [LA_BOX, LE_MAC], SANS_DECLARATION);
    const mac = ligne(vue, "macbook/claude");
    assert.deepEqual([atteinte(mac)?.textContent, atteinte(mac)?.dataset.ton, pilule(mac)], [ATTEINTE.absente, "gris", ABSENTE.etat]);
    assert.match(atteinte(mac)?.title ?? "", /the main station has never heard from it/);
    assert.equal(retenue(mac)?.textContent, PAS_ANNONCEE.pourquoi);
    // Son geste reste : l'arrêter avant qu'il ne vienne.
    assert.ok(mac.dessous("button").some(({ ariaLabel }) => ariaLabel === "stop cooking on macbook/claude"));
    // La box, elle, est atteinte et cuit.
    const box = ligne(vue, "box/claude");
    assert.deepEqual([atteinte(box)?.textContent, pilule(box)], [ATTEINTE.oui, "cooking"]);
    // Ce que chacune fournit : ce que la box déclare d'elle, lu dans `facts` — sans « edit », faute de déclaration lue.
    assert.deepEqual([fournit(box)?.textContent, fournit(mac)?.textContent], ["Providescoderaisonnement", "Providescoderaisonnementnavigateur-headlessmacos"]);
    // Le PC, que la box ne déclare pas, n'a rien dit.
    assert.equal(fournit(ligne(vue, "pc"))?.textContent, `Provides${FOURNIT_PAS_DIT}`);
  });

  test("le Mac se manifeste à la box : il se lit atteint et cuit, sa dernière demande au survol, et ne dit plus pourquoi il ne cuit pas ; tu depuis, il le redit", async () => {
    const vue = await ouvrir(vuDes(SUR_LA_BOX), [LA_BOX, { ...LE_MAC, presente: true, vueLe: "2026-10-27T10:03:00.000Z" }], SANS_DECLARATION);
    const mac = ligne(vue, "macbook/claude");
    assert.deepEqual([atteinte(mac)?.textContent, atteinte(mac)?.dataset.ton, pilule(mac)], [ATTEINTE.oui, "vert", "cooking"]);
    assert.match(atteinte(mac)?.title ?? "", /its last request: 2026-10-27T10:03:00.000Z/);
    assert.equal(retenue(mac), undefined);

    const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FAITS, stations: [LA_BOX, { ...LE_MAC, vueLe: "2026-10-27T10:03:00.000Z" }] }) }] });
    vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
    await repos();
    const tu = ligne(vue, "macbook/claude");
    assert.deepEqual([atteinte(tu)?.textContent, pilule(tu)], [ATTEINTE.absente, ABSENTE.etat]);
    assert.match(atteinte(tu)?.title ?? "", /has not heard from it since 2026-10-27T10:03:00.000Z/);
    assert.equal(retenue(tu)?.textContent, "silent since 2026-10-27T10:03:00.000Z");
  });
});

describe("les stations du bloc, rangées (#1786)", () => {
  const ligneDe = (nom: string, distante: boolean) => ({ station: nom, distante, etat: "cooking", dit: "", survol: "", cooks: [], geste: "stop" as const });
  const declaree = (nom: string, distante: boolean) => ({ nom, moteur: "claude", fournit: ["code"], cooks: 1, distante });
  const app = (id: string, nom: string, principale: boolean, station?: string) => ({ id, nom, principale, dit: "", survol: "", pourquoi: "", geste: "", autoriser: [], ...(station === undefined ? {} : { station }) });

  test("chacune une fois : `facts` et la déclaration par leur nom, une station de l'app par le nom que la principale lui donne — ou celui de sa machine", () => {
    const rangs = stationsDuBloc([ligneDe("mac-mini/claude", true), ligneDe("box/claude", false)], [declaree("box/claude", false), declaree("mac-mini/claude", true), declaree("pc/claude", true)], [app("g1", "box", true), app("g2", "Mac Mini", false), app("g3", "pc", false, "pc/claude"), app("g4", "atelier", false)]);
    assert.deepEqual(
      rangs.map(({ nom, principale, ligne, declaree: d, appairee: a }) => [nom, principale, ligne !== undefined, d !== undefined, a?.id]),
      [
        ["box/claude", true, true, true, "g1"],
        ["mac-mini/claude", false, true, true, "g2"],
        ["pc/claude", false, false, true, "g3"],
        ["atelier", false, false, false, "g4"],
      ],
    );
  });

  test("sans station de la principale dans `facts` ni dans la déclaration, la principale de l'app a sa ligne, en tête", () => {
    const rangs = stationsDuBloc([ligneDe("mac/claude", true)], [], [app("g2", "mac", false), app("g1", "box", true)]);
    assert.deepEqual(rangs.map(({ nom, principale }) => [nom, principale]), [["box", true], ["mac/claude", false]]);
  });
});
