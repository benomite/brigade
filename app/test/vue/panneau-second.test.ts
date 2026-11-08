// Le panneau du second (#2923, épique #2913) : à droite de l'espace, ouvert par défaut ; un bouton le replie et le déplie ;
// son bord gauche se tire — jamais sous 280 px, jamais au point de laisser moins de 640 px au rail. Sa largeur et son état
// replié sont retenus par projet, dans le stockage de la vue, et reposés à l'ouverture suivante de l'app. Le module est joué
// seul, puis la vue entière devant le faux pont (aides/fausse-vue.ts), l'app fermée puis rouverte sur le même stockage.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import type { Terminal } from "../../src/terminaux.ts";
import {
  borner,
  CLE_DES_PANNEAUX,
  LARGEUR_MINIMALE,
  LARGEUR_PAR_DEFAUT,
  lireLesPanneaux,
  monterLePanneau,
  panneauDe,
  RESTE_AU_RAIL,
  retenirLePanneau,
} from "../../src/vue/projet/panneau-second/panneau-second.js";
import { Faux, FauxEcran, FauxStockage, type Jouee, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise), createElementNS: (_espace: string, balise: string) => new Faux(balise) };

// Un stockage qui lève à chaque lecture et écriture : un stockage refusé.
const REFUSE = {
  getItem: (): string | null => {
    throw new Error("refusé");
  },
  setItem: (): void => {
    throw new Error("refusé");
  },
};

// Tirer le bord, comme la souris : appuyé à `de`, glissé jusqu'à `a`, lâché là.
function tirer(bord: Faux, de: number, a: number): void {
  bord.declencher("pointerdown", { clientX: de, pointerId: 1 } as object);
  bord.declencher("pointermove", { clientX: (de + a) / 2, pointerId: 1 } as object);
  bord.declencher("pointerup", { clientX: a, pointerId: 1 } as object);
}

describe("les bornes de la largeur", () => {
  test("jamais sous 280 px", () => {
    assert.equal(LARGEUR_MINIMALE, 280);
    assert.equal(borner(100, 1600), 280);
    assert.equal(borner(279, undefined), 280);
    assert.equal(borner(280, 1600), 280);
  });

  test("jamais assez large pour laisser moins de 640 px au rail", () => {
    assert.equal(RESTE_AU_RAIL, 640);
    assert.equal(borner(2000, 1600), 960);
    assert.equal(borner(961, 1600), 960);
    assert.equal(borner(500, 1600), 500);
    // Sans place connue, seule la borne basse vaut.
    assert.equal(borner(2000, undefined), 2000);
  });

  test("une fenêtre trop étroite pour les deux bornes garde les 280 px du panneau", () => {
    assert.equal(borner(400, 800), 280);
  });
});

describe("la largeur et l'état replié, retenus par projet", () => {
  test("un projet jamais ouvert : ouvert, à la largeur par défaut", () => {
    const retenus = lireLesPanneaux(new FauxStockage());
    assert.deepEqual(panneauDe(retenus, "parade"), { largeur: LARGEUR_PAR_DEFAUT, replie: false });
  });

  test("écrits d'une même entrée, relus au lancement suivant, chaque projet le sien", () => {
    const stockage = new FauxStockage();
    const retenus = lireLesPanneaux(stockage);
    assert.equal(retenirLePanneau(stockage, retenus, "parade", { largeur: 512, replie: true }), true);
    assert.equal(retenirLePanneau(stockage, retenus, "fanfare", { largeur: 300, replie: false }), true);
    assert.deepEqual(JSON.parse(stockage.getItem(CLE_DES_PANNEAUX) ?? "null"), { parade: { largeur: 512, replie: true }, fanfare: { largeur: 300, replie: false } });

    const relus = lireLesPanneaux(stockage);
    assert.deepEqual(panneauDe(relus, "parade"), { largeur: 512, replie: true });
    assert.deepEqual(panneauDe(relus, "fanfare"), { largeur: 300, replie: false });
    assert.deepEqual(panneauDe(relus, "cantine"), { largeur: LARGEUR_PAR_DEFAUT, replie: false });
  });

  test("une entrée mal formée ne vaut que pour son projet", () => {
    const stockage = new FauxStockage();
    stockage.setItem(CLE_DES_PANNEAUX, JSON.stringify({ parade: { largeur: "large", replie: "oui" }, fanfare: { largeur: 40, replie: true }, cantine: 3 }));
    const retenus = lireLesPanneaux(stockage);
    assert.equal(retenus.lisible, true);
    assert.deepEqual(panneauDe(retenus, "parade"), { largeur: LARGEUR_PAR_DEFAUT, replie: false });
    assert.deepEqual(panneauDe(retenus, "fanfare"), { largeur: 280, replie: true });
    assert.deepEqual(panneauDe(retenus, "cantine"), { largeur: LARGEUR_PAR_DEFAUT, replie: false });
  });

  test("illisible, le stockage n'est pas écrasé : le panneau se retient le temps de la session", () => {
    for (const brut of ["{pas du json", "[1, 2]", "null", "7"]) {
      const stockage = new FauxStockage();
      stockage.setItem(CLE_DES_PANNEAUX, brut);
      const retenus = lireLesPanneaux(stockage);
      assert.equal(retenus.lisible, false, brut);
      assert.deepEqual(panneauDe(retenus, "parade"), { largeur: LARGEUR_PAR_DEFAUT, replie: false });
      assert.equal(retenirLePanneau(stockage, retenus, "parade", { largeur: 420, replie: true }), false);
      assert.equal(stockage.getItem(CLE_DES_PANNEAUX), brut);
      assert.deepEqual(panneauDe(retenus, "parade"), { largeur: 420, replie: true });
    }
  });

  test("un stockage qui refuse, ou aucun : rien ne tombe, le panneau se retient le temps de la session", () => {
    const refuse = lireLesPanneaux(REFUSE);
    assert.equal(refuse.lisible, false);
    assert.equal(retenirLePanneau(REFUSE, refuse, "parade", { largeur: 420, replie: false }), false);
    assert.deepEqual(panneauDe(refuse, "parade"), { largeur: 420, replie: false });

    const sans = lireLesPanneaux(undefined);
    assert.equal(retenirLePanneau(undefined, sans, "parade", { largeur: 420, replie: true }), false);
    assert.deepEqual(panneauDe(sans, "parade"), { largeur: 420, replie: true });

    // Lisible, mais l'écriture lève : la session le garde quand même.
    const plein = new FauxStockage();
    const retenus = lireLesPanneaux(plein);
    plein.setItem = () => {
      throw new Error("plein");
    };
    assert.equal(retenirLePanneau(plein, retenus, "parade", { largeur: 300, replie: false }), false);
    assert.deepEqual(panneauDe(retenus, "parade"), { largeur: 300, replie: false });
  });
});

describe("le bord et le bouton, montés sur la colonne", () => {
  function monter(stockage: FauxStockage, disponible: number | undefined) {
    const colonne = new Faux("aside");
    const tete = new Faux("header");
    colonne.append(tete);
    const panneau = monterLePanneau({ document: doc as never, colonne: colonne as never, tete: tete as never, stockage, disponible: () => disponible });
    const bord = colonne.children[0] ?? assert.fail("pas de bord");
    const replier = tete.children.at(-1) ?? assert.fail("pas de bouton");
    return { colonne, panneau, bord, replier, largeur: () => colonne.style.getPropertyValue("--largeur-du-second") };
  }

  test("tiré au-delà des bornes, il s'arrête à 280 px et à ce qui laisse 640 px au rail ; la largeur est retenue au lâcher", () => {
    const stockage = new FauxStockage();
    const { panneau, bord, largeur } = monter(stockage, 1600);
    panneau.poser("parade", true);
    assert.equal(largeur(), "360px");
    tirer(bord, 1240, 200);
    assert.equal(largeur(), "960px");
    assert.deepEqual(panneauDe(lireLesPanneaux(stockage), "parade"), { largeur: 960, replie: false });
    tirer(bord, 640, 1500);
    assert.equal(largeur(), "280px");
    assert.deepEqual(panneauDe(lireLesPanneaux(stockage), "parade"), { largeur: 280, replie: false });
    // Au clavier, le bord tiré d'un pas, borné de même.
    bord.declencher("keydown", { key: "ArrowRight" });
    assert.equal(largeur(), "280px");
    bord.declencher("keydown", { key: "ArrowLeft" });
    assert.equal(largeur(), "296px");
  });

  test("un clic replie, un clic déplie ; écran étroit : ni bord ni bouton", () => {
    const stockage = new FauxStockage();
    const { colonne, panneau, bord, replier } = monter(stockage, 1600);
    panneau.poser("parade", true);
    assert.equal(colonne.hasAttribute("data-replie"), false);
    assert.equal(replier.ariaExpanded, "true");
    assert.equal(replier.ariaLabel, "Fold the second's panel");
    replier.click();
    assert.equal(colonne.hasAttribute("data-replie"), true);
    assert.equal(replier.ariaExpanded, "false");
    assert.equal(replier.ariaLabel, "Unfold the second's panel");
    assert.equal(bord.hidden, true);
    assert.deepEqual(panneauDe(lireLesPanneaux(stockage), "parade").replie, true);
    replier.click();
    assert.equal(colonne.hasAttribute("data-replie"), false);
    assert.equal(bord.hidden, false);
    assert.deepEqual(panneauDe(lireLesPanneaux(stockage), "parade").replie, false);

    replier.click();
    panneau.poser("parade", false);
    assert.equal(colonne.hasAttribute("data-replie"), false);
    assert.equal(bord.hidden, true);
    assert.equal(replier.hidden, true);
    assert.equal(colonne.style.getPropertyValue("--largeur-du-second"), "");
  });

  test("une fenêtre rétrécie reborne la largeur montrée, sans réécrire la retenue", () => {
    const stockage = new FauxStockage();
    let disponible = 1600;
    const colonne = new Faux("aside");
    const tete = new Faux("header");
    const panneau = monterLePanneau({ document: doc as never, colonne: colonne as never, tete: tete as never, stockage, disponible: () => disponible });
    const bord = colonne.children[0] ?? assert.fail("pas de bord");
    panneau.poser("parade", true);
    tirer(bord, 1240, 640);
    assert.equal(colonne.style.getPropertyValue("--largeur-du-second"), "960px");
    disponible = 1100;
    panneau.reborner();
    assert.equal(colonne.style.getPropertyValue("--largeur-du-second"), "460px");
    assert.equal(panneauDe(lireLesPanneaux(stockage), "parade").largeur, 960);
  });
});

describe("dans la vue : l'app fermée puis rouverte", () => {
  const PROJETS = [
    { nom: "parade", dossier: "/tmp/parade" },
    { nom: "fanfare", dossier: "/tmp/fanfare" },
  ];
  const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "fil repris", arrete: false };
  const AUTRE: Terminal = { id: 7, projet: "fanfare", genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
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
  // La place de l'espace : le rail (main) et le panneau, 1600 px à eux deux.
  async function jouer(stockage: FauxStockage, ecran?: FauxEcran): Promise<Jouee> {
    const vue = await jouerLaVue({ demarrage, espace: (projet) => (projet === "fanfare" ? [AUTRE] : [SECOND]) }, { stockage, ...(ecran === undefined ? {} : { ecran }) });
    Object.assign(vue.element("main"), { getBoundingClientRect: () => ({ width: 1240 }) });
    Object.assign(vue.element("second"), { getBoundingClientRect: () => ({ width: 360 }) });
    return vue;
  }
  async function entrer(vue: Jouee, nom: string): Promise<void> {
    (vue.element("projets").children.at(PROJETS.findIndex((projet) => projet.nom === nom) + 1) ?? assert.fail(`pas de case pour ${nom}`)).click();
    await repos();
  }
  const largeur = (vue: Jouee) => vue.element("second").style.getPropertyValue("--largeur-du-second");
  const replie = (vue: Jouee) => vue.element("second").hasAttribute("data-replie");

  test("à la première ouverture d'un projet, le panneau est à droite, ouvert, avec son bord et son bouton", async () => {
    const vue = await jouer(new FauxStockage());
    await entrer(vue, "parade");
    assert.equal(vue.element("second").hidden, false);
    assert.equal(replie(vue), false);
    assert.equal(largeur(vue), "360px");
    assert.equal(vue.element("bord-du-second").hidden, false);
    assert.equal(vue.element("replier-second").parentElement, vue.element("tete-du-second"));
    assert.equal(vue.element("replier-second").ariaExpanded, "true");
  });

  test("la largeur tirée et l'état replié reviennent au lancement suivant, chaque projet les siens ; tirée trop loin, bornée", async () => {
    const stockage = new FauxStockage();
    const avant = await jouer(stockage);
    await entrer(avant, "parade");
    tirer(avant.element("bord-du-second"), 1240, 100);
    assert.equal(largeur(avant), "960px");
    await entrer(avant, "fanfare");
    assert.equal(largeur(avant), "360px");
    tirer(avant.element("bord-du-second"), 1240, 1500);
    assert.equal(largeur(avant), "280px");
    avant.element("replier-second").click();
    await repos();
    assert.equal(replie(avant), true);

    const apres = await jouer(stockage);
    await entrer(apres, "parade");
    assert.equal(largeur(apres), "960px");
    assert.equal(replie(apres), false);
    await entrer(apres, "fanfare");
    assert.equal(replie(apres), true);
    assert.equal(apres.element("replier-second").ariaLabel, "Unfold the second's panel");
    apres.element("replier-second").click();
    await repos();
    assert.equal(replie(apres), false);
    assert.equal(largeur(apres), "280px");

    const encore = await jouer(stockage);
    await entrer(encore, "fanfare");
    assert.equal(replie(encore), false);
  });

  test("sur un écran étroit, le panneau est un onglet : son état replié ne le cache pas", async () => {
    const stockage = new FauxStockage();
    stockage.setItem(CLE_DES_PANNEAUX, JSON.stringify({ parade: { largeur: 500, replie: true } }));
    const vue = await jouer(stockage, new FauxEcran(true));
    await entrer(vue, "parade");
    assert.equal(replie(vue), false);
    assert.equal(vue.element("replier-second").hidden, true);
    assert.equal(vue.element("bord-du-second").hidden, true);
  });
});
