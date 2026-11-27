// Le panneau du second (#2923, épique #2913) : à droite de l'espace, ouvert par défaut ; un bouton le replie et le déplie ;
// son bord gauche se tire — jamais sous 280 px, jamais au point de laisser moins de 640 px au rail. Sa largeur et son état
// replié sont retenus par projet, dans le stockage de la vue, et reposés à l'ouverture suivante de l'app. Le module est joué
// seul, puis la vue entière devant le faux pont (helpers/false-vue.ts), l'app fermée puis rouverte sur le même stockage.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { BANNER } from "../../src/facts.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import type { Terminal } from "../../src/terminals.ts";
import {
  bound,
  KEY_OF_PANELS,
  WIDTH_MINIMAL,
  WIDTH_BY_DEFAULT,
  readThePanels,
  mountThePanel,
  panelOf,
  REMAINS_AT_RAIL,
  holdThePanel,
} from "../../src/vue/project/panel-second/panel-second.js";
import { Fake, FakeScreen, FakeStorage, type Played, playTheVue, repos } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise), createElementNS: (_space: string, balise: string) => new Fake(balise) };

// Un stockage qui lève à chaque lecture et écriture : un stockage refusé.
const REFUSES = {
  getItem: (): string | null => {
    throw new Error("refusé");
  },
  setItem: (): void => {
    throw new Error("refusé");
  },
};

// Tirer le bord, comme la souris : appuyé à `de`, glissé jusqu'à `a`, lâché là.
function pull(edge: Fake, of: number, a: number): void {
  edge.declencher("pointerdown", { clientX: of, pointerId: 1 } as object);
  edge.declencher("pointermove", { clientX: (of + a) / 2, pointerId: 1 } as object);
  edge.declencher("pointerup", { clientX: a, pointerId: 1 } as object);
}

describe("les bornes de la largeur", () => {
  test("jamais sous 280 px", () => {
    assert.equal(WIDTH_MINIMAL, 280);
    assert.equal(bound(100, 1600), 280);
    assert.equal(bound(279, undefined), 280);
    assert.equal(bound(280, 1600), 280);
  });

  test("jamais assez large pour laisser moins de 640 px au rail", () => {
    assert.equal(REMAINS_AT_RAIL, 640);
    assert.equal(bound(2000, 1600), 960);
    assert.equal(bound(961, 1600), 960);
    assert.equal(bound(500, 1600), 500);
    // Sans place connue, seule la borne basse vaut.
    assert.equal(bound(2000, undefined), 2000);
  });

  test("une fenêtre trop étroite pour les deux bornes garde les 280 px du panneau", () => {
    assert.equal(bound(400, 800), 280);
  });
});

describe("la largeur et l'état replié, retenus par projet", () => {
  test("un projet jamais ouvert : ouvert, à la largeur par défaut", () => {
    const retainedOnes = readThePanels(new FakeStorage());
    assert.deepEqual(panelOf(retainedOnes, "parade"), { largeur: WIDTH_BY_DEFAULT, replie: false });
  });

  test("écrits d'une même entrée, relus au lancement suivant, chaque projet le sien", () => {
    const storage = new FakeStorage();
    const retainedOnes = readThePanels(storage);
    assert.equal(holdThePanel(storage, retainedOnes, "parade", { largeur: 512, replie: true }), true);
    assert.equal(holdThePanel(storage, retainedOnes, "fanfare", { largeur: 300, replie: false }), true);
    assert.deepEqual(JSON.parse(storage.getItem(KEY_OF_PANELS) ?? "null"), { parade: { largeur: 512, replie: true }, fanfare: { largeur: 300, replie: false } });

    const rereadOnes = readThePanels(storage);
    assert.deepEqual(panelOf(rereadOnes, "parade"), { largeur: 512, replie: true });
    assert.deepEqual(panelOf(rereadOnes, "fanfare"), { largeur: 300, replie: false });
    assert.deepEqual(panelOf(rereadOnes, "cantine"), { largeur: WIDTH_BY_DEFAULT, replie: false });
  });

  test("une entrée mal formée ne vaut que pour son projet", () => {
    const storage = new FakeStorage();
    storage.setItem(KEY_OF_PANELS, JSON.stringify({ parade: { largeur: "large", replie: "oui" }, fanfare: { largeur: 40, replie: true }, cantine: 3 }));
    const retainedOnes = readThePanels(storage);
    assert.equal(retainedOnes.lisible, true);
    assert.deepEqual(panelOf(retainedOnes, "parade"), { largeur: WIDTH_BY_DEFAULT, replie: false });
    assert.deepEqual(panelOf(retainedOnes, "fanfare"), { largeur: 280, replie: true });
    assert.deepEqual(panelOf(retainedOnes, "cantine"), { largeur: WIDTH_BY_DEFAULT, replie: false });
  });

  test("illisible, le stockage n'est pas écrasé : le panneau se retient le temps de la session", () => {
    for (const raw of ["{pas du json", "[1, 2]", "null", "7"]) {
      const storage = new FakeStorage();
      storage.setItem(KEY_OF_PANELS, raw);
      const retainedOnes = readThePanels(storage);
      assert.equal(retainedOnes.lisible, false, raw);
      assert.deepEqual(panelOf(retainedOnes, "parade"), { largeur: WIDTH_BY_DEFAULT, replie: false });
      assert.equal(holdThePanel(storage, retainedOnes, "parade", { largeur: 420, replie: true }), false);
      assert.equal(storage.getItem(KEY_OF_PANELS), raw);
      assert.deepEqual(panelOf(retainedOnes, "parade"), { largeur: 420, replie: true });
    }
  });

  test("un stockage qui refuse, ou aucun : rien ne tombe, le panneau se retient le temps de la session", () => {
    const refuses = readThePanels(REFUSES);
    assert.equal(refuses.lisible, false);
    assert.equal(holdThePanel(REFUSES, refuses, "parade", { largeur: 420, replie: false }), false);
    assert.deepEqual(panelOf(refuses, "parade"), { largeur: 420, replie: false });

    const without = readThePanels(undefined);
    assert.equal(holdThePanel(undefined, without, "parade", { largeur: 420, replie: true }), false);
    assert.deepEqual(panelOf(without, "parade"), { largeur: 420, replie: true });

    // Lisible, mais l'écriture lève : la session le garde quand même.
    const full = new FakeStorage();
    const retainedOnes = readThePanels(full);
    full.setItem = () => {
      throw new Error("plein");
    };
    assert.equal(holdThePanel(full, retainedOnes, "parade", { largeur: 300, replie: false }), false);
    assert.deepEqual(panelOf(retainedOnes, "parade"), { largeur: 300, replie: false });
  });
});

describe("le bord et le bouton, montés sur la colonne", () => {
  function mount(storage: FakeStorage, available: number | undefined) {
    const column = new Fake("aside");
    const head = new Fake("header");
    column.append(head);
    const panel = mountThePanel({ document: doc as never, colonne: column as never, tete: head as never, stockage: storage, disponible: () => available });
    const edge = column.children[0] ?? assert.fail("pas de bord");
    const fold = head.children.at(-1) ?? assert.fail("pas de bouton");
    return { colonne: column, panneau: panel, bord: edge, replier: fold, largeur: () => column.style.getPropertyValue("--largeur-du-second") };
  }

  test("tiré au-delà des bornes, il s'arrête à 280 px et à ce qui laisse 640 px au rail ; la largeur est retenue au lâcher", () => {
    const storage = new FakeStorage();
    const { panneau: panel, bord: edge, largeur: width } = mount(storage, 1600);
    panel.poser("parade", true);
    assert.equal(width(), "360px");
    pull(edge, 1240, 200);
    assert.equal(width(), "960px");
    assert.deepEqual(panelOf(readThePanels(storage), "parade"), { largeur: 960, replie: false });
    pull(edge, 640, 1500);
    assert.equal(width(), "280px");
    assert.deepEqual(panelOf(readThePanels(storage), "parade"), { largeur: 280, replie: false });
    // Au clavier, le bord tiré d'un pas, borné de même.
    edge.declencher("keydown", { key: "ArrowRight" });
    assert.equal(width(), "280px");
    edge.declencher("keydown", { key: "ArrowLeft" });
    assert.equal(width(), "296px");
  });

  test("un clic replie, un clic déplie ; écran étroit : ni bord ni bouton", () => {
    const storage = new FakeStorage();
    const { colonne: column, panneau: panel, bord: edge, replier: fold } = mount(storage, 1600);
    panel.poser("parade", true);
    assert.equal(column.hasAttribute("data-replie"), false);
    assert.equal(fold.ariaExpanded, "true");
    assert.equal(fold.ariaLabel, "Fold the second's panel");
    fold.click();
    assert.equal(column.hasAttribute("data-replie"), true);
    assert.equal(fold.ariaExpanded, "false");
    assert.equal(fold.ariaLabel, "Unfold the second's panel");
    assert.equal(edge.hidden, true);
    assert.deepEqual(panelOf(readThePanels(storage), "parade").replie, true);
    fold.click();
    assert.equal(column.hasAttribute("data-replie"), false);
    assert.equal(edge.hidden, false);
    assert.deepEqual(panelOf(readThePanels(storage), "parade").replie, false);

    fold.click();
    panel.poser("parade", false);
    assert.equal(column.hasAttribute("data-replie"), false);
    assert.equal(edge.hidden, true);
    assert.equal(fold.hidden, true);
    assert.equal(column.style.getPropertyValue("--largeur-du-second"), "");
  });

  test("une fenêtre rétrécie reborne la largeur montrée, sans réécrire la retenue", () => {
    const storage = new FakeStorage();
    let available = 1600;
    const column = new Fake("aside");
    const head = new Fake("header");
    const panel = mountThePanel({ document: doc as never, colonne: column as never, tete: head as never, stockage: storage, disponible: () => available });
    const edge = column.children[0] ?? assert.fail("pas de bord");
    panel.poser("parade", true);
    pull(edge, 1240, 640);
    assert.equal(column.style.getPropertyValue("--largeur-du-second"), "960px");
    available = 1100;
    panel.reborner();
    assert.equal(column.style.getPropertyValue("--largeur-du-second"), "460px");
    assert.equal(panelOf(readThePanels(storage), "parade").largeur, 960);
  });
});

describe("dans la vue : l'app fermée puis rouverte", () => {
  const PROJECTS = [
    { nom: "parade", dossier: "/tmp/parade" },
    { nom: "fanfare", dossier: "/tmp/fanfare" },
  ];
  const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "fil repris", arrete: false };
  const OTHER: Terminal = { id: 7, projet: "fanfare", genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
  const startup = () => ({
    configuration: forTheBar({ chemin: "/tmp/app.json", projets: PROJECTS }, () => true),
    palette: PALETTE,
    exemple: EXAMPLE,
    onglets: TABS,
    rubriques: HEADINGS,
    gestes: {},
    banniere: BANNER,
    calibrage: { modeles: MODELS, efforts: EFFORTS },
    code: undefined,
  });
  // La place de l'espace : le rail (main) et le panneau, 1600 px à eux deux.
  async function play(storage: FakeStorage, screen?: FakeScreen): Promise<Played> {
    const vue = await playTheVue({ demarrage: startup, espace: (project) => (project === "fanfare" ? [OTHER] : [SECOND]) }, { stockage: storage, ...(screen === undefined ? {} : { ecran: screen }) });
    Object.assign(vue.element("main"), { getBoundingClientRect: () => ({ width: 1240 }) });
    Object.assign(vue.element("second"), { getBoundingClientRect: () => ({ width: 360 }) });
    return vue;
  }
  async function enter(vue: Played, name: string): Promise<void> {
    (vue.element("projets").children.at(PROJECTS.findIndex((project) => project.nom === name) + 1) ?? assert.fail(`pas de case pour ${name}`)).click();
    await repos();
  }
  const width = (vue: Played) => vue.element("second").style.getPropertyValue("--largeur-du-second");
  const folded = (vue: Played) => vue.element("second").hasAttribute("data-replie");

  test("à la première ouverture d'un projet, le panneau est à droite, ouvert, avec son bord et son bouton", async () => {
    const vue = await play(new FakeStorage());
    await enter(vue, "parade");
    assert.equal(vue.element("second").hidden, false);
    assert.equal(folded(vue), false);
    assert.equal(width(vue), "360px");
    assert.equal(vue.element("bord-du-second").hidden, false);
    assert.equal(vue.element("replier-second").parentElement, vue.element("tete-du-second"));
    assert.equal(vue.element("replier-second").ariaExpanded, "true");
  });

  test("la largeur tirée et l'état replié reviennent au lancement suivant, chaque projet les siens ; tirée trop loin, bornée", async () => {
    const storage = new FakeStorage();
    const before = await play(storage);
    await enter(before, "parade");
    pull(before.element("bord-du-second"), 1240, 100);
    assert.equal(width(before), "960px");
    await enter(before, "fanfare");
    assert.equal(width(before), "360px");
    pull(before.element("bord-du-second"), 1240, 1500);
    assert.equal(width(before), "280px");
    before.element("replier-second").click();
    await repos();
    assert.equal(folded(before), true);

    const after = await play(storage);
    await enter(after, "parade");
    assert.equal(width(after), "960px");
    assert.equal(folded(after), false);
    await enter(after, "fanfare");
    assert.equal(folded(after), true);
    assert.equal(after.element("replier-second").ariaLabel, "Unfold the second's panel");
    after.element("replier-second").click();
    await repos();
    assert.equal(folded(after), false);
    assert.equal(width(after), "280px");

    const still = await play(storage);
    await enter(still, "fanfare");
    assert.equal(folded(still), false);
  });

  test("sur un écran étroit, le panneau est un onglet : son état replié ne le cache pas", async () => {
    const storage = new FakeStorage();
    storage.setItem(KEY_OF_PANELS, JSON.stringify({ parade: { largeur: 500, replie: true } }));
    const vue = await play(storage, new FakeScreen(true));
    await enter(vue, "parade");
    assert.equal(folded(vue), false);
    assert.equal(vue.element("replier-second").hidden, true);
    assert.equal(vue.element("bord-du-second").hidden, true);
  });
});
