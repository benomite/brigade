// La page d'un projet en deux onglets (#1184, #2921) : Rail — ce qui t'attend, le kanban entier, Taken et Pass compris,
// sous le bandeau de santé — et Stations. Un seul est montré au centre ; le second reste à droite,
// le même, quel que soit l'onglet. L'app rouvre un projet sur le dernier onglet que le chef y a ouvert.
// Le menu de la page (#2485) n'a que Rail · Stations · Settings (#2921 : Kitchen et ses sous-onglets ont disparu), et un bloc monté par onglet.
// La vue est jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { mettreAPart } from "../src/attend.ts";
import { pourLaBarre } from "../src/barre.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Dessinable, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import type { Terminal } from "../src/terminaux.ts";
import { FauxStockage, type Faux, type Jouee, jouerLaVue, ouvrirLecture, ouvrirOnglet, repos } from "./aides/fausse-vue.ts";

const A = "2026-10-20T10:04:12.000Z";
const PARADE = "parade";
const FANFARE = "fanfare";
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "fil repris", arrete: false };
const SECOND_DE_FANFARE: Terminal = { id: 7, projet: FANFARE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const PROJETS = [
  { nom: PARADE, dossier: "/tmp/parade" },
  { nom: FANFARE, dossier: "/tmp/fanfare" },
];
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: PROJETS }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

// Un rail où chaque colonne a sa carte : #14 pris, #30 à la pass, #12 qui t'attend, #31 servi, #21 et #22 en attente.
const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-10-20T10:04:11.000Z",
  dernierTick: "2026-10-20T10:04:02.000Z",
  compteurs: { rail: 2, auTravail: 1, aLaPass: 1, attend: 1, livres24h: 1 },
  dernierEvenement: null,
  rail: [
    { ticket: 14, etat: "pris", titre: "Le journal en ajout seul", url: "https://github.com/benomite/brigade/issues/14", activite: { fait: "écrit", cible: "app/src/bon.ts", depuis: "2026-10-20T10:02:11.000Z" } },
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: "https://github.com/benomite/brigade/issues/21", activite: null },
    { ticket: 22, etat: "en attente", titre: "Un ticket libre", url: "https://github.com/benomite/brigade/issues/22", activite: null },
    { ticket: 30, etat: "en pass", titre: "La pass verte", url: "https://github.com/benomite/brigade/issues/30", activite: { fait: "gates en cours", cible: null, depuis: "2026-10-20T10:03:41.000Z" } },
    { ticket: 31, etat: "servi", titre: "Servi hier", url: "https://github.com/benomite/brigade/issues/31", activite: null },
    { ticket: 12, etat: "en pass", titre: "Validation SIRET", url: "https://github.com/benomite/brigade/issues/12", activite: null },
  ],
  cooks: [{ ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" }],
  attend: [{ ticket: 12, titre: "Validation SIRET", url: "https://github.com/benomite/brigade/issues/12" }],
};
const STATUS = [
  "projet     parade",
  "cuisine    ouverte",
  "",
  "attend     1 décision attend le chef depuis 2 j",
  "  #12  depuis 2 j  livraison verte, non mergée",
  "fin attend",
  "",
  "rail       2 en attente · 1 pris · 2 en pass · 1 servi",
  "",
].join("\n");
function dessinable(): Dessinable {
  const tenus = tenirFaits(() => new Map());
  tenus.recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FAITS) }] });
  return tenus.attendre(mettreAPart({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "status", texte: STATUS }] })) ?? assert.fail("rien à redessiner");
}

async function jouer(stockage?: FauxStockage): Promise<Jouee> {
  return jouerLaVue({ demarrage, espace: (projet) => (projet === FANFARE ? [SECOND_DE_FANFARE] : [SECOND]), machines: () => [{ id: "poste", titre: "this computer" }] }, { stockage });
}
// La case de la barre : « T », puis les projets dans l'ordre du fichier.
async function entrer(vue: Jouee, nom: string): Promise<void> {
  (vue.element("projets").children.at(PROJETS.findIndex((projet) => projet.nom === nom) + 1) ?? assert.fail(`pas de case pour ${nom}`)).click();
  await repos();
}
// L'espace de parade, ses faits lus.
async function ouvrir(stockage?: FauxStockage): Promise<Jouee> {
  const vue = await jouer(stockage);
  await entrer(vue, PARADE);
  vue.dire("surFaits", { ...dessinable(), demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}

const onglets = (vue: Jouee) => vue.element("onglets-du-projet").children;
// L'onglet montré : l'entrée du menu marquée.
const montre = (vue: Jouee) => onglets(vue).filter((onglet) => onglet.ariaSelected === "true").map((onglet) => onglet.textContent);
const centre = (vue: Jouee) => vue.element("rail");
const colonnes = (vue: Jouee) => centre(vue).dessous("section").filter((pose) => pose.className === "colonne").map((colonne) => colonne.children[0]?.children[0]?.textContent);
// Les cartes des colonnes montrées, dans leur ordre.
const cartes = (vue: Jouee) =>
  centre(vue)
    .dessous("section")
    .filter((pose) => pose.className === "colonne")
    .flatMap((colonne) => colonne.dessous("li").filter((li) => li.className === "bon").map((bon) => bon.children[0]?.children[0]?.textContent));
const carteDe = (vue: Jouee, numero: number): Faux => centre(vue).dessous("li").find((li) => li.className === "bon" && li.children[0]?.children[0]?.textContent === `#${numero}`) ?? assert.fail(`pas de carte #${numero} sur l'onglet montré`);
const pose = (vue: Jouee, id: string) => vue.poses().some((element) => element.id === id && !element.hidden && centre(vue).contains(element));
// Les blocs du bandeau de santé, une section de Settings (#3014) : les plafonds, le closer, tous les projets.
const blocsDuBandeau = (vue: Jouee) => vue.element("bandeau-sante").dessous("section").map((pose) => pose.dataset.bloc).filter((bloc) => bloc !== undefined);
const blocs = (vue: Jouee) => vue.element("rail").children.map((pose) => pose.dataset.bloc);

describe("deux onglets, Rail et Stations, à côté du nom du projet", () => {
  test("un projet s'ouvre sur Rail ; un clic montre Stations, un autre rend Rail — un seul est montré à la fois", async () => {
    const vue = await ouvrir();

    assert.equal(vue.element("onglets-du-projet").hidden, false);
    assert.deepEqual(onglets(vue).map((onglet) => [onglet.textContent, onglet.role]), [["Rail", "tab"], ["Stations", "tab"], ["Settings", "tab"]]);
    assert.deepEqual(montre(vue), ["Rail"]);
    assert.equal(centre(vue).dataset.onglet, "rail");

    await ouvrirOnglet(vue, "Stations");
    assert.deepEqual(montre(vue), ["Stations"]);
    assert.equal(centre(vue).dataset.onglet, "stations");
    assert.equal(vue.element("contenu").hidden, true);

    await ouvrirOnglet(vue, "Rail");
    assert.deepEqual(montre(vue), ["Rail"]);
    assert.equal(centre(vue).dataset.onglet, "rail");
  });

  test("une page ouverte par-dessus — Settings — se referme quand le chef choisit un onglet", async () => {
    const vue = await ouvrir();
    await ouvrirLecture(vue, "Settings");
    assert.equal(vue.element("contenu").hidden, false);
    // Couvert par la page, seul Settings est marqué montré.
    assert.deepEqual(montre(vue), ["Settings"]);

    await ouvrirOnglet(vue, "Stations");
    assert.equal(vue.element("contenu").hidden, true);
    assert.deepEqual(montre(vue), ["Stations"]);
  });

  test("hors d'un projet, sur « Tous les projets », il n'y a pas d'onglets", async () => {
    const vue = await jouer();
    assert.equal(vue.element("onglets-du-projet").hidden, true);
    assert.deepEqual(onglets(vue), []);
  });
});

describe("ce que chaque onglet montre", () => {
  test("Rail : ce qui t'attend et son geste, le kanban entier, Taken et Pass compris, dans son ordre — ni gates, ni worktrees, ni plafond, ni consommation", async () => {
    const vue = await ouvrir();

    assert.deepEqual(colonnes(vue), ["On the rail", "Taken", "Pass", "Waiting", "Served"]);
    // Le rail dans son ordre (#2093) : #12, qui t'attend, rouge en tête de la colonne de son étape (#3458), avec son geste ;
    // #31, servi, sans geste qui ouvre une page de son worktree (#1846) : l'app n'en ouvre aucune.
    assert.deepEqual(cartes(vue), ["#21", "#22", "#14", "#12", "#30", "#31"]);
    assert.ok(carteDe(vue, 12).dessous("button").length > 0, "ce qui t'attend n'a pas de geste");
    assert.ok(!carteDe(vue, 31).dessous("button").some((bouton) => /browser/.test(bouton.textContent)));
    // Rien d'exécution : ni la carte du projet, ni `station`.
    assert.doesNotMatch(centre(vue).textContent, /cap of cooks|saturée|consommé/);
    for (const id of ["carte", "lu-cuisine", "lecture-cuisine"]) assert.equal(pose(vue, id), false, id);
    // Les stations du projet sont sur Stations ; rien n'est lu de `station` : aucune lecture ne court sur aucun onglet.
    assert.equal(vue.element("stations-du-projet").hidden, true);
    assert.equal(vue.appels.some(({ geste, args }) => geste === "onglet" && args[1] !== undefined), false);
  });
});

describe("le second reste à droite, le même, quel que soit l'onglet", () => {
  test("ce qui est tapé et la réponse en cours passent d'un onglet à l'autre sans rien perdre ni rouvrir", async () => {
    const vue = await ouvrir();
    const [terminal] = vue.xterms;
    const cadre = vue.element("fil").children[0];
    const ouvertures = vue.appels.filter(({ geste }) => geste === "espace").length;
    assert.ok(terminal !== undefined && cadre !== undefined);

    vue.dire("surSortie", SECOND.id, "> combien de cooks ?\r\n");
    terminal.taper("et la pass");
    vue.dire("surSortie", SECOND.id, "Deux cooks tournent, ");
    await ouvrirOnglet(vue, "Stations");
    // La réponse continue d'arriver pendant que Stations est montré ; le chef continue de taper.
    vue.dire("surSortie", SECOND.id, "et la pass a ses gates en cours.");
    terminal.taper(" ?");
    await ouvrirOnglet(vue, "Rail");
    await ouvrirOnglet(vue, "Stations");

    for (const etat of ["Stations", "Rail"]) {
      if (etat === "Rail") await ouvrirOnglet(vue, "Rail");
      assert.equal(vue.element("second").hidden, false, etat);
      assert.deepEqual(vue.xterms, [terminal], etat);
      assert.equal(vue.element("fil").children[0], cadre, etat);
      assert.equal(cadre.hidden, false, etat);
      assert.deepEqual(terminal.ecrits, ["> combien de cooks ?\r\n", "Deux cooks tournent, ", "et la pass a ses gates en cours."], etat);
    }
    assert.deepEqual(
      vue.appels.filter(({ geste }) => geste === "ecrire").map(({ args }) => args),
      [[SECOND.id, "et la pass"], [SECOND.id, " ?"]],
    );
    // Rien n'a été rouvert : l'espace du projet n'a pas été redemandé.
    assert.equal(vue.appels.filter(({ geste }) => geste === "espace").length, ouvertures);
  });
});

describe("l'app rouvre un projet sur le dernier onglet que le chef y a ouvert", () => {
  test("Stations choisi, quitter le projet et y revenir : il s'ouvre sur Stations ; de même pour Rail", async () => {
    const vue = await ouvrir();
    await ouvrirOnglet(vue, "Stations");
    await entrer(vue, FANFARE);
    // Un projet jamais ouvert s'ouvre sur Rail.
    assert.deepEqual(montre(vue), ["Rail"]);
    await entrer(vue, PARADE);
    assert.deepEqual(montre(vue), ["Stations"]);
    assert.equal(centre(vue).dataset.onglet, "stations");

    await ouvrirOnglet(vue, "Rail");
    await entrer(vue, FANFARE);
    await entrer(vue, PARADE);
    assert.deepEqual(montre(vue), ["Rail"]);
  });

  test("l'app fermée puis rouverte, chaque projet reprend son onglet ; un projet jamais ouvert s'ouvre sur Rail", async () => {
    const stockage = new FauxStockage();
    const avant = await ouvrir(stockage);
    await ouvrirOnglet(avant, "Stations");

    const apres = await jouer(stockage);
    await entrer(apres, PARADE);
    assert.deepEqual(montre(apres), ["Stations"]);
    assert.equal(centre(apres).dataset.onglet, "stations");
    await entrer(apres, FANFARE);
    assert.deepEqual(montre(apres), ["Rail"]);

    // Rail rechoisi sur parade : c'est lui que la prochaine ouverture rend.
    await entrer(apres, PARADE);
    await ouvrirOnglet(apres, "Rail");
    const encore = await jouer(stockage);
    await entrer(encore, PARADE);
    assert.deepEqual(montre(encore), ["Rail"]);
  });

  test("un stockage illisible ou absent n'empêche rien : chaque projet s'ouvre sur Rail", async () => {
    const stockage = new FauxStockage();
    stockage.setItem("brigade.onglets-des-projets", "{pas du json");
    const vue = await jouer(stockage);
    await entrer(vue, PARADE);
    assert.deepEqual(montre(vue), ["Rail"]);
    await ouvrirOnglet(vue, "Stations");
    assert.deepEqual(montre(vue), ["Stations"]);

    const sans = await jouer();
    await entrer(sans, PARADE);
    assert.deepEqual(montre(sans), ["Rail"]);
  });
});

describe("le menu de la page d'un projet (#2485, #2921)", () => {
  test("exactement trois entrées, Rail · Stations · Settings ; Rail est ouvert par défaut, sans Kitchen ni sous-onglets", async () => {
    const vue = await ouvrir();

    assert.deepEqual(onglets(vue).map((onglet) => onglet.textContent), ["Rail", "Stations", "Settings"]);
    assert.deepEqual(montre(vue), ["Rail"]);
    assert.equal(vue.element("rail").dataset.onglet, "rail");
    // Plus de Kitchen, donc plus de sous-onglets Health et Cooks.
    assert.equal(vue.poses().some((element) => element.id === "onglets-cuisine"), false);
  });

  test("chaque bloc est monté dans son onglet, le bandeau de santé dans Settings seulement", async () => {
    const vue = await ouvrir();
    // Sur Rail, au-dessus des colonnes, la seule bande des chiffres (#3013) : plus de ligne repliée.
    assert.deepEqual(vue.element("bandeau-sante").children, []);

    await ouvrirOnglet(vue, "Stations");
    // L'onglet des stations, un seul composant (#3195) : toutes les stations et « + station » sont sur l'accueil.
    assert.deepEqual(blocs(vue), ["stations-tab"]);
    // Plus en tête de Stations : les plafonds, le closer et les lignes de tous les projets sont dans Settings (#3014).
    assert.deepEqual(vue.element("bandeau-sante").children, []);

    (onglets(vue).find((onglet) => onglet.textContent === "Settings") ?? assert.fail("pas d'entrée Settings")).click();
    await repos();
    // Leur section de Settings : les plafonds, le closer, puis les lignes « Cost » et « Closer » de tous les projets (#2638).
    assert.equal(vue.element("etat").hidden, false);
    assert.deepEqual(blocsDuBandeau(vue), ["plafonds-duree", "closer", "chiffres-autonomie", "de-tous-les-projets"]);

    await ouvrirOnglet(vue, "Rail");
    assert.equal(vue.element("etat").hidden, true);
    assert.deepEqual(vue.element("bandeau-sante").children, []);
  });

  test("l'onglet retenu est celui du projet ; un ancien « cooks » ou « sante » stocké ouvre Rail", async () => {
    const vue = await ouvrir();
    await ouvrirOnglet(vue, "Stations");
    await entrer(vue, FANFARE);
    assert.deepEqual(montre(vue), ["Rail"]);
    await entrer(vue, PARADE);
    assert.deepEqual(montre(vue), ["Stations"]);

    for (const ancien of ["cooks", "sante"]) {
      const stockage = new FauxStockage();
      stockage.setItem("brigade.onglets-des-projets", JSON.stringify({ [PARADE]: ancien }));
      const rouverte = await ouvrir(stockage);
      assert.deepEqual(montre(rouverte), ["Rail"], ancien);
      assert.equal(rouverte.element("rail").dataset.onglet, "rail", ancien);
    }
  });

  test("Settings s'ouvre par-dessus, depuis le même menu, et garde son contenu", async () => {
    const vue = await ouvrir();
    (onglets(vue).find((onglet) => onglet.textContent === "Settings") ?? assert.fail("pas d'entrée Settings")).click();
    await repos();
    assert.deepEqual(montre(vue), ["Settings"]);
    assert.equal(vue.element("etat").hidden, false);
  });
});
