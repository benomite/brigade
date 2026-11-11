// Le détail en grand d'une carte « Validate its screen » (ticket 3212) : un clic sur la carte, ou sur une capture, l'ouvre
// par-dessus l'app — la question, l'avant et l'après côte à côte, le lien de la PR. Chaque capture se zoome (molette,
// pincement, boutons) et se glisse, et l'autre la suit au même endroit ; « One over the other » les pose l'une sur l'autre et
// bascule sur place ; « Full size » en ouvre une seule. Ses deux gestes sont ceux de la carte : fait, le détail se ferme et la
// carte quitte TODO. Plusieurs cartes : « Next validation » ouvre la suivante. Sur le téléphone, le même détail, ses boutons
// en 44 px. Le zoom se lit d'abord en lui-même (`zoomer`, `deplacer`), puis la vue est jouée telle qu'elle est, devant un faux
// document et un faux pont (aides/fausse-vue.ts).
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
import {
  AJUSTER,
  COTE_A_COTE,
  deplacer,
  ECHELLE_MAX,
  ENTIERE,
  FERMER,
  MONTRER,
  PLEINE_TAILLE,
  RETOUR,
  SUIVANTE,
  SUPERPOSER,
  transformDe,
  ZOOMER,
  zoomer,
} from "../../src/vue/validation-design/detail-de-validation.js";
import { RENVOYER, VALIDER } from "../../src/vue/validation-design/validation-design.js";
import { carteDuTicket, Faux, FauxEcran, type Jouee, jouerLaVue, type Reponses, repos } from "../aides/fausse-vue.ts";

const A = "2026-11-11T12:04:12.000Z";
const DEPOT = "chef/parade";
const SHA = "3f9c2a1b7d4e5f60718293a4b5c6d7e8f9012345";
const question = (ticket: number, pr: number) => `Does the screen of #${ticket} look right? Validate it and PR #${pr} is merged; send it back with what to change and a cook takes it up again.`;
const corps = (ticket: number, pr: number) =>
  [
    `<!-- brigade:validation-design pr=${pr} ticket=${ticket} sha=${SHA} -->`,
    `| ![rail — avant](https://github.com/${DEPOT}/blob/${SHA}/docs/captures/${ticket}/rail-avant.png?raw=true) | ![rail — après](https://github.com/${DEPOT}/blob/${SHA}/docs/captures/${ticket}/rail-apres.png?raw=true) |`,
  ].join("\n");
const attente = (carte: number, ticket: number, pr: number) => ({
  ticket: carte,
  titre: "Validate its screen",
  url: `https://github.com/${DEPOT}/issues/${carte}`,
  chef: { sorte: "design-validation", texte: `${question(ticket, pr)}\n\nPull request: https://github.com/${DEPOT}/pull/${pr}`, design: validationDuCorps(DEPOT, corps(ticket, pr)) },
});
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

// Une carte (#61, la PR #60 de #58), ou deux (et #65, la PR #64 de #59).
const faits = (deux: boolean): Faits => {
  const attend = [attente(61, 58, 60), ...(deux ? [attente(65, 59, 64)] : [])];
  return {
    etat: "ouverte",
    lu: "2026-11-11T12:04:11.000Z",
    dernierTick: "2026-11-11T12:04:11.000Z",
    compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: attend.length, livres24h: 0 },
    dernierEvenement: null,
    rail: [],
    cooks: [],
    attend,
  } as unknown as Faits;
};
const dessinable = (deux: boolean): Dessinable => tenirFaits(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits(deux)) }] });
function lire(vue: Jouee, deux: boolean): void {
  const demandes = vue.appels.filter(({ geste }) => geste === "faits" || geste === "relireBox");
  vue.dire("surFaits", { ...dessinable(deux), demande: demandes.at(-1)?.args[0] as number });
}

const laCarte = (ou: Faux) => ou.dessous("section").find(({ className }) => className.includes("carte-validation")) ?? assert.fail("pas de carte de validation");
const bouton = (ou: Faux, libelle: string) => ou.dessous("button").find(({ textContent }) => textContent === libelle) ?? assert.fail(`pas de bouton « ${libelle} »`);
const sans = (ou: Faux, libelle: string) => assert.ok(!ou.dessous("button").some(({ textContent }) => textContent === libelle), `pas de « ${libelle} »`);
const detail = (vue: Jouee) => vue.element("detail-de-validation");
const images = (ou: Faux) => ou.dessous("img") as unknown as Array<Faux & { alt: string; src: string }>;
const transforms = (ou: Faux) => images(ou).map((image) => image.style.getPropertyValue("transform"));
const cadres = (ou: Faux) => ou.dessous("div").filter(({ className }) => className === "cadre");

// Le large : le projet ouvert, la carte dans TODO ; un clic sur sa capture avant ouvre le détail.
async function ouvrirLarge(deux = false, reponses: Reponses = {}): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage: demarrage(false), espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }], lireCapture: () => IMAGE, ...reponses } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  lire(vue, deux);
  await repos();
  const carte = laCarte(carteDuTicket(vue, 61) ?? assert.fail("pas de carte dans TODO"));
  assert.equal(detail(vue).hidden, true, "fermé avant le clic");
  carte.declencher("click", { target: images(carte)[0] ?? assert.fail("pas de capture") });
  await repos();
  return vue;
}
// Le téléphone : la carte ouverte depuis la liste, puis un clic sur elle.
async function ouvrirAuTelephone(deux = false, reponses: Reponses = {}): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage: demarrage(true), espace: () => [], machines: () => [], lireCapture: () => IMAGE, ...reponses } as never, { ecran: new FauxEcran(true) });
  lire(vue, deux);
  await repos();
  (vue.element("cartes-du-chef").dessous("button").find(({ className }) => className === "carte-a-ouvrir") ?? assert.fail("pas de carte dans la liste")).click();
  await repos();
  const carte = laCarte(vue.element("cartes-du-chef"));
  carte.declencher("click", { target: carte });
  await repos();
  return vue;
}

describe("le zoom d'une capture", () => {
  test("zoomer autour d'un point garde sous lui le même point de l'image ; l'échelle reste entre 1 et le plafond", () => {
    const vue = zoomer(ENTIERE, 2, 0.75, 0.25);
    assert.equal(vue.echelle, 2);
    // Le point du cadre (0.75, 0.25) montrait l'image en (0.75, 0.25) : il la montre encore.
    assert.equal(vue.x + (0.75 - 0.5) / vue.echelle, 0.75);
    assert.equal(vue.y + (0.25 - 0.5) / vue.echelle, 0.25);
    assert.deepEqual(zoomer(ENTIERE, 0.5), ENTIERE, "pas plus petit que l'image entière");
    assert.equal(zoomer(ENTIERE, 100).echelle, ECHELLE_MAX);
  });

  test("glisser suit le doigt, sans sortir de l'image ; la transformation amène le point au centre", () => {
    const zoomee = { echelle: 2, x: 0.5, y: 0.5 };
    assert.deepEqual(deplacer(zoomee, 0.1, -0.1), { echelle: 2, x: 0.45, y: 0.55 });
    assert.deepEqual(deplacer(zoomee, 5, 5), { echelle: 2, x: 0.25, y: 0.25 }, "le cadre reste dans l'image");
    assert.deepEqual(deplacer(ENTIERE, 0.3, 0.3), ENTIERE, "l'image entière ne glisse pas");
    assert.equal(transformDe({ echelle: 2, x: 0.25, y: 0.75 }), "scale(2) translate(25%, -25%)");
  });
});

for (const [ecran, ouvrir] of [
  ["sur un écran large, depuis TODO", ouvrirLarge],
  ["sur le téléphone, depuis la carte ouverte", ouvrirAuTelephone],
] as const) {
  describe(`le détail en grand, ${ecran}`, () => {
    test("un clic sur la carte l'ouvre : la question, l'avant et l'après côte à côte, le lien de la PR et les deux gestes", async () => {
      const vue = await ouvrir();
      const ici = detail(vue);
      assert.equal(ici.hidden, false);
      assert.ok(ici.dessous("p").some(({ textContent }) => textContent === question(58, 60)));
      assert.deepEqual(images(ici).map(({ alt }) => alt), ["rail — before", "rail — after"]);
      assert.ok(images(ici).every(({ src }) => src === IMAGE.image));
      assert.equal(cadres(ici).length, 2, "côte à côte, chacune son cadre");
      bouton(ici, "Pull request #60").click();
      assert.deepEqual(vue.dernier("ouvrirPr"), ["parade", 61]);
      assert.equal(bouton(ici, VALIDER).className, "recommande");
      assert.equal(bouton(ici, RENVOYER).disabled, true);
      sans(ici, SUIVANTE(65));
      assert.equal(vue.element("fiche").hidden, true, "la fiche du ticket ne s'ouvre pas");
    });

    test("zoomer l'une zoome l'autre au même endroit — boutons, molette, glisser — ; « Fit » rend l'image entière", async () => {
      const vue = await ouvrir();
      const ici = detail(vue);
      const [avant, apres] = transforms(ici);
      assert.equal(avant, transformDe(ENTIERE));
      assert.equal(apres, avant);
      bouton(ici, ZOOMER).click();
      const zoomees = transforms(ici);
      assert.notEqual(zoomees[0], transformDe(ENTIERE));
      assert.equal(zoomees[1], zoomees[0]);
      // La molette sur l'après, en bas à droite : l'avant suit.
      const [cadreAvant, cadreApres] = cadres(ici);
      for (const cadre of [cadreAvant, cadreApres]) if (cadre !== undefined) cadre.boite = { left: 0, top: 0, width: 400, height: 300 };
      cadreApres?.declencher("wheel", { clientX: 300, clientY: 225, deltaY: -300 });
      const molette = transforms(ici);
      assert.notDeepEqual(molette, zoomees);
      assert.equal(molette[0], molette[1]);
      // Glisser l'avant de 40 px vers la gauche : l'après glisse avec.
      cadreAvant?.declencher("pointerdown", { pointerId: 1, clientX: 200, clientY: 150 });
      cadreAvant?.declencher("pointermove", { pointerId: 1, clientX: 160, clientY: 150 });
      cadreAvant?.declencher("pointerup", { pointerId: 1 });
      const glissees = transforms(ici);
      assert.notDeepEqual(glissees, molette);
      assert.equal(glissees[0], glissees[1]);
      bouton(ici, AJUSTER).click();
      assert.deepEqual(transforms(ici), [transformDe(ENTIERE), transformDe(ENTIERE)]);
    });

    test("deux doigts qui s'écartent zooment les deux captures au même endroit", async () => {
      const vue = await ouvrir();
      const ici = detail(vue);
      const [cadre] = cadres(ici);
      if (cadre === undefined) return assert.fail("pas de cadre");
      cadre.boite = { left: 0, top: 0, width: 400, height: 300 };
      cadre.declencher("pointerdown", { pointerId: 1, clientX: 150, clientY: 150 });
      cadre.declencher("pointerdown", { pointerId: 2, clientX: 250, clientY: 150 });
      cadre.declencher("pointermove", { pointerId: 2, clientX: 350, clientY: 150 });
      const [avant, apres] = transforms(ici);
      assert.match(avant ?? "", /^scale\(2\) /);
      assert.equal(apres, avant);
    });

    test("« One over the other » les pose l'une sur l'autre ; la bascule montre l'autre sur place, zoomée de même", async () => {
      const vue = await ouvrir();
      bouton(detail(vue), SUPERPOSER).click();
      const ici = detail(vue);
      assert.equal(cadres(ici).length, 1, "un seul cadre");
      bouton(ici, ZOOMER).click();
      const zoom = transforms(ici)[0];
      assert.deepEqual(images(ici).map(({ hidden }) => hidden), [false, true], "l'avant d'abord");
      const bascule = bouton(ici, MONTRER("apres"));
      bascule.click();
      assert.deepEqual(images(ici).map(({ hidden }) => hidden), [true, false], "l'après, au même endroit");
      assert.equal(bascule.textContent, MONTRER("avant"));
      assert.deepEqual(transforms(ici), [zoom, zoom]);
      bascule.click();
      assert.deepEqual(images(ici).map(({ hidden }) => hidden), [false, true]);
      bouton(detail(vue), COTE_A_COTE).click();
      assert.equal(cadres(detail(vue)).length, 2);
    });

    test("« Full size » ouvre une capture seule ; Échap, ou son retour, rend l'avant et l'après", async () => {
      const vue = await ouvrir();
      const pleines = detail(vue).dessous("button").filter(({ textContent }) => textContent === PLEINE_TAILLE);
      assert.equal(pleines.length, 2);
      pleines[1]?.click();
      assert.deepEqual(images(detail(vue)).map(({ alt }) => alt), ["rail — after"]);
      detail(vue).declencher("keydown", { key: "Escape" });
      assert.equal(detail(vue).hidden, false, "Échap rend d'abord les deux");
      assert.equal(images(detail(vue)).length, 2);
      detail(vue).dessous("button").find(({ textContent }) => textContent === PLEINE_TAILLE)?.click();
      bouton(detail(vue), RETOUR).click();
      assert.equal(images(detail(vue)).length, 2);
      detail(vue).declencher("keydown", { key: "Escape" });
      assert.equal(detail(vue).hidden, true, "puis Échap le ferme");
    });

    test("« Close » le ferme, et le commentaire tapé dans le détail reste celui de la carte", async () => {
      const vue = await ouvrir();
      const champ = detail(vue).dessous("textarea")[0] ?? assert.fail("pas de champ");
      champ.value = "The button is cut off.";
      champ.declencher("input");
      assert.equal(bouton(detail(vue), RENVOYER).disabled, false);
      bouton(detail(vue), FERMER).click();
      assert.equal(detail(vue).hidden, true);
      const carte = laCarte(ecran.startsWith("sur le téléphone") ? vue.element("cartes-du-chef") : (carteDuTicket(vue, 61) ?? assert.fail("pas de carte")));
      assert.equal(carte.dessous("textarea")[0]?.value, "The button is cut off.");
    });

    test("« Validate » depuis le détail : le geste part, le détail se ferme et la carte quitte TODO", async () => {
      const vue = await ouvrir(false, { gesteDeValidation: () => ({ fait: "chef/parade#60 validated" }) });
      bouton(detail(vue), VALIDER).click();
      await repos();
      assert.deepEqual(vue.dernier("gesteDeValidation"), ["parade", 61, { geste: "valider" }]);
      assert.equal(detail(vue).hidden, true);
      assert.equal(carteDuTicket(vue, 61), undefined);
      assert.ok(!vue.element("cartes-du-chef").dessous("button").some(({ className }) => className === "carte-a-ouvrir"));
    });

    test("« Send back to the kitchen » depuis le détail envoie le commentaire ; refusé, le détail reste et dit pourquoi", async () => {
      const refuse = await ouvrir(false, { gesteDeValidation: () => ({ refus: "nothing was done: the head of PR #60 moved since card #61", detail: "brigade : moved" }) });
      const champ = detail(refuse).dessous("textarea")[0] ?? assert.fail("pas de champ");
      champ.value = "The button is cut off.";
      champ.declencher("input");
      bouton(detail(refuse), RENVOYER).click();
      await repos();
      assert.deepEqual(refuse.dernier("gesteDeValidation"), ["parade", 61, { geste: "renvoyer", commentaire: "The button is cut off." }]);
      assert.equal(detail(refuse).hidden, false);
      assert.ok(detail(refuse).dessous("p").some(({ textContent }) => textContent.includes("the head of PR #60 moved since card #61")));
      assert.equal(detail(refuse).dessous("textarea")[0]?.value, "The button is cut off.");

      const fait = await ouvrir(false, { gesteDeValidation: () => ({ fait: "chef/parade#60 sent back" }) });
      const saisie = detail(fait).dessous("textarea")[0] ?? assert.fail("pas de champ");
      saisie.value = "The button is cut off.";
      saisie.declencher("input");
      bouton(detail(fait), RENVOYER).click();
      await repos();
      assert.equal(detail(fait).hidden, true);
      assert.equal(carteDuTicket(fait, 61), undefined);
    });

    test("deux cartes attendent : « Next validation » ouvre la suivante sans repasser par TODO, puis revient à la première", async () => {
      const vue = await ouvrir(true);
      bouton(detail(vue), SUIVANTE(65)).click();
      assert.ok(detail(vue).dessous("p").some(({ textContent }) => textContent === question(59, 64)));
      bouton(detail(vue), "Pull request #64").click();
      assert.deepEqual(vue.dernier("ouvrirPr"), ["parade", 65]);
      bouton(detail(vue), SUIVANTE(61)).click();
      assert.ok(detail(vue).dessous("p").some(({ textContent }) => textContent === question(58, 60)));
    });
  });
}

describe("sur la carte", () => {
  test("un clic sur son champ ou ses boutons garde son geste et n'ouvre pas le détail", async () => {
    const vue = await jouerLaVue({ demarrage: demarrage(false), espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }], lireCapture: () => IMAGE } as never);
    (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    lire(vue, false);
    await repos();
    const carte = laCarte(carteDuTicket(vue, 61) ?? assert.fail("pas de carte"));
    carte.declencher("click", { target: carte.dessous("textarea")[0] ?? assert.fail("pas de champ") });
    carte.declencher("click", { target: bouton(carte, "Pull request #60") });
    assert.equal(detail(vue).hidden, true);
    carte.dessous("div").find(({ className }) => className === "captures-de-validation")?.declencher("keydown", { key: "Enter" });
    assert.equal(detail(vue).hidden, false, "Entrée sur ses captures l'ouvre");
  });

  test("sur le téléphone, ses gestes sont à la taille du pouce", async () => {
    const vue = await ouvrirAuTelephone();
    assert.equal(bouton(detail(vue), VALIDER).dataset.taille, "grand");
    assert.equal(bouton(detail(vue), RENVOYER).dataset.taille, "grand");
  });
});
