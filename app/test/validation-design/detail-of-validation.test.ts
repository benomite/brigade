// Le détail en grand d'une carte « Validate its screen » (ticket 3212) : un clic sur la carte, ou sur une capture, l'ouvre
// par-dessus l'app — la question, l'avant et l'après côte à côte, le lien de la PR. Chaque capture se zoome (molette,
// pincement, boutons) et se glisse, et l'autre la suit au même endroit ; « One over the other » les pose l'une sur l'autre et
// bascule sur place ; « Full size » en ouvre une seule. Ses deux gestes sont ceux de la carte : fait, le détail se ferme et la
// carte quitte TODO. Plusieurs cartes : « Next validation » ouvre la suivante. Sur le téléphone, le même détail, ses boutons
// en 44 px. Le zoom se lit d'abord en lui-même (`zoomer`, `deplacer`), puis la vue est jouée telle qu'elle est, devant un faux
// document et un faux pont (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { BANNER, holdFacts, type Drawable, type Facts } from "../../src/facts.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import type { Terminal } from "../../src/terminals.ts";
import { validationOfBody } from "../../src/vue/validation-design/validation-design-github.ts";
import {
  ADJUST,
  SIDE_A_SIDE,
  REQUEST,
  displace,
  SCALE_MAX,
  WHOLE,
  DONE,
  SCREEN_N_ON,
  SCREEN_PREVIOUS,
  SCREEN_NEXT,
  CLOSE,
  SHOW,
  FULL_SIZE,
  RETURN,
  WITHOUT_RESUME,
  NEXT,
  OVERLAY,
  transformOf,
  ZOOM_IN,
  zoomIn,
} from "../../src/vue/validation-design/detail-of-validation.js";
import { CONFIRMATION_MS, SENT_BACK, SEND_BACK, VALID, VALIDATE } from "../../src/vue/validation-design/validation-design.js";
import { cardOfTicket, Fake, FakeScreen, type Played, playTheVue, type Answers, repos } from "../helpers/false-vue.ts";

const A = "2026-11-11T12:04:12.000Z";
const REPOSITORY = "chef/parade";
const SHA = "3f9c2a1b7d4e5f60718293a4b5c6d7e8f9012345";
const question = (ticket: number, pr: number) => `Does the screen of #${ticket} look right? Validate it and PR #${pr} is merged; send it back with what to change and a cook takes it up again.`;
const body = (ticket: number, pr: number, brief: readonly string[] = []) =>
  [
    `<!-- brigade:validation-design pr=${pr} ticket=${ticket} sha=${SHA} -->`,
    ...brief,
    `| ![rail — avant](https://github.com/${REPOSITORY}/blob/${SHA}/docs/captures/${ticket}/rail-avant.png?raw=true) | ![rail — après](https://github.com/${REPOSITORY}/blob/${SHA}/docs/captures/${ticket}/rail-apres.png?raw=true) |`,
  ].join("\n");
const wait = (card: number, ticket: number, pr: number, brief: readonly string[] = []) => ({
  ticket: card,
  titre: "Validate its screen",
  url: `https://github.com/${REPOSITORY}/issues/${card}`,
  chef: { sorte: "design-validation", texte: `${question(ticket, pr)}\n\nPull request: https://github.com/${REPOSITORY}/pull/${pr}`, design: validationOfBody(REPOSITORY, body(ticket, pr, brief)) },
});
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };
const IMAGE = { image: "data:image/png;base64,iVBORw0KGgo=" };

const startup = (phone: boolean) => () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
  ...(phone ? { telephone: { github: { compte: "chef" } } } : {}),
});

// Une carte (#61, la PR #60 de #58), ou deux (et #65, la PR #64 de #59).
const facts = (two: boolean, brief: readonly string[] = []): Facts => {
  const awaiting = [wait(61, 58, 60, brief), ...(two ? [wait(65, 59, 64)] : [])];
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
const drawable = (two: boolean, brief: readonly string[] = []): Drawable => holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts(two, brief)) }] });
function read(vue: Played, two: boolean, brief: readonly string[] = []): void {
  const requests = vue.appels.filter(({ geste: action }) => action === "faits" || action === "relireBox");
  vue.dire("surFaits", { ...drawable(two, brief), demande: requests.at(-1)?.args[0] as number });
}

// La question telle que la carte la dit : sa PR par son ticket (ticket 3716).
const questionSaid = (ticket: number, pr: number) => question(ticket, pr).replace(`PR #${pr}`, `the PR of #${ticket}`);
const theCard = (or: Fake) => or.dessous("section").find(({ className }) => className.includes("carte-validation")) ?? assert.fail("pas de carte de validation");
const button = (or: Fake, wording: string) => or.dessous("button").find(({ textContent }) => textContent === wording) ?? assert.fail(`pas de bouton « ${wording} »`);
const without = (or: Fake, wording: string) => assert.ok(!or.dessous("button").some(({ textContent }) => textContent === wording), `pas de « ${wording} »`);
const detail = (vue: Played) => vue.element("detail-de-validation");
const images = (or: Fake) => or.dessous("img") as unknown as Array<Fake & { alt: string; src: string }>;
const transforms = (or: Fake) => images(or).map((image) => image.style.getPropertyValue("transform"));
const frames = (or: Fake) => or.dessous("div").filter(({ className }) => className === "cadre");

// Le large : le projet ouvert, la carte dans TODO ; un clic sur sa capture avant ouvre le détail.
async function openLarge(two = false, answers: Answers = {}, brief: readonly string[] = []): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup(false), espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }], lireCapture: () => IMAGE, ...answers } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  read(vue, two, brief);
  await repos();
  const card = theCard(cardOfTicket(vue, 61) ?? assert.fail("pas de carte dans TODO"));
  assert.equal(detail(vue).hidden, true, "fermé avant le clic");
  card.declencher("click", { target: images(card)[0] ?? assert.fail("pas de capture") });
  await repos();
  return vue;
}
// Le téléphone : la carte ouverte depuis la liste, puis un clic sur elle.
async function openAtPhone(two = false, answers: Answers = {}, brief: readonly string[] = []): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup(true), espace: () => [], machines: () => [], lireCapture: () => IMAGE, ...answers } as never, { ecran: new FakeScreen(true) });
  read(vue, two, brief);
  await repos();
  (vue.element("cartes-du-chef").dessous("button").find(({ className }) => className === "carte-a-ouvrir") ?? assert.fail("pas de carte dans la liste")).click();
  await repos();
  const card = theCard(vue.element("cartes-du-chef"));
  card.declencher("click", { target: card });
  await repos();
  return vue;
}

// Le brief que la pass écrit dans le corps de la carte (runtime/src/validation-design/brief.ts, `lignesDuBrief`).
const REQUESTED = "Show the count on the rail — The chef cannot tell how many tickets wait.";
const BRIEF = ["### What was asked", "", REQUESTED, "", "### What was done", "", "- the rail shows the count", "- cards show their question on one line", ""];
const CSS = readFileSync(new URL("../../src/vue/validation-design/validation-design.css", import.meta.url), "utf8");
const briefOf = (or: Fake) => or.dessous("section").find(({ className }) => className === "brief-du-detail") ?? assert.fail("pas de brief");

describe("le zoom d'une capture", () => {
  test("zoomer autour d'un point garde sous lui le même point de l'image ; l'échelle reste entre 1 et le plafond", () => {
    const vue = zoomIn(WHOLE, 2, 0.75, 0.25);
    assert.equal(vue.echelle, 2);
    // Le point du cadre (0.75, 0.25) montrait l'image en (0.75, 0.25) : il la montre encore.
    assert.equal(vue.x + (0.75 - 0.5) / vue.echelle, 0.75);
    assert.equal(vue.y + (0.25 - 0.5) / vue.echelle, 0.25);
    assert.deepEqual(zoomIn(WHOLE, 0.5), WHOLE, "pas plus petit que l'image entière");
    assert.equal(zoomIn(WHOLE, 100).echelle, SCALE_MAX);
  });

  test("glisser suit le doigt, sans sortir de l'image ; la transformation amène le point au centre", () => {
    const zoomee = { echelle: 2, x: 0.5, y: 0.5 };
    assert.deepEqual(displace(zoomee, 0.1, -0.1), { echelle: 2, x: 0.45, y: 0.55 });
    assert.deepEqual(displace(zoomee, 5, 5), { echelle: 2, x: 0.25, y: 0.25 }, "le cadre reste dans l'image");
    assert.deepEqual(displace(WHOLE, 0.3, 0.3), WHOLE, "l'image entière ne glisse pas");
    assert.equal(transformOf({ echelle: 2, x: 0.25, y: 0.75 }), "scale(2) translate(25%, -25%)");
  });
});

for (const [screen, open] of [
  ["sur un écran large, depuis TODO", openLarge],
  ["sur le téléphone, depuis la carte ouverte", openAtPhone],
] as const) {
  describe(`le détail en grand, ${screen}`, () => {
    test("un clic sur la carte l'ouvre : la question, l'avant et l'après côte à côte, le lien de la PR et les deux gestes", async () => {
      const vue = await open();
      const here = detail(vue);
      assert.equal(here.hidden, false);
      assert.ok(here.dessous("p").some(({ textContent }) => textContent === questionSaid(58, 60)));
      assert.deepEqual(images(here).map(({ alt }) => alt), ["rail — before", "rail — after"]);
      assert.ok(images(here).every(({ src }) => src === IMAGE.image));
      assert.equal(frames(here).length, 2, "côte à côte, chacune son cadre");
      button(here, "PR of #58").click();
      assert.deepEqual(vue.dernier("ouvrirPr"), ["parade", 61]);
      assert.equal(button(here, VALIDATE).className, "recommande");
      assert.equal(button(here, SEND_BACK).disabled, true);
      without(here, NEXT(65));
      assert.equal(vue.element("fiche").hidden, true, "la fiche du ticket ne s'ouvre pas");
    });

    test("le brief en tête, au-dessus des captures (ticket 3330) : ce qui était demandé et ce qui a été fait, un point par ligne ; le lien de la PR et les gestes restent", async () => {
      const vue = await open(false, {}, BRIEF);
      const here = detail(vue);
      const root = here.dessous("div").find(({ className }) => className === "detail-de-validation") ?? assert.fail("pas de détail");
      const order = root.children.map(({ className }) => className);
      assert.ok(order.indexOf("brief-du-detail") !== -1 && order.indexOf("brief-du-detail") < order.indexOf("ecrans-du-detail"), order.join(", "));
      const brief = briefOf(here);
      assert.deepEqual(brief.dessous("h3").map(({ textContent }) => textContent), [REQUEST, DONE]);
      assert.deepEqual(brief.dessous("p").map(({ textContent }) => textContent), [REQUESTED]);
      assert.deepEqual(brief.dessous("li").map(({ textContent }) => textContent), ["the rail shows the count", "cards show their question on one line"]);
      assert.equal(brief.dessous("p").some(({ textContent }) => textContent === WITHOUT_RESUME), false);
      button(here, "PR of #58").click();
      assert.deepEqual(vue.dernier("ouvrirPr"), ["parade", 61]);
      button(here, VALIDATE);
      button(here, SEND_BACK);
      assert.equal(images(here).length, 2);
    });

    test("une carte sans résumé de ce qui a été fait — posée avant le ticket 3330 — le dit, et montre encore ce qui était demandé", async () => {
      const vue = await open(false, {}, ["Ticket: #58 — Export the journal as CSV", "Pull request: https://github.com/chef/parade/pull/60"]);
      const brief = briefOf(detail(vue));
      assert.deepEqual(brief.dessous("h3").map(({ textContent }) => textContent), [REQUEST, DONE]);
      assert.deepEqual(brief.dessous("p").map(({ textContent }) => textContent), ["Export the journal as CSV", WITHOUT_RESUME]);
      assert.deepEqual(brief.dessous("li"), []);
    });

    test("ce qui était demandé est coupé à deux lignes à l'affichage, et se lit en entier au survol", async () => {
      const long = `Export the journal as CSV — ${"the chef copies the journal by hand every week ".repeat(6).trim()}`;
      const vue = await open(false, {}, ["### What was asked", "", long, "", "### What was done", "", "- the rail shows the count", ""]);
      const requested = briefOf(detail(vue)).dessous("p").find(({ className }) => className === "demande-du-ticket") ?? assert.fail("pas de demande");
      assert.equal(requested.textContent, long);
      assert.equal(requested.title, long);
      const rule = /#detail-de-validation p\.demande-du-ticket \{([^}]*)\}/.exec(CSS)?.[1] ?? assert.fail("pas de règle pour la demande");
      assert.match(rule, /-webkit-line-clamp: 2;/);
      assert.match(rule, /overflow: hidden;/);
    });

    test("zoomer l'une zoome l'autre au même endroit — boutons, molette, glisser — ; « Fit » rend l'image entière", async () => {
      const vue = await open();
      const here = detail(vue);
      const [before, after] = transforms(here);
      assert.equal(before, transformOf(WHOLE));
      assert.equal(after, before);
      button(here, ZOOM_IN).click();
      const zoomees = transforms(here);
      assert.notEqual(zoomees[0], transformOf(WHOLE));
      assert.equal(zoomees[1], zoomees[0]);
      // La molette sur l'après, en bas à droite : l'avant suit.
      const [frameBefore, frameAfter] = frames(here);
      for (const frame of [frameBefore, frameAfter]) if (frame !== undefined) frame.boite = { left: 0, top: 0, width: 400, height: 300 };
      frameAfter?.declencher("wheel", { clientX: 300, clientY: 225, deltaY: -300 });
      const wheel = transforms(here);
      assert.notDeepEqual(wheel, zoomees);
      assert.equal(wheel[0], wheel[1]);
      // Glisser l'avant de 40 px vers la gauche : l'après glisse avec.
      frameBefore?.declencher("pointerdown", { pointerId: 1, clientX: 200, clientY: 150 });
      frameBefore?.declencher("pointermove", { pointerId: 1, clientX: 160, clientY: 150 });
      frameBefore?.declencher("pointerup", { pointerId: 1 });
      const slid = transforms(here);
      assert.notDeepEqual(slid, wheel);
      assert.equal(slid[0], slid[1]);
      button(here, ADJUST).click();
      assert.deepEqual(transforms(here), [transformOf(WHOLE), transformOf(WHOLE)]);
    });

    test("deux doigts qui s'écartent zooment les deux captures au même endroit", async () => {
      const vue = await open();
      const here = detail(vue);
      const [frame] = frames(here);
      if (frame === undefined) return assert.fail("pas de cadre");
      frame.boite = { left: 0, top: 0, width: 400, height: 300 };
      frame.declencher("pointerdown", { pointerId: 1, clientX: 150, clientY: 150 });
      frame.declencher("pointerdown", { pointerId: 2, clientX: 250, clientY: 150 });
      frame.declencher("pointermove", { pointerId: 2, clientX: 350, clientY: 150 });
      const [before, after] = transforms(here);
      assert.match(before ?? "", /^scale\(2\) /);
      assert.equal(after, before);
    });

    test("« One over the other » les pose l'une sur l'autre ; la bascule montre l'autre sur place, zoomée de même", async () => {
      const vue = await open();
      button(detail(vue), OVERLAY).click();
      const here = detail(vue);
      assert.equal(frames(here).length, 1, "un seul cadre");
      button(here, ZOOM_IN).click();
      const zoom = transforms(here)[0];
      assert.deepEqual(images(here).map(({ hidden }) => hidden), [false, true], "l'avant d'abord");
      const toggle = button(here, SHOW("apres"));
      toggle.click();
      assert.deepEqual(images(here).map(({ hidden }) => hidden), [true, false], "l'après, au même endroit");
      assert.equal(toggle.textContent, SHOW("avant"));
      assert.deepEqual(transforms(here), [zoom, zoom]);
      toggle.click();
      assert.deepEqual(images(here).map(({ hidden }) => hidden), [false, true]);
      button(detail(vue), SIDE_A_SIDE).click();
      assert.equal(frames(detail(vue)).length, 2);
    });

    test("« Full size » ouvre une capture seule ; Échap, ou son retour, rend l'avant et l'après", async () => {
      const vue = await open();
      const full = detail(vue).dessous("button").filter(({ textContent }) => textContent === FULL_SIZE);
      assert.equal(full.length, 2);
      full[1]?.click();
      assert.deepEqual(images(detail(vue)).map(({ alt }) => alt), ["rail — after"]);
      detail(vue).declencher("keydown", { key: "Escape" });
      assert.equal(detail(vue).hidden, false, "Échap rend d'abord les deux");
      assert.equal(images(detail(vue)).length, 2);
      detail(vue).dessous("button").find(({ textContent }) => textContent === FULL_SIZE)?.click();
      button(detail(vue), RETURN).click();
      assert.equal(images(detail(vue)).length, 2);
      detail(vue).declencher("keydown", { key: "Escape" });
      assert.equal(detail(vue).hidden, true, "puis Échap le ferme");
    });

    test("« Close » le ferme, et le commentaire tapé dans le détail reste celui de la carte", async () => {
      const vue = await open();
      const field = detail(vue).dessous("textarea")[0] ?? assert.fail("pas de champ");
      field.value = "The button is cut off.";
      field.declencher("input");
      assert.equal(button(detail(vue), SEND_BACK).disabled, false);
      button(detail(vue), CLOSE).click();
      assert.equal(detail(vue).hidden, true);
      const card = theCard(screen.startsWith("sur le téléphone") ? vue.element("cartes-du-chef") : (cardOfTicket(vue, 61) ?? assert.fail("pas de carte")));
      assert.equal(card.dessous("textarea")[0]?.value, "The button is cut off.");
    });

    test("« Validate » depuis le détail : le geste part, le détail le confirme, puis se ferme et la carte quitte TODO", async (t) => {
      t.mock.timers.enable({ apis: ["setTimeout"] });
      const vue = await open(false, { gesteDeValidation: () => ({ fait: "chef/parade#60 validated" }) });
      button(detail(vue), VALIDATE).click();
      await repos();
      assert.deepEqual(vue.dernier("gesteDeValidation"), ["parade", 61, { geste: "valider" }]);
      assert.equal(detail(vue).hidden, false, "le détail reste, avec sa confirmation");
      assert.equal(button(detail(vue), VALID).disabled, true);
      t.mock.timers.tick(CONFIRMATION_MS);
      await repos();
      assert.equal(detail(vue).hidden, true);
      assert.equal(cardOfTicket(vue, 61), undefined);
      assert.ok(!vue.element("cartes-du-chef").dessous("button").some(({ className }) => className === "carte-a-ouvrir"));
    });

    test("« Send back to the kitchen » depuis le détail envoie le commentaire ; refusé, le détail reste et dit pourquoi", async (t) => {
      t.mock.timers.enable({ apis: ["setTimeout"] });
      const refuses = await open(false, { gesteDeValidation: () => ({ refus: "nothing was done: the head of PR #60 moved since card #61", detail: "brigade : moved" }) });
      const field = detail(refuses).dessous("textarea")[0] ?? assert.fail("pas de champ");
      field.value = "The button is cut off.";
      field.declencher("input");
      button(detail(refuses), SEND_BACK).click();
      await repos();
      assert.deepEqual(refuses.dernier("gesteDeValidation"), ["parade", 61, { geste: "renvoyer", commentaire: "The button is cut off." }]);
      assert.equal(detail(refuses).hidden, false);
      assert.ok(detail(refuses).dessous("p").some(({ textContent }) => textContent.includes("the head of PR #60 moved since card #61")));
      assert.equal(detail(refuses).dessous("textarea")[0]?.value, "The button is cut off.");

      const done = await open(false, { gesteDeValidation: () => ({ fait: "chef/parade#60 sent back" }) });
      const input = detail(done).dessous("textarea")[0] ?? assert.fail("pas de champ");
      input.value = "The button is cut off.";
      input.declencher("input");
      button(detail(done), SEND_BACK).click();
      await repos();
      assert.equal(button(detail(done), SENT_BACK).disabled, true, "« back to the kitchen ✓ » avant de partir");
      t.mock.timers.tick(CONFIRMATION_MS);
      await repos();
      assert.equal(detail(done).hidden, true);
      assert.equal(cardOfTicket(done, 61), undefined);
    });

    test("plusieurs écrans (ticket 3350) : un seul à la fois, « Screen 2 of 3 », précédent et suivant au clic et aux flèches ; le brief, les captures et les gestes restent", async () => {
      const other = (name: string) => `| ![${name} — avant](https://github.com/${REPOSITORY}/blob/${SHA}/docs/captures/58/${name}-avant.png?raw=true) | ![${name} — après](https://github.com/${REPOSITORY}/blob/${SHA}/docs/captures/58/${name}-apres.png?raw=true) |`;
      const vue = await open(false, {}, [...BRIEF, other("todo"), other("rail-bis")]);
      const here = detail(vue);
      const rank = () => here.dessous("span").find(({ className }) => className === "rang-de-l-ecran")?.textContent;
      const namesOfScreens = () => here.dessous("section").filter(({ className }) => className === "ecran-du-detail").map(({ ariaLabel }) => ariaLabel);
      assert.equal(rank(), SCREEN_N_ON(0, 3));
      assert.equal(rank(), "Screen 1 of 3");
      assert.equal(namesOfScreens().length, 1, "un seul écran posé");
      assert.equal(button(here, SCREEN_PREVIOUS).disabled, true);
      button(here, SCREEN_NEXT).click();
      assert.equal(rank(), "Screen 2 of 3");
      assert.equal(namesOfScreens().length, 1);
      const second = namesOfScreens()[0];
      here.declencher("keydown", { key: "ArrowRight" });
      assert.equal(rank(), "Screen 3 of 3");
      assert.notEqual(namesOfScreens()[0], second);
      assert.equal(button(here, SCREEN_NEXT).disabled, true);
      here.declencher("keydown", { key: "ArrowRight" });
      assert.equal(rank(), "Screen 3 of 3", "pas au-delà du dernier");
      here.declencher("keydown", { key: "ArrowLeft" });
      assert.equal(rank(), "Screen 2 of 3");
      assert.equal(namesOfScreens()[0], second);
      here.declencher("keydown", { key: "ArrowLeft", target: here.dessous("textarea")[0] });
      assert.equal(rank(), "Screen 2 of 3", "dans le champ du commentaire, les flèches ne changent pas d'écran");
      assert.equal(images(here).length, 2);
      assert.ok(briefOf(here));
      button(here, VALIDATE);
      button(here, SEND_BACK);
      button(here, "PR of #58");
    });

    test("un seul écran : ni indicateur ni boutons de passage", async () => {
      const here = detail(await open());
      without(here, SCREEN_NEXT);
      assert.equal(here.dessous("span").some(({ className }) => className === "rang-de-l-ecran"), false);
    });

    test("deux cartes attendent : « Next validation » ouvre la suivante sans repasser par TODO, puis revient à la première", async () => {
      const vue = await open(true);
      button(detail(vue), NEXT(65)).click();
      assert.ok(detail(vue).dessous("p").some(({ textContent }) => textContent === questionSaid(59, 64)));
      button(detail(vue), "PR of #59").click();
      assert.deepEqual(vue.dernier("ouvrirPr"), ["parade", 65]);
      button(detail(vue), NEXT(61)).click();
      assert.ok(detail(vue).dessous("p").some(({ textContent }) => textContent === questionSaid(58, 60)));
    });
  });
}

describe("la frappe dans le détail (ticket 3348)", () => {
  test("le rail redessiné pendant que le chef tape dans le détail ne prend pas le clavier à son champ pour le rendre à celui de la carte cachée", async () => {
    const vue = await openLarge();
    const field = detail(vue).dessous("textarea")[0] ?? assert.fail("pas de champ");
    (document as unknown as { activeElement: unknown }).activeElement = field;
    try {
      read(vue, false, []);
      await repos();
      const card = theCard(cardOfTicket(vue, 61) ?? assert.fail("pas de carte dans TODO"));
      assert.equal(card.dessous("textarea")[0]?.focalise, 0, "la carte cachée n'a pas pris le clavier");
      field.value = "The button is cut off.";
      field.declencher("input");
      (document as unknown as { activeElement: unknown }).activeElement = undefined;
      button(detail(vue), CLOSE).click();
      assert.equal(theCard(cardOfTicket(vue, 61) ?? assert.fail("pas de carte")).dessous("textarea")[0]?.value, "The button is cut off.");
    } finally {
      (document as unknown as { activeElement: unknown }).activeElement = undefined;
    }
  });
});

describe("sur la carte", () => {
  test("un clic sur son champ ou ses boutons garde son geste et n'ouvre pas le détail", async () => {
    const vue = await playTheVue({ demarrage: startup(false), espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }], lireCapture: () => IMAGE } as never);
    (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    read(vue, false);
    await repos();
    const card = theCard(cardOfTicket(vue, 61) ?? assert.fail("pas de carte"));
    card.declencher("click", { target: card.dessous("textarea")[0] ?? assert.fail("pas de champ") });
    card.declencher("click", { target: button(card, "PR of #58") });
    assert.equal(detail(vue).hidden, true);
    card.dessous("div").find(({ className }) => className === "captures-de-validation")?.declencher("keydown", { key: "Enter" });
    assert.equal(detail(vue).hidden, false, "Entrée sur ses captures l'ouvre");
  });

  test("sur le téléphone, ses gestes sont à la taille du pouce", async () => {
    const vue = await openAtPhone();
    assert.equal(button(detail(vue), VALIDATE).dataset.taille, "grand");
    assert.equal(button(detail(vue), SEND_BACK).dataset.taille, "grand");
  });
});
