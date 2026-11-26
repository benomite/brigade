// Les cartes qui attendent le chef, à la largeur d'un téléphone (ticket 2915, Phone.dc.html) : l'app s'ouvre sur leur liste,
// un toucher ouvre la carte, un choix — le recommandé compris — la répond par le geste de la carte de TODO, et l'écran dit
// « Sent to the kitchen. ». La vue est jouée telle qu'elle est (aides/fausse-vue.ts) ; ce qu'aucun faux document ne mesure —
// la largeur, la hauteur des cibles — est dit par la peau, que ce test lit, et mesuré sur les captures du ticket
// (`cartes-du-chef-*` de scripts/capture-ecran, docs/captures/2915/).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE } from "../../src/config.ts";
import { genreDeLaCard, poserLaCard } from "../../src/vue/cards-du-chef/cards-du-chef.js";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE, holdFacts, type Dessinable, type Facts } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projects/projects.ts";
import { Faux, FauxScreen, type Jouee, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-21T10:04:12.000Z";
const PARADE = "parade";
const QUESTION = "One journal export per project, or a single one for all projects?";
const FIRST = "One per project: each project keeps its own file.";
const SECOND = "A single export, all projects together.";

const demarrage = () => ({
  configuration: pourLaBar({ chemin: "no projects file on this phone", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  telephone: { github: { compte: "chef" } },
});

// #21 attend une décision de produit : une carte avec sa question et ses deux choix, comme `facts` la donne.
const FACTS = {
  etat: "ouverte",
  lu: "2026-10-21T10:04:11.000Z",
  dernierTick: "2026-10-21T10:04:02.000Z",
  compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 1, livres24h: 0 },
  dernierEvenement: null,
  rail: [{ ticket: 21, etat: "en attente", titre: "L'export du journal", url: "https://github.com/chef/parade/issues/21", activite: null }],
  cooks: [],
  attend: [
    {
      ticket: 21,
      titre: "L'export du journal",
      url: "https://github.com/chef/parade/issues/21",
      decision: { quoi: "carte", motif: "product", cause: QUESTION, pr: null },
      carte: { type: "product", resume: "The site, the demo and the posts will all carry it.", question: QUESTION, choix: [{ texte: FIRST, suite: "resume" }, { texte: SECOND, suite: "resume" }], captures: null },
    },
  ],
  stations: [],
} as unknown as Facts;
const EMPTY = { ...FACTS, compteurs: { ...FACTS.compteurs, attend: 0 }, attend: [] } as unknown as Facts;

const dessinable = (facts: Facts): Dessinable => holdFacts(() => new Map()).recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
function lire(vue: Jouee, facts: Facts): void {
  const demandes = vue.appels.filter(({ geste: action }) => action === "faits" || action === "relireBox");
  vue.dire("surFaits", { ...dessinable(facts), demande: demandes.at(-1)?.args[0] as number });
}

async function ouvrir(etroit: boolean, answers: Record<string, unknown> = {}): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [], ...answers } as never, { ecran: new FauxScreen(etroit) });
  lire(vue, FACTS);
  await repos();
  return vue;
}

const cards = (vue: Jouee) => vue.element("cartes-du-chef");
const boutons = (vue: Jouee) => cards(vue).dessous("button");
const toucher = async (button: Faux | undefined): Promise<void> => {
  (button ?? assert.fail("pas de bouton")).click();
  await repos();
};
const cardALouvrir = (vue: Jouee) => boutons(vue).find((button) => button.className === "carte-a-ouvrir");
const choice = (vue: Jouee, rang: number) => boutons(vue).filter((button) => button.className.includes("choix-du-chef"))[rang];

describe("à la largeur d'un téléphone, l'app s'ouvre sur les cartes qui attendent le chef", () => {
  test("la liste dit l'en-tête, le compte, la carte — son numéro, son projet, sa question, son genre — et remplace « All projects »", async () => {
    const vue = await ouvrir(true);
    assert.equal(cards(vue).hidden, false);
    assert.equal(vue.element("tous").hidden, true);
    const texte = cards(vue).textContent;
    assert.match(texte, /Awaiting you/);
    assert.match(texte, /1 card/);
    assert.match(texte, /The kitchen works on\. These are the only choices that need you\./);
    assert.match(texte, new RegExp(`#21 · ${PARADE}`));
    assert.match(texte, /One journal export per project/);
    assert.match(texte, /Product choice · 2 options/);
  });

  test("une PR à merger à la main (#3368) se dit un merge, pas un choix de produit", () => {
    assert.equal(genreDeLaCard({ sorte: "merge-by-hand", question: "Merge PR #45 by hand?", choix: [{ texte: "Merge PR #45", suite: "merge" }], prixDuTexte: "" } as never), "Merge by hand · 1 option");
  });

  test("large, rien ne change : « All projects » reste, les cartes du téléphone sont cachées", async () => {
    const vue = await ouvrir(false);
    assert.equal(cards(vue).hidden, true);
    assert.equal(vue.element("tous").hidden, false);
  });

  test("sans carte, la liste le dit en une ligne, et compte « 0 cards »", async () => {
    const vue = await ouvrir(true);
    lire(vue, EMPTY);
    await repos();
    assert.match(cards(vue).textContent, /Nothing awaits you\./);
    assert.match(cards(vue).textContent, /0 cards/);
  });
});

describe("la carte ouverte d'un toucher", () => {
  test("elle montre sa question, ce qui se passe, le choix recommandé d'abord — plein d'accent, « Recommended: … » —, le champ et « Send » inactif tant qu'il est vide", async () => {
    const vue = await ouvrir(true);
    await toucher(cardALouvrir(vue));
    const texte = cards(vue).textContent;
    assert.match(texte, /One journal export per project/);
    assert.match(texte, /The site, the demo and the posts will all carry it\./);
    assert.match(texte, /Or answer in your own words/);
    assert.equal(choice(vue, 0)?.className.split(" ").includes("recommande"), true);
    assert.match(texte, new RegExp(`Recommended: ${FIRST}`));
    assert.equal(choice(vue, 1)?.className.split(" ").includes("recommande"), false);
    assert.equal(boutons(vue).find((button) => button.textContent === "Send")?.disabled, true);
  });

  test("la flèche ramène à la liste", async () => {
    const vue = await ouvrir(true);
    await toucher(cardALouvrir(vue));
    await toucher(boutons(vue).find((button) => button.ariaLabel === "Back to the list"));
    assert.ok(cardALouvrir(vue), "la liste est revenue");
  });
});

describe("répondre depuis la carte", () => {
  for (const [cas, rang, answer] of [
    ["le choix recommandé", 0, { question: QUESTION, choix: 1 }],
    ["un autre choix", 1, { question: QUESTION, choix: 2 }],
  ] as const) {
    test(`${cas} part par le geste de la carte de TODO, et l'écran dit « Sent to the kitchen. », #21 est retourné sur le rail`, async () => {
      const vue = await ouvrir(true, { repondreCarte: () => ({ repondue: true, dit: "answered", commentaire: 9001 }) });
      await toucher(cardALouvrir(vue));
      await toucher(choice(vue, rang));
      assert.deepEqual(vue.dernier("repondreCarte"), [PARADE, 21, answer]);
      const texte = cards(vue).textContent;
      assert.match(texte, /Sent to the kitchen\./);
      assert.match(texte, /#21 is back on the rail\. Nothing else awaits you on parade\./);
      assert.match(texte, /0 cards/);
      assert.ok(boutons(vue).some((button) => button.textContent === "Back to the list"));
    });
  }

  test("un refus se dit en une ligne sur la carte, qui garde ses gestes : rien n'est dit envoyé", async () => {
    const vue = await ouvrir(true, { repondreCarte: () => ({ refus: "nothing was sent: GitHub refused", detail: "403" }) });
    await toucher(cardALouvrir(vue));
    await toucher(choice(vue, 0));
    assert.doesNotMatch(cards(vue).textContent, /Sent to the kitchen/);
    assert.match(cards(vue).textContent, /nothing was sent: GitHub refused/);
    assert.equal(choice(vue, 0)?.disabled, false, "la réponse se rejoue");
  });

  test("le texte libre part par « Send », une fois tapé", async () => {
    const vue = await ouvrir(true, { repondreCarte: () => ({ repondue: true, dit: "answered", commentaire: 9002 }) });
    await toucher(cardALouvrir(vue));
    const champ = cards(vue).dessous("textarea")[0] ?? assert.fail("pas de champ");
    champ.value = "Both, one after the other";
    champ.declencher("input");
    const envoyer = boutons(vue).find((button) => button.textContent === "Send");
    assert.equal(envoyer?.disabled, false);
    await toucher(envoyer);
    assert.deepEqual(vue.dernier("repondreCarte"), [PARADE, 21, { question: QUESTION, texte: "Both, one after the other" }]);
    assert.match(cards(vue).textContent, /Sent to the kitchen\./);
  });
});

describe("sa peau, lue : chaque cible fait 44 px, rien ne défile de côté", () => {
  const css = readFileSync(join(import.meta.dirname, "../../src/vue/cards-du-chef/cards-du-chef.css"), "utf8");
  const regle = (selecteur: string) => css.match(new RegExp(`${selecteur.replace(/[.[\]()]/g, "\\$&")}\\s*\\{([^}]*)\\}`))?.[1] ?? assert.fail(`pas de règle ${selecteur}`);
  test("la carte de la liste, le retour et chaque choix ont une hauteur d'au moins 44 px ; le champ ne dépasse pas sa colonne", () => {
    assert.match(regle("#cartes-du-chef .carte-a-ouvrir"), /min-height: 44px/);
    assert.match(regle("#cartes-du-chef .retour-aux-cartes"), /width: 44px;\s*height: 44px/);
    assert.match(regle("#cartes-du-chef .choix-du-chef"), /min-height: 52px/);
    assert.match(regle("#cartes-du-chef .saisie-du-chef"), /width: 100%/);
    assert.match(regle("#cartes-du-chef"), /overflow-x: hidden/);
  });
});

describe("la carte ouverte d'un toucher — à première vue (#3086)", () => {
  test("situation, question, recommandation, boutons ; ce que le commentaire dit d'autre est derrière un seul « details », fermé", () => {
    const doc = { createElement: (balise: string) => new Faux(balise) };
    const todo = { sorte: "blocked", resume: "The release run failed.", question: "Retry it?", contexte: "First paragraph.\n\nManager note.", choix: [{ texte: "Retry it", prix: "p" }, { texte: "Close it", prix: "p" }], prixDuTexte: "p" };
    const [, corps] = poserLaCard(doc, { carte: { projet: "parade", ticket: 3084, age: "1 h", todo }, total: 1, brouillon: "", enRoute: false, retour: () => {}, ecrire: () => {}, repondre: () => {} }) as unknown as Faux[];
    const ordre = (corps as Faux).children.map((pose) => pose.textContent);
    assert.deepEqual(ordre.slice(0, 4), ["#3084 · parade", "The release run failed.", "Retry it?", "Recommended: Retry it"]);
    const plis = (corps as Faux).dessous("details");
    assert.equal(plis.length, 1);
    assert.equal(plis[0]?.children[0]?.textContent, "details");
    assert.notEqual((plis[0] as unknown as { open?: boolean }).open, true);
    assert.ok(!ordre.some((texte, rang) => rang < ordre.length && /Manager note/.test(texte) && !plis[0]?.textContent.includes(texte)));
  });
});

describe("la carte ouverte d'une décision du manager (#3434)", () => {
  const doc = { createElement: (balise: string) => new Faux(balise) };
  const poser = (recommandation: { rang: number; pourquoi: string } | null) => {
    const todo = { sorte: "manager-decision", question: "Option A or B?", choix: [{ texte: "Option A suffices", prix: "p" }, { texte: "Option B: generate them", prix: "p" }], prixDuTexte: "p", recommandation };
    const [, corps] = poserLaCard(doc, { carte: { projet: "parade", ticket: 35, age: "1 h", todo }, total: 1, brouillon: "", enRoute: false, retour: () => {}, ecrire: () => {}, repondre: () => {} }) as unknown as Faux[];
    const choice = (corps as Faux).dessous("button").filter((button) => button.className.split(" ").includes("choix-du-chef"));
    return { textes: (corps as Faux).children.map((pose) => pose.textContent), recommandes: choice.filter((button) => button.className.split(" ").includes("recommande")).map((button) => button.textContent) };
  };

  test("la réponse que le manager recommande, avec sa raison, pleine d'accent — pas forcément la première", () => {
    const { textes, recommandes } = poser({ rang: 2, pourquoi: "the client asked for them twice." });
    assert.ok(textes.includes("Recommended: Option B: generate them — the client asked for them twice."), JSON.stringify(textes));
    assert.deepEqual(recommandes, ["Option B: generate them"]);
  });

  test("sans recommandation : aucune ligne « Recommended », aucun bouton mis en avant", () => {
    const { textes, recommandes } = poser(null);
    assert.ok(!textes.some((texte) => texte.startsWith("Recommended")), JSON.stringify(textes));
    assert.deepEqual(recommandes, []);
  });
});
