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
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { genreDeLaCarte, poserLaCarte } from "../../src/vue/cartes-du-chef/cartes-du-chef.js";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Dessinable, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { Faux, FauxEcran, type Jouee, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-21T10:04:12.000Z";
const PARADE = "parade";
const QUESTION = "One journal export per project, or a single one for all projects?";
const PREMIER = "One per project: each project keeps its own file.";
const SECOND = "A single export, all projects together.";

const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "no projects file on this phone", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  telephone: { github: { compte: "chef" } },
});

// #21 attend une décision de produit : une carte avec sa question et ses deux choix, comme `facts` la donne.
const FAITS = {
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
      carte: { type: "product", resume: "The site, the demo and the posts will all carry it.", question: QUESTION, choix: [{ texte: PREMIER, suite: "resume" }, { texte: SECOND, suite: "resume" }], captures: null },
    },
  ],
  stations: [],
} as unknown as Faits;
const VIDE = { ...FAITS, compteurs: { ...FAITS.compteurs, attend: 0 }, attend: [] } as unknown as Faits;

const dessinable = (faits: Faits): Dessinable => tenirFaits(() => new Map()).recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
function lire(vue: Jouee, faits: Faits): void {
  const demandes = vue.appels.filter(({ geste }) => geste === "faits" || geste === "relireBox");
  vue.dire("surFaits", { ...dessinable(faits), demande: demandes.at(-1)?.args[0] as number });
}

async function ouvrir(etroit: boolean, reponses: Record<string, unknown> = {}): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [], ...reponses } as never, { ecran: new FauxEcran(etroit) });
  lire(vue, FAITS);
  await repos();
  return vue;
}

const cartes = (vue: Jouee) => vue.element("cartes-du-chef");
const boutons = (vue: Jouee) => cartes(vue).dessous("button");
const toucher = async (bouton: Faux | undefined): Promise<void> => {
  (bouton ?? assert.fail("pas de bouton")).click();
  await repos();
};
const carteALouvrir = (vue: Jouee) => boutons(vue).find((bouton) => bouton.className === "carte-a-ouvrir");
const choix = (vue: Jouee, rang: number) => boutons(vue).filter((bouton) => bouton.className.includes("choix-du-chef"))[rang];

describe("à la largeur d'un téléphone, l'app s'ouvre sur les cartes qui attendent le chef", () => {
  test("la liste dit l'en-tête, le compte, la carte — son numéro, son projet, sa question, son genre — et remplace « All projects »", async () => {
    const vue = await ouvrir(true);
    assert.equal(cartes(vue).hidden, false);
    assert.equal(vue.element("tous").hidden, true);
    const texte = cartes(vue).textContent;
    assert.match(texte, /Awaiting you/);
    assert.match(texte, /1 card/);
    assert.match(texte, /The kitchen works on\. These are the only choices that need you\./);
    assert.match(texte, new RegExp(`#21 · ${PARADE}`));
    assert.match(texte, /One journal export per project/);
    assert.match(texte, /Product choice · 2 options/);
  });

  test("une PR à merger à la main (#3368) se dit un merge, pas un choix de produit", () => {
    assert.equal(genreDeLaCarte({ sorte: "merge-by-hand", question: "Merge PR #45 by hand?", choix: [{ texte: "Merge PR #45", suite: "merge" }], prixDuTexte: "" } as never), "Merge by hand · 1 option");
  });

  test("large, rien ne change : « All projects » reste, les cartes du téléphone sont cachées", async () => {
    const vue = await ouvrir(false);
    assert.equal(cartes(vue).hidden, true);
    assert.equal(vue.element("tous").hidden, false);
  });

  test("sans carte, la liste le dit en une ligne, et compte « 0 cards »", async () => {
    const vue = await ouvrir(true);
    lire(vue, VIDE);
    await repos();
    assert.match(cartes(vue).textContent, /Nothing awaits you\./);
    assert.match(cartes(vue).textContent, /0 cards/);
  });
});

describe("la carte ouverte d'un toucher", () => {
  test("elle montre sa question, ce qui se passe, le choix recommandé d'abord — plein d'accent, « Recommended: … » —, le champ et « Send » inactif tant qu'il est vide", async () => {
    const vue = await ouvrir(true);
    await toucher(carteALouvrir(vue));
    const texte = cartes(vue).textContent;
    assert.match(texte, /One journal export per project/);
    assert.match(texte, /The site, the demo and the posts will all carry it\./);
    assert.match(texte, /Or answer in your own words/);
    assert.equal(choix(vue, 0)?.className.split(" ").includes("recommande"), true);
    assert.match(texte, new RegExp(`Recommended: ${PREMIER}`));
    assert.equal(choix(vue, 1)?.className.split(" ").includes("recommande"), false);
    assert.equal(boutons(vue).find((bouton) => bouton.textContent === "Send")?.disabled, true);
  });

  test("la flèche ramène à la liste", async () => {
    const vue = await ouvrir(true);
    await toucher(carteALouvrir(vue));
    await toucher(boutons(vue).find((bouton) => bouton.ariaLabel === "Back to the list"));
    assert.ok(carteALouvrir(vue), "la liste est revenue");
  });
});

describe("répondre depuis la carte", () => {
  for (const [cas, rang, reponse] of [
    ["le choix recommandé", 0, { question: QUESTION, choix: 1 }],
    ["un autre choix", 1, { question: QUESTION, choix: 2 }],
  ] as const) {
    test(`${cas} part par le geste de la carte de TODO, et l'écran dit « Sent to the kitchen. », #21 est retourné sur le rail`, async () => {
      const vue = await ouvrir(true, { repondreCarte: () => ({ repondue: true, dit: "answered", commentaire: 9001 }) });
      await toucher(carteALouvrir(vue));
      await toucher(choix(vue, rang));
      assert.deepEqual(vue.dernier("repondreCarte"), [PARADE, 21, reponse]);
      const texte = cartes(vue).textContent;
      assert.match(texte, /Sent to the kitchen\./);
      assert.match(texte, /#21 is back on the rail\. Nothing else awaits you on parade\./);
      assert.match(texte, /0 cards/);
      assert.ok(boutons(vue).some((bouton) => bouton.textContent === "Back to the list"));
    });
  }

  test("un refus se dit en une ligne sur la carte, qui garde ses gestes : rien n'est dit envoyé", async () => {
    const vue = await ouvrir(true, { repondreCarte: () => ({ refus: "nothing was sent: GitHub refused", detail: "403" }) });
    await toucher(carteALouvrir(vue));
    await toucher(choix(vue, 0));
    assert.doesNotMatch(cartes(vue).textContent, /Sent to the kitchen/);
    assert.match(cartes(vue).textContent, /nothing was sent: GitHub refused/);
    assert.equal(choix(vue, 0)?.disabled, false, "la réponse se rejoue");
  });

  test("le texte libre part par « Send », une fois tapé", async () => {
    const vue = await ouvrir(true, { repondreCarte: () => ({ repondue: true, dit: "answered", commentaire: 9002 }) });
    await toucher(carteALouvrir(vue));
    const champ = cartes(vue).dessous("textarea")[0] ?? assert.fail("pas de champ");
    champ.value = "Both, one after the other";
    champ.declencher("input");
    const envoyer = boutons(vue).find((bouton) => bouton.textContent === "Send");
    assert.equal(envoyer?.disabled, false);
    await toucher(envoyer);
    assert.deepEqual(vue.dernier("repondreCarte"), [PARADE, 21, { question: QUESTION, texte: "Both, one after the other" }]);
    assert.match(cartes(vue).textContent, /Sent to the kitchen\./);
  });
});

describe("sa peau, lue : chaque cible fait 44 px, rien ne défile de côté", () => {
  const css = readFileSync(join(import.meta.dirname, "../../src/vue/cartes-du-chef/cartes-du-chef.css"), "utf8");
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
    const [, corps] = poserLaCarte(doc, { carte: { projet: "parade", ticket: 3084, age: "1 h", todo }, total: 1, brouillon: "", enRoute: false, retour: () => {}, ecrire: () => {}, repondre: () => {} }) as unknown as Faux[];
    const ordre = (corps as Faux).children.map((pose) => pose.textContent);
    assert.deepEqual(ordre.slice(0, 4), ["#3084 · parade", "The release run failed.", "Retry it?", "Recommended: Retry it"]);
    const plis = (corps as Faux).dessous("details");
    assert.equal(plis.length, 1);
    assert.equal(plis[0]?.children[0]?.textContent, "details");
    assert.notEqual((plis[0] as unknown as { open?: boolean }).open, true);
    assert.ok(!ordre.some((texte, rang) => rang < ordre.length && /Manager note/.test(texte) && !plis[0]?.textContent.includes(texte)));
  });
});
