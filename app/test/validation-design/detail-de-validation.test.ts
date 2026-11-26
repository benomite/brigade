// Le détail en grand d'une carte « Validate its screen » (ticket 3212) : un clic sur la carte, ou sur une capture, l'ouvre
// par-dessus l'app — la question, l'avant et l'après côte à côte, le lien de la PR. Chaque capture se zoome (molette,
// pincement, boutons) et se glisse, et l'autre la suit au même endroit ; « One over the other » les pose l'une sur l'autre et
// bascule sur place ; « Full size » en ouvre une seule. Ses deux gestes sont ceux de la carte : fait, le détail se ferme et la
// carte quitte TODO. Plusieurs cartes : « Next validation » ouvre la suivante. Sur le téléphone, le même détail, ses boutons
// en 44 px. Le zoom se lit d'abord en lui-même (`zoomer`, `deplacer`), puis la vue est jouée telle qu'elle est, devant un faux
// document et un faux pont (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE, holdFacts, type Dessinable, type Facts } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projects/projects.ts";
import type { Terminal } from "../../src/terminaux.ts";
import { validationDuCorps } from "../../src/vue/validation-design/validation-design-github.ts";
import {
  AJUSTER,
  SIDE_A_SIDE,
  REQUEST,
  deplacer,
  ECHELLE_MAX,
  ENTIERE,
  FAIT,
  SCREEN_N_SUR,
  SCREEN_PRECEDENT,
  SCREEN_SUIVANT,
  FERMER,
  SHOW,
  PLEINE_TAILLE,
  RETOUR,
  SANS_RESUME,
  SUIVANTE,
  SUPERPOSER,
  transformDe,
  ZOOMER,
  zoomer,
} from "../../src/vue/validation-design/detail-de-validation.js";
import { CONFIRMATION_MS, RENVOYE, RENVOYER, VALIDE, VALIDER } from "../../src/vue/validation-design/validation-design.js";
import { cardDuTicket, Faux, FauxScreen, type Jouee, jouerLaVue, type Answers, repos } from "../aides/fausse-vue.ts";

const A = "2026-11-11T12:04:12.000Z";
const REPOSITORY = "chef/parade";
const SHA = "3f9c2a1b7d4e5f60718293a4b5c6d7e8f9012345";
const question = (ticket: number, pr: number) => `Does the screen of #${ticket} look right? Validate it and PR #${pr} is merged; send it back with what to change and a cook takes it up again.`;
const corps = (ticket: number, pr: number, brief: readonly string[] = []) =>
  [
    `<!-- brigade:validation-design pr=${pr} ticket=${ticket} sha=${SHA} -->`,
    ...brief,
    `| ![rail — avant](https://github.com/${REPOSITORY}/blob/${SHA}/docs/captures/${ticket}/rail-avant.png?raw=true) | ![rail — après](https://github.com/${REPOSITORY}/blob/${SHA}/docs/captures/${ticket}/rail-apres.png?raw=true) |`,
  ].join("\n");
const wait = (card: number, ticket: number, pr: number, brief: readonly string[] = []) => ({
  ticket: card,
  titre: "Validate its screen",
  url: `https://github.com/${REPOSITORY}/issues/${card}`,
  chef: { sorte: "design-validation", texte: `${question(ticket, pr)}\n\nPull request: https://github.com/${REPOSITORY}/pull/${pr}`, design: validationDuCorps(REPOSITORY, corps(ticket, pr, brief)) },
});
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };
const IMAGE = { image: "data:image/png;base64,iVBORw0KGgo=" };

const demarrage = (phone: boolean) => () => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  ...(phone ? { telephone: { github: { compte: "chef" } } } : {}),
});

// Une carte (#61, la PR #60 de #58), ou deux (et #65, la PR #64 de #59).
const facts = (deux: boolean, brief: readonly string[] = []): Facts => {
  const awaiting = [wait(61, 58, 60, brief), ...(deux ? [wait(65, 59, 64)] : [])];
  return {
    etat: "ouverte",
    lu: "2026-11-11T12:04:11.000Z",
    dernierTick: "2026-11-11T12:04:11.000Z",
    compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: awaiting.length, livres24h: 0 },
    dernierEvenement: null,
    rail: [],
    cooks: [],
    attend: awaiting,
  } as unknown as Facts;
};
const dessinable = (deux: boolean, brief: readonly string[] = []): Dessinable => holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts(deux, brief)) }] });
function lire(vue: Jouee, deux: boolean, brief: readonly string[] = []): void {
  const demandes = vue.appels.filter(({ geste: action }) => action === "faits" || action === "relireBox");
  vue.dire("surFaits", { ...dessinable(deux, brief), demande: demandes.at(-1)?.args[0] as number });
}

// La question telle que la carte la dit : sa PR par son ticket (ticket 3716).
const questionDite = (ticket: number, pr: number) => question(ticket, pr).replace(`PR #${pr}`, `the PR of #${ticket}`);
const laCard = (ou: Faux) => ou.dessous("section").find(({ className }) => className.includes("carte-validation")) ?? assert.fail("pas de carte de validation");
const button = (ou: Faux, libelle: string) => ou.dessous("button").find(({ textContent }) => textContent === libelle) ?? assert.fail(`pas de bouton « ${libelle} »`);
const sans = (ou: Faux, libelle: string) => assert.ok(!ou.dessous("button").some(({ textContent }) => textContent === libelle), `pas de « ${libelle} »`);
const detail = (vue: Jouee) => vue.element("detail-de-validation");
const images = (ou: Faux) => ou.dessous("img") as unknown as Array<Faux & { alt: string; src: string }>;
const transforms = (ou: Faux) => images(ou).map((image) => image.style.getPropertyValue("transform"));
const cadres = (ou: Faux) => ou.dessous("div").filter(({ className }) => className === "cadre");

// Le large : le projet ouvert, la carte dans TODO ; un clic sur sa capture avant ouvre le détail.
async function ouvrirLarge(deux = false, answers: Answers = {}, brief: readonly string[] = []): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage: demarrage(false), espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }], lireCapture: () => IMAGE, ...answers } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  lire(vue, deux, brief);
  await repos();
  const card = laCard(cardDuTicket(vue, 61) ?? assert.fail("pas de carte dans TODO"));
  assert.equal(detail(vue).hidden, true, "fermé avant le clic");
  card.declencher("click", { target: images(card)[0] ?? assert.fail("pas de capture") });
  await repos();
  return vue;
}
// Le téléphone : la carte ouverte depuis la liste, puis un clic sur elle.
async function ouvrirAuPhone(deux = false, answers: Answers = {}, brief: readonly string[] = []): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage: demarrage(true), espace: () => [], machines: () => [], lireCapture: () => IMAGE, ...answers } as never, { ecran: new FauxScreen(true) });
  lire(vue, deux, brief);
  await repos();
  (vue.element("cartes-du-chef").dessous("button").find(({ className }) => className === "carte-a-ouvrir") ?? assert.fail("pas de carte dans la liste")).click();
  await repos();
  const card = laCard(vue.element("cartes-du-chef"));
  card.declencher("click", { target: card });
  await repos();
  return vue;
}

// Le brief que la pass écrit dans le corps de la carte (runtime/src/validation-design/brief.ts, `lignesDuBrief`).
const DEMANDEE = "Show the count on the rail — The chef cannot tell how many tickets wait.";
const BRIEF = ["### What was asked", "", DEMANDEE, "", "### What was done", "", "- the rail shows the count", "- cards show their question on one line", ""];
const CSS = readFileSync(new URL("../../src/vue/validation-design/validation-design.css", import.meta.url), "utf8");
const briefDe = (ou: Faux) => ou.dessous("section").find(({ className }) => className === "brief-du-detail") ?? assert.fail("pas de brief");

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

for (const [screen, ouvrir] of [
  ["sur un écran large, depuis TODO", ouvrirLarge],
  ["sur le téléphone, depuis la carte ouverte", ouvrirAuPhone],
] as const) {
  describe(`le détail en grand, ${screen}`, () => {
    test("un clic sur la carte l'ouvre : la question, l'avant et l'après côte à côte, le lien de la PR et les deux gestes", async () => {
      const vue = await ouvrir();
      const ici = detail(vue);
      assert.equal(ici.hidden, false);
      assert.ok(ici.dessous("p").some(({ textContent }) => textContent === questionDite(58, 60)));
      assert.deepEqual(images(ici).map(({ alt }) => alt), ["rail — before", "rail — after"]);
      assert.ok(images(ici).every(({ src }) => src === IMAGE.image));
      assert.equal(cadres(ici).length, 2, "côte à côte, chacune son cadre");
      button(ici, "PR of #58").click();
      assert.deepEqual(vue.dernier("ouvrirPr"), ["parade", 61]);
      assert.equal(button(ici, VALIDER).className, "recommande");
      assert.equal(button(ici, RENVOYER).disabled, true);
      sans(ici, SUIVANTE(65));
      assert.equal(vue.element("fiche").hidden, true, "la fiche du ticket ne s'ouvre pas");
    });

    test("le brief en tête, au-dessus des captures (ticket 3330) : ce qui était demandé et ce qui a été fait, un point par ligne ; le lien de la PR et les gestes restent", async () => {
      const vue = await ouvrir(false, {}, BRIEF);
      const ici = detail(vue);
      const racine = ici.dessous("div").find(({ className }) => className === "detail-de-validation") ?? assert.fail("pas de détail");
      const ordre = racine.children.map(({ className }) => className);
      assert.ok(ordre.indexOf("brief-du-detail") !== -1 && ordre.indexOf("brief-du-detail") < ordre.indexOf("ecrans-du-detail"), ordre.join(", "));
      const brief = briefDe(ici);
      assert.deepEqual(brief.dessous("h3").map(({ textContent }) => textContent), [REQUEST, FAIT]);
      assert.deepEqual(brief.dessous("p").map(({ textContent }) => textContent), [DEMANDEE]);
      assert.deepEqual(brief.dessous("li").map(({ textContent }) => textContent), ["the rail shows the count", "cards show their question on one line"]);
      assert.equal(brief.dessous("p").some(({ textContent }) => textContent === SANS_RESUME), false);
      button(ici, "PR of #58").click();
      assert.deepEqual(vue.dernier("ouvrirPr"), ["parade", 61]);
      button(ici, VALIDER);
      button(ici, RENVOYER);
      assert.equal(images(ici).length, 2);
    });

    test("une carte sans résumé de ce qui a été fait — posée avant le ticket 3330 — le dit, et montre encore ce qui était demandé", async () => {
      const vue = await ouvrir(false, {}, ["Ticket: #58 — Export the journal as CSV", "Pull request: https://github.com/chef/parade/pull/60"]);
      const brief = briefDe(detail(vue));
      assert.deepEqual(brief.dessous("h3").map(({ textContent }) => textContent), [REQUEST, FAIT]);
      assert.deepEqual(brief.dessous("p").map(({ textContent }) => textContent), ["Export the journal as CSV", SANS_RESUME]);
      assert.deepEqual(brief.dessous("li"), []);
    });

    test("ce qui était demandé est coupé à deux lignes à l'affichage, et se lit en entier au survol", async () => {
      const long = `Export the journal as CSV — ${"the chef copies the journal by hand every week ".repeat(6).trim()}`;
      const vue = await ouvrir(false, {}, ["### What was asked", "", long, "", "### What was done", "", "- the rail shows the count", ""]);
      const demandee = briefDe(detail(vue)).dessous("p").find(({ className }) => className === "demande-du-ticket") ?? assert.fail("pas de demande");
      assert.equal(demandee.textContent, long);
      assert.equal(demandee.title, long);
      const regle = /#detail-de-validation p\.demande-du-ticket \{([^}]*)\}/.exec(CSS)?.[1] ?? assert.fail("pas de règle pour la demande");
      assert.match(regle, /-webkit-line-clamp: 2;/);
      assert.match(regle, /overflow: hidden;/);
    });

    test("zoomer l'une zoome l'autre au même endroit — boutons, molette, glisser — ; « Fit » rend l'image entière", async () => {
      const vue = await ouvrir();
      const ici = detail(vue);
      const [avant, apres] = transforms(ici);
      assert.equal(avant, transformDe(ENTIERE));
      assert.equal(apres, avant);
      button(ici, ZOOMER).click();
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
      button(ici, AJUSTER).click();
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
      button(detail(vue), SUPERPOSER).click();
      const ici = detail(vue);
      assert.equal(cadres(ici).length, 1, "un seul cadre");
      button(ici, ZOOMER).click();
      const zoom = transforms(ici)[0];
      assert.deepEqual(images(ici).map(({ hidden }) => hidden), [false, true], "l'avant d'abord");
      const bascule = button(ici, SHOW("apres"));
      bascule.click();
      assert.deepEqual(images(ici).map(({ hidden }) => hidden), [true, false], "l'après, au même endroit");
      assert.equal(bascule.textContent, SHOW("avant"));
      assert.deepEqual(transforms(ici), [zoom, zoom]);
      bascule.click();
      assert.deepEqual(images(ici).map(({ hidden }) => hidden), [false, true]);
      button(detail(vue), SIDE_A_SIDE).click();
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
      button(detail(vue), RETOUR).click();
      assert.equal(images(detail(vue)).length, 2);
      detail(vue).declencher("keydown", { key: "Escape" });
      assert.equal(detail(vue).hidden, true, "puis Échap le ferme");
    });

    test("« Close » le ferme, et le commentaire tapé dans le détail reste celui de la carte", async () => {
      const vue = await ouvrir();
      const champ = detail(vue).dessous("textarea")[0] ?? assert.fail("pas de champ");
      champ.value = "The button is cut off.";
      champ.declencher("input");
      assert.equal(button(detail(vue), RENVOYER).disabled, false);
      button(detail(vue), FERMER).click();
      assert.equal(detail(vue).hidden, true);
      const card = laCard(screen.startsWith("sur le téléphone") ? vue.element("cartes-du-chef") : (cardDuTicket(vue, 61) ?? assert.fail("pas de carte")));
      assert.equal(card.dessous("textarea")[0]?.value, "The button is cut off.");
    });

    test("« Validate » depuis le détail : le geste part, le détail le confirme, puis se ferme et la carte quitte TODO", async (t) => {
      t.mock.timers.enable({ apis: ["setTimeout"] });
      const vue = await ouvrir(false, { gesteDeValidation: () => ({ fait: "chef/parade#60 validated" }) });
      button(detail(vue), VALIDER).click();
      await repos();
      assert.deepEqual(vue.dernier("gesteDeValidation"), ["parade", 61, { geste: "valider" }]);
      assert.equal(detail(vue).hidden, false, "le détail reste, avec sa confirmation");
      assert.equal(button(detail(vue), VALIDE).disabled, true);
      t.mock.timers.tick(CONFIRMATION_MS);
      await repos();
      assert.equal(detail(vue).hidden, true);
      assert.equal(cardDuTicket(vue, 61), undefined);
      assert.ok(!vue.element("cartes-du-chef").dessous("button").some(({ className }) => className === "carte-a-ouvrir"));
    });

    test("« Send back to the kitchen » depuis le détail envoie le commentaire ; refusé, le détail reste et dit pourquoi", async (t) => {
      t.mock.timers.enable({ apis: ["setTimeout"] });
      const refuse = await ouvrir(false, { gesteDeValidation: () => ({ refus: "nothing was done: the head of PR #60 moved since card #61", detail: "brigade : moved" }) });
      const champ = detail(refuse).dessous("textarea")[0] ?? assert.fail("pas de champ");
      champ.value = "The button is cut off.";
      champ.declencher("input");
      button(detail(refuse), RENVOYER).click();
      await repos();
      assert.deepEqual(refuse.dernier("gesteDeValidation"), ["parade", 61, { geste: "renvoyer", commentaire: "The button is cut off." }]);
      assert.equal(detail(refuse).hidden, false);
      assert.ok(detail(refuse).dessous("p").some(({ textContent }) => textContent.includes("the head of PR #60 moved since card #61")));
      assert.equal(detail(refuse).dessous("textarea")[0]?.value, "The button is cut off.");

      const fait = await ouvrir(false, { gesteDeValidation: () => ({ fait: "chef/parade#60 sent back" }) });
      const saisie = detail(fait).dessous("textarea")[0] ?? assert.fail("pas de champ");
      saisie.value = "The button is cut off.";
      saisie.declencher("input");
      button(detail(fait), RENVOYER).click();
      await repos();
      assert.equal(button(detail(fait), RENVOYE).disabled, true, "« back to the kitchen ✓ » avant de partir");
      t.mock.timers.tick(CONFIRMATION_MS);
      await repos();
      assert.equal(detail(fait).hidden, true);
      assert.equal(cardDuTicket(fait, 61), undefined);
    });

    test("plusieurs écrans (ticket 3350) : un seul à la fois, « Screen 2 of 3 », précédent et suivant au clic et aux flèches ; le brief, les captures et les gestes restent", async () => {
      const autre = (name: string) => `| ![${name} — avant](https://github.com/${REPOSITORY}/blob/${SHA}/docs/captures/58/${name}-avant.png?raw=true) | ![${name} — après](https://github.com/${REPOSITORY}/blob/${SHA}/docs/captures/58/${name}-apres.png?raw=true) |`;
      const vue = await ouvrir(false, {}, [...BRIEF, autre("todo"), autre("rail-bis")]);
      const ici = detail(vue);
      const rang = () => ici.dessous("span").find(({ className }) => className === "rang-de-l-ecran")?.textContent;
      const nomsDesScreens = () => ici.dessous("section").filter(({ className }) => className === "ecran-du-detail").map(({ ariaLabel }) => ariaLabel);
      assert.equal(rang(), SCREEN_N_SUR(0, 3));
      assert.equal(rang(), "Screen 1 of 3");
      assert.equal(nomsDesScreens().length, 1, "un seul écran posé");
      assert.equal(button(ici, SCREEN_PRECEDENT).disabled, true);
      button(ici, SCREEN_SUIVANT).click();
      assert.equal(rang(), "Screen 2 of 3");
      assert.equal(nomsDesScreens().length, 1);
      const deuxieme = nomsDesScreens()[0];
      ici.declencher("keydown", { key: "ArrowRight" });
      assert.equal(rang(), "Screen 3 of 3");
      assert.notEqual(nomsDesScreens()[0], deuxieme);
      assert.equal(button(ici, SCREEN_SUIVANT).disabled, true);
      ici.declencher("keydown", { key: "ArrowRight" });
      assert.equal(rang(), "Screen 3 of 3", "pas au-delà du dernier");
      ici.declencher("keydown", { key: "ArrowLeft" });
      assert.equal(rang(), "Screen 2 of 3");
      assert.equal(nomsDesScreens()[0], deuxieme);
      ici.declencher("keydown", { key: "ArrowLeft", target: ici.dessous("textarea")[0] });
      assert.equal(rang(), "Screen 2 of 3", "dans le champ du commentaire, les flèches ne changent pas d'écran");
      assert.equal(images(ici).length, 2);
      assert.ok(briefDe(ici));
      button(ici, VALIDER);
      button(ici, RENVOYER);
      button(ici, "PR of #58");
    });

    test("un seul écran : ni indicateur ni boutons de passage", async () => {
      const ici = detail(await ouvrir());
      sans(ici, SCREEN_SUIVANT);
      assert.equal(ici.dessous("span").some(({ className }) => className === "rang-de-l-ecran"), false);
    });

    test("deux cartes attendent : « Next validation » ouvre la suivante sans repasser par TODO, puis revient à la première", async () => {
      const vue = await ouvrir(true);
      button(detail(vue), SUIVANTE(65)).click();
      assert.ok(detail(vue).dessous("p").some(({ textContent }) => textContent === questionDite(59, 64)));
      button(detail(vue), "PR of #59").click();
      assert.deepEqual(vue.dernier("ouvrirPr"), ["parade", 65]);
      button(detail(vue), SUIVANTE(61)).click();
      assert.ok(detail(vue).dessous("p").some(({ textContent }) => textContent === questionDite(58, 60)));
    });
  });
}

describe("la frappe dans le détail (ticket 3348)", () => {
  test("le rail redessiné pendant que le chef tape dans le détail ne prend pas le clavier à son champ pour le rendre à celui de la carte cachée", async () => {
    const vue = await ouvrirLarge();
    const champ = detail(vue).dessous("textarea")[0] ?? assert.fail("pas de champ");
    (document as unknown as { activeElement: unknown }).activeElement = champ;
    try {
      lire(vue, false, []);
      await repos();
      const card = laCard(cardDuTicket(vue, 61) ?? assert.fail("pas de carte dans TODO"));
      assert.equal(card.dessous("textarea")[0]?.focalise, 0, "la carte cachée n'a pas pris le clavier");
      champ.value = "The button is cut off.";
      champ.declencher("input");
      (document as unknown as { activeElement: unknown }).activeElement = undefined;
      button(detail(vue), FERMER).click();
      assert.equal(laCard(cardDuTicket(vue, 61) ?? assert.fail("pas de carte")).dessous("textarea")[0]?.value, "The button is cut off.");
    } finally {
      (document as unknown as { activeElement: unknown }).activeElement = undefined;
    }
  });
});

describe("sur la carte", () => {
  test("un clic sur son champ ou ses boutons garde son geste et n'ouvre pas le détail", async () => {
    const vue = await jouerLaVue({ demarrage: demarrage(false), espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }], lireCapture: () => IMAGE } as never);
    (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    lire(vue, false);
    await repos();
    const card = laCard(cardDuTicket(vue, 61) ?? assert.fail("pas de carte"));
    card.declencher("click", { target: card.dessous("textarea")[0] ?? assert.fail("pas de champ") });
    card.declencher("click", { target: button(card, "PR of #58") });
    assert.equal(detail(vue).hidden, true);
    card.dessous("div").find(({ className }) => className === "captures-de-validation")?.declencher("keydown", { key: "Enter" });
    assert.equal(detail(vue).hidden, false, "Entrée sur ses captures l'ouvre");
  });

  test("sur le téléphone, ses gestes sont à la taille du pouce", async () => {
    const vue = await ouvrirAuPhone();
    assert.equal(button(detail(vue), VALIDER).dataset.taille, "grand");
    assert.equal(button(detail(vue), RENVOYER).dataset.taille, "grand");
  });
});
