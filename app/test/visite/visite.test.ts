// La visite guidée du premier lancement (#3165, épique #3162). D'abord ses morceaux, devant un faux document : les six
// étapes dans l'ordre, chacune ancrée sur un élément vivant et dite en une ou deux phrases qui nomment le mot de Brigade ;
// une étape sans rien de vivant qui le dit et montre le dernier exemple ; la bulle, son « skip the tour » à chaque étape
// et son seul appel à agir à la dernière ; la trace du premier lancement. Puis la vue jouée entière (vue.js tel qu'il
// est, un faux pont) : l'ordinateur neuf où benomite/brigade s'ajoute sans rien taper et la visite démarre, le second
// lancement où rien ne se rajoute ni ne démarre, la visite passée puis rejouée depuis la barre, son dernier geste qui
// mène à l'ajout d'un projet.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { mettreAPart } from "../../src/attend.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import type { CompteGitHub } from "../../src/connexion-github.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { Ouverture, StationsDuChef } from "../../src/premier-lancement.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import type { Terminal } from "../../src/terminaux.ts";
import {
  AJOUTER_LE_SIEN,
  CLE_DE_LA_VISITE,
  COOK_EN_COURS,
  COOK_EXEMPLE,
  COOK_SANS_EXEMPLE,
  DEPOT_DE_LA_VISITE,
  etapesDeLaVisite,
  LECTURE_DU_RAIL,
  marqueurDeCible,
  MOT_COOK,
  MOT_PASS,
  MOT_RAIL,
  MOT_SECOND,
  MOT_SERVED,
  MOT_TODO,
  PASS_EN_COURS,
  PASS_EXEMPLE,
  PASS_SANS_EXEMPLE,
  PASSER,
  poserVisite,
  PROJET_DE_LA_VISITE,
  RANG,
  REJOUER,
  SERVI,
  SERVI_SANS_EXEMPLE,
  SUIVANTE,
  tenirLaVisite,
  TEXTE_SECOND,
  TODO_EN_COURS,
  TODO_VIDE,
  trouverLaCible,
  type ColonneLue,
  type Etape,
} from "../../src/vue/visite/visite.js";
import { Faux, FauxStockage, jouerLaVue, type Jouee, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };

const carte = (ticket: number) => ({ ticket, ouvrable: true, attendu: false, attend: [], fiche: {} }) as unknown as ColonneLue["cartes"][number];
const colonne = (nom: string, ...tickets: number[]): ColonneLue => ({ nom, cartes: tickets.map(carte) });
// Le rail d'un moment où tout bouge : #30 en cuisson, #31 en pass, #12 et #9 servis (le plus récent d'abord), #40 qui attend.
const VIVANT = [colonne("On the rail", 21), colonne("Taken", 30), colonne("Pass", 31), colonne("Awaiting you", 40), colonne("Waiting"), colonne("Served", 12, 9)];
// Le même moment, sans cook ni pass ni question : seul ce qui a été servi reste à montrer.
const CALME = [colonne("On the rail", 21), colonne("Taken"), colonne("Pass"), colonne("Awaiting you"), colonne("Waiting"), colonne("Served", 12, 9)];
// Rien du tout sur 24 h.
const VIDE = [colonne("On the rail"), colonne("Taken"), colonne("Pass"), colonne("Awaiting you"), colonne("Waiting"), colonne("Served")];

// Une ou deux phrases : un point final, un point d'interrogation ou un deux-points suivi d'un espace et d'une majuscule.
const phrases = (texte: string) => texte.split(/(?<=[.?!])\s+(?=[A-Z#])/).length;
const MOTS: Record<string, RegExp> = { rail: /\brail\b/, cook: /\bcook\b/, pass: /\bpass\b/, served: /\bserved\b/i, todo: /Awaiting you, the TODO/, second: /\bthe second\b/ };

describe("les six étapes, dans l'ordre du ticket", () => {
  test("une étape par élément — le rail, un cook, la pass, un servi, Awaiting you, le second —, chacune en une ou deux phrases qui nomment son mot", () => {
    const etapes = etapesDeLaVisite(VIVANT);
    assert.deepEqual(
      etapes.map(({ cle, mot }) => [cle, mot]),
      [
        ["rail", MOT_RAIL],
        ["cook", MOT_COOK],
        ["pass", MOT_PASS],
        ["served", MOT_SERVED],
        ["todo", MOT_TODO],
        ["second", MOT_SECOND],
      ],
    );
    for (const { cle, texte } of etapes) {
      assert.ok(phrases(texte) <= 2, `${cle} : ${texte}`);
      assert.match(texte, MOTS[cle] ?? assert.fail(cle), cle);
    }
  });

  test("le rail nomme ses colonnes telles que l'écran les montre ; chaque étape vivante désigne la carte du moment", () => {
    const etapes = etapesDeLaVisite(VIVANT);
    assert.match(etapes[0]?.texte ?? "", /one column per step — On the rail, Taken, Pass, Awaiting you, Waiting, Served\./);
    assert.deepEqual(
      etapes.map(({ texte, cible, exemple }) => ({ texte, cible, exemple })),
      [
        { texte: etapes[0]?.texte, cible: {}, exemple: undefined },
        { texte: COOK_EN_COURS(30), cible: { colonne: "Taken", ticket: 30 }, exemple: undefined },
        { texte: PASS_EN_COURS(31), cible: { colonne: "Pass", ticket: 31 }, exemple: undefined },
        { texte: SERVI(12), cible: { colonne: "Served", ticket: 12 }, exemple: undefined },
        { texte: TODO_EN_COURS(40), cible: { colonne: "Awaiting you", ticket: 40 }, exemple: undefined },
        { texte: TEXTE_SECOND, cible: { second: true }, exemple: undefined },
      ],
    );
  });

  test("aucun cook en cours, rien en pass : l'étape dit que rien ne se passe et montre le dernier ticket servi, la dernière livraison jugée", () => {
    const [, cook, pass, servi, todo] = etapesDeLaVisite(CALME) as Etape[];
    assert.equal(cook?.texte, COOK_EXEMPLE(12));
    assert.match(COOK_EXEMPLE(12), /^No cook is running right now\. Here is the last served ticket instead, #12/);
    assert.deepEqual(cook?.cible, { colonne: "Served", ticket: 12 });
    assert.equal(cook?.exemple, true);
    assert.equal(pass?.texte, PASS_EXEMPLE(12));
    assert.match(PASS_EXEMPLE(12), /^Nothing is in the pass right now\. Here is the last delivery it judged instead, #12/);
    assert.deepEqual(pass?.cible, { colonne: "Served", ticket: 12 });
    assert.equal(pass?.exemple, true);
    assert.equal(servi?.texte, SERVI(12));
    assert.equal(todo?.texte, TODO_VIDE);
    assert.deepEqual(todo?.cible, { colonne: "Awaiting you" });
  });

  test("rien servi non plus en 24 h : l'étape le dit, et désigne la colonne où cela se passerait — jamais vide ni cassée", () => {
    const [, cook, pass, servi] = etapesDeLaVisite(VIDE) as Etape[];
    assert.deepEqual([cook?.texte, cook?.cible], [COOK_SANS_EXEMPLE, { colonne: "Taken" }]);
    assert.deepEqual([pass?.texte, pass?.cible], [PASS_SANS_EXEMPLE, { colonne: "Pass" }]);
    assert.deepEqual([servi?.texte, servi?.cible], [SERVI_SANS_EXEMPLE, { colonne: "Served" }]);
    for (const etape of etapesDeLaVisite(VIDE)) assert.ok(etape.texte !== "" && phrases(etape.texte) <= 2, etape.cle);
  });

  test("une question qui attend un autre humain du projet (Awaiting others) est encore ce qu'une carte demande", () => {
    const todo = etapesDeLaVisite([{ nom: "Awaiting you", cartes: [], autres: [carte(47)] }])[4];
    assert.equal(todo?.texte, TODO_EN_COURS(47));
  });

  test("le rail pas encore lu : les étapes qui montrent un exemple le disent, au lieu d'un « rien ne se passe » qui serait faux", () => {
    const etapes = etapesDeLaVisite(undefined);
    assert.equal(etapes.length, 6);
    assert.deepEqual(etapes.slice(0, 5).map(({ texte }) => texte), Array(5).fill(LECTURE_DU_RAIL));
    assert.equal(etapes[5]?.texte, TEXTE_SECOND);
  });
});

// Le rail tel que vue.js le pose : la rangée `.colonnes`, une `section.colonne` par colonne (`data-colonne`), une carte
// par ticket (`data-ticket`).
function unRail() {
  const rail = new Faux("section");
  const rangee = new Faux("div");
  rangee.className = "colonnes";
  for (const { nom, cartes } of VIVANT) {
    const section = new Faux("section");
    section.className = "colonne";
    section.dataset.colonne = nom;
    const liste = new Faux("ol");
    for (const { ticket } of cartes) {
      const li = new Faux("li");
      li.className = "bon";
      li.dataset.ticket = String(ticket);
      liste.append(li);
    }
    section.append(liste);
    rangee.append(section);
  }
  rail.append(rangee);
  return { rail, rangee, second: new Faux("aside") };
}

describe("l'élément vivant que l'étape désigne", () => {
  test("la carte du ticket dans sa colonne ; la rangée pour le rail ; la colonne du second", () => {
    const ecran = unRail();
    const [rail, cook, , , , second] = etapesDeLaVisite(VIVANT) as Etape[];
    assert.equal(trouverLaCible(ecran, rail?.cible ?? {}), ecran.rangee);
    const trouvee = trouverLaCible(ecran, cook?.cible ?? {});
    assert.equal(trouvee.dataset.ticket, "30");
    assert.equal(trouvee.parentElement?.parentElement?.dataset.colonne, "Taken");
    assert.equal(trouverLaCible(ecran, second?.cible ?? {}), ecran.second);
  });

  test("une carte partie entre deux lectures : sa colonne ; une colonne absente : la rangée", () => {
    const ecran = unRail();
    assert.equal(trouverLaCible(ecran, { colonne: "Pass", ticket: 99 }).dataset.colonne, "Pass");
    assert.equal(trouverLaCible(ecran, { colonne: "Backlog" }), ecran.rangee);
  });

  test("marquée, elle porte `data-visite` ; la suivante la lui reprend", () => {
    const ecran = unRail();
    const marquer = marqueurDeCible();
    const premiere = trouverLaCible(ecran, { colonne: "Taken", ticket: 30 });
    const seconde = trouverLaCible(ecran, { colonne: "Served", ticket: 12 });
    marquer(premiere);
    assert.equal(premiere.dataset.visite, "");
    marquer(seconde);
    assert.equal(premiere.dataset.visite, undefined);
    assert.equal(seconde.dataset.visite, "");
    marquer(undefined);
    assert.equal(seconde.dataset.visite, undefined);
  });
});

describe("la bulle de l'étape", () => {
  const faits: string[] = [];
  const gestes = { suivante: () => void faits.push("suivante"), passer: () => void faits.push("passer"), ajouter: () => void faits.push("ajouter") };
  const etapes = etapesDeLaVisite(VIVANT);
  const boutons = (bulle: Faux) => bulle.dessous("button").map(({ textContent }) => textContent);

  test("à chaque étape : où on en est, le mot, la phrase, « next » et « skip the tour »", () => {
    for (let rang = 0; rang < etapes.length - 1; rang++) {
      const bulle = poserVisite(doc, { etapes, rang }, gestes) as Faux;
      assert.equal(bulle.dessous("p")[0]?.textContent, RANG(rang + 1, 6));
      assert.equal(bulle.dessous("h3")[0]?.textContent, etapes[rang]?.mot);
      assert.equal(bulle.dessous("p").find(({ className }) => className === "dit")?.textContent, etapes[rang]?.texte);
      assert.deepEqual(boutons(bulle), [SUIVANTE, PASSER]);
    }
  });

  test("la dernière : un seul appel à agir, « add your own project », et toujours de quoi passer", () => {
    const bulle = poserVisite(doc, { etapes, rang: 5 }, gestes) as Faux;
    assert.equal(bulle.dessous("h3")[0]?.textContent, MOT_SECOND);
    assert.deepEqual(boutons(bulle), [AJOUTER_LE_SIEN, PASSER]);
    assert.equal(bulle.dessous("button").filter((bouton) => bouton.dataset.bouton === "recommande").length, 1);
    bulle.dessous("button")[0]?.click();
    bulle.dessous("button")[1]?.click();
    assert.deepEqual(faits.splice(0), ["ajouter", "passer"]);
  });

  test("une étape qui montre le dernier exemple le marque", () => {
    const calme = etapesDeLaVisite(CALME);
    assert.equal((poserVisite(doc, { etapes: calme, rang: 1 }, gestes) as Faux).dataset.exemple, "");
    assert.equal((poserVisite(doc, { etapes, rang: 1 }, gestes) as Faux).dataset.exemple, undefined);
  });
});

describe("la trace du premier lancement", () => {
  const AU = "2026-11-11T10:00:00.000Z";
  test("sans trace, c'est le premier lancement ; commencée, la visite laisse la sienne, et ne l'est plus", () => {
    const stockage = new FauxStockage();
    let rendus = 0;
    const visite = tenirLaVisite({ stockage, rendre: () => void rendus++, maintenant: () => AU });
    assert.equal(visite.aDecouvrir(), true);
    visite.commencer("brigade");
    assert.deepEqual(visite.etat, { projet: "brigade", rang: 0 });
    assert.equal(stockage.getItem(CLE_DE_LA_VISITE), JSON.stringify({ montree: AU }));
    assert.equal(visite.aDecouvrir(), false);
    for (let fois = 0; fois < 9; fois++) visite.suivante(6);
    assert.equal(visite.etat?.rang, 5);
    visite.fermer();
    assert.equal(visite.etat, undefined);
    assert.equal(rendus, 11);
    // Relue par une autre vue — l'app rouverte —, la trace tient.
    assert.equal(tenirLaVisite({ stockage, rendre: () => {} }).aDecouvrir(), false);
  });

  test("un stockage absent ou illisible n'est pas un premier lancement : rien ne s'ajouterait à chaque lancement", () => {
    assert.equal(tenirLaVisite({ stockage: undefined, rendre: () => {} }).aDecouvrir(), false);
    const illisible = {
      getItem: (): string | null => {
        throw new Error("SecurityError");
      },
      setItem: () => {},
    };
    assert.equal(tenirLaVisite({ stockage: illisible, rendre: () => {} }).aDecouvrir(), false);
  });

  test("une trace qui ne s'écrit pas n'empêche pas la visite", () => {
    const plein = {
      getItem: (): string | null => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const visite = tenirLaVisite({ stockage: plein, rendre: () => {} });
    visite.commencer("brigade");
    assert.deepEqual(visite.etat, { projet: "brigade", rang: 0 });
  });
});

// La vue jouée entière.
const CHEMIN = "/home/chef/.config/brigade/app.json";
const BRIGADE: Projet = { nom: PROJET_DE_LA_VISITE, dossier: "/home/chef/.local/share/brigade/projects/brigade", depot: DEPOT_DE_LA_VISITE, base: "main" };
const demarrage = (projets: Projet[], servi = false) => ({
  configuration: pourLaBarre({ chemin: CHEMIN, projets }, () => servi),
  poste: { nom: "this computer", mac: false },
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
// Le chef n'a encore appairé aucune station : l'ordinateur est neuf.
const AUCUNE: StationsDuChef = { state: "listed", unreadable: [], stations: [] };
const OUVERT: Ouverture = { state: "open", project: PROJET_DE_LA_VISITE, repository: DEPOT_DE_LA_VISITE, folder: BRIGADE.dossier, cloned: true };
const SECOND: Terminal = { id: 1, projet: PROJET_DE_LA_VISITE, genre: "second", titre: "second · claude", note: "", arrete: false };

const bulle = (vue: Jouee) => vue.element("visite");
const enTete = (vue: Jouee) => bulle(vue).dessous("h3")[0]?.textContent;
const bouton = (vue: Jouee, libelle: string) => bulle(vue).dessous("button").find(({ textContent }) => textContent === libelle) ?? assert.fail(`pas de bouton « ${libelle} » : ${bulle(vue).dessous("button").map(({ textContent }) => textContent).join(", ")}`);
const ouvertures = (vue: Jouee) => vue.appels.filter(({ geste }) => geste === "ouvrirDUneStation");
const rejouer = (vue: Jouee) => vue.poses().find(({ id }) => id === "entree-visite") ?? assert.fail("pas d'entrée pour rejouer la visite");

// Un premier lancement : le fichier sans projet, le compte GitHub de cet ordinateur lu, la copie de brigade faite.
async function premierLancement(stockage: FauxStockage, compte: () => CompteGitHub = () => ({ login: "newcomer" })) {
  const vue = await jouerLaVue({ demarrage: () => demarrage([]), stationsDuChef: () => AUCUNE, compteGitHub: compte, ouvrirDUneStation: () => OUVERT, espace: () => [SECOND] }, { stockage });
  await repos();
  return vue;
}
// Le fichier relu, brigade dedans : son espace s'ouvre.
async function brigadeAjoute(vue: Jouee) {
  vue.dire("surConfiguration", pourLaBarre({ chemin: CHEMIN, projets: [BRIGADE] }), []);
  await repos();
}

describe("la vue jouée : l'ordinateur neuf, puis le lancement suivant", () => {
  test("premier lancement, connecté à GitHub : benomite/brigade s'ajoute sans rien taper, son espace s'ouvre sur la visite", async () => {
    const stockage = new FauxStockage();
    const vue = await premierLancement(stockage);
    assert.deepEqual(
      ouvertures(vue).map(({ args }) => args),
      [[PROJET_DE_LA_VISITE, DEPOT_DE_LA_VISITE]],
    );
    await brigadeAjoute(vue);
    assert.equal(vue.element("espace").textContent, PROJET_DE_LA_VISITE);
    assert.equal(bulle(vue).hidden, false);
    assert.equal(enTete(vue), MOT_RAIL);
    assert.notEqual(stockage.getItem(CLE_DE_LA_VISITE), null);
  });

  test("pas encore connecté : rien ne s'ajoute ; la connexion faite, brigade s'ajoute", async () => {
    let comptes = 0;
    const vue = await premierLancement(new FauxStockage(), () => (++comptes === 1 ? { nonConnecte: true } : { login: "newcomer" }));
    assert.equal(ouvertures(vue).length, 0);
    vue.dire("surConnexionGitHub", { connecte: true });
    await repos();
    assert.deepEqual(ouvertures(vue).map(({ args }) => args), [[PROJET_DE_LA_VISITE, DEPOT_DE_LA_VISITE]]);
  });

  test("la copie qui échoue : la raison se dit sur le premier écran, la visite ne démarre pas et n'est pas tenue pour montrée", async () => {
    const stockage = new FauxStockage();
    const echec: Ouverture = { state: "failed", project: PROJET_DE_LA_VISITE, repository: DEPOT_DE_LA_VISITE, cause: "network", reason: "GitHub could not be reached to clone benomite/brigade." } as Ouverture;
    const vue = await jouerLaVue({ demarrage: () => demarrage([]), stationsDuChef: () => AUCUNE, compteGitHub: () => ({ login: "newcomer" }), ouvrirDUneStation: () => echec, espace: () => [] }, { stockage });
    await repos();
    assert.equal(ouvertures(vue).length, 1);
    assert.ok(vue.element("tous").dessous("span").some(({ textContent }) => textContent === "GitHub could not be reached to clone benomite/brigade."));
    assert.equal(bulle(vue).hidden, true);
    assert.equal(stockage.getItem(CLE_DE_LA_VISITE), null);
  });

  test("second lancement, la visite passée : aucun projet ne se rajoute, la visite ne démarre pas — même brigade retiré du fichier", async () => {
    const stockage = new FauxStockage();
    const premiere = await premierLancement(stockage);
    await brigadeAjoute(premiere);
    bouton(premiere, PASSER).click();
    await repos();
    assert.equal(bulle(premiere).hidden, true);

    const seconde = await jouerLaVue({ demarrage: () => demarrage([BRIGADE]), stationsDuChef: () => AUCUNE, compteGitHub: () => ({ login: "newcomer" }), ouvrirDUneStation: () => OUVERT, espace: () => [] }, { stockage });
    await repos();
    assert.equal(ouvertures(seconde).length, 0);
    assert.equal(bulle(seconde).hidden, true);
    (seconde.element("projets").children.at(1) ?? assert.fail("pas de case brigade")).click();
    await repos();
    assert.equal(bulle(seconde).hidden, true);

    const sansProjet = await premierLancement(stockage);
    assert.equal(ouvertures(sansProjet).length, 0);
    assert.equal(bulle(sansProjet).hidden, true);
  });

  test("second lancement, la visite finie jusqu'au bout : rien ne se rajoute ni ne démarre", async () => {
    const stockage = new FauxStockage();
    const premiere = await premierLancement(stockage);
    await brigadeAjoute(premiere);
    for (let fois = 0; fois < 5; fois++) {
      bouton(premiere, SUIVANTE).click();
      await repos();
    }
    bouton(premiere, AJOUTER_LE_SIEN).click();
    await repos();
    const seconde = await premierLancement(stockage);
    assert.equal(ouvertures(seconde).length, 0);
    assert.equal(bulle(seconde).hidden, true);
  });
});

describe("la vue jouée : la visite en marche", () => {
  test("six étapes, « skip the tour » à chacune ; la dernière mène à l'ajout d'un projet", async () => {
    const vue = await premierLancement(new FauxStockage());
    await brigadeAjoute(vue);
    const vues: (string | undefined)[] = [];
    for (let fois = 0; fois < 5; fois++) {
      vues.push(enTete(vue));
      bouton(vue, PASSER);
      bouton(vue, SUIVANTE).click();
      await repos();
    }
    vues.push(enTete(vue));
    assert.deepEqual(vues, [MOT_RAIL, MOT_COOK, MOT_PASS, MOT_SERVED, MOT_TODO, MOT_SECOND]);
    assert.deepEqual(bulle(vue).dessous("button").map(({ textContent }) => textContent), [AJOUTER_LE_SIEN, PASSER]);
    // Le second désigné : sa colonne.
    assert.equal(vue.element("second").dataset.visite, "");
    bouton(vue, AJOUTER_LE_SIEN).click();
    await repos();
    assert.equal(bulle(vue).hidden, true);
    assert.equal(vue.element("ajout").hidden, false);
    assert.equal(vue.element("second").dataset.visite, undefined);
  });

  test("passée, puis rejouée depuis la barre : elle repart de sa première étape, sur brigade", async () => {
    const vue = await premierLancement(new FauxStockage());
    await brigadeAjoute(vue);
    bouton(vue, SUIVANTE).click();
    await repos();
    bouton(vue, PASSER).click();
    await repos();
    assert.equal(bulle(vue).hidden, true);
    assert.equal(rejouer(vue).title, REJOUER);
    // Ailleurs dans l'app : la visite rejouée y ramène.
    vue.poses().find(({ id }) => id === "entree-tous")?.click();
    await repos();
    rejouer(vue).click();
    await repos();
    assert.equal(vue.element("espace").textContent, PROJET_DE_LA_VISITE);
    assert.equal(bulle(vue).hidden, false);
    assert.equal(enTete(vue), MOT_RAIL);
  });

  test("rejouée après avoir été finie, au lancement suivant", async () => {
    const stockage = new FauxStockage();
    stockage.setItem(CLE_DE_LA_VISITE, JSON.stringify({ montree: "2026-11-10T09:00:00.000Z" }));
    const vue = await jouerLaVue({ demarrage: () => demarrage([BRIGADE]), espace: () => [] }, { stockage });
    assert.equal(bulle(vue).hidden, true);
    rejouer(vue).click();
    await repos();
    assert.equal(bulle(vue).hidden, false);
    assert.equal(enTete(vue), MOT_RAIL);
  });

  test("sur le vrai rail : chaque étape désigne la carte du moment ; sans cook en cours, le dernier ticket servi", async () => {
    const A = "2026-11-11T10:04:12.000Z";
    const url = (ticket: number) => `https://github.com/benomite/brigade/issues/${ticket}`;
    const entree = (ticket: number, etat: string) => ({ ticket, etat, titre: `Ticket ${ticket}`, url: url(ticket), activite: null, attente: null });
    const faits = (enCuisson: boolean): Faits => ({
      etat: "ouverte",
      lu: A,
      dernierTick: A,
      compteurs: { rail: 1, auTravail: enCuisson ? 1 : 0, aLaPass: 1, attend: 0, livres24h: 1 },
      dernierEvenement: null,
      rail: [entree(21, "en attente"), ...(enCuisson ? [entree(30, "pris")] : []), entree(31, "en pass"), entree(12, "servi")],
      cooks: [],
      attend: [],
    });
    const dessinable = (enCuisson: boolean) => {
      const tenus = tenirFaits();
      const recue = tenus.recevoir({ projet: PROJET_DE_LA_VISITE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits(enCuisson)) }] });
      return tenus.attendre(mettreAPart({ projet: PROJET_DE_LA_VISITE, demande: 0, a: A, sorties: [{ commande: "status", texte: "projet     brigade\ncuisine    ouverte\n" }] })) ?? recue;
    };
    const stockage = new FauxStockage();
    stockage.setItem(CLE_DE_LA_VISITE, JSON.stringify({ montree: A }));
    const vue = await jouerLaVue({ demarrage: () => demarrage([BRIGADE], true), espace: () => [SECOND] }, { stockage });
    rejouer(vue).click();
    await repos();
    const recevoir = async (enCuisson: boolean) => {
      vue.dire("surFaits", { ...dessinable(enCuisson), demande: vue.dernier("faits")[0] as number });
      await repos();
    };
    await recevoir(true);
    const marquee = () => vue.poses().filter(({ dataset }) => dataset.visite !== undefined);
    // Le rail : sa rangée de colonnes.
    assert.deepEqual(marquee().map(({ className }) => className), ["colonnes"]);
    bouton(vue, SUIVANTE).click();
    await repos();
    assert.equal(bulle(vue).dessous("p").find(({ className }) => className === "dit")?.textContent, COOK_EN_COURS(30));
    assert.deepEqual(marquee().map(({ dataset }) => dataset.ticket), ["30"]);
    // Le cook a rendu sa livraison : la lecture suivante n'a plus personne en cuisson.
    await recevoir(false);
    assert.equal(bulle(vue).dessous("p").find(({ className }) => className === "dit")?.textContent, COOK_EXEMPLE(12));
    assert.deepEqual(marquee().map(({ dataset }) => dataset.ticket), ["12"]);
    bouton(vue, SUIVANTE).click();
    await repos();
    assert.equal(bulle(vue).dessous("p").find(({ className }) => className === "dit")?.textContent, PASS_EN_COURS(31));
    assert.deepEqual(marquee().map(({ dataset }) => dataset.ticket), ["31"]);
  });
});
