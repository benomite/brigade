// Les cartes qui attendent le chef, à la largeur d'un téléphone (ticket 2915, Phone.dc.html) : l'app s'ouvre sur leur liste,
// un toucher ouvre la carte, un choix — le recommandé compris — la répond par le geste de la carte de TODO, et l'écran dit
// « Sent to the kitchen. ». La vue est jouée telle qu'elle est (helpers/false-vue.ts) ; ce qu'aucun faux document ne mesure —
// la largeur, la hauteur des cibles — est dit par la peau, que ce test lit, et mesuré sur les captures du ticket
// (`cartes-du-chef-*` de scripts/capture-ecran, docs/captures/2915/).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { kindOfTheCard, setTheCard } from "../../src/vue/cards-of-chef/cards-of-chef.js";
import { PALETTE } from "../../src/colors.ts";
import { holdFacts, type Drawable, type Facts } from "../../src/facts.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { Fake, FakeScreen, type Played, playTheVue, repos } from "../helpers/false-vue.ts";

const A = "2026-10-21T10:04:12.000Z";
const PARADE = "parade";
const QUESTION = "One journal export per project, or a single one for all projects?";
const FIRST = "One per project: each project keeps its own file.";
const SECOND = "A single export, all projects together.";

const startup = () => ({
  configuration: forTheBar({ chemin: "no projects file on this phone", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  telephone: { github: { compte: "chef" } },
});

// #21 attend une décision de produit : une carte du chef avec sa question et ses deux choix, telle que son issue la pose
// sur GitHub (board/todo-github.ts).
const FACTS = {
  etat: "ouverte",
  lu: "2026-10-21T10:04:11.000Z",
  compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 1, livres24h: 0 },
  rail: [{ ticket: 21, etat: "en attente", titre: "L'export du journal", url: "https://github.com/chef/parade/issues/21", activite: null }],
  cooks: [],
  attend: [
    {
      ticket: 21,
      titre: "L'export du journal",
      url: "https://github.com/chef/parade/issues/21",
      chef: { sorte: "product", texte: `${QUESTION}\n- [resume] ${FIRST}\n- [resume] ${SECOND}\n\nThe site, the demo and the posts will all carry it.` },
    },
  ],
  stations: [],
} as unknown as Facts;
const EMPTY = { ...FACTS, compteurs: { ...FACTS.compteurs, attend: 0 }, attend: [] } as unknown as Facts;

const drawable = (facts: Facts): Drawable => holdFacts(() => new Map()).recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
function read(vue: Played, facts: Facts): void {
  const requests = vue.appels.filter(({ geste: action }) => action === "faits" || action === "relireBox");
  vue.dire("surFaits", { ...drawable(facts), demande: requests.at(-1)?.args[0] as number });
}

async function open(narrow: boolean, answers: Record<string, unknown> = {}): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [], machines: () => [], ...answers } as never, { ecran: new FakeScreen(narrow) });
  read(vue, FACTS);
  await repos();
  return vue;
}

const cards = (vue: Played) => vue.element("cartes-du-chef");
const buttons = (vue: Played) => cards(vue).dessous("button");
const touch = async (button: Fake | undefined): Promise<void> => {
  (button ?? assert.fail("pas de bouton")).click();
  await repos();
};
const cardALouvrir = (vue: Played) => buttons(vue).find((button) => button.className === "carte-a-ouvrir");
const choice = (vue: Played, rank: number) => buttons(vue).filter((button) => button.className.includes("choix-du-chef"))[rank];

describe("à la largeur d'un téléphone, l'app s'ouvre sur les cartes qui attendent le chef", () => {
  test("la liste dit l'en-tête, le compte, la carte — son numéro, son projet, sa question, son genre — et remplace « All projects »", async () => {
    const vue = await open(true);
    assert.equal(cards(vue).hidden, false);
    assert.equal(vue.element("tous").hidden, true);
    const text = cards(vue).textContent;
    assert.match(text, /Awaiting you/);
    assert.match(text, /1 card/);
    assert.match(text, /The kitchen works on\. These are the only choices that need you\./);
    assert.match(text, new RegExp(`#21 · ${PARADE}`));
    assert.match(text, /One journal export per project/);
    assert.match(text, /Product choice · 2 options/);
  });

  test("une PR à merger à la main (#3368) se dit un merge, pas un choix de produit", () => {
    assert.equal(kindOfTheCard({ sorte: "merge-by-hand", question: "Merge PR #45 by hand?", choix: [{ texte: "Merge PR #45", suite: "merge" }], prixDuTexte: "" } as never), "Merge by hand · 1 option");
  });

  test("large, rien ne change : « All projects » reste, les cartes du téléphone sont cachées", async () => {
    const vue = await open(false);
    assert.equal(cards(vue).hidden, true);
    assert.equal(vue.element("tous").hidden, false);
  });

  test("sans carte, la liste le dit en une ligne, et compte « 0 cards »", async () => {
    const vue = await open(true);
    read(vue, EMPTY);
    await repos();
    assert.match(cards(vue).textContent, /Nothing awaits you\./);
    assert.match(cards(vue).textContent, /0 cards/);
  });
});

describe("la carte ouverte d'un toucher", () => {
  test("elle montre sa question, ce qui se passe, le choix recommandé d'abord — plein d'accent, « Recommended: … » —, le champ et « Send » inactif tant qu'il est vide", async () => {
    const vue = await open(true);
    await touch(cardALouvrir(vue));
    const text = cards(vue).textContent;
    assert.match(text, /One journal export per project/);
    assert.match(text, /The site, the demo and the posts will all carry it\./);
    assert.match(text, /Or answer in your own words/);
    assert.equal(choice(vue, 0)?.className.split(" ").includes("recommande"), true);
    assert.match(text, new RegExp(`Recommended: ${FIRST}`));
    assert.equal(choice(vue, 1)?.className.split(" ").includes("recommande"), false);
    assert.equal(buttons(vue).find((button) => button.textContent === "Send")?.disabled, true);
  });

  test("la flèche ramène à la liste", async () => {
    const vue = await open(true);
    await touch(cardALouvrir(vue));
    await touch(buttons(vue).find((button) => button.ariaLabel === "Back to the list"));
    assert.ok(cardALouvrir(vue), "la liste est revenue");
  });
});

describe("répondre depuis la carte", () => {
  for (const [theCase, rank, answer] of [
    ["le choix recommandé", 0, { question: QUESTION, choix: 1 }],
    ["un autre choix", 1, { question: QUESTION, choix: 2 }],
  ] as const) {
    test(`${theCase} part par le geste de la carte de TODO, et l'écran dit « Sent to the kitchen. », #21 est retourné sur le rail`, async () => {
      const vue = await open(true, { repondreCarte: () => ({ repondue: true, dit: "answered", commentaire: 9001 }) });
      await touch(cardALouvrir(vue));
      await touch(choice(vue, rank));
      assert.deepEqual(vue.dernier("repondreCarte"), [PARADE, 21, answer]);
      const text = cards(vue).textContent;
      assert.match(text, /Sent to the kitchen\./);
      assert.match(text, /#21 is back on the rail\. Nothing else awaits you on parade\./);
      assert.match(text, /0 cards/);
      assert.ok(buttons(vue).some((button) => button.textContent === "Back to the list"));
    });
  }

  test("un refus se dit en une ligne sur la carte, qui garde ses gestes : rien n'est dit envoyé", async () => {
    const vue = await open(true, { repondreCarte: () => ({ refus: "nothing was sent: GitHub refused", detail: "403" }) });
    await touch(cardALouvrir(vue));
    await touch(choice(vue, 0));
    assert.doesNotMatch(cards(vue).textContent, /Sent to the kitchen/);
    assert.match(cards(vue).textContent, /nothing was sent: GitHub refused/);
    assert.equal(choice(vue, 0)?.disabled, false, "la réponse se rejoue");
  });

  test("le texte libre part par « Send », une fois tapé", async () => {
    const vue = await open(true, { repondreCarte: () => ({ repondue: true, dit: "answered", commentaire: 9002 }) });
    await touch(cardALouvrir(vue));
    const field = cards(vue).dessous("textarea")[0] ?? assert.fail("pas de champ");
    field.value = "Both, one after the other";
    field.declencher("input");
    const send = buttons(vue).find((button) => button.textContent === "Send");
    assert.equal(send?.disabled, false);
    await touch(send);
    assert.deepEqual(vue.dernier("repondreCarte"), [PARADE, 21, { question: QUESTION, texte: "Both, one after the other" }]);
    assert.match(cards(vue).textContent, /Sent to the kitchen\./);
  });
});

describe("sa peau, lue : chaque cible fait 44 px, rien ne défile de côté", () => {
  const css = readFileSync(join(import.meta.dirname, "../../src/vue/cards-of-chef/cards-of-chef.css"), "utf8");
  const rule = (selector: string) => css.match(new RegExp(`${selector.replace(/[.[\]()]/g, "\\$&")}\\s*\\{([^}]*)\\}`))?.[1] ?? assert.fail(`pas de règle ${selector}`);
  test("la carte de la liste, le retour et chaque choix ont une hauteur d'au moins 44 px ; le champ ne dépasse pas sa colonne", () => {
    assert.match(rule("#cartes-du-chef .carte-a-ouvrir"), /min-height: 44px/);
    assert.match(rule("#cartes-du-chef .retour-aux-cartes"), /width: 44px;\s*height: 44px/);
    assert.match(rule("#cartes-du-chef .choix-du-chef"), /min-height: 52px/);
    assert.match(rule("#cartes-du-chef .saisie-du-chef"), /width: 100%/);
    assert.match(rule("#cartes-du-chef"), /overflow-x: hidden/);
  });
});

describe("la carte ouverte d'un toucher — à première vue (#3086)", () => {
  test("situation, question, recommandation, boutons ; ce que le commentaire dit d'autre est derrière un seul « details », fermé", () => {
    const doc = { createElement: (balise: string) => new Fake(balise) };
    const todo = { sorte: "blocked", resume: "The release run failed.", question: "Retry it?", contexte: "First paragraph.\n\nManager note.", choix: [{ texte: "Retry it", prix: "p" }, { texte: "Close it", prix: "p" }], prixDuTexte: "p" };
    const [, body] = setTheCard(doc, { carte: { projet: "parade", ticket: 3084, age: "1 h", todo }, total: 1, brouillon: "", enRoute: false, retour: () => {}, ecrire: () => {}, repondre: () => {} }) as unknown as Fake[];
    const order = (body as Fake).children.map((pose) => pose.textContent);
    assert.deepEqual(order.slice(0, 4), ["#3084 · parade", "The release run failed.", "Retry it?", "Recommended: Retry it"]);
    const folds = (body as Fake).dessous("details");
    assert.equal(folds.length, 1);
    assert.equal(folds[0]?.children[0]?.textContent, "details");
    assert.notEqual((folds[0] as unknown as { open?: boolean }).open, true);
    assert.ok(!order.some((text, rank) => rank < order.length && /Manager note/.test(text) && !folds[0]?.textContent.includes(text)));
  });
});

describe("la carte ouverte d'une décision du manager (#3434)", () => {
  const doc = { createElement: (balise: string) => new Fake(balise) };
  const set = (recommendation: { rang: number; pourquoi: string } | null) => {
    const todo = { sorte: "manager-decision", question: "Option A or B?", choix: [{ texte: "Option A suffices", prix: "p" }, { texte: "Option B: generate them", prix: "p" }], prixDuTexte: "p", recommandation: recommendation };
    const [, body] = setTheCard(doc, { carte: { projet: "parade", ticket: 35, age: "1 h", todo }, total: 1, brouillon: "", enRoute: false, retour: () => {}, ecrire: () => {}, repondre: () => {} }) as unknown as Fake[];
    const choice = (body as Fake).dessous("button").filter((button) => button.className.split(" ").includes("choix-du-chef"));
    return { textes: (body as Fake).children.map((pose) => pose.textContent), recommandes: choice.filter((button) => button.className.split(" ").includes("recommande")).map((button) => button.textContent) };
  };

  test("la réponse que le manager recommande, avec sa raison, pleine d'accent — pas forcément la première", () => {
    const { textes: texts, recommandes } = set({ rang: 2, pourquoi: "the client asked for them twice." });
    assert.ok(texts.includes("Recommended: Option B: generate them — the client asked for them twice."), JSON.stringify(texts));
    assert.deepEqual(recommandes, ["Option B: generate them"]);
  });

  test("sans recommandation : aucune ligne « Recommended », aucun bouton mis en avant", () => {
    const { textes: texts, recommandes } = set(null);
    assert.ok(!texts.some((text) => text.startsWith("Recommended")), JSON.stringify(texts));
    assert.deepEqual(recommandes, []);
  });
});
