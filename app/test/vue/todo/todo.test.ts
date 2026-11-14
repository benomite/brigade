// TODO n'est pas une colonne (#3458) : ce qui attend le chef est rangé, rouge et en tête, dans la colonne de son étape ;
// l'entrée « TODO (N) » les compte et les filtre. D'abord le rangement tel que todo/todo.js le fait, sur les colonnes que le
// process principal rend (faits.ts) ; puis la vue jouée telle qu'elle est (aides/fausse-vue.ts) : l'entrée, son filtre, le
// téléphone, et l'accueil, qui dit le même compte.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import { EXEMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE, rail, tenirFaits, type Carte, type Colonne, type Faits } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projets/projets.ts";
import { colonneDe, estRouge, LISTE_DU_CHEF, rangerLeRail } from "../../../src/vue/todo/todo.js";
import { rouges } from "../../aides/rouges.ts";
import { Faux, FauxEcran, type Jouee, jouerLaVue, repos } from "../../aides/fausse-vue.ts";

const A = "2026-11-13T10:04:12.000Z";
const PARADE = "parade";
const issue = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const ticket = (numero: number, etat: string, plus: Partial<Faits["rail"][number]> = {}): Faits["rail"][number] => ({ ticket: numero, etat, titre: `Ticket ${numero}`, url: issue(numero), activite: null, ...plus });
const TIERS = { quoi: "the signed quote", qui: "the client", depuis: "2026-11-01T10:00:00.000Z", aLArrivee: "it goes back to the kitchen" };

// Un ticket qui attend le chef à chaque étape : #20 sur le rail, #14 pris, #30 en pass, #40 mis de côté là où le runtime dit
// qu'il attend (Pass), #60 pas encore sur le rail ; #8 en WAITING, sa relance passée ; #9 en WAITING, sa relance à venir.
const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-11-13T10:04:11.000Z",
  dernierTick: null,
  compteurs: { rail: 2, auTravail: 2, aLaPass: 2, attend: 5, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    ticket(21, "en attente"),
    ticket(20, "en attente"),
    ticket(15, "pris"),
    ticket(14, "pris"),
    ticket(31, "en pass"),
    ticket(30, "en pass"),
    ticket(40, "86", { attente: { raison: "attend : le chef", colonne: "en pass", retour: null } }),
    ticket(8, "WAITING", { tiers: { ...TIERS, relance: "2026-11-10T00:00:00.000Z" } }),
    ticket(9, "WAITING", { tiers: { ...TIERS, relance: "2026-11-20T00:00:00.000Z" } }),
  ],
  attend: [20, 14, 30, 40, 60].map((numero) => ({ ticket: numero, titre: `Ticket ${numero}`, url: issue(numero) })),
  livres: [],
};
const cartes = (colonnes: readonly Colonne[]) => colonnes.map(({ nom, compte, cartes: siennes }) => [nom, compte, siennes.map(({ ticket: numero }) => numero)]);

describe("le rangement : chaque carte qui attend le chef dans la colonne de son étape, en tête", () => {
  test("le process principal dit l'étape de chaque carte du chef, et la relance passée d'une carte de WAITING", () => {
    const lu = rail(FAITS);
    const liste = lu.colonnes.find(({ nom }) => nom === LISTE_DU_CHEF) ?? assert.fail("pas de liste du chef");
    assert.deepEqual(
      liste.cartes.map(({ ticket: numero, etape }) => [numero, etape]),
      [
        [20, "On the rail"],
        [14, "Taken"],
        [30, "Pass"],
        [40, "Pass"],
        [60, "On the rail"],
      ],
    );
    const waiting = lu.colonnes.find(({ nom }) => nom === "Waiting")?.cartes ?? [];
    assert.deepEqual(waiting.map(({ ticket: numero, relancePassee }) => [numero, relancePassee]), [[8, true], [9, undefined]]);
    // Une carte qui n'attend personne ne porte pas d'étape : sa colonne la dit.
    assert.equal(lu.colonnes.find(({ nom }) => nom === "On the rail")?.cartes[0]?.etape, undefined);
  });

  test("aucune colonne TODO ; les rouges en tête de leur colonne, avant les autres ; N les compte toutes, WAITING compris", () => {
    const range = rangerLeRail(rail(FAITS).colonnes);
    assert.deepEqual(cartes(range.colonnes), [
      ["On the rail", "3", [20, 60, 21]],
      ["Taken", "2", [14, 15]],
      ["Pass", "3", [30, 40, 31]],
      ["Waiting", "2", [8, 9]],
      ["Served", "0", []],
    ]);
    assert.equal(range.compte, "6");
    for (const colonne of range.colonnes) {
      const rouges = colonne.cartes.map(estRouge);
      assert.deepEqual(rouges, rouges.toSorted((a, b) => Number(b) - Number(a)), `${colonne.nom} : une rouge après une autre`);
    }
  });

  test("rien n'attend le chef : N vaut 0, et rien n'est rouge", () => {
    const range = rangerLeRail(rail({ ...FAITS, attend: [], rail: FAITS.rail.filter(({ ticket: numero }) => numero !== 8) }).colonnes);
    assert.equal(range.compte, "0");
    assert.ok(range.colonnes.every(({ cartes: siennes }) => !siennes.some(estRouge)));
  });

  test("la liste pas lue : N est « ? » ; la box muette aussi", () => {
    const pasLu = rangerLeRail(rail({ ...FAITS, attend: undefined }).colonnes);
    assert.equal(pasLu.compte, "?");
    const muette = rangerLeRail(rail(FAITS).colonnes.map((colonne) => ({ ...colonne, compte: "?", cartes: [] })));
    assert.deepEqual([muette.compte, muette.colonnes.map(({ compte }) => compte)], ["?", ["?", "?", "?", "?", "?"]]);
  });

  test("une carte du chef n'est jamais perdue faute de colonne : une étape inconnue, ou un rail sans On the rail, la pose sur le rail", () => {
    const carte = (numero: number, etape?: string): Carte => ({ ticket: numero, ouvrable: false, attendu: true, attend: [], dit: [], fiche: {}, ...(etape === undefined ? {} : { etape }) }) as unknown as Carte;
    assert.equal(colonneDe(carte(1, "Backlog"), ["On the rail", "Pass"]), "On the rail");
    assert.equal(colonneDe(carte(1, "Pass"), ["On the rail", "Pass"]), "Pass");
    const seule = rangerLeRail([{ nom: LISTE_DU_CHEF, ton: "rouge", compte: "1", cartes: [carte(12)], vide: "" }]);
    assert.deepEqual(cartes(seule.colonnes), [["On the rail", "1", [12]]]);
    assert.equal(seule.compte, "1");
  });

  test("ce qui attend un autre humain n'est pas rouge, ni compté : il reste à part", () => {
    const autre = { ...rail(FAITS).colonnes[0]?.cartes[0], attendu: true, qui: ["bob"] } as Carte;
    assert.equal(estRouge(autre), false);
    const range = rangerLeRail(rail({ ...FAITS, attendAutres: [{ ticket: 70, titre: "Ticket 70", url: issue(70), qui: ["bob"] }] }).colonnes);
    assert.deepEqual(range.autres?.map(({ ticket: numero }) => numero), [70]);
    assert.ok(!range.colonnes.some(({ cartes: siennes }) => siennes.some(({ ticket: numero }) => numero === 70)));
    assert.equal(range.compte, "6");
  });
});

const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
async function ouvrir(etroit: boolean, faits: Faits = FAITS): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [] }, { ecran: new FauxEcran(etroit) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  recevoir(vue, faits);
  return vue;
}
function recevoir(vue: Jouee, faits: Faits) {
  const recue = tenirFaits(() => new Map()).recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
}
// Plus d'entrée « TODO (N) » ni de filtre sur le rail (#3523) : le compte est celui des cartes rouges, que l'accueil dit aussi.
const entree = (vue: Jouee): Faux | undefined => vue.element("rail").dessous("button").find(({ className }) => className === "entree-todo");
const lesColonnes = (vue: Jouee) => vue.element("rail").dessous("section").filter(({ className }) => className === "colonne");
const bonsDe = (colonne: Faux) => colonne.dessous("li").filter(({ className }) => className.split(" ").includes("bon")).map(({ dataset }) => [Number(dataset.ticket), dataset.carte === "attente"]);

describe("la vue du projet, sur un écran large et sur un téléphone", () => {
  for (const etroit of [false, true]) {
    test(`${etroit ? "téléphone" : "écran large"} : aucune colonne TODO, ni entrée ni filtre ; les rouges en tête de leur étape, au nombre de 6`, async () => {
      const vue = await ouvrir(etroit);
      assert.deepEqual(lesColonnes(vue).map(({ dataset }) => dataset.colonne), ["On the rail", "Taken", "Pass", "Waiting", "Served"]);
      assert.deepEqual(lesColonnes(vue).map(bonsDe), [
        [[20, true], [60, true], [21, false]],
        [[14, true], [15, false]],
        [[30, true], [40, true], [31, false]],
        [[8, true], [9, false]],
        [],
      ]);
      assert.equal(rouges(vue.element("rail")).length, 6);
      assert.equal(entree(vue), undefined);
      // La colonne où une carte rouge attend le chef est en vue à l'ouverture.
      assert.ok(lesColonnes(vue).filter(({ dataset }) => "attend" in dataset).every(({ dataset }) => "actif" in dataset));
      // Une lecture suivante ne change rien : il n'y a pas de filtre à garder.
      recevoir(vue, FAITS);
      assert.equal(rouges(vue.element("rail")).length, 6);
    });
  }

  test("chaque carte rouge garde sa question et son geste, comme dans TODO : rien n'est perdu", async () => {
    const vue = await ouvrir(false);
    const rouge = vue.element("rail").dessous("li").find(({ dataset }) => dataset.ticket === "20") ?? assert.fail("pas de #20");
    assert.ok(rouge.dessous("span").some(({ dataset }) => dataset.pastille === "awaiting"), "pas de « awaiting you »");
    assert.ok(rouge.dessous("button").some(({ className }) => className === "demander"), "pas de geste sur la carte");
  });

  test("rien n'attend le chef : aucune carte rouge nulle part", async () => {
    const vue = await ouvrir(false, { ...FAITS, attend: [], rail: FAITS.rail.filter(({ ticket: numero }) => numero !== 8) });
    assert.equal(vue.element("rail").dessous("li").filter(({ dataset }) => dataset.carte === "attente").length, 0);
  });
});

describe("l'accueil dit le compte des cartes rouges du rail", () => {
  test("le rail lu, la ligne du projet compte ses cartes rouges ; une lecture qui le change la repose", async () => {
    const vue = await ouvrir(false);
    (vue.element("projets").children.at(0) ?? assert.fail("pas de « Tous les projets »")).click();
    await repos();
    const compte = () => vue.element("accueil-projets").dessous("span").find(({ className }) => className === "attend")?.textContent;
    assert.match(compte() ?? "", /^6 /);
    recevoir(vue, { ...FAITS, attend: [] });
    await repos();
    assert.match(compte() ?? "", /^1 /);
  });
});
