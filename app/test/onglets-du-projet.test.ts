// La page d'un projet en deux onglets (#1184) : Rail — ce qui t'attend, le kanban entier, Taken et Pass compris — et
// Cooks — ce qui tourne : la carte du projet et ses cooks, les stations, la
// lecture de `station` (plafond, saturation, consommation). Un seul est montré au centre ; le second reste à droite,
// le même, quel que soit l'onglet. L'app rouvre un projet sur le dernier onglet que le chef y a ouvert.
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
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
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
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
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
  "  #12  depuis 2 j  livraison verte, non mergée faute de grant `merge`",
  "fin attend",
  "",
  "rail       2 en attente · 1 pris · 2 en pass · 1 servi",
  "",
].join("\n");
// Ce que `station` rend : le plafond de cooks, la machine et sa saturation, le quota consommé.
const STATION = "cooks      1 running — box: 3 at most — 8 cores\nmachine    saturée · charge 7.9\nquota      62 % consommé\n";

function dessinable(): Dessinable {
  const tenus = tenirFaits(() => new Map());
  tenus.recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FAITS) }] });
  return tenus.attendre(mettreAPart({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "status", texte: STATUS }] })) ?? assert.fail("rien à redessiner");
}

async function jouer(stockage?: FauxStockage): Promise<Jouee> {
  return jouerLaVue({ demarrage, espace: (projet) => (projet === FANFARE ? [SECOND_DE_FANFARE] : [SECOND]), machines: () => [{ id: "poste", titre: "this Mac" }] }, { stockage });
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
// Ce que `station` a rendu sur l'onglet Cooks.
function lireStation(vue: Jouee): void {
  const [projet, demande, numero] = vue.dernier("onglet") as [string, string, number];
  assert.deepEqual([projet, demande], [PARADE, "cooks"]);
  vue.dire("surContenu", { projet: PARADE, demande: numero, a: A, sorties: [{ commande: "station", texte: STATION }] }, undefined, undefined);
}

describe("deux onglets, Rail et Cooks, à côté du nom du projet", () => {
  test("un projet s'ouvre sur Rail ; un clic montre Cooks, un autre rend Rail — un seul est montré à la fois", async () => {
    const vue = await ouvrir();

    assert.equal(vue.element("onglets-du-projet").hidden, false);
    assert.deepEqual(onglets(vue).map((onglet) => [onglet.textContent, onglet.role]), [["Rail", "tab"], ["Cooks", "tab"]]);
    assert.deepEqual(montre(vue), ["Rail"]);
    assert.equal(centre(vue).dataset.onglet, "rail");

    await ouvrirOnglet(vue, "Cooks");
    assert.deepEqual(montre(vue), ["Cooks"]);
    assert.equal(centre(vue).dataset.onglet, "cooks");
    assert.equal(vue.element("contenu").hidden, true);

    await ouvrirOnglet(vue, "Rail");
    assert.deepEqual(montre(vue), ["Rail"]);
    assert.equal(centre(vue).dataset.onglet, "rail");
  });

  test("une page ouverte par-dessus — Settings — se referme quand le chef choisit un onglet", async () => {
    const vue = await ouvrir();
    await ouvrirLecture(vue, "Grants");
    assert.equal(vue.element("contenu").hidden, false);
    // Couvert par la page, aucun onglet n'est marqué montré.
    assert.deepEqual(montre(vue), []);

    await ouvrirOnglet(vue, "Cooks");
    assert.equal(vue.element("contenu").hidden, true);
    assert.deepEqual(montre(vue), ["Cooks"]);
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

    assert.deepEqual(colonnes(vue), ["On the rail", "Taken", "Pass", "TODO", "WAITING", "Served"]);
    // Le rail dans son ordre ; #12, qui t'attend, avec son geste ; #31, servi, sans geste qui ouvre une page de son
    // worktree (#1846) : l'app n'en ouvre aucune.
    assert.deepEqual(cartes(vue), ["#21", "#22", "#14", "#30", "#12", "#31"]);
    assert.ok(carteDe(vue, 12).dessous("button").length > 0, "ce qui t'attend n'a pas de geste");
    assert.ok(!carteDe(vue, 31).dessous("button").some((bouton) => /browser/.test(bouton.textContent)));
    // Rien d'exécution : ni la carte du projet, ni `station`.
    assert.doesNotMatch(centre(vue).textContent, /cap of cooks|saturée|consommé/);
    for (const id of ["carte", "lu-cuisine", "lecture-cuisine"]) assert.equal(pose(vue, id), false, id);
    // Les stations du projet, quand il cuit quelque part, sont sur Cooks.
    assert.equal(vue.element("stations-du-projet").hidden, true);
    // Et rien n'est lu de `station` tant que Rail est montré.
    assert.notDeepEqual(vue.appels.findLast(({ geste }) => geste === "onglet")?.args.slice(0, 2), [PARADE, "cooks"]);
  });

  test("Cooks : le projet et ses cooks en cours, aucune colonne du kanban, aucune page servie, les stations, le plafond, la saturation, la consommation", async () => {
    const vue = await ouvrir();
    await ouvrirOnglet(vue, "Cooks");
    lireStation(vue);

    // Aucune colonne du kanban : Taken et Pass sont sur Rail.
    assert.deepEqual(colonnes(vue), []);
    // Un runtime qui ne donne pas ses stations : la carte du projet en tête, entière — son état, ses compteurs, son
    // cook en cours et sa station (#1456 : avec des stations, elle est fondue dans leur bloc).
    assert.equal(pose(vue, "carte"), true);
    assert.match(vue.element("carte").textContent, /box\/claude/);
    // Aucune carte de colonne, et aucune page de worktree à ouvrir (#1846).
    assert.deepEqual(cartes(vue), []);
    assert.ok(!centre(vue).dessous("button").some((bouton) => /browser/.test(bouton.textContent)));
    assert.doesNotMatch(centre(vue).textContent, /port \d/);
    // La lecture de `station`, en bas, repliée derrière sa ligne et fermée (#1456) : aucun bloc de sortie brute, et plus
    // le bouton qui écrivait le plafond de cooks dans le second — il se règle sur la ligne de sa station.
    assert.equal(pose(vue, "lecture-cuisine"), true);
    const lecture = centre(vue).children.at(-1) ?? assert.fail("rien en bas de Cooks");
    assert.deepEqual([lecture.balise, lecture.className, (lecture as Faux & { open?: boolean }).open], ["details", "replie lecture-de-la-cuisine", false]);
    assert.ok(lecture.contains(vue.element("lecture-cuisine")));
    assert.deepEqual(vue.element("lecture-cuisine").dessous("pre"), []);
    assert.deepEqual(vue.element("lecture-cuisine").dessous("details"), []);
    assert.doesNotMatch(centre(vue).textContent, /Set the cooks of a station/);
    // Les stations du projet.
    assert.equal(vue.element("stations-du-projet").hidden, false);
    assert.doesNotMatch(centre(vue).textContent, /\bTaken\b|\bPass\b|TODO|WAITING|On the rail|Served/);
  });

  test("la lecture de `station` ne court que tant que Cooks est montré : Rail l'arrête", async () => {
    const vue = await ouvrir();
    await ouvrirOnglet(vue, "Cooks");
    assert.deepEqual(vue.dernier("onglet").slice(0, 2), [PARADE, "cooks"]);
    await ouvrirOnglet(vue, "Rail");
    assert.equal(vue.dernier("onglet")[1], undefined);
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
    await ouvrirOnglet(vue, "Cooks");
    // La réponse continue d'arriver pendant que Cooks est montré ; le chef continue de taper.
    vue.dire("surSortie", SECOND.id, "et la pass a ses gates en cours.");
    terminal.taper(" ?");
    await ouvrirOnglet(vue, "Rail");
    await ouvrirOnglet(vue, "Cooks");

    for (const etat of ["Cooks", "Rail"]) {
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
  test("Cooks choisi, quitter le projet et y revenir : il s'ouvre sur Cooks ; de même pour Rail", async () => {
    const vue = await ouvrir();
    await ouvrirOnglet(vue, "Cooks");
    await entrer(vue, FANFARE);
    // Un projet jamais ouvert s'ouvre sur Rail.
    assert.deepEqual(montre(vue), ["Rail"]);
    await entrer(vue, PARADE);
    assert.deepEqual(montre(vue), ["Cooks"]);
    assert.equal(centre(vue).dataset.onglet, "cooks");

    await ouvrirOnglet(vue, "Rail");
    await entrer(vue, FANFARE);
    await entrer(vue, PARADE);
    assert.deepEqual(montre(vue), ["Rail"]);
  });

  test("l'app fermée puis rouverte, chaque projet reprend son onglet ; un projet jamais ouvert s'ouvre sur Rail", async () => {
    const stockage = new FauxStockage();
    const avant = await ouvrir(stockage);
    await ouvrirOnglet(avant, "Cooks");

    const apres = await jouer(stockage);
    await entrer(apres, PARADE);
    assert.deepEqual(montre(apres), ["Cooks"]);
    assert.equal(centre(apres).dataset.onglet, "cooks");
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
    await ouvrirOnglet(vue, "Cooks");
    assert.deepEqual(montre(vue), ["Cooks"]);

    const sans = await jouer();
    await entrer(sans, PARADE);
    assert.deepEqual(montre(sans), ["Rail"]);
  });
});
