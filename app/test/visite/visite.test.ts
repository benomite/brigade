// La visite d'une vraie cuisine (#4087, née visite guidée du premier lancement, #3165). D'abord ses morceaux, devant un
// faux document : les six étapes dans l'ordre, chacune ancrée sur un élément vivant et dite en une ou deux phrases qui
// nomment le mot de Brigade ; une étape sans rien de vivant qui le dit et montre le dernier exemple ; la bulle, son « next »
// et son seul appel à agir à la dernière ; l'écran de la cuisine visitée, en lecture seule — en lecture, lu, illisible ;
// la visite tenue. Puis la vue jouée entière (vue.js tel qu'il est, un faux pont) : la visite choisie sur l'écran
// d'accueil, lue sur GitHub sans clone ni ajout, ses étapes sur la cuisine lue, quittée d'une étape avancée, rejouée depuis
// la barre, sa lecture qui échoue puis se relit, et son dernier geste qui mène à l'ajout d'un projet.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits, type Tableau } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { Ouverture, StationsDuChef } from "../../src/premier-lancement.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { mettreAPart } from "../../src/attend.ts";
import { VISITER } from "../../src/vue/accueil/choix/choix.js";
import {
  AJOUTER_LE_SIEN,
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
  CUISINE_ILLISIBLE,
  LECTURE_SEULE,
  poserLaCuisineVisitee,
  poserVisite,
  QUITTER,
  RANG,
  REJOUER,
  RELIRE,
  SECOND_DE_LA_VISITE,
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
const MOTS: Record<string, RegExp> = { rail: /\brail\b/, cook: /\bcook\b/, pass: /\bpass\b/, served: /\bserved\b/i, todo: /red in the column of its step, counted by the TODO/, second: /\bthe second\b/ };

describe("les six étapes, dans l'ordre du ticket", () => {
  test("une étape par élément — le rail, un cook, la pass, un servi, TODO, le second —, chacune en une ou deux phrases qui nomment son mot", () => {
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
    // TODO n'est pas une colonne (#3458) : le rail nomme les colonnes des étapes, celles que l'écran montre.
    assert.match(etapes[0]?.texte ?? "", /one column per step — On the rail, Taken, Pass, Waiting, Served\./);
    assert.deepEqual(
      etapes.map(({ texte, cible, exemple }) => ({ texte, cible, exemple })),
      [
        { texte: etapes[0]?.texte, cible: {}, exemple: undefined },
        { texte: COOK_EN_COURS(30), cible: { colonne: "Taken", ticket: 30 }, exemple: undefined },
        { texte: PASS_EN_COURS(31), cible: { colonne: "Pass", ticket: 31 }, exemple: undefined },
        { texte: SERVI(12), cible: { colonne: "Served", ticket: 12 }, exemple: undefined },
        { texte: TODO_EN_COURS(40), cible: { colonne: "On the rail", ticket: 40 }, exemple: undefined },
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
    assert.deepEqual(todo?.cible, { todo: true });
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
    // Repliée à côté de l'entrée « TODO (N) », hors des colonnes (#3458).
    assert.deepEqual(todo?.cible, { todo: true, ticket: 47 });
  });

  test("une carte qui attend le chef est désignée dans la colonne de son étape, rouge (#3458)", () => {
    const enPass = { ...carte(41), attendu: true, etape: "Pass" };
    const etapes = etapesDeLaVisite([colonne("On the rail", 21), colonne("Taken"), colonne("Pass", 31), { nom: "Awaiting you", cartes: [enPass] }, colonne("Waiting"), colonne("Served")]);
    assert.deepEqual(etapes[4]?.cible, { colonne: "Pass", ticket: 41 });
    assert.doesNotMatch(etapes[0]?.texte ?? "", /Awaiting you/);
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

  test("l'entrée « TODO (N) », et la carte d'autrui repliée à côté d'elle ; sans entrée posée, la rangée", () => {
    const ecran = unRail();
    assert.equal(trouverLaCible(ecran, { todo: true }), ecran.rangee);
    const todo = new Faux("div");
    todo.className = "todo-du-rail";
    const li = new Faux("li");
    li.className = "bon";
    li.dataset.ticket = "47";
    todo.append(li);
    ecran.rail.append(todo);
    assert.equal(trouverLaCible(ecran, { todo: true }), todo);
    assert.equal(trouverLaCible(ecran, { todo: true, ticket: 47 }), li);
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
  const gestes = { suivante: () => void faits.push("suivante"), ajouter: () => void faits.push("ajouter") };
  const etapes = etapesDeLaVisite(VIVANT);
  const boutons = (bulle: Faux) => bulle.dessous("button").map(({ textContent }) => textContent);

  test("à chaque étape : où on en est, le mot, la phrase, et « next »", () => {
    for (let rang = 0; rang < etapes.length - 1; rang++) {
      const bulle = poserVisite(doc, { etapes, rang }, gestes) as Faux;
      assert.equal(bulle.dessous("p")[0]?.textContent, RANG(rang + 1, 6));
      assert.equal(bulle.dessous("h3")[0]?.textContent, etapes[rang]?.mot);
      assert.equal(bulle.dessous("p").find(({ className }) => className === "dit")?.textContent, etapes[rang]?.texte);
      assert.deepEqual(boutons(bulle), [SUIVANTE]);
    }
    (poserVisite(doc, { etapes, rang: 0 }, gestes) as Faux).dessous("button")[0]?.click();
    assert.deepEqual(faits.splice(0), ["suivante"]);
  });

  test("la dernière : un seul appel à agir, « add my project », le mot même de l'écran d'accueil", () => {
    const bulle = poserVisite(doc, { etapes, rang: 5 }, gestes) as Faux;
    assert.equal(bulle.dessous("h3")[0]?.textContent, MOT_SECOND);
    assert.deepEqual(boutons(bulle), ["add my project"]);
    assert.equal(bulle.dessous("button").filter((bouton) => bouton.dataset.bouton === "recommande").length, 1);
    bulle.dessous("button")[0]?.click();
    assert.deepEqual(faits.splice(0), ["ajouter"]);
  });

  test("une étape qui montre le dernier exemple le marque", () => {
    const calme = etapesDeLaVisite(CALME);
    assert.equal((poserVisite(doc, { etapes: calme, rang: 1 }, gestes) as Faux).dataset.exemple, "");
    assert.equal((poserVisite(doc, { etapes, rang: 1 }, gestes) as Faux).dataset.exemple, undefined);
  });
});

// Un tableau tel que le process principal le range de la cuisine lue (visite.ts) : ses colonnes, rien d'autre n'y est lu.
const tableauDe = (colonnes: ColonneLue[]) => ({ rail: { colonnes: colonnes.map((colonne) => ({ ton: "", compte: "", vide: `nothing in ${colonne.nom}`, ...colonne })), hors: [] } }) as unknown as Tableau;

describe("l'écran de la cuisine visitée", () => {
  const faits: string[] = [];
  const gestes = { quitter: () => void faits.push("quitter"), relire: () => void faits.push("relire") };
  const boutons = (racine: Faux) => racine.dessous("button").map(({ textContent }) => textContent);

  test("en tête : la cuisine de Brigade, en lecture seule, et « leave the visit », qui quitte", () => {
    const { racine } = poserLaCuisineVisitee(doc, undefined, gestes) as { racine: Faux };
    assert.equal(racine.dessous("h2")[0]?.textContent, "Brigade's own kitchen");
    assert.ok(racine.dessous("span").some(({ textContent }) => textContent === "benomite/brigade"));
    assert.ok(racine.dessous("p").some(({ textContent }) => textContent === LECTURE_SEULE));
    const quitter = racine.dessous("button").find(({ textContent }) => textContent === QUITTER) ?? assert.fail("pas de « leave the visit »");
    quitter.click();
    assert.deepEqual(faits.splice(0), ["quitter"]);
  });

  test("en lecture : le rail le dit ; le second, que la visite n'ouvre pas, le dit aussi", () => {
    const { rail, second } = poserLaCuisineVisitee(doc, undefined, gestes) as { rail: Faux; second: Faux };
    assert.equal(rail.textContent, LECTURE_DU_RAIL);
    assert.equal(second.dessous("h4")[0]?.textContent, MOT_SECOND);
    assert.equal(second.dessous("p")[0]?.textContent, SECOND_DE_LA_VISITE);
  });

  test("lue : une colonne par étape, une carte par ticket, celles qui attendent un humain rouges en tête de leur étape — et aucun autre geste que de quitter", () => {
    const attendue = { ...carte(41), titre: "Une question", etape: "Pass", mot: "awaiting you", ton: "rouge" } as unknown as ColonneLue["cartes"][number];
    const colonnes = [...VIVANT.filter(({ nom }) => nom !== "Awaiting you"), { nom: "Awaiting you", cartes: [attendue] }];
    const { racine, rail } = poserLaCuisineVisitee(doc, { tableau: tableauDe(colonnes) }, gestes) as { racine: Faux; rail: Faux };
    const sections = rail.dessous("section");
    assert.deepEqual(sections.map(({ dataset }) => dataset.colonne), ["On the rail", "Taken", "Pass", "Waiting", "Served"]);
    const pass = sections.find(({ dataset }) => dataset.colonne === "Pass") ?? assert.fail("pas de Pass");
    assert.deepEqual(pass.dessous("li").map(({ dataset }) => [dataset.ticket, dataset.carte]), [["41", "attente"], ["31", undefined]]);
    assert.equal(pass.dessous("h4")[0]?.textContent, "Pass2");
    // Son numéro, le mot de son état — dans son ton — et son titre ; une carte sans mot n'en pose pas de vide.
    assert.equal(pass.dessous("li")[0]?.textContent, "#41awaiting youUne question");
    assert.deepEqual(pass.dessous("span").filter(({ className }) => className === "mot-visite").map(({ dataset }) => dataset.ton), ["rouge"]);
    assert.equal(pass.dessous("li")[1]?.textContent, "#31");
    assert.equal(sections.find(({ dataset }) => dataset.colonne === "Waiting")?.dessous("p")[0]?.textContent, "nothing in Waiting");
    assert.deepEqual(boutons(racine), [QUITTER]);
    // Les étapes désignent ce que cet écran montre.
    assert.equal(trouverLaCible({ rail, second: new Faux("aside") }, { colonne: "Taken", ticket: 30 }).dataset.ticket, "30");
  });

  test("illisible : une ligne, la raison au survol, et « read again », qui relit", () => {
    const { racine, rail } = poserLaCuisineVisitee(doc, { sans: "GitHub could not be reached to read the rail of benomite/brigade." }, gestes) as { racine: Faux; rail: Faux };
    const ligne = rail.children[0] ?? assert.fail("rien sur le rail");
    assert.equal(ligne.dataset.ligne, "erreur");
    assert.match(ligne.textContent, new RegExp(CUISINE_ILLISIBLE.replace(/[.']/g, "\\$&")));
    assert.ok([...ligne.descendants(), ligne].some(({ title, ariaLabel }) => `${title} ${ariaLabel}`.includes("GitHub could not be reached")), "la raison est au survol");
    // Le « ? » est le survol de la raison, pas un geste.
    assert.deepEqual(boutons(racine), [QUITTER, "?", RELIRE]);
    assert.equal(racine.dessous("button")[2]?.dataset.bouton, "recommande", "« read again » est le geste recommandé");
    racine.dessous("button")[2]?.click();
    assert.deepEqual(faits.splice(0), ["relire"]);
  });
});

describe("la visite tenue", () => {
  test("commencée, elle part de la première étape ; « next » ne va pas au-delà de la dernière ; quittée, elle n'est plus", () => {
    let rendus = 0;
    const visite = tenirLaVisite({ rendre: () => void rendus++ });
    // Relue à chaque fois : une assertion ne la fige pas pour la suite.
    const etat = () => visite.etat;
    assert.deepEqual(etat(), undefined);
    visite.suivante(6);
    assert.deepEqual(etat(), undefined, "pas commencée, rien n'avance");
    visite.commencer();
    assert.deepEqual(etat(), { rang: 0 });
    for (let fois = 0; fois < 9; fois++) visite.suivante(6);
    assert.equal(etat()?.rang, 5);
    visite.quitter();
    assert.deepEqual(etat(), undefined);
    visite.commencer();
    assert.deepEqual(etat(), { rang: 0 }, "rejouée, elle repart de la première étape");
    assert.equal(rendus, 12);
  });
});

// La vue jouée entière.
const CHEMIN = "/home/chef/.config/brigade/app.json";
const MIEN: Projet = { nom: "mine", dossier: "/home/chef/Brigade/mine", depot: "chef/mine", base: "main" };
const demarrage = (projets: Projet[]) => ({
  configuration: pourLaBarre({ chemin: CHEMIN, projets }, () => false),
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
const OUVERT: Ouverture = { state: "open", project: "brigade", repository: DEPOT_DE_LA_VISITE, folder: "/home/chef/Brigade/brigade", cloned: true };

// La cuisine de Brigade telle que le process principal la range (visite.ts) : #30 en cuisson, #31 en pass, #12 servi.
function cuisineLue(enCuisson: boolean): { tableau: Tableau } {
  const A = "2026-11-11T10:04:12.000Z";
  const url = (ticket: number) => `https://github.com/benomite/brigade/issues/${ticket}`;
  const entree = (ticket: number, etat: string) => ({ ticket, etat, titre: `Ticket ${ticket}`, url: url(ticket), activite: null, attente: null });
  const faits: Faits = {
    etat: "ouverte",
    lu: A,
    dernierTick: A,
    compteurs: { rail: 1, auTravail: enCuisson ? 1 : 0, aLaPass: 1, attend: 0, livres24h: 1 },
    dernierEvenement: null,
    rail: [entree(21, "en attente"), ...(enCuisson ? [entree(30, "pris")] : []), entree(31, "en pass"), entree(12, "servi")],
    cooks: [],
    attend: [],
  };
  const tenus = tenirFaits();
  const recue = tenus.recevoir(mettreAPart({ projet: "brigade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] }));
  return "tableau" in recue ? { tableau: recue.tableau } : assert.fail("la cuisine figée ne se range pas");
}

const bulle = (vue: Jouee) => vue.element("visite").dessous("div").find(({ className }) => className === "visite") ?? assert.fail("pas de bulle");
const enTete = (vue: Jouee) => bulle(vue).dessous("h3")[0]?.textContent;
const dit = (vue: Jouee) => bulle(vue).dessous("p").find(({ className }) => className === "dit")?.textContent;
const visible = (vue: Jouee, libelle: string) => vue.poses().find((p) => p.balise === "button" && !p.hidden && p.textContent === libelle);
const bouton = (vue: Jouee, libelle: string) => vue.element("visite").dessous("button").find(({ textContent }) => textContent === libelle) ?? assert.fail(`pas de bouton « ${libelle} » : ${vue.element("visite").dessous("button").map(({ textContent }) => textContent).join(", ")}`);
const lectures = (vue: Jouee) => vue.appels.filter(({ geste }) => geste === "lireLaCuisineVisitee");
const ajouts = (vue: Jouee) => vue.appels.filter(({ geste }) => /ouvrirDUneStation|clone|ajouter/i.test(geste));
const marquee = (vue: Jouee) => vue.poses().filter(({ dataset }) => dataset.visite !== undefined);
const rejouer = (vue: Jouee) => vue.poses().find(({ id }) => id === "entree-visite") ?? assert.fail("pas d'entrée pour rejouer la visite");

// Un premier lancement, connecté à GitHub, la cuisine de Brigade lue comme le pont la rend.
async function premierLancement(lire: () => unknown = () => cuisineLue(true)) {
  const vue = await jouerLaVue({ demarrage: () => demarrage([]), stationsDuChef: () => AUCUNE, compteGitHub: () => ({ login: "newcomer" }), ouvrirDUneStation: () => OUVERT, espace: () => [], lireLaCuisineVisitee: lire as never }, { stockage: new FauxStockage() });
  await repos();
  return vue;
}
async function visiter(vue: Jouee) {
  (visible(vue, VISITER) ?? assert.fail("pas de « visit a real kitchen »")).click();
  await repos();
}

describe("la vue jouée : la visite choisie sur l'écran d'accueil", () => {
  test("rien ne démarre seul ; choisie, la cuisine de benomite/brigade est lue — sans clone ni ajout — et la visite part de sa première étape", async () => {
    const vue = await premierLancement();
    assert.deepEqual(lectures(vue), [], "rien n'est lu avant le choix");
    assert.equal(vue.element("visite").hidden, true);
    await visiter(vue);
    assert.deepEqual(lectures(vue).map(({ args }) => args), [[DEPOT_DE_LA_VISITE]]);
    assert.deepEqual(ajouts(vue), []);
    assert.equal(vue.element("visite").hidden, false);
    assert.equal(enTete(vue), MOT_RAIL);
    // Le rail lu : sa rangée de colonnes, désignée.
    assert.deepEqual(marquee(vue).map(({ className }) => className), ["colonnes"]);
    assert.ok(vue.element("visite").dessous("li").some(({ dataset }) => dataset.ticket === "30"));
  });

  test("chaque étape désigne ce que la cuisine lue montre ; la dernière, le second, puis « add my project » ouvre l'ajout et quitte la visite", async () => {
    const vue = await premierLancement();
    await visiter(vue);
    bouton(vue, SUIVANTE).click();
    await repos();
    assert.equal(dit(vue), COOK_EN_COURS(30));
    assert.deepEqual(marquee(vue).map(({ dataset }) => dataset.ticket), ["30"]);
    bouton(vue, SUIVANTE).click();
    await repos();
    assert.equal(dit(vue), PASS_EN_COURS(31));
    const vues = [enTete(vue)];
    for (let fois = 0; fois < 3; fois++) {
      bouton(vue, SUIVANTE).click();
      await repos();
      vues.push(enTete(vue));
    }
    assert.deepEqual(vues, [MOT_PASS, MOT_SERVED, MOT_TODO, MOT_SECOND]);
    assert.deepEqual(marquee(vue).map(({ balise }) => balise), ["aside"]);
    bouton(vue, AJOUTER_LE_SIEN).click();
    await repos();
    assert.equal(vue.element("visite").hidden, true);
    assert.equal(vue.element("ajout").hidden, false);
    assert.deepEqual(marquee(vue), []);
    assert.deepEqual(ajouts(vue), [], "l'écran d'ajout s'ouvre : rien n'est encore ajouté");
  });

  test("sans cook en cours, l'étape du cook montre le dernier ticket servi", async () => {
    const vue = await premierLancement(() => cuisineLue(false));
    await visiter(vue);
    bouton(vue, SUIVANTE).click();
    await repos();
    assert.equal(dit(vue), COOK_EXEMPLE(12));
    assert.deepEqual(marquee(vue).map(({ dataset }) => dataset.ticket), ["12"]);
  });

  test("quittée d'une étape avancée : « leave the visit » ramène à l'écran d'accueil et ses deux choix", async () => {
    const vue = await premierLancement();
    await visiter(vue);
    for (let fois = 0; fois < 3; fois++) {
      bouton(vue, SUIVANTE).click();
      await repos();
    }
    assert.equal(bulle(vue).dessous("p")[0]?.textContent, RANG(4, 6));
    bouton(vue, QUITTER).click();
    await repos();
    assert.equal(vue.element("visite").hidden, true);
    assert.deepEqual(vue.element("visite").children, []);
    assert.ok(visible(vue, VISITER) && visible(vue, "add my project"));
  });
});

describe("la vue jouée : la lecture de la cuisine", () => {
  test("une lecture qui lève : une ligne, la raison au survol ; « read again » relit, et la cuisine lue se pose", async () => {
    let fois = 0;
    const vue = await premierLancement(() => (++fois === 1 ? Promise.reject(new Error("GitHub could not be reached")) : cuisineLue(true)));
    await visiter(vue);
    const rail = () => vue.element("visite").dessous("section").find(({ className }) => className === "rail-de-la-visite") ?? assert.fail("pas de rail");
    assert.equal(rail().children[0]?.dataset.ligne, "erreur");
    assert.ok(rail().textContent.includes(CUISINE_ILLISIBLE));
    assert.ok([...rail().descendants()].some(({ title, ariaLabel }) => `${title} ${ariaLabel}`.includes("GitHub could not be reached")));
    assert.equal(enTete(vue), MOT_RAIL, "la visite reste là, à sa première étape");
    bouton(vue, RELIRE).click();
    await repos();
    assert.equal(lectures(vue).length, 2);
    assert.ok(rail().dessous("li").some(({ dataset }) => dataset.ticket === "30"));
  });

  test("un pont qui ne rend rien : la lecture le dit, jamais un écran vide", async () => {
    const vue = await premierLancement(() => undefined);
    await visiter(vue);
    const lignes = [...vue.element("visite").descendants()];
    assert.ok(lignes.some(({ title, ariaLabel }) => `${title} ${ariaLabel}`.includes("the app gave no answer")));
  });

  test("seule la dernière lecture demandée se pose : une réponse en retard n'écrase pas la suivante", async () => {
    const reponses: ((lue: unknown) => void)[] = [];
    const vue = await premierLancement(() => new Promise((resoudre) => void reponses.push(resoudre)));
    await visiter(vue);
    bouton(vue, QUITTER).click();
    await repos();
    rejouer(vue).click();
    await repos();
    assert.equal(reponses.length, 2);
    reponses[1]?.(cuisineLue(true));
    await repos();
    reponses[0]?.({ sans: "late and stale" });
    await repos();
    assert.ok(vue.element("visite").dessous("li").some(({ dataset }) => dataset.ticket === "30"), "la lecture en retard ne remplace pas la dernière");
  });
});

describe("la vue jouée : la visite rejouée depuis la barre", () => {
  test("avec un projet à soi : l'entrée « Replay the visit » la rejoue de sa première étape, sans ouvrir ni ajouter de projet", async () => {
    const vue = await jouerLaVue({ demarrage: () => demarrage([MIEN]), espace: () => [], lireLaCuisineVisitee: (() => cuisineLue(true)) as never }, { stockage: new FauxStockage() });
    await repos();
    assert.equal(rejouer(vue).title, REJOUER);
    rejouer(vue).click();
    await repos();
    bouton(vue, SUIVANTE).click();
    await repos();
    bouton(vue, QUITTER).click();
    await repos();
    rejouer(vue).click();
    await repos();
    assert.equal(vue.element("visite").hidden, false);
    assert.equal(enTete(vue), MOT_RAIL);
    assert.equal(vue.element("espace").textContent, "", "aucun projet ne s'ouvre");
    assert.deepEqual(ajouts(vue), []);
  });
});
