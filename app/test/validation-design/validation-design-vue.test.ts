// La carte « Validate its screen » dans la vue (ticket 3185), sur une carte d'essai : dans TODO, sur un écran large, et sur
// le téléphone, ouverte depuis la liste. La question, les captures avant et après sans un clic, le lien de la PR ;
// « Validate » envoie le geste avec la carte, « Send back to the kitchen » — éteint tant que le commentaire est vide — avec
// le commentaire ; fait, la carte quitte TODO ; refusé, elle reste et dit pourquoi. La vue est jouée telle qu'elle est,
// devant un faux document et un faux pont (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Dessinable, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import type { Terminal } from "../../src/terminaux.ts";
import { validationDuCorps } from "../../src/vue/validation-design/validation-design-github.ts";
import { CHAMP, CONFIRMATION_MS, EN_RENVOI, EN_VALIDATION, RENVOYE, RENVOYER, sansLesValidees, VALIDE, VALIDER } from "../../src/vue/validation-design/validation-design.js";
import { carteDuTicket, Faux, FauxEcran, type Jouee, jouerLaVue, type Reponses, repos } from "../aides/fausse-vue.ts";

const A = "2026-11-11T12:04:12.000Z";
const DEPOT = "chef/parade";
const SHA = "3f9c2a1b7d4e5f60718293a4b5c6d7e8f9012345";
const QUESTION = "Does the screen of #58 look right? Validate it and PR #60 is merged; send it back with what to change and a cook takes it up again.";
const capture = (fichier: string) => `https://github.com/${DEPOT}/blob/${SHA}/docs/captures/58/${fichier}?raw=true`;
const CORPS = [`<!-- brigade:validation-design pr=60 ticket=58 sha=${SHA} -->`, `| ![rail — avant](${capture("rail-avant.png")}) | ![rail — après](${capture("rail-apres.png")}) |`].join("\n");
const CHEF = { sorte: "design-validation", texte: `${QUESTION}\n\nPull request: https://github.com/${DEPOT}/pull/60`, design: validationDuCorps(DEPOT, CORPS) };
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };
const IMAGE = { image: "data:image/png;base64,iVBORw0KGgo=" };

const demarrage = (telephone: boolean) => () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  ...(telephone ? { telephone: { github: { compte: "chef" } } } : {}),
});

const faits = (avecLaCarte: boolean): Faits =>
  ({
    etat: "ouverte",
    lu: "2026-11-11T12:04:11.000Z",
    dernierTick: "2026-11-11T12:04:11.000Z",
    compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: avecLaCarte ? 1 : 0, livres24h: 0 },
    dernierEvenement: null,
    rail: [],
    cooks: [],
    attend: avecLaCarte ? [{ ticket: 61, titre: "Validate its screen", url: `https://github.com/${DEPOT}/issues/61`, chef: CHEF }] : [],
  }) as unknown as Faits;
const dessinable = (avecLaCarte: boolean): Dessinable => tenirFaits(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits(avecLaCarte)) }] });
function lire(vue: Jouee, avecLaCarte = true): void {
  const demandes = vue.appels.filter(({ geste }) => geste === "faits" || geste === "relireBox");
  vue.dire("surFaits", { ...dessinable(avecLaCarte), demande: demandes.at(-1)?.args[0] as number });
}

async function ouvrirLarge(reponses: Reponses = {}): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage: demarrage(false), espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }], lireCapture: () => IMAGE, ...reponses } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  lire(vue);
  await repos();
  return vue;
}
async function ouvrirAuTelephone(reponses: Reponses = {}): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage: demarrage(true), espace: () => [], machines: () => [], lireCapture: () => IMAGE, ...reponses } as never, { ecran: new FauxEcran(true) });
  lire(vue);
  await repos();
  const carte = vue.element("cartes-du-chef").dessous("button").find(({ className }) => className === "carte-a-ouvrir") ?? assert.fail("pas de carte dans la liste");
  assert.match(carte.textContent, /Design validation/);
  carte.click();
  await repos();
  return vue;
}

const laCarte = (ou: Faux) => ou.dessous("section").find(({ className }) => className.includes("carte-validation"));
const bouton = (ou: Faux, libelle: string) => ou.dessous("button").find(({ textContent }) => textContent === libelle) ?? assert.fail(`pas de bouton « ${libelle} »`);
const taper = (ou: Faux, texte: string) => {
  const champ = ou.dessous("textarea")[0] ?? assert.fail("pas de champ");
  champ.value = texte;
  champ.declencher("input");
};

for (const [ecran, ouvrir, ou] of [
  ["dans TODO, sur un écran large", ouvrirLarge, (vue: Jouee) => carteDuTicket(vue, 61)],
  ["sur le téléphone, ouverte depuis la liste", ouvrirAuTelephone, (vue: Jouee) => vue.element("cartes-du-chef")],
] as const) {
  describe(`la carte « Validate its screen », ${ecran}`, () => {
    test("la question, les captures avant et après posées sans un clic, le lien de la PR, « Validate » recommandé, le champ et « Send back to the kitchen » éteint", async () => {
      const vue = await ouvrir();
      const carte = laCarte(ou(vue) ?? assert.fail("pas de carte")) ?? assert.fail("pas de carte de validation");
      assert.ok(carte.dessous("p").some(({ textContent }) => textContent === QUESTION));
      const images = carte.dessous("img") as unknown as Array<{ alt: string; src: string }>;
      assert.deepEqual(images.map(({ alt }) => alt), ["rail — before", "rail — after"]);
      assert.ok(images.every(({ src }) => src === IMAGE.image));
      assert.deepEqual(
        vue.appels.filter(({ geste }) => geste === "lireCapture").map(({ args }) => args.slice(1)),
        [
          [61, "rail", "avant"],
          [61, "rail", "apres"],
        ],
      );
      bouton(carte, "Pull request #60").click();
      assert.deepEqual(vue.dernier("ouvrirPr"), ["parade", 61]);
      assert.equal(bouton(carte, VALIDER).className, "recommande");
      assert.equal(carte.dessous("textarea")[0]?.placeholder, CHAMP);
      assert.equal(bouton(carte, RENVOYER).disabled, true);
      taper(carte, "   ");
      assert.equal(bouton(carte, RENVOYER).disabled, true, "des espaces ne sont pas un commentaire");
      taper(carte, "The button is cut off.");
      assert.equal(bouton(carte, RENVOYER).disabled, false);
    });

    test("« Validate » envoie le geste avec la carte ; fait, la carte le confirme puis quitte TODO, et les faits sont relus", async (t) => {
      t.mock.timers.enable({ apis: ["setTimeout"] });
      const vue = await ouvrir({ gesteDeValidation: () => ({ fait: "chef/parade#60 validated: merged, card #61 closed — ticket #58 is served" }) });
      const avant = vue.appels.filter(({ geste }) => geste === "relireBox").length;
      bouton(laCarte(ou(vue) ?? assert.fail("pas de carte")) ?? assert.fail("pas de carte de validation"), VALIDER).click();
      await repos();
      assert.deepEqual(vue.dernier("gesteDeValidation"), ["parade", 61, { geste: "valider" }]);
      const confirmee = laCarte(ou(vue) ?? assert.fail("la carte est partie sans un mot")) ?? assert.fail("pas de carte de validation");
      assert.equal(bouton(confirmee, VALIDE).disabled, true, "le bouton cliqué dit ce qui a été fait");
      assert.equal(bouton(confirmee, RENVOYER).disabled, true);
      t.mock.timers.tick(CONFIRMATION_MS);
      await repos();
      assert.equal(carteDuTicket(vue, 61), undefined, "plus dans TODO");
      assert.ok(!vue.element("cartes-du-chef").dessous("button").some(({ className }) => className === "carte-a-ouvrir"), "plus dans la liste du téléphone");
      assert.ok(vue.appels.filter(({ geste }) => geste === "relireBox").length > avant, "les faits sont relus");
      // La lecture qui porte encore la carte — GitHub ne l'a pas encore dite fermée — ne la ramène pas.
      lire(vue);
      await repos();
      assert.equal(carteDuTicket(vue, 61), undefined);
    });

    test("« Send back to the kitchen » envoie le commentaire ; fait, la carte dit « back to the kitchen ✓ » puis quitte TODO", async (t) => {
      t.mock.timers.enable({ apis: ["setTimeout"] });
      const vue = await ouvrir({ gesteDeValidation: () => ({ fait: "chef/parade#60 sent back" }) });
      const carte = laCarte(ou(vue) ?? assert.fail("pas de carte")) ?? assert.fail("pas de carte de validation");
      taper(carte, "The button is cut off.");
      bouton(carte, RENVOYER).click();
      await repos();
      assert.deepEqual(vue.dernier("gesteDeValidation"), ["parade", 61, { geste: "renvoyer", commentaire: "The button is cut off." }]);
      const confirmee = laCarte(ou(vue) ?? assert.fail("la carte est partie sans un mot")) ?? assert.fail("pas de carte de validation");
      assert.equal(bouton(confirmee, RENVOYE).disabled, true);
      assert.equal(bouton(confirmee, VALIDER).disabled, true);
      t.mock.timers.tick(CONFIRMATION_MS);
      await repos();
      assert.equal(carteDuTicket(vue, 61), undefined);
      assert.ok(!vue.element("cartes-du-chef").dessous("button").some(({ className }) => className === "carte-a-ouvrir"));
    });

    test("dès le clic, le bouton cliqué dit que le geste est en route et plus rien ne se clique ; refusé, les boutons reviennent", async () => {
      let rendre: (rendu: unknown) => void = () => {};
      const vue = await ouvrir({ gesteDeValidation: () => new Promise((fini) => (rendre = fini)) as never });
      const carte = laCarte(ou(vue) ?? assert.fail("pas de carte")) ?? assert.fail("pas de carte de validation");
      taper(carte, "The button is cut off.");
      bouton(carte, RENVOYER).click();
      await repos();
      const enRoute = laCarte(ou(vue) ?? assert.fail("pas de carte")) ?? assert.fail("pas de carte de validation");
      assert.equal(bouton(enRoute, EN_RENVOI).disabled, true);
      assert.equal(bouton(enRoute, VALIDER).disabled, true);
      assert.ok(!enRoute.dessous("button").some(({ textContent }) => textContent === RENVOYER || textContent === EN_VALIDATION));
      rendre({ refus: "nothing was done: GitHub said no", detail: "" });
      await repos();
      const revenue = laCarte(ou(vue) ?? assert.fail("pas de carte")) ?? assert.fail("pas de carte de validation");
      assert.equal(bouton(revenue, VALIDER).disabled, false);
      assert.equal(bouton(revenue, RENVOYER).disabled, false);
      assert.ok(revenue.dessous("p").some(({ textContent }) => textContent.includes("GitHub said no")));
    });

    test("refusé, la carte reste, dit pourquoi en une ligne — le détail au survol — et garde le commentaire et ses gestes", async () => {
      const vue = await ouvrir({ gesteDeValidation: () => ({ refus: "nothing was done: the head of PR #60 moved since card #61", detail: "brigade : the head of PR #60 moved" }) });
      taper(laCarte(ou(vue) ?? assert.fail("pas de carte")) ?? assert.fail("pas de carte de validation"), "The button is cut off.");
      bouton(laCarte(ou(vue) ?? assert.fail("pas de carte")) ?? assert.fail("pas de carte de validation"), RENVOYER).click();
      await repos();
      const carte = laCarte(ou(vue) ?? assert.fail("la carte est partie")) ?? assert.fail("pas de carte de validation");
      const ligne = carte.dessous("p").find(({ textContent }) => textContent.includes("the head of PR #60 moved since card #61")) ?? assert.fail("pas de ligne de refus");
      assert.ok(ligne.textContent.length < 120);
      assert.equal(carte.dessous("textarea")[0]?.value, "The button is cut off.");
      assert.equal(bouton(carte, VALIDER).disabled, false);
      assert.equal(bouton(carte, RENVOYER).disabled, false);
    });
  });
}

describe("« ask the second », comme toute carte de TODO (ticket 3133)", () => {
  test("dans TODO, la carte finit par « ask the second », qui la passe au second avec sa question ; la carte ouverte du téléphone n'en a pas", async () => {
    const large = await ouvrirLarge({ passerAuSecond: () => SECOND });
    bouton(laCarte(carteDuTicket(large, 61) ?? assert.fail("pas de carte")) ?? assert.fail("pas de carte de validation"), "ask the second").click();
    await repos();
    assert.deepEqual(large.dernier("passerAuSecond"), ["parade", 61, QUESTION]);
    const telephone = await ouvrirAuTelephone();
    assert.ok(!(laCarte(telephone.element("cartes-du-chef")) ?? assert.fail("pas de carte")).dessous("button").some(({ textContent }) => textContent === "ask the second"));
  });
});

describe("une carte faite quitte ses colonnes", () => {
  test("ses numéros sortent des cartes et des cartes d'autrui ; un compte qui les comptait suit", () => {
    const colonnes = [
      { nom: "Awaiting you", compte: "2", cartes: [{ ticket: 61 }, { ticket: 62 }], autres: [{ ticket: 61 }] },
      { nom: "Waiting", compte: "?", cartes: [{ ticket: 61 }] },
      { nom: "Taken", compte: "1", cartes: [{ ticket: 14 }] },
    ];
    assert.deepEqual(sansLesValidees(colonnes, new Set([61])), [
      { nom: "Awaiting you", compte: "1", cartes: [{ ticket: 62 }], autres: [] },
      { nom: "Waiting", compte: "?", cartes: [] },
      { nom: "Taken", compte: "1", cartes: [{ ticket: 14 }] },
    ]);
    assert.equal(sansLesValidees(colonnes, new Set()), colonnes);
  });
});
